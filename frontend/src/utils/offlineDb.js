import { openDB } from 'idb';

const DB_NAME = 'LogixOfflineDB';
const DB_VERSION = 2;

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            // Tabla para registros de Inbound que aún no se han subido
            if (!db.objectStoreNames.contains('pending_sync')) {
                db.createObjectStore('pending_sync', { keyPath: 'id' });
            }

            // Tabla para caché de datos de consulta genérica
            if (!db.objectStoreNames.contains('data_cache')) {
                db.createObjectStore('data_cache', { keyPath: 'key' });
            }

            // Tabla para el maestro de items (Caché local)
            if (!db.objectStoreNames.contains('master_items')) {
                const itemStore = db.createObjectStore('master_items', { keyPath: 'Item_Code' });
                itemStore.createIndex('by-description', 'Item_Description');
            }

            // Tabla para metadatos de sincronización
            if (!db.objectStoreNames.contains('sync_metadata')) {
                db.createObjectStore('sync_metadata', { keyPath: 'key' });
            }

            // Tabla para PO Lookup (Matches de Waybill / Import Ref)
            if (!db.objectStoreNames.contains('po_lookup')) {
                db.createObjectStore('po_lookup', { keyPath: 'id' });
            }

            // Tabla para GRN Pending
            if (!db.objectStoreNames.contains('grn_pending')) {
                db.createObjectStore('grn_pending', { keyPath: 'Item_Code' });
            }

            // Tabla para Xdock
            if (!db.objectStoreNames.contains('xdock_reservations')) {
                db.createObjectStore('xdock_reservations', { keyPath: 'Item_Code' });
            }
        },
    });
};

export const getDB = () => initDB();

/**
 * Guarda un registro pendiente en la cola de sincronización.
 * @param {string} collection Nombre de la colección (opcional para logs genéricos)
 * @param {object} payload Datos a sincronizar
 * @param {number|string} editId ID real en BD si es una edición
 */
export const savePendingSync = async (collection, payload, editId = null) => {
    const db = await getDB();
    // Generar UUID si no existe uno previo
    const id = (typeof editId === 'string' && editId.includes('-')) ? editId : crypto.randomUUID();
    const record = {
        id,
        collection,
        payload,
        editId: typeof editId === 'number' ? editId : null,
        timestamp: new Date().toISOString(),
    };
    await db.put('pending_sync', record);
    return id;
};

/**
 * Guarda datos en caché genérica.
 * @param {string} key Identificador de la caché
 * @param {any} data Datos a guardar
 */
export const cacheData = async (key, data) => {
    const db = await getDB();
    await db.put('data_cache', { key, data, timestamp: new Date().toISOString() });
};

/**
 * Recupera datos de la caché genérica.
 * @param {string} key Identificador de la caché
 */
export const getCachedData = async (key) => {
    const db = await getDB();
    const result = await db.get('data_cache', key);
    return result ? result.data : null;
};
