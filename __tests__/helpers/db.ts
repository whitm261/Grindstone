import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { _setTestDb } from '@/db/client';
import { initDatabase, type MigrationDatabase } from '@/db/init';
import * as schema from '@/db/schema';

/** Run the actual production migrations against Bun's synchronous SQLite engine. */
export function migrationAdapter(sqlite: Database): MigrationDatabase {
  return {
    execSync: (sql) => sqlite.exec(sql),
    getFirstSync: <T>(sql: string) => sqlite.query(sql).get() as T | null,
    withTransactionSync: (task) => { sqlite.transaction(task)(); },
    runSync: (sql, params) => sqlite.query(sql).run(...params),
  };
}

/** Fresh, unseeded production schema injected as the active Drizzle instance. */
export function makeTestDb(): Database {
  const sqlite = new Database(':memory:');
  initDatabase(migrationAdapter(sqlite), { seed: false });
  _setTestDb(drizzle(sqlite, { schema }));
  return sqlite;
}
