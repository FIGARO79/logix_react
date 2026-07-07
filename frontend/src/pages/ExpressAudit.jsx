import React, { useState, useEffect, useRef } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';

const ExpressAudit = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Ciclo Manual"); }, [setTitle]);

    const [binLocation, setBinLocation] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState(null);
    const [physicalQty, setPhysicalQty] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [recentAudits, setRecentAudits] = useState([]);

    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState(null);

    const binRef = useRef(null);
    const itemRef = useRef(null);
    const qtyRef = useRef(null);

    useEffect(() => {
        fetchRecentAudits();
    }, []);

    const fetchRecentAudits = async () => {
        try {
            // Endpoint dedicado que solo trae registros de auditoría express
            const res = await fetch('/api/express_audit/recordings');
            if (res.ok) {
                const data = await res.json();
                setRecentAudits(data.slice(0, 10));
            }
        } catch (e) { console.error(e); }
    };

    const handleSearchItem = async (codeToSearch) => {
        const code = codeToSearch || itemCode;
        if (!code) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/express_audit/find/${encodeURIComponent(code)}`);
            if (res.ok) {
                const data = await res.json();
                setItemData({
                    item_code: data.item_code,
                    description: data.description,
                    system_qty: data.system_qty,
                    system_bin: data.system_bin,
                    abc_code: data.abc_code
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

    const handleItemChange = (val) => {
        const upperVal = val.toUpperCase();
        const prevVal = itemCode;
        setItemCode(upperVal);
        if (upperVal.length > prevVal.length + 3) {
            handleSearchItem(upperVal);
        }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!binLocation || !itemCode || !physicalQty || !itemData) return;

        setIsSaving(true);
        try {
            const res = await fetch('/api/express_audit/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_code: itemData.item_code,
                    item_description: itemData.description,
                    bin_location: binLocation.toUpperCase(),
                    system_qty: itemData.system_qty,
                    physical_qty: parseInt(physicalQty),
                    abc_code: itemData.abc_code,
                    executed_date: new Date().toISOString()
                })
            });

            if (res.ok) {
                toast.success("Registro guardado");
                resetForm();
                fetchRecentAudits();
            }
        } catch (e) { toast.error("Error al guardar"); }
        finally { setIsSaving(false); }
    };

    const resetForm = () => {
        setItemCode(''); setItemData(null); setPhysicalQty('');
        setTimeout(() => itemRef.current?.focus(), 100);
    };

    const resetAll = () => {
        setBinLocation(''); resetForm();
        setTimeout(() => binRef.current?.focus(), 100);
    };

    const handleScan = (code) => {
        if (scanTarget === 'bin') {
            setBinLocation(code.toUpperCase());
            itemRef.current?.focus();
        } else {
            setItemCode(code.toUpperCase());
            setTimeout(() => handleSearchItem(code.toUpperCase()), 100);
        }
        setScannerOpen(false);
    };

    const difference = itemData ? (parseInt(physicalQty || 0) - itemData.system_qty) : 0;

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('es-CO', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };
    return (
        <div className="w-full px-4 py-4">
            <ToastContainer position="top-right" autoClose={2000} />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                
                {/* Columna Principal: Formulario e Historial */}
                <div className="lg:col-span-2 space-y-4">
                    
                    {/* Tarjeta del Formulario */}
                    <div className="bg-white border border-gray-200 shadow-sm p-4 rounded space-y-3">
                        <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}`}</style>
                        
                        <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-2 -mx-4 -mt-4 rounded-t flex justify-between items-center mb-3">
                            <h2 className="text-[12px] font-semibold text-black uppercase tracking-wider">
                                Ciclo Manual (Auditoría Express)
                            </h2>
                            <button 
                                onClick={resetAll} 
                                className="text-[9px] font-semibold uppercase tracking-widest text-black bg-white border border-zinc-200 rounded px-2.5 py-1 hover:bg-zinc-50 transition-all active:scale-95 shadow-sm"
                            >
                                Reiniciar Sesión
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="form-label font-normal text-black">Ubicación (BIN)</label>
                                <div className="flex gap-2">
                                    <input 
                                        ref={binRef}
                                        type="text" 
                                        value={binLocation}
                                        onChange={(e) => setBinLocation(e.target.value.toUpperCase())}
                                        onKeyDown={(e) => e.key === 'Enter' && itemRef.current?.focus()}
                                        className="font-normal text-black border border-zinc-400 focus:border-black outline-none uppercase flex-grow h-[30px] px-2 rounded"
                                        placeholder="SCAN BIN"
                                    />
                                    <button 
                                        onClick={() => { setScanTarget('bin'); setScannerOpen(true); }}
                                        className="h-[30px] px-3 shrink-0 flex items-center justify-center border border-zinc-400 rounded bg-white text-black hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors active:scale-95"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 26 26" strokeWidth="1.5" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <label className="form-label font-normal text-black">Identificación (SKU)</label>
                                <div className="flex gap-2">
                                    <input 
                                        ref={itemRef}
                                        type="text" 
                                        value={itemCode}
                                        onChange={(e) => handleItemChange(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearchItem(e.target.value)}
                                        className="font-normal text-black border border-zinc-400 focus:border-black outline-none uppercase flex-grow h-[30px] px-2 rounded"
                                        placeholder="SCAN SKU"
                                    />
                                    <button 
                                        onClick={() => { setScanTarget('item'); setScannerOpen(true); }}
                                        className="h-[30px] px-3 shrink-0 flex items-center justify-center border border-zinc-400 rounded bg-white text-black hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors active:scale-95"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 26 26" strokeWidth="1.5" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mb-2">
                            <label className="form-label font-normal text-black">Descripción del Producto</label>
                            <div className="data-field font-normal text-black border-b border-gray-200 pb-1">
                                {itemData?.description || '— Esperando SKU —'}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="form-label font-normal text-black">Cantidad Observada</label>
                                <input 
                                    ref={qtyRef}
                                    type="number" 
                                    value={physicalQty}
                                    onChange={(e) => setPhysicalQty(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                    className="font-normal text-base text-black border border-zinc-400 focus:border-black outline-none w-full h-[30px] px-2 rounded text-center"
                                    placeholder="0"
                                    required
                                    min="0"
                                />
                            </div>
                            <div className="flex items-end">
                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving || !itemData}
                                    className={`h-[30px] px-6 w-full text-[10px] text-white rounded-lg shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95 transition-all ${isSaving || !itemData ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    style={{ background: '#285f94' }}
                                    onMouseEnter={e => !isSaving && itemData && (e.currentTarget.style.background = '#1e4a74')}
                                    onMouseLeave={e => !isSaving && itemData && (e.currentTarget.style.background = '#285f94')}
                                >
                                    {isSaving ? "Guardando..." : "Confirmar Registro"}
                                </button>
                            </div>
                        </div>
                        
                        <div className="pt-3 border-t border-zinc-200">
                            <h3 className="text-[11px] font-medium uppercase text-black border-b border-zinc-200 pb-1 mb-3 tracking-widest">Análisis de Inventario</h3>
                            <div className="grid grid-cols-3 gap-4 bg-zinc-50 border border-zinc-200 rounded-lg p-3 mb-3 shadow-inner">
                                <div>
                                    <label className="form-label font-normal text-black text-[10px] uppercase">Stock Sistema</label>
                                    <div className="text-xl font-bold text-black">{itemData?.system_qty || 0}</div>
                                </div>
                                <div>
                                    <label className="form-label font-normal text-black text-[10px] uppercase">Auditoría Física</label>
                                    <div className="text-xl font-bold text-black">{physicalQty || 0}</div>
                                </div>
                                <div>
                                    <label className="form-label font-normal text-black text-[10px] uppercase">Diferencia</label>
                                    <div className={`text-xl font-bold ${difference > 0 ? 'text-blue-700' : difference < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                        {difference > 0 ? `+${difference}` : difference}
                                    </div>
                                </div>
                            </div>
                            
                            {itemData && binLocation && (
                                <div className={`p-3 rounded border flex items-center gap-3 shadow-sm ${binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() 
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950' 
                                    : 'bg-red-50 border-red-200 text-red-950'}`}>
                                    <div className="shrink-0">
                                        {binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() ? (
                                            <svg className="w-5 h-5 text-emerald-700" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                        ) : (
                                            <svg className="w-5 h-5 text-red-700" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-semibold uppercase tracking-widest leading-none">
                                            {binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() 
                                                ? 'Ubicación Correcta' 
                                                : 'Discrepancia de Ubicación'}
                                        </span>
                                        {binLocation.toUpperCase() !== itemData.system_bin?.toUpperCase() && (
                                            <span className="text-[9px] font-medium opacity-80 uppercase mt-1">SISTEMA INDICA: {itemData.system_bin || 'NO DEFINIDA'}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Tarjeta del Historial */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden mt-4">
                        <div className="bg-zinc-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                            <h2 className="text-[11px] font-semibold text-black uppercase tracking-wider">Historial de Auditorías Recientes</h2>
                        </div>
                        <div className="overflow-x-auto max-h-[40vh]">
                            <table className="w-full text-xs border-collapse">
                                <thead className="bg-[#111827] text-white">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider border-r border-zinc-800">Fecha / Hora</th>
                                        <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider border-r border-zinc-800">Usuario</th>
                                        <th className="px-4 py-2 text-center text-[11px] font-medium uppercase tracking-wider border-r border-zinc-800">Bin</th>
                                        <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider border-r border-zinc-800">Ítem / SKU</th>
                                        <th className="px-4 py-2 text-center text-[11px] font-medium uppercase tracking-wider border-r border-zinc-800">Físico</th>
                                        <th className="px-4 py-2 text-center text-[11px] font-medium uppercase tracking-wider">Delta</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {recentAudits.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-16 text-center text-black/60 uppercase tracking-widest text-[11px]">
                                                No se han registrado auditorías en esta sesión
                                            </td>
                                        </tr>
                                    ) : (
                                        recentAudits.map((audit, idx) => (
                                            <tr key={audit.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'} hover:bg-blue-50 transition-colors border-b border-gray-100`}>
                                                <td className="px-4 py-2.5 text-black font-mono">{formatDate(audit.executed_date)}</td>
                                                <td className="px-4 py-2.5 text-black font-medium uppercase">{audit.username || '—'}</td>
                                                <td className="px-4 py-2.5 font-semibold text-black text-center bg-zinc-50/20">{audit.bin_location}</td>
                                                <td className="px-4 py-2.5 font-semibold text-[#1e4a74]">{audit.item_code}</td>
                                                <td className="px-4 py-2.5 text-center font-semibold text-black">{audit.physical_qty}</td>
                                                <td className={`px-4 py-2.5 text-center font-semibold ${audit.difference > 0 ? 'text-blue-700' : audit.difference < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                    {audit.difference > 0 ? `+${audit.difference}` : audit.difference}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                {/* Columna Lateral: Protocolo y Clasificación */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
                        <h3 className="text-[11px] font-semibold text-black uppercase tracking-wider mb-3 border-b border-zinc-100 pb-1.5">Protocolo de Operación</h3>
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <span className="text-[11px] font-semibold text-white bg-zinc-900 w-6 h-6 flex items-center justify-center rounded shrink-0 shadow-sm">01</span>
                                <p className="text-[10px] text-black font-medium leading-relaxed uppercase tracking-tight">Validar ubicación física mediante escaneo de código de bin.</p>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-[11px] font-semibold text-white bg-zinc-900 w-6 h-6 flex items-center justify-center rounded shrink-0 shadow-sm">02</span>
                                <p className="text-[10px] text-black font-medium leading-relaxed uppercase tracking-tight">Identificar SKU y confirmar descripción técnica en pantalla.</p>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-[11px] font-semibold text-white bg-zinc-900 w-6 h-6 flex items-center justify-center rounded shrink-0 shadow-sm">03</span>
                                <p className="text-[10px] text-black font-medium leading-relaxed uppercase tracking-tight">Realizar conteo ciego e ingresar unidades totales observadas.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
                        <h3 className="text-[11px] font-semibold text-black uppercase tracking-wider mb-3 border-b border-zinc-100 pb-1.5">Especificaciones Técnicas</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-semibold text-black uppercase tracking-wider">Clasificación ABC</span>
                                <span className="text-[11px] font-bold text-black border border-zinc-300 px-2 py-0.5 rounded bg-zinc-50">{itemData?.abc_code || '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {scannerOpen && <ScannerModal onScan={handleScan} onClose={() => setScannerOpen(false)} />}
        </div>
    );
};

export default ExpressAudit;
