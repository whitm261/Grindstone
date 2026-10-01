import type { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import {
  abandonWorkout, addExerciseToWorkout, addSetToWorkoutExercise, completeWorkout,
  createEmptyWorkout, createExercise, getActiveWorkouts, getWorkoutDetail, getWorkoutDraft, removeLastSet,
  saveWorkoutDraft,
} from '@/lib/queries';
import { createWorkoutDraft, parseSetInput, validateWorkoutDraft } from '@/lib/workoutDraft';
import { makeTestDb } from './helpers/db';

let sqlite: Database;
beforeEach(() => { sqlite = makeTestDb(); });

function start() {
  const workout = createEmptyWorkout('Session');
  const exercise = createExercise('Bench');
  const blockId = addExerciseToWorkout(workout.id, exercise.id);
  const detail = getWorkoutDetail(workout.id)!;
  return { workout, exercise, blockId, setId: detail.blocks[0].sets[0].id, draft: createWorkoutDraft(detail) };
}

describe('finish-time numeric validation', () => {
  test.each(['', '.', '-1', '1.5', '5abc', 'Infinity', '9007199254740992'])('rejects invalid reps %s', (reps) => {
    expect(parseSetInput({ reps, weight: '0' }).errors.reps).toBeDefined();
  });
  test.each(['', '.', '-1', '5abc', 'Infinity', 'NaN', '1e3', '1,2,3'])('rejects invalid weight %s', (weight) => {
    expect(parseSetInput({ reps: '5', weight }).errors.weight).toBeDefined();
  });
  test.each([
    ['.5', 0.5], ['72.5', 72.5], ['72,5', 72.5], ['72.', 72], ['0', 0],
  ])('accepts decimal/bodyweight input %s', (weight, expected) => {
    expect(parseSetInput({ reps: '5', weight: String(weight) })).toMatchObject({ valid: true, reps: 5, weight: expected });
  });
});

describe('persisted workout drafts', () => {
  test('raw text and check state save unchanged without altering numeric logs', () => {
    const { workout, setId, draft } = start();
    draft.name = 'New title';
    draft.sets[setId] = { reps: '', weight: '.', completed: true };
    saveWorkoutDraft(workout.id, draft);
    expect(getWorkoutDraft(workout.id)).toEqual(draft);
    expect(getActiveWorkouts()[0].name).toBe('New title');
    expect(getWorkoutDetail(workout.id)!.blocks[0].sets[0]).toMatchObject({ reps: 8, weight: 0, completed: false });
    expect(() => completeWorkout(workout.id)).toThrow('Correct the reps');
    expect(getWorkoutDetail(workout.id)!.workout.completedAt).toBeNull();
    expect(getWorkoutDraft(workout.id)).toEqual(draft);
  });

  test('immediate Add set copies latest partial draft and starts unchecked', () => {
    const { workout, blockId, setId, draft } = start();
    draft.sets[setId] = { reps: '', weight: '72.', completed: true };
    saveWorkoutDraft(workout.id, draft);
    const nextId = addSetToWorkoutExercise(blockId);
    const restored = createWorkoutDraft(getWorkoutDetail(workout.id)!, getWorkoutDraft(workout.id));
    expect(restored.sets[setId]).toEqual(draft.sets[setId]);
    expect(restored.sets[nextId]).toEqual({ reps: '', weight: '72.', completed: false });
    removeLastSet(blockId);
    expect(createWorkoutDraft(getWorkoutDetail(workout.id)!, restored).sets[nextId]).toBeUndefined();
  });

  test('Finish uses latest text, skips unchecked invalid inputs, and clears draft atomically', () => {
    const { workout, blockId, setId, draft } = start();
    const skipped = addSetToWorkoutExercise(blockId);
    const latest = createWorkoutDraft(getWorkoutDetail(workout.id)!, draft);
    latest.name = 'Finished title';
    latest.sets[setId] = { reps: '12', weight: '.5', completed: true };
    latest.sets[skipped] = { reps: '', weight: '.', completed: false };
    saveWorkoutDraft(workout.id, latest);
    expect(validateWorkoutDraft(latest)).toMatchObject({ valid: true, skippedCount: 1 });
    completeWorkout(workout.id);
    const finished = getWorkoutDetail(workout.id)!;
    expect(finished.workout.name).toBe('Finished title');
    expect(finished.workout.completedAt).not.toBeNull();
    expect(finished.blocks[0].sets).toHaveLength(1);
    expect(finished.blocks[0].sets[0]).toMatchObject({ reps: 12, weight: 0.5, completed: true });
    expect(getWorkoutDraft(workout.id)).toBeNull();
    const completedAt = finished.workout.completedAt;
    completeWorkout(workout.id, latest);
    expect(getWorkoutDetail(workout.id)!.workout.completedAt).toBe(completedAt);
    expect(() => saveWorkoutDraft(workout.id, latest)).toThrow('no longer active');
  });

  test('Finish accepts the freshest in-memory draft even after autosave failure', () => {
    const { workout, setId, draft } = start();
    saveWorkoutDraft(workout.id, draft);
    const latest = { ...draft, sets: { ...draft.sets, [setId]: { reps: '6', weight: '0', completed: true } } };
    completeWorkout(workout.id, latest);
    expect(getWorkoutDetail(workout.id)!.blocks[0].sets[0]).toMatchObject({ reps: 6, weight: 0, completed: true });
  });

  test('storage failure rolls back completion, numeric changes, skipped deletions, and draft removal', () => {
    const { workout, blockId, setId, draft } = start();
    addSetToWorkoutExercise(blockId);
    const latest = createWorkoutDraft(getWorkoutDetail(workout.id)!, draft);
    latest.sets[setId] = { reps: '5', weight: '100', completed: true };
    saveWorkoutDraft(workout.id, latest);
    sqlite.exec(`CREATE TRIGGER fail_finish BEFORE UPDATE OF completed_at ON workouts
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END;`);
    expect(() => completeWorkout(workout.id)).toThrow('disk failure');
    const unchanged = getWorkoutDetail(workout.id)!;
    expect(unchanged.workout.completedAt).toBeNull();
    expect(unchanged.blocks[0].sets).toHaveLength(2);
    expect(unchanged.blocks[0].sets[0]).toMatchObject({ reps: 8, weight: 0, completed: false });
    expect(getWorkoutDraft(workout.id)).toEqual(latest);
    sqlite.exec('DROP TRIGGER fail_finish');
    completeWorkout(workout.id);
    expect(getWorkoutDetail(workout.id)!.workout.completedAt).not.toBeNull();
  });

  test('Add set rolls back its row when the draft write fails', () => {
    const { workout, blockId, draft } = start();
    saveWorkoutDraft(workout.id, draft);
    sqlite.exec(`CREATE TRIGGER fail_draft BEFORE UPDATE ON workout_drafts
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END;`);
    expect(() => addSetToWorkoutExercise(blockId)).toThrow('disk failure');
    expect(getWorkoutDetail(workout.id)!.blocks[0].sets).toHaveLength(1);
    expect(getWorkoutDraft(workout.id)).toEqual(draft);
  });

  test('Add exercise is atomic if its first set cannot be inserted', () => {
    const workout = createEmptyWorkout();
    const exercise = createExercise('Squat');
    sqlite.exec(`CREATE TRIGGER fail_set BEFORE INSERT ON set_logs
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END;`);
    expect(() => addExerciseToWorkout(workout.id, exercise.id)).toThrow('disk failure');
    expect(getWorkoutDetail(workout.id)!.blocks).toEqual([]);
  });

  test('discard removes both workout and saved draft', () => {
    const { workout, draft } = start();
    saveWorkoutDraft(workout.id, draft);
    abandonWorkout(workout.id);
    expect(getWorkoutDetail(workout.id)).toBeNull();
    expect(getWorkoutDraft(workout.id)).toBeNull();
  });
});
