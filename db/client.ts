import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';
import { initDatabase } from './init';

const DB_NAME = 'movingweight.db';

let _sqlite: SQLiteDatabase | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSQLite(): SQLiteDatabase {
  if (!_sqlite) {
    _sqlite = openDatabaseSync(DB_NAME);
    _sqlite.execSync('PRAGMA foreign_keys = ON;');
    initDatabase(_sqlite);
  }
  return _sqlite;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getSQLite(), { schema });
  }
  return _db;
}

/** For tests only — replaces the active Drizzle instance with a bun:sqlite-backed one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function _setTestDb(db: any): void {
  _db = db;
}
