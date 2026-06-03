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
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(today.getDate() - 60);

    const formatDateForInput = (date) => {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        return [year, month, day].join('-');
    };

    const [robotStartDate, setRobotStartDate] = useState(formatDateForInput(sixtyDaysAgo));
    const [robotEndDate, setRobotEndDate] = useState(formatDateForInput(today));
    const [clearPassword, setClearPassword] = useState('');
    const [backupPassword, setBackupPassword] = useState('');
    const [deleteMaestroPassword, setDeleteMaestroPassword] = useState('');
    const [syncStatus, setSyncStatus] = useState({});

    // GRN Selection State
    const [availableGrns, setAvailableGrns] = useState([]);
    const [selectedGrns, setSelectedGrns] = useState([]);
    const [maestroGrns, setMaestroGrns] = useState([]);
    const [selectedMaestroGrns, setSelectedMaestroGrns] = useState([]);
    const [isFetchingMaestro, setIsFetchingMaestro] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewedFile, setPreviewedFile] = useState(null);

    const fetchSyncStatus = async () => {
        try {
            const res = await fetch('/api/sync/status');
            if (res.ok) {
                const data = await res.json();
                setSyncStatus(data);
            }
        } catch (err) {
            console.error("Error fetching sync status:", err);
        }
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp || timestamp === 0) return 'SIN DATOS';
        try {
            const date = new Date(timestamp * 1000);
            return date.toLocaleString('es-CO', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false
            });
        } catch (e) { 
            return 'SIN DATOS'; 
        }
    };

    useEffect(() => {
        setTitle("Datos Maestros");
        fetchSyncStatus();
    }, [setTitle]);

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
                            fetchSyncStatus();
                        } else if (data.status === 'error') {
                            setMessages({ success: '', error: data.message, info: '' });
                            setIsRobotRunning(false);
                            fetchSyncStatus();
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
            if (res.ok) { 
                setMessages({ success: data.message, error: '' }); 
                setFiles([]); 
                fetchSyncStatus();
            }
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

    const fetchMaestroGrns = async () => {
        setIsFetchingMaestro(true);
        setMessages({ success: '', error: '', info: '' }); // Limpiar mensajes previos
        console.log("Cargando maestro de GRNs...");
        try {
            const res = await fetch('/api/grn/unique_references');
            if (res.ok) {
                const data = await res.json();
                console.log("Datos recibidos:", data);
                setMaestroGrns(data);
                if (data.length === 0) {
                    setMessages({ success: '', error: '', info: "EL MAESTRO ESTÁ VACÍO. NO HAY GRNS PARA ELIMINAR." });
                }
            } else {
                const errorData = await res.json().catch(() => ({ detail: "Error desconocido" }));
                console.error("Error al cargar:", errorData);
                const errorMsg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
                setMessages({ success: '', error: `ERROR AL CARGAR MAESTRO: ${errorMsg || res.statusText}` });
            }
        } catch (err) {
            console.error("Error de conexión:", err);
            setMessages({ success: '', error: "ERROR DE CONEXIÓN AL SERVIDOR" });
        } finally {
            setIsFetchingMaestro(false);
        }
    };

    const handleDeleteMaestroGrns = async (e) => {
        e.preventDefault();
        if (selectedMaestroGrns.length === 0) return alert("Seleccione al menos un GRN");
        if (!window.confirm(`¿ELIMINAR ${selectedMaestroGrns.length} NÚMEROS DE GRN DEL SISTEMA?`)) return;

        setIsLoading(true);
        try {
            const res = await fetch('/api/grn/delete_bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grn_numbers: selectedMaestroGrns,
                    password: deleteMaestroPassword
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMessages({ success: data.message, error: '' });
                setMaestroGrns(prev => prev.filter(g => !selectedMaestroGrns.includes(g)));
                setSelectedMaestroGrns([]);
                setDeleteMaestroPassword('');
            } else {
                const errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
                setMessages({ success: '', error: errorMsg || "ERROR EN ELIMINACIÓN" });
            }
        } catch (err) {
            setMessages({ success: '', error: "ERROR DE CONEXIÓN" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 font-sans bg-[#fcfcfc] min-h-screen text-black text-[12px]">
            
            {/* Header Profesional */}
            <div className="mb-8 border-b border-zinc-200 pb-6 flex justify-between items-end">
                <div className="flex flex-col gap-0">
                    <h1 className="text-[14px] font-normal text-black tracking-tight">Actualización de Sistema</h1>
                    <p className="text-[12px] tracking-tight font-normal text-black leading-none mt-0.5">Sincronización de Base de Datos y Ficheros Maestros</p>
                </div>
            </div>

            {messages.error && <div className="mb-6 bg-red-50 text-black px-4 py-3 border border-red-100 text-[12px] font-normal uppercase tracking-widest">{messages.error}</div>}
            {messages.info && <div className="mb-6 bg-blue-50 text-black px-4 py-3 border border-blue-100 text-[12px] font-normal uppercase tracking-widest animate-pulse">{messages.info}</div>}
            {messages.success && <div className="mb-6 bg-emerald-50 text-black px-4 py-3 border border-emerald-100 text-[12px] font-normal uppercase tracking-widest">{messages.success}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* Robot Section */}
                <div className="lg:col-span-2 lg:row-start-1 lg:col-start-1 bg-white border border-zinc-200 shadow-sm p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-[12px] font-normal text-black uppercase tracking-tight">Robot de Sincronización</h3>
                            <p className="text-[12px] text-black uppercase font-normal tracking-tight mt-1">Descarga automática de PO / Waybill desde Portal</p>
                        </div>
                        <span className={`text-[12px] font-normal text-black px-2 py-0.5 rounded border ${isRobotRunning ? 'bg-blue-50 border-blue-200' : 'bg-zinc-100 border-zinc-200'}`}>
                            {isRobotRunning ? 'ACTIVE' : 'IDLE'}
                        </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 items-end bg-zinc-50 p-4 rounded border border-zinc-100">
                        <div className="flex-1 space-y-1">
                            <label className="text-[12px] font-normal text-black uppercase">Rango de Fecha (ATD)</label>
                            <div className="flex items-center gap-2">
                                <input type="date" value={robotStartDate} onChange={e => setRobotStartDate(e.target.value)} className="flex-1 h-9 border border-zinc-200 rounded px-3 text-[12px] outline-none focus:ring-1 focus:ring-black text-black" />
                                <span className="text-black">—</span>
                                <input type="date" value={robotEndDate} onChange={e => setRobotEndDate(e.target.value)} className="flex-1 h-9 border border-zinc-200 rounded px-3 text-[12px] outline-none focus:ring-1 focus:ring-black text-black" />
                            </div>
                        </div>
                        <button 
                            onClick={handleRunRobot} 
                            disabled={isRobotRunning || isLoading}
                            className="h-9 px-6 border border-black bg-white text-black text-[12px] font-normal uppercase tracking-tight rounded hover:bg-blue-500 hover:text-white hover:border-blue-500 disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400 transition-all shadow-sm"
                        >
                            {isRobotRunning ? 'EJECUTANDO...' : 'SINCRO PORTAL'}
                        </button>
                    </div>
                </div>

                {/* File Upload Section */}
                <div className="lg:col-span-2 lg:row-start-2 lg:col-start-1 bg-white border border-zinc-200 shadow-sm p-6">
                    <h3 className="text-[12px] font-normal text-black uppercase tracking-tight mb-6">Carga Manual de Ficheros</h3>
                    
                    <form onSubmit={handleFileUpdate}>
                        <div 
                            className={`border-2 border-dashed rounded-lg p-10 text-center transition-all cursor-pointer mb-6 ${dragActive ? 'border-black bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400 bg-zinc-50/50'}`}
                            onDragEnter={() => setDragActive(true)}
                            onDragLeave={() => setDragActive(false)}
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                            onClick={() => document.getElementById('file-upload').click()}
                        >
                            <input id="file-upload" type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
                            <div className="text-black">
                                <p className="text-[12px] font-normal text-black uppercase tracking-tight mb-1">Click para seleccionar o arrastre archivos</p>
                                <p className="text-[12px] uppercase font-normal text-black">Soporta: CSV (250, 280, 240) y Excel (.xlsx)</p>
                            </div>
                        </div>

                        {files.length > 0 && (
                            <div className="mb-6 space-y-2">
                                {files.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded">
                                        <span className="text-[12px] font-normal text-black uppercase tracking-tight">{file.name}</span>
                                        <button type="button" onClick={() => removeFile(idx)} className="text-black hover:text-zinc-600 text-[12px] font-normal uppercase hover:underline">Remover</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {availableGrns.length > 0 && (
                            <div className="mb-6 bg-zinc-50 border border-zinc-200 p-4 rounded shadow-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-zinc-100">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-[12px] font-normal text-black uppercase tracking-tight">Filtro de GRN (Archivo 280)</h4>
                                        <div className="flex gap-3 border-l border-zinc-200 pl-4">
                                            <button 
                                                type="button" 
                                                onClick={() => setSelectedGrns([...availableGrns])} 
                                                className={`text-[12px] font-normal uppercase tracking-tight transition-colors ${selectedGrns.length === availableGrns.length ? 'text-black underline' : 'text-black opacity-60 hover:opacity-100'}`}
                                            >
                                                Marcar Todas
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => setSelectedGrns([])} 
                                                className={`text-[12px] font-normal uppercase tracking-tight transition-colors ${selectedGrns.length === 0 ? 'text-black underline' : 'text-black opacity-60 hover:opacity-100'}`}
                                            >
                                                Desmarcar Todas
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" value="combine" checked={updateOption === 'combine'} onChange={e => setUpdateOption(e.target.value)} className="accent-black" />
                                            <span className="text-[12px] font-normal text-black uppercase">Combinar</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" value="replace" checked={updateOption === 'replace'} onChange={e => setUpdateOption(e.target.value)} className="accent-black" />
                                            <span className="text-[12px] font-normal text-black uppercase">Reemplazar</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="max-h-40 overflow-y-auto bg-white p-3 border border-zinc-100 grid grid-cols-2 md:grid-cols-3 gap-2 shadow-inner rounded">
                                    {availableGrns.map(grn => (
                                        <div key={grn} className="flex items-center gap-2">
                                            <input type="checkbox" checked={selectedGrns.includes(grn)} onChange={e => e.target.checked ? setSelectedGrns(p => [...p, grn]) : setSelectedGrns(p => p.filter(g => g !== grn))} className="accent-black" />
                                            <span className="text-[12px] font-mono text-black">{grn}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button disabled={isLoading || files.length === 0} type="submit" className="w-full h-11 border border-black bg-white text-black text-[12px] font-normal uppercase tracking-tight rounded hover:bg-blue-500 hover:text-white hover:border-blue-500 disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400 transition-all shadow-md">
                            {isLoading ? 'PROCESANDO DATOS...' : 'PUBLICAR ACTUALIZACIÓN'}
                        </button>
                    </form>
                </div>

                {/* Database Maintenance */}
                <div className="lg:col-span-1 lg:row-span-2 lg:col-start-3 lg:row-start-1 lg:h-full bg-white border border-zinc-200 shadow-sm p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-[12px] font-normal text-black uppercase tracking-tight mb-6 border-b border-zinc-100 pb-2">Mantenimiento de Datos</h3>
                        
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
                                <label className="text-[12px] font-normal text-black uppercase">Exportación de Históricos</label>
                                <input type="password" name="password" placeholder="Contraseña Admin" value={backupPassword} onChange={e => setBackupPassword(e.target.value)} className="w-full h-9 border border-zinc-200 rounded px-3 text-[12px] placeholder:text-zinc-400 outline-none bg-zinc-50 focus:bg-white text-black" required />
                                <button type="submit" className="w-full h-9 border border-black bg-white text-black text-[12px] font-normal uppercase tracking-tight rounded hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-colors">Generar Respaldo</button>
                            </form>

                            {/* Delete GRN from Master */}
                            <div className="space-y-3 pt-6 border-t border-zinc-100">
                                <div className="flex justify-between items-center">
                                    <label className="text-[12px] font-normal text-black uppercase">Limpieza de Maestro (GRN)</label>
                                    <button 
                                        type="button" 
                                        onClick={maestroGrns.length > 0 || messages.info?.includes("VACÍO") ? () => { setMaestroGrns([]); setMessages(prev => ({...prev, info: ''})) } : fetchMaestroGrns} 
                                        disabled={isFetchingMaestro}
                                        className="text-[12px] font-normal text-black uppercase hover:underline"
                                    >
                                        {isFetchingMaestro ? 'CARGANDO...' : (maestroGrns.length > 0 || messages.info?.includes("VACÍO") ? 'OCULTAR' : 'VER LISTA')}
                                    </button>
                                </div>

                                {maestroGrns.length > 0 ? (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[12px] text-black uppercase">{maestroGrns.length} GRNs encontrados</span>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setSelectedMaestroGrns([...maestroGrns])} className="text-[12px] font-normal text-black hover:underline uppercase">Todas</button>
                                                <button type="button" onClick={() => setSelectedMaestroGrns([])} className="text-[12px] font-normal text-black hover:underline uppercase">Ninguna</button>
                                            </div>
                                        </div>
                                        <div className="max-h-32 overflow-y-auto bg-zinc-50 p-2 border border-zinc-100 rounded shadow-inner space-y-1">
                                            {maestroGrns.map(grn => (
                                                <div key={grn} className="flex items-center gap-2">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedMaestroGrns.includes(grn)} 
                                                        onChange={e => e.target.checked ? setSelectedMaestroGrns(p => [...p, grn]) : setSelectedMaestroGrns(p => p.filter(g => g !== grn))} 
                                                        className="accent-black" 
                                                    />
                                                    <span className="text-[12px] font-mono text-black">{grn}</span>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <form onSubmit={handleDeleteMaestroGrns} className="space-y-2">
                                            <input 
                                                type="password" 
                                                placeholder="Contraseña Admin" 
                                                value={deleteMaestroPassword} 
                                                onChange={e => setDeleteMaestroPassword(e.target.value)} 
                                                className="w-full h-8 border border-zinc-200 rounded px-3 text-[12px] outline-none bg-zinc-50 focus:bg-white text-black placeholder:text-zinc-400" 
                                                required 
                                            />
                                            <button 
                                                type="submit" 
                                                disabled={isLoading || selectedMaestroGrns.length === 0}
                                                className="w-full h-8 border border-black bg-white text-black text-[12px] font-normal uppercase tracking-tight rounded hover:bg-blue-500 hover:text-white hover:border-blue-500 disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400 transition-colors"
                                            >
                                                ELIMINAR SELECCIONADOS ({selectedMaestroGrns.length})
                                            </button>
                                        </form>
                                    </div>
                                ) : (
                                    messages.info && <p className="text-[12px] text-black italic">{messages.info}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Danger Zone at the bottom of the card */}
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
                    }} className="space-y-3 pt-6 border-t border-zinc-100 mt-8">
                        <label className="text-[12px] font-normal text-black uppercase">Zona de Riesgo: Reset Total</label>
                        <input type="password" name="password" placeholder="Contraseña Admin" value={clearPassword} onChange={e => setClearPassword(e.target.value)} className="w-full h-9 border border-zinc-200 rounded px-3 text-[12px] placeholder:text-zinc-400 outline-none bg-zinc-50 focus:bg-white text-black" required />
                        <button type="submit" className="w-full h-9 border border-black bg-white text-black text-[12px] font-normal uppercase tracking-tight hover:bg-blue-500 hover:text-white hover:border-blue-500 shadow-sm transition-colors">Limpiar Base de Datos</button>
                    </form>
                </div>

                {/* Fechas de Actualización */}
                <div className="lg:col-span-1 lg:col-start-3 lg:row-start-3 bg-white border border-zinc-200 shadow-sm p-6 text-black">
                    <h3 className="text-[12px] font-normal text-black uppercase tracking-tight mb-4 pb-2 border-b border-zinc-100 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Fechas de Actualización
                    </h3>
                    <div className="space-y-4">
                        {[
                            { label: "Maestro Ítems", filename: "AURRSGLBD0250.csv", key: "master_items" },
                            { label: "Entradas GRN", filename: "AURRSGLBD0280.csv", key: "grn_pending" },
                            { label: "Salidas Picking", filename: "AURRSGLBD0240.csv", key: "picking" },
                            { label: "Reservas Xdock", filename: "AURRSLAMP0006.csv", key: "xdock_reservations" },
                            { label: "PO Extractor", filename: "Purchase Order Extractor.xlsx", key: "po_extractor" }
                        ].map((item) => (
                            <div key={item.key} className="flex flex-col gap-1 pb-3 border-b border-zinc-100 last:border-0 last:pb-0">
                                <div className="flex justify-between items-center">
                                    <span className="text-[12px] font-normal text-black uppercase tracking-tight">{item.label}</span>
                                    <span className="text-[12px] font-mono bg-zinc-50 text-black px-1.5 py-0.5 rounded border border-zinc-200">{item.filename}</span>
                                </div>
                                <div className="flex justify-between items-center text-[12px]">
                                    <span className="text-black uppercase font-normal text-[12px] tracking-tight">Última Modificación</span>
                                    <span className="font-mono font-normal text-black">
                                        {formatTimestamp(syncStatus[item.key])}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Update;
