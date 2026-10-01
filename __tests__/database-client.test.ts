import { describe, expect, test } from 'bun:test';

/** Native-module mocks run in a subprocess so they cannot affect query tests. */
describe('database connection initialization', () => {
  test.each([false, true])('retries initialization after failure (cleanup throws: %s)', (cleanupThrows) => {
    const result = Bun.spawnSync([process.execPath, '-e', `
      import { mock } from 'bun:test';
      import { SCHEMA_VERSION } from './db/init';
      let opened = 0;
      let closed = 0;
      let initialized = 0;
      const failedConnection = {
        getFirstSync() { throw new Error('Migration failed'); },
        closeSync() {
          closed++;
          if (${cleanupThrows}) throw new Error('Cleanup failed');
        },
      };
      const goodConnection = {
        getFirstSync(sql) {
          if (sql === 'PRAGMA user_version') {
            initialized++;
            return { user_version: SCHEMA_VERSION };
          }
          return { c: 1 };
        },
        execSync() {},
      };
      mock.module('expo-sqlite', () => ({
        openDatabaseSync() { return ++opened === 1 ? failedConnection : goodConnection; },
      }));
      mock.module('drizzle-orm/expo-sqlite', () => ({ drizzle() {} }));
      const { getSQLite } = await import('./db/client');
      let firstError;
      try { getSQLite(); } catch (error) { firstError = error.message; }
      const retried = getSQLite();
      const cached = getSQLite();
      console.log(JSON.stringify({
        firstError, opened, closed, initialized,
        recovered: retried === goodConnection,
        cached: cached === retried,
      }));
    `], { cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe('');
    expect(JSON.parse(result.stdout.toString())).toEqual({
      firstError: 'Migration failed',
      opened: 2,
      closed: 1,
      initialized: 1,
      recovered: true,
      cached: true,
    });
  });
});
