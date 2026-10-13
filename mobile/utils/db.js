import * as SQLite from 'expo-sqlite';

let dbPromise;
let schemaPromise;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('app_offline.db').catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  const db = await dbPromise;
  if (!schemaPromise) {
    schemaPromise = db.execAsync(`
      CREATE TABLE IF NOT EXISTS items (
        mongo_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        is_synced INTEGER DEFAULT 0,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS offline_requests (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        headers TEXT NOT NULL,
        body TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS offline_requests_owner_created
        ON offline_requests (owner_id, created_at);

      CREATE TABLE IF NOT EXISTS response_cache (
        owner_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        body TEXT NOT NULL,
        status INTEGER NOT NULL,
        status_text TEXT NOT NULL,
        headers TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (owner_id, cache_key)
      );
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
  return db;
}

export async function initDB() {
  await getDB();
}