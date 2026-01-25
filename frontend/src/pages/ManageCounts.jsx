import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

const ManageCounts = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
    const [counts, setCounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filter states (these were removed as per instruction, but the original code had them)
    // const [filteredCounts, setFilteredCounts] = useState([]); // Removed
    // const [stats, setStats] = useState({ ... }); // Removed
    // const [usernames, setUsernames] = useState([]); // Removed
    // const [selectedUser, setSelectedUser] = useState(''); // Removed

    // Reopen Location Form State
    const [reopenSessionId, setReopenSessionId] = useState('');
    const [reopenLocationCode, setReopenLocationCode] = useState('');
    const [adminMsg, setAdminMsg] = useState('');

    useEffect(() => { setTitle("Gestionar Conteos"); }, [setTitle]);

    const fetchCounts = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/counts/all');
            if (!res.ok) throw new Error("Error loading counts");
            const data = await res.json();
            setCounts(data);
            // setFilteredCounts(data); // Removed
            // const distinctUsers = [...new Set(data.map(c => c.username).filter(Boolean))]; // Removed
            // setUsernames(distinctUsers); // Removed

            // const resStats = await fetch('/api/counts/stats'); // Removed
            // if (resStats.ok) { // Removed
            //     const dataStats = await resStats.json(); // Removed
            //     setStats(dataStats); // Removed
            // } // Removed
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCounts();
    }, []);

    // Filter Logic (Removed as per instruction)
    // useEffect(() => {
    //     if (!selectedUser) {
    //         setFilteredCounts(counts);
    //     } else {
    //         setFilteredCounts(counts.filter(c => c.username === selectedUser));
    //     }
    // }, [selectedUser, counts]);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este conteo permanentemente?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error deleting");
            fetchCounts(); // Reload all
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

    // Helper for Diff Color (Removed as per instruction)
    // const getDiffColor = (diff) => {
    //     if (diff === null || diff === undefined) return 'text-gray-700';
    //     if (diff > 0) return 'text-blue-600';
    //     if (diff < 0) return 'text-red-600';
    //     return 'text-gray-700';
    // };

    return (
        <div className="max-w-[1920px] mx-auto px-4 py-6 font-sans text-sm text-[#32363a]">

            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-xl font-normal text-[#32363a] mb-1">Gestionar Conteos Individuales</h1>
                <p className="text-sm text-[#6a6d70]">Visualiza y administra todos los registros de conteo del sistema</p>
            </div>

            {/* Admin Tool: Re-open Location - Prominent as per legacy */}
            <div className="mb-6 max-w-lg">
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

            {/* Stats Cards (Removed as per instruction) */}
            {/* <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
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
            </div> */}

            {/* Toolbar */}
            <div className="flex justify-end items-center mb-6">
                {/* Filter by user (Removed as per instruction) */}
                {/* <div className="flex items-center gap-3">
                    <label className="text-sm font-normal text-[#32363a]">Filtrar usuario:</label>
                    <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="h-9 border border-[#89919a] rounded px-2 bg-white text-[#32363a] focus:border-[#0a6ed1] focus:ring-1 focus:ring-[#0a6ed1] outline-none"
                    >
                        <option value="">Todos</option>
                        {usernames.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div> */}
                {/* Export button (Removed as per instruction) */}
                {/* <a
                    href="/api/export_counts?tz=America/Bogota"
                    className="inline-flex items-center px-4 py-2 border border-[#0854a0] text-[#0a6ed1] bg-white text-sm font-medium rounded hover:bg-[#ebf5fe] transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Exportar
                </a> */}
                <button
                    onClick={() => navigate('/view_counts')} // Link to ViewCounts
                    className="inline-flex items-center px-4 py-2 border border-[#0854a0] text-[#0a6ed1] bg-white text-sm font-medium rounded hover:bg-[#ebf5fe] transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                    </svg>
                    Volver a vista agrupada (Validar)
                </button>
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
                    <span className="text-xs px-2 py-1 rounded bg-[#f2f2f2] text-[#6a6d70]">{counts.length} registros</span>
                </div>
                                    <div className="overflow-x-auto max-h-[70vh]">
                                        <table className="min-w-full text-left border-collapse">
                                            <thead className="sticky top-0 z-10">
                                                <tr>
                                                    {['ID Conteo', 'ID Sesión', 'Usuario', 'Timestamp', 'Item Code', 'Descripción', 'Ubic. Contada', 'Cant. Contada', 'Acción'].map((h, i) => (
                                                        <th key={i} className="px-4 py-2 border-b border-[#e5e5e5] text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>                        <tbody className="divide-y divide-[#e5e5e5]">
                            {loading ? (
                                <tr><td colSpan="9" className="p-8 text-center text-gray-500">Cargando...</td></tr>
                            ) : counts.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="p-12 text-center text-gray-500">
                                        <p className="font-medium">No hay registros</p>
                                    </td>
                                </tr>
                            ) : (
                                counts.map((c) => (
                                    <tr key={c.id} className="hover:bg-[#f5f5f5] transition-colors">
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-semibold">{c.id}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.session_id}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-medium">{c.username || '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs text-gray-600 whitespace-nowrap">{c.timestamp}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-bold">{c.item_code}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm text-gray-600 truncate max-w-[200px]" title={c.item_description}>{c.item_description}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.counted_location}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.counted_qty}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-center flex gap-1 justify-center">
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

export default ManageCounts;
