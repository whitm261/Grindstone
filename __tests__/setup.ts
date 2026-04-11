import { mock } from 'bun:test';

// expo-sqlite is a React Native native module — it can't load in Bun's runtime.
// drizzle-orm/expo-sqlite re-exports query.js which statically imports from it,
// so we stub both packages entirely. Tests inject a real bun:sqlite instance via
// _setTestDb() before any queries run, so these stubs are never actually invoked.

mock.module('expo-sqlite', () => ({
  openDatabaseSync: () => {
    throw new Error('expo-sqlite not available in tests — call makeTestDb() first');
  },
  addDatabaseChangeListener: () => ({ remove: () => {} }),
}));

mock.module('drizzle-orm/expo-sqlite', () => ({
  drizzle: () => {
    throw new Error('drizzle-orm/expo-sqlite not available in tests — use _setTestDb()');
  },
}));
