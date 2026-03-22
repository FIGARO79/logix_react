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

            {/* ===== TAB: CYCLE CONTROL ===== */}
            {activeTab === 'cycle' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white p-6 rounded shadow-sm border-t-4 border-[#285f94] text-center">
                            <h3 className="text-gray-500 uppercase text-xs font-bold tracking-wider mb-2">Etapa Actual</h3>
                            <div className="text-4xl font-light text-[#285f94]">
                                {stage === 0 ? 'Sin Ciclo Activo' : `Etapa ${stage}`}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className={`p-5 rounded shadow-sm border transition-all ${stage === 0 || stage === 4 ? 'bg-white border-blue-200 ring-1 ring-blue-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-medium text-gray-900">Etapa 1: Conteo Total</h3>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">INIT</span>
                                </div>
                                <p className="text-gray-500 text-xs mb-4">Inicia un nuevo ciclo. Limpia conteos anteriores. Requiere confirmación.</p>
                                <button
                                    onClick={() => handleAction('/api/admin/inventory/start_stage_1', '¿Iniciar Etapa 1? Se borrarán todos los datos anteriores.')}
                                    disabled={loading || (stage !== 0 && stage !== 4)}
                                    className="w-full bg-[#285f94] text-white py-2 rounded text-sm hover:bg-[#1e4a74] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Iniciar Inventario
                                </button>
                            </div>

                            <div className={`p-5 rounded shadow-sm border transition-all ${stage === 1 ? 'bg-white border-[#e9730c] ring-1 ring-orange-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-medium text-gray-900">Etapa 2: Primer Reconteo</h3>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">R1</span>
                                </div>
                                <p className="text-gray-500 text-xs mb-4">Calcula diferencias de Etapa 1 y genera listas.</p>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => handleAction('/api/admin/inventory/advance_stage/2', '¿Avanzar a Etapa 2?')}
                                        disabled={loading || stage !== 1}
                                        className="w-full bg-[#e9730c] text-white py-2 rounded text-sm hover:bg-[#cf660b] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Calcular y Avanzar
                                    </button>
                                    {stage === 2 && (
                                        <button onClick={() => handleExport(2)} className="w-full border border-green-600 text-green-700 py-1.5 rounded text-sm hover:bg-green-50 transition-colors">
                                            Descargar Lista Reconteo
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={`p-5 rounded shadow-sm border transition-all ${stage === 2 ? 'bg-white border-[#e9730c] ring-1 ring-orange-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-medium text-gray-900">Etapa 3: Segundo Reconteo</h3>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">R2</span>
                                </div>
                                <p className="text-gray-500 text-xs mb-4">Revisión de diferencias persistentes.</p>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => handleAction('/api/admin/inventory/advance_stage/3', '¿Avanzar a Etapa 3?')}
                                        disabled={loading || stage !== 2}
                                        className="w-full bg-[#e9730c] text-white py-2 rounded text-sm hover:bg-[#cf660b] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Calcular y Avanzar
                                    </button>
                                    {stage === 3 && (
                                        <button onClick={() => handleExport(3)} className="w-full border border-green-600 text-green-700 py-1.5 rounded text-sm hover:bg-green-50 transition-colors">
                                            Descargar Lista Reconteo
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={`p-5 rounded shadow-sm border transition-all ${stage === 3 ? 'bg-white border-[#e9730c] ring-1 ring-orange-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-medium text-gray-900">Etapa 4: Final</h3>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">FIN</span>
                                </div>
                                <p className="text-gray-500 text-xs mb-4">Último conteo de diferencias restantes.</p>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => handleAction('/api/admin/inventory/advance_stage/4', '¿Avanzar a Etapa 4?')}
                                        disabled={loading || stage !== 3}
                                        className="w-full bg-[#e9730c] text-white py-2 rounded text-sm hover:bg-[#cf660b] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Avanzar a Etapa 4
                                    </button>
                                    {stage === 4 && (
                                        <button onClick={() => handleExport(4)} className="w-full border border-green-600 text-green-700 py-1.5 rounded text-sm hover:bg-green-50 transition-colors">
                                            Descargar Lista Reconteo
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={`p-6 rounded shadow-sm border transition-all ${stage === 4 ? 'bg-white border-green-500 ring-1 ring-green-100 check-pattern' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                            <h3 className="text-lg font-medium text-green-800 mb-2">Finalizar Ciclo</h3>
                            <p className="text-gray-600 text-sm mb-4">Cierra el inventario y permite generar informe final.</p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                {stage === 4 && (
                                    <button onClick={handleReport} className="flex-1 bg-white border border-[#285f94] text-[#1e4a74] py-2 rounded text-sm hover:bg-blue-50 transition-colors font-medium">
                                        Generar Informe Final (Excel)
                                    </button>
                                )}
                                <button
                                    onClick={() => handleAction('/api/admin/inventory/finalize', '¿Finalizar Inventario?')}
                                    disabled={loading || stage !== 4}
                                    className="flex-1 bg-[#107e3e] text-white py-2 rounded text-sm hover:bg-[#0c6b33] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                                >
                                    Finalizar y Cerrar Inventario
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded shadow-sm h-fit border border-gray-200 sticky top-20">
                        <h2 className="text-lg font-normal text-gray-800 mb-4 border-b pb-2">Resumen en Tiempo Real</h2>
                        {!stats ? (
                            <div className="flex justify-center py-8 text-gray-400"><span className="text-sm">Cargando datos...</span></div>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">General</h3>
                                    <div className="flex justify-between items-center text-sm mb-2">
                                        <span className="text-gray-600">Items en Maestro</span>
                                        <span className="font-mono font-medium bg-gray-100 px-2 py-0.5 rounded">{stats.general?.total_items_master || 0}</span>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {stats.stages && Object.entries(stats.stages).map(([sNum, sStats]) => (
                                        <div key={sNum} className="group">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-2 h-2 rounded-full bg-[#285f94]"></span>
                                                <h4 className="font-medium text-sm text-gray-800">Etapa {sNum}</h4>
                                            </div>
                                            <div className="pl-4 border-l-2 border-gray-100 group-hover:border-blue-100 transition-colors space-y-1">
                                                <div className="flex justify-between text-xs text-gray-600"><span>Contados:</span><span className="font-medium">{sStats.items_counted}</span></div>
                                                <div className="flex justify-between text-xs text-gray-600"><span>Unidades:</span><span className="font-medium">{sStats.total_units_counted}</span></div>
                                                <div className="flex justify-between text-xs text-red-600 bg-red-50 px-1 rounded"><span>Diferencias:</span><span className="font-bold">{sStats.items_with_discrepancy}</span></div>
                                                <div className="flex justify-between text-xs text-green-700 bg-green-50 px-1 rounded mt-1"><span>Precisión:</span><span className="font-bold">{sStats.accuracy}</span></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== TAB: MANAGE COUNTS (W2W PHYSICAL AUDIT) ===== */}
            {activeTab === 'counts' && (
                <div className="space-y-6">
                    {/* Stats Cards Physical Only */}
                    {countStats && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                                { title: 'Meta Ubicaciones', val: countStats.total_locations_to_count, color: 'text-[#6a6d70]' },
                                { title: 'Ubic. Contadas', val: countStats.counted_locations, color: 'text-[#285f94]' },
                                { title: 'Progreso Físico', val: `${countStats.progress_percentage}%`, color: 'text-[#107e3e]' },
                                { title: 'Items Detectados', val: countStats.total_items_counted, color: 'text-[#6a6d70]' },
                                { title: 'Total Unidades', val: countStats.total_units_counted, color: 'text-[#285f94]' }
                            ].map((s, idx) => (
                                <div key={idx} className="bg-white border border-[#d9d9d9] rounded p-4 text-center shadow-sm hover:-translate-y-0.5 transition-all">
                                    <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${s.color}`}>{s.title}</h3>
                                    <p className={`text-xl font-bold ${s.color}`}>{s.val ?? 0}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-1">
                            <div className="bg-[#fff3cd] border-l-4 border-[#e9730c] rounded p-4 shadow-sm">
                                <div className="flex items-center mb-3 text-[#e9730c]">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <h2 className="text-base font-semibold text-[#32363a]">Reabrir Ubicación</h2>
                                </div>
                                {adminMsg && <div className="text-green-600 text-xs font-bold mb-2">{adminMsg}</div>}
                                <form onSubmit={handleReopenLocation} className="space-y-2">
                                    <input type="number" value={reopenSessionId} onChange={e => setReopenSessionId(e.target.value)} className="block w-full border border-[#89919a] rounded p-1 h-9 mb-2" placeholder="ID Sesión" required />
                                    <input type="text" value={reopenLocationCode} onChange={e => setReopenLocationCode(e.target.value.toUpperCase())} className="block w-full border border-[#89919a] rounded p-1 h-9 mb-2" placeholder="Cód. Ubicación" required />
                                    <button type="submit" className="w-full bg-[#e9730c] hover:bg-[#d1670b] text-white font-medium py-2 rounded text-sm h-9 transition-colors">Reabrir</button>
                                </form>
                            </div>
                        </div>

                        <div className="lg:col-span-3 space-y-4">
                            <div className="flex flex-wrap justify-between items-center gap-3">
                                <div className="flex items-center gap-3">
                                    <label className="text-xs font-bold text-gray-400 uppercase">Filtrar Auditor:</label>
                                    <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="h-8 border border-gray-300 rounded px-2 bg-white text-xs outline-none focus:border-blue-500">
                                        <option value="">Todos los auditores</option>
                                        {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleExportCounts} className="inline-flex items-center px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-[10px] font-bold uppercase tracking-tight rounded hover:bg-gray-50 transition-colors">Exportar Reporte</button>
                                    <button onClick={() => navigate('/view_counts')} className="inline-flex items-center px-4 py-1.5 border border-[#1e4a74] text-[#285f94] bg-white text-[10px] font-bold uppercase tracking-tight rounded hover:bg-blue-50 transition-colors shadow-sm">Vista Agrupada</button>
                                </div>
                            </div>

                            <div className="bg-white shadow-sm rounded border border-[#d9d9d9] overflow-hidden">
                                <div className="bg-[#f2f2f2] px-4 py-2 border-b border-[#e5e5e5] flex items-center justify-between">
                                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#32363a]">Registros de Campo</h2>
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-500 font-bold">{filteredCounts.length} REGISTROS</span>
                                </div>
                                <div className="overflow-x-auto max-h-[60vh]">
                                    <table className="min-w-full text-left border-collapse">
                                        <thead className="sticky top-0 z-10 bg-gray-50">
                                            <tr>
                                                {['ID', 'Sesión', 'Etapa', 'Auditor', 'Fecha / Hora', 'Item Code', 'Descripción', 'Ubicación', 'Cant. Física', 'Acción'].map((h, i) => (
                                                    <th key={i} className="px-3 py-2 border-b border-[#e5e5e5] text-[9px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50 whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e5e5e5]">
                                            {countsLoading ? (
                                                <tr><td colSpan="10" className="p-8 text-center text-gray-400 italic text-xs">Cargando auditoría...</td></tr>
                                            ) : filteredCounts.length === 0 ? (
                                                <tr><td colSpan="10" className="p-12 text-center text-gray-400 uppercase text-[10px] tracking-widest">No hay registros de campo</td></tr>
                                            ) : (
                                                filteredCounts.map((c) => (
                                                    <tr key={c.id} className="hover:bg-blue-50/20 transition-colors">
                                                        <td className="px-3 py-2 text-[10px] font-semibold text-gray-400">{c.id}</td>
                                                        <td className="px-3 py-2 text-[10px] text-gray-400">{c.session_id}</td>
                                                        <td className="px-3 py-2 text-[10px]"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">E{c.inventory_stage || '1'}</span></td>
                                                        <td className="px-3 py-2 text-[10px] font-semibold text-gray-700">{c.username || 'N/A'}</td>
                                                        <td className="px-3 py-2 text-[9px] text-gray-500 whitespace-nowrap">{c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                                                        <td className="px-3 py-2 text-[10px] font-bold text-slate-800">{c.item_code}</td>
                                                        <td className="px-3 py-2 text-[10px] text-gray-500 truncate max-w-[180px]" title={c.item_description}>{c.item_description}</td>
                                                        <td className="px-3 py-2 text-[10px] font-mono text-gray-600">{c.counted_location}</td>
                                                        <td className="px-3 py-2 text-xs font-bold text-[#285f94]">{c.counted_qty}</td>
                                                        <td className="px-3 py-2 text-right flex justify-end gap-2">
                                                            <button onClick={() => navigate(`/counts/edit/${c.id}`)} className="text-gray-400 hover:text-blue-600"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                            <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-600"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AdminInventory;
