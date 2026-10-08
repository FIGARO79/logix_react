import { useState, useEffect, useCallback } from 'react';
import { getDB, getCachedData, cacheData, savePendingSync } from '../utils/offlineDb';
import { syncPendingData } from '../utils/syncManager';
import { toast } from 'react-toastify';

export const useOffline = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);

    const refreshPendingCount = useCallback(async () => {
        try {
            const db = await getDB();
            const count = await db.count('pending_sync');
            setPendingCount(count);
            return count;
        } catch (e) {
            console.error("Error al contar pendientes:", e);
            return 0;
        }
    }, []);

    const updateOnlineStatus = useCallback(async () => {
        const online = navigator.onLine;
        setIsOnline(online);
        if (online) {
            toast.info('Conexión restaurada. Sincronizando datos...');
            await syncPendingData();
            await refreshPendingCount();
        } else {
            toast.warning('Modo offline activado. Los datos se guardarán localmente.');
        }
    }, [refreshPendingCount]);

    useEffect(() => {
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        refreshPendingCount();

        // Intervalo para actualizar el contador y sincronizar si hay red y la pestaña está activa
        const interval = setInterval(async () => {
            if (document.hidden) return;
            const count = await refreshPendingCount();
            if (count > 0 && navigator.onLine) {
                await syncPendingData();
                await refreshPendingCount();
            }
        }, 15000);

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
            clearInterval(interval);
        };
    }, [updateOnlineStatus, refreshPendingCount]);

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
