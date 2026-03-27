import { getDB } from './offlineDb';

/**
 * Sincroniza los datos maestros (Items, GRN, XDock, PO Lookup) desde el servidor a IndexedDB.
 */
export const downloadMasterData = async () => {
    try {
        const res = await fetch('/api/sync/master_data');
        if (!res.ok) throw new Error('Error al descargar datos maestros');
        
        const data = await res.json();
        const db = await getDB();
        
        const tx = db.transaction(['master_items', 'grn_pending', 'xdock_reservations', 'po_lookup', 'sync_metadata'], 'readwrite');
        
        // Limpiar y cargar Master Items
        const itemStore = tx.objectStore('master_items');
        await itemStore.clear();
        for (const item of data.master_items) {
            if (item && item.Item_Code) {
                itemStore.put(item);
            }
        }
        
        // Cargar GRN Pending
        const grnStore = tx.objectStore('grn_pending');
        await grnStore.clear();
        for (const [code, qty] of Object.entries(data.grn_pending)) {
            if (code && code !== 'null' && code !== 'undefined') {
                grnStore.put({ Item_Code: code, total_expected: qty });
            }
        }
        
        // Cargar Xdock
        const xdockStore = tx.objectStore('xdock_reservations');
        await xdockStore.clear();
        for (const [code, qty] of Object.entries(data.xdock_reservations)) {
            if (code && code !== 'null' && code !== 'undefined') {
                xdockStore.put({ Item_Code: code, total: qty });
            }
        }
        
        // Cargar PO Lookup
        const poStore = tx.objectStore('po_lookup');
        await poStore.clear();
        console.log('Logix: Procesando PO Lookup...', Object.keys(data.po_lookup.wb_to_data || {}).length, 'de WB y', Object.keys(data.po_lookup.ir_to_data || {}).length, 'de IR');
        
        const poPromises = [];
        if (data.po_lookup.wb_to_data) {
            for (const [wb, info] of Object.entries(data.po_lookup.wb_to_data)) {
                if (!wb) continue;
                const normalizedWb = wb.trim().toUpperCase();
                poPromises.push(poStore.put({ 
                    id: `wb_${normalizedWb}`, 
                    type: 'wb', 
                    value: normalizedWb, 
                    import_ref: info.import_ref 
                }));
            }
        }
        if (data.po_lookup.ir_to_data) {
            for (const [ir, info] of Object.entries(data.po_lookup.ir_to_data)) {
                if (!ir) continue;
                const normalizedIr = ir.trim().toUpperCase();
                poPromises.push(poStore.put({ 
                    id: `ir_${normalizedIr}`, 
                    type: 'ir', 
                    value: normalizedIr, 
                    waybill: info.waybill 
                }));
            }
        }
        await Promise.all(poPromises);
        
        // Guardar timestamp de sincronización
        const metaStore = tx.objectStore('sync_metadata');
        await metaStore.put({ key: 'last_master_sync', value: Date.now() });
        
        await tx.done;
        console.log('✅ Sincronización de maestros completada.');
        return true;
    } catch (error) {
        console.error('❌ Error en downloadMasterData:', error);
        return false;
    }
};

/**
 * Sincroniza los registros de Inbound pendientes hacia el servidor.
 */
export const syncPendingInbound = async () => {
    if (!navigator.onLine) return;
    
    const db = await getDB();
    const allPending = await db.getAll('pending_sync');
    
    if (allPending.length === 0) return;
    
    console.log(`Logix: Intentando sincronizar ${allPending.length} registros pendientes...`);
    
    for (const record of allPending) {
        try {
            // El record ya tiene el formato que espera /api/add_log o /api/update_log
            const res = await fetch(record.editId ? `/api/update_log/${record.editId}` : '/api/add_log', {
                method: record.editId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(record.payload)
            });
            
            if (res.ok) {
                await db.delete('pending_sync', record.id);
                console.log(`Registro ${record.id} sincronizado.`);
            } else if (res.status === 409) {
                // Conflicto: borrar localmente y dejar que el servidor gane
                await db.delete('pending_sync', record.id);
            }
        } catch (error) {
            console.error(`Error de red al sincronizar ${record.id}:`, error);
            break; // Detener si hay fallo de red real
        }
    }
};

/**
 * Verifica si el maestro local está desactualizado comparando timestamps con el servidor.
 */
export const checkAndSyncIfNeeded = async () => {
    if (!navigator.onLine) return;
    
    try {
        const res = await fetch('/api/sync/status');
        if (!res.ok) return;
        const serverStatus = await res.json();
        
        const db = await getDB();
        const lastSyncMeta = await db.get('sync_metadata', 'last_master_sync_server');
        const lastLocalSync = lastSyncMeta ? lastSyncMeta.value : 0;
        
        // Si el MTIME del master items en el servidor es mayor que nuestra última sincronización
        if (serverStatus.master_items > lastLocalSync) {
            console.log('Logix: Maestro desactualizado. Sincronizando...');
            const success = await downloadMasterData();
            if (success) {
                const tx = db.transaction('sync_metadata', 'readwrite');
                await tx.objectStore('sync_metadata').put({ key: 'last_master_sync_server', value: serverStatus.master_items });
                await tx.done;
            }
        }
    } catch (e) {
        console.error('Error en checkAndSyncIfNeeded:', e);
    }
};
