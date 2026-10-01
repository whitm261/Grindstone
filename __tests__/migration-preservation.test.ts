import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { initDatabase, migrations } from '@/db/init';
import { migrationAdapter } from './helpers/db';

test('version 2 upgrade preserves templates, active blocks, maxes, and ambiguous legacy sessions', () => {
  const sqlite = new Database(':memory:');
  const adapter = migrationAdapter(sqlite);
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations.filter((item) => item.version <= 2)) {
    adapter.withTransactionSync(() => {
      migration.up(adapter);
      adapter.execSync(`PRAGMA user_version = ${migration.version}`);
    });
  }
  sqlite.exec(`
    INSERT INTO exercises VALUES ('ex', 'Bench', 'Keep notes', '2026-01-01');
    INSERT INTO workout_templates VALUES ('template', 'Push', 'Keep template', '2026-01-01');
    INSERT INTO template_exercises VALUES ('template-ex', 'template', 'ex', 0);
    INSERT INTO template_sets VALUES ('template-set', 'template-ex', 0, 5, 82.5);
    INSERT INTO mesocycles VALUES ('meso', 'Strength', 2, 'Keep block', '2026-01-01');
    INSERT INTO mesocycle_workouts VALUES ('slot', 'meso', 1, 'Push');
    INSERT INTO mesocycle_exercises VALUES ('meso-ex', 'slot', 'ex', 0, 1);
    INSERT INTO mesocycle_sets VALUES ('meso-set', 'meso-ex', 1, 0, 5, 82.5);
    INSERT INTO active_mesocycles VALUES ('active', 'meso', 'Strength', '2026-01-01', NULL);
    INSERT INTO active_mesocycle_maxes VALUES ('max', 'active', 'ex', 100);
    INSERT INTO workouts (id, template_id, active_mesocycle_id, mesocycle_week, name, started_at, completed_at)
      VALUES ('workout-a', 'template', 'active', 1, 'Push - W1', '2026-01-01', '2026-01-02');
    INSERT INTO workouts (id, template_id, active_mesocycle_id, mesocycle_week, name, started_at, completed_at)
      VALUES ('workout-b', 'template', 'active', 1, 'Push - W1', '2026-01-03', NULL);
    INSERT INTO workout_exercises VALUES ('logged-ex', 'workout-a', 'ex', 0);
    INSERT INTO set_logs VALUES ('logged-set', 'logged-ex', 0, 5, 82.5, 1);
  `);
  const tables = [
    'exercises', 'workout_templates', 'template_exercises', 'template_sets',
    'mesocycles', 'mesocycle_workouts', 'mesocycle_exercises', 'mesocycle_sets',
    'active_mesocycles', 'active_mesocycle_maxes', 'workouts', 'workout_exercises', 'set_logs',
  ];
  const before = new Map(tables.map((table) => [
    table, sqlite.query(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[],
  ]));

  initDatabase(adapter, { seed: false });

  for (const table of tables) {
    const originalRows = before.get(table)!;
    const upgradedRows = sqlite.query(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[];
    expect(upgradedRows).toHaveLength(originalRows.length);
    for (const [index, original] of originalRows.entries()) {
      expect(upgradedRows[index]).toMatchObject(original);
    }
  }
  // Legacy duplicates intentionally remain unassigned for safe, explicit adoption.
  expect(sqlite.query('SELECT mesocycle_slot_id FROM workouts').all()).toEqual([
    { mesocycle_slot_id: null }, { mesocycle_slot_id: null },
  ]);
  expect(sqlite.query('SELECT structure_snapshot FROM active_mesocycles').get()).toEqual({ structure_snapshot: null });
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  sqlite.close();
});
