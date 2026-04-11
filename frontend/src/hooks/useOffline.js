import { useState, useEffect } from 'react';
import { getDB, getCachedData, cacheData, savePendingSync } from '../utils/offlineDb';
import { syncPendingData } from '../utils/syncManager';
import { toast } from 'react-toastify';

export const useOffline = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);

    const updateOnlineStatus = async () => {
        const online = navigator.onLine;
        setIsOnline(online);
        if (online) {
            toast.info('Conexión restaurada. Sincronizando datos...');
            await syncPendingData();
            await refreshPendingCount();
        } else {
            toast.warning('Modo offline activado. Los datos se guardarán localmente.');
        }
    };

    const refreshPendingCount = async () => {
        try {
            const db = await getDB();
            const count = await db.count('pending_sync');
            setPendingCount(count);
        } catch (e) {
            console.error("Error al contar pendientes:", e);
        }
    };

    useEffect(() => {
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        refreshPendingCount();

        // Intervalo para actualizar el contador de pendientes (por si se agrega algo)
        const interval = setInterval(refreshPendingCount, 3000);

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
            clearInterval(interval);
        };
    }, []);

    return {
        isOnline,
        pendingCount,
        saveOffline: savePendingSync,
        cacheData,
        getCachedData,
        refreshPendingCount,
        syncPendingData // Ahora es la función correcta de syncManager
    };
};
