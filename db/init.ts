import type { SQLiteDatabase } from 'expo-sqlite';

type Migration = {
  version: number;
  up: (db: SQLiteDatabase) => void;
};

const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS exercises (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workout_templates (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS template_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
          exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS template_sets (
          id TEXT PRIMARY KEY NOT NULL,
          template_exercise_id TEXT NOT NULL REFERENCES template_exercises(id) ON DELETE CASCADE,
          "index" INTEGER NOT NULL,
          target_reps INTEGER NOT NULL,
          target_weight REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workouts (
          id TEXT PRIMARY KEY NOT NULL,
          template_id TEXT REFERENCES workout_templates(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS workout_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
          exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS set_logs (
          id TEXT PRIMARY KEY NOT NULL,
          workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
          "index" INTEGER NOT NULL,
          reps INTEGER NOT NULL,
          weight REAL NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      db.execSync(`
        ALTER TABLE workouts ADD COLUMN active_mesocycle_id TEXT REFERENCES active_mesocycles(id) ON DELETE SET NULL;
        ALTER TABLE workouts ADD COLUMN mesocycle_week INTEGER;

        CREATE TABLE IF NOT EXISTS mesocycles (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          weeks INTEGER NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mesocycle_workouts (
          id TEXT PRIMARY KEY NOT NULL,
          mesocycle_id TEXT NOT NULL REFERENCES mesocycles(id) ON DELETE CASCADE,
          day_number INTEGER NOT NULL,
          name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mesocycle_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          mesocycle_workout_id TEXT NOT NULL REFERENCES mesocycle_workouts(id) ON DELETE CASCADE,
          exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL,
          is_focus INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS mesocycle_sets (
          id TEXT PRIMARY KEY NOT NULL,
          mesocycle_exercise_id TEXT NOT NULL REFERENCES mesocycle_exercises(id) ON DELETE CASCADE,
          week_number INTEGER,
          "index" INTEGER NOT NULL,
          target_reps INTEGER NOT NULL,
          target_percentage REAL
        );

        CREATE TABLE IF NOT EXISTS active_mesocycles (
          id TEXT PRIMARY KEY NOT NULL,
          mesocycle_id TEXT NOT NULL REFERENCES mesocycles(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS active_mesocycle_maxes (
          id TEXT PRIMARY KEY NOT NULL,
          active_mesocycle_id TEXT NOT NULL REFERENCES active_mesocycles(id) ON DELETE CASCADE,
          exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          weight REAL NOT NULL
        );
      `);
    },
  },
];

const SCHEMA_VERSION = migrations.length;

export function initDatabase(db: SQLiteDatabase): void {
  db.execSync('PRAGMA journal_mode = WAL');
  db.execSync('PRAGMA foreign_keys = ON');

  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.withTransactionSync(() => {
        migration.up(db);
      });
    }
  }

  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  // Pre-populate common exercises if the table is empty
  const exCount = db.getFirstSync<{ c: number }>('SELECT count(*) as c FROM exercises');
  if (exCount && exCount.c === 0) {
    const now = new Date().toISOString();
    const initialExercises = [
      ['Squat (Barbell)', 'Main compound for legs'],
      ['Bench Press (Barbell)', 'Main compound for chest'],
      ['Deadlift (Conventional)', 'Main compound for back and hamstrings'],
      ['Overhead Press (Barbell)', 'Main compound for shoulders'],
      ['Barbell Row', 'Compound for back'],
      ['Pull Up', 'Bodyweight compound for back'],
      ['Dip', 'Bodyweight compound for chest/triceps'],
      ['Lat Pulldown', 'Isolation/Machine for back'],
      ['Leg Press', 'Machine for legs'],
      ['Romanian Deadlift', 'Compound for hamstrings'],
      ['Incline Bench Press (Dumbbell)', 'Upper chest'],
      ['Bicep Curl (Dumbbell)', 'Isolation for biceps'],
      ['Tricep Pushdown (Cable)', 'Isolation for triceps'],
      ['Lateral Raise (Dumbbell)', 'Isolation for shoulders'],
    ];

    db.withTransactionSync(() => {
      for (const [name, notes] of initialExercises) {
        db.runSync(
          'INSERT INTO exercises (id, name, notes, created_at) VALUES (?, ?, ?, ?)',
          [Math.random().toString(36).substring(2, 11), name, notes, now]
        );
      }
    });
  }
}
