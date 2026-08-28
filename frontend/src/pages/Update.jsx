import React, { useState, useEffect, useCallback } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const Update = () => {
    const { setTitle } = useOutletContext();
    const [messages, setMessages] = useState({ success: '', error: '', info: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState([]);
    const [updateOption, setUpdateOption] = useState('combine');
    const [isRobotRunning, setIsRobotRunning] = useState(false);
    const [robotMessage, setRobotMessage] = useState({ type: '', text: '' });

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
    const [showBackupPassword, setShowBackupPassword] = useState(false);
    const [showDeleteMaestroPassword, setShowDeleteMaestroPassword] = useState(false);
    const [showClearPassword, setShowClearPassword] = useState(false);
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

        // Verificar si el robot ya está ejecutándose al cargar la vista
        const checkInitialRobotStatus = async () => {
            try {
                const res = await fetch('/api/po_robot_status');
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === 'running') {
                        setIsRobotRunning(true);
                        setRobotMessage({ type: 'info', text: data.message || 'EJECUTANDO ROBOT EN SEGUNDO PLANO...' });
                    }
                }
            } catch (err) { console.error("Error al consultar estado inicial del robot:", err); }
        };
        checkInitialRobotStatus();
    }, [setTitle]);

    // Polling robot status independientemente de la carga de archivos
    useEffect(() => {
        let interval;
        if (isRobotRunning) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch('/api/po_robot_status');
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'success') {
                            setRobotMessage({ type: 'success', text: data.message });
                            setIsRobotRunning(false);
                            fetchSyncStatus();
                        } else if (data.status === 'error') {
                            setRobotMessage({ type: 'error', text: data.message });
                            setIsRobotRunning(false);
                            fetchSyncStatus();
                        } else if (data.status === 'running') {
                            setRobotMessage({ type: 'info', text: data.message || 'EJECUTANDO ROBOT EN SEGUNDO PLANO...' });
                        }
                    }
                } catch (err) { console.error(err); }
            }, 10000);
        }
        return () => clearInterval(interval);
    }, [isRobotRunning]);

    // Temporizador para auto-ocultar mensajes de notificación tras 8 segundos
    useEffect(() => {
        if (messages.success || messages.error || messages.info) {
            const timer = setTimeout(() => {
                setMessages({ success: '', error: '', info: '' });
            }, 8000);
            return () => clearTimeout(timer);
        }
    }, [messages]);

    // Temporizador para auto-ocultar mensaje del robot cuando finaliza
    useEffect(() => {
        if (robotMessage.text && robotMessage.type !== 'info') {
            const timer = setTimeout(() => {
                setRobotMessage({ type: '', text: '' });
            }, 8000);
            return () => clearTimeout(timer);
        }
    }, [robotMessage]);

    const fetchPreviewGrns = useCallback(async (file) => {
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
    }, []);

    useEffect(() => {
        const grnFile = files.find(f => {
            const name = f.name.toLowerCase();
            return name.includes('280') || name.includes('pedido') || name.includes('reporte');
        });
        if (grnFile && grnFile !== previewedFile && !isPreviewing) fetchPreviewGrns(grnFile);
        else if (!grnFile) { setAvailableGrns([]); setSelectedGrns([]); setPreviewedFile(null); }
    }, [files, previewedFile, isPreviewing, fetchPreviewGrns]);

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
        setIsRobotRunning(true);
        setRobotMessage({ type: 'info', text: 'SINCRONIZANDO CON PORTAL...' });
        const fmt = (iso) => iso.split('-').reverse().join('/');
        try {
            const res = await fetch('/api/run_po_robot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start_date: fmt(robotStartDate), end_date: fmt(robotEndDate) })
            });
            if (!res.ok) {
                setIsRobotRunning(false);
                setRobotMessage({ type: 'error', text: "ERROR AL ACTIVAR ROBOT" });
            }
        } catch (err) {
            setIsRobotRunning(false);
            setRobotMessage({ type: 'error', text: "ERROR DE CONEXIÓN AL ACTIVAR ROBOT" });
        }
    };

    const fetchMaestroGrns = async () => {
        setIsFetchingMaestro(true);
        setMessages({ success: '', error: '', info: '' });
        try {
            const res = await fetch('/api/grn/unique_references');
            if (res.ok) {
                const data = await res.json();
                setMaestroGrns(data);
                if (data.length === 0) {
                    setMessages({ success: '', error: '', info: "EL MAESTRO ESTÁ VACÍO. NO HAY GRNS PARA ELIMINAR." });
                }
            } else {
                const errorData = await res.json().catch(() => ({ detail: "Error desconocido" }));
                const errorMsg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
                setMessages({ success: '', error: `ERROR AL CARGAR MAESTRO: ${errorMsg || res.statusText}` });
            }
        } catch (err) {
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
        <div className="max-w-[1440px] mx-auto px-6 py-4 font-sans bg-[#fcfcfc] min-h-screen text-zinc-900 text-[12px]">

            {/* Mensajes de Notificación con Temporizador y Cierre Manual */}
            {messages.error && (
                <div className="mb-4 bg-red-50 text-red-950 px-4 py-2.5 border border-red-200 rounded-lg text-[11px] font-normal uppercase tracking-wide flex items-center justify-between shadow-xs transition-all animate-fadeIn">
                    <div className="flex items-center gap-2">
                        <span className="text-red-700 font-normal">[ERROR]</span>
                        <span>{messages.error}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMessages(prev => ({ ...prev, error: '' }))}
                        className="text-red-600 hover:text-red-900 font-normal ml-4 !p-0 cursor-pointer"
                        style={{ width: '16px', height: '16px' }}
                        title="Cerrar"
                    >
                        ✕
                    </button>
                </div>
            )}
            {messages.info && (
                <div className="mb-4 bg-blue-50 text-blue-950 px-4 py-2.5 border border-blue-200 rounded-lg text-[11px] font-normal uppercase tracking-wide flex items-center justify-between shadow-xs transition-all animate-pulse">
                    <div className="flex items-center gap-2">
                        <span className="text-blue-700 font-normal">[INFO]</span>
                        <span>{messages.info}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMessages(prev => ({ ...prev, info: '' }))}
                        className="text-blue-600 hover:text-blue-900 font-normal ml-4 !p-0 cursor-pointer"
                        style={{ width: '16px', height: '16px' }}
                        title="Cerrar"
                    >
                        ✕
                    </button>
                </div>
            )}
            {messages.success && (
                <div className="mb-4 bg-emerald-50 text-emerald-950 px-4 py-2.5 border border-emerald-200 rounded-lg text-[11px] font-normal uppercase tracking-wide flex items-center justify-between shadow-xs transition-all animate-fadeIn">
                    <div className="flex items-center gap-2">
                        <span className="text-emerald-700 font-normal">[OK]</span>
                        <span>{messages.success}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMessages(prev => ({ ...prev, success: '' }))}
                        className="text-emerald-600 hover:text-emerald-900 font-normal ml-4 !p-0 cursor-pointer"
                        style={{ width: '16px', height: '16px' }}
                        title="Cerrar"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Grid Principal Simétrico en 2 Columnas Iguales (50% / 50%) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

                {/* ================= COLUMNA IZQUIERDA: INGESTA Y ACTUALIZACIÓN ================= */}
                <div className="flex flex-col gap-6 justify-between h-full">

                    {/* 1. Robot de Sincronización Automática */}
                    <div className="bg-white border border-zinc-200 rounded-lg shadow-xs p-5 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-center pb-3 mb-4 border-b border-zinc-100">
                                <div>
                                    <h3 className="text-[12px] font-normal text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '15px', height: '15px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        Robot de Sincronización
                                    </h3>
                                    <p className="text-[10px] text-zinc-500 font-normal">Descarga y cruce automático de PO / Waybill desde Portal</p>
                                </div>
                                <span className={`text-[10px] font-normal px-2.5 py-1 rounded-full border ${isRobotRunning ? 'bg-blue-50 border-blue-300 text-blue-700 animate-pulse' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>
                                    {isRobotRunning ? 'EN EJECUCIÓN' : 'INACTIVO'}
                                </span>
                            </div>

                            <div className="bg-zinc-50/80 p-3 rounded-lg border border-zinc-200 flex flex-col sm:flex-row gap-3 items-end">
                                <div className="flex-1 w-full space-y-1">
                                    <label className="text-[10px] font-normal text-zinc-700 uppercase tracking-tight">Rango de Fechas (ATD)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date"
                                            value={robotStartDate}
                                            onChange={e => setRobotStartDate(e.target.value)}
                                            className="flex-1 h-8 border border-zinc-300 rounded px-2 text-[11px] outline-none bg-white text-zinc-900 focus:border-[#285f94]"
                                        />
                                        <span className="text-zinc-400 font-normal">—</span>
                                        <input
                                            type="date"
                                            value={robotEndDate}
                                            onChange={e => setRobotEndDate(e.target.value)}
                                            className="flex-1 h-8 border border-zinc-300 rounded px-2 text-[11px] outline-none bg-white text-zinc-900 focus:border-[#285f94]"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleRunRobot}
                                    disabled={isRobotRunning || isLoading}
                                    className="w-full sm:w-auto h-8 px-4 text-[11px] font-normal text-white uppercase tracking-tight rounded bg-[#285f94] hover:bg-[#1e4a74] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer flex-shrink-0"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    {isRobotRunning ? 'SINCRONIZANDO...' : 'SINCRONIZAR PORTAL'}
                                </button>
                            </div>

                            {robotMessage.text && (
                                <div className={`mt-3 px-3.5 py-2 rounded-lg border text-[11px] font-normal uppercase tracking-wide flex items-center justify-between ${
                                    robotMessage.type === 'error' ? 'bg-red-50 text-red-950 border-red-200' :
                                    robotMessage.type === 'success' ? 'bg-emerald-50 text-emerald-950 border-emerald-200' :
                                    'bg-blue-50 text-blue-950 border-blue-200 animate-pulse'
                                }`}>
                                    <span>{robotMessage.text}</span>
                                    {robotMessage.type !== 'info' && (
                                        <button
                                            type="button"
                                            onClick={() => setRobotMessage({ type: '', text: '' })}
                                            className="text-zinc-600 hover:text-zinc-900 font-normal ml-3 text-[10px] uppercase hover:underline cursor-pointer"
                                        >
                                            Cerrar
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Carga Manual de Ficheros */}
                    <div className="bg-white border border-zinc-200 rounded-lg shadow-xs p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-100">
                                <div>
                                    <h3 className="text-[12px] font-normal text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '15px', height: '15px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        Carga Manual de Ficheros
                                    </h3>
                                    <p className="text-[10px] text-zinc-500 font-normal">Subida masiva de catálogos y transaccionales CSV / Excel</p>
                                </div>
                                <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                                    CSV / XLSX
                                </span>
                            </div>

                            <form onSubmit={handleFileUpdate} className="flex flex-col">
                                {/* Dropzone */}
                                <div
                                    className={`border-2 border-dashed rounded-lg p-5 text-center transition-all cursor-pointer mb-3.5 ${
                                        dragActive ? 'border-[#285f94] bg-blue-50/50 scale-[1.01]' : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50'
                                    }`}
                                    onDragEnter={() => setDragActive(true)}
                                    onDragLeave={() => setDragActive(false)}
                                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                    onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                                    onClick={() => document.getElementById('file-upload').click()}
                                >
                                    <input id="file-upload" type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
                                    <div className="flex flex-col items-center justify-center gap-1 text-zinc-700 py-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '24px', height: '24px' }} className="text-zinc-400 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <p className="text-[11px] font-normal uppercase tracking-tight text-zinc-800">
                                            Haz clic para seleccionar o arrastra archivos aquí
                                        </p>
                                        <p className="text-[10px] text-zinc-500 font-normal">
                                            Soporta: CSV (250, 280, 240, LAMP0006) y Excel (.xlsx)
                                        </p>
                                    </div>
                                </div>

                                {/* Lista de Archivos Seleccionados */}
                                {files.length > 0 && (
                                    <div className="mb-3.5 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200">
                                        <div className="flex justify-between items-center mb-1.5 pb-1 border-b border-zinc-200/80">
                                            <span className="text-[10px] font-normal text-zinc-700 uppercase tracking-tight">
                                                Archivos en Cola ({files.length}):
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setFiles([])}
                                                className="text-[10px] text-red-600 hover:text-red-800 hover:underline uppercase font-normal cursor-pointer"
                                            >
                                                Quitar Todos
                                            </button>
                                        </div>
                                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                            {files.map((file, idx) => (
                                                <div key={idx} className="flex items-center justify-between px-2.5 py-1 bg-white border border-zinc-200 rounded text-[11px]">
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span className="text-zinc-400 font-mono text-[10px]">#{idx + 1}</span>
                                                        <span className="font-normal text-zinc-900 truncate">{file.name}</span>
                                                        <span className="text-[10px] text-zinc-400 font-normal">({(file.size / 1024).toFixed(1)} KB)</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFile(idx)}
                                                        className="text-red-600 hover:text-red-800 text-[10px] font-normal uppercase hover:underline ml-2 flex-shrink-0 cursor-pointer"
                                                    >
                                                        Remover
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Filtro y Opciones de GRN 280 */}
                                {availableGrns.length > 0 && (
                                    <div className="mb-3.5 bg-zinc-50 border border-zinc-200 p-3 rounded-lg shadow-inner">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-1.5 border-b border-zinc-200">
                                            <div className="flex items-center gap-2.5">
                                                <span className="text-[10px] font-normal text-zinc-800 uppercase tracking-tight">
                                                    Filtro de GRN (280)
                                                </span>
                                                <div className="flex gap-2 border-l border-zinc-300 pl-2.5 text-[10px]">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedGrns([...availableGrns])}
                                                        className={`tracking-tight transition-colors cursor-pointer ${selectedGrns.length === availableGrns.length ? 'text-[12px] text-[#285f94] font-normal' : 'text-[12px] text-zinc-500 hover:text-zinc-800'}`}
                                                    >
                                                        Marcar Todas    
                                                    </button>
                                               
                                                    <button 
                                                        type="button"
                                                        onClick={() => setSelectedGrns([])}
                                                        className={`tracking-tight transition-colors cursor-pointer ${selectedGrns.length === 0 ? 'text-[12px] text-[#285f94] font-normal' : 'text-[12px] text-zinc-500 hover:text-zinc-800'}`}
                                                    >
                                                        Desmarcar Todas
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 text-[10px]">
                                                <label className="flex items-center gap-1 cursor-pointer">
                                                    <input type="radio" value="combine" checked={updateOption === 'combine'} onChange={e => setUpdateOption(e.target.value)} className="accent-[#285f94]" />
                                                    <span className="font-normal text-zinc-700 uppercase">Combinar</span>
                                                </label>
                                                <label className="flex items-center gap-1 cursor-pointer">
                                                    <input type="radio" value="replace" checked={updateOption === 'replace'} onChange={e => setUpdateOption(e.target.value)} className="accent-[#285f94]" />
                                                    <span className="font-normal text-zinc-700 uppercase">Reemplazar</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="max-h-24 overflow-y-auto bg-white p-2 border border-zinc-200 grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded">
                                            {availableGrns.map(grn => (
                                                <label key={grn} className="flex items-center gap-1.5 p-0.5 rounded hover:bg-zinc-50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedGrns.includes(grn)}
                                                        onChange={e => e.target.checked ? setSelectedGrns(p => [...p, grn]) : setSelectedGrns(p => p.filter(g => g !== grn))}
                                                        className="accent-[#285f94]"
                                                    />
                                                    <span className="text-[10px] font-normal text-zinc-800">{grn}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Botón Publicar Actualización */}
                                <button
                                    disabled={isLoading || files.length === 0}
                                    type="submit"
                                    className="w-full h-8 text-[11px] font-normal text-white uppercase tracking-normal rounded bg-[#285f94] hover:bg-[#1e4a74] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] mt-auto"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    {isLoading ? 'PROCESANDO Y ACTUALIZANDO DATOS...' : 'PUBLICAR ACTUALIZACIÓN'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* ================= COLUMNA DERECHA: ESTADO, MANTENIMIENTO Y SEGURIDAD ================= */}
                <div className="flex flex-col gap-6 justify-between h-full">

                    {/* 3. Fechas de Actualización de Maestros */}
                    <div className="bg-white border border-zinc-200 rounded-lg shadow-xs p-5">
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100">
                            <div>
                                <h3 className="text-[12px] font-normal text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Fechas de Actualización
                                </h3>
                                <p className="text-[10px] text-zinc-500 font-normal">Última modificación detectada en fuentes maestras</p>
                            </div>
                            <button
                                type="button"
                                onClick={fetchSyncStatus}
                                className="text-[10px] text-[#285f94] hover:text-[#1e4a74] hover:underline uppercase font-normal flex items-center gap-1 cursor-pointer"
                                title="Refrescar marcas de tiempo"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '11px', height: '11px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Refrescar
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            {[
                                { label: "Maestro Ítems", filename: "AURRSGLBD0250.csv", key: "master_items" },
                                { label: "Entradas GRN", filename: "AURRSGLBD0280.csv", key: "grn_pending" },
                                { label: "Salidas Picking", filename: "AURRSGLBD0240.csv", key: "picking" },
                                { label: "Reservas Xdock", filename: "AURRSLAMP0006.csv", key: "xdock_reservations" },
                                { label: "PO Extractor", filename: "Purchase Order Extractor.xlsx", key: "po_extractor" }
                            ].map((item) => {
                                const hasData = syncStatus[item.key] && syncStatus[item.key] !== 0;
                                return (
                                    <div key={item.key} className="p-2 rounded-lg border border-zinc-200 bg-zinc-50/70 flex flex-col gap-0.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-normal text-zinc-900 uppercase tracking-tight">{item.label}</span>
                                            <span className="text-[9px] font-mono font-normal bg-white text-zinc-600 px-1.5 py-0.2 rounded border border-zinc-200">
                                                {item.filename}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] pt-0.5 border-t border-zinc-200/60">
                                            <span className="text-zinc-500 uppercase font-normal text-[9px] tracking-tight">Última Modificación</span>
                                            <span className={`font-normal text-[10px] flex items-center gap-1 ${hasData ? 'text-zinc-800' : 'text-zinc-400'}`}>
                                                {hasData && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>}
                                                {formatTimestamp(syncStatus[item.key])}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 4. Mantenimiento y Respaldo de Datos */}
                    <div className="bg-white border border-zinc-200 rounded-lg shadow-xs p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div className="pb-3 mb-3.5 border-b border-zinc-100">
                                <h3 className="text-[12px] font-normal text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                    </svg>
                                    Mantenimiento de Datos
                                </h3>
                                <p className="text-[10px] text-zinc-500 font-normal">Exportación completa y depuración selectiva</p>
                            </div>

                            <div className="space-y-4">
                                {/* Exportación de Históricos */}
                                <form onSubmit={async (e) => {
                                    e.preventDefault(); setIsLoading(true);
                                    setMessages({ success: '', error: '', info: 'Generando respaldo...' });
                                    try {
                                        const res = await fetch('/api/export_all_log', { method: 'POST', body: new FormData(e.target) });
                                        if (res.ok) {
                                            const blob = await res.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a'); a.href = url; a.download = `LOGIX_BACKUP_${new Date().toISOString().slice(0, 10)}.xlsx`;
                                            a.click(); setMessages({ success: "Respaldo generado exitosamente", error: '', info: '' });
                                        } else {
                                            const data = await res.json().catch(() => ({}));
                                            setMessages({ success: '', error: data.error || `Error al generar respaldo (Código ${res.status})`, info: '' });
                                        }
                                    } catch (err) {
                                        setMessages({ success: '', error: "Error de conexión al generar respaldo", info: '' });
                                    }
                                    finally { setIsLoading(false); setBackupPassword(''); }
                                }} className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-normal text-zinc-800 uppercase tracking-tight">Exportar Respaldo Global</label>
                                        <span className="text-[9px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded border border-zinc-200">Excel (.xlsx)</span>
                                    </div>
                                    <div className="relative w-full">
                                        <input
                                            type={showBackupPassword ? "text" : "password"}
                                            name="password"
                                            placeholder="Contraseña de Administrador"
                                            value={backupPassword}
                                            onChange={e => setBackupPassword(e.target.value)}
                                            className="w-full h-7 border border-zinc-300 rounded pl-2.5 pr-8 text-[10px] placeholder:text-zinc-400 outline-none bg-zinc-50 focus:bg-white text-zinc-900 focus:border-[#285f94]"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowBackupPassword(!showBackupPassword)}
                                            className="w-6 h-6 !p-0 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-zinc-700 cursor-pointer"
                                            tabIndex={-1}
                                        >
                                            {showBackupPassword ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.025 10.025 0 014.132-5.4M9.62 9.62a3 3 0 004.24 4.24M21 21l-2-2m-2-2L3 3m18 9a9.96 9.96 0 01-2.458 5.4M12 5c4.478 0 8.268 2.943 9.542 7a9.968 9.968 0 01-1.88 4.125" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full h-7 border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 text-[10px] font-normal uppercase tracking-tight rounded transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '11px', height: '11px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.914 2.914a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Generar Respaldo
                                    </button>
                                </form>

                                {/* Limpieza Selectiva de Maestro GRN */}
                                <div className="space-y-2 pt-3 border-t border-zinc-100">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-normal text-zinc-800 uppercase tracking-tight">
                                            Limpieza de Maestro (GRN)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={maestroGrns.length > 0 || messages.info?.includes("VACÍO") ? () => { setMaestroGrns([]); setMessages(prev => ({ ...prev, info: '' })) } : fetchMaestroGrns}
                                            disabled={isFetchingMaestro}
                                            className="h-5 px-2 text-[9px] font-normal uppercase tracking-tight rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer"
                                        >
                                            {isFetchingMaestro ? 'Cargando...' : (maestroGrns.length > 0 || messages.info?.includes("VACÍO") ? 'Ocultar' : 'Ver Lista')}
                                        </button>
                                    </div>

                                    {maestroGrns.length > 0 ? (
                                        <div className="space-y-2 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-normal text-zinc-700 uppercase">{maestroGrns.length} GRNs encontrados</span>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => setSelectedMaestroGrns([...maestroGrns])} className="text-[9px] font-normal text-[#285f94] hover:underline uppercase cursor-pointer">Todas</button>
                                                    <button type="button" onClick={() => setSelectedMaestroGrns([])} className="text-[9px] font-normal text-[#285f94] hover:underline uppercase cursor-pointer">Ninguna</button>
                                                </div>
                                            </div>
                                            <div className="max-h-24 overflow-y-auto bg-white p-1.5 border border-zinc-200 rounded space-y-0.5">
                                                {maestroGrns.map((grn, idx) => {
                                                    const grnStr = typeof grn === 'string' ? grn : grn?.reference || grn?.grn || String(grn);
                                                    return (
                                                        <label key={grnStr || idx} className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-zinc-50 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMaestroGrns.includes(grnStr)}
                                                                onChange={e => e.target.checked ? setSelectedMaestroGrns(p => [...p, grnStr]) : setSelectedMaestroGrns(p => p.filter(g => g !== grnStr))}
                                                                className="accent-[#285f94]"
                                                            />
                                                            <span className="text-[10px] font-normal text-zinc-800">{grnStr}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>

                                            <form onSubmit={handleDeleteMaestroGrns} className="space-y-1.5">
                                                <div className="relative w-full">
                                                    <input
                                                        type={showDeleteMaestroPassword ? "text" : "password"}
                                                        placeholder="Contraseña de Administrador"
                                                        value={deleteMaestroPassword}
                                                        onChange={e => setDeleteMaestroPassword(e.target.value)}
                                                        className="w-full h-7 border border-zinc-300 rounded pl-2.5 pr-8 text-[10px] outline-none bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-[#285f94]"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowDeleteMaestroPassword(!showDeleteMaestroPassword)}
                                                        className="w-6 h-6 !p-0 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-zinc-700 cursor-pointer"
                                                        tabIndex={-1}
                                                    >
                                                        {showDeleteMaestroPassword ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.025 10.025 0 014.132-5.4M9.62 9.62a3 3 0 004.24 4.24M21 21l-2-2m-2-2L3 3m18 9a9.96 9.96 0 01-2.458 5.4M12 5c4.478 0 8.268 2.943 9.542 7a9.968 9.968 0 01-1.88 4.125" />
                                                            </svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={isLoading || selectedMaestroGrns.length === 0}
                                                    className="w-full h-7 text-[10px] font-normal text-white uppercase tracking-tight rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
                                                >
                                                    Eliminar Seleccionados ({selectedMaestroGrns.length})
                                                </button>
                                            </form>
                                        </div>
                                    ) : (
                                        messages.info && <p className="text-[10px] text-zinc-600 bg-zinc-50 p-2 rounded border border-zinc-200 font-normal">{messages.info}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 5. Zona de Riesgo (Reset Total) */}
                    <div className="bg-red-50/40 border border-red-200 rounded-lg shadow-xs p-4">
                        <div className="pb-2 mb-2 border-b border-red-200/80 flex items-center justify-between">
                            <div>
                                <h3 className="text-[11px] font-normal text-red-900 uppercase tracking-tight flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Zona de Riesgo: Reset Total
                                </h3>
                                <p className="text-[9px] text-red-700 font-normal">Acción destructiva e irreversible en la base de datos</p>
                            </div>
                            <span className="text-[8px] uppercase font-normal px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-300">
                                PELIGRO
                            </span>
                        </div>

                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!window.confirm("¿BORRAR TODA LA BASE DE DATOS? ESTA ACCIÓN NO SE PUEDE DESHACER.")) return;
                            setIsLoading(true);
                            try {
                                const res = await fetch('/api/clear_database', { method: 'POST', body: new FormData(e.target) });
                                const d = await res.json();
                                if (res.ok) setMessages({ success: d.message || "Base de datos limpiada exitosamente" }); else setMessages({ error: d.error || "Error" });
                            } catch (err) { setMessages({ error: "Error crítico al limpiar base de datos" }); }
                            finally { setIsLoading(false); setClearPassword(''); }
                        }} className="space-y-2">
                            <div className="relative w-full">
                                <input
                                    type={showClearPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Contraseña de Administrador"
                                    value={clearPassword}
                                    onChange={e => setClearPassword(e.target.value)}
                                    className="w-full h-7 border border-red-300 rounded pl-2.5 pr-8 text-[10px] placeholder:text-red-400 outline-none bg-white text-zinc-900 focus:border-red-600"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowClearPassword(!showClearPassword)}
                                    className="w-6 h-6 !p-0 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-red-400 hover:text-red-700 cursor-pointer"
                                    tabIndex={-1}
                                >
                                    {showClearPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.025 10.025 0 014.132-5.4M9.62 9.62a3 3 0 004.24 4.24M21 21l-2-2m-2-2L3 3m18 9a9.96 9.96 0 01-2.458 5.4M12 5c4.478 0 8.268 2.943 9.542 7a9.968 9.968 0 01-1.88 4.125" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '13px', height: '13px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            <button
                                type="submit"
                                className="w-full h-7 text-[10px] font-normal text-white uppercase tracking-tight rounded bg-red-700 hover:bg-red-800 transition-colors shadow-xs cursor-pointer"
                            >
                                Limpiar Base de Datos
                            </button>
                        </form>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default Update;
