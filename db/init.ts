import type { SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 1;

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
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
  index INTEGER NOT NULL,
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
  index INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight REAL NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
);
`;

export function initDatabase(db: SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const userVersion = row?.user_version ?? 0;
  if (userVersion === SCHEMA_VERSION) {
    return;
  }
  db.execSync(DDL);
  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
