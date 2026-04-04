import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import { nanoid } from 'nanoid/non-secure';

import { getDb } from '@/db/client';
import {
  exercises,
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
  const template = getDb()
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId))
    .get();
  if (!template) return null;

  const tes = getDb()
    .select()
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .orderBy(asc(templateExercises.sortOrder))
    .all();

  const items: TemplateDetail['items'] = [];
  for (const te of tes) {
    const ex = getDb()
      .select()
      .from(exercises)
      .where(eq(exercises.id, te.exerciseId))
      .get();
    if (!ex) continue;
    const sets = getDb()
      .select()
      .from(templateSets)
      .where(eq(templateSets.templateExerciseId, te.id))
      .orderBy(asc(templateSets.index))
      .all();
    items.push({ templateExercise: te, exercise: ex, sets });
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
  const db = getDb();
  const existingTe = db
    .select({ id: templateExercises.id })
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .all();
  const teIds = existingTe.map((r) => r.id);
  if (teIds.length) {
    db.delete(templateSets).where(inArray(templateSets.templateExerciseId, teIds)).run();
    db.delete(templateExercises).where(eq(templateExercises.templateId, templateId)).run();
  }
  let order = 0;
  for (const block of structure) {
    const teId = nanoid();
    db.insert(templateExercises)
      .values({
        id: teId,
        templateId,
        exerciseId: block.exerciseId,
        sortOrder: order++,
      })
      .run();
    let setIdx = 0;
    for (const s of block.sets) {
      db.insert(templateSets)
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
  getDb()
    .insert(workouts)
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
    getDb()
      .insert(workoutExercises)
      .values({
        id: weId,
        workoutId,
        exerciseId: item.exercise.id,
        sortOrder: sort++,
      })
      .run();
    let idx = 0;
    for (const ts of item.sets) {
      getDb()
        .insert(setLogs)
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
  return getDb().select().from(workouts).where(eq(workouts.id, workoutId)).get()!;
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
  const workout = getDb()
    .select()
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .get();
  if (!workout) return null;

  const wes = getDb()
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.sortOrder))
    .all();

  const blocks: WorkoutDetail['blocks'] = [];
  for (const we of wes) {
    const ex = getDb()
      .select()
      .from(exercises)
      .where(eq(exercises.id, we.exerciseId))
      .get();
    if (!ex) continue;
    const sets = getDb()
      .select()
      .from(setLogs)
      .where(eq(setLogs.workoutExerciseId, we.id))
      .orderBy(asc(setLogs.index))
      .all();
    blocks.push({ workoutExercise: we, exercise: ex, sets });
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
  const db = getDb();
  db.delete(setLogs).where(eq(setLogs.workoutExerciseId, workoutExerciseId)).run();
  db.delete(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).run();
}

export function moveWorkoutExercise(workoutExerciseId: string, direction: -1 | 1) {
  const db = getDb();
  const we = db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId))
    .get();
  if (!we) return;
  const siblings = db
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
  db.update(workoutExercises)
    .set({ sortOrder: b.sortOrder })
    .where(eq(workoutExercises.id, a.id))
    .run();
  db.update(workoutExercises)
    .set({ sortOrder: a.sortOrder })
    .where(eq(workoutExercises.id, b.id))
    .run();
}

export function completeWorkout(workoutId: string) {
  getDb()
    .update(workouts)
    .set({ completedAt: nowIso() })
    .where(eq(workouts.id, workoutId))
    .run();
}

export function abandonWorkout(workoutId: string) {
  const db = getDb();
  const wes = db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .all();
  const weIds = wes.map((r) => r.id);
  if (weIds.length) {
    db.delete(setLogs).where(inArray(setLogs.workoutExerciseId, weIds)).run();
    db.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).run();
  }
  db.delete(workouts).where(eq(workouts.id, workoutId)).run();
}

/** Per completed workout: max volume for this exercise (sum reps*weight per session) */
export function getExerciseVolumeHistory(exerciseId: string, days = 365) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const completed = getDb()
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.completedAt), gte(workouts.completedAt, cutoffIso)))
    .all();
  const workoutIds = completed.map((w) => w.id);
  if (!workoutIds.length) return [];

  const wes = getDb()
    .select()
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        inArray(workoutExercises.workoutId, workoutIds),
      ),
    )
    .all();

  const byWorkout = new Map<string, number>();
  for (const we of wes) {
    const sets = getDb()
      .select()
      .from(setLogs)
      .where(eq(setLogs.workoutExerciseId, we.id))
      .all();
    let vol = 0;
    for (const s of sets) {
      vol += s.reps * s.weight;
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
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const completed = getDb()
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.completedAt), gte(workouts.completedAt, cutoffIso)))
    .all();
  const workoutIds = completed.map((w) => w.id);
  if (!workoutIds.length) return [];

  const wes = getDb()
    .select()
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        inArray(workoutExercises.workoutId, workoutIds),
      ),
    )
    .all();

  const maxByWorkout = new Map<string, number>();
  for (const we of wes) {
    const sets = getDb()
      .select()
      .from(setLogs)
      .where(eq(setLogs.workoutExerciseId, we.id))
      .all();
    const m = Math.max(0, ...sets.map((s) => s.weight));
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
