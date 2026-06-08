import React, { useState, useEffect, useRef } from 'react';
import { useTabContext } from '../hooks/useTabContext';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';
import { useOffline } from '../hooks/useOffline';
import { getDB, savePendingSync, cacheData, getCachedData } from '../utils/offlineDb';

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

    useEffect(() => {
        fetchRecentChecks();
    }, []);

    const fetchRecentChecks = async () => {
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
        } catch (e) { console.error("Error al cargar historial", e); }
    };

    const handleSearchItem = async (query) => {
        const q = (query || itemCode || '').trim().toUpperCase();
        if (!q) return;

        setLoading(true);
        setItemData(null);
        setSearchResults([]);
        
        try {
            if (isOnline) {
                const res = await fetch(`/api/search_items?q=${encodeURIComponent(q)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.length === 0) {
                        toast.warn("Item no encontrado");
                    } else if (data.length === 1) {
                        const item = data[0];
                        setItemData({
                            item_code: item.itemCode,
                            description: item.description
                        });
                        setItemCode(item.itemCode);
                        setTimeout(() => qtyRef.current?.focus(), 100);
                    } else {
                        setSearchResults(data);
                    }
                } else {
                    toast.error("Error en la búsqueda");
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
                        description: exactMatch.Item_Description
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
                            description: filtered[0].Item_Description
                        });
                        setItemCode(filtered[0].Item_Code);
                        setTimeout(() => qtyRef.current?.focus(), 100);
                    } else {
                        setSearchResults(filtered.map(f => ({
                            itemCode: f.Item_Code,
                            description: f.Item_Description
                        })));
                    }
                }
            }
        } catch (e) { toast.error("Error de conexión"); }
        finally { setLoading(false); }
    };

    const selectItemFromResult = (item) => {
        setItemData({
            item_code: item.itemCode,
            description: item.description
        });
        setItemCode(item.itemCode);
        setSearchResults([]);
        setTimeout(() => qtyRef.current?.focus(), 100);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!binLocation || !itemCode || !physicalQty || !itemData) {
            toast.warning("Complete todos los campos");
            return;
        }

        const payload = {
            bin_location: binLocation.toUpperCase(),
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
                    toast.success("Hallazgo registrado");
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
        }
        finally { setIsSaving(false); }
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
        } catch (e) { toast.error("Error de conexión"); }
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

    const scannerIcon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
        </svg>
    );

    return (
        <div className="max-w-[1200px] mx-auto px-6 py-6 font-sans bg-[#fcfcfc] min-h-screen text-black">
            <ToastContainer position="top-right" autoClose={2000} />

            <div className="mb-8 border-b-2 border-zinc-200 pb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-[18px] font-medium  text-black uppercase tracking-tight">Conteo por Ubicación</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] uppercase tracking-[0.15em] font-medium  text-zinc-900">Hallazgos registrados</p>
                        {!isOnline && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200 font-medium  animate-pulse">MODO OFFLINE</span>}
                    </div>
                </div>
                <button
                    onClick={() => navigate('/stock')}
                    className="btn-sap btn-secondary text-[11px] font-medium  uppercase tracking-widest px-6 h-9 flex items-center border-2 border-black"
                >
                    Stock
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <div className="bg-white border border-zinc-300 shadow-sm p-6 rounded-lg space-y-6 sticky top-24">
                        <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}`}</style>

                        <div>
                            <label className="text-[11px] font-black text-gray-800 uppercase mb-2 block">Ubicación (BIN)</label>
                            <div className="flex">
                                <input
                                    ref={binRef}
                                    type="text"
                                    value={binLocation}
                                    onChange={(e) => setBinLocation(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && itemRef.current?.focus()}
                                    style={{ height: '40px' }}
                                    className="flex-1 px-3 border border-zinc-400 border-r-0 rounded-l font-mono font-medium  text-black text-lg outline-none focus:border-zinc-900 transition-colors py-0"
                                    placeholder="BIN"
                                />
                                <button
                                    onClick={() => { setScanTarget('bin'); setScannerOpen(true); }}
                                    style={{ height: '40px', width: '40px' }}
                                    className="shrink-0 border border-zinc-400 rounded-r bg-zinc-50 flex items-center justify-center !p-0 text-zinc-800 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors"
                                >
                                    {scannerIcon}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-black text-gray-800 uppercase mb-2 block">Código o Descripción</label>
                            <div className="flex">
                                <input
                                    ref={itemRef}
                                    type="text"
                                    value={itemCode}
                                    onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchItem()}
                                    style={{ height: '40px' }}
                                    className="flex-1 px-3 border border-zinc-400 border-r-0 rounded-l font-medium  text-black outline-none focus:border-zinc-900 transition-colors py-0"
                                    placeholder="SKU o DESCRIPCIÓN"
                                />
                                <button
                                    onClick={() => { setScanTarget('item'); setScannerOpen(true); }}
                                    style={{ height: '40px', width: '40px' }}
                                    className="shrink-0 border border-zinc-400 rounded-r bg-zinc-50 flex items-center justify-center !p-0 text-zinc-800 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors"
                                >
                                    {scannerIcon}
                                </button>
                            </div>
                        </div>

                        {/* Lista de Resultados de Búsqueda */}
                        {searchResults.length > 0 && (
                            <div className="bg-blue-50 border-2 border-blue-200 rounded-md overflow-hidden max-h-48 overflow-y-auto">
                                <div className="p-2 bg-blue-100 text-[10px] font-medium  text-blue-800 uppercase">Seleccione un ítem:</div>
                                {searchResults.map((item) => (
                                    <div 
                                        key={item.itemCode}
                                        onClick={() => selectItemFromResult(item)}
                                        className="p-3 border-b border-blue-100 hover:bg-white cursor-pointer transition-colors"
                                    >
                                        <div className="font-medium  text-zinc-900">{item.itemCode}</div>
                                        <div className="text-[10px] text-zinc-600 truncate">{item.description}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="p-3 bg-zinc-100 border border-zinc-300 rounded text-[12px] font-black text-black uppercase leading-tight shadow-inner">
                            {loading ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                    Buscando...
                                </div>
                            ) : (itemData?.description || '— ESPERANDO ARTÍCULO —')}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                            <div>
                                <label className="text-[11px] font-black text-gray-800 uppercase mb-2 block">Cantidad</label>
                                <input
                                    ref={qtyRef}
                                    type="number"
                                    value={physicalQty}
                                    onChange={(e) => setPhysicalQty(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                    style={{ height: '40px' }}
                                    className="w-full px-3 border border-zinc-400 rounded text-center font-black text-2xl text-black outline-none focus:border-zinc-900 py-0"
                                    placeholder="0"
                                />
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !itemData}
                                style={{ height: '40px' }}
                                className="w-full bg-zinc-900 text-white rounded font-medium  uppercase text-[11px] tracking-widest hover:bg-black disabled:bg-zinc-300 transition-colors shadow-lg active:scale-95"
                            >
                                {isSaving ? '...' : 'REGISTRAR'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <div className="bg-white border border-zinc-300 shadow-md overflow-hidden rounded-lg">
                        <div className="bg-zinc-100 px-4 py-3 border-b-2 border-zinc-200 flex justify-between items-center">
                            <h2 className="text-[11px] font-medium  text-black uppercase tracking-widest">Hallazgos Recientes</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExport}
                                    className="text-[10px] font-medium  uppercase text-[#1e4a74] hover:text-blue-800 flex items-center gap-1 border border-[#1e4a74]/30 px-3 py-1.5 rounded bg-white hover:bg-blue-50 transition-all shadow-sm"
                                >
                                    Excel
                                </button>
                                <button
                                    onClick={handleClearTable}
                                    className="text-[10px] font-medium  uppercase text-red-700 hover:text-red-900 flex items-center gap-1 border border-red-200 px-3 py-1.5 rounded bg-white hover:bg-red-50 transition-all shadow-sm"
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-zinc-900 text-white text-[9px] uppercase tracking-widest">
                                    <tr>
                                        <th className="px-4 py-3">Hora</th>
                                        <th className="px-4 py-3">Bin</th>
                                        <th className="px-4 py-3">Item</th>
                                        <th className="px-4 py-3 text-center">Cant</th>
                                        <th className="px-4 py-3">Usuario</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[10px]">
                                    {recentChecks.length === 0 ? (
                                        <tr><td colSpan="5" className="px-4 py-12 text-center text-zinc-400 font-medium  uppercase">No hay registros recientes</td></tr>
                                    ) : (
                                        recentChecks.map((check) => (
                                            <tr key={check.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                                                <td className="px-4 py-3 text-zinc-600 font-medium  font-mono">{formatDate(check.timestamp)}</td>
                                                <td className="px-4 py-3 font-black text-black text-sm">{check.bin_location}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium  text-[#1e4a74] text-sm">{check.item_code}</div>
                                                    <div className="text-[9px] text-zinc-800 font-medium truncate max-w-[250px]">{check.item_description}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center font-black text-lg text-black">{check.quantity}</td>
                                                <td className="px-4 py-3 uppercase text-zinc-600 font-medium ">{check.username}</td>
                                            </tr>
                                        ))
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
