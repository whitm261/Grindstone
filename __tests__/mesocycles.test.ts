import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activeMesocycles, mesocycles, workouts } from '@/db/schema';
import {
  createExercise,
  getExercise,
  createMesocycle,
  getMesocycleDetail,
  replaceMesocycleStructure,
  startActiveMesocycle,
  getActiveMesocycleDetail,
  startWorkoutFromMesocycleDay,
  getWorkoutDetail,
  completeWorkout,
  completeActiveMesocycle,
  deleteExercise,
  deleteMesocycle,
  updateSetLog,
} from '@/lib/queries';
import { makeTestDb } from './helpers/db';

beforeEach(() => {
  makeTestDb();
});

function makeBlock(names = ['Push'], weeks = 2) {
  const meso = createMesocycle('Training block', weeks);
  const exercise = createExercise('Bench');
  replaceMesocycleStructure(meso.id, names.map((name, index) => ({
    name,
    dayNumber: index + 1,
    exercises: [{
      exerciseId: exercise.id,
      isFocus: true,
      sets: Array.from({ length: weeks }, (_, week) => ({ weekNumber: week + 1, reps: 5, percentage: 70 + week * 5 })),
    }],
  })));
  return { meso, exercise, detail: getMesocycleDetail(meso.id)! };
}

function addLegacyActive(mesocycleId: string) {
  const id = 'legacy-block';
  getDb().insert(activeMesocycles).values({ id, mesocycleId, name: 'Older block', startedAt: '2025-01-01T00:00:00Z' }).run();
  return id;
}

function addLegacySession(activeId: string, id: string, name: string, week = 1) {
  getDb().insert(workouts).values({
    id, activeMesocycleId: activeId, mesocycleWeek: week, name,
    startedAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-01T01:00:00Z',
  }).run();
}

describe('mesocycles', () => {
  test.each([false, true])('definition deletion preserves a referenced instance (completed: %s)', (completed) => {
    const { meso, exercise, detail } = makeBlock();
    const activeId = startActiveMesocycle(meso.id, [{ exerciseId: exercise.id, weight: 100 }])!;
    const workout = startWorkoutFromMesocycleDay(activeId, detail.workouts[0].workout.id, 1)!;
    const set = getWorkoutDetail(workout.id)!.blocks[0].sets[0];
    updateSetLog(set.id, { reps: 5, weight: 70, completed: true });
    completeWorkout(workout.id);
    if (completed) completeActiveMesocycle(activeId);
    const before = getActiveMesocycleDetail(activeId)!;
    const loggedBefore = getWorkoutDetail(workout.id);

    expect(deleteMesocycle(meso.id)).toBe(false);

    expect(getMesocycleDetail(meso.id)).toEqual(detail);
    expect(getActiveMesocycleDetail(activeId)).toEqual(before);
    expect(before.active.structureSnapshot).not.toBeNull();
    expect(before.maxes[0].weight).toBe(100);
    expect(getWorkoutDetail(workout.id)).toEqual(loggedBefore);
    expect(getWorkoutDetail(workout.id)!.workout.activeMesocycleId).toBe(activeId);
  });

  test('an unused mesocycle definition can still be deleted', () => {
    const { meso, exercise } = makeBlock();
    expect(deleteMesocycle(meso.id)).toBe(true);
    expect(getMesocycleDetail(meso.id)).toBeNull();
    expect(getExercise(exercise.id)?.name).toBe('Bench');
  });

  test('createMesocycle stores the row', () => {
    const meso = createMesocycle('SBD Block', 8, 'Powerlifting focus');
    expect(meso.name).toBe('SBD Block');
    expect(meso.weeks).toBe(8);
    const detail = getMesocycleDetail(meso.id);
    expect(detail?.mesocycle.id).toBe(meso.id);
    expect(detail?.workouts).toHaveLength(0);
  });

  test('replaceMesocycleStructure stores workouts, exercises and sets', () => {
    const meso = createMesocycle('Test Meso', 2);
    const squat = createExercise('Squat');
    const tricep = createExercise('Tricep Extension');

    replaceMesocycleStructure(meso.id, [
      {
        name: 'Day 1',
        dayNumber: 1,
        exercises: [
          {
            exerciseId: squat.id,
            isFocus: true,
            sets: [
              { weekNumber: 1, reps: 5, percentage: 70 },
              { weekNumber: 2, reps: 5, percentage: 75 },
            ],
          },
          {
            exerciseId: tricep.id,
            isFocus: false,
            sets: [{ weekNumber: null, reps: 10, percentage: null }],
          },
        ],
      },
    ]);

    const detail = getMesocycleDetail(meso.id)!;
    expect(detail.workouts).toHaveLength(1);
    expect(detail.workouts[0].workout.name).toBe('Day 1');
    expect(detail.workouts[0].exercises).toHaveLength(2);
    
    const squatEx = detail.workouts[0].exercises.find(e => e.exercise.id === squat.id)!;
    expect(squatEx.mesoExercise.isFocus).toBe(true);
    expect(squatEx.sets).toHaveLength(2);
    expect(squatEx.sets[0].weekNumber).toBe(1);
    expect(squatEx.sets[1].weekNumber).toBe(2);

    const tricepEx = detail.workouts[0].exercises.find(e => e.exercise.id === tricep.id)!;
    expect(tricepEx.mesoExercise.isFocus).toBe(false);
    expect(tricepEx.sets).toHaveLength(1);
    expect(tricepEx.sets[0].weekNumber).toBeNull();
  });

  test('active mesocycles and calculated weights', () => {
    const meso = createMesocycle('SBD 1', 4);
    const bench = createExercise('Bench Press');
    const row = createExercise('Barbell Row');

    replaceMesocycleStructure(meso.id, [
      {
        name: 'Upper',
        dayNumber: 1,
        exercises: [
          {
            exerciseId: bench.id,
            isFocus: true,
            sets: [
              { weekNumber: 1, reps: 5, percentage: 80 },
              { weekNumber: 2, reps: 3, percentage: 90 },
            ],
          },
          {
            exerciseId: row.id,
            isFocus: false,
            sets: [{ weekNumber: null, reps: 10, percentage: null }],
          },
        ],
      },
    ]);

    const activeId = startActiveMesocycle(meso.id, [{ exerciseId: bench.id, weight: 100 }])!;
    const activeDetail = getActiveMesocycleDetail(activeId)!;
    expect(activeDetail.active.name).toBe('SBD 1');
    expect(activeDetail.maxes).toHaveLength(1);
    expect(activeDetail.maxes[0].weight).toBe(100);

    const mwId = activeDetail.mesoDetail.workouts[0].workout.id;

    // Week 1 workout
    const w1 = startWorkoutFromMesocycleDay(activeId, mwId, 1)!;
    const w1Detail = getWorkoutDetail(w1.id)!;
    expect(w1Detail.workout.name).toBe('Upper - W1');
    expect(w1Detail.blocks).toHaveLength(2);

    const benchW1 = w1Detail.blocks.find(b => b.exercise.id === bench.id)!;
    expect(benchW1.sets).toHaveLength(1);
    expect(benchW1.sets[0].reps).toBe(5);
    expect(benchW1.sets[0].weight).toBe(80); // 80% of 100

    const rowW1 = w1Detail.blocks.find(b => b.exercise.id === row.id)!;
    expect(rowW1.sets).toHaveLength(1);
    expect(rowW1.sets[0].reps).toBe(10);
    expect(rowW1.sets[0].weight).toBe(0);

    // Week 2 workout
    const w2 = startWorkoutFromMesocycleDay(activeId, mwId, 2)!;
    const w2Detail = getWorkoutDetail(w2.id)!;
    expect(w2Detail.workout.name).toBe('Upper - W2');
    
    const benchW2 = w2Detail.blocks.find(b => b.exercise.id === bench.id)!;
    expect(benchW2.sets[0].reps).toBe(3);
    expect(benchW2.sets[0].weight).toBe(90); // 90% of 100

    const rowW2 = w2Detail.blocks.find(b => b.exercise.id === row.id)!;
    expect(rowW2.sets[0].reps).toBe(10);
    expect(rowW2.sets[0].weight).toBe(0);
  });

  test('duplicate and prefix names have independent workout slots', () => {
    const { meso, exercise, detail } = makeBlock(['Push', 'Push', 'Push Copy']);
    const activeId = startActiveMesocycle(meso.id, [{ exerciseId: exercise.id, weight: 100 }])!;
    const sessions = detail.workouts.map((slot) => startWorkoutFromMesocycleDay(activeId, slot.workout.id, 1)!);
    expect(new Set(sessions.map((session) => session.id)).size).toBe(3);
    expect(sessions.map((session) => session.mesocycleSlotId)).toEqual(detail.workouts.map((slot) => slot.workout.id));
    completeWorkout(sessions[0].id);

    const active = getActiveMesocycleDetail(activeId)!;
    expect(active.workoutsCompleted.map((session) => session.mesocycleSlotId)).toEqual([detail.workouts[0].workout.id]);
    expect(active.workoutsInProgress).toHaveLength(2);
  });

  test('starting a slot resumes saved work and never duplicates completed sessions', () => {
    const { meso, exercise, detail } = makeBlock();
    const activeId = startActiveMesocycle(meso.id, [{ exerciseId: exercise.id, weight: 100 }])!;
    const slotId = detail.workouts[0].workout.id;
    const session = startWorkoutFromMesocycleDay(activeId, slotId, 1)!;
    const set = getWorkoutDetail(session.id)!.blocks[0].sets[0];
    updateSetLog(set.id, { reps: 7, weight: 72.5, completed: true });
    expect(startWorkoutFromMesocycleDay(activeId, slotId, 1)!.id).toBe(session.id);
    expect(getWorkoutDetail(session.id)!.blocks[0].sets[0].weight).toBe(72.5);
    completeWorkout(session.id);
    expect(startWorkoutFromMesocycleDay(activeId, slotId, 1)!.id).toBe(session.id);
    expect(getActiveMesocycleDetail(activeId)!.workoutsCompleted).toHaveLength(1);
  });

  test('running blocks retain names, weeks, exercise references and prescriptions after edits', () => {
    const { meso, exercise, detail } = makeBlock();
    const activeId = startActiveMesocycle(meso.id, [{ exerciseId: exercise.id, weight: 100 }])!;
    replaceMesocycleStructure(meso.id, [{ name: 'Renamed', dayNumber: 1, exercises: [] }]);
    getDb().update(mesocycles).set({ weeks: 8, name: 'New block' }).where(eq(mesocycles.id, meso.id)).run();
    deleteExercise(exercise.id);

    const active = getActiveMesocycleDetail(activeId)!;
    expect(active.mesoDetail.mesocycle.weeks).toBe(2);
    expect(active.mesoDetail.mesocycle.name).toBe('Training block');
    expect(active.mesoDetail.workouts[0].workout.id).toBe(detail.workouts[0].workout.id);
    const session = startWorkoutFromMesocycleDay(activeId, detail.workouts[0].workout.id, 2)!;
    expect(session.name).toBe('Push - W2');
    const workout = getWorkoutDetail(session.id)!;
    expect(workout.blocks[0].exercise.id).toBe(exercise.id);
    expect(workout.blocks[0].sets[0].weight).toBe(75);
    expect(workout.blocks[0].sets[0].index).toBe(0);
    const newActiveId = startActiveMesocycle(meso.id, [])!;
    expect(getActiveMesocycleDetail(newActiveId)!.mesoDetail.workouts[0].workout.name).toBe('Renamed');
  });

  test('rejects foreign slots, unavailable blocks and invalid week numbers', () => {
    const first = makeBlock();
    const second = makeBlock();
    const activeId = startActiveMesocycle(first.meso.id, [{ exerciseId: first.exercise.id, weight: 100 }])!;
    const slotId = first.detail.workouts[0].workout.id;
    expect(startWorkoutFromMesocycleDay(activeId, second.detail.workouts[0].workout.id, 1)).toBeNull();
    expect(startWorkoutFromMesocycleDay('missing', slotId, 1)).toBeNull();
    for (const week of [0, -1, 3, 1.5, NaN, Infinity]) {
      expect(startWorkoutFromMesocycleDay(activeId, slotId, week)).toBeNull();
    }
    completeActiveMesocycle(activeId);
    expect(startWorkoutFromMesocycleDay(activeId, slotId, 1)).toBeNull();
    expect(getDb().select().from(workouts).all()).toHaveLength(0);
  });

  test('validates all training maxes without creating partial blocks', () => {
    const { meso, exercise } = makeBlock();
    expect(() => startActiveMesocycle(meso.id, [])).toThrow('training max');
    for (const weight of [0, -1, NaN, Infinity]) {
      expect(() => startActiveMesocycle(meso.id, [{ exerciseId: exercise.id, weight }])).toThrow('training max');
    }
    expect(() => startActiveMesocycle(meso.id, [{ exerciseId: 'missing', weight: 100 }])).toThrow('training max');
    expect(() => startActiveMesocycle(meso.id, [
      { exerciseId: exercise.id, weight: 100 }, { exerciseId: exercise.id, weight: 120 },
    ])).toThrow('training max');
    expect(getDb().select().from(activeMesocycles).all()).toHaveLength(0);
  });

  test('legacy snapshots adopt only unique exact names and preserve ambiguous history', () => {
    const { meso, detail } = makeBlock(['Push', 'Push Copy', 'Legs', 'Legs', 'Pull']);
    const activeId = addLegacyActive(meso.id);
    addLegacySession(activeId, 'push-copy', 'Push Copy - W1');
    addLegacySession(activeId, 'ambiguous-slot', 'Legs - W1');
    addLegacySession(activeId, 'duplicate-session-1', 'Pull - W1');
    addLegacySession(activeId, 'duplicate-session-2', 'Pull - W1');
    addLegacySession(activeId, 'renamed', 'Old workout name - W1');

    const active = getActiveMesocycleDetail(activeId)!;
    expect(active.active.structureSnapshot).not.toBeNull();
    const adopted = active.workoutsCompleted.filter((session) => session.mesocycleSlotId !== null);
    expect(adopted).toHaveLength(1);
    expect(adopted[0].id).toBe('push-copy');
    expect(adopted[0].mesocycleSlotId).toBe(detail.workouts[1].workout.id);
    expect(active.workoutsCompleted).toHaveLength(5);
    expect(getActiveMesocycleDetail(activeId)!.workoutsCompleted).toEqual(active.workoutsCompleted);
  });

  test('editing a legacy block captures its old program before row IDs are replaced', () => {
    const { meso, detail } = makeBlock();
    const activeId = addLegacyActive(meso.id);
    addLegacySession(activeId, 'legacy-push', 'Push - W1');
    replaceMesocycleStructure(meso.id, [{ name: 'Updated', dayNumber: 1, exercises: [] }]);
    const active = getActiveMesocycleDetail(activeId)!;
    expect(active.mesoDetail.workouts[0].workout.id).toBe(detail.workouts[0].workout.id);
    expect(active.mesoDetail.workouts[0].workout.name).toBe('Push');
    expect(active.workoutsCompleted[0].mesocycleSlotId).toBe(detail.workouts[0].workout.id);
  });

  test('unique unfinished legacy sessions resume without creating a duplicate', () => {
    const { meso, detail } = makeBlock();
    const activeId = addLegacyActive(meso.id);
    addLegacySession(activeId, 'unfinished', 'Push - W1');
    getDb().update(workouts).set({ completedAt: null }).where(eq(workouts.id, 'unfinished')).run();
    const resumed = startWorkoutFromMesocycleDay(activeId, detail.workouts[0].workout.id, 1)!;
    expect(resumed.id).toBe('unfinished');
    expect(resumed.completedAt).toBeNull();
    expect(getActiveMesocycleDetail(activeId)!.workoutsInProgress).toHaveLength(1);
  });
});
