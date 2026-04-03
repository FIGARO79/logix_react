import { useState, useEffect } from 'react';
import { getDB, getCachedData, cacheData, savePendingSync } from '../utils/offlineDb';
import { toast } from 'react-toastify';

export const useOffline = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);

    const updateOnlineStatus = () => {
        const online = navigator.onLine;
        setIsOnline(online);
        if (online) {
            toast.info('Conexión restaurada. Sincronizando datos...');
            syncPendingData();
        } else {
            toast.warning('Modo offline activado. Los datos se guardarán localmente.');
        }
    };

    const syncPendingData = async () => {
        const db = await getDB();
        const pending = await db.getAll('pending_sync');
        
        if (pending.length === 0) {
            setPendingCount(0);
            return;
        }

        let successCount = 0;
        for (const record of pending) {
            try {
                const response = await fetch('/api/sync/offline-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(record)
                });

                if (response.ok) {
                    await db.delete('pending_sync', record.id);
                    successCount++;
                }
            } catch (error) {
                console.error('Error sincronizando registro:', record.id, error);
            }
        }

        const remaining = await db.count('pending_sync');
        setPendingCount(remaining);

        if (successCount > 0) {
            toast.success(`${successCount} registros sincronizados correctamente.`);
        }
    };

    const refreshPendingCount = async () => {
        const db = await getDB();
        const count = await db.count('pending_sync');
        setPendingCount(count);
    };

    useEffect(() => {
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        refreshPendingCount();

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);

    return {
        isOnline,
        pendingCount,
        saveOffline: savePendingSync,
        cacheData,
        getCachedData,
        refreshPendingCount,
        syncPendingData
    };
};
