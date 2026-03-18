import React, { useState, useEffect, useCallback } from 'react';
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
        <div className="p-4 md:p-8">

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
                    {/* Left: Cycle Control (2 cols) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Current Stage Banner */}
                        <div className="bg-white p-6 rounded shadow-sm border-t-4 border-[#285f94] text-center">
                            <h3 className="text-gray-500 uppercase text-xs font-bold tracking-wider mb-2">Etapa Actual</h3>
                            <div className="text-4xl font-light text-[#285f94]">
                                {stage === 0 ? 'Sin Ciclo Activo' : `Etapa ${stage}`}
                            </div>
                        </div>

                        {/* Stage cards grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Stage 1 */}
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

                            {/* Stage 2 */}
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

                            {/* Stage 3 */}
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

                            {/* Stage 4 */}
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

                        {/* Finalize Card */}
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

                    {/* Right: Stats Summary */}
                    <div className="bg-white p-6 rounded shadow-sm h-fit border border-gray-200 sticky top-20">
                        <h2 className="text-lg font-normal text-gray-800 mb-4 border-b pb-2">Resumen en Tiempo Real</h2>

                        {!stats ? (
                            <div className="flex justify-center py-8 text-gray-400">
                                <span className="text-sm">Cargando datos...</span>
                            </div>
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
                                                <div className="flex justify-between text-xs text-gray-600">
                                                    <span>Contados:</span>
                                                    <span className="font-medium">{sStats.items_counted}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-gray-600">
                                                    <span>Unidades:</span>
                                                    <span className="font-medium">{sStats.total_units_counted}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-red-600 bg-red-50 px-1 rounded">
                                                    <span>Diferencias:</span>
                                                    <span className="font-bold">{sStats.items_with_discrepancy}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-green-700 bg-green-50 px-1 rounded mt-1">
                                                    <span>Precisión:</span>
                                                    <span className="font-bold">{sStats.accuracy}</span>
                                                </div>

                                                {sStats.items_in_recount_list !== undefined && sStats.items_in_recount_list > 0 && (
                                                    <div className="flex justify-between text-xs font-bold text-orange-600 mt-2 border-t pt-1 border-gray-100">
                                                        <span>Para Reconteo:</span>
                                                        <span>{sStats.items_in_recount_list}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== TAB: MANAGE COUNTS ===== */}
            {activeTab === 'counts' && (
                <div className="space-y-6">
                    {/* Stats Cards */}
                    {countStats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            {[
                                { title: 'Items con Stock', val: countStats.total_items_with_stock, color: 'text-[#6a6d70]' },
                                { title: 'Items Contados', val: countStats.total_items_counted, color: 'text-[#107e3e]' },
                                { title: 'Items con Dif.', val: countStats.items_with_differences, color: 'text-[#e9730c]' },
                                { title: 'Dif. Positiva', val: countStats.items_with_positive_differences, color: 'text-[#285f94]' },
                                { title: 'Dif. Negativa', val: countStats.items_with_negative_differences, color: 'text-[#b00]' },
                                { title: 'Ubic. en uso', val: countStats.total_locations_with_stock, color: 'text-[#6a6d70]' },
                                { title: 'Ubic. Contadas', val: countStats.counted_locations, color: 'text-[#285f94]' }
                            ].map((s, idx) => (
                                <div key={idx} className="bg-white border border-[#d9d9d9] rounded p-4 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_0_rgba(0,0,0,0.15)] transition-all">
                                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.color}`}>{s.title}</h3>
                                    <p className={`text-2xl font-bold ${s.color}`}>{s.val ?? 0}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Admin Tool: Reopen Location */}
                        <div className="lg:col-span-1">
                            <div className="bg-[#fff3cd] border-l-4 border-[#e9730c] rounded p-4 shadow-sm">
                                <div className="flex items-center mb-3 text-[#e9730c]">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <h2 className="text-base font-semibold text-[#32363a]">Reabrir Ubicación</h2>
                                </div>
                                {adminMsg && <div className="text-green-600 text-xs font-bold mb-2">{adminMsg}</div>}
                                <form onSubmit={handleReopenLocation} className="space-y-2">
                                    <div>
                                        <label className="block text-xs font-semibold text-[#32363a] mb-0.5">ID Sesión:</label>
                                        <input type="number" value={reopenSessionId} onChange={e => setReopenSessionId(e.target.value)} className="block w-full border border-[#89919a] rounded p-1 h-9" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-[#32363a] mb-0.5">Cód. Ubicación:</label>
                                        <input type="text" value={reopenLocationCode} onChange={e => setReopenLocationCode(e.target.value.toUpperCase())} className="block w-full border border-[#89919a] rounded p-1 h-9" required />
                                    </div>
                                    <button type="submit" className="w-full bg-[#e9730c] hover:bg-[#d1670b] text-white font-medium py-2 rounded text-sm transition-colors h-9">
                                        Reabrir
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Counts Table Area */}
                        <div className="lg:col-span-3 space-y-4">
                            {/* Toolbar */}
                            <div className="flex flex-wrap justify-between items-center gap-3">
                                <div className="flex items-center gap-3">
                                    <label className="text-sm font-normal text-[#32363a]">Filtrar usuario:</label>
                                    <select
                                        value={selectedUser}
                                        onChange={(e) => setSelectedUser(e.target.value)}
                                        className="h-9 border border-[#89919a] rounded px-2 bg-white text-[#32363a] focus:border-[#285f94] focus:ring-1 focus:ring-[#285f94] outline-none text-sm"
                                    >
                                        <option value="">Todos</option>
                                        {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleExportCounts}
                                        className="inline-flex items-center px-4 py-2 border border-[#0854a0] text-[#285f94] bg-white text-sm font-medium rounded hover:bg-[#ebf5fe] transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                        Exportar
                                    </button>
                                    <button
                                        onClick={() => navigate('/view_counts')}
                                        className="inline-flex items-center px-4 py-2 border border-[#1e4a74] text-[#285f94] bg-white text-sm font-medium rounded hover:bg-[#f0f7fe] transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                        </svg>
                                        Vista Agrupada
                                    </button>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="bg-white shadow-sm rounded border border-[#d9d9d9] overflow-hidden">
                                <div className="bg-[#f2f2f2] px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between">
                                    <div className="flex items-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#32363a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <h2 className="text-sm font-semibold text-[#32363a]">Tabla de Conteos</h2>
                                    </div>
                                    <span className="text-xs px-2 py-1 rounded bg-[#f2f2f2] text-[#6a6d70]">{filteredCounts.length} registros</span>
                                </div>
                                <div className="overflow-x-auto max-h-[60vh]">
                                    <table className="min-w-full text-left border-collapse">
                                        <thead className="sticky top-0 z-10">
                                            <tr>
                                                {['ID', 'Sesión', 'Etapa', 'Usuario', 'Timestamp', 'Item Code', 'Descripción', 'Ubic.', 'Contada', 'Sistema', 'Dif.', 'Acción'].map((h, i) => (
                                                    <th key={i} className="px-3 py-2 border-b border-[#e5e5e5] bg-[#f2f2f2] text-xs font-semibold uppercase tracking-wider whitespace-nowrap text-[#32363a]">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e5e5e5]">
                                            {countsLoading ? (
                                                <tr><td colSpan="12" className="p-8 text-center text-gray-500">Cargando...</td></tr>
                                            ) : filteredCounts.length === 0 ? (
                                                <tr>
                                                    <td colSpan="12" className="p-12 text-center text-gray-500">
                                                        <p className="font-medium">No hay registros</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredCounts.map((c) => (
                                                    <tr key={c.id} className="hover:bg-[#f5f5f5] transition-colors">
                                                        <td className="px-3 py-2 text-sm font-semibold">{c.id}</td>
                                                        <td className="px-3 py-2 text-sm">{c.session_id}</td>
                                                        <td className="px-3 py-2 text-sm">
                                                            {c.inventory_stage && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                                    E{c.inventory_stage}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-sm font-medium">{c.username || '-'}</td>
                                                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{c.timestamp}</td>
                                                        <td className="px-3 py-2 text-sm font-bold">{c.item_code}</td>
                                                        <td className="px-3 py-2 text-sm text-gray-600 truncate max-w-[180px]" title={c.item_description}>{c.item_description}</td>
                                                        <td className="px-3 py-2 text-sm">{c.counted_location}</td>
                                                        <td className="px-3 py-2 text-sm font-medium">{c.counted_qty}</td>
                                                        <td className="px-3 py-2 text-sm text-gray-500">{c.system_qty ?? '-'}</td>
                                                        <td className={`px-3 py-2 text-sm ${getDiffColor(c.difference)}`}>
                                                            {c.difference !== null && c.difference !== undefined
                                                                ? (c.difference > 0 ? `+${c.difference}` : c.difference)
                                                                : '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <div className="flex gap-1 justify-center">
                                                                <button onClick={() => navigate(`/counts/edit/${c.id}`)} title="Editar" className="text-indigo-600 hover:bg-indigo-50 p-1 rounded">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                                </button>
                                                                <button onClick={() => handleDelete(c.id)} title="Eliminar" className="text-red-600 hover:bg-red-50 p-1 rounded">
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
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminInventory;
