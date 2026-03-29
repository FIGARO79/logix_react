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
