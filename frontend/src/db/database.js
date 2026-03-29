import { openDB } from 'idb';

const DATABASE_NAME = 'LogixOfflineDB';
const DATABASE_VERSION = 2;

export const initDB = async () => {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      // Este upgrade ya se maneja en offlineDb.js, pero lo mantenemos por consistencia
      if (!db.objectStoreNames.contains('pending_sync')) {
        db.createObjectStore('pending_sync', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('data_cache')) {
        db.createObjectStore('data_cache', { keyPath: 'key' });
      }
    },
  });
};

export const savePendingSync = async (collection, data) => {
  const db = await initDB();
  const id = crypto.randomUUID();
  const record = {
    id,
    collection,
    data,
    timestamp: new Date().toISOString(),
  };
  await db.put('pending_sync', record);
  return id;
};

export const getPendingSync = async () => {
  const db = await initDB();
  return db.getAll('pending_sync');
};

export const deletePendingSync = async (id) => {
  const db = await initDB();
  await db.delete('pending_sync', id);
};

export const cacheData = async (key, data) => {
  const db = await initDB();
  await db.put('data_cache', { key, data, timestamp: new Date().toISOString() });
};

export const getCachedData = async (key) => {
  const db = await initDB();
  const result = await db.get('data_cache', key);
  return result ? result.data : null;
};
