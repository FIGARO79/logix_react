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
            const res = await fetch('/api/view_counts/recordings');
            if (res.ok) {
                const data = await res.json();
                setRecentAudits(data.slice(0, 10));
            }
        } catch (e) { console.error(e); }
    };

    const handleSearchItem = async () => {
        if (!itemCode) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/find_item/${encodeURIComponent(itemCode)}/NA`);
            if (res.ok) {
                const data = await res.json();
                setItemData({
                    item_code: data.itemCode,
                    description: data.description,
                    system_qty: parseInt(data.physicalQty) || 0,
                    system_bin: data.binLocation,
                    abc_code: data.itemType || 'C'
                });
                setTimeout(() => qtyRef.current?.focus(), 100);
            } else {
                toast.warn("Item no encontrado");
                setItemData(null);
            }
        } catch (e) { toast.error("Error de búsqueda"); }
        finally { setLoading(false); }
    };

    const handleSave = async (e) => {
        e.preventDefault();
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
            setTimeout(() => handleSearchItem(), 100);
        }
        setScannerOpen(false);
    };

    const difference = itemData ? (parseInt(physicalQty || 0) - itemData.system_qty) : 0;

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="flex flex-col h-full bg-[#f5f7fa] text-[var(--sap-text)] font-sans">
            <ToastContainer position="top-right" autoClose={2000} />
            
            <div className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
                <div className="flex justify-between items-center max-w-6xl mx-auto w-full">
                    <div>
                        <h1 className="text-base font-bold tracking-tight text-[#001d35] uppercase">Auditoría Express</h1>
                        <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-semibold">Módulo de Inspección Aleatoria</p>
                    </div>
                    <button onClick={resetAll} className="h-8 px-4 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded hover:bg-gray-200 uppercase tracking-widest transition-all font-bold">Limpiar Sesión</button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-white p-5 rounded border border-gray-300 shadow-sm">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Ubicación Escaneada</label>
                                    <div className="flex gap-1.5 h-10">
                                        <input 
                                            ref={binRef}
                                            type="text" 
                                            value={binLocation}
                                            onChange={(e) => setBinLocation(e.target.value.toUpperCase())}
                                            onKeyDown={(e) => e.key === 'Enter' && itemRef.current?.focus()}
                                            className="flex-1 px-3 border border-gray-300 rounded focus:border-[var(--sap-primary)] outline-none text-sm font-mono font-bold bg-gray-50"
                                            placeholder="SCAN BIN"
                                        />
                                        <button 
                                            onClick={() => { setScanTarget('bin'); setScannerOpen(true); }}
                                            className="h-full aspect-square flex items-center justify-center bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="form-label">Identificación Ítem</label>
                                    <div className="flex gap-1.5 h-10">
                                        <input 
                                            ref={itemRef}
                                            type="text" 
                                            value={itemCode}
                                            onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearchItem()}
                                            className="flex-1 px-3 border border-gray-300 rounded focus:border-[var(--sap-primary)] outline-none text-sm font-mono font-bold bg-gray-50"
                                            placeholder="SCAN SKU"
                                        />
                                        <button 
                                            onClick={() => { setScanTarget('item'); setScannerOpen(true); }}
                                            className="h-full aspect-square flex items-center justify-center bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="form-label">Descripción Técnica</label>
                                <div className="data-field min-h-[2.5rem] flex items-center bg-gray-50 border-gray-200 text-xs font-semibold uppercase">{itemData?.description || ''}</div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="form-label">Cantidad Observada</label>
                                    <input 
                                        ref={qtyRef}
                                        type="number" 
                                        value={physicalQty}
                                        onChange={(e) => setPhysicalQty(e.target.value)}
                                        className="w-full h-10 px-3 border border-gray-300 rounded focus:border-[var(--sap-primary)] outline-none text-lg font-bold text-center bg-white"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex flex-col justify-end">
                                    <button 
                                        onClick={handleSave}
                                        disabled={isSaving || !itemData}
                                        className={`btn-sap btn-primary h-10 w-full flex items-center justify-center gap-2 uppercase tracking-widest font-bold ${isSaving ? 'opacity-60' : ''}`}
                                        style={{ background: '#285f94' }}
                                    >
                                        {isSaving ? "Procesando..." : "Confirmar Hallazgo"}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 border border-gray-200 rounded">
                                <h3 className="text-[9px] font-bold uppercase text-gray-500 border-b border-gray-200 pb-1 mb-3 tracking-[0.15em]">Análisis de Discrepancia</h3>
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div><label className="form-label">Libro (Sistema)</label><div className="text-sm font-bold text-gray-600">{itemData?.system_qty || 0}</div></div>
                                    <div><label className="form-label">Físico (Auditor)</label><div className="text-sm font-bold text-gray-900">{physicalQty || 0}</div></div>
                                    <div>
                                        <label className="form-label">Delta</label>
                                        <div className={`text-sm font-bold ${difference > 0 ? 'text-blue-700' : difference < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                            {difference > 0 ? `+${difference}` : difference}
                                        </div>
                                    </div>
                                </div>

                                {itemData && binLocation && (
                                    <div className={`mt-2 p-2.5 rounded border-l-4 flex items-start gap-3 ${binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() 
                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800' 
                                        : 'bg-red-50 border-red-500 text-red-800'}`}>
                                        <div className="mt-0.5">
                                            {binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() ? (
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold uppercase tracking-wider">
                                                {binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() 
                                                    ? 'Estado: Ubicación Validada' 
                                                    : 'Estado: Discrepancia de Ubicación'}
                                            </span>
                                            {binLocation.toUpperCase() !== itemData.system_bin?.toUpperCase() && (
                                                <span className="text-[9px] font-medium opacity-90 uppercase mt-0.5">Localización maestra registrada: {itemData.system_bin || 'NO DEFINIDA'}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden">
                            <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 flex justify-between items-center">
                                <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em]">Auditorías Recientes</h2>
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[#354a5f] text-white text-[9px] uppercase tracking-widest">
                                        <tr>
                                            <th className="px-4 py-2.5 font-bold">Registro</th>
                                            <th className="px-4 py-2.5 font-bold text-center">Bin</th>
                                            <th className="px-4 py-2.5 font-bold">Ítem / SKU</th>
                                            <th className="px-4 py-2.5 text-center font-bold">Cant.</th>
                                            <th className="px-4 py-2.5 text-center font-bold">Delta</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 text-[10px]">
                                        {recentAudits.length === 0 ? (
                                            <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400 font-medium uppercase tracking-widest">Esperando registros de auditoría</td></tr>
                                        ) : (
                                            recentAudits.map((audit, idx) => (
                                                <tr key={audit.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50 transition-colors`}>
                                                    <td className="px-4 py-2 text-gray-500 font-mono">{formatDate(audit.executed_date)}</td>
                                                    <td className="px-4 py-2 font-bold text-gray-800 text-center">{audit.bin_location}</td>
                                                    <td className="px-4 py-2 font-bold text-[#285f94]">{audit.item_code}</td>
                                                    <td className="px-4 py-2 text-center font-bold text-gray-700">{audit.physical_qty}</td>
                                                    <td className={`px-4 py-2 text-center font-bold ${audit.difference > 0 ? 'text-blue-700' : audit.difference < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
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

                    <div className="space-y-4">
                        <div className="bg-white border border-gray-300 p-4 rounded shadow-sm border-t-4 border-t-blue-600">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 text-blue-900 mb-3">
                                Protocolo de Operación
                            </h4>
                            <div className="space-y-3">
                                <div className="flex gap-3">
                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 w-5 h-5 flex items-center justify-center rounded-full shrink-0 border border-blue-100">1</span>
                                    <p className="text-[10px] text-gray-600 leading-snug">Validar ubicación física mediante escaneo de código de bin.</p>
                                </div>
                                <div className="flex gap-3">
                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 w-5 h-5 flex items-center justify-center rounded-full shrink-0 border border-blue-100">2</span>
                                    <p className="text-[10px] text-gray-600 leading-snug">Identificar SKU y confirmar descripción técnica en pantalla.</p>
                                </div>
                                <div className="flex gap-3">
                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 w-5 h-5 flex items-center justify-center rounded-full shrink-0 border border-blue-100">3</span>
                                    <p className="text-[10px] text-gray-600 leading-snug">Realizar conteo ciego e ingresar unidades totales observadas.</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-300 rounded p-4 shadow-sm">
                            <h4 className="text-[10px] font-bold uppercase text-gray-400 mb-3 tracking-widest border-b border-gray-100 pb-2">Parámetros de Inventario</h4>
                            <div className="space-y-3">
                                <div><p className="text-[9px] font-bold text-gray-400 uppercase">Clasificación ABC</p><p className="text-xs font-bold text-gray-700">{itemData?.abc_code || 'SIN DEFINIR'}</p></div>
                                <div><p className="text-[9px] font-bold text-gray-400 uppercase">Conectividad de Red</p><div className="flex items-center gap-1.5 mt-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-[10px] font-bold text-emerald-600 uppercase">En Línea</span></div></div>
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
