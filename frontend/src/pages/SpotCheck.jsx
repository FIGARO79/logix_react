import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabContext } from '../hooks/useTabContext';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';
import { useOffline } from '../hooks/useOffline';
import { getDB, savePendingSync, cacheData, getCachedData } from '../utils/offlineDb';
import { parseGS1Barcode } from '../utils/gs1Parser';
import Spinner from '../components/Spinner';
import '../styles/SpotCheck.css';

// Icono funcional de Código QR para escáner (Fluent UI)
const QrIcon = ({ size = 18, color = "#0078d4" }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px`, display: 'block', flexShrink: 0 }}
    >
        <rect x="2.5" y="2.5" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill="none" />
        <rect x="5" y="5" width="2" height="2" fill={color} />
        <rect x="14.5" y="2.5" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill="none" />
        <rect x="17" y="5" width="2" height="2" fill={color} />
        <rect x="2.5" y="14.5" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill="none" />
        <rect x="5" y="17" width="2" height="2" fill={color} />
        <rect x="14.5" y="14.5" width="2.5" height="2.5" fill={color} />
        <rect x="19" y="14.5" width="2.5" height="2.5" fill={color} />
        <rect x="14.5" y="19" width="2.5" height="2.5" fill={color} />
        <rect x="19" y="19" width="2.5" height="2.5" fill={color} />
        <rect x="11" y="4" width="2" height="3" fill={color} />
        <rect x="11" y="11" width="2" height="2" fill={color} />
        <rect x="4" y="11" width="3" height="2" fill={color} />
    </svg>
);

const SpotCheck = () => {
    const context = useTabContext();
    const setTitle = context ? context.setTitle : null;
    const navigate = useNavigate();
    const { isOnline } = useOffline();

    useEffect(() => {
        if (setTitle) setTitle("Conteo por Ubicación");
    }, [setTitle]);

    const [binLocation, setBinLocation] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState(null);
    const [searchResults, setSearchResults] = useState([]);
    const [physicalQty, setPhysicalQty] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [recentChecks, setRecentChecks] = useState([]);

    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState(null);

    const binRef = useRef(null);
    const itemRef = useRef(null);
    const qtyRef = useRef(null);

    const fetchRecentChecks = useCallback(async () => {
        try {
            if (isOnline) {
                const res = await fetch('/api/spot_check/list');
                if (res.ok) {
                    const data = await res.json();
                    setRecentChecks(data);
                    await cacheData('recent_spot_checks', data);
                }
            } else {
                const cached = await getCachedData('recent_spot_checks');
                if (cached) setRecentChecks(cached);
            }
        } catch (e) { 
            console.error("Error al cargar historial", e); 
        }
    }, [isOnline]);

    useEffect(() => {
        fetchRecentChecks();
    }, [fetchRecentChecks]);

    const handleSearchItem = async (query) => {
        let q = (query || itemCode || '').trim().toUpperCase();
        if (!q) return;

        const gs1 = parseGS1Barcode(q);
        if ((gs1.isGS1 || gs1.isMultiField) && gs1.itemCode) {
            q = gs1.itemCode.trim().toUpperCase();
            setItemCode(q);
        }

        setLoading(true);
        setItemData(null);
        setSearchResults([]);
        
        try {
            if (isOnline) {
                const res = await fetch(`/api/spot_check/find/${encodeURIComponent(q)}`);
                if (res.ok) {
                    const data = await res.json();
                    setItemData({
                        item_code: data.item_code,
                        description: data.description,
                        system_bin: data.system_bin || 'N/A',
                        additional_locations: data.additional_locations || ''
                    });
                    setItemCode(data.item_code);
                    setTimeout(() => qtyRef.current?.focus(), 100);
                } else {
                    const searchRes = await fetch(`/api/search_items?q=${encodeURIComponent(q)}`);
                    if (searchRes.ok) {
                        const data = await searchRes.json();
                        if (data.length === 0) {
                            toast.warn("Item no encontrado");
                        } else if (data.length === 1) {
                            const item = data[0];
                            setItemData({
                                item_code: item.itemCode,
                                description: item.description,
                                system_bin: item.binLocation || item.bin_1 || 'N/A',
                                additional_locations: item.aditionalBins || ''
                            });
                            setItemCode(item.itemCode);
                            setTimeout(() => qtyRef.current?.focus(), 100);
                        } else {
                            setSearchResults(data);
                        }
                    } else {
                        toast.error("Error en la búsqueda");
                    }
                }
            } else {
                // Modo Offline: buscar en IndexedDB master_items
                const db = await getDB();
                const tx = db.transaction('master_items', 'readonly');
                const store = tx.objectStore('master_items');
                
                const exactMatch = await store.get(q);
                if (exactMatch) {
                    setItemData({
                        item_code: exactMatch.Item_Code,
                        description: exactMatch.Item_Description,
                        system_bin: exactMatch.Bin_1 || 'N/A',
                        additional_locations: exactMatch.Aditional_Bin_Location || ''
                    });
                    setItemCode(exactMatch.Item_Code);
                    setTimeout(() => qtyRef.current?.focus(), 100);
                } else {
                    const allItems = await store.getAll();
                    const filtered = allItems.filter(i => 
                        i.Item_Code.includes(q) || 
                        (i.Item_Description && i.Item_Description.toUpperCase().includes(q))
                    ).slice(0, 10);

                    if (filtered.length === 0) {
                        toast.warn("Item no encontrado en maestro local");
                    } else if (filtered.length === 1) {
                        setItemData({
                            item_code: filtered[0].Item_Code,
                            description: filtered[0].Item_Description,
                            system_bin: filtered[0].Bin_1 || 'N/A',
                            additional_locations: filtered[0].Aditional_Bin_Location || ''
                        });
                        setItemCode(filtered[0].Item_Code);
                        setTimeout(() => qtyRef.current?.focus(), 100);
                    } else {
                        setSearchResults(filtered.map(f => ({
                            itemCode: f.Item_Code,
                            description: f.Item_Description,
                            system_bin: f.Bin_1 || 'N/A',
                            additional_locations: f.Aditional_Bin_Location || ''
                        })));
                    }
                }
            }
        } catch (e) { 
            toast.error("Error de conexión"); 
        } finally { 
            setLoading(false); 
        }
    };

    const selectItemFromResult = (item) => {
        setItemData({
            item_code: item.itemCode,
            description: item.description,
            system_bin: item.system_bin || item.binLocation || 'N/A',
            additional_locations: item.additional_locations || item.aditionalBins || ''
        });
        setItemCode(item.itemCode);
        setSearchResults([]);
        setTimeout(() => qtyRef.current?.focus(), 100);
    };

    const clearForm = () => {
        setItemCode('');
        setItemData(null);
        setPhysicalQty('');
        setSearchResults([]);
        setTimeout(() => itemRef.current?.focus(), 100);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!binLocation || !itemCode || !physicalQty || !itemData) {
            toast.warning("Complete todos los campos antes de registrar");
            return;
        }

        const payload = {
            bin_location: binLocation.toUpperCase(),
            system_bin: (itemData.system_bin || 'N/A').toUpperCase(),
            item_code: itemData.item_code,
            item_description: itemData.description,
            quantity: parseInt(physicalQty),
            timestamp: new Date().toISOString()
        };

        setIsSaving(true);
        try {
            if (isOnline) {
                const res = await fetch('/api/spot_check/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    toast.success("Hallazgo registrado con éxito");
                    clearForm();
                    fetchRecentChecks();
                    return;
                }
            }

            // Guardar Offline
            await savePendingSync('spot_check', payload);
            toast.info("Registrado localmente (Offline)");
            clearForm();
            // Actualizar vista local
            setRecentChecks(prev => [{
                id: `local_${Date.now()}`,
                ...payload,
                username: 'TÚ (Offline)',
                is_pending: true
            }, ...prev]);

        } catch (e) { 
            console.error(e);
            await savePendingSync('spot_check', payload);
            toast.info("Registrado localmente (Offline)");
            clearForm();
        } finally { 
            setIsSaving(false); 
        }
    };

    const handleClearTable = async () => {
        const password = prompt("Ingrese su contraseña para confirmar la limpieza de la tabla:");
        if (!password) return;

        try {
            const res = await fetch('/api/spot_check/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (res.ok) {
                toast.success("Tabla limpiada correctamente");
                fetchRecentChecks();
            } else {
                const err = await res.json();
                toast.error(err.detail || "Error al limpiar la tabla");
            }
        } catch (e) { 
            toast.error("Error de conexión al limpiar"); 
        }
    };

    const handleExport = () => {
        window.location.href = '/api/spot_check/export';
    };

    const handleScan = (code) => {
        const text = code.toUpperCase();
        if (scanTarget === 'bin') {
            setBinLocation(text);
            // Salto automático al campo de ítem tras escanear ubicación
            setTimeout(() => itemRef.current?.focus(), 150);
        } else {
            setItemCode(text);
            handleSearchItem(text);
        }
        setScannerOpen(false);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="spot-check-page max-w-[1300px] mx-auto px-4 sm:px-6 py-5 min-h-screen bg-[#f3f3f3] text-[#201f1e]">
            <ToastContainer position="top-right" autoClose={2000} />

            {/* Header / Command Bar - Estilo Fluent UI */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-[#edebe9] gap-3">
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-[#201f1e] tracking-tight">
                            Conteo por Ubicación
                        </h1>
                        <p className="text-xs text-[#605e5c]">
                            Verificación física rápida y registro de hallazgos por BIN
                        </p>
                    </div>
                    {!isOnline && (
                        <span className="text-[11px] bg-[#fde7e9] text-[#a4262c] px-2.5 py-0.5 rounded border border-[#f1c0c0] font-semibold animate-pulse">
                            MODO OFFLINE
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/stock')}
                        className="h-8 px-3.5 bg-white border border-[#8a8886] hover:border-[#201f1e] hover:bg-[#f3f2f1] text-[#201f1e] text-xs font-semibold rounded flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                        title="Ir a Consulta de Stock"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-[#0078d4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Consultar Stock
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Panel Izquierdo: Formulario de Conteo */}
                <div className="lg:col-span-1">
                    <div className="bg-white border border-[#d2d0ce] shadow-xs p-5 rounded space-y-4 sticky top-20">
                        {/* Cabecera del formulario */}
                        <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
                            <span className="text-xs font-bold uppercase tracking-wider text-[#605e5c] flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#0078d4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                Registrar Conteo
                            </span>
                            {(itemCode || binLocation || physicalQty) && (
                                <button
                                    onClick={clearForm}
                                    className="text-[11px] text-[#0078d4] hover:underline cursor-pointer"
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>

                        {/* Campo BIN */}
                        <div>
                            <label className="text-xs font-semibold text-[#201f1e] mb-1.5 block">
                                Ubicación Física (BIN)
                            </label>
                            <div className="input-group-fluent">
                                <input
                                    ref={binRef}
                                    type="text"
                                    value={binLocation}
                                    onChange={(e) => setBinLocation(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && itemRef.current?.focus()}
                                    className="font-mono font-bold text-sm text-[#201f1e] placeholder:font-sans placeholder:font-normal placeholder:text-[#a19f9d]"
                                    placeholder="Ej: RA11A"
                                />
                                <button
                                    type="button"
                                    onClick={() => { setScanTarget('bin'); setScannerOpen(true); }}
                                    className="scanner-btn-fluent"
                                    title="Escanear BIN con Cámara"
                                >
                                    <QrIcon size={18} color="#0078d4" />
                                </button>
                            </div>
                        </div>

                        {/* Campo Código / Descripción */}
                        <div>
                            <label className="text-xs font-semibold text-[#201f1e] mb-1.5 block">
                                Código de Ítem o Descripción
                            </label>
                            <div className="input-group-fluent">
                                <input
                                    ref={itemRef}
                                    type="text"
                                    value={itemCode}
                                    onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchItem()}
                                    className="font-mono font-medium text-sm text-[#201f1e] placeholder:font-sans placeholder:font-normal placeholder:text-[#a19f9d]"
                                    placeholder="SKU o Descripción"
                                />
                                <button
                                    type="button"
                                    onClick={() => { setScanTarget('item'); setScannerOpen(true); }}
                                    className="scanner-btn-fluent"
                                    title="Escanear Código con Cámara"
                                >
                                    <QrIcon size={18} color="#0078d4" />
                                </button>
                            </div>
                        </div>

                        {/* Lista de Resultados de Búsqueda Múltiple */}
                        {searchResults.length > 0 && (
                            <div className="bg-white border border-[#0078d4] rounded shadow-md overflow-hidden max-h-52 overflow-y-auto divide-y divide-[#edebe9]">
                                <div className="px-3 py-1.5 bg-[#eff6fc] text-[11px] font-semibold text-[#0078d4] uppercase">
                                    Seleccione un ítem ({searchResults.length} coincidencias):
                                </div>
                                {searchResults.map((item) => (
                                    <div 
                                        key={item.itemCode}
                                        onClick={() => selectItemFromResult(item)}
                                        className="p-2.5 hover:bg-[#f3f9fd] cursor-pointer transition-colors"
                                    >
                                        <div className="font-semibold text-xs text-[#0078d4] font-mono">{item.itemCode}</div>
                                        <div className="text-[11px] text-[#605e5c] truncate">{item.description}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tarjeta de Información del Ítem */}
                        {loading ? (
                            <div className="p-3.5 bg-[#faf9f8] border border-[#edebe9] rounded text-xs text-[#605e5c] flex items-center gap-2">
                                <Spinner size="xs" />
                                <span>Buscando en catálogo maestro...</span>
                            </div>
                        ) : itemData ? (
                            <div className="p-3.5 bg-[#f8f9fa] border border-[#d2d0ce] rounded space-y-2">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-[#605e5c] font-semibold">Descripción del Artículo</div>
                                    <div className="text-xs font-semibold text-[#201f1e] leading-snug">{itemData.description}</div>
                                </div>
                                <div className="pt-2 border-t border-[#edebe9] flex flex-wrap gap-2 text-xs">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[#605e5c]">BIN Teórico:</span>
                                        <span className="font-mono font-semibold px-2 py-0.5 rounded text-[11px] bg-[#eff6fc] text-[#0078d4] border border-[#c7e0f4]">
                                            {itemData.system_bin || 'N/A'}
                                        </span>
                                    </div>
                                    {itemData.additional_locations && (
                                        <div className="flex items-center gap-1">
                                            <span className="text-[#605e5c]">Adicionales:</span>
                                            <span className="font-mono text-[11px] text-[#605e5c]">
                                                {itemData.additional_locations}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-[#faf9f8] border border-dashed border-[#d2d0ce] rounded text-center text-xs text-[#a19f9d]">
                                Escanea o busca un artículo para validar su ubicación teórica
                            </div>
                        )}

                        {/* Cantidad y Botón Guardar */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end pt-1">
                            <div>
                                <label className="text-xs font-semibold text-[#201f1e] mb-1.5 block">Cantidad Física</label>
                                <input
                                    ref={qtyRef}
                                    type="number"
                                    value={physicalQty}
                                    onChange={(e) => setPhysicalQty(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                    className="w-full text-center font-bold text-lg text-[#201f1e]"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !itemData || !physicalQty || !binLocation}
                                    className="action-btn-fluent w-full bg-[#0078d4] hover:bg-[#106ebe] text-white disabled:bg-[#f3f2f1] disabled:text-[#a19f9d] disabled:border-[#d2d0ce] cursor-pointer disabled:cursor-not-allowed shadow-xs"
                                >
                                    {isSaving ? (
                                        <>
                                            <Spinner size="xs" />
                                            <span>Guardando...</span>
                                        </>
                                    ) : (
                                        'REGISTRAR'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Panel Derecho: Tabla de Hallazgos Recientes */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-[#d2d0ce] shadow-xs rounded overflow-hidden">
                        {/* Cabecera / Command Bar de la tabla */}
                        <div className="bg-[#f8f9fa] px-4 py-2.5 border-b border-[#edebe9] flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-[#201f1e]">Hallazgos Recientes</h2>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#eff6fc] text-[#0078d4] border border-[#c7e0f4]">
                                    {recentChecks.length}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExport}
                                    disabled={recentChecks.length === 0}
                                    className="text-xs font-semibold text-[#0078d4] hover:text-[#106ebe] flex items-center gap-1.5 border border-[#c7e0f4] px-2.5 py-1 rounded bg-white hover:bg-[#eff6fc] transition-all shadow-2xs disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                    title="Exportar a archivo Excel"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-[#107c10]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Excel
                                </button>
                                <button
                                    onClick={handleClearTable}
                                    disabled={recentChecks.length === 0}
                                    className="text-xs font-semibold text-[#a4262c] hover:text-[#7d1d22] flex items-center gap-1.5 border border-[#f1c0c0] px-2.5 py-1 rounded bg-white hover:bg-[#fde7e9] transition-all shadow-2xs disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                    title="Limpiar registros de la tabla"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-[#a4262c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Limpiar
                                </button>
                            </div>
                        </div>

                        {/* Contenedor de la tabla */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#f3f2f1] text-[#605e5c] border-b border-[#edebe9] text-[11px] uppercase font-semibold">
                                    <tr>
                                        <th className="px-3.5 py-2">Hora</th>
                                        <th className="px-3.5 py-2">Bin Encontrado</th>
                                        <th className="px-3.5 py-2">Bin Sistema</th>
                                        <th className="px-3.5 py-2">Artículo</th>
                                        <th className="px-3.5 py-2 text-center">Cant.</th>
                                        <th className="px-3.5 py-2">Usuario</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-[#f3f2f1]">
                                    {recentChecks.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-12 text-center text-[#a19f9d]">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#c8c6c4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                                    </svg>
                                                    <span className="text-xs font-medium">No hay registros recientes de conteo por ubicación</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        recentChecks.map((check) => {
                                            const isMatch = check.system_bin && check.system_bin !== 'N/A' && check.bin_location === check.system_bin;
                                            return (
                                                <tr key={check.id} className="hover:bg-[#f8f9fa] transition-colors">
                                                    <td className="px-3.5 py-2 text-[#605e5c] font-mono text-xs">
                                                        {formatDate(check.timestamp)}
                                                    </td>
                                                    <td className="px-3.5 py-2 font-mono">
                                                        {isMatch ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs font-semibold bg-[#dff6dd] text-[#107c10] border border-[#c8e6c9]">
                                                                <svg className="w-3 h-3 text-[#107c10]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                {check.bin_location}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs font-semibold bg-[#fff4ce] text-[#ca5010] border border-[#ffe0b2]" title="Ubicación física diferente al sistema">
                                                                <svg className="w-3 h-3 text-[#ca5010]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                                </svg>
                                                                {check.bin_location}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3.5 py-2 font-mono text-xs font-medium text-[#605e5c]">
                                                        {check.system_bin || check.default_bin || 'N/A'}
                                                    </td>
                                                    <td className="px-3.5 py-2">
                                                        <div className="font-semibold text-[#0078d4] text-xs font-mono">{check.item_code}</div>
                                                        <div className="text-[11px] text-[#605e5c] truncate max-w-[220px]" title={check.item_description}>
                                                            {check.item_description}
                                                        </div>
                                                    </td>
                                                    <td className="px-3.5 py-2 text-center font-bold text-sm text-[#201f1e]">
                                                        {check.quantity}
                                                    </td>
                                                    <td className="px-3.5 py-2 text-xs text-[#605e5c] uppercase">
                                                        <div className="flex items-center gap-1">
                                                            <span>{check.username}</span>
                                                            {check.is_pending && (
                                                                <span className="text-[9px] bg-[#fde7e9] text-[#a4262c] px-1 py-0.2 rounded font-semibold">
                                                                    Offline
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            {scannerOpen && <ScannerModal onScan={handleScan} onClose={() => setScannerOpen(false)} />}
        </div>
    );
};

export default SpotCheck;
