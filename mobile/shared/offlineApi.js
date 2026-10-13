import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { getDB } from '../utils/db';

const API_URL = process.env.EXPO_PUBLIC_LOCAL_URL?.replace(/\/$/, '');
const QUEUE_CHANGED_EVENT = 'offline-queue-changed';

const isOnline = (state) =>
  Boolean(state.isConnected && state.isInternetReachable !== false);

const getOwnerId = async () => (await AsyncStorage.getItem('userId')) || '';
let syncPromise;

const toHeadersObject = (headers) => {
  const normalized = new Headers(headers);
  const result = {};
  normalized.forEach((value, key) => {
    if (key.toLowerCase() !== 'authorization') {
      result[key] = value;
    }
  });
  return result;
};

const createResponse = ({ body, status, statusText, headers }) => {
  const headerValues = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: headerValues,
    text: async () => body,
    json: async () => JSON.parse(body),
    clone() {
      return createResponse({ body, status, statusText, headers });
    },
  };
};

const createQueuedResponse = () =>
  createResponse({
    body: JSON.stringify({
      success: true,
      queued: true,
      message: 'Saved on this device and waiting to sync.',
    }),
    status: 202,
    statusText: 'Accepted',
    headers: {
      'Content-Type': 'application/json',
      'X-Offline-Queued': 'true',
    },
  });

const getCacheKey = (url) => url;

async function getCachedResponse(url, ownerId) {
  const db = await getDB();
  const row = await db.getFirstAsync(
    `SELECT body, status, status_text, headers
     FROM response_cache WHERE owner_id = ? AND cache_key = ?`,
    [ownerId, getCacheKey(url)],
  );
  if (!row) return null;

  return createResponse({
    body: row.body,
    status: row.status,
    statusText: row.status_text,
    headers: JSON.parse(row.headers),
  });
}

async function cacheResponse(url, ownerId, response) {
  if (!response.ok) return;

  const body = await response.clone().text();
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO response_cache
      (owner_id, cache_key, body, status, status_text, headers, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      getCacheKey(url),
      body,
      response.status,
      response.statusText || '',
      JSON.stringify(headers),
      Date.now(),
    ],
  );
}

async function enqueueRequest(url, method, init, ownerId) {
  if (!ownerId) {
    throw new Error('Sign in online before using offline changes.');
  }
  const pathname = url.slice(API_URL.length).split(/[?#]/, 1)[0];
  if (
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/usersAccessControlPage')
  ) {
    throw new Error('This account action requires an internet connection.');
  }
  if (!(await AsyncStorage.getItem('userToken'))) {
    throw new Error('Sign in online before using offline changes.');
  }
  if (typeof init.body !== 'string' && init.body != null) {
    throw new Error('This request cannot be saved for offline sync.');
  }

  const db = await getDB();
  const id = `request_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.runAsync(
    `INSERT INTO offline_requests
      (id, owner_id, method, url, headers, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      method,
      url,
      JSON.stringify(toHeadersObject(init.headers)),
      init.body ?? null,
      Date.now(),
    ],
  );
  DeviceEventEmitter.emit(QUEUE_CHANGED_EVENT);
  return createQueuedResponse();
}

export async function offlineFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  if (!API_URL || !url.startsWith(`${API_URL}/`)) {
    return globalThis.fetch(input, init);
  }

  const method = (init.method || input.method || 'GET').toUpperCase();
  const ownerId = await getOwnerId();
  const state = await NetInfo.fetch();

  if (method === 'GET') {
    if (!isOnline(state)) {
      const cached = await getCachedResponse(url, ownerId);
      if (cached) return cached;
      throw new Error('No saved copy is available while offline.');
    }

    let response;
    try {
      response = await globalThis.fetch(input, init);
    } catch (error) {
      const cached = await getCachedResponse(url, ownerId);
      if (cached) return cached;
      throw error;
    }
    try {
      await cacheResponse(url, ownerId, response);
    } catch (error) {
      console.error('Failed to cache API response:', error);
    }
    return response;
  }

  if (!isOnline(state)) {
    return enqueueRequest(url, method, init, ownerId);
  }

  try {
    return await globalThis.fetch(input, init);
  } catch (error) {
    console.warn('API request failed before receiving a response; queueing it:', error);
    return enqueueRequest(url, method, init, ownerId);
  }
}

export async function getPendingRequestCount() {
  const db = await getDB();
  const ownerId = await getOwnerId();
  const row = await db.getFirstAsync(
    'SELECT COUNT(*) AS count FROM offline_requests WHERE owner_id = ?',
    [ownerId],
  );
  return row?.count || 0;
}

export function processOfflineRequests() {
  if (syncPromise) return syncPromise;

  syncPromise = syncQueuedRequests().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function syncQueuedRequests() {
  const state = await NetInfo.fetch();
  if (!isOnline(state)) return { synced: 0, failed: 0 };

  const ownerId = await getOwnerId();
  const token = await AsyncStorage.getItem('userToken');
  if (!ownerId || !token) return { synced: 0, failed: 0 };

  const db = await getDB();
  const queue = await db.getAllAsync(
    `SELECT * FROM offline_requests
     WHERE owner_id = ? ORDER BY created_at ASC, rowid ASC`,
    [ownerId],
  );
  let synced = 0;
  let failed = 0;

  for (const request of queue) {
    try {
      const headers = {
        ...JSON.parse(request.headers),
        Authorization: `Bearer ${token}`,
      };
      const response = await globalThis.fetch(request.url, {
        method: request.method,
        headers,
        body: request.body ?? undefined,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await db.runAsync('DELETE FROM offline_requests WHERE id = ?', [
        request.id,
      ]);
      synced++;
    } catch (error) {
      console.warn('Offline sync failed for request', request.id, error);
      failed++;
      break;
    }
  }

  DeviceEventEmitter.emit(QUEUE_CHANGED_EVENT);
  return { synced, failed };
}

export const offlineQueueChangedEvent = QUEUE_CHANGED_EVENT;
