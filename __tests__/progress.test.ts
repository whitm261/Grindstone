import { beforeEach, describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client';
import { setLogs, workoutExercises, workouts } from '@/db/schema';
import {
  createExercise,
  getExerciseMaxWeightHistory,
  getExerciseProgressHistory,
  getExerciseVolumeHistory,
  getLastWorkoutDataForExercises,
} from '@/lib/queries';
import { makeTestDb } from './helpers/db';

beforeEach(() => makeTestDb());

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

// Insert stored history directly so the suite also exercises legacy values that
// the finish-time validator correctly refuses to write in new workouts.
function session(
  id: string,
  days: number,
  blocks: Array<{
    exerciseId: string;
    sets: Array<{ reps: number; weight: number; completed?: boolean }>;
  }>,
  finished = true,
) {
  const db = getDb();
  const date = daysAgo(days);
  db.insert(workouts).values({ id, name: id, startedAt: date, completedAt: finished ? date : null }).run();
  for (const [blockIndex, block] of blocks.entries()) {
    const blockId = `${id}-block-${blockIndex}`;
    db.insert(workoutExercises).values({
      id: blockId, workoutId: id, exerciseId: block.exerciseId, sortOrder: blockIndex,
    }).run();
    for (const [setIndex, set] of block.sets.entries()) {
      db.insert(setLogs).values({
        id: `${blockId}-set-${setIndex}`, workoutExerciseId: blockId, index: setIndex,
        reps: set.reps, weight: set.weight, completed: set.completed ?? true,
      }).run();
    }
  }
  return date;
}

describe('performed exercise progress', () => {
  test('heaviest completed set keeps its reps and selects most reps when weight ties', () => {
    const exercise = createExercise('Bench');
    const date = session('best-set', 1, [{ exerciseId: exercise.id, sets: [
      { reps: 12, weight: 70 },
      { reps: 3, weight: 100 },
      { reps: 5, weight: 100 },
      { reps: 1, weight: 200, completed: false },
    ] }]);
    const point = getExerciseProgressHistory(exercise.id)[0];
    expect(point).toEqual({
      workoutId: 'best-set', date, label: 'best-set', maxWeight: 100, reps: 5,
      volume: 1640, setCount: 3,
    });
    expect(getExerciseMaxWeightHistory(exercise.id)).toEqual([point]);
    expect(getExerciseVolumeHistory(exercise.id)).toEqual([point]);
  });

  test('combines repeated blocks into one chart point and ordered previous-session sets', () => {
    const exercise = createExercise('Squat');
    session('repeated', 1, [
      { exerciseId: exercise.id, sets: [{ reps: 10, weight: 40 }, { reps: 8, weight: 60 }] },
      { exerciseId: exercise.id, sets: [{ reps: 5, weight: 100 }] },
    ]);
    const points = getExerciseProgressHistory(exercise.id);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ maxWeight: 100, reps: 5, volume: 1380, setCount: 3 });
    expect(getLastWorkoutDataForExercises([exercise.id]).get(exercise.id)?.sets).toEqual([
      { index: 0, reps: 10, weight: 40 },
      { index: 1, reps: 8, weight: 60 },
      { index: 2, reps: 5, weight: 100 },
    ]);
  });

  test('zero added weight retains reps, chart points, and previous performance', () => {
    const exercise = createExercise('Pull-up');
    session('bodyweight', 1, [{ exerciseId: exercise.id, sets: [
      { reps: 6, weight: 0 }, { reps: 10, weight: 0 },
    ] }]);
    expect(getExerciseProgressHistory(exercise.id)[0]).toMatchObject({ maxWeight: 0, reps: 10, volume: 0 });
    expect(getLastWorkoutDataForExercises([exercise.id]).get(exercise.id)?.sets).toHaveLength(2);
  });

  test('latest skipped or invalid session does not obscure earlier performed sets', () => {
    const exercise = createExercise('Row');
    session('performed', 3, [{ exerciseId: exercise.id, sets: [{ reps: 8, weight: 60 }] }]);
    session('skipped', 2, [{ exerciseId: exercise.id, sets: [{ reps: 10, weight: 70, completed: false }] }]);
    session('invalid', 1, [{ exerciseId: exercise.id, sets: [{ reps: 0, weight: 100 }] }]);
    session('active', 0, [{ exerciseId: exercise.id, sets: [{ reps: 4, weight: 200 }] }], false);
    expect(getExerciseProgressHistory(exercise.id).map((point) => point.workoutId)).toEqual(['performed']);
    expect(getLastWorkoutDataForExercises([exercise.id]).get(exercise.id)?.workoutId).toBe('performed');
  });

  test('ignores invalid legacy numbers consistently across charts and last hints', () => {
    const exercise = createExercise('Press');
    session('legacy', 1, [{ exerciseId: exercise.id, sets: [
      { reps: -1, weight: 100 },
      { reps: 0, weight: 100 },
      { reps: 2.5, weight: 100 },
      { reps: 5, weight: -10 },
      { reps: 5, weight: Number.POSITIVE_INFINITY },
      { reps: Number.POSITIVE_INFINITY, weight: 100 },
      { reps: 8, weight: 45.5 },
    ] }]);
    expect(getExerciseProgressHistory(exercise.id)[0]).toMatchObject({ maxWeight: 45.5, reps: 8, setCount: 1, volume: 364 });
    expect(getLastWorkoutDataForExercises([exercise.id]).get(exercise.id)?.sets).toEqual([
      { index: 0, reps: 8, weight: 45.5 },
    ]);
  });

  test('charts respect the time window, while last performance can come from older workouts', () => {
    const exercise = createExercise('Deadlift');
    session('old', 400, [{ exerciseId: exercise.id, sets: [{ reps: 5, weight: 100 }] }]);
    expect(getExerciseProgressHistory(exercise.id)).toEqual([]);
    expect(getExerciseProgressHistory(exercise.id, 500)).toHaveLength(1);
    expect(getLastWorkoutDataForExercises([exercise.id]).get(exercise.id)?.workoutId).toBe('old');
  });

  test('returns chronological points and keeps separate exercises independent', () => {
    const first = createExercise('First');
    const second = createExercise('Second');
    const absent = createExercise('Absent');
    session('newer', 1, [{ exerciseId: first.id, sets: [{ reps: 4, weight: 120 }] }]);
    session('older', 2, [
      { exerciseId: first.id, sets: [{ reps: 6, weight: 100 }] },
      { exerciseId: second.id, sets: [{ reps: 12, weight: 20 }] },
    ]);
    expect(getExerciseProgressHistory(first.id).map((point) => point.workoutId)).toEqual(['older', 'newer']);
    const previous = getLastWorkoutDataForExercises([first.id, second.id, absent.id]);
    expect(previous.get(first.id)?.workoutId).toBe('newer');
    expect(previous.get(second.id)?.workoutId).toBe('older');
    expect(previous.has(absent.id)).toBe(false);
    expect(getLastWorkoutDataForExercises([]).size).toBe(0);
  });
});
