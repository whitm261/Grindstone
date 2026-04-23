import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import { nanoid } from 'nanoid/non-secure';

import { getDb } from '@/db/client';
import {
  activeMesocycleMaxes,
  activeMesocycles,
  exercises,
  mesocycleExercises,
  mesocycleSets,
  mesocycleWorkouts,
  mesocycles,
  setLogs,
  templateExercises,
  templateSets,
  workoutExercises,
  workoutTemplates,
  workouts,
} from '@/db/schema';

const nowIso = () => new Date().toISOString();

export function listExercises() {
  return getDb()
    .select()
    .from(exercises)
    .orderBy(asc(exercises.name))
    .all();
}

export function getExercise(id: string) {
  return getDb().select().from(exercises).where(eq(exercises.id, id)).get();
}

export function createExercise(name: string, notes = '') {
  const id = nanoid();
  const row = { id, name: name.trim(), notes: notes.trim(), createdAt: nowIso() };
  getDb().insert(exercises).values(row).run();
  return row;
}

export function updateExercise(id: string, name: string, notes = '') {
  getDb()
    .update(exercises)
    .set({ name: name.trim(), notes: notes.trim() })
    .where(eq(exercises.id, id))
    .run();
}

export function deleteExercise(id: string) {
  getDb().delete(exercises).where(eq(exercises.id, id)).run();
}

export function listTemplates() {
  return getDb()
    .select()
    .from(workoutTemplates)
    .orderBy(desc(workoutTemplates.createdAt))
    .all();
}

export type TemplateDetail = {
  template: typeof workoutTemplates.$inferSelect;
  items: Array<{
    templateExercise: typeof templateExercises.$inferSelect;
    exercise: typeof exercises.$inferSelect;
    sets: (typeof templateSets.$inferSelect)[];
  }>;
};

export function getTemplateDetail(templateId: string): TemplateDetail | null {
  const db = getDb();
  const template = db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId))
    .get();
  if (!template) return null;

  const tes = db
    .select()
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .orderBy(asc(templateExercises.sortOrder))
    .all();
  if (!tes.length) return { template, items: [] };

  const exIds = [...new Set(tes.map((te) => te.exerciseId))];
  const exRows = db.select().from(exercises).where(inArray(exercises.id, exIds)).all();
  const exMap = new Map(exRows.map((e) => [e.id, e]));

  const teIds = tes.map((te) => te.id);
  const allSets = db
    .select()
    .from(templateSets)
    .where(inArray(templateSets.templateExerciseId, teIds))
    .orderBy(asc(templateSets.index))
    .all();
  const setsByTe = new Map<string, (typeof templateSets.$inferSelect)[]>();
  for (const s of allSets) {
    const arr = setsByTe.get(s.templateExerciseId);
    if (arr) arr.push(s);
    else setsByTe.set(s.templateExerciseId, [s]);
  }

  const items: TemplateDetail['items'] = [];
  for (const te of tes) {
    const ex = exMap.get(te.exerciseId);
    if (!ex) continue;
    items.push({ templateExercise: te, exercise: ex, sets: setsByTe.get(te.id) ?? [] });
  }
  return { template, items };
}

export function createTemplate(name: string, notes = '') {
  const id = nanoid();
  const row = {
    id,
    name: name.trim(),
    notes: notes.trim(),
    createdAt: nowIso(),
  };
  getDb().insert(workoutTemplates).values(row).run();
  return row;
}

export function updateTemplateMeta(id: string, name: string, notes = '') {
  getDb()
    .update(workoutTemplates)
    .set({ name: name.trim(), notes: notes.trim() })
    .where(eq(workoutTemplates.id, id))
    .run();
}

/** Replace template structure: exercise ids in order, each with default sets [reps, weight][] */
export function replaceTemplateStructure(
  templateId: string,
  structure: Array<{ exerciseId: string; sets: Array<{ reps: number; weight: number }> }>,
) {
  getDb().transaction((tx) => {
    const existingTe = tx
      .select({ id: templateExercises.id })
      .from(templateExercises)
      .where(eq(templateExercises.templateId, templateId))
      .all();
    const teIds = existingTe.map((r) => r.id);
    if (teIds.length) {
      tx.delete(templateSets).where(inArray(templateSets.templateExerciseId, teIds)).run();
      tx.delete(templateExercises).where(eq(templateExercises.templateId, templateId)).run();
    }
    let order = 0;
    for (const block of structure) {
      const teId = nanoid();
      tx.insert(templateExercises)
        .values({
          id: teId,
          templateId,
          exerciseId: block.exerciseId,
          sortOrder: order++,
        })
        .run();
      let setIdx = 0;
      for (const s of block.sets) {
        tx.insert(templateSets)
          .values({
            id: nanoid(),
            templateExerciseId: teId,
            index: setIdx++,
            targetReps: Math.max(0, Math.round(s.reps)),
            targetWeight: s.weight,
          })
          .run();
      }
    }
  }, { behavior: 'immediate' });
}

export function deleteTemplate(id: string) {
  getDb().delete(workoutTemplates).where(eq(workoutTemplates.id, id)).run();
}

export function createEmptyWorkout(name?: string) {
  const id = nanoid();
  const row = {
    id,
    templateId: null as string | null,
    name: (name ?? 'Workout').trim() || 'Workout',
    startedAt: nowIso(),
    completedAt: null as string | null,
  };
  getDb().insert(workouts).values(row).run();
  return row;
}

export function startWorkoutFromTemplate(templateId: string) {
  const detail = getTemplateDetail(templateId);
  if (!detail || detail.items.length === 0) return null;
  if (detail.items.some((i) => i.sets.length === 0)) return null;

  const workoutId = nanoid();
  const name = detail.template.name;

  return getDb().transaction((tx) => {
    tx.insert(workouts)
      .values({
        id: workoutId,
        templateId,
        name,
        startedAt: nowIso(),
        completedAt: null,
      })
      .run();

    let sort = 0;
    for (const item of detail.items) {
      const weId = nanoid();
      tx.insert(workoutExercises)
        .values({
          id: weId,
          workoutId,
          exerciseId: item.exercise.id,
          sortOrder: sort++,
        })
        .run();
      let idx = 0;
      for (const ts of item.sets) {
        tx.insert(setLogs)
          .values({
            id: nanoid(),
            workoutExerciseId: weId,
            index: idx++,
            reps: ts.targetReps,
            weight: ts.targetWeight,
            completed: false,
          })
          .run();
      }
    }
    return tx.select().from(workouts).where(eq(workouts.id, workoutId)).get()!;
  }, { behavior: 'immediate' });
}

export function getActiveWorkouts() {
  return getDb()
    .select()
    .from(workouts)
    .where(isNull(workouts.completedAt))
    .orderBy(desc(workouts.startedAt))
    .all();
}

export function listWorkoutHistory(limit = 100) {
  return getDb()
    .select()
    .from(workouts)
    .where(isNotNull(workouts.completedAt))
    .orderBy(desc(workouts.completedAt))
    .limit(limit)
    .all();
}

export type WorkoutDetail = {
  workout: typeof workouts.$inferSelect;
  blocks: Array<{
    workoutExercise: typeof workoutExercises.$inferSelect;
    exercise: typeof exercises.$inferSelect;
    sets: (typeof setLogs.$inferSelect)[];
  }>;
};

export function getWorkoutDetail(workoutId: string): WorkoutDetail | null {
  const db = getDb();
  const workout = db
    .select()
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .get();
  if (!workout) return null;

  const wes = db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.sortOrder))
    .all();
  if (!wes.length) return { workout, blocks: [] };

  const exIds = [...new Set(wes.map((w) => w.exerciseId))];
  const exRows = db.select().from(exercises).where(inArray(exercises.id, exIds)).all();
  const exMap = new Map(exRows.map((e) => [e.id, e]));

  const weIds = wes.map((w) => w.id);
  const allSets = db
    .select()
    .from(setLogs)
    .where(inArray(setLogs.workoutExerciseId, weIds))
    .orderBy(asc(setLogs.index))
    .all();
  const setsByWe = new Map<string, (typeof setLogs.$inferSelect)[]>();
  for (const s of allSets) {
    const arr = setsByWe.get(s.workoutExerciseId);
    if (arr) arr.push(s);
    else setsByWe.set(s.workoutExerciseId, [s]);
  }

  const blocks: WorkoutDetail['blocks'] = [];
  for (const we of wes) {
    const ex = exMap.get(we.exerciseId);
    if (!ex) continue;
    blocks.push({ workoutExercise: we, exercise: ex, sets: setsByWe.get(we.id) ?? [] });
  }
  return { workout, blocks };
}

export function updateWorkoutName(workoutId: string, name: string) {
  getDb()
    .update(workouts)
    .set({ name: name.trim() || 'Workout' })
    .where(eq(workouts.id, workoutId))
    .run();
}

export function updateSetLog(
  setId: string,
  patch: Partial<Pick<typeof setLogs.$inferInsert, 'reps' | 'weight' | 'completed'>>,
) {
  getDb().update(setLogs).set(patch).where(eq(setLogs.id, setId)).run();
}

export function addSetToWorkoutExercise(workoutExerciseId: string) {
  const existing = getDb()
    .select()
    .from(setLogs)
    .where(eq(setLogs.workoutExerciseId, workoutExerciseId))
    .orderBy(desc(setLogs.index))
    .all();
  const last = existing[0];
  const nextIndex = last ? last.index + 1 : 0;
  const reps = last?.reps ?? 8;
  const weight = last?.weight ?? 0;
  const id = nanoid();
  getDb()
    .insert(setLogs)
    .values({
      id,
      workoutExerciseId,
      index: nextIndex,
      reps,
      weight,
      completed: false,
    })
    .run();
  return id;
}

export function removeLastSet(workoutExerciseId: string) {
  const existing = getDb()
    .select()
    .from(setLogs)
    .where(eq(setLogs.workoutExerciseId, workoutExerciseId))
    .orderBy(desc(setLogs.index))
    .all();
  if (existing.length <= 1) return false;
  const last = existing[0];
  getDb().delete(setLogs).where(eq(setLogs.id, last.id)).run();
  return true;
}

export function addExerciseToWorkout(workoutId: string, exerciseId: string) {
  const agg = getDb()
    .select({ m: max(workoutExercises.sortOrder) })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .get();
  const maxSort = agg?.m ?? -1;
  const weId = nanoid();
  getDb()
    .insert(workoutExercises)
    .values({
      id: weId,
      workoutId,
      exerciseId,
      sortOrder: maxSort + 1,
    })
    .run();
  getDb()
    .insert(setLogs)
    .values({
      id: nanoid(),
      workoutExerciseId: weId,
      index: 0,
      reps: 8,
      weight: 0,
      completed: false,
    })
    .run();
  return weId;
}

export function removeWorkoutExerciseBlock(workoutExerciseId: string) {
  getDb().delete(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).run();
}

export function moveWorkoutExercise(workoutExerciseId: string, direction: -1 | 1) {
  getDb().transaction((tx) => {
    const we = tx
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.id, workoutExerciseId))
      .get();
    if (!we) return;
    const siblings = tx
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, we.workoutId))
      .orderBy(asc(workoutExercises.sortOrder))
      .all();
    const i = siblings.findIndex((s) => s.id === workoutExerciseId);
    const j = i + direction;
    if (j < 0 || j >= siblings.length) return;
    const a = siblings[i];
    const b = siblings[j];
    tx.update(workoutExercises)
      .set({ sortOrder: b.sortOrder })
      .where(eq(workoutExercises.id, a.id))
      .run();
    tx.update(workoutExercises)
      .set({ sortOrder: a.sortOrder })
      .where(eq(workoutExercises.id, b.id))
      .run();
  }, { behavior: 'immediate' });
}

export function completeWorkout(workoutId: string) {
  getDb()
    .update(workouts)
    .set({ completedAt: nowIso() })
    .where(eq(workouts.id, workoutId))
    .run();
}

export function abandonWorkout(workoutId: string) {
  getDb().delete(workouts).where(eq(workouts.id, workoutId)).run();
}

/** Per completed workout: volume for this exercise (sum reps*weight of completed sets) */
export function getExerciseVolumeHistory(exerciseId: string, days = 365) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const completed = db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.completedAt), gte(workouts.completedAt, cutoffIso)))
    .all();
  const workoutIds = completed.map((w) => w.id);
  if (!workoutIds.length) return [];

  const wes = db
    .select()
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        inArray(workoutExercises.workoutId, workoutIds),
      ),
    )
    .all();
  if (!wes.length) return [];

  const weIds = wes.map((w) => w.id);
  const allSets = db
    .select()
    .from(setLogs)
    .where(inArray(setLogs.workoutExerciseId, weIds))
    .all();
  const setsByWe = new Map<string, (typeof setLogs.$inferSelect)[]>();
  for (const s of allSets) {
    const arr = setsByWe.get(s.workoutExerciseId);
    if (arr) arr.push(s);
    else setsByWe.set(s.workoutExerciseId, [s]);
  }

  const byWorkout = new Map<string, number>();
  for (const we of wes) {
    let vol = 0;
    for (const s of setsByWe.get(we.id) ?? []) {
      if (s.completed) vol += s.reps * s.weight;
    }
    byWorkout.set(we.workoutId, (byWorkout.get(we.workoutId) ?? 0) + vol);
  }

  return completed
    .filter((w) => (byWorkout.get(w.id) ?? 0) > 0)
    .map((w) => ({
      date: w.completedAt!,
      volume: byWorkout.get(w.id) ?? 0,
      label: w.name,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getExerciseMaxWeightHistory(exerciseId: string, days = 365) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const completed = db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.completedAt), gte(workouts.completedAt, cutoffIso)))
    .all();
  const workoutIds = completed.map((w) => w.id);
  if (!workoutIds.length) return [];

  const wes = db
    .select()
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        inArray(workoutExercises.workoutId, workoutIds),
      ),
    )
    .all();
  if (!wes.length) return [];

  const weIds = wes.map((w) => w.id);
  const allSets = db
    .select()
    .from(setLogs)
    .where(inArray(setLogs.workoutExerciseId, weIds))
    .all();
  const setsByWe = new Map<string, (typeof setLogs.$inferSelect)[]>();
  for (const s of allSets) {
    const arr = setsByWe.get(s.workoutExerciseId);
    if (arr) arr.push(s);
    else setsByWe.set(s.workoutExerciseId, [s]);
  }

  const maxByWorkout = new Map<string, number>();
  for (const we of wes) {
    const completedSets = (setsByWe.get(we.id) ?? []).filter((s) => s.completed);
    const m = completedSets.length ? Math.max(...completedSets.map((s) => s.weight)) : 0;
    maxByWorkout.set(we.workoutId, Math.max(maxByWorkout.get(we.workoutId) ?? 0, m));
  }

  return completed
    .filter((w) => (maxByWorkout.get(w.id) ?? 0) > 0)
    .map((w) => ({
      date: w.completedAt!,
      maxWeight: maxByWorkout.get(w.id) ?? 0,
      label: w.name,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type LastExerciseData = {
  workoutName: string;
  completedAt: string;
  sets: Array<{ index: number; reps: number; weight: number }>;
};

/**
 * For each exerciseId, return the sets from the most recent completed workout
 * that included that exercise. Exercises with no history are omitted from the map.
 */
export function getLastWorkoutDataForExercises(
  exerciseIds: string[],
): Map<string, LastExerciseData> {
  if (!exerciseIds.length) return new Map();
  const db = getDb();

  const completedWorkouts = db
    .select()
    .from(workouts)
    .where(isNotNull(workouts.completedAt))
    .orderBy(desc(workouts.completedAt))
    .all();

  if (!completedWorkouts.length) return new Map();

  const completedWorkoutIds = completedWorkouts.map((w) => w.id);
  const workoutMap = new Map(completedWorkouts.map((w) => [w.id, w]));

  const wes = db
    .select()
    .from(workoutExercises)
    .where(
      and(
        inArray(workoutExercises.exerciseId, exerciseIds),
        inArray(workoutExercises.workoutId, completedWorkoutIds),
      ),
    )
    .all();

  if (!wes.length) return new Map();

  // Keep only the most recent workout_exercise per exercise
  const latestWeByExercise = new Map<string, typeof workoutExercises.$inferSelect>();
  for (const we of wes) {
    const existing = latestWeByExercise.get(we.exerciseId);
    if (!existing) {
      latestWeByExercise.set(we.exerciseId, we);
    } else {
      const existingAt = workoutMap.get(existing.workoutId)?.completedAt ?? '';
      const thisAt = workoutMap.get(we.workoutId)?.completedAt ?? '';
      if (thisAt > existingAt) latestWeByExercise.set(we.exerciseId, we);
    }
  }

  const latestWeIds = [...latestWeByExercise.values()].map((we) => we.id);
  const allSets = db
    .select()
    .from(setLogs)
    .where(inArray(setLogs.workoutExerciseId, latestWeIds))
    .orderBy(asc(setLogs.index))
    .all();

  const setsByWe = new Map<string, (typeof setLogs.$inferSelect)[]>();
  for (const s of allSets) {
    const arr = setsByWe.get(s.workoutExerciseId);
    if (arr) arr.push(s);
    else setsByWe.set(s.workoutExerciseId, [s]);
  }

  const result = new Map<string, LastExerciseData>();
  for (const [exerciseId, we] of latestWeByExercise) {
    const workout = workoutMap.get(we.workoutId)!;
    const sets = (setsByWe.get(we.id) ?? []).map((s) => ({
      index: s.index,
      reps: s.reps,
      weight: s.weight,
    }));
    result.set(exerciseId, {
      workoutName: workout.name,
      completedAt: workout.completedAt!,
      sets,
    });
  }

  return result;
}

// --- Mesocycles ---

export function listMesocycles() {
  return getDb()
    .select()
    .from(mesocycles)
    .orderBy(desc(mesocycles.createdAt))
    .all();
}

export type MesocycleDetail = {
  mesocycle: typeof mesocycles.$inferSelect;
  workouts: Array<{
    workout: typeof mesocycleWorkouts.$inferSelect;
    exercises: Array<{
      mesoExercise: typeof mesocycleExercises.$inferSelect;
      exercise: typeof exercises.$inferSelect;
      sets: (typeof mesocycleSets.$inferSelect)[];
    }>;
  }>;
};

export function getMesocycleDetail(mesocycleId: string): MesocycleDetail | null {
  const db = getDb();
  const meso = db
    .select()
    .from(mesocycles)
    .where(eq(mesocycles.id, mesocycleId))
    .get();
  if (!meso) return null;

  const mws = db
    .select()
    .from(mesocycleWorkouts)
    .where(eq(mesocycleWorkouts.mesocycleId, mesocycleId))
    .orderBy(asc(mesocycleWorkouts.dayNumber))
    .all();

  const workouts: MesocycleDetail['workouts'] = [];

  for (const mw of mws) {
    const mes = db
      .select()
      .from(mesocycleExercises)
      .where(eq(mesocycleExercises.mesocycleWorkoutId, mw.id))
      .orderBy(asc(mesocycleExercises.sortOrder))
      .all();

    const exercisesInMeso: MesocycleDetail['workouts'][0]['exercises'] = [];

    for (const me of mes) {
      const ex = db.select().from(exercises).where(eq(exercises.id, me.exerciseId)).get();
      if (!ex) continue;

      const sets = db
        .select()
        .from(mesocycleSets)
        .where(eq(mesocycleSets.mesocycleExerciseId, me.id))
        .orderBy(asc(mesocycleSets.weekNumber), asc(mesocycleSets.index))
        .all();

      exercisesInMeso.push({ mesoExercise: me, exercise: ex, sets });
    }

    workouts.push({ workout: mw, exercises: exercisesInMeso });
  }

  return { mesocycle: meso, workouts };
}

export function createMesocycle(name: string, weeks: number, notes = '') {
  const id = nanoid();
  const row = {
    id,
    name: name.trim(),
    weeks,
    notes: notes.trim(),
    createdAt: nowIso(),
  };
  getDb().insert(mesocycles).values(row).run();
  return row;
}

/** 
 * Replace mesocycle structure.
 * structure: Array of workout days, each with exercises.
 * Focus exercises have sets for EVERY week.
 * Accessory exercises have sets with weekNumber = null.
 */
export function replaceMesocycleStructure(
  mesocycleId: string,
  structure: Array<{
    name: string;
    dayNumber: number;
    exercises: Array<{
      exerciseId: string;
      isFocus: boolean;
      sets: Array<{
        weekNumber: number | null;
        reps: number;
        percentage: number | null;
      }>;
    }>;
  }>,
) {
  getDb().transaction((tx) => {
    // Delete existing
    const existingWorkouts = tx
      .select({ id: mesocycleWorkouts.id })
      .from(mesocycleWorkouts)
      .where(eq(mesocycleWorkouts.mesocycleId, mesocycleId))
      .all();
    
    for (const mw of existingWorkouts) {
      const existingExercises = tx
        .select({ id: mesocycleExercises.id })
        .from(mesocycleExercises)
        .where(eq(mesocycleExercises.mesocycleWorkoutId, mw.id))
        .all();
      
      for (const me of existingExercises) {
        tx.delete(mesocycleSets).where(eq(mesocycleSets.mesocycleExerciseId, me.id)).run();
      }
      tx.delete(mesocycleExercises).where(eq(mesocycleExercises.mesocycleWorkoutId, mw.id)).run();
    }
    tx.delete(mesocycleWorkouts).where(eq(mesocycleWorkouts.mesocycleId, mesocycleId)).run();

    // Insert new
    for (const sWorkout of structure) {
      const mwId = nanoid();
      tx.insert(mesocycleWorkouts)
        .values({
          id: mwId,
          mesocycleId,
          dayNumber: sWorkout.dayNumber,
          name: sWorkout.name,
        })
        .run();

      let order = 0;
      for (const sEx of sWorkout.exercises) {
        const meId = nanoid();
        tx.insert(mesocycleExercises)
          .values({
            id: meId,
            mesocycleWorkoutId: mwId,
            exerciseId: sEx.exerciseId,
            sortOrder: order++,
            isFocus: sEx.isFocus,
          })
          .run();

        let setIdx = 0;
        for (const sSet of sEx.sets) {
          tx.insert(mesocycleSets)
            .values({
              id: nanoid(),
              mesocycleExerciseId: meId,
              weekNumber: sSet.weekNumber,
              index: setIdx++,
              targetReps: sSet.reps,
              targetPercentage: sSet.percentage,
            })
            .run();
        }
      }
    }
  }, { behavior: 'immediate' });
}

export function deleteMesocycle(id: string) {
  getDb().delete(mesocycles).where(eq(mesocycles.id, id)).run();
}

// --- Active Mesocycles ---

export function startActiveMesocycle(
  mesocycleId: string,
  maxes: Array<{ exerciseId: string; weight: number }>,
) {
  const meso = getDb()
    .select()
    .from(mesocycles)
    .where(eq(mesocycles.id, mesocycleId))
    .get();
  if (!meso) return null;

  const id = nanoid();
  return getDb().transaction((tx) => {
    tx.insert(activeMesocycles)
      .values({
        id,
        mesocycleId,
        name: meso.name,
        startedAt: nowIso(),
      })
      .run();

    for (const m of maxes) {
      tx.insert(activeMesocycleMaxes)
        .values({
          id: nanoid(),
          activeMesocycleId: id,
          exerciseId: m.exerciseId,
          weight: m.weight,
        })
        .run();
    }
    return id;
  }, { behavior: 'immediate' });
}

export function listActiveMesocycles() {
  return getDb()
    .select()
    .from(activeMesocycles)
    .where(isNull(activeMesocycles.completedAt))
    .orderBy(desc(activeMesocycles.startedAt))
    .all();
}

export function getActiveMesocycleDetail(activeId: string) {
  const db = getDb();
  const active = db
    .select()
    .from(activeMesocycles)
    .where(eq(activeMesocycles.id, activeId))
    .get();
  if (!active) return null;

  const mesoDetail = getMesocycleDetail(active.mesocycleId);
  if (!mesoDetail) return null;

  const maxes = db
    .select()
    .from(activeMesocycleMaxes)
    .where(eq(activeMesocycleMaxes.activeMesocycleId, activeId))
    .all();
  
  const workoutsCompleted = db
    .select()
    .from(workouts)
    .where(and(eq(workouts.activeMesocycleId, activeId), isNotNull(workouts.completedAt)))
    .all();

  return {
    active,
    mesoDetail,
    maxes,
    workoutsCompleted,
  };
}

export function startWorkoutFromMesocycleDay(
  activeMesocycleId: string,
  mesocycleWorkoutId: string,
  weekNumber: number,
) {
  const db = getDb();
  const active = db
    .select()
    .from(activeMesocycles)
    .where(eq(activeMesocycles.id, activeMesocycleId))
    .get();
  if (!active) return null;

  const mw = db
    .select()
    .from(mesocycleWorkouts)
    .where(eq(mesocycleWorkouts.id, mesocycleWorkoutId))
    .get();
  if (!mw) return null;

  const maxes = db
    .select()
    .from(activeMesocycleMaxes)
    .where(eq(activeMesocycleMaxes.activeMesocycleId, activeMesocycleId))
    .all();
  const maxMap = new Map(maxes.map((m) => [m.exerciseId, m.weight]));

  const mes = db
    .select()
    .from(mesocycleExercises)
    .where(eq(mesocycleExercises.mesocycleWorkoutId, mw.id))
    .orderBy(asc(mesocycleExercises.sortOrder))
    .all();

  const workoutId = nanoid();
  return db.transaction((tx) => {
    tx.insert(workouts)
      .values({
        id: workoutId,
        activeMesocycleId,
        mesocycleWeek: weekNumber,
        name: `${mw.name} - W${weekNumber}`,
        startedAt: nowIso(),
      })
      .run();

    for (const me of mes) {
      const weId = nanoid();
      tx.insert(workoutExercises)
        .values({
          id: weId,
          workoutId,
          exerciseId: me.exerciseId,
          sortOrder: me.sortOrder,
        })
        .run();

      const sets = tx
        .select()
        .from(mesocycleSets)
        .where(
          and(
            eq(mesocycleSets.mesocycleExerciseId, me.id),
            // weekNumber is null for accessories (applies to all weeks)
            me.isFocus 
              ? eq(mesocycleSets.weekNumber, weekNumber)
              : isNull(mesocycleSets.weekNumber)
          )
        )
        .orderBy(asc(mesocycleSets.index))
        .all();

      for (const s of sets) {
        let targetWeight = 0;
        if (me.isFocus && s.targetPercentage !== null) {
          const max = maxMap.get(me.exerciseId) ?? 0;
          targetWeight = (max * s.targetPercentage) / 100;
          // Round to nearest 2.5 (common in gyms) or keep as is? 
          // Let's keep it exact for now, UI can format it.
        }

        tx.insert(setLogs)
          .values({
            id: nanoid(),
            workoutExerciseId: weId,
            index: s.index,
            reps: s.targetReps,
            weight: targetWeight,
            completed: false,
          })
          .run();
      }
    }
    return tx.select().from(workouts).where(eq(workouts.id, workoutId)).get()!;
  }, { behavior: 'immediate' });
}

export function completeActiveMesocycle(id: string) {
  getDb()
    .update(activeMesocycles)
    .set({ completedAt: nowIso() })
    .where(eq(activeMesocycles.id, id))
    .run();
}

export function deleteActiveMesocycle(id: string) {
  getDb().delete(activeMesocycles).where(eq(activeMesocycles.id, id)).run();
}
