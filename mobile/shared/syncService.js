// shared/syncService.js
import { getDB } from '../utils/db';

const API_URL = process.env.EXPO_PUBLIC_LOCAL_URL;

/* ---------------- READ ---------------- */

export async function getLocalItems() {
  const db = await getDB();
  const rows = await db.getAllAsync(
    'SELECT * FROM items ORDER BY updated_at DESC'
  );
  return rows.map((row) => JSON.parse(row.data));
}

export async function getLocalItemById(id) {
  const db = await getDB();
  const row = await db.getFirstAsync(
    'SELECT * FROM items WHERE mongo_id = ?',
    [id]
  );
  return row ? JSON.parse(row.data) : null;
}

/* ---------------- WRITE ---------------- */

export async function saveItem(itemData, isOnline) {
  const db = await getDB();
  const id =
    itemData._id ||
    `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const document = {
    ...itemData,
    _id: id,
    updatedAt: new Date().toISOString(),
  };

  // 1. Always save to SQLite first (source of truth while offline)
  await db.runAsync(
    `INSERT OR REPLACE INTO items (mongo_id, data, is_synced, updated_at)
     VALUES (?, ?, ?, ?)`,
    [id, JSON.stringify(document), isOnline ? 1 : 0, Date.now()]
  );

  // 2. Queue the mutation (INSERT or UPDATE depending on whether it's temp)
  const operation = id.startsWith('temp_') ? 'INSERT' : 'UPDATE';
  await queueMutation(id, operation, document);

  // 3. Try to sync immediately if online
  if (isOnline) {
    await processSyncQueue();
  }

  return document;
}

export async function deleteItem(id, isOnline) {
  const db = await getDB();

  await db.runAsync('DELETE FROM items WHERE mongo_id = ?', [id]);
  await queueMutation(id, 'DELETE', { _id: id });

  if (isOnline) {
    await processSyncQueue();
  }
}

/* ---------------- QUEUE ---------------- */

async function queueMutation(id, operation, payload) {
  const db = await getDB();

  // Prevent duplicate queue entries for the same record (last write wins)
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  await db.runAsync(
    `INSERT INTO sync_queue (id, operation, payload, created_at)
     VALUES (?, ?, ?, ?)`,
    [id, operation, JSON.stringify(payload), Date.now()]
  );
}

/* ---------------- SYNC ENGINE ---------------- */

export async function processSyncQueue() {
  const db = await getDB();
  const queue = await db.getAllAsync(
    'SELECT * FROM sync_queue ORDER BY created_at ASC'
  );

  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const payload = JSON.parse(item.payload);

      if (item.operation === 'INSERT') {
        const saved = await sendToMongoDB(
          '/api/dashboard/items',
          'POST',
          payload
        );

        // Replace temp id with real Mongo _id in local items table
        await db.runAsync(
          `UPDATE items SET mongo_id = ?, data = ?, is_synced = 1
           WHERE mongo_id = ?`,
          [saved._id, JSON.stringify(saved), item.id]
        );
      } else if (item.operation === 'UPDATE') {
        const saved = await sendToMongoDB(
          `/api/dashboard/items/${payload._id}`,
          'PUT',
          payload
        );

        await db.runAsync(
          `UPDATE items SET data = ?, is_synced = 1 WHERE mongo_id = ?`,
          [JSON.stringify(saved), item.id]
        );
      } else if (item.operation === 'DELETE') {
        await sendToMongoDB(
          `/api/dashboard/items/${payload._id}`,
          'DELETE'
        );
        // Local row already removed in deleteItem()
      }

      await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
      synced++;
    } catch (error) {
      console.warn('Sync failed for', item.id, error.message);
      failed++;
      // Stop on first failure to preserve order; will retry on next online tick
      break;
    }
  }

  return { synced, failed };
}

async function sendToMongoDB(path, method, payload) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  // DELETE has no body
  if (method === 'DELETE') return null;
  return res.json();
}

/* ---------------- PULL ---------------- */

export async function pullFromServer() {
  try {
    const res = await fetch(`${API_URL}/api/dashboard/items`);
    if (!res.ok) return;
    const serverItems = await res.json();

    const db = await getDB();

    // Don't overwrite items that still have pending local mutations
    const queued = await db.getAllAsync('SELECT id FROM sync_queue');
    const pendingIds = new Set(queued.map((r) => r.id));

    for (const item of serverItems) {
      if (pendingIds.has(item._id)) continue;

      await db.runAsync(
        `INSERT OR REPLACE INTO items (mongo_id, data, is_synced, updated_at)
         VALUES (?, ?, 1, ?)`,
        [item._id, JSON.stringify(item), Date.now()]
      );
    }
  } catch (e) {
    console.warn('Pull failed:', e.message);
  }
}