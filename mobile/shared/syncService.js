// shared/syncService.js
import { getDB } from '../utils/db';

const API_URL = process.env.EXPO_PUBLIC_LOCAL_URL; 

// Fetch offline cached items from SQLite
export async function getLocalItems() {
  const db = await getDB();
  const rows = await db.getAllAsync('SELECT * FROM items ORDER BY updated_at DESC');
  return rows.map((row) => JSON.parse(row.data));
}

// Save or Update an Item locally and queue for sync if offline
export async function saveItem(itemData, isOnline) {
  const db = await getDB();
  const tempMongoId = itemData._id || `temp_${Date.now()}`;
  const document = { ...itemData, _id: tempMongoId };

  // 1. Save to SQLite immediately
  await db.runAsync(
    `INSERT OR REPLACE INTO items (mongo_id, data, is_synced, updated_at) VALUES (?, ?, ?, ?)`,
    [tempMongoId, JSON.stringify(document), isOnline ? 1 : 0, Date.now()]
  );

  // 2. Sync immediately if online, else push to queue
  if (isOnline) {
    try {
      await sendToMongoDB(document);
    } catch (err) {
      // If network fails midway, append to queue
      await queueMutation(tempMongoId, 'INSERT', document);
    }
  } else {
    await queueMutation(tempMongoId, 'INSERT', document);
  }
}

async function queueMutation(id, operation, payload) {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO sync_queue (id, operation, payload, created_at) VALUES (?, ?, ?, ?)`,
    [id, operation, JSON.stringify(payload), Date.now()]
  );
}

// Sync queue engine to send pending data back to MongoDB
export async function processSyncQueue() {
  const db = await getDB();
  const queue = await db.getAllAsync('SELECT * FROM sync_queue ORDER BY created_at ASC');

  if (queue.length === 0) return;

  for (const item of queue) {
    try {
      const payload = JSON.parse(item.payload);
      
      if (item.operation === 'INSERT') {
        const response = await sendToMongoDB(payload);
        const savedDoc = await response.json();

        // Update temp local record with real MongoDB _id
        await db.runAsync(
          `UPDATE items SET mongo_id = ?, data = ?, is_synced = 1 WHERE mongo_id = ?`,
          [savedDoc._id, JSON.stringify(savedDoc), item.id]
        );

        // Delete from queue upon success
        await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
      }
    } catch (error) {
      console.error('Failed to sync item to MongoDB:', error);
      break; // Halt queue to preserve mutation sequence
    }
  }
}

async function sendToMongoDB(payload) {
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}