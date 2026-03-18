import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

const ManageCounts = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
    const [counts, setCounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCounts();
    }, []);

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

            {/* Toolbar */}
            <div className="flex justify-end items-center mb-6">
                <button
                    onClick={() => navigate('/view_counts')} // Link to ViewCounts
                    className="inline-flex items-center px-4 py-2 border border-[#1e4a74] text-[#285f94] bg-white text-sm font-medium rounded hover:bg-[#f0f7fe] transition-colors"
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
                        <thead className="sticky top-0 z-10 bg-[#f2f2f2]">
                            <tr>
                                {['ID Conteo', 'ID Sesión', 'Usuario', 'Timestamp', 'Item Code', 'Descripción', 'Ubic. Contada', 'Cant. Contada', 'Acción'].map((h, i) => (
                                    <th key={i} className="px-4 py-2 border-b border-[#e5e5e5] text-[10px] font-bold uppercase tracking-wider text-[#6a6d70] whitespace-nowrap">
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
                                    <tr key={c.id} className="hover:bg-[#f9fafb] transition-colors">
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs font-semibold">{c.id}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs text-[#6a6d70]">{c.session_id}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs font-medium text-[#32363a]">{c.username || '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-[10px] text-gray-500 whitespace-nowrap">{c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs font-bold text-[#285f94]">{c.item_code}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs text-gray-500 truncate max-w-[200px]" title={c.item_description}>{c.item_description}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs font-medium">{c.counted_location}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-xs font-bold text-[#107e3e]">{c.counted_qty}</td>
                                        <td className="px-4 py-2 border-b border-[#e5e5e5] text-center">
                                            <div className="flex gap-1 justify-center">
                                                <button onClick={() => navigate(`/counts/edit/${c.id}`)} title="Editar" className="text-[#0854a0] hover:bg-[#ebf5fe] p-1 rounded transition-colors">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                </button>
                                                <button onClick={() => handleDelete(c.id)} title="Eliminar" className="text-[#b00] hover:bg-red-50 p-1 rounded transition-colors">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
    );
};

export default ManageCounts;
