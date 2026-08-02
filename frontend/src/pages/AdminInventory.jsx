import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const AdminInventory = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
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
    const [countStats, setCountStats] = useState(null);
    const [usernames, setUsernames] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');

    // Reopen Location Form State
    const [reopenSessionId, setReopenSessionId] = useState('');
    const [reopenLocationCode, setReopenLocationCode] = useState('');
    const [adminMsg, setAdminMsg] = useState('');

    // --- Reconciliation State ---
    const [reconItems, setReconItems] = useState([]);
    const [reconLoading, setReconLoading] = useState(false);
    const [reconFilter, setReconFilter] = useState('pending'); // 'pending' | 'all'
    const [searchQuery, setSearchQuery] = useState('');
    const [settings, setSettings] = useState({ w2w_qty_tolerance: 0.02, w2w_val_tolerance: 10.00 });
    const [settingsLoading, setSettingsLoading] = useState(false);

    const fetchReconciliation = useCallback(async () => {
        setReconLoading(true);
        try {
            const res = await fetch('/api/admin/inventory/reconciliation');
            if (!res.ok) throw new Error("Error cargando conciliación");
            const data = await res.json();
            setReconItems(data.items);
            if (data.settings) {
                setSettings(data.settings);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setReconLoading(false);
        }
    }, []);

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSettingsLoading(true);
        try {
            const res = await fetch('/api/admin/inventory/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    w2w_qty_tolerance: settings.w2w_qty_tolerance.toString(),
                    w2w_val_tolerance: settings.w2w_val_tolerance.toString()
                })
            });
            if (!res.ok) throw new Error("Error actualizando configuraciones");
            alert("Tolerancias guardadas correctamente.");
            fetchReconciliation();
            fetchStats();
        } catch (err) {
            alert(err.message);
        } finally {
            setSettingsLoading(false);
        }
    };

    const handleApproveItem = async (itemCode) => {
        if (!window.confirm(`¿Aprobar manualmente la diferencia de ${itemCode}?`)) return;
        try {
            const res = await fetch('/api/admin/inventory/approve_item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_code: itemCode })
            });
            if (!res.ok) throw new Error("Error aprobando item");
            fetchReconciliation();
            fetchStats();
        } catch (err) {
            alert(err.message);
        }
    };

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/inventory/summary');
            if (!res.ok) throw new Error("Error al cargar estadísticas");
            const data = await res.json();
            setStats(data.stats);
            setStage(data.stage);
            if (data.settings) {
                setSettings(data.settings);
            }
        } catch (err) {
            setError(err.message);
        }
    }, []);

    const handleAction = async (actionUrl, confirmText) => {
        if (!window.confirm(confirmText)) return;
        setLoading(true); setMessage(null); setError(null);
        try {
            const res = await fetch(actionUrl, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error en la operación");
            }
            const data = await res.json();
            setMessage(data.message);
            fetchStats();
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('logix_events');
                bc.postMessage({ type: 'CYCLE_COUNT_MUTATED' });
                bc.close();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchCounts = useCallback(async () => {
        try {
            const [resAll, resStats] = await Promise.all([
                fetch('/api/counts/all'),
                fetch('/api/counts/stats')
            ]);
            if (!resAll.ok) throw new Error("Error cargando conteos");
            const data = await resAll.json();
            setCounts(data);
            setFilteredCounts(selectedUser ? data.filter(c => c.username === selectedUser) : data);
            const distinctUsers = [...new Set(data.map(c => c.username).filter(Boolean))].sort();
            setUsernames(distinctUsers);
            if (resStats.ok) setCountStats(await resStats.json());
        } catch (err) {
            setError(err.message);
        }
    }, [selectedUser]);

    useEffect(() => {
        if (setTitle) setTitle("Adm. Inventario");
    }, [setTitle]);

    useEffect(() => {
        fetchStats();
        if (activeTab === 'counts') fetchCounts();
        if (activeTab === 'reconciliation') fetchReconciliation();

        const interval = setInterval(() => {
            if (navigator.onLine && !document.hidden) {
                fetchStats();
                if (activeTab === 'counts') fetchCounts();
                if (activeTab === 'reconciliation') fetchReconciliation();
            }
        }, 5000);

        let bc;
        if (typeof BroadcastChannel !== 'undefined') {
            bc = new BroadcastChannel('logix_events');
            bc.onmessage = (event) => {
                if (event.data?.type === 'CYCLE_COUNT_MUTATED') {
                    fetchStats();
                    fetchCounts();
                    fetchReconciliation();
                }
            };
        }

        return () => {
            clearInterval(interval);
            if (bc) bc.close();
        };
    }, [activeTab, fetchStats, fetchCounts, fetchReconciliation]);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este registro?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error");
            fetchCounts();
        } catch (e) { alert(e.message); }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 pt-3 pb-6 font-sans bg-[#fcfcfc] min-h-screen text-black text-[12px]">

            {/* Barra de Acciones */}
            <div className="flex justify-end items-center mb-2 border-b border-zinc-100 pb-1.5 text-black">
                <div className="flex gap-3">
                    <button
                        onClick={() => window.location.href = `/api/export_counts`}
                        className="bg-white border border-black text-black text-[12px] px-2 py-1 rounded hover:bg-zinc-50 transition-colors font-normal shadow-sm"
                    >
                        Exportar Master
                    </button>
                </div>
            </div>

            {message && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-r shadow-sm text-[12px] font-normal uppercase tracking-tight">{message}</div>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r shadow-sm text-[12px] font-normal uppercase tracking-tight">{error}</div>}

            {/* Tab Navigation */}
            <div className="flex border-b border-zinc-200 mb-6">
                <button
                    onClick={() => setActiveTab('cycle')}
                    className={`px-6 py-3 text-[12px] font-normal border-b-2 transition-colors ${activeTab === 'cycle' ? 'border-black text-black' : 'border-transparent text-black hover:text-black hover:border-zinc-300'}`}
                >
                    Fases del Inventario
                </button>
                <button
                    onClick={() => setActiveTab('counts')}
                    className={`px-6 py-3 text-[12px] font-normal border-b-2 transition-colors ${activeTab === 'counts' ? 'border-black text-black' : 'border-transparent text-black hover:text-black hover:border-zinc-300'}`}
                >
                    Auditoría de Registros
                </button>
                <button
                    onClick={() => setActiveTab('reconciliation')}
                    className={`px-6 py-3 text-[12px] font-normal border-b-2 transition-colors ${activeTab === 'reconciliation' ? 'border-black text-black' : 'border-transparent text-black hover:text-black hover:border-zinc-300'}`}
                >
                    Conciliación de Diferencias
                </button>
            </div>

            {activeTab === 'cycle' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    <div className="lg:col-span-3 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { s: 1, t: 'FASE 1: CONTEO GENERAL', d: 'Apertura del ciclo. Reseteo de bases de datos para nuevo inventario.', action: '/api/admin/inventory/start_stage_1', label: 'INICIAR CICLO' },
                                { s: 2, t: 'FASE 2: RECONTEO R1', d: 'Cálculo de diferencias de Fase 1 y generación de listas de discrepancia.', action: '/api/admin/inventory/advance_stage/2', label: 'GENERAR R1' },
                                { s: 3, t: 'FASE 3: RECONTEO R2', d: 'Segunda validación enfocada en discrepancias persistentes.', action: '/api/admin/inventory/advance_stage/3', label: 'GENERAR R2' },
                                { s: 4, t: 'FASE 4: AUDITORÍA FINAL', d: 'Validación técnica final previa al cierre del ejercicio.', action: '/api/admin/inventory/advance_stage/4', label: 'PREPARAR CIERRE' }
                            ].map((item) => (
                                <div key={item.s} className={`p-6 border bg-white shadow-sm transition-all ${stage === item.s ? 'border-black ring-1 ring-black' : 'border-zinc-200 opacity-60'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-[12px] font-normal text-black uppercase tracking-tight">{item.t}</h3>
                                        <span className={`text-[12px] font-mono font-normal px-2 py-0.5 rounded bg-zinc-100 text-black`}>PHASE-0{item.s}</span>
                                    </div>
                                    <p className="text-[12px] text-black mb-6 leading-relaxed uppercase font-normal tracking-tight">{item.d}</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAction(item.action, `¿Confirmar transición a Fase ${item.s}?`)}
                                            disabled={loading || (item.s === 1 ? (stage !== 0 && stage !== 4) : stage !== item.s - 1)}
                                            className={`flex-1 h-8 text-[12px] font-normal uppercase tracking-widest rounded transition-colors ${stage === item.s
                                                    ? 'bg-black text-white hover:bg-zinc-900'
                                                    : 'bg-zinc-800 text-white hover:bg-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-300'
                                                }`}
                                        >
                                            {item.label}
                                        </button>
                                        {stage >= item.s && item.s > 1 && (
                                            <button
                                                onClick={() => window.location.href = item.s === 4 ? '/admin/inventory/report' : `/api/export_recount_list/${item.s}`}
                                                title={item.s === 4 ? "Descargar Informe Final Consolidado W2W" : `Descargar Lista de Reconteo Etapa ${item.s}`}
                                                className="px-3 border border-zinc-200 rounded hover:bg-zinc-50 text-black hover:text-black transition-colors font-bold text-[12px]"
                                            >
                                                ↓
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={`p-8 border-2 border-dashed transition-all ${stage === 4 ? 'border-zinc-300 bg-zinc-50/20' : 'border-zinc-100 bg-transparent opacity-40'}`}>
                             <div className="flex flex-col items-center text-center">
                                <h3 className="text-[12px] font-light text-black mb-2 uppercase tracking-tight">Finalización del Ejercicio</h3>
                                <p className="text-[12px] text-black uppercase font-normal tracking-widest mb-6">Cierre definitivo de registros y consolidación de informe maestro</p>
                                <div className="flex gap-4 w-full max-w-md">
                                    <button onClick={() => window.location.href = `/admin/inventory/report`} disabled={stage !== 4} className="flex-1 h-10 bg-white border border-zinc-300 text-black text-[12px] font-normal uppercase tracking-widest rounded hover:bg-zinc-50 disabled:opacity-50 transition-all shadow-sm">Reporte Excel</button>
                                    <button onClick={() => handleAction('/api/admin/inventory/finalize', '¿Finalizar Inventario?')} disabled={loading || stage !== 4} className="flex-1 h-10 bg-black text-white text-[12px] font-normal uppercase tracking-widest rounded hover:bg-zinc-900 disabled:opacity-50 transition-all shadow-md">Cerrar Ciclo</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Resumen Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded shadow-sm border border-zinc-200 sticky top-20">
                            <h2 className="text-[12px] font-normal text-black mb-4 border-b pb-2">Estado del Inventario</h2>
                            {!stats ? (
                                <div className="flex justify-center py-8 text-black text-[12px] italic">Calculando estadísticas...</div>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-[12px] font-normal text-black uppercase tracking-[0.1em] mb-3 tracking-tighter">Status Operativo</h3>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-50 pb-1">
                                                <span className="text-black uppercase text-[12px] font-normal">Fase Activa</span>
                                                <span className="font-mono font-normal text-black text-[12px]">{stage === 0 ? 'STANDBY' : `PHASE ${stage}`}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-50 pb-1">
                                                <span className="text-black uppercase text-[12px] font-normal">Catálogo Master</span>
                                                <span className="font-mono font-normal text-black text-[12px]">{stats?.general?.total_items_master || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-zinc-50 space-y-4">
                                        {stats?.stages && Object.entries(stats.stages).map(([sNum, sStats]) => (
                                            <div key={sNum} className="flex justify-between items-center text-[12px] group py-0.5 border-b border-transparent hover:border-zinc-100">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 group-hover:bg-black transition-colors"></span>
                                                    <span className="text-black group-hover:text-black transition-colors uppercase font-normal text-[12px]">Stage 0{sNum} Accuracy</span>
                                                </div>
                                                <span className="font-mono font-normal text-black text-[12px]">{sStats.accuracy}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'counts' && (
                <div className="space-y-8">
                    {/* Indicadores */}
                    {countStats && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                                { l: 'Meta Loc.', v: countStats.total_locations_to_count },
                                { l: 'Capturas', v: countStats.counted_locations },
                                { l: 'Progreso', v: `${countStats.progress_percentage}%` },
                                { l: 'SKUs', v: countStats.total_items_counted },
                                { l: 'Unidades', v: countStats.total_units_counted }
                            ].map((s, i) => (
                                <div key={i} className="bg-white border border-zinc-200 p-4 shadow-sm text-center">
                                    <label className="text-[12px] uppercase font-normal text-black block mb-1 tracking-tighter">{s.l}</label>
                                    <div className="text-[12px] font-light text-black">{s.v}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div>
                        <div className="w-full">
                            <div className="bg-white shadow-sm rounded border border-zinc-200 overflow-hidden">
                                <div className="bg-[#f2f2f2] px-4 py-1.5 border-b border-zinc-200 flex flex-row justify-between items-center gap-4">
                                    <div className="flex gap-4 items-center flex-1 max-w-[300px]">
                                        <label className="text-[12px] font-normal text-black uppercase tracking-widest">Filtro Auditor:</label>
                                        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="h-6 flex-1 bg-white border border-zinc-300 text-[12px] font-normal uppercase outline-none focus:ring-1 focus:ring-black px-2 cursor-pointer transition-all">
                                            <option value="">Todos los auditores</option>
                                            {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    <div className="whitespace-nowrap shrink-0">
                                        <span className="text-[12px] text-black font-normal uppercase tracking-tight">{filteredCounts.length} registros capturados</span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto max-h-[calc(100vh-350px)]">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#1e4a74] sticky top-0 z-10 shadow-sm text-white">
                                            <tr>
                                                {['Auditor', 'Timestamp', 'Ítem', 'Ubicación', 'Cantidad', ''].map((h, i) => (
                                                    <th key={i} className="px-2 py-1 text-[10px] font-normal uppercase tracking-tight">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100">
                                            {filteredCounts.map((c) => (
                                                <tr key={c.id} className="hover:bg-[#f5f8fc] transition-colors leading-none h-6">
                                                    <td className="px-2 py-0.5 text-[11px] font-normal text-black">{c.username}</td>
                                                    <td className="px-2 py-0.5 text-[10px] text-black font-normal uppercase">{new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                                    <td className="px-2 py-0.5 text-[11px] font-normal text-black tracking-tight uppercase">{c.item_code}</td>
                                                    <td className="px-2 py-0.5 text-[11px] text-black font-normal uppercase">{c.counted_location}</td>
                                                    <td className="px-2 py-0.5 text-[11px] font-normal text-black border-l border-zinc-50">{c.counted_qty}</td>
                                                    <td className="px-2 py-0.5 text-right space-x-3">
                                                        <button onClick={() => navigate(`/counts/edit/${c.id}`)} className="text-black hover:text-blue-600 text-[11px] font-normal uppercase transition-colors">Editar</button>
                                                        <button onClick={() => handleDelete(c.id)} className="text-black hover:text-red-600 text-[11px] font-normal uppercase transition-colors">Borrar</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>  
            )}

            {activeTab === 'reconciliation' && (
                <div className="space-y-6">
                    <div>
                        {/* Panel de Conciliación Principal */}
                        <div className="w-full">
                            <div className="bg-white shadow-sm rounded border border-zinc-200 overflow-hidden">
                                <div className="bg-[#f2f2f2] px-4 py-3 border-b border-zinc-200 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                                    <div className="flex gap-4 flex-1 items-center">
                                        <input
                                            type="text"
                                            placeholder="Buscar SKU, descripción o ubicación..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="h-8 flex-1 max-w-[400px] border border-zinc-300 rounded px-3 text-[12px] bg-white outline-none focus:ring-1 focus:ring-black placeholder-zinc-400 font-sans"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setReconFilter('pending')}
                                                className={`px-3 py-1 text-[10px] font-normal uppercase tracking-wider rounded border transition-colors ${
                                                    reconFilter === 'pending'
                                                        ? 'bg-zinc-800 border-zinc-800 text-white'
                                                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                                                }`}
                                            >
                                                Pendientes (Fuera Tol.)
                                            </button>
                                            <button
                                                onClick={() => setReconFilter('all')}
                                                className={`px-3 py-1 text-[10px] font-normal uppercase tracking-wider rounded border transition-colors ${
                                                    reconFilter === 'all'
                                                        ? 'bg-zinc-800 border-zinc-800 text-white'
                                                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                                                }`}
                                            >
                                                Todos
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={fetchReconciliation}
                                        disabled={reconLoading}
                                        className="h-8 px-4 border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 text-[10px] uppercase font-normal tracking-wider rounded transition-colors disabled:opacity-50"
                                    >
                                        {reconLoading ? 'ACTUALIZANDO...' : 'REFRESCAR'}
                                    </button>
                                </div>

                                <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#1e4a74] sticky top-0 z-10 shadow-sm text-white">
                                            <tr>
                                                {[
                                                    'Ítem / Ubicación',
                                                    'Costo',
                                                    'Sist',
                                                    'Etapa 1',
                                                    'Etapa 2',
                                                    'Etapa 3',
                                                    'Etapa 4',
                                                    'Contado',
                                                    'Diff',
                                                    'Valor Diff',
                                                    'Estado',
                                                    'Acción',
                                                ].map((h, i) => (
                                                    <th
                                                        key={i}
                                                        className="px-2 py-1 text-[10px] font-normal uppercase tracking-wider text-center first:text-left"
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100">
                                            {reconItems
                                                .filter((item) => {
                                                    const matchQuery =
                                                        item.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                        item.bin_location.toLowerCase().includes(searchQuery.toLowerCase());

                                                    if (reconFilter === 'pending') {
                                                        return (
                                                            matchQuery &&
                                                            (item.status === 'PENDING' || item.status === 'PENDING_RECOUNT')
                                                        );
                                                    }
                                                    return matchQuery;
                                                })
                                                .map((item) => (
                                                    <tr
                                                        key={item.item_code}
                                                        className="hover:bg-[#f5f8fc] transition-colors leading-none h-6"
                                                    >
                                                        <td className="px-2 py-0.5 text-left">
                                                            <div className="text-zinc-900 font-normal uppercase tracking-tight text-[11px]">
                                                                {item.item_code}
                                                            </div>
                                                            <div className="text-[9px] text-zinc-500 font-normal truncate max-w-[180px]">
                                                                {item.description}
                                                            </div>
                                                            <div className="text-[9px] text-zinc-400 font-normal">
                                                                Loc: {item.bin_location}
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center font-normal text-[10px]">
                                                            ${item.cost.toFixed(2)}
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center font-normal text-[10px] text-zinc-600 bg-zinc-50/50">
                                                            {item.system_qty}
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center font-normal text-[10px] text-zinc-500">
                                                            {item.c1 !== null ? item.c1 : '-'}
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center font-normal text-[10px] text-zinc-500">
                                                            {item.c2 !== null ? item.c2 : '-'}
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center font-normal text-[10px] text-zinc-500">
                                                            {item.c3 !== null ? item.c3 : '-'}
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center font-normal text-[10px] text-zinc-500">
                                                            {item.c4 !== null ? item.c4 : '-'}
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center font-normal text-[10px] bg-zinc-50/50">
                                                            {item.final_counted}
                                                        </td>
                                                        <td
                                                            className={`px-2 py-0.5 text-center font-normal text-[10px] ${
                                                                item.diff_qty > 0
                                                                    ? 'text-green-600'
                                                                    : item.diff_qty < 0
                                                                    ? 'text-red-600'
                                                                    : 'text-zinc-400'
                                                            }`}
                                                        >
                                                            {item.diff_qty > 0 ? `+${item.diff_qty}` : item.diff_qty}
                                                        </td>
                                                        <td
                                                            className={`px-2 py-0.5 text-center font-normal text-[10px] ${
                                                                item.diff_val > 0
                                                                    ? 'text-green-600'
                                                                    : item.diff_val < 0
                                                                    ? 'text-red-600'
                                                                    : 'text-zinc-400'
                                                            }`}
                                                        >
                                                            {item.diff_val > 0 ? `+$${item.diff_val.toFixed(2)}` : `$${item.diff_val.toFixed(2)}`}
                                                        </td>
                                                        <td className="px-2 py-0.5 text-center">
                                                            {item.status === 'OK' && (
                                                                <span className="px-1.5 py-0.5 text-[8px] font-normal rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                                                                    SIN DIF
                                                                </span>
                                                            )}
                                                            {item.status === 'APPROVED_AUTO' && (
                                                                <span className="px-1.5 py-0.5 text-[8px] font-normal rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                    AUTO OK
                                                                </span>
                                                            )}
                                                            {item.status === 'APPROVED_MANUAL' && (
                                                                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-sky-50 text-sky-700 border border-sky-200">
                                                                    APROB SUPERV
                                                                </span>
                                                            )}
                                                            {item.status === 'PENDING_RECOUNT' && (
                                                                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                                                    RECONTEO REQ
                                                                </span>
                                                            )}
                                                            {item.status === 'PENDING' && (
                                                                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-red-50 text-red-700 border border-red-200">
                                                                    EXCEDE TOLER
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-1 text-center">
                                                            {(item.status === 'PENDING' ||
                                                                item.status === 'PENDING_RECOUNT') && (
                                                                <button
                                                                    onClick={() => handleApproveItem(item.item_code)}
                                                                    className="h-5 px-2 bg-zinc-800 text-white text-[9px] font-normal uppercase tracking-wider rounded hover:bg-zinc-900 transition-colors shadow-sm"
                                                                >
                                                                    Aprobar
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            {reconItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={12} className="text-center py-8 text-zinc-400 italic">
                                                        No hay datos para mostrar en la etapa actual.
                                                    </td>
                                                </tr>
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
