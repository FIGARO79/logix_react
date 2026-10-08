import { openDB } from 'idb';

const DB_NAME = 'LogixOfflineDB';
const DB_VERSION = 10;

let dbPromise = null;

const initDB = async () => {
    try {
        const db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                // Migración Versión 10: recrear grn_pending con keyPath 'id' para preservar múltiples líneas por SKU
                if (oldVersion < 10) {
                    if (db.objectStoreNames.contains('grn_pending')) {
                        db.deleteObjectStore('grn_pending');
                    }
                    const grnStore = db.createObjectStore('grn_pending', { keyPath: 'id' });
                    grnStore.createIndex('by_item', 'Item_Code');
                }

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
                    const grnStore = db.createObjectStore('grn_pending', { keyPath: 'id' });
                    grnStore.createIndex('by_item', 'Item_Code');
                }

                // Tabla para Xdock
                if (!db.objectStoreNames.contains('xdock_reservations')) {
                    db.createObjectStore('xdock_reservations', { keyPath: 'Item_Code' });
                }

                // --- Nuevas tablas Versión 3 ---
                if (!db.objectStoreNames.contains('planner_daily_items')) {
                    db.createObjectStore('planner_daily_items', { keyPath: 'id' }); // id será date_itemcode
                }

                // --- Nuevas tablas Versión 4 (Picking & Counts) ---
                if (!db.objectStoreNames.contains('picking_tracking')) {
                    db.createObjectStore('picking_tracking', { keyPath: 'order_number' });
                }
                if (!db.objectStoreNames.contains('picking_orders')) {
                    db.createObjectStore('picking_orders', { keyPath: 'id' }); // id será order_despatch
                }
                if (!db.objectStoreNames.contains('active_sessions')) {
                    db.createObjectStore('active_sessions', { keyPath: 'type' }); // type: 'cycle_count'
                }
            },
            blocked() {
                console.warn('Logix IDB: Actualización bloqueada. Cierre otras pestañas.');
            },
            blocking() {
                console.warn('Logix IDB: Conexión cerrándose para permitir upgrade en otra pestaña.');
                if (dbPromise) {
                    dbPromise.then(d => d.close()).catch(() => {});
                    dbPromise = null;
                }
            },
            terminated() {
                console.warn('Logix IDB: Conexión terminada inesperadamente.');
                dbPromise = null;
            }
        });

        // Cerrar conexión limpiamente ante cambios de versión
        db.onversionchange = () => {
            console.warn('Logix IDB: Nueva versión detectada, cerrando conexión...');
            db.close();
            dbPromise = null;
        };

        return db;
    } catch (err) {
        console.error('Logix IDB: Falló apertura de DB:', err);
        dbPromise = null;
        throw err;
    }
};

export const getDB = () => {
    if (!dbPromise) {
        dbPromise = initDB();
    }
    return dbPromise;
};

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

/**
 * Obtiene la cantidad esperada de GRN para un SKU e IR, basándose en las GRNs asociadas de po_lookup.
 */
export const getGRNExpectedQty = async (db, itemCode, importRef) => {
    if (!importRef || !itemCode) return 0;
    const normalizedIr = importRef.trim().toUpperCase();
    const normalizedCode = itemCode.trim().toUpperCase();

    try {
        // 1. Obtener órdenes y claves asociadas a la IR desde po_lookup
        const poInfo = await db.get('po_lookup', `ir_${normalizedIr}`);
        const irLineGrnKeys = new Set();
        const irLineKeys = new Set();
        const irGrnItemKeys = new Set();
        const irGrns = new Set();
        const irItemKeys = new Set();
        const irItemCodes = new Set();

        if (poInfo && poInfo.items) {
            poInfo.items.forEach(it => {
                const cRef = (it.customer_ref || it.Order_Number || '').toString().trim().toUpperCase();
                const line = (it.order_line || it.Order_Line || '').toString().trim().replace(/\.0$/, '');
                const code = (it.item_code || it.Item_Code || '').toString().trim().toUpperCase();
                const grnVal = (it.grn || it.GRN_Number || '').toString().trim().toUpperCase();

                if (code) irItemCodes.add(code);
                if (cRef && line && code) irLineKeys.add(`${cRef}_${line}_${code}`);
                if (cRef && code) irItemKeys.add(`${cRef}_${code}`);
                if (grnVal) {
                    grnVal.split(',').forEach(g => {
                        const gClean = g.trim().toUpperCase();
                        if (gClean) {
                            irGrns.add(gClean);
                            if (code) irGrnItemKeys.add(`${gClean}_${code}`);
                            if (cRef && line && code) irLineGrnKeys.add(`${cRef}_${line}_${code}_${gClean}`);
                        }
                    });
                }
            });
        }

        // 2. Consultar EXCLUSIVAMENTE en grn_pending (Reporte 280)
        let allGrns = [];
        try {
            const tx = db.transaction('grn_pending', 'readonly');
            const store = tx.objectStore('grn_pending');
            if (store.indexNames && store.indexNames.contains('by_item')) {
                allGrns = await store.index('by_item').getAll(normalizedCode) || [];
            } else {
                allGrns = await store.getAll() || [];
            }
        } catch {
            allGrns = await db.getAll('grn_pending') || [];
        }
        
        let expectedSum = 0;
        allGrns.forEach(g => {
            const code = (g.Item_Code || '').toString().trim().toUpperCase();
            if (code !== normalizedCode) return;

            const gIr = (g.Import_Reference || g.ir_map || '').toString().trim().toUpperCase();
            const gOrder = (g.Order_Number || '').toString().trim().toUpperCase();
            const gLine = (g.Order_Line || '').toString().trim().replace(/\.0$/, '');
            const gGrn = (g.GRN_Number || g.grn_number || '').toString().trim().toUpperCase();
            const qty = parseInt(g.Quantity || g.Quantity_Expected || g.total_expected || 0) || 0;

            let isMatch = false;
            if (gIr) {
                isMatch = (gIr === normalizedIr);
            } else if (gLine && gGrn && irLineGrnKeys.has(`${gOrder}_${gLine}_${code}_${gGrn}`)) {
                isMatch = true;
            } else if (gLine && irLineKeys.has(`${gOrder}_${gLine}_${code}`) && (!gGrn || irGrns.has(gGrn))) {
                isMatch = true;
            } else if (gGrn && irGrnItemKeys.has(`${gGrn}_${code}`)) {
                isMatch = true;
            } else if (gGrn && irGrns.has(gGrn) && irItemCodes.has(code)) {
                isMatch = true;
            } else if (!gLine && !gGrn && irItemKeys.has(`${gOrder}_${code}`)) {
                isMatch = true;
            }

            if (isMatch) {
                expectedSum += qty;
            }
        });

        return expectedSum;
    } catch (err) {
        console.error("Error in getGRNExpectedQty:", err);
        return 0;
    }
};

/**
 * Obtiene de forma masiva las cantidades esperadas del Reporte 280 para una lista de SKUs e IRs.
 * @param {object} db Instancia de IndexedDB
 * @param {Array<{itemCode: string, importRef: string}>} items Lista de ítems a consultar
 * @returns {Promise<Object>} Un mapa con claves "itemCode|importRef" y sus cantidades esperadas del 280.
 */
export const getGRNExpectedQtyBulk = async (db, items) => {
    if (!items || items.length === 0) return {};
    const resultMap = {};

    try {
        const uniqueIrs = new Set();
        items.forEach(item => {
            const ir = item.importRef || '';
            if (ir) {
                uniqueIrs.add(ir.trim().toUpperCase());
            }
        });

        // 1. Obtener po_lookup para las IR únicas
        const irPoMap = new Map();
        await Promise.all(Array.from(uniqueIrs).map(async ir => {
            try {
                const poInfo = await db.get('po_lookup', `ir_${ir}`);
                if (poInfo && poInfo.items) {
                    const irLineGrnKeys = new Set();
                    const irLineKeys = new Set();
                    const irGrnItemKeys = new Set();
                    const irGrns = new Set();
                    const irItemKeys = new Set();
                    const irItemCodes = new Set();

                    poInfo.items.forEach(it => {
                        const cRef = (it.customer_ref || it.Order_Number || '').toString().trim().toUpperCase();
                        const line = (it.order_line || it.Order_Line || '').toString().trim().replace(/\.0$/, '');
                        const code = (it.item_code || it.Item_Code || '').toString().trim().toUpperCase();
                        const grnVal = (it.grn || it.GRN_Number || '').toString().trim().toUpperCase();

                        if (code) irItemCodes.add(code);
                        if (cRef && line && code) irLineKeys.add(`${cRef}_${line}_${code}`);
                        if (cRef && code) irItemKeys.add(`${cRef}_${code}`);
                        if (grnVal) {
                            grnVal.split(',').forEach(g => {
                                const gClean = g.trim().toUpperCase();
                                if (gClean) {
                                    irGrns.add(gClean);
                                    if (code) irGrnItemKeys.add(`${gClean}_${code}`);
                                    if (cRef && line && code) irLineGrnKeys.add(`${cRef}_${line}_${code}_${gClean}`);
                                }
                            });
                        }
                    });
                    irPoMap.set(ir, { irLineGrnKeys, irLineKeys, irGrnItemKeys, irGrns, irItemKeys, irItemCodes });
                }
            } catch (e) {
                console.error(`Error al consultar po_lookup para IR ${ir}:`, e);
            }
        }));

        // 2. Obtener registros de grn_pending consultando el índice 'by_item' (O(K) en vez de O(N) masivo)
        const grnsByCode = new Map();
        try {
            const tx = db.transaction('grn_pending', 'readonly');
            const store = tx.objectStore('grn_pending');
            const hasIndex = store.indexNames && store.indexNames.contains('by_item');
            const uniqueCodes = Array.from(new Set(items.map(it => (it.itemCode || '').toString().trim().toUpperCase()).filter(Boolean)));
            
            if (hasIndex && uniqueCodes.length > 0) {
                const index = store.index('by_item');
                await Promise.all(uniqueCodes.map(async code => {
                    const rows = await index.getAll(code);
                    if (rows && rows.length > 0) {
                        grnsByCode.set(code, rows);
                    }
                }));
            } else {
                // Fallback si no tiene índice o no hay códigos
                const allGrns = await store.getAll() || [];
                allGrns.forEach(g => {
                    const code = (g.Item_Code || '').toString().trim().toUpperCase();
                    if (!code) return;
                    if (!grnsByCode.has(code)) {
                        grnsByCode.set(code, []);
                    }
                    grnsByCode.get(code).push(g);
                });
            }
        } catch (idxErr) {
            console.warn("Logix: Fallback en lectura indexada de grn_pending:", idxErr);
        }

        // 4. Calcular la cantidad esperada exclusivamente desde grn_pending para cada ítem
        items.forEach(item => {
            const importRef = (item.importRef || '').trim().toUpperCase();
            const itemCode = (item.itemCode || '').trim().toUpperCase();
            const key = `${item.itemCode}|${item.importRef}`;

            if (!importRef || !itemCode) {
                resultMap[key] = 0;
                return;
            }

            const poData = irPoMap.get(importRef);
            if (!poData) {
                resultMap[key] = 0;
                return;
            }

            const { irLineGrnKeys, irLineKeys, irGrnItemKeys, irGrns, irItemKeys, irItemCodes } = poData;
            const relevantGrns = grnsByCode.get(itemCode) || [];

            let sum = 0;
            relevantGrns.forEach(g => {
                const gIr = (g.Import_Reference || g.ir_map || '').toString().trim().toUpperCase();
                const gOrder = (g.Order_Number || '').toString().trim().toUpperCase();
                const gLine = (g.Order_Line || '').toString().trim().replace(/\.0$/, '');
                const gGrn = (g.GRN_Number || g.grn_number || '').toString().trim().toUpperCase();
                const qty = parseInt(g.Quantity || g.Quantity_Expected || g.total_expected || 0) || 0;

                let isMatch = false;
                if (gIr) {
                    isMatch = (gIr === importRef);
                } else if (gLine && gGrn && irLineGrnKeys.has(`${gOrder}_${gLine}_${itemCode}_${gGrn}`)) {
                    isMatch = true;
                } else if (gLine && irLineKeys.has(`${gOrder}_${gLine}_${itemCode}`) && (!gGrn || irGrns.has(gGrn))) {
                    isMatch = true;
                } else if (gGrn && irGrnItemKeys.has(`${gGrn}_${itemCode}`)) {
                    isMatch = true;
                } else if (gGrn && irGrns.has(gGrn) && irItemCodes.has(itemCode)) {
                    isMatch = true;
                } else if (!gLine && !gGrn && irItemKeys.has(`${gOrder}_${itemCode}`)) {
                    isMatch = true;
                }

                if (isMatch) {
                    sum += qty;
                }
            });

            resultMap[key] = sum;
        });

        return resultMap;
    } catch (err) {
        console.error("Error in getGRNExpectedQtyBulk:", err);
        return {};
    }
};
