import React, { useState, useEffect, useCallback } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';
import { useOffline } from '../hooks/useOffline';
import { getDB, savePendingSync } from '../utils/offlineDb';

const CycleCounts = () => {
    const { setTitle } = useOutletContext();
    const { isOnline } = useOffline();

    useEffect(() => { setTitle("Inventario W2W"); }, [setTitle]);

    // Session State
    const [activeSession, setActiveSession] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);

    // Form State
    const [countedLocation, setCountedLocation] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [description, setDescription] = useState('');
    const [binSys, setBinSys] = useState('');
    const [countedQty, setCountedQty] = useState('');
    const [loadingItem, setLoadingItem] = useState(false);

    // Sidebar Data
    const [locationCounts, setLocationCounts] = useState([]);
    const [sessionLocations, setSessionLocations] = useState([]);

    // Scanner
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState(null); // 'location' or 'item'



    const checkActiveSession = useCallback(async () => {
        setCheckingSession(true);
        try {
            if (isOnline) {
                const res = await fetch('/api/sessions/active');
                if (res.ok) {
                    const session = await res.json();
                    setActiveSession(session);
                    // Guardar en caché
                    const db = await getDB();
                    await db.put('active_sessions', { type: 'cycle_count', ...session });
                } else {
                    setActiveSession(null);
                }
            } else {
                // Modo Offline: buscar en caché
                const db = await getDB();
                const cached = await db.get('active_sessions', 'cycle_count');
                if (cached) {
                    setActiveSession(cached);
                    toast.info("Cargada sesión activa de caché local");
                } else {
                    setActiveSession(null);
                }
            }
        } catch (e) {
            console.error(e);
            setActiveSession(null);
        } finally {
            setCheckingSession(false);
        }
    }, [isOnline]);

    const startSession = async () => {
        if (!isOnline) {
            toast.error("Debe estar online para iniciar una nueva sesión");
            return;
        }
        try {
            const res = await fetch('/api/sessions/start', { method: 'POST' });
            if (res.ok) {
                const session = await res.json();
                setActiveSession(session);
                const db = await getDB();
                await db.put('active_sessions', { type: 'cycle_count', ...session });
                toast.success("Sesión de inventario iniciada");
            } else {
                toast.error("Error iniciando sesión");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    const endSession = async () => {
        if (!activeSession) return;
        if (!confirm("¿Seguro que desea finalizar la sesión de inventario?")) return;

        if (!isOnline) {
            toast.error("Debe estar online para finalizar la sesión oficialmente");
            return;
        }

        try {
            const res = await fetch(`/api/sessions/${activeSession.id}/close`, { method: 'POST' });
            if (res.ok) {
                setActiveSession(null);
                const db = await getDB();
                await db.delete('active_sessions', 'cycle_count');
                clearForm();
                toast.success("Sesión finalizada");
            } else {
                toast.error("Error finalizando sesión");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    const updateSidebarData = useCallback(async () => {
        if (!activeSession) return;

        // Offline compatibility: solo fetch si estamos online
        if (isOnline) {
            // Fetch Session Locations
            try {
                const res = await fetch(`/api/sessions/${activeSession.id}/locations`);
                if (res.ok) setSessionLocations(await res.json());
            } catch (e) { console.error(e); }

            // Fetch Counts for Current Location
            if (countedLocation) {
                try {
                    const res = await fetch(`/api/sessions/${activeSession.id}/counts/${encodeURIComponent(countedLocation)}`);
                    if (res.ok) setLocationCounts(await res.json());
                } catch (e) { console.error(e); }
            } else {
                setLocationCounts([]);
            }
        } else {
            // En modo offline no mostramos historial actualizado de otras terminales, 
            // pero podríamos mostrar los pendientes locales que coincidan
            const db = await getDB();
            const allPending = await db.getAll('pending_sync');
            const localMatches = allPending
                .filter(p => p.collection === 'counts' && p.payload.counted_location === countedLocation)
                .map(p => ({
                    id: p.id,
                    item_code: p.payload.item_code,
                    counted_qty: p.payload.counted_qty,
                    is_pending: true
                }));
            setLocationCounts(localMatches);
        }
    }, [activeSession, isOnline, countedLocation]);

    // Check Active Session on Mount
    useEffect(() => {
        checkActiveSession();
    }, [checkActiveSession]);

    // Update Sidebar when Location or Session changes
    useEffect(() => {
        if (activeSession) {
            updateSidebarData();
        }
    }, [activeSession, countedLocation, updateSidebarData]);

    const fetchItemData = async (code) => {
        if (!code) return;
        setLoadingItem(true);
        setDescription('');
        setBinSys('');

        try {
            if (isOnline) {
                const res = await fetch(`/api/get_item_for_counting/${encodeURIComponent(code)}`);
                if (res.ok) {
                    const data = await res.json();
                    setItemCode(data.item_code);
                    setDescription(data.description);
                    setBinSys(data.bin_location || 'N/A');
                    document.getElementById('counted_qty')?.focus();
                } else {
                    toast.error("Item no encontrado");
                }
            } else {
                // Offline: buscar en maestro local
                const db = await getDB();
                const localItem = await db.get('master_items', code.trim().toUpperCase());
                if (localItem) {
                    setItemCode(localItem.Item_Code);
                    setDescription(localItem.Item_Description);
                    setBinSys(localItem.Bin_1 || 'N/A');
                    document.getElementById('counted_qty')?.focus();
                } else {
                    toast.error("Item no encontrado en maestro local");
                }
            }
        } catch (e) {
            toast.error("Error buscando item");
        } finally {
            setLoadingItem(false);
        }
    };

    const handleSaveCount = async (e) => {
        e.preventDefault();
        if (!activeSession || !countedLocation || !itemCode || countedQty === '') {
            toast.warning("Complete todos los campos obligatorios");
            return;
        }

        const payload = {
            session_id: activeSession.id,
            item_code: itemCode,
            counted_qty: parseInt(countedQty),
            counted_location: countedLocation,
            description: description,
            bin_location_system: binSys,
            timestamp: new Date().toISOString()
        };

        try {
            if (isOnline) {
                const res = await fetch('/api/save_count', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    if (typeof BroadcastChannel !== 'undefined') {
                        const bc = new BroadcastChannel('logix_events');
                        bc.postMessage({ type: 'CYCLE_COUNT_MUTATED' });
                        bc.close();
                    }
                    toast.success("Conteo guardado");
                    clearFormAfterSave();
                    return;
                }
            }

            // Guardar offline si falla o no hay conexión
            await savePendingSync('counts', payload);
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('logix_events');
                bc.postMessage({ type: 'CYCLE_COUNT_MUTATED' });
                bc.close();
            }
            toast.info("Guardado localmente (Offline)");
            clearFormAfterSave();

        } catch (e) {
            console.error(e);
            await savePendingSync('counts', payload);
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('logix_events');
                bc.postMessage({ type: 'CYCLE_COUNT_MUTATED' });
                bc.close();
            }
            toast.info("Guardado localmente (Offline)");
            clearFormAfterSave();
        }
    };

    const clearFormAfterSave = () => {
        setItemCode('');
        setDescription('');
        setBinSys('');
        setCountedQty('');
        updateSidebarData(); 
        document.getElementById('itemCode')?.focus();
    };

    const closeLocation = async () => {
        if (!activeSession || !countedLocation) return;
        if (!confirm(`¿Cerrar ubicación ${countedLocation}?`)) return;

        if (!isOnline) {
            toast.error("Debe estar online para cerrar ubicaciones");
            return;
        }

        try {
            const res = await fetch('/api/locations/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: activeSession.id, location_code: countedLocation })
            });
            if (res.ok) {
                toast.success(`Ubicación ${countedLocation} cerrada`);
                setCountedLocation('');
                clearForm();
                updateSidebarData();
            } else {
                toast.error("Error cerrando ubicación");
            }
        } catch (e) { toast.error("Error de conexión"); }
    };

    const deleteCount = async (id) => {
        if (!confirm("¿Eliminar este conteo?")) return;
        
        if (typeof id === 'string' && id.includes('-')) {
            // Es un registro pendiente en IndexedDB
            try {
                const db = await getDB();
                await db.delete('pending_sync', id);
                toast.success("Eliminado (Local)");
                updateSidebarData();
                return;
            } catch (e) { console.error(e); }
        }

        if (!isOnline) {
            toast.error("No se pueden eliminar registros del servidor en modo offline");
            return;
        }

        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Eliminado");
                updateSidebarData();
            }
        } catch (e) { toast.error("Error al eliminar"); }
    };

    const clearForm = () => {
        setItemCode('');
        setDescription('');
        setBinSys('');
        setCountedQty('');
    };

    // Scanner Logic
    const startScanner = (target) => {
        setScanTarget(target);
        setScannerOpen(true);
    };

    const handleScan = (code) => {
        setScannerOpen(false);
        const text = code.toUpperCase();
        if (scanTarget === 'location') {
            setCountedLocation(text);
        } else if (scanTarget === 'item') {
            setItemCode(text);
            fetchItemData(text);
        }
    };


    if (checkingSession) return <div className="p-8 text-center text-slate-500 uppercase tracking-widest text-xs">Cargando sesión...</div>;

    if (!activeSession) {
        return (
            <div className="container-wrapper max-w-lg mx-auto px-4 py-8 text-center bg-white rounded-xl shadow-lg border border-slate-100 mt-8">
                <h2 className="text-xl font-medium text-gray-900 text-gray-800 mb-2 uppercase tracking-tight">Inventario General (W2W)</h2>
                <p className="mb-6 text-slate-500 text-sm">Inicie una sesión para comenzar el conteo masivo wall-to-wall.</p>
                <button onClick={startSession} className="btn-sap btn-primary w-full py-4 font-medium text-gray-900 uppercase tracking-[0.2em] shadow-md active:scale-95 transition-all">
                    Iniciar Sesión de Inventario
                </button>
                {!isOnline && <p className="mt-4 text-red-500 text-[10px] font-medium text-gray-900 uppercase animate-pulse">Se requiere conexión para iniciar sesión</p>}
            </div>
        );
    }

    return (
        <div className="container-wrapper px-4 py-4">
            <ToastContainer position="top-right" autoClose={2000} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Main Form */}
                <div className="md:col-span-2 bg-white p-6 rounded-lg shadow border border-gray-200">
                    <div className="flex justify-between items-center mb-6 border-b pb-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-medium text-gray-900 text-gray-800 uppercase tracking-tight">Inventario W2W #S{activeSession.id}</h1>
                                {!isOnline && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200 font-medium text-gray-900">OFFLINE</span>}
                            </div>
                            <p className="text-[10px] text-gray-500 uppercase font-medium text-gray-900">Responsable: {activeSession.user_username || activeSession.username}</p>
                        </div>
                        <button onClick={endSession} className="btn-sap btn-secondary text-xs font-medium text-gray-900 uppercase">Finalizar Sesión</button>
                    </div>

                    <form onSubmit={handleSaveCount} className="space-y-4">
                        {/* Location */}
                        <div className="flex items-end gap-2">
                            <div className="flex-grow">
                                <label className="form-label text-[10px] font-medium text-gray-900 uppercase text-gray-600">Ubicación Física*</label>
                                <input
                                    type="text"
                                    value={countedLocation}
                                    onChange={e => setCountedLocation(e.target.value.toUpperCase())}
                                    className="uppercase font-medium text-gray-900 text-[#1e4a74] h-[40px]"
                                    placeholder="SCAN UBICACIÓN"
                                    required
                                />
                            </div>
                            <button type="button" onClick={() => startScanner('location')} className="btn-sap btn-secondary h-[40px] w-[40px] !p-0 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
                            </button>
                        </div>

                        {/* Item Logic */}
                        <div className="flex items-end gap-2">
                            <div className="flex-grow">
                                <label className="form-label text-[10px] font-medium text-gray-900 uppercase text-gray-600">Código de Artículo*</label>
                                <input
                                    id="itemCode"
                                    type="text"
                                    value={itemCode}
                                    onChange={e => setItemCode(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), fetchItemData(itemCode))}
                                    className="uppercase h-[40px]"
                                    placeholder="SCAN SKU"
                                    required
                                />
                            </div>
                            <button type="button" onClick={() => startScanner('item')} className="btn-sap btn-secondary h-[40px] w-[40px] !p-0 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
                            </button>
                            <button type="button" onClick={() => fetchItemData(itemCode)} className="btn-sap btn-secondary h-[40px] px-4 font-medium text-gray-900 text-[10px] uppercase">{loadingItem ? '...' : 'Buscar'}</button>
                        </div>

                        <div>
                            <label className="form-label text-[10px] font-medium text-gray-900 uppercase text-gray-600">Descripción Técnica</label>
                            <div className="data-field bg-gray-50 h-[40px] flex items-center px-3 border rounded text-xs font-medium text-gray-900 text-gray-700 uppercase">{description || '—'}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="form-label text-[10px] font-medium text-gray-900 uppercase text-gray-600">Ubic. Maestro</label>
                                <div className="data-field bg-gray-50 h-[40px] flex items-center px-3 border rounded text-xs font-medium text-gray-900 text-gray-700 uppercase">{binSys || '—'}</div>
                            </div>
                            <div>
                                <label className="form-label text-[10px] font-medium text-gray-900 uppercase text-gray-600">Cantidad Observada*</label>
                                <div className="flex items-center">
                                    <button type="button" onClick={() => setCountedQty(prev => Math.max(0, (parseInt(prev) || 0) - 1))} className="w-[40px] h-[40px] border bg-gray-100 font-medium text-gray-900">-</button>
                                    <input
                                        id="counted_qty"
                                        type="number"
                                        value={countedQty}
                                        onChange={e => setCountedQty(e.target.value)}
                                        className="text-center font-medium text-gray-900 text-lg h-[40px] flex-grow"
                                        min="0"
                                        required
                                    />
                                    <button type="button" onClick={() => setCountedQty(prev => (parseInt(prev) || 0) + 1)} className="w-[40px] h-[40px] border bg-gray-100 font-medium text-gray-900">+</button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <button type="button" onClick={clearForm} className="btn-sap btn-secondary h-[40px] px-6 text-[10px] font-medium text-gray-900 uppercase">Limpiar</button>
                            <button type="submit" className="btn-sap btn-primary h-[40px] px-8 text-[10px] font-medium text-gray-900 uppercase tracking-widest">Guardar Conteo</button>
                        </div>
                    </form>
                </div>

                {/* Sidebar Info */}
                <div className="md:col-span-1 space-y-4">
                    {/* Counts in Location */}
                    <div className="bg-white p-4 rounded shadow border border-gray-200">
                        <h3 className="font-medium text-gray-900 text-[10px] text-gray-700 mb-3 border-b-2 pb-1 uppercase tracking-wider">Items en {countedLocation || '...'}</h3>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {locationCounts.length === 0 ? <p className="text-[10px] text-gray-400 text-center py-4 uppercase font-medium text-gray-900 tracking-tighter">Sin registros en esta ubicación</p> :
                                locationCounts.map(c => (
                                    <div key={c.id} className={`flex justify-between items-center text-[11px] p-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 ${c.is_pending ? 'border-l-4 border-amber-400' : ''}`}>
                                        <span className="font-mono font-medium text-gray-900 text-[#1e4a74]">{c.item_code}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="font-medium text-gray-900 text-gray-900">{c.counted_qty}</span>
                                            <button onClick={() => deleteCount(c.id)} className="text-red-500 font-medium text-gray-900 hover:bg-red-50 px-2 rounded">×</button>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    {/* Session Locations */}
                    <div className="bg-white p-4 rounded shadow border border-gray-200">
                        <h3 className="font-medium text-gray-900 text-[10px] text-gray-700 mb-3 border-b-2 pb-1 uppercase tracking-wider">Historial de Ubicaciones</h3>
                        <div className="max-h-60 overflow-y-auto space-y-1 mb-3">
                            {sessionLocations.map(l => (
                                <div key={l.id} className="flex justify-between text-[10px] p-2 border-b border-gray-50 last:border-0">
                                    <span className="font-medium text-gray-900 uppercase">{l.location_code}</span>
                                    <span className={`font-medium text-gray-900 uppercase ${l.status === 'open' ? 'text-green-600' : 'text-red-600'}`}>
                                        {l.status === 'open' ? 'En proceso' : 'Cerrada'}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {countedLocation && (
                            <button onClick={closeLocation} disabled={!isOnline} className={`w-full text-[10px] font-medium text-gray-900 uppercase tracking-widest py-3 rounded ${isOnline ? 'btn-sap btn-primary' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                                {isOnline ? `Cerrar ${countedLocation}` : '(Cerrar requiere red)'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Scanner Modal */}
            {scannerOpen && (
                <ScannerModal
                    title={`Escanear ${scanTarget === 'location' ? 'Ubicación' : 'Item'}`}
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />
            )}
        </div>
    );
};

export default CycleCounts;
