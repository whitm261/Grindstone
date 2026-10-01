/** The synchronous SQLite operations shared by Expo and the Bun migration tests. */
export type MigrationDatabase = {
  execSync: (sql: string) => void;
  getFirstSync: <T>(sql: string) => T | null;
  withTransactionSync: (task: () => void) => void;
  runSync: (sql: string, params: (string | number | null)[]) => unknown;
};

type Migration = {
  version: number;
  up: (db: MigrationDatabase) => void;
};

export const migrations: readonly Migration[] = [
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
  {
    version: 3,
    up: (db) => {
      db.execSync(`
        ALTER TABLE exercises ADD COLUMN archived_at TEXT;
        ALTER TABLE active_mesocycles ADD COLUMN structure_snapshot TEXT;
        ALTER TABLE workouts ADD COLUMN mesocycle_slot_id TEXT;

        CREATE UNIQUE INDEX workouts_mesocycle_slot_week_unique
          ON workouts (active_mesocycle_id, mesocycle_slot_id, mesocycle_week);

        CREATE TABLE workout_drafts (
          workout_id TEXT PRIMARY KEY NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
          payload TEXT NOT NULL
        );
      `);
    },
  },
];

export const SCHEMA_VERSION = migrations[migrations.length - 1].version;

export function initDatabase(db: MigrationDatabase, options: { seed?: boolean } = {}): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(`Database version ${currentVersion} is newer than supported version ${SCHEMA_VERSION}. Update the app to open it.`);
  }

  db.execSync('PRAGMA journal_mode = WAL');
  db.execSync('PRAGMA foreign_keys = ON');

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
  }

  if (options.seed === false) return;
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
