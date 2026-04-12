import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const ViewCounts = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
    const [counts, setCounts] = useState([]);
    const [filteredCounts, setFilteredCounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState({
        total_items_to_count: 0,
        total_items_counted: 0,
        counted_locations: 0,
        total_units_counted: 0,
        progress_percentage: 0
    });
    const [selectedUser, setSelectedUser] = useState("");
    const [usernames, setUsernames] = useState([]);

    useEffect(() => { setTitle("Control de Conteos Físicos"); }, [setTitle]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Counts
            const resCounts = await fetch('/api/counts/all');
            if (!resCounts.ok) throw new Error("Error cargando conteos");
            const dataCounts = await resCounts.json();
            setCounts(dataCounts);
            setFilteredCounts(dataCounts);

            // Extract unique usernames for filter
            const distinctUsers = [...new Set(dataCounts.map(c => c.username).filter(Boolean))];
            setUsernames(distinctUsers);

            // 2. Fetch Stats
            const resStats = await fetch('/api/counts/stats');
            if (resStats.ok) {
                const dataStats = await resStats.json();
                setStats(dataStats);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter Logic
    useEffect(() => {
        if (!selectedUser) {
            setFilteredCounts(counts);
        } else {
            setFilteredCounts(counts.filter(c => c.username === selectedUser));
        }
    }, [selectedUser, counts]);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este registro de conteo permanentemente?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error al eliminar");
            fetchData(); // Reload all
        } catch (e) { alert(e.message); }
    };

    return (
        <div className="max-w-[1920px] mx-auto px-4 py-6 font-sans text-sm text-[#32363a]">

            {/* Page Header */}
            <div className="mb-6 flex justify-between items-end border-b border-gray-100 pb-4">
                <div>
                    <h1 className="text-base font-normal tracking-tight">Auditoría de Campo</h1>
                    <p className="text-[8px] uppercase tracking-widest font-normal leading-none mt-0.5">Monitoreo de avance de conteo físico general</p>
                </div>
                <div className="text-right">
                    <p className="text-[8px] text-gray-400 uppercase font-bold">Estado del Proceso</p>
                    <p className="text-base font-light text-green-600">{stats.progress_percentage}% Completado</p>
                </div>
            </div>

            {/* Stats Cards Compact */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                {[
                    { title: 'Items con Stock', val: stats.total_items_to_count, color: 'text-gray-500' },
                    { title: 'Items Contados', val: stats.total_items_counted, color: 'text-[#285f94]' },
                    { title: 'Progreso', val: `${stats.progress_percentage}%`, color: 'text-green-700' },
                    { title: 'Ubic. Contadas', val: stats.counted_locations, color: 'text-gray-600' },
                    { title: 'Total Unidades', val: stats.total_units_counted, color: 'text-[#285f94]' }
                ].map((s, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded p-4 shadow-sm">
                        <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${s.color}`}>{s.title}</h3>
                        <p className={`text-xl font-light ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex justify-between items-center mb-6 p-3 bg-white rounded border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Filtrar Auditor:</label>
                    <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="h-8 border border-gray-300 rounded px-3 bg-gray-50 text-sm outline-none focus:border-blue-500 transition-colors"
                    >
                        <option value="">Todos los auditores</option>
                        {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
                <div className="flex gap-4">
                    <a
                        href="/api/export_counts?tz=America/Bogota"
                        className="inline-flex items-center px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold uppercase tracking-tighter rounded hover:bg-gray-50 transition-colors"
                    >
                        Exportar Reporte
                    </a>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto max-h-[65vh]">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-gray-50">
                            <tr>
                                {['Etapa', 'Sesión', 'Auditor', 'Fecha / Hora', 'Item Code', 'Descripción', 'Ubicación', 'Cant. Física', 'Acciones'].map((h, i) => (
                                    <th key={i} className="px-4 py-3 border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-white-500">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan="9" className="p-8 text-center text-gray-400 italic">Cargando registros...</td></tr>
                            ) : filteredCounts.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="p-12 text-center text-gray-400 uppercase text-xs tracking-widest">
                                        No hay registros de conteo físico
                                    </td>
                                </tr>
                            ) : (
                                filteredCounts.map((c) => (
                                    <tr key={c.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-2 text-xs text-gray-400">{c.inventory_stage || '1'}</td>
                                        <td className="px-4 py-2 text-xs text-gray-400">{c.session_id}</td>
                                        <td className="px-4 py-2 text-xs font-semibold text-gray-700">{c.username || 'N/A'}</td>
                                        <td className="px-4 py-2 text-[10px] text-gray-500 whitespace-nowrap">
                                            {c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-xs font-bold text-slate-800">{c.item_code}</td>
                                        <td className="px-4 py-2 text-[11px] text-gray-500 truncate max-w-[300px]" title={c.item_description}>{c.item_description}</td>
                                        <td className="px-4 py-2 text-xs font-mono text-gray-600">{c.counted_location}</td>
                                        <td className="px-4 py-2 text-sm font-bold text-[#285f94]">{c.counted_qty}</td>
                                        <td className="px-4 py-2 text-right flex justify-end gap-2">
                                            <button onClick={() => navigate(`/counts/edit/${c.id}`)} className="text-gray-400 hover:text-blue-600 transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ViewCounts;
