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
  activeMesocycleId: text('active_mesocycle_id').references(() => activeMesocycles.id, {
    onDelete: 'set null',
  }),
  mesocycleWeek: integer('mesocycle_week'),
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

export const mesocycles = sqliteTable('mesocycles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  weeks: integer('weeks').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const mesocycleWorkouts = sqliteTable('mesocycle_workouts', {
  id: text('id').primaryKey(),
  mesocycleId: text('mesocycle_id')
    .notNull()
    .references(() => mesocycles.id, { onDelete: 'cascade' }),
  dayNumber: integer('day_number').notNull(),
  name: text('name').notNull(),
});

export const mesocycleExercises = sqliteTable('mesocycle_exercises', {
  id: text('id').primaryKey(),
  mesocycleWorkoutId: text('mesocycle_workout_id')
    .notNull()
    .references(() => mesocycleWorkouts.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  isFocus: integer('is_focus', { mode: 'boolean' }).notNull().default(false),
});

export const mesocycleSets = sqliteTable('mesocycle_sets', {
  id: text('id').primaryKey(),
  mesocycleExerciseId: text('mesocycle_exercise_id')
    .notNull()
    .references(() => mesocycleExercises.id, { onDelete: 'cascade' }),
  weekNumber: integer('week_number'), // null for accessories (applies to all weeks)
  index: integer('index').notNull(),
  targetReps: integer('target_reps').notNull(),
  targetPercentage: real('target_percentage'), // null for accessories
});

export const activeMesocycles = sqliteTable('active_mesocycles', {
  id: text('id').primaryKey(),
  mesocycleId: text('mesocycle_id')
    .notNull()
    .references(() => mesocycles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
});

export const activeMesocycleMaxes = sqliteTable('active_mesocycle_maxes', {
  id: text('id').primaryKey(),
  activeMesocycleId: text('active_mesocycle_id')
    .notNull()
    .references(() => activeMesocycles.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  weight: real('weight').notNull(),
});

export type Exercise = typeof exercises.$inferSelect;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type TemplateExercise = typeof templateExercises.$inferSelect;
export type TemplateSet = typeof templateSets.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type Mesocycle = typeof mesocycles.$inferSelect;
export type MesocycleWorkout = typeof mesocycleWorkouts.$inferSelect;
export type MesocycleExercise = typeof mesocycleExercises.$inferSelect;
export type MesocycleSet = typeof mesocycleSets.$inferSelect;
export type ActiveMesocycle = typeof activeMesocycles.$inferSelect;
export type ActiveMesocycleMax = typeof activeMesocycleMaxes.$inferSelect;
