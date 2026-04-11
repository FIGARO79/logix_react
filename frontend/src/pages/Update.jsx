import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const Update = () => {
    const { setTitle } = useOutletContext();
    const [messages, setMessages] = useState({ success: '', error: '', info: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState([]);
    const [updateOption, setUpdateOption] = useState('combine');
    const [isRobotRunning, setIsRobotRunning] = useState(false);

    // Robot Date States
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    const formatDateForInput = (date) => {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        return [year, month, day].join('-');
    };

    const [robotStartDate, setRobotStartDate] = useState(formatDateForInput(firstDayOfYear));
    const [robotEndDate, setRobotEndDate] = useState(formatDateForInput(today));
    const [clearPassword, setClearPassword] = useState('');
    const [backupPassword, setBackupPassword] = useState('');

    // GRN Selection State
    const [availableGrns, setAvailableGrns] = useState([]);
    const [selectedGrns, setSelectedGrns] = useState([]);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewedFile, setPreviewedFile] = useState(null);

    useEffect(() => { setTitle("Datos Maestros"); }, [setTitle]);

    // Polling robot status
    useEffect(() => {
        let interval;
        if (isRobotRunning) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch('/api/po_robot_status');
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'success') {
                            setMessages({ success: data.message, error: '', info: '' });
                            setIsRobotRunning(false);
                        } else if (data.status === 'error') {
                            setMessages({ success: '', error: data.message, info: '' });
                            setIsRobotRunning(false);
                        } else if (data.status === 'running') {
                            setMessages({ success: '', error: '', info: data.message || 'EJECUTANDO ROBOT EN SEGUNDO PLANO...' });
                        }
                    }
                } catch (err) { console.error(err); }
            }, 10000);
        }
        return () => clearInterval(interval);
    }, [isRobotRunning]);

    const fetchPreviewGrns = async (file) => {
        setIsPreviewing(true); setPreviewedFile(file);
        try {
            const formData = new FormData(); formData.append('file', file);
            const res = await fetch('/api/preview_grn_file', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.grns) {
                setAvailableGrns(data.grns); setSelectedGrns(data.grns);
            }
        } catch (err) {
            setMessages({ success: '', error: "ERROR AL PREVISUALIZAR GRNS" });
        } finally { setIsPreviewing(false); }
    };

    useEffect(() => {
        const grnFile = files.find(f => {
            const name = f.name.toLowerCase();
            return name.includes('280') || name.includes('pedido') || name.includes('reporte');
        });
        if (grnFile && grnFile !== previewedFile && !isPreviewing) fetchPreviewGrns(grnFile);
        else if (!grnFile) { setAvailableGrns([]); setSelectedGrns([]); setPreviewedFile(null); }
    }, [files]);

    const handleFiles = (newFiles) => { setFiles(prev => [...prev, ...Array.from(newFiles)]); };
    const removeFile = (idx) => { setFiles(prev => prev.filter((_, i) => i !== idx)); };

    const handleFileUpdate = async (e) => {
        e.preventDefault(); setMessages({ success: '', error: '' }); setIsLoading(true);
        const formData = new FormData();
        files.forEach(file => {
            const name = file.name.toLowerCase();
            if (name.includes('master') || name.includes('item') || name.includes('maestro') || name.includes('250')) formData.append('item_master', file);
            else if (name.includes('0006') || name.includes('reserva')) formData.append('reservation_file', file);
            else if (name.includes('280') || name.includes('pedido') || name.includes('reporte')) {
                if (name.endsWith('.xlsx')) formData.append('grn_excel', file);
                else formData.append('grn_file', file);
            }
            else if (name.includes('240') || name.includes('picking')) formData.append('picking_file', file);
            else if (name.includes('extractor') || name.includes('purchase')) formData.append('po_extractor', file);
        });
        formData.append('update_option_280', updateOption);
        if (availableGrns.length > 0) formData.append('selected_grns_280', JSON.stringify(selectedGrns));

        try {
            const res = await fetch('/api/update', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok) { setMessages({ success: data.message, error: '' }); setFiles([]); }
            else setMessages({ success: '', error: data.error || "ERROR EN CARGA" });
        } catch (err) { setMessages({ success: '', error: err.message }); }
        finally { setIsLoading(false); }
    };

    const handleRunRobot = async () => {
        if (!window.confirm("¿INICIAR ROBOT DE DESCARGA?")) return;
        setIsRobotRunning(true); setMessages({ success: '', error: '', info: 'SINCRONIZANDO CON PORTAL...' });
        const fmt = (iso) => iso.split('-').reverse().join('/');
        try {
            const res = await fetch('/api/run_po_robot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start_date: fmt(robotStartDate), end_date: fmt(robotEndDate) })
            });
            if (!res.ok) { setIsRobotRunning(false); setMessages({ success: '', error: "ERROR AL ACTIVAR ROBOT" }); }
        } catch (err) { setIsRobotRunning(false); }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 font-sans bg-[#fcfcfc] min-h-screen text-zinc-800">
            
            {/* Header Profesional */}
            <div className="mb-8 border-b border-zinc-200 pb-6 flex justify-between items-end">
                <div className="flex flex-col gap-0">
                    <h1 className="text-[14px] font-normal text-black tracking-tight leading-none">Actualización de Sistema</h1>
                    <p className="text-black text-[8px] uppercase tracking-widest font-normal leading-none mt-0.5">Sincronización de Base de Datos y Ficheros Maestros</p>
                </div>
            </div>

            {messages.error && <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 border border-red-100 text-[10px] font-bold uppercase tracking-widest">{messages.error}</div>}
            {messages.info && <div className="mb-6 bg-blue-50 text-blue-600 px-4 py-3 border border-blue-100 text-[10px] font-bold uppercase tracking-widest animate-pulse">{messages.info}</div>}
            {messages.success && <div className="mb-6 bg-emerald-50 text-emerald-700 px-4 py-3 border border-emerald-100 text-[10px] font-bold uppercase tracking-widest">{messages.success}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Panel Izquierdo: Carga y Automatización */}
                <div className="lg:col-span-2 space-y-8">
                    
                    {/* Robot Section */}
                    <div className="bg-white border border-zinc-200 shadow-sm p-6">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-[12px] font-bold text-zinc-900 uppercase tracking-tight">Robot de Sincronización</h3>
                                <p className="text-[8px] text-zinc-400 uppercase font-medium mt-1">Descarga automática de PO / Waybill desde Portal</p>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${isRobotRunning ? 'bg-blue-50 text-blue-600' : 'bg-zinc-100 text-zinc-400'}`}>
                                {isRobotRunning ? 'ACTIVE' : 'IDLE'}
                            </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 items-end bg-zinc-50 p-4 rounded border border-zinc-100">
                            <div className="flex-1 space-y-1">
                                <label className="text-[9px] font-bold text-zinc-400 uppercase">Rango de Fecha (ATD)</label>
                                <div className="flex items-center gap-2">
                                    <input type="date" value={robotStartDate} onChange={e => setRobotStartDate(e.target.value)} className="flex-1 h-9 border border-zinc-200 rounded px-3 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                                    <span className="text-zinc-300">—</span>
                                    <input type="date" value={robotEndDate} onChange={e => setRobotEndDate(e.target.value)} className="flex-1 h-9 border border-zinc-200 rounded px-3 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                                </div>
                            </div>
                            <button 
                                onClick={handleRunRobot} 
                                disabled={isRobotRunning || isLoading}
                                className="h-9 px-6 bg-[#285f94] text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-[#1e4a74] disabled:bg-zinc-200 transition-all shadow-sm"
                            >
                                {isRobotRunning ? 'EJECUTANDO...' : 'SINCRO PORTAL'}
                            </button>
                        </div>
                    </div>

                    {/* File Upload Section */}
                    <div className="bg-white border border-zinc-200 shadow-sm p-6">
                        <h3 className="text-[12px] font-bold text-zinc-900 uppercase tracking-tight mb-6">Carga Manual de Ficheros</h3>
                        
                        <form onSubmit={handleFileUpdate}>
                            <div 
                                className={`border-2 border-dashed rounded-lg p-10 text-center transition-all cursor-pointer mb-6 ${dragActive ? 'border-blue-500 bg-blue-50/30' : 'border-zinc-200 hover:border-zinc-400 bg-zinc-50/50'}`}
                                onDragEnter={() => setDragActive(true)}
                                onDragLeave={() => setDragActive(false)}
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                                onClick={() => document.getElementById('file-upload').click()}
                            >
                                <input id="file-upload" type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
                                <div className="text-zinc-400">
                                    <p className="text-[11px] font-bold uppercase tracking-widest mb-1 text-zinc-600">Click para seleccionar o arrastre archivos</p>
                                    <p className="text-[9px] uppercase font-medium">Soporta: CSV (250, 280, 240) y Excel (.xlsx)</p>
                                </div>
                            </div>

                            {files.length > 0 && (
                                <div className="mb-6 space-y-2">
                                    {files.map((file, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded">
                                            <span className="text-[11px] font-bold text-zinc-700 uppercase tracking-tight">{file.name}</span>
                                            <button type="button" onClick={() => removeFile(idx)} className="text-red-400 hover:text-red-600 text-[9px] font-bold uppercase">Remover</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {availableGrns.length > 0 && (
                                <div className="mb-6 bg-zinc-50 border border-zinc-200 p-4 rounded shadow-sm">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-zinc-100">
                                        <div className="flex items-center gap-4">
                                            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Filtro de GRN (Archivo 280)</h4>
                                            <div className="flex gap-3 border-l border-zinc-200 pl-4">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setSelectedGrns([...availableGrns])} 
                                                    className={`text-[9px] font-bold uppercase tracking-tight transition-colors ${selectedGrns.length === availableGrns.length ? 'text-[#285f94]' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                >
                                                    Marcar Todas
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setSelectedGrns([])} 
                                                    className={`text-[9px] font-bold uppercase tracking-tight transition-colors ${selectedGrns.length === 0 ? 'text-[#285f94]' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                >
                                                    Desmarcar Todas
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" value="combine" checked={updateOption === 'combine'} onChange={e => setUpdateOption(e.target.value)} className="accent-[#285f94]" />
                                                <span className="text-[10px] font-bold text-zinc-600 uppercase">Combinar</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" value="replace" checked={updateOption === 'replace'} onChange={e => setUpdateOption(e.target.value)} className="accent-[#285f94]" />
                                                <span className="text-[10px] font-bold text-zinc-600 uppercase">Reemplazar</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="max-h-40 overflow-y-auto bg-white p-3 border border-zinc-100 grid grid-cols-2 md:grid-cols-3 gap-2 shadow-inner rounded">
                                        {availableGrns.map(grn => (
                                            <div key={grn} className="flex items-center gap-2">
                                                <input type="checkbox" checked={selectedGrns.includes(grn)} onChange={e => e.target.checked ? setSelectedGrns(p => [...p, grn]) : setSelectedGrns(p => p.filter(g => g !== grn))} className="accent-[#285f94]" />
                                                <span className="text-[10px] font-mono text-zinc-500">{grn}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button disabled={isLoading || files.length === 0} type="submit" className="w-full h-11 bg-zinc-900 text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded hover:bg-zinc-800 disabled:bg-zinc-100 transition-all shadow-md">
                                {isLoading ? 'PROCESANDO DATOS...' : 'PUBLICAR ACTUALIZACIÓN'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Panel Derecho: Mantenimiento */}
                <div className="lg:col-span-1 space-y-6">
                    
                    {/* Database Maintenance */}
                    <div className="bg-white border border-zinc-200 p-6">
                        <h3 className="text-[10px] font-bold text-black uppercase tracking-[0.2em] mb-6 border-b border-zinc-50 pb-2">Mantenimiento de Datos</h3>
                        
                        <div className="space-y-8">
                            {/* Backup */}
                            <form onSubmit={async (e) => {
                                e.preventDefault(); setIsLoading(true);
                                try {
                                    const res = await fetch('/api/export_all_log', { method: 'POST', body: new FormData(e.target) });
                                    if (res.ok) {
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a'); a.href = url; a.download = `LOGIX_BACKUP_${new Date().toISOString().slice(0,10)}.xlsx`;
                                        a.click(); setMessages({ success: "BACKUP GENERADO", error: '' });
                                    }
                                } catch (err) { setMessages({ error: "ERROR EN BACKUP" }); }
                                finally { setIsLoading(false); setBackupPassword(''); }
                            }} className="space-y-3">
                                <label className="text-[10px] font-normal text-black uppercase">Exportación de Históricos</label>
                                <input type="password" name="password" placeholder="PASSWORD ADMIN" value={backupPassword} onChange={e => setBackupPassword(e.target.value)} className="w-full h-9 border border-zinc-200 rounded px-3 text-[10px] placeholder:text-[10px] outline-none bg-zinc-50 focus:bg-white" required />
                                <button type="submit" className="w-full h-9 border border-zinc-300 text-zinc-600 text-[10px] font-bold uppercase tracking-widest rounded hover:bg-zinc-50">Generar Respaldo</button>
                            </form>

                            {/* Danger Zone */}
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                if (!window.confirm("¿BORRAR TODA LA BASE DE DATOS?")) return;
                                setIsLoading(true);
                                try {
                                    const res = await fetch('/api/clear_database', { method: 'POST', body: new FormData(e.target) });
                                    const d = await res.json();
                                    if (res.ok) setMessages({ success: d.message }); else setMessages({ error: d.error });
                                } catch (err) { setMessages({ error: "ERROR CRÍTICO" }); }
                                finally { setIsLoading(false); setClearPassword(''); }
                            }} className="space-y-3 pt-6 border-t border-zinc-100">
                                <label className="text-[10px] font-normal text-red-400 uppercase">Zona de Riesgo: Reset Total</label>
                                <input type="password" name="password" placeholder="PASSWORD ADMIN" value={clearPassword} onChange={e => setClearPassword(e.target.value)} className="w-full h-9 border border-red-100 rounded px-3 text-[10px] placeholder:text-[10px] outline-none bg-red-50/30 focus:bg-white" required />
                                <button type="submit" className="w-full h-9 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-red-700 shadow-sm">Limpiar Base de Datos</button>
                            </form>
                        </div>
                    </div>

                    {/* Technical Specs */}
                    <div className="bg-white border border-zinc-200 p-6 text-black">
                        <h3 className="text-[10px] font-bold text-black uppercase tracking-[0.2em] mb-4">Especificaciones</h3>
                        <ul className="text-[9px] space-y-2 uppercase font-normal leading-relaxed">
                            <li className="flex justify-between border-b border-zinc-800 pb-1"><span>Maestro Ítems</span><span className="text-black">CSV-250</span></li>
                            <li className="flex justify-between border-b border-zinc-800 pb-1"><span>Entradas GRN</span><span className="text-black">CSV-280 / XLSX</span></li>
                            <li className="flex justify-between border-b border-zinc-800 pb-1"><span>Salidas Picking</span><span className="text-black">CSV-240</span></li>
                            <li className="flex justify-between"><span>PO Extractor</span><span className="text-black">Purchase_Order</span></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Update;
