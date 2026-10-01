import { beforeEach, describe, expect, test } from 'bun:test';

import {
  addExerciseToWorkout,
  archiveExercise,
  completeWorkout,
  createEmptyWorkout,
  createExercise,
  createMesocycle,
  createTemplate,
  deleteExercise,
  getExercise,
  getMesocycleDetail,
  getTemplateDetail,
  getWorkoutDetail,
  listExercises,
  replaceMesocycleStructure,
  replaceTemplateStructure,
  restoreExercise,
  updateSetLog,
} from '@/lib/queries';
import { makeTestDb } from './helpers/db';

beforeEach(() => { makeTestDb(); });

describe('exercise archival', () => {
  test('archived exercises leave the picker, remain accessible, and can be restored', () => {
    const squat = createExercise('Squat');
    const bench = createExercise('Bench');
    archiveExercise(squat.id);
    expect(listExercises().map((exercise) => exercise.id)).toEqual([bench.id]);
    expect(listExercises({ archived: true }).map((exercise) => exercise.id)).toEqual([squat.id]);
    const archivedAt = getExercise(squat.id)?.archivedAt;
    expect(typeof archivedAt).toBe('string');
    archiveExercise(squat.id);
    expect(getExercise(squat.id)?.archivedAt).toBe(archivedAt);
    restoreExercise(squat.id);
    expect(getExercise(squat.id)?.archivedAt).toBeNull();
    expect(listExercises().map((exercise) => exercise.id)).toEqual([bench.id, squat.id]);
    expect(listExercises({ archived: true })).toHaveLength(0);
  });

  test('legacy deletion preserves workout set logs and reusable program structures', () => {
    const exercise = createExercise('Squat');
    const workout = createEmptyWorkout('Legs');
    addExerciseToWorkout(workout.id, exercise.id);
    const set = getWorkoutDetail(workout.id)!.blocks[0].sets[0];
    updateSetLog(set.id, { reps: 5, weight: 120, completed: true });
    completeWorkout(workout.id);
    const template = createTemplate('Legs');
    replaceTemplateStructure(template.id, [{ exerciseId: exercise.id, sets: [{ reps: 5, weight: 120 }] }]);
    const mesocycle = createMesocycle('Strength', 1);
    replaceMesocycleStructure(mesocycle.id, [{
      name: 'Legs', dayNumber: 1, exercises: [{
        exerciseId: exercise.id, isFocus: true,
        sets: [{ weekNumber: 1, reps: 5, percentage: 75 }],
      }],
    }]);

    deleteExercise(exercise.id);

    const loggedSet = getWorkoutDetail(workout.id)!.blocks[0].sets[0];
    expect(getWorkoutDetail(workout.id)!.workout.completedAt).not.toBeNull();
    expect(loggedSet).toMatchObject({ id: set.id, reps: 5, weight: 120, completed: true });
    expect(getTemplateDetail(template.id)!.items[0].sets[0].targetWeight).toBe(120);
    expect(getMesocycleDetail(mesocycle.id)!.workouts[0].exercises[0].sets[0].targetPercentage).toBe(75);
    expect(getExercise(exercise.id)?.archivedAt).not.toBeNull();
    expect(listExercises()).toHaveLength(0);
  });
});
