import * as SQLite from 'expo-sqlite';

let db;

export async function getDB() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('app_offline.db');
  }
  return db;
}

export async function initDB() {
  const database = await getDB();

  await database.execAsync(`
    -- Local table mirroring MongoDB documents
    CREATE TABLE IF NOT EXISTS items (
      mongo_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      is_synced INTEGER DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    -- Queue for operations performed while offline
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}