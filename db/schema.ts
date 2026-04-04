import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const workoutTemplates = sqliteTable('workout_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const templateExercises = sqliteTable('template_exercises', {
  id: text('id').primaryKey(),
  templateId: text('template_id')
    .notNull()
    .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
});

export const templateSets = sqliteTable('template_sets', {
  id: text('id').primaryKey(),
  templateExerciseId: text('template_exercise_id')
    .notNull()
    .references(() => templateExercises.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  targetReps: integer('target_reps').notNull(),
  targetWeight: real('target_weight').notNull(),
});

export const workouts = sqliteTable('workouts', {
  id: text('id').primaryKey(),
  templateId: text('template_id').references(() => workoutTemplates.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
});

export const workoutExercises = sqliteTable('workout_exercises', {
  id: text('id').primaryKey(),
  workoutId: text('workout_id')
    .notNull()
    .references(() => workouts.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
});

export const setLogs = sqliteTable('set_logs', {
  id: text('id').primaryKey(),
  workoutExerciseId: text('workout_exercise_id')
    .notNull()
    .references(() => workoutExercises.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  reps: integer('reps').notNull(),
  weight: real('weight').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
});

export type Exercise = typeof exercises.$inferSelect;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type TemplateExercise = typeof templateExercises.$inferSelect;
export type TemplateSet = typeof templateSets.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
