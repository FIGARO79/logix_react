import React, { useState, useEffect, useRef } from 'react';
import { useTabContext } from '../hooks/useTabContext';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';

const SpotCheck = () => {
    const context = useTabContext();
    const setTitle = context ? context.setTitle : null;
    const navigate = useNavigate();
    
    useEffect(() => {
        if (setTitle) setTitle("Verificación de Saldo");
    }, [setTitle]);

    const [binLocation, setBinLocation] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState(null);
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
            const res = await fetch('/api/spot_check/list');
            if (res.ok) {
                const data = await res.json();
                setRecentChecks(data);
            }
        } catch (e) { console.error("Error al cargar historial", e); }
    };

    const handleSearchItem = async (codeToSearch) => {
        const code = (codeToSearch || itemCode || '').trim().toUpperCase();
        if (!code) return;
        
        setLoading(true);
        try {
            const res = await fetch(`/api/spot_check/find/${encodeURIComponent(code)}`);
            if (res.ok) {
                const data = await res.json();
                setItemData({
                    item_code: data.item_code,
                    description: data.description
                });
                setItemCode(data.item_code);
                setTimeout(() => qtyRef.current?.focus(), 100);
            } else {
                toast.warn("Item no encontrado");
                setItemData(null);
            }
        } catch (e) { toast.error("Error de búsqueda"); }
        finally { setLoading(false); }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!binLocation || !itemCode || !physicalQty || !itemData) {
            toast.warning("Complete todos los campos");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch('/api/spot_check/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bin_location: binLocation.toUpperCase(),
                    item_code: itemData.item_code,
                    item_description: itemData.description,
                    quantity: parseInt(physicalQty)
                })
            });

            if (res.ok) {
                toast.success("Hallazgo registrado");
                setItemCode(''); setItemData(null); setPhysicalQty('');
                fetchRecentChecks();
                setTimeout(() => itemRef.current?.focus(), 100);
            }
        } catch (e) { toast.error("Error al guardar"); }
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
                    <h1 className="text-xl font-bold text-black uppercase">Verificación de Saldo</h1>
                    <p className="text-[10px] uppercase tracking-[0.15em] font-normal text-zinc-500 mt-1">Hallazgos registrados en tiempo real</p>
                </div>
                <button 
                    onClick={() => navigate('/stock')}
                    className="btn-sap btn-secondary text-[11px] font-bold uppercase tracking-widest px-6 h-9 flex items-center"
                >
                    Stock
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <div className="bg-white border border-zinc-200 shadow-sm p-6 rounded-lg space-y-6 sticky top-24">
                        <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}`}</style>
                        
                        <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block">Ubicación (BIN)</label>
                            <div className="flex">
                                <input 
                                    ref={binRef} 
                                    type="text" 
                                    value={binLocation} 
                                    onChange={(e) => setBinLocation(e.target.value.toUpperCase())} 
                                    onKeyDown={(e) => e.key === 'Enter' && itemRef.current?.focus()}
                                    style={{ height: '40px' }}
                                    className="flex-1 px-3 border border-zinc-300 border-r-0 rounded-l font-mono font-bold outline-none focus:border-zinc-900 transition-colors py-0" 
                                    placeholder="BIN" 
                                />
                                <button 
                                    onClick={() => { setScanTarget('bin'); setScannerOpen(true); }} 
                                    style={{ height: '40px', width: '40px' }}
                                    className="shrink-0 border border-zinc-300 rounded-r bg-zinc-50 flex items-center justify-center p-0 text-zinc-600 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors"
                                >
                                    {scannerIcon}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block">Artículo (SKU)</label>
                            <div className="flex">
                                <input 
                                    ref={itemRef} 
                                    type="text" 
                                    value={itemCode} 
                                    onChange={(e) => setItemCode(e.target.value.toUpperCase())} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchItem()} 
                                    style={{ height: '40px' }}
                                    className="flex-1 px-3 border border-zinc-300 border-r-0 rounded-l font-mono font-bold outline-none focus:border-zinc-900 transition-colors py-0" 
                                    placeholder="SKU" 
                                />
                                <button 
                                    onClick={() => { setScanTarget('item'); setScannerOpen(true); }} 
                                    style={{ height: '40px', width: '40px' }}
                                    className="shrink-0 border border-zinc-300 rounded-r bg-zinc-50 flex items-center justify-center p-0 text-zinc-600 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors"
                                >
                                    {scannerIcon}
                                </button>
                            </div>
                        </div>

                        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-[11px] font-bold text-zinc-800 uppercase leading-relaxed">
                            {loading ? 'Buscando...' : (itemData?.description || '— ESPERANDO ARTÍCULO —')}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block">Cantidad</label>
                                <input 
                                    ref={qtyRef} 
                                    type="number" 
                                    value={physicalQty} 
                                    onChange={(e) => setPhysicalQty(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()} 
                                    style={{ height: '40px' }}
                                    className="w-full px-3 border border-zinc-300 rounded text-center font-bold text-lg outline-none focus:border-zinc-900 py-0" 
                                    placeholder="0" 
                                />
                            </div>
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving || !itemData} 
                                style={{ height: '40px' }}
                                className="w-full bg-zinc-900 text-white rounded font-bold uppercase text-[10px] tracking-widest hover:bg-black disabled:bg-zinc-200 transition-colors"
                            >
                                {isSaving ? 'OK...' : 'REGISTRAR'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <div className="bg-white border border-zinc-300 shadow-md overflow-hidden rounded-lg">
                        <div className="bg-zinc-100 px-4 py-3 border-b-2 border-zinc-200 flex justify-between items-center">
                            <h2 className="text-[11px] font-bold text-black uppercase tracking-widest">Hallazgos Recientes</h2>
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleExport}
                                    className="text-[10px] font-bold uppercase text-[#285f94] hover:text-blue-800 flex items-center gap-1 border border-[#285f94]/20 px-2 py-1 rounded hover:bg-blue-50 transition-all"
                                >
                                    Excel
                                </button>
                                <button 
                                    onClick={handleClearTable}
                                    className="text-[10px] font-bold uppercase text-red-600 hover:text-red-800 flex items-center gap-1 border border-red-200 px-2 py-1 rounded hover:bg-red-50 transition-all"
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
                                        <tr><td colSpan="5" className="px-4 py-12 text-center text-zinc-400 font-bold uppercase">No hay registros recientes</td></tr>
                                    ) : (
                                        recentChecks.map((check) => (
                                            <tr key={check.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                                                <td className="px-4 py-3 text-zinc-500 font-mono">{formatDate(check.timestamp)}</td>
                                                <td className="px-4 py-3 font-bold text-black">{check.bin_location}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-[#285f94]">{check.item_code}</div>
                                                    <div className="text-[8px] text-zinc-400 truncate max-w-[200px]">{check.item_description}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center font-black text-base">{check.quantity}</td>
                                                <td className="px-4 py-3 uppercase text-zinc-500">{check.username}</td>
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
