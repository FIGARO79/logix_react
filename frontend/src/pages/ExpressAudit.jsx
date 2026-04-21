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
                // Salto automático a cantidad
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
        
        // Si el cambio es de más de 3 caracteres de golpe, probablemente sea un escaneo o pegado
        if (upperVal.length > prevVal.length + 3) {
            handleSearchItem(upperVal);
        }
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
            setTimeout(() => handleSearchItem(code.toUpperCase()), 100);
        }
        setScannerOpen(false);
    };

    const difference = itemData ? (parseInt(physicalQty || 0) - itemData.system_qty) : 0;

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 font-sans bg-[#fcfcfc] min-h-screen text-black">
            <ToastContainer position="top-right" autoClose={2000} />
            
            {/* Header Profesional - Alto Contraste */}
            <div className="mb-8 border-b-2 border-zinc-200 pb-6 flex justify-between items-end">
                <div className="flex flex-col gap-0">
                    <h1 className="text-xl font-normal tracking-tight text-black">Ciclo Manual</h1>
                    <p className="text-[10px] uppercase tracking-[0.15em] font-normal text-black mt-1">Inspección de Inventario y Auditoría de Ubicaciones</p>
                </div>
                <button 
                    onClick={resetAll} 
                    className="text-[10px] font-normal uppercase tracking-widest text-black hover:text-red-700 transition-colors border border-zinc-200 px-3 py-1.5 rounded hover:bg-zinc-50"
                >
                    Reiniciar Sesión
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Panel Izquierdo: Formulario y Tabla */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white border border-zinc-200 shadow-sm p-6 rounded space-y-5">
                        <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}`}</style>
                        
                        {/* Fila 1: BIN + SKU */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="text-[9px] font-bold text-black uppercase mb-1.5 block tracking-widest">Ubicación (BIN)</label>
                                <div className="flex">
                                    <input 
                                        ref={binRef}
                                        type="text" 
                                        value={binLocation}
                                        onChange={(e) => setBinLocation(e.target.value.toUpperCase())}
                                        onKeyDown={(e) => e.key === 'Enter' && itemRef.current?.focus()}
                                        style={{height:'40px'}}
                                        className="flex-1 py-0 px-3 border border-zinc-300 border-r-0 rounded-l bg-white text-sm font-mono font-bold outline-none focus:border-zinc-900 transition-colors"
                                        placeholder="SCAN BIN"
                                    />
                                    <button 
                                        onClick={() => { setScanTarget('bin'); setScannerOpen(true); }}
                                        style={{height:'40px',width:'40px'}}
                                        className="shrink-0 p-0 flex items-center justify-center border border-zinc-300 rounded-r bg-white text-black hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 26 26" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-black uppercase mb-1.5 block tracking-widest">Identificación (SKU)</label>
                                <div className="flex">
                                    <input 
                                        ref={itemRef}
                                        type="text" 
                                        value={itemCode}
                                        onChange={(e) => handleItemChange(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearchItem(e.target.value)}
                                        style={{height:'40px'}}
                                        className="flex-1 py-0 px-3 border border-zinc-300 border-r-0 rounded-l bg-white text-sm font-mono font-bold outline-none focus:border-zinc-900 transition-colors"
                                        placeholder="SCAN SKU"
                                    />
                                    <button 
                                        onClick={() => { setScanTarget('item'); setScannerOpen(true); }}
                                        style={{height:'40px',width:'40px'}}
                                        className="shrink-0 p-0 flex items-center justify-center border border-zinc-300 rounded-r bg-white text-black hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Fila 2: Descripción */}
                        <div>
                            <label className="text-[9px] font-bold text-black uppercase mb-1.5 block tracking-widest">Descripción del Producto</label>
                            <div style={{height:'40px'}} className="flex items-center px-3 bg-white border border-zinc-300 rounded text-[11px] font-bold text-black uppercase tracking-wide overflow-hidden">
                                {itemData?.description || '— Esperando entrada —'}
                            </div>
                        </div>

                        {/* Fila 3: Cantidad + Botón */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="text-[9px] font-bold text-black uppercase mb-1.5 block tracking-widest">Cantidad Observada</label>
                                <input 
                                    ref={qtyRef}
                                    type="number" 
                                    value={physicalQty}
                                    onChange={(e) => setPhysicalQty(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave(e)}
                                    style={{height:'40px'}}
                                    className="w-full py-0 px-3 border border-zinc-300 rounded bg-white text-base font-bold text-center outline-none focus:border-zinc-900 transition-colors"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-black uppercase mb-1.5 block tracking-widest">Acción</label>
                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving || !itemData}
                                    style={{height:'40px'}}
                                    className="w-full py-0 border border-zinc-300 rounded bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-[0.15em] hover:bg-black transition-colors active:scale-[0.98] disabled:bg-white disabled:text-black disabled:border-zinc-300"
                                >
                                    {isSaving ? "PROCESANDO..." : "CONFIRMAR REGISTRO"}
                                </button>
                            </div>
                        </div>

                        {/* Análisis de Inventario */}
                        <div className="pt-4 border-t border-zinc-200">
                            <label className="text-[9px] font-bold text-black uppercase mb-3 block tracking-widest">Análisis de Inventario</label>
                            <div className="grid grid-cols-3 gap-6 bg-white border border-zinc-300 rounded p-4">
                                <div>
                                    <p className="text-[8px] font-bold text-black uppercase mb-1">Stock Sistema</p>
                                    <p className="text-sm font-black text-black">{itemData?.system_qty || 0}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-bold text-black uppercase mb-1">Auditoría Física</p>
                                    <p className="text-sm font-black text-black">{physicalQty || 0}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-bold text-black uppercase mb-1">Diferencia</p>
                                    <p className={`text-sm font-black ${difference > 0 ? 'text-blue-600' : difference < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {difference > 0 ? `+${difference}` : difference}
                                    </p>
                                </div>
                            </div>

                            {itemData && binLocation && (
                                <div className={`mt-3 p-3 rounded border flex items-center gap-4 ${binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() 
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                                    : 'bg-red-50 border-red-200 text-red-900'}`}>
                                    <div className="shrink-0">
                                        {binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() ? (
                                            <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                        ) : (
                                            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                            {binLocation.toUpperCase() === itemData.system_bin?.toUpperCase() 
                                                ? 'Ubicación Correcta' 
                                                : 'Discrepancia de Ubicación'}
                                        </span>
                                        {binLocation.toUpperCase() !== itemData.system_bin?.toUpperCase() && (
                                            <span className="text-[9px] font-bold opacity-75 uppercase mt-1">SISTEMA INDICA: {itemData.system_bin || 'NO DEFINIDA'}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Table Section - Estilo Profesional */}
                    <div className="bg-white border border-zinc-400 shadow-lg overflow-hidden">
                        <div className="bg-zinc-100 px-6 py-4 border-b-2 border-zinc-200 flex justify-between items-center">
                            <h2 className="text-[11px] font-normal text-black uppercase tracking-[0.25em]">Historial de Auditorías Recientes</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-black text-white text-[10px] uppercase tracking-widest font-normal">
                                    <tr>
                                        <th className="px-6 py-4 border-r border-zinc-800">Hora</th>
                                        <th className="px-6 py-4 text-center border-r border-zinc-800">Bin</th>
                                        <th className="px-6 py-4 border-r border-zinc-800">Ítem / SKU</th>
                                        <th className="px-6 py-4 text-center border-r border-zinc-800">Físico</th>
                                        <th className="px-6 py-4 text-center">Delta</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y-2 divide-zinc-100 text-[11px]">
                                    {recentAudits.length === 0 ? (
                                        <tr><td colSpan="5" className="px-6 py-16 text-center text-black font-bold uppercase tracking-widest">No se han registrado auditorías en esta sesión</td></tr>
                                    ) : (
                                        recentAudits.map((audit, idx) => (
                                            <tr key={audit.id} className="hover:bg-zinc-50 transition-colors border-b border-zinc-100">
                                                <td className="px-6 py-4 text-black font-mono font-bold">{formatDate(audit.executed_date)}</td>
                                                <td className="px-6 py-4 font-black text-black text-center bg-zinc-50/50">{audit.bin_location}</td>
                                                <td className="px-6 py-4 font-black text-[#285f94]">{audit.item_code}</td>
                                                <td className="px-6 py-4 text-center font-black text-black">{audit.physical_qty}</td>
                                                <td className={`px-6 py-4 text-center font-black ${audit.difference > 0 ? 'text-blue-700' : audit.difference < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
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

                {/* Panel Derecho: Sidecards */}
                <div className="lg:col-span-1 space-y-6">
                    
                    {/* Protocol Card */}
                    <div className="bg-white border border-zinc-300 p-6 shadow-md">
                        <h3 className="text-[11px] font-normal text-black uppercase tracking-[0.2em] mb-6 border-b-2 border-zinc-100 pb-2">Protocolo de Operación</h3>
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <span className="text-[11px] font-black text-white bg-black w-7 h-7 flex items-center justify-center rounded shrink-0 shadow-sm">01</span>
                                <p className="text-[10px] text-black font-bold leading-relaxed uppercase tracking-tight">Validar ubicación física mediante escaneo de código de bin.</p>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-[11px] font-black text-white bg-black w-7 h-7 flex items-center justify-center rounded shrink-0 shadow-sm">02</span>
                                <p className="text-[10px] text-black font-bold leading-relaxed uppercase tracking-tight">Identificar SKU y confirmar descripción técnica en pantalla.</p>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-[11px] font-black text-white bg-black w-7 h-7 flex items-center justify-center rounded shrink-0 shadow-sm">03</span>
                                <p className="text-[10px] text-black font-bold leading-relaxed uppercase tracking-tight">Realizar conteo ciego e ingresar unidades totales observadas.</p>
                            </div>
                        </div>
                    </div>

                    {/* Parameters Card */}
                    <div className="bg-white border border-zinc-300 p-6 shadow-md">
                        <h3 className="text-[11px] font-normal text-black uppercase tracking-[0.2em] mb-6 border-b-2 border-zinc-100 pb-2">Especificaciones Técnicas</h3>
                        <div className="space-y-5">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-black uppercase tracking-wider">Clasificación ABC</span>
                                <span className="text-[11px] font-black text-black border border-black px-2 py-0.5 rounded-sm bg-zinc-50">{itemData?.abc_code || '—'}</span>
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
