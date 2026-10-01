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
  workoutDrafts,
  workouts,
} from '@/db/schema';
import { createWorkoutDraft, isWorkoutDraft, validateWorkoutDraft, type WorkoutDraft } from '@/lib/workoutDraft';

const nowIso = () => new Date().toISOString();

export function listExercises(options: { archived?: boolean } = {}) {
  return getDb()
    .select()
    .from(exercises)
    .where(options.archived ? isNotNull(exercises.archivedAt) : isNull(exercises.archivedAt))
    .orderBy(asc(exercises.name))
    .all();
}

export function getExercise(id: string) {
  return getDb().select().from(exercises).where(eq(exercises.id, id)).get();
}

export function createExercise(name: string, notes = '') {
  const id = nanoid();
  const row = { id, name: name.trim(), notes: notes.trim(), createdAt: nowIso(), archivedAt: null };
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

export function archiveExercise(id: string) {
  getDb()
    .update(exercises)
    .set({ archivedAt: nowIso() })
    .where(and(eq(exercises.id, id), isNull(exercises.archivedAt)))
    .run();
}

export function restoreExercise(id: string) {
  getDb().update(exercises).set({ archivedAt: null }).where(eq(exercises.id, id)).run();
}

/** Compatibility for callers predating archival; historical references must survive. */
export function deleteExercise(id: string) {
  archiveExercise(id);
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
  metadata?: { name: string; notes: string },
) {
  getDb().transaction((tx) => {
    if (metadata) {
      tx.update(workoutTemplates).set({ name: metadata.name.trim(), notes: metadata.notes.trim() })
        .where(eq(workoutTemplates.id, templateId)).run();
    }
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

/** Save metadata and structure together so a failed edit leaves the previous template intact. */
export function saveTemplate(
  id: string,
  name: string,
  notes: string,
  structure: Parameters<typeof replaceTemplateStructure>[1],
) {
  if (!name.trim()) throw new Error('Enter a template name.');
  for (const block of structure) {
    for (const set of block.sets) {
      if (!Number.isSafeInteger(set.reps) || set.reps <= 0 || !Number.isFinite(set.weight) || set.weight < 0) {
        throw new Error('Enter positive whole reps and a weight of 0 or more for every set.');
      }
    }
  }
  return replaceTemplateStructure(id, structure, { name, notes });
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
    .select({ workout: workouts, payload: workoutDrafts.payload })
    .from(workouts)
    .leftJoin(workoutDrafts, eq(workoutDrafts.workoutId, workouts.id))
    .where(isNull(workouts.completedAt))
    .orderBy(desc(workouts.startedAt))
    .all()
    .map(({ workout, payload }) => {
      if (!payload) return workout;
      try {
        const draft: unknown = JSON.parse(payload);
        return isWorkoutDraft(draft) ? { ...workout, name: draft.name.trim() || 'Workout' } : workout;
      } catch {
        return workout;
      }
    });
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

export function getWorkoutDraft(workoutId: string): WorkoutDraft | null {
  const row = getDb().select().from(workoutDrafts).where(eq(workoutDrafts.workoutId, workoutId)).get();
  if (!row) return null;
  const value: unknown = JSON.parse(row.payload);
  if (!isWorkoutDraft(value)) throw new Error('This workout draft could not be read. Your saved data has been kept.');
  return value;
}

/** Save raw text locally; numeric validation belongs to completeWorkout. */
export function saveWorkoutDraft(workoutId: string, draft: WorkoutDraft) {
  const db = getDb();
  db.transaction((tx) => {
    const workout = tx.select().from(workouts).where(eq(workouts.id, workoutId)).get();
    if (!workout || workout.completedAt) throw new Error('This workout is no longer active.');
    tx.insert(workoutDrafts).values({ workoutId, payload: JSON.stringify(draft) })
      .onConflictDoUpdate({ target: workoutDrafts.workoutId, set: { payload: JSON.stringify(draft) } }).run();
  });
}

export function addSetToWorkoutExercise(workoutExerciseId: string) {
  const db = getDb();
  return db.transaction((tx) => {
    const block = tx.select().from(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).get();
    if (!block) throw new Error('Exercise is no longer in this workout.');
    const existing = tx
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
    tx
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
    const draftRow = tx.select().from(workoutDrafts).where(eq(workoutDrafts.workoutId, block.workoutId)).get();
    if (draftRow) {
      const draft: unknown = JSON.parse(draftRow.payload);
      if (!isWorkoutDraft(draft)) throw new Error('This workout draft could not be read.');
      const source = last && draft.sets[last.id];
      draft.sets[id] = { reps: source?.reps ?? String(reps), weight: source?.weight ?? String(weight), completed: false };
      tx.update(workoutDrafts).set({ payload: JSON.stringify(draft) })
        .where(eq(workoutDrafts.workoutId, block.workoutId)).run();
    }
    return id;
  }, { behavior: 'immediate' });
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
  return getDb().transaction((tx) => {
    const agg = tx
      .select({ m: max(workoutExercises.sortOrder) })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .get();
    const maxSort = agg?.m ?? -1;
    const weId = nanoid();
    tx
      .insert(workoutExercises)
      .values({
        id: weId,
        workoutId,
        exerciseId,
        sortOrder: maxSort + 1,
      })
      .run();
    tx
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
  }, { behavior: 'immediate' });
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

export function completeWorkout(workoutId: string, draft?: WorkoutDraft) {
  return getDb().transaction((tx) => {
    const detail = getWorkoutDetail(workoutId);
    if (!detail) throw new Error('Workout not found.');
    if (detail.workout.completedAt) return;
    const current = createWorkoutDraft(detail, draft ?? getWorkoutDraft(workoutId));
    const validation = validateWorkoutDraft(current);
    if (!validation.valid) throw new Error('Correct the reps and weight in checked sets before finishing.');
    for (const block of detail.blocks) {
      for (const set of block.sets) {
        if (!current.sets[set.id].completed) {
          tx.delete(setLogs).where(eq(setLogs.id, set.id)).run();
        }
      }
    }
    for (const set of validation.completedSets) {
      tx.update(setLogs).set({ reps: set.reps, weight: set.weight, completed: true })
        .where(eq(setLogs.id, set.id)).run();
    }
    tx.update(workouts).set({ name: current.name.trim() || 'Workout', completedAt: nowIso() })
      .where(eq(workouts.id, workoutId)).run();
    tx.delete(workoutDrafts).where(eq(workoutDrafts.workoutId, workoutId)).run();
  }, { behavior: 'immediate' });
}

export function abandonWorkout(workoutId: string) {
  getDb().delete(workouts).where(eq(workouts.id, workoutId)).run();
}

type PerformedSet = {
  exerciseId: string;
  workoutId: string;
  workoutName: string;
  completedAt: string;
  reps: number;
  weight: number;
};

/**
 * One eligibility rule for progress and previous-performance hints. A checked set
 * in a finished workout counts only when its stored numbers are valid. Older
 * versions allowed invalid and unchecked sets to leak into these summaries.
 * Repeated exercise blocks remain in workout order instead of replacing one another.
 */
function getPerformedSetHistory(exerciseIds: string[], days?: number): PerformedSet[] {
  if (!exerciseIds.length) return [];
  const cutoff = days === undefined ? undefined : new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = getDb()
    .select({
      exerciseId: workoutExercises.exerciseId,
      workoutId: workouts.id,
      workoutName: workouts.name,
      completedAt: workouts.completedAt,
      reps: setLogs.reps,
      weight: setLogs.weight,
    })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(setLogs.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(
      inArray(workoutExercises.exerciseId, exerciseIds),
      isNotNull(workouts.completedAt),
      eq(setLogs.completed, true),
      cutoff ? gte(workouts.completedAt, cutoff) : undefined,
    ))
    .orderBy(
      desc(workouts.completedAt),
      desc(workouts.startedAt),
      desc(workouts.id),
      asc(workoutExercises.sortOrder),
      asc(workoutExercises.id),
      asc(setLogs.index),
      asc(setLogs.id),
    )
    .all();

  return rows
    .filter((row) => Number.isInteger(row.reps) && row.reps > 0 &&
      Number.isFinite(row.weight) && row.weight >= 0)
    .map((row) => ({ ...row, completedAt: row.completedAt! }));
}

export type ExerciseProgressPoint = {
  workoutId: string;
  date: string;
  label: string;
  /** Heaviest completed weight, with the most reps as the tie breaker. */
  maxWeight: number;
  reps: number;
  volume: number;
  setCount: number;
};

/** One point per performed session, including sessions with zero added weight. */
export function getExerciseProgressHistory(exerciseId: string, days = 365): ExerciseProgressPoint[] {
  const byWorkout = new Map<string, ExerciseProgressPoint>();
  for (const set of getPerformedSetHistory([exerciseId], days)) {
    const point = byWorkout.get(set.workoutId);
    if (!point) {
      byWorkout.set(set.workoutId, {
        workoutId: set.workoutId,
        date: set.completedAt,
        label: set.workoutName,
        maxWeight: set.weight,
        reps: set.reps,
        volume: set.reps * set.weight,
        setCount: 1,
      });
      continue;
    }
    point.volume += set.reps * set.weight;
    point.setCount += 1;
    if (set.weight > point.maxWeight || (set.weight === point.maxWeight && set.reps > point.reps)) {
      point.maxWeight = set.weight;
      point.reps = set.reps;
    }
  }
  // The selector is newest first; charts display oldest first with stable tie ordering.
  return [...byWorkout.values()].reverse();
}

/** Volume is workload (reps × weight), not the weight lifted. */
export function getExerciseVolumeHistory(exerciseId: string, days = 365) {
  return getExerciseProgressHistory(exerciseId, days);
}

export function getExerciseMaxWeightHistory(exerciseId: string, days = 365) {
  return getExerciseProgressHistory(exerciseId, days);
}

export type LastExerciseData = {
  workoutId: string;
  workoutName: string;
  completedAt: string;
  sets: Array<{ index: number; reps: number; weight: number }>;
};

/** Most recent performed session per exercise, skipping empty or skipped sessions. */
export function getLastWorkoutDataForExercises(
  exerciseIds: string[],
): Map<string, LastExerciseData> {
  const result = new Map<string, LastExerciseData>();
  for (const set of getPerformedSetHistory(exerciseIds)) {
    let previous = result.get(set.exerciseId);
    if (!previous) {
      previous = {
        workoutId: set.workoutId,
        workoutName: set.workoutName,
        completedAt: set.completedAt,
        sets: [],
      };
      result.set(set.exerciseId, previous);
    }
    if (previous.workoutId === set.workoutId) {
      previous.sets.push({
        index: previous.sets.length,
        reps: set.reps,
        weight: set.weight,
      });
    }
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
    // Older running blocks may not have a snapshot yet. Capture their current
    // program before replacing the reusable definition and its row IDs.
    const legacyActives = tx.select().from(activeMesocycles)
      .where(and(eq(activeMesocycles.mesocycleId, mesocycleId), isNull(activeMesocycles.structureSnapshot)))
      .all();
    if (legacyActives.length > 0) {
      const detail = getMesocycleDetail(mesocycleId);
      if (detail) {
        for (const active of legacyActives) {
          tx.update(activeMesocycles).set({ structureSnapshot: JSON.stringify(detail) })
            .where(eq(activeMesocycles.id, active.id)).run();
        }
      }
    }
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
  return getDb().transaction((tx) => {
    // Definition deletion cascades to instances at the schema level. Refuse it
    // whenever an instance exists so saved programs, maxes and session links survive.
    const instance = tx.select({ id: activeMesocycles.id }).from(activeMesocycles)
      .where(eq(activeMesocycles.mesocycleId, id)).limit(1).get();
    if (instance) return false;
    tx.delete(mesocycles).where(eq(mesocycles.id, id)).run();
    return true;
  }, { behavior: 'immediate' });
}

// --- Active Mesocycles ---

export function startActiveMesocycle(
  mesocycleId: string,
  maxes: Array<{ exerciseId: string; weight: number }>,
) {
  const detail = getMesocycleDetail(mesocycleId);
  if (!detail) return null;

  const focusIds = new Set(detail.workouts.flatMap((workout) =>
    workout.exercises.filter((item) => item.mesoExercise.isFocus).map((item) => item.exercise.id),
  ));
  const maxMap = new Map(maxes.map((item) => [item.exerciseId, item.weight]));
  if (maxMap.size !== maxes.length || maxes.some((item) =>
    !focusIds.has(item.exerciseId) || !Number.isFinite(item.weight) || item.weight <= 0,
  ) || [...focusIds].some((exerciseId) => !maxMap.has(exerciseId))) {
    throw new Error('Enter a positive training max for each focus lift.');
  }

  const id = nanoid();
  return getDb().transaction((tx) => {
    tx.insert(activeMesocycles)
      .values({
        id,
        mesocycleId,
        name: detail.mesocycle.name,
        startedAt: nowIso(),
        structureSnapshot: JSON.stringify(detail),
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

export type ActiveMesocycleDetail = {
  active: typeof activeMesocycles.$inferSelect;
  mesoDetail: MesocycleDetail;
  maxes: (typeof activeMesocycleMaxes.$inferSelect)[];
  workoutsCompleted: (typeof workouts.$inferSelect)[];
  workoutsInProgress: (typeof workouts.$inferSelect)[];
};

export function getActiveMesocycleDetail(activeId: string): ActiveMesocycleDetail | null {
  const db = getDb();
  return db.transaction((tx) => {
    const active = tx.select().from(activeMesocycles)
      .where(eq(activeMesocycles.id, activeId)).get();
    if (!active) return null;

    let mesoDetail: MesocycleDetail | null;
    if (active.structureSnapshot === null) {
      mesoDetail = getMesocycleDetail(active.mesocycleId);
      if (!mesoDetail) return null;
      active.structureSnapshot = JSON.stringify(mesoDetail);
      tx.update(activeMesocycles).set({ structureSnapshot: active.structureSnapshot })
        .where(eq(activeMesocycles.id, activeId)).run();
    } else {
      try {
        mesoDetail = JSON.parse(active.structureSnapshot) as MesocycleDetail;
        if (!mesoDetail?.mesocycle || !Array.isArray(mesoDetail.workouts)) return null;
      } catch {
        return null;
      }
    }

    const sessions = tx.select().from(workouts)
      .where(eq(workouts.activeMesocycleId, activeId))
      .orderBy(asc(workouts.startedAt), asc(workouts.id)).all();

    // Legacy sessions have no stable slot ID. Only adopt a session when both
    // the exact generated name and the session itself identify a unique slot.
    // Ambiguous history stays untouched rather than checking off the wrong slot.
    for (const session of sessions) {
      const week = session.mesocycleWeek;
      if (session.mesocycleSlotId !== null || week === null || !Number.isInteger(week)
        || week < 1 || week > mesoDetail.mesocycle.weeks) continue;
      const candidates = mesoDetail.workouts.filter((item) =>
        session.name === `${item.workout.name} - W${week}`,
      );
      if (candidates.length !== 1) continue;
      const slotId = candidates[0].workout.id;
      const matchingSessions = sessions.filter((item) => item.mesocycleWeek === week
        && (item.mesocycleSlotId === slotId || item.name === session.name));
      if (matchingSessions.length !== 1) continue;
      tx.update(workouts).set({ mesocycleSlotId: slotId })
        .where(eq(workouts.id, session.id)).run();
      session.mesocycleSlotId = slotId;
    }

    return {
      active,
      mesoDetail,
      maxes: tx.select().from(activeMesocycleMaxes)
        .where(eq(activeMesocycleMaxes.activeMesocycleId, activeId)).all(),
      workoutsCompleted: sessions.filter((workout) => workout.completedAt !== null),
      workoutsInProgress: sessions.filter((workout) => workout.completedAt === null),
    };
  }, { behavior: 'immediate' });
}

export function startWorkoutFromMesocycleDay(
  activeMesocycleId: string,
  mesocycleWorkoutId: string,
  weekNumber: number,
) {
  const detail = getActiveMesocycleDetail(activeMesocycleId);
  if (!detail || detail.active.completedAt !== null || !Number.isInteger(weekNumber)
    || weekNumber < 1 || weekNumber > detail.mesoDetail.mesocycle.weeks) return null;

  const slot = detail.mesoDetail.workouts.find((item) => item.workout.id === mesocycleWorkoutId);
  if (!slot) return null;
  const maxMap = new Map(detail.maxes.map((m) => [m.exerciseId, m.weight]));

  return getDb().transaction((tx) => {
    const existing = tx.select().from(workouts).where(and(
      eq(workouts.activeMesocycleId, activeMesocycleId),
      eq(workouts.mesocycleSlotId, mesocycleWorkoutId),
      eq(workouts.mesocycleWeek, weekNumber),
    )).get();
    if (existing) return existing;

    const workoutId = nanoid();
    tx.insert(workouts)
      .values({
        id: workoutId,
        activeMesocycleId,
        mesocycleSlotId: mesocycleWorkoutId,
        mesocycleWeek: weekNumber,
        name: `${slot.workout.name} - W${weekNumber}`,
        startedAt: nowIso(),
      })
      .run();

    for (const item of slot.exercises) {
      const me = item.mesoExercise;
      const weId = nanoid();
      tx.insert(workoutExercises)
        .values({
          id: weId,
          workoutId,
          exerciseId: me.exerciseId,
          sortOrder: me.sortOrder,
        })
        .run();

      const sets = item.sets.filter((set) => me.isFocus
        ? set.weekNumber === weekNumber : set.weekNumber === null);
      for (const [index, set] of sets.entries()) {
        const targetWeight = me.isFocus && set.targetPercentage !== null
          ? ((maxMap.get(me.exerciseId) ?? 0) * set.targetPercentage) / 100
          : 0;
        tx.insert(setLogs)
          .values({
            id: nanoid(),
            workoutExerciseId: weId,
            index,
            reps: set.targetReps,
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
