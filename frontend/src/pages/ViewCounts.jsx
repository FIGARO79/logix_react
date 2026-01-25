import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

const ViewCounts = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
    const [counts, setCounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filteredCounts, setFilteredCounts] = useState([]);

    // Stats & Filters
    const [stats, setStats] = useState({
        total_items_with_stock: '-',
        total_items_counted: '-',
        items_with_differences: '-',
        items_with_positive_differences: '-',
        items_with_negative_differences: '-',
        total_locations_with_stock: '-',
        counted_locations: '-'
    });
    const [usernames, setUsernames] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');

    useEffect(() => { setTitle("Control de Conteos"); }, [setTitle]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Counts
            const resCounts = await fetch('/api/counts/all');
            if (!resCounts.ok) throw new Error("Error loading counts");
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
        if (!window.confirm("¿Eliminar este conteo permanentemente?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error deleting");
            fetchData(); // Reload all
        } catch (e) { alert(e.message); }
    };

    // Helper for Diff Color
    const getDiffColor = (diff) => {
        if (diff === null || diff === undefined) return 'text-gray-700';
        if (diff > 0) return 'text-blue-600';
        if (diff < 0) return 'text-red-600';
        return 'text-gray-700';
    };

    return (
        <div className="max-w-[1920px] mx-auto px-4 py-6 font-sans text-sm text-[#32363a]">

            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-xl font-normal text-[#32363a] mb-1">Control de Conteos</h1>
                <p className="text-sm text-[#6a6d70]">Visualiza y analiza los conteos del inventario</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
                {[
                    { title: 'Items con Stock', val: stats.total_items_with_stock, color: 'text-[#6a6d70]' }, // Neutral
                    { title: 'Items Contados', val: stats.total_items_counted, color: 'text-[#107e3e]' },   // Positive
                    { title: 'Items con Diferencia', val: stats.items_with_differences, color: 'text-[#e9730c]' }, // Critical
                    { title: 'Dif. Positiva', val: stats.items_with_positive_differences, color: 'text-[#0a6ed1]' }, // Informative
                    { title: 'Dif. Negativa', val: stats.items_with_negative_differences, color: 'text-[#b00]' },    // Negative
                    { title: 'Ubic. en uso', val: stats.total_locations_with_stock, color: 'text-[#6a6d70]' },   // Neutral
                    { title: 'Ubic. Contadas', val: stats.counted_locations, color: 'text-[#0a6ed1]' }       // Informative
                ].map((s, idx) => (
                    <div key={idx} className="bg-white border border-[#d9d9d9] rounded p-4 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_0_rgba(0,0,0,0.15)] transition-all">
                        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.color}`}>{s.title}</h3>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex justify-between items-center mb-6 p-3 bg-white rounded border border-[#d9d9d9]">
                <div className="flex items-center gap-3">
                    <label className="text-sm font-normal text-[#32363a]">Filtrar usuario:</label>
                    <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="h-9 border border-[#89919a] rounded px-2 bg-white text-[#32363a] focus:border-[#0a6ed1] focus:ring-1 focus:ring-[#0a6ed1] outline-none"
                    >
                        <option value="">Todos</option>
                        {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
                <div className="flex gap-4">
                    {/* No 'Reopen' here, but maybe a link to manage counts if needed? Legacy just has Export on view_counts */}
                    <a
                        href="/api/export_counts?tz=America/Bogota"
                        className="inline-flex items-center px-4 py-2 border border-[#0854a0] text-[#0a6ed1] bg-white text-sm font-medium rounded hover:bg-[#ebf5fe] transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Exportar
                    </a>
                </div>

            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded border border-[#d9d9d9] overflow-hidden">
                <div className="bg-[#f2f2f2] px-4 py-3 border-b border-[#e5e5e5] flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#32363a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h2 className="text-sm font-semibold text-[#32363a]">Detalle de Conteos</h2>
                </div>
                <div className="overflow-x-auto max-h-[70vh]">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="bg-[#f2f2f2] sticky top-0 z-10">
                            <tr>
                                {['Etapa', 'ID Sesión', 'Usuario', 'Timestamp', 'Item Code', 'Descripción', 'Ubic. Contada', 'Cant. Sistema', 'Cant. Contada', 'Diferencia', 'Ubic. Sistema', 'Acciones'].map((h, i) => (
                                    <th key={i} className="px-4 py-2 border-b border-[#e5e5e5] text-xs font-semibold uppercase tracking-wider text-[#32363a] whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e5e5]">
                            {loading ? (
                                <tr><td colSpan="12" className="p-8 text-center text-gray-500">Cargando...</td></tr>
                            ) : filteredCounts.length === 0 ? (
                                <tr>
                                    <td colSpan="12" className="p-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <svg className="h-12 w-12 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                            <p className="font-medium">No hay registros de conteo</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredCounts.map((c) => (
                                    <tr key={c.id} className="hover:bg-[#f5f5f5] transition-colors">
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.inventory_stage || '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.session_id}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-medium">{c.username || '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs text-gray-600 whitespace-nowrap">{c.timestamp}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-bold">{c.item_code}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm text-gray-600 truncate max-w-[200px]" title={c.item_description}>{c.item_description}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.counted_location}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-medium">{c.system_qty !== null ? c.system_qty : '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.counted_qty}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-bold">
                                            <span className={getDiffColor(c.difference)}>{c.difference !== null ? c.difference : '-'}</span>
                                        </td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm text-gray-600">{c.bin_location_system || '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-center flex gap-1">
                                            {/* Edit/Delete actions */}
                                            <button onClick={() => navigate(`/counts/edit/${c.id}`)} title="Editar" className="text-indigo-600 hover:bg-indigo-50 p-1 rounded">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} title="Eliminar" className="text-red-600 hover:bg-red-50 p-1 rounded">
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
