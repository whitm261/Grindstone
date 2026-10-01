import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import { initDatabase, migrations, SCHEMA_VERSION } from '@/db/init';
import { migrationAdapter } from './helpers/db';

function legacyDatabase(version: number) {
  const sqlite = new Database(':memory:');
  const adapter = migrationAdapter(sqlite);
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations.filter((item) => item.version <= version)) {
    adapter.withTransactionSync(() => {
      migration.up(adapter);
      adapter.execSync(`PRAGMA user_version = ${migration.version}`);
    });
  }
  return sqlite;
}

function versionOf(sqlite: Database) {
  return (sqlite.query('PRAGMA user_version').get() as { user_version: number }).user_version;
}

describe('production database migrations', () => {
  test('fresh installs receive the complete schema, seed once, and reopen safely', () => {
    const sqlite = new Database(':memory:');
    const adapter = migrationAdapter(sqlite);
    initDatabase(adapter);
    expect(versionOf(sqlite)).toBe(SCHEMA_VERSION);
    const initialRows = sqlite.query('SELECT * FROM exercises ORDER BY id').all();
    expect(initialRows.length).toBeGreaterThan(0);
    expect(sqlite.query('SELECT * FROM workout_drafts').all()).toEqual([]);
    initDatabase(adapter);
    expect(sqlite.query('SELECT * FROM exercises ORDER BY id').all()).toEqual(initialRows);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    sqlite.close();
  });

  test.each([1, 2])('upgrades version %i without changing logged exercises or sets', (version) => {
    const sqlite = legacyDatabase(version);
    sqlite.exec(`
      INSERT INTO exercises VALUES ('ex', 'Squat', 'Keep these notes', '2026-01-01');
      INSERT INTO workouts (id, name, started_at, completed_at) VALUES ('workout', 'Legs', '2026-01-01', '2026-01-02');
      INSERT INTO workout_exercises VALUES ('block', 'workout', 'ex', 0);
      INSERT INTO set_logs VALUES ('set', 'block', 0, 5, 125.5, 1);
    `);
    initDatabase(migrationAdapter(sqlite), { seed: false });
    expect(versionOf(sqlite)).toBe(SCHEMA_VERSION);
    expect(sqlite.query('SELECT name, notes, archived_at FROM exercises').get()).toEqual({
      name: 'Squat', notes: 'Keep these notes', archived_at: null,
    });
    expect(sqlite.query('SELECT reps, weight, completed FROM set_logs').get()).toEqual({ reps: 5, weight: 125.5, completed: 1 });
    expect(sqlite.query('SELECT mesocycle_slot_id FROM workouts').get()).toEqual({ mesocycle_slot_id: null });
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    sqlite.close();
  });

  test('a failed version stamp rolls back the entire migration and can be retried', () => {
    const sqlite = legacyDatabase(2);
    const adapter = migrationAdapter(sqlite);
    const failingAdapter = {
      ...adapter,
      execSync: (sql: string) => {
        if (sql === 'PRAGMA user_version = 3') throw new Error('Simulated storage failure');
        adapter.execSync(sql);
      },
    };
    expect(() => initDatabase(failingAdapter, { seed: false })).toThrow('Simulated storage failure');
    expect(versionOf(sqlite)).toBe(2);
    const columns = sqlite.query('PRAGMA table_info(exercises)').all() as { name: string }[];
    expect(columns.some((column) => column.name === 'archived_at')).toBe(false);
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE name = 'workout_drafts'").get()).toBeNull();
    initDatabase(adapter, { seed: false });
    expect(versionOf(sqlite)).toBe(SCHEMA_VERSION);
    sqlite.close();
  });

  test('rejects future databases without downgrading their version', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => initDatabase(migrationAdapter(sqlite))).toThrow('newer than supported');
    expect(versionOf(sqlite)).toBe(SCHEMA_VERSION + 1);
    expect(sqlite.query('SELECT name FROM sqlite_master').all()).toEqual([]);
    sqlite.close();
  });

  test('drafts cascade with workouts and block slot/week identities are unique', () => {
    const sqlite = new Database(':memory:');
    initDatabase(migrationAdapter(sqlite), { seed: false });
    sqlite.exec(`
      INSERT INTO mesocycles (id, name, weeks, created_at) VALUES ('meso', 'Block', 2, '2026-01-01');
      INSERT INTO active_mesocycles (id, mesocycle_id, name, started_at) VALUES ('active', 'meso', 'Block', '2026-01-01');
      INSERT INTO workouts (id, name, started_at, active_mesocycle_id, mesocycle_slot_id, mesocycle_week)
        VALUES ('workout', 'Legs', '2026-01-01', 'active', 'slot', 1);
      INSERT INTO workout_drafts VALUES ('workout', '{"reps":"."}');
    `);
    expect(() => sqlite.query(`
      INSERT INTO workouts (id, name, started_at, active_mesocycle_id, mesocycle_slot_id, mesocycle_week)
        VALUES ('duplicate', 'Legs', '2026-01-01', 'active', 'slot', 1);
    `).run()).toThrow();
    sqlite.exec("DELETE FROM workouts WHERE id = 'workout'");
    expect(sqlite.query('SELECT * FROM workout_drafts').all()).toEqual([]);
    sqlite.close();
  });
});
