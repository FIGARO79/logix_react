import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';
import { useOffline } from '../hooks/useOffline';
import { getDB, savePendingSync } from '../utils/offlineDb';
import { parseGS1Barcode } from '../utils/gs1Parser';
import Spinner from '../components/Spinner';
import '../styles/CycleCounts.css';

// Icono funcional de Código QR para escáner
const QrIcon = ({ size = 20, color = "#0078d4" }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px`, display: 'block', flexShrink: 0 }}
    >
        {/* Esquinas exteriores del QR */}
        <rect x="2.5" y="2.5" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill="none" />
        <rect x="5" y="5" width="2" height="2" fill={color} />
        <rect x="14.5" y="2.5" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill="none" />
        <rect x="17" y="5" width="2" height="2" fill={color} />
        <rect x="2.5" y="14.5" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill="none" />
        <rect x="5" y="17" width="2" height="2" fill={color} />
        {/* Bloques de datos y patrones */}
        <rect x="14.5" y="14.5" width="2.5" height="2.5" fill={color} />
        <rect x="19" y="14.5" width="2.5" height="2.5" fill={color} />
        <rect x="14.5" y="19" width="2.5" height="2.5" fill={color} />
        <rect x="19" y="19" width="2.5" height="2.5" fill={color} />
        <rect x="11" y="4" width="2" height="3" fill={color} />
        <rect x="11" y="11" width="2" height="2" fill={color} />
        <rect x="4" y="11" width="3" height="2" fill={color} />
    </svg>
);

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
    const countedQtyInputRef = useRef(null);

    // Sidebar Data
    const [locationCounts, setLocationCounts] = useState([]);
    const [sessionLocations, setSessionLocations] = useState([]);

    // Recount State for Mobile
    const [recountData, setRecountData] = useState(null);
    const [showRecountModal, setShowRecountModal] = useState(false);
    const [recountFilter, setRecountFilter] = useState('pending'); // 'pending' | 'all'
    const [selectedPhase, setSelectedPhase] = useState(null);
    const [recountSearchQuery, setRecountSearchQuery] = useState('');
    const [recountItemModal, setRecountItemModal] = useState(null);

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
        setRecountItemModal({
            item_code: item.item_code,
            description: item.description,
            bin_location: item.bin_location || 'N/A',
            counted_location: (item.bin_location && item.bin_location !== 'N/A') ? item.bin_location : (countedLocation || ''),
            counted_qty: ''
        });
    };

    const handleSaveRecountItem = async (e) => {
        e.preventDefault();
        if (!recountItemModal) return;
        const { item_code, counted_location, counted_qty } = recountItemModal;
        if (!counted_location || counted_qty === '') {
            toast.error("Complete la ubicación y la cantidad observada");
            return;
        }
        try {
            const payload = {
                session_id: activeSession.id || activeSession.session_id,
                counted_location: counted_location.toUpperCase(),
                item_code: item_code.toUpperCase(),
                counted_qty: parseFloat(counted_qty)
            };
            const res = await fetch('/api/counts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Error al guardar reconteo");
            }
            toast.success(`Reconteo guardado: ${item_code} = ${counted_qty}`);
            setRecountItemModal(null);
            fetchRecountList();
            updateSidebarData();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const checkActiveSession = useCallback(async () => {
        setCheckingSession(true);
        try {
            if (isOnline) {
                const res = await fetch('/api/sessions/active');
                if (res.ok) {
                    const session = await res.json();
                    if (session && (session.id || session.session_id)) {
                        setActiveSession(session);
                        // Guardar en caché
                        const db = await getDB();
                        await db.put('active_sessions', { type: 'cycle_count', ...session });
                    } else {
                        setActiveSession(null);
                        const db = await getDB();
                        await db.delete('active_sessions', 'cycle_count');
                    }
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

    const loadSlottingBins = useCallback(async () => {
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
    }, [isOnline]);

    useEffect(() => {
        loadSlottingBins();
    }, [loadSlottingBins]);

    const fetchItemData = async (codeToSearch) => {
        let code = codeToSearch || itemCode;
        if (!code) return;

        // Parsear código GS1 si aplica
        const gs1Result = parseGS1Barcode(code);
        if (gs1Result.isGS1 && gs1Result.itemCode) {
            code = gs1Result.itemCode;
            setItemCode(code);
            toast.info(`Código GS1 decodificado: SKU ${code}` + (gs1Result.lotNumber ? ` | Lote: ${gs1Result.lotNumber}` : ''));
        }

        setLoadingItem(true);
        setDescription('');
        setBinSys('');

        let success = false;

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
                    success = true;
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
                success = true;
            }
        } catch (e) {
            toast.error("Error buscando item");
        } finally {
            setLoadingItem(false);
            if (success) {
                setTimeout(() => {
                    if (countedQtyInputRef.current) {
                        countedQtyInputRef.current.focus();
                        countedQtyInputRef.current.select?.();
                    } else {
                        const el = document.getElementById('counted_qty');
                        el?.focus();
                        el?.select?.();
                    }
                }, 80);
            }
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

        const parsedQty = parseInt(countedQty, 10);
        if (isNaN(parsedQty)) {
            toast.error("Ingrese una cantidad entera válida");
            return;
        }

        const payload = {
            session_id: activeSession.id || activeSession.session_id,
            item_code: itemCode,
            counted_qty: parsedQty,
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
        } else if (scanTarget === 'recount-location') {
            setRecountItemModal(prev => prev ? ({ ...prev, counted_location: text }) : null);
        }
    };


    if (checkingSession) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#201f1e]">
                <Spinner size="lg" label="Consultando sesión de inventario..." />
            </div>
        );
    }

    if (!activeSession) {
        return (
            <div className="cycle-counts-page max-w-md mx-auto my-12 p-6 bg-white rounded-[4px] shadow-xs border border-[#d2d0ce] text-center text-[#201f1e]">
                <div className="inline-block px-3 py-1 bg-[#f3f2f1] text-[#0078d4] font-semibold text-xs rounded-[2px] mb-4 border border-[#d2d0ce] uppercase">
                    Wall-to-Wall
                </div>
                <h2 className="text-lg font-semibold text-[#201f1e] mb-2">Inventario General (W2W)</h2>
                <p className="text-sm text-[#605e5c] mb-6 leading-relaxed">
                    No hay ninguna sesión activa. Inicie una nueva sesión para comenzar la captura física en almacén.
                </p>
                <button
                    onClick={startSession}
                    disabled={!isOnline}
                    className="w-full h-10 py-2 px-4 bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] text-white text-sm font-semibold rounded-[2px] shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                    Iniciar Sesión de Inventario
                </button>
                {!isOnline && (
                    <div className="mt-4 p-2.5 bg-[#fde7e9] border border-[#f8b6be] text-[#a4262c] text-xs font-medium rounded-[2px]">
                        Se requiere conexión a la red para iniciar sesión
                    </div>
                )}
            </div>
        );
    }

    // PÁGINA INTERMEDIA: Selección de Fase de Conteo
    if (selectedPhase === null) {
        return (
            <div className="cycle-counts-page max-w-4xl mx-auto px-4 py-8 text-[#201f1e]">
                <ToastContainer position="top-right" autoClose={2000} />
                <div className="bg-white rounded-[4px] shadow-xs border border-[#d2d0ce] p-6 mb-6">
                    <div className="flex justify-between items-center pb-4 border-b border-[#d2d0ce] mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-[2px] bg-[#0078d4] text-white flex items-center justify-center font-semibold text-xs shadow-xs">
                                W2W
                            </div>
                            <div>
                                <h1 className="text-base font-semibold text-[#201f1e]">
                                    Sesión de Inventario #{activeSession.id || activeSession.session_id}
                                </h1>
                                <p className="text-xs text-[#605e5c] font-normal">
                                    Auditor: <span className="text-[#201f1e] font-medium">{activeSession.user_username || activeSession.username}</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={endSession}
                            className="px-3.5 py-1.5 bg-white hover:bg-[#f3f2f1] text-[#201f1e] border border-[#d2d0ce] rounded-[2px] text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                        >
                            Finalizar Sesión
                        </button>
                    </div>

                    <div className="text-center mb-8">
                        <h2 className="text-base font-semibold text-[#201f1e] mb-1">
                            Seleccione la Fase de Conteo a Ejecutar
                        </h2>
                        <p className="text-xs text-[#605e5c] font-normal">
                            Fase Activa en Sistema: <span className="font-semibold bg-[#dff6dd] text-[#107c10] px-2.5 py-0.5 rounded-[2px] border border-[#c8e6c9]">Fase 0{recountData?.stage || 1}</span>
                        </p>
                    </div>

                    <div className="space-y-3">
                        {[
                            {
                                s: 1,
                                title: 'FASE 1: CONTEO GENERAL W2W',
                                desc: 'Captura inicial física wall-to-wall de ítems en almacén con formulario limpio directo.',
                                btnText: 'Ingresar a Conteo Fase 1'
                            },
                            {
                                s: 2,
                                title: 'FASE 2: RECONTEO R1',
                                desc: 'Lista de ítems con discrepancia o faltantes de Fase 1 para verificación obligatoria.',
                                btnText: 'Ver Lista de Reconteo R1'
                            },
                            {
                                s: 3,
                                title: 'FASE 3: RECONTEO R2',
                                desc: 'Segunda validación técnica enfocada en discrepancias persistentes.',
                                btnText: 'Ver Lista de Reconteo R2'
                            },
                            {
                                s: 4,
                                title: 'FASE 4: AUDITORÍA FINAL',
                                desc: 'Revisión final de auditoría técnica previa a la consolidación e informe.',
                                btnText: 'Ver Lista Auditoría Final'
                            }
                        ].map(f => {
                            const currentSystemStage = recountData?.stage || 1;
                            const isSystemActive = currentSystemStage === f.s;
                            const isPassed = currentSystemStage > f.s;

                            return (
                                <div
                                    key={f.s}
                                    onClick={() => {
                                        if (isSystemActive) {
                                            setSelectedPhase(f.s);
                                        } else if (isPassed) {
                                            toast.warn(`La Fase ${f.s} ya ha sido finalizada y no permite nuevos registros.`);
                                        } else {
                                            toast.info(`La Fase ${f.s} estará disponible cuando el administrador avance la etapa.`);
                                        }
                                    }}
                                    className={`p-4 rounded-[4px] border text-left transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                                        isSystemActive
                                            ? 'border-[#0078d4] ring-1 ring-[#0078d4] bg-white shadow-xs cursor-pointer hover:bg-[#f9f9f9]'
                                            : isPassed
                                            ? 'border-[#d2d0ce] bg-[#f9f9f9] opacity-70 cursor-not-allowed'
                                            : 'border-[#edebe9] bg-[#fdfdfd] opacity-50 cursor-not-allowed'
                                    }`}
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-semibold text-[#201f1e]">
                                                {f.title}
                                            </h3>
                                            {isSystemActive ? (
                                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[2px] bg-[#dff6dd] text-[#107c10] border border-[#c8e6c9] uppercase shrink-0">
                                                    Activa en Sistema
                                                </span>
                                            ) : isPassed ? (
                                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[2px] bg-[#f3f2f1] text-[#605e5c] border border-[#d2d0ce] uppercase shrink-0">
                                                    Finalizada
                                                </span>
                                            ) : (
                                                <span className="text-[11px] font-medium px-2 py-0.5 rounded-[2px] bg-[#f3f2f1] text-[#a19f9d] border border-[#edebe9] uppercase shrink-0">
                                                    En Espera
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[#605e5c] font-normal leading-relaxed">
                                            {f.desc}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={!isSystemActive}
                                        className={`sm:w-48 py-2 px-4 text-xs font-semibold rounded-[2px] transition-colors shrink-0 ${
                                            isSystemActive
                                                ? 'bg-[#0078d4] text-white hover:bg-[#106ebe] shadow-xs cursor-pointer'
                                                : isPassed
                                                ? 'bg-[#f3f2f1] text-[#a19f9d] border border-[#d2d0ce] cursor-not-allowed'
                                                : 'bg-[#f3f2f1] text-[#a19f9d] border border-[#edebe9] cursor-not-allowed'
                                        }`}
                                    >
                                        {isSystemActive ? f.btnText : isPassed ? 'Fase Finalizada' : 'En Espera'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="cycle-counts-page max-w-[1600px] mx-auto px-3 py-2 text-sm leading-normal text-[#201f1e] font-sans">
            <ToastContainer position="top-right" autoClose={2000} />

            {/* Header de Navegación entre Fases */}
            <div className="mb-3 p-2.5 bg-[#f9f9f9] border border-[#d2d0ce] rounded-[2px] flex justify-between items-center shadow-2xs">
                <button
                    type="button"
                    onClick={() => setSelectedPhase(null)}
                    className="px-3.5 py-1.5 bg-white hover:bg-[#f3f2f1] text-[#201f1e] border border-[#d2d0ce] rounded-[2px] text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                    Cambiar de Fase
                </button>
                <div className="text-xs font-medium text-[#201f1e] flex items-center gap-2">
                    <span>Fase Actual: <strong className="font-bold text-[#0078d4]">0{selectedPhase}</strong></span>
                    {recountData?.stage === selectedPhase && (
                        <span className="bg-[#dff6dd] text-[#107c10] text-[11px] px-2.5 py-0.5 rounded-[2px] border border-[#c8e6c9] font-semibold">
                            ACTIVA EN SISTEMA
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

                {/* Main Form Panel */}
                <div className="lg:col-span-2 bg-white rounded-[4px] shadow-xs border border-[#d2d0ce] p-4">
                    {/* Header */}
                    <div className="flex justify-between items-center pb-2.5 mb-3 border-b border-[#d2d0ce]">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-[2px] bg-[#0078d4] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                W2W
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-base font-semibold text-[#201f1e]">
                                        Sesión #{activeSession.id || activeSession.session_id}
                                    </h1>
                                    {!isOnline && (
                                        <span className="text-[11px] bg-[#fde7e9] text-[#a4262c] px-2 py-0.5 rounded-[2px] border border-[#f8b6be] font-semibold uppercase">
                                            OFFLINE
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-[#605e5c] font-normal mt-0.5">
                                    Auditor: <span className="text-[#201f1e] font-semibold">{activeSession.user_username || activeSession.username}</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={endSession}
                            className="px-3.5 py-1.5 bg-white hover:bg-[#f3f2f1] text-[#201f1e] border border-[#d2d0ce] rounded-[2px] text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                        >
                            Finalizar Sesión
                        </button>
                    </div>

                    {/* VISTA FASE 1: Formulario Limpio de Captura W2W */}
                    {selectedPhase === 1 && (
                        <form onSubmit={handleSaveCount} className="space-y-3.5">
                            {/* Location Input Group */}
                            <div>
                                <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                    Ubicación Física <span className="text-red-600">*</span>
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <div className="relative flex-grow">
                                        <input
                                            type="text"
                                            value={countedLocation}
                                            onChange={e => setCountedLocation(e.target.value.toUpperCase())}
                                            className="w-full h-9 border border-[#d2d0ce] rounded-[2px] px-3 text-sm font-medium text-[#201f1e] uppercase bg-white focus:outline-none focus:ring-1 focus:ring-[#0078d4] focus:border-[#0078d4] placeholder:normal-case placeholder:text-[#a19f9d]"
                                            placeholder="Escanear o ingresar ubicación..."
                                            required
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => startScanner('location')}
                                        title="Escanear QR / Código de Ubicación"
                                        aria-label="Escanear QR Ubicación"
                                        className="h-9 w-9 border border-[#0078d4] bg-[#eff6fc] hover:bg-[#deecf9] rounded-[2px] flex items-center justify-center cursor-pointer shrink-0 shadow-2xs transition-colors"
                                        style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
                                    >
                                        <QrIcon size={20} color="#0078d4" />
                                    </button>
                                </div>
                            </div>

                            {/* Item Code Input Group */}
                            <div>
                                <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                    Código de Artículo / SKU <span className="text-red-600">*</span>
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        id="itemCode"
                                        type="text"
                                        value={itemCode}
                                        onChange={e => setItemCode(e.target.value.toUpperCase())}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                fetchItemData(e.target.value || itemCode);
                                            }
                                        }}
                                        className="flex-grow h-9 border border-[#d2d0ce] rounded-[2px] px-3 text-sm font-medium text-[#201f1e] uppercase bg-white focus:outline-none focus:ring-1 focus:ring-[#0078d4] focus:border-[#0078d4] placeholder:normal-case placeholder:text-[#a19f9d]"
                                        placeholder="Escanear o ingresar SKU..."
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => startScanner('item')}
                                        title="Escanear QR / Código de SKU"
                                        aria-label="Escanear QR SKU"
                                        className="h-9 w-9 border border-[#0078d4] bg-[#eff6fc] hover:bg-[#deecf9] rounded-[2px] flex items-center justify-center cursor-pointer shrink-0 shadow-2xs transition-colors"
                                        style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
                                    >
                                        <QrIcon size={20} color="#0078d4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => fetchItemData(itemCode)}
                                        disabled={loadingItem}
                                        className="h-9 px-4 bg-[#0078d4] hover:bg-[#106ebe] text-white text-xs font-semibold rounded-[2px] transition-colors shrink-0 cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                        {loadingItem ? '...' : 'Buscar'}
                                    </button>
                                </div>
                            </div>

                            {/* Description Display Card */}
                            <div>
                                <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                    Descripción del Artículo
                                </label>
                                <div className="min-h-[36px] h-9 px-3 bg-[#f9f9f9] border border-[#d2d0ce] rounded-[2px] text-xs font-medium text-[#201f1e] flex items-center uppercase truncate">
                                    {description || <span className="text-[#a19f9d] italic normal-case font-normal">Sin consulta previa</span>}
                                </div>
                            </div>

                            {/* Master Bin & Counted Qty */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                        Ubicación Maestro
                                    </label>
                                    <div className="h-9 px-3 bg-[#f9f9f9] border border-[#d2d0ce] rounded-[2px] text-xs font-semibold text-[#201f1e] flex items-center uppercase">
                                        {binSys || '—'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                        Cantidad Observada <span className="text-red-600">*</span>
                                    </label>
                                    <div className="flex items-center">
                                        <button
                                            type="button"
                                            onClick={() => setCountedQty(prev => Math.max(0, (parseInt(prev) || 0) - 1))}
                                            className="h-9 w-10 border border-[#d2d0ce] bg-white hover:bg-[#f3f2f1] text-[#201f1e] font-semibold text-lg rounded-l-[2px] flex items-center justify-center cursor-pointer select-none p-0 shadow-2xs"
                                        >
                                            -
                                        </button>
                                        <input
                                            ref={countedQtyInputRef}
                                            id="counted_qty"
                                            type="number"
                                            value={countedQty}
                                            onChange={e => setCountedQty(e.target.value)}
                                            className="h-9 flex-grow border-y border-[#d2d0ce] text-center text-sm font-semibold text-[#201f1e] bg-white focus:outline-none focus:ring-1 focus:ring-[#0078d4] px-2"
                                            min="0"
                                            step="1"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setCountedQty(prev => (parseInt(prev) || 0) + 1)}
                                            className="h-9 w-10 border border-[#d2d0ce] bg-white hover:bg-[#f3f2f1] text-[#201f1e] font-semibold text-lg rounded-r-[2px] flex items-center justify-center cursor-pointer select-none p-0 shadow-2xs"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#d2d0ce]">
                                <button
                                    type="button"
                                    onClick={clearForm}
                                    className="h-9 px-4 border border-[#d2d0ce] bg-white hover:bg-[#f3f2f1] text-[#201f1e] text-xs font-semibold rounded-[2px] transition-colors cursor-pointer shadow-2xs"
                                >
                                    Limpiar
                                </button>
                                <button
                                    type="submit"
                                    className="h-9 px-5 bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] text-white text-xs font-semibold rounded-[2px] shadow-xs transition-colors cursor-pointer"
                                >
                                    Guardar Conteo
                                </button>
                            </div>
                        </form>
                    )}

                    {/* VISTA FASES 2+: Lista de Reconteo Principal */}
                    {selectedPhase >= 2 && (
                        <div className="space-y-3">
                            <div className="bg-white border border-[#d2d0ce] rounded-[4px] p-3 text-[#201f1e] shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pb-2.5 mb-2.5 border-b border-[#d2d0ce]">
                                    <div>
                                        <h2 className="text-sm font-semibold text-[#201f1e]">
                                            Lista de Ítems a Recontar — Fase 0{selectedPhase}
                                        </h2>
                                        <p className="text-xs text-[#605e5c] font-normal mt-0.5">
                                            {recountData?.recounted_count || 0} de {recountData?.total || 0} recontados ({recountData?.pending_count || 0} pendientes)
                                        </p>
                                    </div>
                                    <div className="flex gap-1.5 items-center">
                                        <input
                                            type="text"
                                            placeholder="Buscar SKU o Ubicación..."
                                            value={recountSearchQuery}
                                            onChange={e => setRecountSearchQuery(e.target.value)}
                                            className="h-8 border border-[#d2d0ce] rounded-[2px] px-2.5 text-xs text-[#201f1e] bg-white focus:outline-none focus:ring-1 focus:ring-[#0078d4] focus:border-[#0078d4] placeholder:text-[#a19f9d]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setRecountFilter('pending')}
                                            className={`h-8 px-3 text-xs rounded-[2px] border transition-colors cursor-pointer ${
                                                recountFilter === 'pending'
                                                    ? 'bg-[#0078d4] border-[#0078d4] text-white font-semibold shadow-xs'
                                                    : 'bg-white border-[#d2d0ce] text-[#201f1e] hover:bg-[#f3f2f1]'
                                            }`}
                                        >
                                            Pendientes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRecountFilter('all')}
                                            className={`h-8 px-3 text-xs rounded-[2px] border transition-colors cursor-pointer ${
                                                recountFilter === 'all'
                                                    ? 'bg-[#0078d4] border-[#0078d4] text-white font-semibold shadow-xs'
                                                    : 'bg-white border-[#d2d0ce] text-[#201f1e] hover:bg-[#f3f2f1]'
                                            }`}
                                        >
                                            Todos
                                        </button>
                                    </div>
                                </div>

                                {/* Vista Adaptable: Tarjetas para Móvil y Tabla para Escritorio */}

                                {/* Vista Móvil (< sm) */}
                                <div className="block sm:hidden space-y-2 max-h-[500px] overflow-y-auto">
                                    {(!recountData?.items || recountData.items.length === 0) ? (
                                        <div className="text-center py-8 text-[#605e5c] text-xs italic font-normal bg-[#f9f9f9] rounded-[2px] border border-[#d2d0ce]">
                                            No hay ítems registrados en la lista de reconteo para esta fase.
                                        </div>
                                    ) : (
                                        recountData.items
                                            .filter(item => {
                                                const matchQuery =
                                                    item.item_code.toLowerCase().includes(recountSearchQuery.toLowerCase()) ||
                                                    (item.description && item.description.toLowerCase().includes(recountSearchQuery.toLowerCase())) ||
                                                    (item.bin_location && item.bin_location.toLowerCase().includes(recountSearchQuery.toLowerCase()));

                                                if (!matchQuery) return false;
                                                if (recountFilter === 'pending') return !item.is_recounted;
                                                return true;
                                            })
                                            .map((item, idx) => (
                                                <div
                                                    key={item.item_code || `mobile-recount-${idx}`}
                                                    className={`p-3 border rounded-[4px] flex flex-col gap-2 transition-colors ${
                                                        item.is_recounted
                                                            ? 'bg-[#f9f9f9] border-[#d2d0ce]'
                                                            : 'bg-white border-[#d2d0ce] shadow-2xs'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div>
                                                            <span className="text-sm text-[#201f1e] font-semibold block">
                                                                {item.item_code}
                                                            </span>
                                                            <p className="text-xs text-[#605e5c] font-normal line-clamp-2 mt-0.5">
                                                                {item.description}
                                                            </p>
                                                        </div>
                                                        {item.is_recounted ? (
                                                            <span className="bg-[#dff6dd] text-[#107c10] text-[11px] font-semibold px-2 py-0.5 rounded-[2px] border border-[#c8e6c9] shrink-0">
                                                                RECONTADO ({item.counted_qty_in_stage})
                                                            </span>
                                                        ) : (
                                                            <span className="bg-[#fff4ce] text-[#8a3707] text-[11px] font-semibold px-2 py-0.5 rounded-[2px] border border-[#fde398] shrink-0">
                                                                PENDIENTE
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex justify-between items-center pt-2 border-t border-[#d2d0ce] gap-2">
                                                        <div className="bg-[#f3f2f1] border border-[#d2d0ce] px-2.5 py-1 rounded-[2px] text-center shrink-0">
                                                            <span className="text-[11px] uppercase text-[#605e5c] block font-semibold">UBICACIÓN</span>
                                                            <span className="text-xs font-semibold text-[#201f1e] uppercase">{item.bin_location || '—'}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => selectItemForRecount(item)}
                                                            className={`px-3.5 py-1.5 rounded-[2px] text-xs font-semibold uppercase transition-colors shadow-2xs cursor-pointer ${
                                                                item.is_recounted
                                                                    ? 'bg-white hover:bg-[#f3f2f1] text-[#201f1e] border border-[#d2d0ce]'
                                                                    : 'bg-[#0078d4] hover:bg-[#106ebe] text-white shadow-xs'
                                                            }`}
                                                        >
                                                            {item.is_recounted ? 'Editar' : 'Recontar'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>

                                {/* Vista Escritorio / Tablet (>= sm) */}
                                <div className="hidden sm:block bg-white shadow-xs rounded-[4px] overflow-hidden border border-[#d2d0ce]">
                                    <div className="overflow-x-auto max-h-[500px]">
                                        <table className="w-full text-xs border-collapse min-w-[600px]">
                                            <thead className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce] sticky top-0 z-10 font-semibold text-xs">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-semibold">ITEM CODE</th>
                                                    <th className="px-3 py-2 text-left font-semibold">DESCRIPCIÓN</th>
                                                    <th className="px-3 py-2 text-center font-semibold">UBICACIÓN SISTEMA</th>
                                                    <th className="px-3 py-2 text-center font-semibold">ESTADO</th>
                                                    <th className="px-3 py-2 text-center font-semibold">ACCIÓN</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#d2d0ce]">
                                                {(!recountData?.items || recountData.items.length === 0) ? (
                                                    <tr>
                                                        <td colSpan="5" className="text-center py-8 text-[#605e5c] text-xs italic font-normal">
                                                            No hay ítems registrados en la lista de reconteo para esta fase.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    recountData.items
                                                        .filter(item => {
                                                            const matchQuery =
                                                                item.item_code.toLowerCase().includes(recountSearchQuery.toLowerCase()) ||
                                                                (item.description && item.description.toLowerCase().includes(recountSearchQuery.toLowerCase())) ||
                                                                (item.bin_location && item.bin_location.toLowerCase().includes(recountSearchQuery.toLowerCase()));

                                                            if (!matchQuery) return false;
                                                            if (recountFilter === 'pending') return !item.is_recounted;
                                                            return true;
                                                        })
                                                        .map((item, idx) => (
                                                            <tr
                                                                key={item.item_code || `main-recount-${idx}`}
                                                                className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#f9f9f9]'} hover:bg-[#f3f9fd] transition-colors`}
                                                            >
                                                                <td className="px-3 py-2 whitespace-nowrap text-xs text-[#201f1e] font-semibold">
                                                                    {item.item_code}
                                                                </td>
                                                                <td className="px-3 py-2 text-xs text-[#201f1e] font-normal truncate max-w-md" title={item.description}>
                                                                    {item.description}
                                                                </td>
                                                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                                                    <span className="inline-block bg-[#f3f2f1] border border-[#d2d0ce] px-2.5 py-0.5 rounded-[2px] text-xs font-semibold text-[#201f1e] uppercase">
                                                                        {item.bin_location || '—'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                                                    {item.is_recounted ? (
                                                                        <span className="bg-[#dff6dd] text-[#107c10] text-[11px] font-semibold px-2.5 py-0.5 rounded-[2px] border border-[#c8e6c9]">
                                                                            RECONTADO ({item.counted_qty_in_stage})
                                                                        </span>
                                                                    ) : (
                                                                        <span className="bg-[#fff4ce] text-[#8a3707] text-[11px] font-semibold px-2.5 py-0.5 rounded-[2px] border border-[#fde398]">
                                                                            PENDIENTE
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => selectItemForRecount(item)}
                                                                        className={`px-3 py-1 rounded-[2px] text-xs font-semibold uppercase transition-colors shadow-2xs cursor-pointer ${
                                                                            item.is_recounted
                                                                                ? 'bg-white hover:bg-[#f3f2f1] text-[#201f1e] border border-[#d2d0ce]'
                                                                                : 'bg-[#0078d4] hover:bg-[#106ebe] text-white shadow-xs'
                                                                        }`}
                                                                    >
                                                                        {item.is_recounted ? 'Editar' : 'Recontar'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar Info */}
                <div className="space-y-3">
                    {/* Indicador de Avance de Reconteo por Usuario y Zona Asignada */}
                    {selectedPhase >= 2 && recountData && (
                        <div className="bg-white rounded-[4px] shadow-xs border border-[#d2d0ce] p-3 text-[#201f1e]">
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <h3 className="text-xs font-semibold uppercase text-[#201f1e]">
                                        Avance de Reconteo por Zona
                                    </h3>
                                    <p className="text-xs text-[#605e5c] font-normal mt-0.5">
                                        Auditor: <span className="text-[#201f1e] font-medium uppercase">{activeSession?.user_username || activeSession?.username || 'AUDITOR'}</span>
                                    </p>
                                </div>
                                <span className="text-xs font-semibold px-2 py-0.5 bg-[#0078d4] text-white rounded-[2px] shadow-2xs">
                                    {(recountData.total || 0) > 0 ? Math.round(((recountData.recounted_count || 0) / recountData.total) * 100) : 0}%
                                </span>
                            </div>

                            {/* Barra de Progreso Visual */}
                            <div className="w-full bg-[#f3f2f1] h-2 rounded-full overflow-hidden border border-[#d2d0ce] mb-2.5">
                                <div
                                    className="bg-[#0078d4] h-full rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${(recountData.total || 0) > 0 ? Math.round(((recountData.recounted_count || 0) / recountData.total) * 100) : 0}%` }}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 text-center text-xs pt-2 border-t border-[#d2d0ce]">
                                <div className="bg-[#f9f9f9] p-1.5 rounded-[2px] border border-[#d2d0ce]">
                                    <span className="text-[#605e5c] font-semibold block text-[11px] uppercase">Recontados</span>
                                    <span className="text-[#107c10] text-sm font-semibold">{recountData.recounted_count || 0}</span>
                                </div>
                                <div className="bg-[#f9f9f9] p-1.5 rounded-[2px] border border-[#d2d0ce]">
                                    <span className="text-[#605e5c] font-semibold block text-[11px] uppercase">Pendientes</span>
                                    <span className="text-[#8a3707] text-sm font-semibold">{recountData.pending_count || 0}</span>
                                </div>
                                <div className="bg-[#f9f9f9] p-1.5 rounded-[2px] border border-[#d2d0ce]">
                                    <span className="text-[#605e5c] font-semibold block text-[11px] uppercase">Total Zona</span>
                                    <span className="text-[#201f1e] text-sm font-semibold">{recountData.total || 0}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Counts in Current Location */}
                    <div className="bg-white rounded-[4px] shadow-xs border border-[#d2d0ce] p-3 text-[#201f1e]">
                        <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-[#d2d0ce]">
                            <h3 className="text-xs font-semibold uppercase text-[#201f1e]">
                                Ítems en <span className="font-semibold text-[#0078d4]">{countedLocation || '...'}</span>
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-[2px] bg-[#f3f2f1] text-[#201f1e] font-semibold border border-[#d2d0ce]">
                                {locationCounts.length}
                            </span>
                        </div>
                        <div className="max-h-56 overflow-y-auto divide-y divide-[#d2d0ce]">
                            {locationCounts.length === 0 ? (
                                <p className="text-xs text-[#a19f9d] text-center py-6 italic font-normal">
                                    Sin registros en esta ubicación
                                </p>
                            ) : (
                                locationCounts.map((c, idx) => (
                                    <div
                                        key={c.id || `loc-count-${c.item_code}-${idx}`}
                                        className={`flex justify-between items-center text-xs py-2 px-1.5 hover:bg-[#f3f9fd] rounded-[2px] transition-colors ${
                                            c.is_pending ? 'border-l-2 border-[#ffaa44] pl-2' : ''
                                        }`}
                                    >
                                        <span className="font-medium text-[#201f1e]">{c.item_code}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-[#201f1e]">{c.counted_qty}</span>
                                            <button
                                                onClick={() => deleteCount(c.id)}
                                                title="Eliminar registro"
                                                className="text-[#605e5c] hover:text-[#a4262c] font-normal px-1.5 text-sm transition-colors cursor-pointer"
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
                    <div className="bg-white rounded-[4px] shadow-xs border border-[#d2d0ce] p-3 text-[#201f1e]">
                        <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-[#d2d0ce]">
                            <h3 className="text-xs font-semibold uppercase text-[#201f1e]">
                                Historial de Ubicaciones
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-[2px] bg-[#f3f2f1] text-[#201f1e] font-semibold border border-[#d2d0ce]">
                                {sessionLocations.length}
                            </span>
                        </div>
                        <div className="max-h-56 overflow-y-auto divide-y divide-[#d2d0ce] mb-3">
                            {sessionLocations.length === 0 ? (
                                <p className="text-xs text-[#a19f9d] text-center py-6 italic font-normal">
                                    No hay ubicaciones registradas
                                </p>
                            ) : (
                                sessionLocations.map((l, idx) => (
                                    <div
                                        key={l.id || l.location_code || `sess-loc-${idx}`}
                                        className="flex justify-between items-center text-xs py-2 px-1.5 hover:bg-[#f3f9fd] rounded-[2px] transition-colors"
                                    >
                                        <span className="font-semibold uppercase text-[#201f1e]">{l.location_code}</span>
                                        <span
                                            className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-[2px] border ${
                                                l.status === 'open'
                                                    ? 'bg-[#dff6dd] text-[#107c10] border-[#c8e6c9]'
                                                    : 'bg-[#f3f2f1] text-[#605e5c] border-[#d2d0ce]'
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
                                className={`w-full py-2 text-xs font-semibold uppercase rounded-[2px] border transition-colors shadow-2xs cursor-pointer ${
                                    isOnline
                                        ? 'bg-[#fde7e9] hover:bg-[#fcd0d5] text-[#a4262c] border-[#f8b6be]'
                                        : 'bg-[#f3f2f1] text-[#a19f9d] border-[#d2d0ce] cursor-not-allowed'
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
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl rounded-[4px] shadow-xl overflow-hidden flex flex-col max-h-[85vh] border border-[#d2d0ce] text-[#201f1e]">
                        {/* Modal Header */}
                        <div className="bg-[#0078d4] text-white px-4 py-2.5 flex justify-between items-center">
                            <div>
                                <h3 className="font-semibold text-sm uppercase">
                                    Ítems a Recontar — Etapa {recountData.stage} (R{recountData.stage - 1})
                                </h3>
                                <p className="text-xs text-white/90 font-normal">
                                    {recountData.recounted_count} de {recountData.total} recontados ({recountData.pending_count} pendientes)
                                </p>
                            </div>
                            <button
                                onClick={() => setShowRecountModal(false)}
                                className="text-white/80 hover:text-white text-base font-semibold px-2 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Filter Tabs */}
                        <div className="flex border-b border-[#d2d0ce] bg-[#f9f9f9] px-4 pt-2 gap-2 text-xs">
                            <button
                                onClick={() => setRecountFilter('pending')}
                                className={`px-3 py-1.5 border-b-2 font-semibold uppercase text-xs transition-colors cursor-pointer ${
                                    recountFilter === 'pending'
                                        ? 'border-[#0078d4] text-[#0078d4] bg-white rounded-t-[2px]'
                                        : 'border-transparent text-[#605e5c] hover:text-[#201f1e]'
                                }`}
                            >
                                Pendientes ({recountData.pending_count})
                            </button>
                            <button
                                onClick={() => setRecountFilter('all')}
                                className={`px-3 py-1.5 border-b-2 font-semibold uppercase text-xs transition-colors cursor-pointer ${
                                    recountFilter === 'all'
                                        ? 'border-[#0078d4] text-[#0078d4] bg-white rounded-t-[2px]'
                                        : 'border-transparent text-[#605e5c] hover:text-[#201f1e]'
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
                                        className={`p-2.5 border rounded-[2px] flex justify-between items-center transition-colors ${
                                            item.is_recounted
                                                ? 'bg-[#f9f9f9] border-[#d2d0ce] opacity-80'
                                                : 'bg-white border-[#d2d0ce] hover:border-[#0078d4] shadow-2xs'
                                        }`}
                                    >
                                        <div className="flex-1 pr-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm text-[#201f1e]">
                                                    {item.item_code}
                                                </span>
                                                {item.is_recounted ? (
                                                    <span className="bg-[#dff6dd] text-[#107c10] text-[11px] font-semibold px-2 py-0.5 rounded-[2px] border border-[#c8e6c9]">
                                                        RECONTADO ({item.counted_qty_in_stage})
                                                    </span>
                                                ) : (
                                                    <span className="bg-[#fff4ce] text-[#8a3707] text-[11px] font-semibold px-2 py-0.5 rounded-[2px] border border-[#fde398]">
                                                        PENDIENTE
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-[#605e5c] font-normal line-clamp-1 mt-0.5">
                                                {item.description}
                                            </p>
                                            <p className="text-xs text-[#605e5c] uppercase mt-0.5 font-normal">
                                                Ubic. Sistema: <span className="font-semibold text-[#201f1e]">{item.bin_location}</span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => selectItemForRecount(item)}
                                            className={`px-3.5 py-1.5 rounded-[2px] text-xs font-semibold uppercase transition-colors shadow-2xs cursor-pointer ${
                                                item.is_recounted
                                                    ? 'bg-white hover:bg-[#f3f2f1] text-[#201f1e] border border-[#d2d0ce]'
                                                    : 'bg-[#0078d4] hover:bg-[#106ebe] text-white shadow-xs'
                                            }`}
                                        >
                                            {item.is_recounted ? 'Editar' : 'Recontar'}
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Limpio de Captura de Reconteo */}
            {recountItemModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white max-w-md w-full rounded-[4px] shadow-xl border border-[#d2d0ce] p-5 text-[#201f1e]">
                        <div className="flex justify-between items-start mb-3 pb-2 border-b border-[#d2d0ce]">
                            <div>
                                <h3 className="text-sm font-semibold text-[#201f1e]">
                                    Capturar Reconteo — {recountItemModal.item_code}
                                </h3>
                                <p className="text-xs text-[#605e5c] font-normal truncate max-w-[280px]">
                                    {recountItemModal.description}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRecountItemModal(null)}
                                className="text-[#605e5c] hover:text-[#201f1e] text-base font-semibold cursor-pointer px-1"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveRecountItem} className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                    Ubicación Sistema / Referencia
                                </label>
                                <div className="h-9 px-3 bg-[#f9f9f9] border border-[#d2d0ce] rounded-[2px] text-xs font-semibold text-[#201f1e] flex items-center uppercase">
                                    {recountItemModal.bin_location}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                    Ubicación Física Real <span className="text-red-600">*</span>
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        value={recountItemModal.counted_location}
                                        onChange={e => setRecountItemModal({ ...recountItemModal, counted_location: e.target.value.toUpperCase() })}
                                        className="flex-grow h-9 border border-[#d2d0ce] rounded-[2px] px-3 text-sm font-medium text-[#201f1e] uppercase bg-white focus:outline-none focus:ring-1 focus:ring-[#0078d4] focus:border-[#0078d4] placeholder:normal-case placeholder:text-[#a19f9d]"
                                        placeholder="Escanear o ingresar ubicación..."
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => startScanner('recount-location')}
                                        title="Escanear QR / Código de Ubicación"
                                        aria-label="Escanear QR Ubicación Reconteo"
                                        className="h-9 w-9 border border-[#0078d4] bg-[#eff6fc] hover:bg-[#deecf9] rounded-[2px] flex items-center justify-center cursor-pointer shrink-0 shadow-2xs transition-colors"
                                        style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
                                    >
                                        <QrIcon size={20} color="#0078d4" />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[#201f1e] mb-1.5">
                                    Cantidad Observada / Recontada <span className="text-red-600">*</span>
                                </label>
                                <div className="flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setRecountItemModal(prev => ({
                                            ...prev,
                                            counted_qty: String(Math.max(0, (parseInt(prev.counted_qty) || 0) - 1))
                                        }))}
                                        className="h-9 w-10 border border-[#d2d0ce] bg-white hover:bg-[#f3f2f1] text-[#201f1e] font-semibold text-lg rounded-l-[2px] flex items-center justify-center cursor-pointer select-none p-0 shadow-2xs"
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        value={recountItemModal.counted_qty}
                                        onChange={e => setRecountItemModal({ ...recountItemModal, counted_qty: e.target.value })}
                                        className="h-9 flex-grow border-y border-[#d2d0ce] text-center text-sm font-semibold text-[#201f1e] bg-white focus:outline-none focus:ring-1 focus:ring-[#0078d4] px-1"
                                        min="0"
                                        autoFocus
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setRecountItemModal(prev => ({
                                            ...prev,
                                            counted_qty: String((parseInt(prev.counted_qty) || 0) + 1)
                                        }))}
                                        className="h-9 w-10 border border-[#d2d0ce] bg-white hover:bg-[#f3f2f1] text-[#201f1e] font-semibold text-lg rounded-r-[2px] flex items-center justify-center cursor-pointer select-none p-0 shadow-2xs"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#d2d0ce]">
                                <button
                                    type="button"
                                    onClick={() => setRecountItemModal(null)}
                                    className="h-9 px-4 border border-[#d2d0ce] bg-white hover:bg-[#f3f2f1] text-[#201f1e] text-xs font-semibold rounded-[2px] transition-colors cursor-pointer shadow-2xs"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="h-9 px-5 bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] text-white text-xs font-semibold rounded-[2px] shadow-xs transition-colors cursor-pointer"
                                >
                                    Guardar Reconteo
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CycleCounts;
