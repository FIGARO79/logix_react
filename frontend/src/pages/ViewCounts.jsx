import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import '../styles/FluentPages.css';

const ViewCounts = () => {
    const { setTitle } = useOutletContext();
    const [counts, setCounts] = useState([]);
    const [filteredCounts, setFilteredCounts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [stats, setStats] = useState({
        total_items_to_count: 0,
        total_items_counted: 0,
        counted_locations: 0,
        total_units_counted: 0,
        progress_percentage: 0
    });
    const [selectedUser, setSelectedUser] = useState("");
    const [usernames, setUsernames] = useState([]);

    useEffect(() => { setTitle("Conteos W2W"); }, [setTitle]);

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
            console.error(err);
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

    return (
        <div className="view-counts-page max-w-[1920px] mx-auto px-4 py-2 text-xs">

            {/* Page Header */}
            <div className="mb-2 flex justify-end items-center border-b border-[#e1dfdd] pb-1.5">
                <div className="text-right">
                    <p className="text-[10px] text-[#605e5c] uppercase font-normal">Estado del Proceso</p>
                    <p className="text-sm font-normal text-[#107c10]">{stats.progress_percentage}% Completado</p>
                </div>
            </div>

            {/* Stats Cards Compact */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                {[
                    { title: 'Items con Stock', val: stats.total_items_to_count, color: 'text-[#605e5c]' },
                    { title: 'Items Contados', val: stats.total_items_counted, color: 'text-[#201f1e]' },
                    { title: 'Progreso', val: `${stats.progress_percentage}%`, color: 'text-[#107c10]' },
                    { title: 'Ubic. Contadas', val: stats.counted_locations, color: 'text-[#201f1e]' },
                    { title: 'Total Unidades', val: stats.total_units_counted, color: 'text-[#201f1e]' }
                ].map((s, idx) => (
                    <div key={idx} className="bg-white border border-[#d2d0ce] rounded p-2 shadow-sm">
                        <h3 className={`text-[10px] font-normal uppercase mb-0.5 ${s.color}`}>{s.title}</h3>
                        <p className={`text-lg font-normal ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex justify-between items-center mb-4 p-2.5 bg-white rounded border border-[#d2d0ce] shadow-sm">
                <div className="flex items-center gap-3">
                    <label className="text-xs font-normal text-[#605e5c] uppercase">Filtrar Auditor:</label>
                    <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="h-7 border border-[#8a8886] rounded px-2.5 bg-white text-xs outline-none focus:border-[#0078d4] text-[#201f1e] transition-colors"
                    >
                        <option value="">Todos los auditores</option>
                        {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
                <div className="flex gap-2">
                    <a
                        href="/api/export_counts?tz=America/Bogota"
                        className="inline-flex items-center px-3 py-1 border border-[#d2d0ce] text-[#201f1e] bg-white text-xs font-normal uppercase rounded hover:bg-[#f3f3f3] hover:border-[#8a8886] transition-colors"
                    >
                        Exportar Reporte
                    </a>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded border border-[#d2d0ce] overflow-hidden">
                <div className="overflow-x-auto max-h-[calc(100vh-220px)]">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce]">
                            <tr>
                                {['Etapa', 'Sesión', 'Auditor', 'Fecha / Hora', 'Item Code', 'Descripción', 'Ubicación', 'Cant. Física', 'Cant. Sistema', 'Diferencia'].map((h, i) => (
                                    <th key={i} className={`px-2 py-1 text-[10px] font-normal uppercase whitespace-nowrap ${['Cant. Física', 'Cant. Sistema', 'Diferencia'].includes(h) ? 'text-right' : 'text-left'}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e1dfdd]">
                            {loading ? (
                                <tr><td colSpan="10" className="py-2 px-2 text-center text-[#605e5c] font-normal text-xs">Cargando registros...</td></tr>
                            ) : filteredCounts.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="py-4 px-2 text-center text-[#605e5c] uppercase text-xs font-normal">
                                        No hay registros de conteo físico
                                    </td>
                                </tr>
                            ) : (
                                filteredCounts.map((c) => {
                                    const diff = c.difference ?? ((c.counted_qty ?? 0) - (c.system_qty ?? 0));
                                    return (
                                        <tr key={c.id} className="hover:bg-[#f3f9fd] transition-colors leading-none border-b border-[#e1dfdd] h-6">
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#0078d4]">E{c.inventory_stage || '1'}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#605e5c]">#{c.session_id}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e]">{c.username || 'N/A'}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#605e5c] whitespace-nowrap">
                                                {c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                            </td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e] uppercase">{c.item_code}</td>
                                            <td className="px-2 py-0.5 text-sm text-[#605e5c] font-normal truncate max-w-[300px]" title={c.item_description}>{c.item_description}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e] uppercase">{c.counted_location}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#0078d4] text-right">{c.counted_qty}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e] text-right">{c.system_qty ?? 0}</td>
                                            <td className={`px-2 py-0.5 text-sm font-normal text-right ${
                                                diff < 0 ? 'text-[#a4262c]' : diff > 0 ? 'text-[#107c10]' : 'text-[#605e5c]'
                                            }`}>
                                                {diff > 0 ? `+${diff}` : diff}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ViewCounts;
