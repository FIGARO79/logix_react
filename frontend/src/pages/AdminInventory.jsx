import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/AdminLayout';
import { useNavigate } from 'react-router-dom';

const AdminInventory = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('cycle');

    // --- Cycle Control State ---
    const [stats, setStats] = useState(null);
    const [stage, setStage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    // --- Manage Counts State ---
    const [counts, setCounts] = useState([]);
    const [filteredCounts, setFilteredCounts] = useState([]);
    const [countsLoading, setCountsLoading] = useState(false);
    const [countStats, setCountStats] = useState(null);
    const [usernames, setUsernames] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');

    // Reopen Location Form State
    const [reopenSessionId, setReopenSessionId] = useState('');
    const [reopenLocationCode, setReopenLocationCode] = useState('');
    const [adminMsg, setAdminMsg] = useState('');

    // ===== CYCLE CONTROL FUNCTIONS =====
    const fetchStats = async () => {
        try {
            const res = await fetch('/api/admin/inventory/summary');
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    throw new Error('No tiene permisos para acceder al panel de inventario');
                }
                throw new Error("Error al cargar estadísticas");
            }
            const data = await res.json();
            setStats(data.stats);
            setStage(data.stage);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const handleAction = async (actionUrl, confirmText) => {
        if (!window.confirm(confirmText)) return;

        setLoading(true);
        setMessage(null);
        setError(null);

        try {
            const res = await fetch(actionUrl, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error en la operación");
            }
            const data = await res.json();
            setMessage(data.message);
            fetchStats();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = (stageNum) => {
        window.location.href = `/api/export_recount_list/${stageNum}`;
    };

    const handleReport = () => {
        window.location.href = `/admin/inventory/report`;
    };

    // ===== MANAGE COUNTS FUNCTIONS =====
    const fetchCounts = useCallback(async () => {
        setCountsLoading(true);
        try {
            const [resAll, resStats] = await Promise.all([
                fetch('/api/counts/all'),
                fetch('/api/counts/stats')
            ]);

            if (!resAll.ok) throw new Error("Error cargando conteos");
            const data = await resAll.json();
            setCounts(data);
            setFilteredCounts(data);

            const distinctUsers = [...new Set(data.map(c => c.username).filter(Boolean))].sort();
            setUsernames(distinctUsers);

            if (resStats.ok) {
                const statsData = await resStats.json();
                setCountStats(statsData);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCountsLoading(false);
        }
    }, []);

    // Fetch counts when switching to manage tab
    useEffect(() => {
        if (activeTab === 'counts') {
            fetchCounts();
        }
    }, [activeTab, fetchCounts]);

    // Filter by user
    useEffect(() => {
        if (!selectedUser) {
            setFilteredCounts(counts);
        } else {
            setFilteredCounts(counts.filter(c => c.username === selectedUser));
        }
    }, [selectedUser, counts]);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este conteo permanentemente?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error al eliminar");
            fetchCounts();
        } catch (e) { alert(e.message); }
    };

    const handleReopenLocation = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/locations/reopen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: parseInt(reopenSessionId), location_code: reopenLocationCode })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error");
            }
            setAdminMsg(`Ubicación ${reopenLocationCode} reabierta.`);
            setReopenSessionId('');
            setReopenLocationCode('');
            setTimeout(() => setAdminMsg(''), 5000);
        } catch (e) { alert(e.message); }
    };

    const handleExportCounts = () => {
        window.location.href = `/api/export_counts?tz=America/Bogota`;
    };

    const getDiffColor = (diff) => {
        if (diff === null || diff === undefined) return 'text-gray-500';
        if (diff > 0) return 'text-[#285f94] font-bold';
        if (diff < 0) return 'text-red-600 font-bold';
        return 'text-gray-500';
    };

    return (
        <AdminLayout title="Administración de Inventario">
            {/* Header Area */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <h1 className="text-2xl font-normal text-gray-800">Panel de Control de Inventario</h1>
                <div className="flex gap-4">
                    <button
                        onClick={() => navigate('/admin/users')}
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                        Gestionar Usuarios
                    </button>
                </div>
            </div>

            {message && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-r shadow-sm">{message}</div>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r shadow-sm">{error}</div>}

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 mb-6">
                <button
                    onClick={() => setActiveTab('cycle')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'cycle'
                            ? 'border-[#285f94] text-[#285f94]'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Control de Ciclo
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('counts')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'counts'
                            ? 'border-[#285f94] text-[#285f94]'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Gestionar Conteos
                    </span>
                </button>
            </div>

            {activeTab === 'cycle' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Status Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Current Stage Card */}
                        <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
                            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                <h2 className="text-lg font-semibold text-gray-800">Estado del Ciclo de Conteo</h2>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                                    stage === 0 ? 'bg-gray-200 text-gray-700' :
                                    stage === 1 ? 'bg-blue-100 text-blue-700' :
                                    stage === 2 ? 'bg-orange-100 text-orange-700' :
                                    'bg-green-100 text-green-700'
                                }`}>
                                    {stage === 0 ? 'Inactivo' : `Etapa ${stage}`}
                                </span>
                            </div>
                            <div className="p-6">
                                <div className="flex items-start gap-4 mb-8">
                                    <div className={`p-3 rounded-full ${
                                        stage === 0 ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'
                                    }`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 leading-relaxed">
                                            {stage === 0 && "No hay un ciclo de inventario activo. Inicie un nuevo ciclo para comenzar el conteo general."}
                                            {stage === 1 && "Se está realizando el primer conteo de todas las ubicaciones con stock."}
                                            {stage === 2 && "Se está realizando el reconteo de las ubicaciones con diferencias detectadas en la Etapa 1."}
                                            {stage === 3 && "Se está realizando el tercer y último conteo para las discrepancias persistentes."}
                                        </p>
                                    </div>
                                </div>

                                {/* Main Actions */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {stage === 0 ? (
                                        <button
                                            onClick={() => handleAction('/api/admin/inventory/start', '¿Desea iniciar un nuevo ciclo de conteo?')}
                                            disabled={loading}
                                            className="flex items-center justify-center gap-2 bg-[#285f94] hover:bg-[#1e4a74] text-white font-bold py-3 px-6 rounded transition-all shadow-sm"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                            Iniciar Nuevo Ciclo
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleAction('/api/admin/inventory/next', '¿Desea avanzar a la siguiente etapa? Esto cerrará la etapa actual.')}
                                                disabled={loading}
                                                className="flex items-center justify-center gap-2 bg-white border border-[#285f94] text-[#285f94] hover:bg-blue-50 font-bold py-3 px-6 rounded transition-all shadow-sm"
                                            >
                                                Avanzar Etapa
                                            </button>
                                            <button
                                                onClick={() => handleAction('/api/admin/inventory/close', '¿CONFIRMA CERRAR EL CICLO? Se borrarán los registros activos y se generará el reporte final.')}
                                                disabled={loading}
                                                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded transition-all shadow-sm"
                                            >
                                                Cerrar Ciclo Total
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Export & Report Card */}
                        {stage > 0 && (
                            <div className="bg-white rounded shadow-sm border border-gray-200 p-6">
                                <h3 className="text-base font-semibold text-gray-800 mb-4">Reportes y Listas de Reconteo</h3>
                                <div className="flex flex-wrap gap-4">
                                    {stage >= 1 && (
                                        <button onClick={() => handleExport(1)} className="flex items-center gap-2 text-sm font-medium text-[#285f94] hover:underline">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Lista Reconteo Etapa 1
                                        </button>
                                    )}
                                    {stage >= 2 && (
                                        <button onClick={() => handleExport(2)} className="flex items-center gap-2 text-sm font-medium text-[#285f94] hover:underline border-l pl-4 border-gray-200">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Lista Reconteo Etapa 2
                                        </button>
                                    )}
                                    <button onClick={handleReport} className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:underline border-l pl-4 border-gray-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Ver Reporte de Diferencias
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stats Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded shadow-sm border border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4">Estadísticas</h2>
                            {!stats ? (
                                <div className="text-center py-8 text-gray-400 italic text-sm">Cargando datos...</div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-sm text-gray-600">Total Bins</span>
                                        <span className="font-mono font-bold text-gray-800">{stats.total_locations}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-sm text-gray-600">Bins Contados</span>
                                        <span className="font-mono font-bold text-[#285f94]">{stats.counted_locations}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-sm text-gray-600">Items con Diferencia</span>
                                        <span className={`font-mono font-bold ${stats.items_with_differences > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                            {stats.items_with_differences}
                                        </span>
                                    </div>
                                    <div className="pt-4">
                                        <div className="flex justify-between text-xs font-bold text-gray-500 mb-1 uppercase tracking-tighter">
                                            <span>Progreso de Conteo</span>
                                            <span>{Math.round((stats.counted_locations / stats.total_locations) * 100) || 0}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden shadow-inner">
                                            <div
                                                className="h-full bg-[#285f94] transition-all duration-1000"
                                                style={{ width: `${(stats.counted_locations / stats.total_locations) * 100 || 0}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Reopen Tool */}
                    <div className="bg-[#fffdf5] border border-[#ffecb3] border-l-4 border-l-[#e9730c] rounded-lg py-3 px-6 shadow-sm">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            <div className="flex items-center gap-3 text-[#e9730c] shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                </svg>
                                <h2 className="text-base font-semibold text-[#32363a]">Reabrir Ubicación para Conteo</h2>
                            </div>
                            
                            <form onSubmit={handleReopenLocation} className="flex flex-col md:flex-row items-end gap-4 flex-grow lg:justify-end">
                                <div className="w-full md:w-40">
                                    <label className="block text-[10px] uppercase tracking-wider font-bold text-[#6a6d70] mb-1">ID Sesión</label>
                                    <input type="number" value={reopenSessionId} onChange={e => setReopenSessionId(e.target.value)} className="block w-full border border-[#d1d5db] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#e9730c] focus:border-transparent outline-none transition-all" placeholder="Ej: 123" required />
                                </div>
                                <div className="w-full md:w-56">
                                    <label className="block text-[10px] uppercase tracking-wider font-bold text-[#6a6d70] mb-1">Código Ubicación</label>
                                    <input type="text" value={reopenLocationCode} onChange={e => setReopenLocationCode(e.target.value.toUpperCase())} className="block w-full border border-[#d1d5db] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#e9730c] focus:border-transparent outline-none transition-all" placeholder="Ej: A-01-01" required />
                                </div>
                                <button type="submit" className="w-full md:w-auto bg-[#e9730c] hover:bg-[#d1670b] text-white font-bold py-2 px-6 rounded transition-all shadow-sm flex items-center justify-center h-[38px]">
                                    Reabrir Ubicación
                                </button>
                            </form>
                        </div>
                        {adminMsg && <div className="mt-2 text-green-600 text-sm font-bold animate-pulse">{adminMsg}</div>}
                    </div>

                    {/* Stats Grid */}
                    {countStats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                            {[
                                { title: 'Total Items', val: countStats.total_items_with_stock, color: 'text-gray-500' },
                                { title: 'Contados', val: countStats.total_items_counted, color: 'text-emerald-600' },
                                { title: 'Diferencias', val: countStats.items_with_differences, color: 'text-orange-600' },
                                { title: 'Dif. (+)', val: countStats.items_with_positive_differences, color: 'text-[#285f94]' },
                                { title: 'Dif. (-)', val: countStats.items_with_negative_differences, color: 'text-red-600' },
                                { title: 'Ubic. Total', val: countStats.total_locations_with_stock, color: 'text-gray-500' },
                                { title: 'Ubic. Contadas', val: countStats.counted_locations, color: 'text-[#285f94]' }
                            ].map((s, idx) => (
                                <div key={idx} className="bg-white border border-gray-200 rounded p-4 text-center shadow-sm">
                                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{s.title}</h3>
                                    <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Toolbar & Filter */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <label className="text-sm font-bold text-gray-600 whitespace-nowrap">Filtrar por Usuario:</label>
                            <select
                                value={selectedUser}
                                onChange={(e) => setSelectedUser(e.target.value)}
                                className="w-full md:w-64 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#285f94] focus:border-transparent outline-none transition-all"
                            >
                                <option value="">Todos los usuarios</option>
                                {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            <button
                                onClick={() => navigate('/view_counts')}
                                className="flex-1 md:flex-none inline-flex items-center justify-center px-4 py-2 border border-[#285f94] text-[#285f94] bg-white text-sm font-bold rounded hover:bg-blue-50 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Validar Agrupados
                            </button>
                            <button
                                onClick={handleExportCounts}
                                className="flex-1 md:flex-none inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                Exportar Excel
                            </button>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="bg-white shadow-sm rounded border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#285f94]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                Registros de Conteo
                            </h2>
                            <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                                {filteredCounts.length} de {counts.length} registros
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {['ID', 'Sesión', 'Usuario', 'Fecha/Hora', 'Item Code', 'Ubicación', 'Cantidad', 'Acciones'].map((h, i) => (
                                            <th key={i} className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {countsLoading ? (
                                        <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-400 italic">Cargando registros...</td></tr>
                                    ) : filteredCounts.length === 0 ? (
                                        <tr><td colSpan="8" className="px-6 py-10 text-center text-gray-400 italic">No se encontraron registros de conteo</td></tr>
                                    ) : (
                                        filteredCounts.map((c) => (
                                            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 text-xs font-bold text-gray-400">#{c.id}</td>
                                                <td className="px-6 py-4 text-xs font-medium text-gray-600">{c.session_id}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-gray-800">{c.username || '-'}</td>
                                                <td className="px-6 py-4 text-[10px] text-gray-500 font-mono">
                                                    {c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-xs font-black text-[#285f94]">{c.item_code}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-gray-700">{c.counted_location}</td>
                                                <td className="px-6 py-4 text-xs font-black text-emerald-600">{c.counted_qty}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => navigate(`/counts/edit/${c.id}`)}
                                                            className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded transition-colors"
                                                            title="Editar Conteo"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(c.id)}
                                                            className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded transition-colors"
                                                            title="Eliminar Conteo"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AdminInventory;
