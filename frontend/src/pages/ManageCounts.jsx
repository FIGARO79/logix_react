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
    //     if (diff > 0) return 'text-[#285f94]';
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

            {/* Admin Tool: Re-open Location - Single Line Layout (Compact) */}
            <div className="mb-6">
                <div className="bg-[#fffdf5] border border-[#ffecb3] border-l-4 border-l-[#e9730c] rounded-lg py-1.5 px-4 shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-x-4 gap-y-2">
                        <div className="flex items-center text-[#e9730c] shrink-0">
                            <h2 className="text-sm font-semibold text-[#32363a]">Reabrir Ubicación</h2>
                        </div>
                        
                        <form onSubmit={handleReopenLocation} className="flex flex-col md:flex-row items-end gap-3 flex-grow lg:justify-end">
                            <div className="w-full md:w-32">
                                <label className="block text-[9px] uppercase tracking-wider font-bold text-[#6a6d70] mb-0.5">ID Sesión</label>
                                <input type="number" value={reopenSessionId} onChange={e => setReopenSessionId(e.target.value)} className="block w-full border border-[#d1d5db] rounded px-3 py-1 h-8 text-xs focus:ring-1 focus:ring-[#e9730c] focus:border-[#e9730c] outline-none transition-all" placeholder="123" required />
                            </div>
                            <div className="w-full md:w-48">
                                <label className="block text-[9px] uppercase tracking-wider font-bold text-[#6a6d70] mb-0.5">Cód. Ubicación</label>
                                <input type="text" value={reopenLocationCode} onChange={e => setReopenLocationCode(e.target.value.toUpperCase())} className="block w-full border border-[#d1d5db] rounded px-3 py-1 h-8 text-xs focus:ring-1 focus:ring-[#e9730c] focus:border-[#e9730c] outline-none transition-all" placeholder="A-01-01" required />
                            </div>
                            <button type="submit" className="w-full md:w-auto bg-[#e9730c] hover:bg-[#d1670b] text-white font-semibold px-4 rounded h-8 text-xs transition-all shadow-sm flex items-center justify-center">
                                Reabrir
                            </button>
                        </form>
                    </div>
                    {adminMsg && <div className="mt-1 text-green-600 text-[10px] font-bold animate-pulse">{adminMsg}</div>}
                </div>
            </div>

            {/* Stats Cards (Removed as per instruction) */}
            {/* <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
                {[
                    { title: 'Items con Stock', val: stats.total_items_with_stock, color: 'text-[#6a6d70]' }, // Neutral
                    { title: 'Items Contados', val: stats.total_items_counted, color: 'text-[#107e3e]' },   // Positive
                    { title: 'Items con Diferencia', val: stats.items_with_differences, color: 'text-[#e9730c]' }, // Critical
                    { title: 'Dif. Positiva', val: stats.items_with_positive_differences, color: 'text-[#285f94]' }, // Informative
                    { title: 'Dif. Negativa', val: stats.items_with_negative_differences, color: 'text-[#b00]' },    // Negative
                    { title: 'Ubic. en uso', val: stats.total_locations_with_stock, color: 'text-[#6a6d70]' },   // Neutral
                    { title: 'Ubic. Contadas', val: stats.counted_locations, color: 'text-[#285f94]' }       // Informative
                ].map((s, idx) => (
                    <div key={idx} className="bg-white border border-[#d9d9d9] rounded p-4 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_0_rgba(0,0,0,0.15)] transition-all">
                        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.color}`}>{s.title}</h3>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div> */}

            {/* Toolbar */}
            <div className="flex justify-between items-center mb-6">
                <div>
                     <h2 className="text-base font-semibold text-[#32363a]">Registros Detallados</h2>
                </div>
                <button
                    onClick={() => navigate('/view_counts')} // Link to ViewCounts
                    className="inline-flex items-center px-6 py-2 border-2 border-[#1e4a74] text-[#285f94] bg-white text-sm font-bold rounded shadow-sm hover:bg-[#f0f7fe] hover:shadow transition-all"
                >
                    Vista Agrupada
                </button>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded border border-[#d9d9d9] overflow-hidden">
                <div className="bg-[#f2f2f2] px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between">
                    <div className="flex items-center">
                        <h2 className="text-sm font-semibold text-[#32363a]">Tabla de Conteos</h2>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-[#f2f2f2] text-[#6a6d70]">{counts.length} registros</span>
                </div>
                <div className="overflow-x-auto max-h-[70vh]">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="bg-[#1e4a74] text-white">
                            <tr>
                                {['ID Conteo', 'ID Sesión', 'Usuario', 'Timestamp', 'Item Code', 'Descripción', 'Ubic. Contada', 'Cant. Contada', 'Acción'].map((h, i) => (
                                    <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e5e5]">
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
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs text-gray-600 whitespace-nowrap">{c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm font-bold">{c.item_code}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm text-gray-600 truncate max-w-[200px]" title={c.item_description}>{c.item_description}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.counted_location}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-sm">{c.counted_qty}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-center flex gap-3 justify-center">
                                            <button onClick={() => navigate(`/counts/edit/${c.id}`)} title="Editar" className="text-indigo-600 hover:text-indigo-800 font-bold text-xs uppercase tracking-tight transition-colors">
                                                Editar
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} title="Eliminar" className="text-red-600 hover:text-red-800 font-bold text-xs uppercase tracking-tight transition-colors">
                                                Eliminar
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
