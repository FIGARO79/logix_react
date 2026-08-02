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
    const [validBins, setValidBins] = useState(new Set());

    // Sidebar Data
    const [locationCounts, setLocationCounts] = useState([]);
    const [sessionLocations, setSessionLocations] = useState([]);

    // Recount State for Mobile
    const [recountData, setRecountData] = useState(null);
    const [showRecountModal, setShowRecountModal] = useState(false);
    const [recountFilter, setRecountFilter] = useState('pending'); // 'pending' | 'all'

    // Scanner
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState(null); // 'location' or 'item'

    const fetchRecountList = useCallback(async () => {
        if (!isOnline) return;
        try {
            const res = await fetch('/api/recount_list/active');
            if (res.ok) {
                const data = await res.json();
                setRecountData(data);
            }
        } catch (e) {
            console.error("Error al cargar lista de reconteo:", e);
        }
    }, [isOnline]);

    const selectItemForRecount = (item) => {
        setItemCode(item.item_code);
        setDescription(item.description);
        setBinSys(item.bin_location || 'N/A');
        setCountedQty('');
        setShowRecountModal(false);
        toast.info(`Seleccionado ítem ${item.item_code} para reconteo`);
        setTimeout(() => {
            document.getElementById('counted_qty')?.focus();
        }, 100);
    };

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
            const sessionId = activeSession.id || activeSession.session_id;
            const res = await fetch(`/api/sessions/${sessionId}/close`, { method: 'POST' });
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

        if (isOnline) {
            const sessionId = activeSession.id || activeSession.session_id;
            try {
                const res = await fetch(`/api/sessions/${sessionId}/locations`);
                if (res.ok) setSessionLocations(await res.json());
            } catch (e) { console.error(e); }

            if (countedLocation) {
                try {
                    const res = await fetch(`/api/sessions/${sessionId}/counts/${encodeURIComponent(countedLocation)}`);
                    if (res.ok) setLocationCounts(await res.json());
                } catch (e) { console.error(e); }
            } else {
                setLocationCounts([]);
            }
            fetchRecountList();
        } else {
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
    }, [activeSession, isOnline, countedLocation, fetchRecountList]);

    useEffect(() => {
        checkActiveSession();
    }, [checkActiveSession]);

    useEffect(() => {
        if (activeSession) {
            updateSidebarData();
            fetchRecountList();
        }
    }, [activeSession, countedLocation, updateSidebarData, fetchRecountList]);

    const loadSlottingBins = async () => {
        let binsLoaded = false;
        if (isOnline) {
            try {
                const res = await fetch('/api/views/valid_bins', { credentials: 'include' });
                if (res.ok) {
                    const binsList = await res.json();
                    if (Array.isArray(binsList) && binsList.length > 0) {
                        const binsSet = new Set(binsList.map(b => b.toUpperCase()));
                        setValidBins(binsSet);
                        const db = await getDB();
                        await db.put('data_cache', { key: 'slotting_valid_bins', data: binsList, timestamp: new Date().toISOString() });
                        binsLoaded = true;
                    }
                }
            } catch (e) {
                console.warn("Error loading valid bins online:", e);
            }
        }

        if (!binsLoaded) {
            try {
                const db = await getDB();
                const cached = await db.get('data_cache', 'slotting_valid_bins');
                if (cached && Array.isArray(cached.data)) {
                    const binsSet = new Set(cached.data.map(b => b.toUpperCase()));
                    setValidBins(binsSet);
                }
            } catch (e) {
                console.error("Error loading cached bins:", e);
            }
        }
    };

    useEffect(() => {
        loadSlottingBins();
    }, [isOnline]);

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
                    if (!data.in_master) {
                        toast.info("Ítem no registrado en maestro (admitido para conteo W2W)");
                    }
                    document.getElementById('counted_qty')?.focus();
                } else {
                    toast.error("Error consultando ítem");
                }
            } else {
                // Offline: buscar en maestro local
                const db = await getDB();
                const localItem = await db.get('master_items', code.trim().toUpperCase());
                if (localItem) {
                    setItemCode(localItem.Item_Code);
                    setDescription(localItem.Item_Description);
                    setBinSys(localItem.Bin_1 || 'N/A');
                } else {
                    setItemCode(code.trim().toUpperCase());
                    setDescription('ITEM NO REGISTRADO EN MAESTRO');
                    setBinSys('N/A');
                    toast.info("Ítem no encontrado en maestro local (admitido para conteo W2W)");
                }
                document.getElementById('counted_qty')?.focus();
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

        const normalizedLocation = countedLocation.trim().toUpperCase();
        if (validBins.size > 0 && !validBins.has(normalizedLocation)) {
            toast.error(`La ubicación "${normalizedLocation}" no existe en el maestro de slotting.`);
            return;
        }

        const payload = {
            session_id: activeSession.id || activeSession.session_id,
            item_code: itemCode,
            counted_qty: parseInt(countedQty),
            counted_location: normalizedLocation,
            description: description,
            bin_location_system: binSys,
            timestamp: new Date().toISOString()
        };

        try {
            if (isOnline) {
                const res = await fetch('/api/w2w/save_count', {
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
                body: JSON.stringify({ session_id: activeSession.id || activeSession.session_id, location_code: countedLocation })
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


    if (checkingSession) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-black">
                <svg className="w-8 h-8 animate-spin text-black" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs font-normal uppercase tracking-widest text-black">Consultando sesión de inventario...</span>
            </div>
        );
    }

    if (!activeSession) {
        return (
            <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-xl shadow-md border border-slate-200 text-center text-black">
                <div className="w-14 h-14 bg-slate-100 text-black rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-inner">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                </div>
                <h2 className="text-base font-normal text-black uppercase tracking-tight mb-1">Inventario General (W2W)</h2>
                <p className="text-xs text-black mb-6 leading-relaxed">No hay ninguna sesión activa. Inicie una nueva sesión para comenzar la captura física wall-to-wall.</p>
                <button
                    onClick={startSession}
                    disabled={!isOnline}
                    className="w-full py-2.5 px-4 bg-black hover:bg-zinc-800 text-white text-xs font-normal uppercase tracking-wider rounded-lg shadow transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                    Iniciar Sesión de Inventario
                </button>
                {!isOnline && (
                    <p className="mt-3 text-red-600 text-[10px] uppercase font-normal tracking-wide animate-pulse">
                        ⚠️ Se requiere conexión a la red para iniciar sesión
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto px-2 py-1.5 font-sans text-[11px] text-black leading-tight">
            <ToastContainer position="top-right" autoClose={2000} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">

                {/* Main Form Panel */}
                <div className="lg:col-span-2 bg-white rounded shadow-sm border border-slate-200 p-2">
                    {/* Header */}
                    <div className="flex justify-between items-center pb-1.5 mb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-black text-white flex items-center justify-center font-normal text-[10px]">
                                W2W
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <h1 className="text-xs font-normal text-black uppercase tracking-tight">
                                        Sesión #{activeSession.id || activeSession.session_id}
                                    </h1>
                                    {!isOnline && (
                                        <span className="text-[8px] bg-red-50 text-red-600 px-1 py-0 rounded border border-red-200 font-normal uppercase">
                                            OFFLINE
                                        </span>
                                    )}
                                </div>
                                <p className="text-[9px] text-black uppercase font-normal">
                                    Auditor: <span className="text-black font-normal">{activeSession.user_username || activeSession.username}</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={endSession}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 rounded text-[10px] font-normal uppercase tracking-wider transition-colors cursor-pointer"
                        >
                            Finalizar Sesión
                        </button>
                    </div>

                    <form onSubmit={handleSaveCount} className="space-y-1.5">
                        {/* Banner de Reconteo Activo (Etapas >= 2) */}
                        {recountData && recountData.stage >= 2 && recountData.total > 0 && (
                            <div className="bg-amber-50 border border-amber-300 rounded p-1.5 flex flex-wrap justify-between items-center gap-1.5 shadow-xs text-black">
                                <div className="flex items-center gap-2">
                                    <span className="bg-black text-white text-[9px] font-normal px-1.5 py-0.5 rounded uppercase tracking-wider">
                                        RECONTEO ETAPA {recountData.stage} (R{recountData.stage - 1})
                                    </span>
                                    <span className="text-[11px] font-normal text-black">
                                        {recountData.recounted_count} / {recountData.total} Recontados ({recountData.pending_count} pendientes)
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowRecountModal(true)}
                                    className="bg-black hover:bg-zinc-800 text-white text-[9px] font-normal px-2 py-0.5 rounded uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
                                >
                                    📋 Lista de Reconteo ({recountData.pending_count})
                                </button>
                            </div>
                        )}

                        {/* Location Input Group */}
                        <div>
                            <label className="block text-[9px] uppercase tracking-wider font-normal text-black mb-0.5">
                                Ubicación Física <span className="text-red-600">*</span>
                            </label>
                            <div className="flex items-center gap-1">
                                <div className="relative flex-grow">
                                    <input
                                        type="text"
                                        value={countedLocation}
                                        onChange={e => setCountedLocation(e.target.value.toUpperCase())}
                                        className="w-full h-7 border border-slate-300 rounded px-2 text-xs font-normal text-black uppercase bg-white focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                                        placeholder="SCAN O DIGITE UBICACIÓN"
                                        required
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => startScanner('location')}
                                    title="Escanear QR / Barcode Ubicación"
                                    className="h-7 w-7 p-0.5 border border-black bg-white hover:bg-slate-100 text-black rounded flex items-center justify-center cursor-pointer shrink-0"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Item Code Input Group */}
                        <div>
                            <label className="block text-[9px] uppercase tracking-wider font-normal text-black mb-0.5">
                                Código de Artículo / SKU <span className="text-red-600">*</span>
                            </label>
                            <div className="flex items-center gap-1">
                                <input
                                    id="itemCode"
                                    type="text"
                                    value={itemCode}
                                    onChange={e => setItemCode(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), fetchItemData(itemCode))}
                                    className="flex-grow h-7 border border-slate-300 rounded px-2 text-xs font-normal text-black uppercase bg-white focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                                    placeholder="SCAN O DIGITE SKU"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => startScanner('item')}
                                    title="Escanear QR / Barcode SKU"
                                    className="h-7 w-7 p-0.5 border border-black bg-white hover:bg-slate-100 text-black rounded flex items-center justify-center cursor-pointer shrink-0"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fetchItemData(itemCode)}
                                    disabled={loadingItem}
                                    className="h-7 px-2.5 bg-black hover:bg-zinc-800 border border-black text-white text-[9px] font-normal uppercase tracking-wider rounded transition-colors shrink-0 cursor-pointer"
                                >
                                    {loadingItem ? '...' : 'Buscar'}
                                </button>
                            </div>
                        </div>

                        {/* Description Display Card */}
                        <div>
                            <label className="block text-[9px] uppercase tracking-wider font-normal text-black mb-0.5">
                                Descripción del Artículo
                            </label>
                            <div className="h-7 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-normal text-black flex items-center uppercase truncate">
                                {description || <span className="text-zinc-500 italic">No consultado</span>}
                            </div>
                        </div>

                        {/* Master Bin & Counted Qty */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[9px] uppercase tracking-wider font-normal text-black mb-0.5">
                                    Ubicación Maestro
                                </label>
                                <div className="h-7 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-normal text-black flex items-center uppercase">
                                    {binSys || '—'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[9px] uppercase tracking-wider font-normal text-black mb-0.5">
                                    Cantidad Observada <span className="text-red-600">*</span>
                                </label>
                                <div className="flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setCountedQty(prev => Math.max(0, (parseInt(prev) || 0) - 1))}
                                        className="h-7 w-7 border border-slate-300 bg-slate-100 hover:bg-slate-200 text-black font-normal text-sm rounded-l flex items-center justify-center cursor-pointer select-none p-0"
                                    >
                                        -
                                    </button>
                                    <input
                                        id="counted_qty"
                                        type="number"
                                        value={countedQty}
                                        onChange={e => setCountedQty(e.target.value)}
                                        className="h-7 flex-grow border-y border-slate-300 text-center font-mono text-xs font-normal text-black bg-white focus:outline-none focus:ring-1 focus:ring-black px-1"
                                        min="0"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setCountedQty(prev => (parseInt(prev) || 0) + 1)}
                                        className="h-7 w-7 border border-slate-300 bg-slate-100 hover:bg-slate-200 text-black font-normal text-sm rounded-r flex items-center justify-center cursor-pointer select-none p-0"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={clearForm}
                                className="h-7 px-3 border border-black bg-white hover:bg-slate-50 text-black text-[9px] font-normal uppercase tracking-wider rounded transition-colors cursor-pointer"
                            >
                                Limpiar
                            </button>
                            <button
                                type="submit"
                                className="h-7 px-5 bg-black hover:bg-zinc-800 text-white text-[9px] font-normal uppercase tracking-wider rounded shadow-xs transition-all cursor-pointer"
                            >
                                Guardar Conteo
                            </button>
                        </div>
                    </form>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-4">
                    {/* Counts in Current Location */}
                    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 text-black">
                        <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-100">
                            <h3 className="text-[10px] font-normal uppercase tracking-wider text-black">
                                Ítems en <span className="font-normal text-black">{countedLocation || '...'}</span>
                            </h3>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-black font-normal border border-slate-200">
                                {locationCounts.length}
                            </span>
                        </div>
                        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                            {locationCounts.length === 0 ? (
                                <p className="text-[10px] text-zinc-500 text-center py-6 italic font-normal">
                                    Sin registros en esta ubicación
                                </p>
                            ) : (
                                locationCounts.map((c, idx) => (
                                    <div
                                        key={c.id || `loc-count-${c.item_code}-${idx}`}
                                        className={`flex justify-between items-center text-[11px] py-1.5 px-1 hover:bg-slate-50 rounded transition-colors ${
                                            c.is_pending ? 'border-l-2 border-amber-400 pl-1.5' : ''
                                        }`}
                                    >
                                        <span className="font-mono font-normal text-black tracking-tight">{c.item_code}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-normal text-black">{c.counted_qty}</span>
                                            <button
                                                onClick={() => deleteCount(c.id)}
                                                title="Eliminar registro"
                                                className="text-black hover:text-red-600 font-normal px-1 text-xs transition-colors cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Session Locations History */}
                    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 text-black">
                        <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-100">
                            <h3 className="text-[10px] font-normal uppercase tracking-wider text-black">
                                Historial de Ubicaciones
                            </h3>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-black font-normal border border-slate-200">
                                {sessionLocations.length}
                            </span>
                        </div>
                        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 mb-3">
                            {sessionLocations.length === 0 ? (
                                <p className="text-[10px] text-zinc-500 text-center py-6 italic font-normal">
                                    No hay ubicaciones registradas
                                </p>
                            ) : (
                                sessionLocations.map((l, idx) => (
                                    <div
                                        key={l.id || l.location_code || `sess-loc-${idx}`}
                                        className="flex justify-between items-center text-[10px] py-1.5 px-1 hover:bg-slate-50 rounded"
                                    >
                                        <span className="font-normal uppercase text-black">{l.location_code}</span>
                                        <span
                                            className={`text-[9px] font-normal uppercase px-1.5 py-0.5 rounded border ${
                                                l.status === 'open'
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                    : 'bg-slate-100 text-black border-slate-200'
                                            }`}
                                        >
                                            {l.status === 'open' ? 'En proceso' : 'Cerrada'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                        {countedLocation && (
                            <button
                                onClick={closeLocation}
                                disabled={!isOnline}
                                className={`w-full py-1.5 text-[10px] font-normal uppercase tracking-wider rounded border transition-colors shadow-xs cursor-pointer ${
                                    isOnline
                                        ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                }`}
                            >
                                {isOnline ? `Cerrar Ubicación ${countedLocation}` : '(Cerrar requiere red)'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Scanner Modal */}
            {scannerOpen && (
                <ScannerModal
                    title={`Escanear ${scanTarget === 'location' ? 'Ubicación' : 'Código de Ítem'}`}
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />
            )}

            {/* Recount List Modal */}
            {showRecountModal && recountData && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 text-black">
                        {/* Modal Header */}
                        <div className="bg-black text-white px-4 py-3 flex justify-between items-center">
                            <div>
                                <h3 className="font-normal text-xs uppercase tracking-wider">
                                    Ítems a Recontar — Etapa {recountData.stage} (R{recountData.stage - 1})
                                </h3>
                                <p className="text-[10px] text-slate-200 font-normal">
                                    {recountData.recounted_count} de {recountData.total} recontados ({recountData.pending_count} pendientes)
                                </p>
                            </div>
                            <button
                                onClick={() => setShowRecountModal(false)}
                                className="text-white/80 hover:text-white text-lg font-normal px-2 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Filter Tabs */}
                        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 text-xs">
                            <button
                                onClick={() => setRecountFilter('pending')}
                                className={`px-3 py-1.5 border-b-2 font-normal uppercase tracking-wider text-[10px] transition-colors cursor-pointer ${
                                    recountFilter === 'pending'
                                        ? 'border-black text-black bg-white rounded-t'
                                        : 'border-transparent text-slate-600 hover:text-black'
                                }`}
                            >
                                Pendientes ({recountData.pending_count})
                            </button>
                            <button
                                onClick={() => setRecountFilter('all')}
                                className={`px-3 py-1.5 border-b-2 font-normal uppercase tracking-wider text-[10px] transition-colors cursor-pointer ${
                                    recountFilter === 'all'
                                        ? 'border-black text-black bg-white rounded-t'
                                        : 'border-transparent text-slate-600 hover:text-black'
                                }`}
                            >
                                Todos ({recountData.total})
                            </button>
                        </div>

                        {/* Items List */}
                        <div className="p-3 overflow-y-auto space-y-2 flex-grow">
                            {recountData.items
                                .filter(item => recountFilter === 'all' || !item.is_recounted)
                                .map((item, idx) => (
                                    <div
                                        key={item.item_code || `recount-item-${idx}`}
                                        className={`p-2.5 border rounded flex justify-between items-center transition-all ${
                                            item.is_recounted
                                                ? 'bg-slate-50 border-slate-200 opacity-80'
                                                : 'bg-white border-slate-300 hover:border-black shadow-2xs'
                                        }`}
                                    >
                                        <div className="flex-1 pr-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-normal text-xs text-black">
                                                    {item.item_code}
                                                </span>
                                                {item.is_recounted ? (
                                                    <span className="bg-emerald-50 text-emerald-800 text-[9px] font-normal px-2 py-0.5 rounded border border-emerald-300">
                                                        ✓ RECONTADO ({item.counted_qty_in_stage})
                                                    </span>
                                                ) : (
                                                    <span className="bg-amber-50 text-amber-800 text-[9px] font-normal px-2 py-0.5 rounded border border-amber-300">
                                                        PENDIENTE
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-black font-normal line-clamp-1 mt-0.5">
                                                {item.description}
                                            </p>
                                            <p className="text-[10px] text-slate-600 uppercase font-mono mt-0.5">
                                                Ubic. Sistema: <span className="font-normal text-black">{item.bin_location}</span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => selectItemForRecount(item)}
                                            className={`px-3 py-1 rounded text-[10px] font-normal uppercase tracking-wider transition-colors shadow-2xs cursor-pointer ${
                                                item.is_recounted
                                                    ? 'bg-slate-100 text-black hover:bg-slate-200'
                                                    : 'bg-black hover:bg-zinc-800 text-white'
                                            }`}
                                        >
                                            {item.is_recounted ? 'Editar' : 'Recontar ➔'}
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CycleCounts;
