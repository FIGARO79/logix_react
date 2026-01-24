import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const CycleCounts = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Logix - Conteo de Inventario"); }, [setTitle]);

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
    const scannerRef = useRef(null);

    // Check Active Session on Mount
    useEffect(() => {
        checkActiveSession();
    }, []);

    // Update Sidebar when Location or Session changes
    useEffect(() => {
        if (activeSession) {
            updateSidebarData();
        }
    }, [activeSession, countedLocation]);

    const checkActiveSession = async () => {
        setCheckingSession(true);
        try {
            const res = await fetch('/api/sessions/active');
            if (res.ok) {
                const session = await res.json();
                setActiveSession(session);
            } else {
                setActiveSession(null);
            }
        } catch (e) {
            console.error(e);
            setActiveSession(null);
        } finally {
            setCheckingSession(false);
        }
    };

    const startSession = async () => {
        try {
            const res = await fetch('/api/sessions/start', { method: 'POST' });
            if (res.ok) {
                const session = await res.json();
                setActiveSession(session);
                toast.success("Sesión iniciada");
            } else {
                toast.error("Error iniciando sesión");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    const endSession = async () => {
        if (!activeSession) return;
        if (!confirm("¿Seguro que desea finalizar la sesión?")) return;

        try {
            const res = await fetch(`/api/sessions/${activeSession.id}/close`, { method: 'POST' });
            if (res.ok) {
                setActiveSession(null);
                clearForm();
                toast.success("Sesión finalizada");
            } else {
                toast.error("Error finalizando sesión");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    const updateSidebarData = async () => {
        if (!activeSession) return;

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
    };

    const fetchItemData = async (code) => {
        if (!code) return;
        setLoadingItem(true);
        setDescription('');
        setBinSys('');

        try {
            const res = await fetch(`/api/get_item_for_counting/${encodeURIComponent(code)}`);
            if (res.ok) {
                const data = await res.json();
                setItemCode(data.item_code);
                setDescription(data.description);
                setBinSys(data.bin_location || 'N/A');
                // Focus qty input
                document.getElementById('counted_qty')?.focus();
            } else {
                toast.error("Item no encontrado o no requerido en esta etapa");
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
            bin_location_system: binSys
        };

        try {
            const res = await fetch('/api/save_count', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success("Conteo guardado");
                setItemCode('');
                setDescription('');
                setBinSys('');
                setCountedQty('');
                updateSidebarData(); // Refresh list
                document.getElementById('itemCode')?.focus();
            } else {
                const err = await res.json();
                toast.error(err.detail || "Error guardando");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    const closeLocation = async () => {
        if (!activeSession || !countedLocation) return;
        if (!confirm(`¿Cerrar ubicación ${countedLocation}?`)) return;

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

    useEffect(() => {
        if (scannerOpen && !scannerRef.current) {
            import('html5-qrcode').then(({ Html5Qrcode }) => {
                const html5QrCode = new Html5Qrcode("reader");
                scannerRef.current = html5QrCode;
                html5QrCode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: 250 },
                    (decodedText) => {
                        setScannerOpen(false);
                        scannerRef.current.stop().then(() => {
                            scannerRef.current.clear();
                            scannerRef.current = null;
                            if (scanTarget === 'location') {
                                setCountedLocation(decodedText.toUpperCase());
                            } else if (scanTarget === 'item') {
                                setItemCode(decodedText.toUpperCase());
                                fetchItemData(decodedText.toUpperCase());
                            }
                        });
                    },
                    () => { }
                ).catch(err => {
                    setScannerOpen(false);
                    toast.error("Cámara no disponible");
                });
            });
        }
    }, [scannerOpen]);


    if (checkingSession) return <div className="p-8 text-center">Cargando sesión...</div>;

    if (!activeSession) {
        return (
            <div className="container-wrapper max-w-lg mx-auto px-4 py-8 text-center bg-white rounded shadow mt-8">
                <h2 className="text-xl font-bold text-gray-700 mb-4">Gestión de Sesiones</h2>
                <p className="mb-6 text-gray-500">Inicie una sesión para comenzar el conteo de inventario.</p>
                <button onClick={startSession} className="btn-sap btn-primary w-full py-3">
                    Iniciar Nueva Sesión
                </button>
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
                            <h1 className="text-xl font-bold text-gray-800">Sesión #{activeSession.id}</h1>
                            <p className="text-xs text-gray-500">Usuario: {activeSession.user_username}</p>
                        </div>
                        <button onClick={endSession} className="btn-sap btn-secondary text-xs">Finalizar Sesión</button>
                    </div>

                    <form onSubmit={handleSaveCount} className="space-y-4">
                        {/* Location */}
                        <div className="flex items-end gap-2">
                            <div className="flex-grow">
                                <label className="form-label">Ubicación Contada*</label>
                                <input
                                    type="text"
                                    value={countedLocation}
                                    onChange={e => setCountedLocation(e.target.value.toUpperCase())}
                                    className="uppercase font-bold text-blue-800"
                                    placeholder="SCAN UBICACIÓN"
                                    required
                                />
                            </div>
                            <button type="button" onClick={() => startScanner('location')} className="btn-sap btn-secondary h-[38px] px-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                            </button>
                        </div>

                        {/* Item Logic */}
                        <div className="flex items-end gap-2">
                            <div className="flex-grow">
                                <label className="form-label">Item Code*</label>
                                <input
                                    id="itemCode"
                                    type="text"
                                    value={itemCode}
                                    onChange={e => setItemCode(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), fetchItemData(itemCode))}
                                    className="uppercase"
                                    placeholder="SCAN ITEM"
                                    required
                                />
                            </div>
                            <button type="button" onClick={() => startScanner('item')} className="btn-sap btn-secondary h-[38px] px-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                            </button>
                            <button type="button" onClick={() => fetchItemData(itemCode)} className="btn-sap btn-secondary h-[38px]">{loadingItem ? '...' : 'Buscar'}</button>
                        </div>

                        <div>
                            <label className="form-label">Descripción</label>
                            <div className="data-field bg-gray-50">{description}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="form-label">Ubic. Sistema</label>
                                <div className="data-field bg-gray-50">{binSys}</div>
                            </div>
                            <div>
                                <label className="form-label">Cantidad Contada*</label>
                                <div className="flex items-center">
                                    <button type="button" onClick={() => setCountedQty(prev => Math.max(0, (parseInt(prev) || 0) - 1))} className="px-3 py-2 border bg-gray-100">-</button>
                                    <input
                                        id="counted_qty"
                                        type="number"
                                        value={countedQty}
                                        onChange={e => setCountedQty(e.target.value)}
                                        className="text-center font-bold text-lg"
                                        min="0"
                                        required
                                    />
                                    <button type="button" onClick={() => setCountedQty(prev => (parseInt(prev) || 0) + 1)} className="px-3 py-2 border bg-gray-100">+</button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <button type="button" onClick={clearForm} className="btn-sap btn-secondary">Limpiar</button>
                            <button type="submit" className="btn-sap btn-primary">Guardar Conteo</button>
                        </div>
                    </form>
                </div>

                {/* Sidebar Info */}
                <div className="md:col-span-1 space-y-4">
                    {/* Counts in Location */}
                    <div className="bg-white p-4 rounded shadow">
                        <h3 className="font-bold text-sm text-gray-700 mb-2 border-b uppercase">Items en {countedLocation || '...'}</h3>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {locationCounts.length === 0 ? <p className="text-xs text-gray-400 text-center py-2">Vacío</p> :
                                locationCounts.map(c => (
                                    <div key={c.id} className="flex justify-between items-center text-sm p-1 hover:bg-gray-50">
                                        <span className="font-mono">{c.item_code}</span>
                                        <span className="font-bold">{c.counted_qty}</span>
                                        <button onClick={() => deleteCount(c.id)} className="text-red-500 font-bold px-2">×</button>
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    {/* Session Locations */}
                    <div className="bg-white p-4 rounded shadow">
                        <h3 className="font-bold text-sm text-gray-700 mb-2 border-b uppercase">Progreso Sesión</h3>
                        <div className="max-h-60 overflow-y-auto space-y-1 mb-2">
                            {sessionLocations.map(l => (
                                <div key={l.id} className="flex justify-between text-xs p-1">
                                    <span>{l.location_code}</span>
                                    <span className={l.status === 'open' ? 'text-green-600' : 'text-red-600 font-bold'}>{l.status}</span>
                                </div>
                            ))}
                        </div>
                        {countedLocation && (
                            <button onClick={closeLocation} className="btn-sap btn-primary w-full text-xs">
                                Cerrar {countedLocation}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Scanner Modal */}
            {scannerOpen && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg p-4 w-full max-w-md">
                        <h3 className="text-center font-bold mb-2">Escanear {scanTarget}</h3>
                        <div id="reader" className="rounded overflow-hidden"></div>
                        <button onClick={() => {
                            if (scannerRef.current) scannerRef.current.stop();
                            setScannerOpen(false);
                        }} className="btn-sap bg-red-600 text-white w-full mt-4">Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CycleCounts;
