import { beforeEach, describe, expect, test } from 'bun:test';

import {
  addExerciseToWorkout,
  addSetToWorkoutExercise,
  completeWorkout,
  createEmptyWorkout,
  createExercise,
  createTemplate,
  deleteExercise,
  deleteTemplate,
  getActiveWorkouts,
  getExercise,
  getLastWorkoutDataForExercises,
  getTemplateDetail,
  getWorkoutDetail,
  listExercises,
  listWorkoutHistory,
  moveWorkoutExercise,
  removeLastSet,
  removeWorkoutExerciseBlock,
  replaceTemplateStructure,
  startWorkoutFromTemplate,
  updateExercise,
  updateSetLog,
} from '@/lib/queries';
import { makeTestDb } from './helpers/db';

beforeEach(() => {
  makeTestDb();
});

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

describe('exercises', () => {
  test('createExercise stores and returns the row', () => {
    const ex = createExercise('Bench Press', 'flat barbell');
    expect(ex.name).toBe('Bench Press');
    expect(ex.notes).toBe('flat barbell');
    expect(typeof ex.id).toBe('string');
    expect(ex.id.length).toBeGreaterThan(0);
  });

  test('getExercise retrieves the row by id', () => {
    const ex = createExercise('Squat');
    const row = getExercise(ex.id);
    expect(row?.id).toBe(ex.id);
    expect(row?.name).toBe('Squat');
  });

  test('getExercise returns undefined for an unknown id', () => {
    expect(getExercise('nonexistent')).toBeUndefined();
  });

  test('listExercises returns all rows in alphabetical order', () => {
    createExercise('Squat');
    createExercise('Bench Press');
    createExercise('Deadlift');
    const names = listExercises().map((e) => e.name);
    expect(names).toEqual(['Bench Press', 'Deadlift', 'Squat']);
  });

  test('updateExercise modifies name and notes', () => {
    const ex = createExercise('Benchpress', 'old notes');
    updateExercise(ex.id, 'Bench Press', 'flat barbell');
    const updated = getExercise(ex.id);
    expect(updated?.name).toBe('Bench Press');
    expect(updated?.notes).toBe('flat barbell');
  });

  test('deleteExercise archives the row without removing its history identity', () => {
    const ex = createExercise('Curl');
    deleteExercise(ex.id);
    expect(getExercise(ex.id)?.archivedAt).not.toBeNull();
    expect(listExercises()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

describe('templates', () => {
  test('createTemplate stores the row', () => {
    const t = createTemplate('Push Day', 'chest / shoulders / triceps');
    expect(t.name).toBe('Push Day');
    const detail = getTemplateDetail(t.id);
    expect(detail?.template.id).toBe(t.id);
    expect(detail?.items).toHaveLength(0);
  });

  test('getTemplateDetail returns null for an unknown id', () => {
    expect(getTemplateDetail('nonexistent')).toBeNull();
  });

  test('replaceTemplateStructure stores exercises and their sets', () => {
    const t = createTemplate('Pull Day');
    const ex1 = createExercise('Pull-up');
    const ex2 = createExercise('Barbell Row');
    replaceTemplateStructure(t.id, [
      { exerciseId: ex1.id, sets: [{ reps: 8, weight: 0 }, { reps: 6, weight: 0 }] },
      { exerciseId: ex2.id, sets: [{ reps: 10, weight: 60 }] },
    ]);
    const detail = getTemplateDetail(t.id)!;
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0].exercise.id).toBe(ex1.id);
    expect(detail.items[0].sets).toHaveLength(2);
    expect(detail.items[0].sets[0].targetReps).toBe(8);
    expect(detail.items[1].exercise.id).toBe(ex2.id);
    expect(detail.items[1].sets[0].targetWeight).toBe(60);
  });

  test('replaceTemplateStructure removes the previous structure entirely', () => {
    const t = createTemplate('Legs');
    const ex1 = createExercise('Squat');
    const ex2 = createExercise('Leg Press');
    replaceTemplateStructure(t.id, [{ exerciseId: ex1.id, sets: [{ reps: 5, weight: 100 }] }]);
    replaceTemplateStructure(t.id, [{ exerciseId: ex2.id, sets: [{ reps: 12, weight: 80 }] }]);
    const detail = getTemplateDetail(t.id)!;
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].exercise.id).toBe(ex2.id);
  });

  test('deleteTemplate removes the row', () => {
    const t = createTemplate('Temp');
    deleteTemplate(t.id);
    expect(getTemplateDetail(t.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

describe('workouts', () => {
  test('createEmptyWorkout creates an incomplete workout', () => {
    const w = createEmptyWorkout('Morning Session');
    expect(w.name).toBe('Morning Session');
    expect(w.completedAt).toBeNull();
    const detail = getWorkoutDetail(w.id);
    expect(detail?.blocks).toHaveLength(0);
  });

  test('startWorkoutFromTemplate creates a workout with exercises and sets', () => {
    const t = createTemplate('PPL Push');
    const ex = createExercise('Bench Press');
    replaceTemplateStructure(t.id, [
      { exerciseId: ex.id, sets: [{ reps: 5, weight: 100 }, { reps: 5, weight: 105 }] },
    ]);
    const w = startWorkoutFromTemplate(t.id)!;
    expect(w).not.toBeNull();
    const detail = getWorkoutDetail(w.id)!;
    expect(detail.blocks).toHaveLength(1);
    expect(detail.blocks[0].exercise.id).toBe(ex.id);
    expect(detail.blocks[0].sets).toHaveLength(2);
    expect(detail.blocks[0].sets[0].weight).toBe(100);
    expect(detail.blocks[0].sets[1].weight).toBe(105);
  });

  test('startWorkoutFromTemplate returns null for a template with no exercises', () => {
    const t = createTemplate('Empty');
    expect(startWorkoutFromTemplate(t.id)).toBeNull();
  });

  test('addExerciseToWorkout appends a block with one default set', () => {
    const w = createEmptyWorkout();
    const ex = createExercise('OHP');
    addExerciseToWorkout(w.id, ex.id);
    const detail = getWorkoutDetail(w.id)!;
    expect(detail.blocks).toHaveLength(1);
    expect(detail.blocks[0].exercise.id).toBe(ex.id);
    expect(detail.blocks[0].sets).toHaveLength(1);
    expect(detail.blocks[0].sets[0].reps).toBe(8);
    expect(detail.blocks[0].sets[0].weight).toBe(0);
    expect(detail.blocks[0].sets[0].completed).toBe(false);
  });

  test('addSetToWorkoutExercise copies reps and weight from the last set', () => {
    const w = createEmptyWorkout();
    const ex = createExercise('Curl');
    const weId = addExerciseToWorkout(w.id, ex.id);
    // Set the initial set to non-default values before adding another.
    const firstSetId = getWorkoutDetail(w.id)!.blocks[0].sets[0].id;
    updateSetLog(firstSetId, { reps: 12, weight: 30 });
    addSetToWorkoutExercise(weId);
    const sets = getWorkoutDetail(w.id)!.blocks[0].sets;
    expect(sets).toHaveLength(2);
    expect(sets[1].reps).toBe(12);
    expect(sets[1].weight).toBe(30);
  });

  test('removeLastSet removes the last set and returns true', () => {
    const w = createEmptyWorkout();
    const ex = createExercise('Dip');
    const weId = addExerciseToWorkout(w.id, ex.id);
    addSetToWorkoutExercise(weId); // 2 sets now
    const removed = removeLastSet(weId);
    expect(removed).toBe(true);
    expect(getWorkoutDetail(w.id)!.blocks[0].sets).toHaveLength(1);
  });

  test('removeLastSet refuses when only one set remains', () => {
    const w = createEmptyWorkout();
    const ex = createExercise('Dip');
    const weId = addExerciseToWorkout(w.id, ex.id);
    const removed = removeLastSet(weId);
    expect(removed).toBe(false);
    expect(getWorkoutDetail(w.id)!.blocks[0].sets).toHaveLength(1);
  });

  test('updateSetLog modifies reps, weight, and completed', () => {
    const w = createEmptyWorkout();
    const ex = createExercise('Deadlift');
    addExerciseToWorkout(w.id, ex.id);
    const set = getWorkoutDetail(w.id)!.blocks[0].sets[0];
    updateSetLog(set.id, { reps: 3, weight: 200, completed: true });
    const updated = getWorkoutDetail(w.id)!.blocks[0].sets[0];
    expect(updated.reps).toBe(3);
    expect(updated.weight).toBe(200);
    expect(updated.completed).toBe(true);
  });

  test('completeWorkout sets completedAt', () => {
    const w = createEmptyWorkout();
    completeWorkout(w.id);
    const detail = getWorkoutDetail(w.id)!;
    expect(detail.workout.completedAt).not.toBeNull();
  });

  test('getActiveWorkouts returns only incomplete workouts', () => {
    const w1 = createEmptyWorkout('Active');
    const w2 = createEmptyWorkout('Also Active');
    const w3 = createEmptyWorkout('Done');
    completeWorkout(w3.id);
    const ids = getActiveWorkouts().map((w) => w.id);
    expect(ids).toContain(w1.id);
    expect(ids).toContain(w2.id);
    expect(ids).not.toContain(w3.id);
  });

  test('listWorkoutHistory returns only completed workouts', () => {
    const w1 = createEmptyWorkout('Done');
    const w2 = createEmptyWorkout('In progress');
    completeWorkout(w1.id);
    const ids = listWorkoutHistory().map((w) => w.id);
    expect(ids).toContain(w1.id);
    expect(ids).not.toContain(w2.id);
  });

  test('moveWorkoutExercise swaps adjacent sort orders', () => {
    const w = createEmptyWorkout();
    const ex1 = createExercise('First');
    const ex2 = createExercise('Second');
    addExerciseToWorkout(w.id, ex1.id);
    addExerciseToWorkout(w.id, ex2.id);
    const before = getWorkoutDetail(w.id)!.blocks;
    expect(before[0].exercise.id).toBe(ex1.id);
    moveWorkoutExercise(before[0].workoutExercise.id, 1);
    const after = getWorkoutDetail(w.id)!.blocks;
    expect(after[0].exercise.id).toBe(ex2.id);
    expect(after[1].exercise.id).toBe(ex1.id);
  });

  test('moveWorkoutExercise is a no-op at the boundaries', () => {
    const w = createEmptyWorkout();
    const ex1 = createExercise('Only');
    addExerciseToWorkout(w.id, ex1.id);
    const weId = getWorkoutDetail(w.id)!.blocks[0].workoutExercise.id;
    moveWorkoutExercise(weId, -1);
    moveWorkoutExercise(weId, 1);
    // No error, exercise is still there
    expect(getWorkoutDetail(w.id)!.blocks).toHaveLength(1);
  });

  test('removeWorkoutExerciseBlock removes the block and its sets', () => {
    const w = createEmptyWorkout();
    const ex = createExercise('Remove me');
    addExerciseToWorkout(w.id, ex.id);
    const weId = getWorkoutDetail(w.id)!.blocks[0].workoutExercise.id;
    removeWorkoutExerciseBlock(weId);
    expect(getWorkoutDetail(w.id)!.blocks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getLastWorkoutDataForExercises
// ---------------------------------------------------------------------------

describe('getLastWorkoutDataForExercises', () => {
  /**
   * Creates a completed workout containing the given exercises and sets.
   * Each entry in `exerciseSets` specifies which exercise and what reps/weight
   * to log for each set in that block.
   */
  function makeCompletedWorkout(
    exerciseSets: Array<{ exerciseId: string; sets: Array<{ reps: number; weight: number }> }>,
  ) {
    const w = createEmptyWorkout();
    for (const { exerciseId, sets } of exerciseSets) {
      const weId = addExerciseToWorkout(w.id, exerciseId);
      // Update the auto-created first set.
      const firstSetId = getWorkoutDetail(w.id)!.blocks.find(
        (b) => b.workoutExercise.id === weId,
      )!.sets[0].id;
      updateSetLog(firstSetId, { reps: sets[0].reps, weight: sets[0].weight, completed: true });
      // Add any remaining sets.
      for (let i = 1; i < sets.length; i++) {
        const newId = addSetToWorkoutExercise(weId);
        updateSetLog(newId, { reps: sets[i].reps, weight: sets[i].weight, completed: true });
      }
    }
    completeWorkout(w.id);
    return w;
  }

  test('returns an empty map when no completed workouts exist', () => {
    const ex = createExercise('No history');
    expect(getLastWorkoutDataForExercises([ex.id]).size).toBe(0);
  });

  test('returns an empty map when exerciseIds is empty', () => {
    expect(getLastWorkoutDataForExercises([]).size).toBe(0);
  });

  test('returns the sets from the only completed workout', () => {
    const ex = createExercise('Bench Press');
    makeCompletedWorkout([
      { exerciseId: ex.id, sets: [{ reps: 5, weight: 100 }, { reps: 5, weight: 105 }] },
    ]);
    const result = getLastWorkoutDataForExercises([ex.id]);
    expect(result.has(ex.id)).toBe(true);
    const data = result.get(ex.id)!;
    expect(data.sets).toHaveLength(2);
    expect(data.sets[0].reps).toBe(5);
    expect(data.sets[0].weight).toBe(100);
    expect(data.sets[1].weight).toBe(105);
  });

  test('returns the most recent completed workout when there are multiple', async () => {
    const ex = createExercise('Squat');
    makeCompletedWorkout([{ exerciseId: ex.id, sets: [{ reps: 5, weight: 80 }] }]);
    await Bun.sleep(2); // ensure a strictly later ISO timestamp
    makeCompletedWorkout([{ exerciseId: ex.id, sets: [{ reps: 3, weight: 120 }] }]);
    const result = getLastWorkoutDataForExercises([ex.id]);
    expect(result.get(ex.id)!.sets[0].weight).toBe(120);
  });

  test('omits exercises that have no prior history', () => {
    const exA = createExercise('Has history');
    const exB = createExercise('No history');
    makeCompletedWorkout([{ exerciseId: exA.id, sets: [{ reps: 8, weight: 50 }] }]);
    const result = getLastWorkoutDataForExercises([exA.id, exB.id]);
    expect(result.has(exA.id)).toBe(true);
    expect(result.has(exB.id)).toBe(false);
  });

  test('handles a mix of exercises from different past workouts', async () => {
    const exA = createExercise('Pull-up');
    const exB = createExercise('Row');
    // Workout 1: only exA
    makeCompletedWorkout([{ exerciseId: exA.id, sets: [{ reps: 10, weight: 0 }] }]);
    await Bun.sleep(2);
    // Workout 2: only exB, and also exA again with different sets
    makeCompletedWorkout([
      { exerciseId: exA.id, sets: [{ reps: 12, weight: 5 }] },
      { exerciseId: exB.id, sets: [{ reps: 8, weight: 60 }] },
    ]);
    const result = getLastWorkoutDataForExercises([exA.id, exB.id]);
    // exA should reflect the more recent workout
    expect(result.get(exA.id)!.sets[0].weight).toBe(5);
    // exB only appeared in workout 2
    expect(result.get(exB.id)!.sets[0].weight).toBe(60);
  });

  test('finds history for an exercise added mid-workout', () => {
    // Simulate adding an exercise on the fly during an active workout.
    const ex = createExercise('Cable Fly');
    makeCompletedWorkout([{ exerciseId: ex.id, sets: [{ reps: 15, weight: 20 }] }]);
    // Start a new workout without this exercise in the template, then add it live.
    const active = createEmptyWorkout();
    addExerciseToWorkout(active.id, ex.id);
    const result = getLastWorkoutDataForExercises([ex.id]);
    expect(result.has(ex.id)).toBe(true);
    expect(result.get(ex.id)!.sets[0].reps).toBe(15);
    expect(result.get(ex.id)!.sets[0].weight).toBe(20);
  });

  test('includes the workout name and completedAt in the result', () => {
    const ex = createExercise('Row');
    const before = new Date().toISOString();
    makeCompletedWorkout([{ exerciseId: ex.id, sets: [{ reps: 8, weight: 60 }] }]);
    const after = new Date().toISOString();
    const data = getLastWorkoutDataForExercises([ex.id]).get(ex.id)!;
    expect(data.workoutName).toBeTruthy();
    expect(data.completedAt >= before).toBe(true);
    expect(data.completedAt <= after).toBe(true);
  });

  test('does not include an in-progress (non-completed) workout as history', () => {
    const ex = createExercise('Press');
    // Active workout with sets — not completed
    const active = createEmptyWorkout();
    const weId = addExerciseToWorkout(active.id, ex.id);
    updateSetLog(
      getWorkoutDetail(active.id)!.blocks[0].sets[0].id,
      { reps: 5, weight: 150, completed: true },
    );
    // No completed workouts exist, so history should be empty
    expect(getLastWorkoutDataForExercises([ex.id]).size).toBe(0);
  });
});
