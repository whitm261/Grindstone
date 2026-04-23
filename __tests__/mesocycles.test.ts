import { beforeEach, describe, expect, test } from 'bun:test';
import {
  createExercise,
  createMesocycle,
  getMesocycleDetail,
  replaceMesocycleStructure,
  startActiveMesocycle,
  getActiveMesocycleDetail,
  startWorkoutFromMesocycleDay,
  getWorkoutDetail,
  completeWorkout,
} from '@/lib/queries';
import { makeTestDb } from './helpers/db';

beforeEach(() => {
  makeTestDb();
});

describe('mesocycles', () => {
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
});
