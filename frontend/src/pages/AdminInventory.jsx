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
    const [countsLoading, setCountsLoading] = useState(false);
    const [countStats, setCountStats] = useState(null);
    const [usernames, setUsernames] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');

    // Reopen Location Form State
    const [reopenSessionId, setReopenSessionId] = useState('');
    const [reopenLocationCode, setReopenLocationCode] = useState('');
    const [adminMsg, setAdminMsg] = useState('');

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/admin/inventory/summary');
            if (!res.ok) throw new Error("Error al cargar estadísticas");
            const data = await res.json();
            setStats(data.stats);
            setStage(data.stage);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        fetchStats();
        if (setTitle) setTitle("Inventario W2W");
    }, [setTitle]);

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
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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
            if (resStats.ok) setCountStats(await resStats.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setCountsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'counts') fetchCounts();
    }, [activeTab, fetchCounts]);

    useEffect(() => {
        setFilteredCounts(selectedUser ? counts.filter(c => c.username === selectedUser) : counts);
    }, [selectedUser, counts]);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este registro?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error");
            fetchCounts();
        } catch (e) { alert(e.message); }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 pt-3 pb-6 font-sans bg-[#fcfcfc] min-h-screen text-zinc-800">
            
            {/* Header Técnico */}
            <div className="flex justify-between items-center mb-6 border-b border-zinc-200 pb-4">
                <div className="flex flex-col gap-0">
                    <h1 className="text-base font-normal tracking-tight">Administración de Inventario</h1>
                    <p className="text-[8px] uppercase tracking-widest font-normal leading-none mt-0.5">Gestión de Ciclos y Auditoría de Stock</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => window.location.href = `/api/export_counts`} 
                        className="bg-white border border-black text-black text-[8px] px-2 py-1 rounded hover:bg-zinc-50 transition-colors text-sm font-medium shadow-sm"
                    >
                        Exportar Master
                    </button>
                </div>
            </div>

            {message && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-r shadow-sm text-xs font-medium uppercase tracking-tight">{message}</div>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r shadow-sm text-xs font-medium uppercase tracking-tight">{error}</div>}

            {/* Tab Navigation */}
            <div className="flex border-b border-zinc-200 mb-6">
                <button
                    onClick={() => setActiveTab('cycle')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'cycle' ? 'border-[#285f94] text-[#285f94]' : 'border-transparent text-black hover:text-black hover:border-zinc-300'}`}
                >
                    Fases del Inventario
                </button>
                <button
                    onClick={() => setActiveTab('counts')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'counts' ? 'border-[#285f94] text-[#285f94]' : 'border-transparent text-black hover:text-black hover:border-zinc-300'}`}
                >
                    Auditoría de Registros
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
                                <div key={item.s} className={`p-6 border bg-white shadow-sm transition-all ${stage === item.s ? 'border-blue-600 ring-1 ring-blue-50' : 'border-zinc-200 opacity-60'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-xs font-normal text-black uppercase tracking-tight">{item.t}</h3>
                                        <span className={`text-[10px] font-mono font-normal px-2 py-0.5 rounded ${stage === item.s ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-black'}`}>PHASE-0{item.s}</span>
                                    </div>
                                    <p className="text-[11px] text-black mb-6 leading-relaxed uppercase font-normal tracking-tight">{item.d}</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAction(item.action, `¿Confirmar transición a Fase ${item.s}?`)}
                                            disabled={loading || (item.s === 1 ? (stage !== 0 && stage !== 4) : stage !== item.s - 1)}
                                            className={`flex-1 h-8 text-[10px] font-bold uppercase tracking-widest rounded transition-colors ${
                                                stage === item.s 
                                                ? 'bg-[#285f94] text-white hover:bg-[#1e4a74]' 
                                                : 'bg-gray-800 text-white hover:bg-gray-900 disabled:bg-gray-100 disabled:text-gray-300'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                        {stage >= item.s && (
                                            <button 
                                                onClick={() => window.location.href = `/api/export_recount_list/${item.s}`} 
                                                className="px-3 border border-zinc-200 rounded hover:bg-zinc-50 text-black hover:text-black transition-colors"
                                            >
                                                ↓
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={`p-8 border-2 border-dashed transition-all ${stage === 4 ? 'border-emerald-200 bg-emerald-50/20' : 'border-zinc-100 bg-transparent opacity-40'}`}>
                            <div className="flex flex-col items-center text-center">
                                <h3 className="text-lg font-light text-black mb-2 uppercase tracking-tight">Finalización del Ejercicio</h3>
                                <p className="text-[10px] text-black uppercase font-normal tracking-widest mb-6">Cierre definitivo de registros y consolidación de informe maestro</p>
                                <div className="flex gap-4 w-full max-w-md">
                                    <button onClick={() => window.location.href = `/admin/inventory/report`} disabled={stage !== 4} className="flex-1 h-10 bg-white border border-zinc-300 text-black text-[10px] font-bold uppercase tracking-widest rounded hover:bg-zinc-50 disabled:opacity-50 transition-all shadow-sm">Reporte Excel</button>
                                    <button onClick={() => handleAction('/api/admin/inventory/finalize', '¿Finalizar Inventario?')} disabled={loading || stage !== 4} className="flex-1 h-10 bg-[#285f94] text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-[#1e4a74] disabled:opacity-50 transition-all shadow-md">Cerrar Ciclo</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Resumen Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded shadow-sm border border-zinc-200 sticky top-20">
                            <h2 className="text-lg font-normal text-black mb-4 border-b pb-2">Estado del Inventario</h2>
                            {!stats ? (
                                <div className="flex justify-center py-8 text-black text-xs italic">Calculando estadísticas...</div>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-xs font-normal text-black uppercase tracking-widest mb-3 tracking-tighter">Status Operativo</h3>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-50 pb-1">
                                                <span className="text-black uppercase text-[10px] font-normal">Fase Activa</span>
                                                <span className="font-mono font-medium text-black">{stage === 0 ? 'STANDBY' : `PHASE ${stage}`}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-50 pb-1">
                                                <span className="text-black uppercase text-[10px] font-normal">Catálogo Master</span>
                                                <span className="font-mono font-medium text-[#285f94]">{stats?.general?.total_items_master || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-zinc-50 space-y-4">
                                        {stats?.stages && Object.entries(stats.stages).map(([sNum, sStats]) => (
                                            <div key={sNum} className="flex justify-between items-center text-[11px] group py-0.5 border-b border-transparent hover:border-zinc-100">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 group-hover:bg-[#285f94] transition-colors"></span>
                                                    <span className="text-black group-hover:text-black transition-colors uppercase font-normal text-[9px]">Stage 0{sNum} Accuracy</span>
                                                </div>
                                                <span className="font-mono font-medium text-[#285f94]">{sStats.accuracy}</span>
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
                                    <label className="text-[9px] uppercase font-normal text-black block mb-1 tracking-tighter">{s.l}</label>
                                    <div className="text-xl font-light text-black">{s.v}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-1">
                            <div className="bg-white border border-zinc-200 p-6 shadow-sm">
                                <h3 className="text-[10px] font-normal text-black uppercase tracking-widest mb-6 border-b border-zinc-50 pb-2">Reabrir Ubicación</h3>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    try {
                                        const res = await fetch('/api/locations/reopen', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ session_id: parseInt(reopenSessionId), location_code: reopenLocationCode })
                                        });
                                        if (!res.ok) throw new Error("Error");
                                        setAdminMsg("OPERACIÓN EXITOSA"); setReopenSessionId(''); setReopenLocationCode('');
                                        setTimeout(() => setAdminMsg(''), 3000);
                                    } catch (e) { alert("Error en reapertura técnica"); }
                                }} className="space-y-4">
                                    <div><label className="text-[9px] font-normal text-black uppercase">ID Sesión</label><input type="number" value={reopenSessionId} onChange={e => setReopenSessionId(e.target.value)} className="w-full h-9 border border-zinc-200 rounded px-2 text-xs bg-zinc-50 focus:bg-white outline-none transition-all" required /></div>
                                    <div><label className="text-[9px] font-normal text-black uppercase">Código Loc</label><input type="text" value={reopenLocationCode} onChange={e => setReopenLocationCode(e.target.value.toUpperCase())} className="w-full h-9 border border-zinc-200 rounded px-2 text-xs bg-zinc-50 focus:bg-white font-mono outline-none transition-all" required /></div>
                                    <button type="submit" className="w-full h-9 bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-zinc-900 transition-colors shadow-sm">EJECUTAR</button>
                                    {adminMsg && <div className="text-center text-[10px] font-bold text-emerald-600 animate-pulse uppercase tracking-tight">REAPERTURA OK</div>}
                                </form>
                            </div>
                        </div>

                        <div className="lg:col-span-3">
                            <div className="bg-white shadow-sm rounded border border-zinc-200 overflow-hidden">
                                <div className="bg-[#f2f2f2] px-4 py-1.5 border-b border-zinc-200 flex flex-row justify-between items-center gap-4">
                                    <div className="flex gap-4 items-center flex-1 max-w-[300px]">
                                        <label className="text-[10px] font-normal text-black uppercase tracking-widest">Filtro Auditor:</label>
                                        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="h-6 flex-1 bg-white border border-zinc-300 text-[11px] font-normal uppercase outline-none focus:ring-1 focus:ring-[#285f94] px-2 cursor-pointer transition-all">
                                            <option value="">Todos los auditores</option>
                                            {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    <div className="whitespace-nowrap shrink-0">
                                        <span className="text-[10px] text-black font-normal uppercase tracking-tight">{filteredCounts.length} registros capturados</span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto max-h-[calc(100vh-350px)]">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#354a5f] sticky top-0 z-10 shadow-sm text-white">
                                            <tr>
                                                {['Auditor', 'Timestamp', 'Ítem', 'Ubicación', 'Cantidad', ''].map((h, i) => (
                                                    <th key={i} className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100">
                                            {filteredCounts.map((c) => (
                                                <tr key={c.id} className="hover:bg-[#f5f5f5] transition-colors leading-none">
                                                    <td className="px-4 py-2 text-[11px] font-semibold text-black">{c.username}</td>
                                                    <td className="px-4 py-2 text-[10px] text-black font-mono uppercase">{new Date(c.timestamp).toLocaleString('es-CO', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</td>
                                                    <td className="px-4 py-2 text-[11px] font-bold text-[#285f94] font-mono tracking-tight uppercase">{c.item_code}</td>
                                                    <td className="px-4 py-2 text-[11px] text-black font-mono uppercase">{c.counted_location}</td>
                                                    <td className="px-4 py-2 text-xs font-bold text-black border-l border-zinc-50">{c.counted_qty}</td>
                                                    <td className="px-4 py-2 text-right space-x-4">
                                                        <button onClick={() => navigate(`/counts/edit/${c.id}`)} className="text-black hover:text-[#285f94] text-[10px] font-bold uppercase transition-colors">Editar</button>
                                                        <button onClick={() => handleDelete(c.id)} className="text-black hover:text-red-600 text-[10px] font-bold uppercase transition-colors">Borrar</button>
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
        </div>
    );
};

export default AdminInventory;
