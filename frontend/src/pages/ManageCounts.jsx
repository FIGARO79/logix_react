import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

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

    useEffect(() => { setTitle("Administración de Auditoría de Campo"); }, [setTitle]);

    const fetchCounts = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/counts/all');
            if (!res.ok) throw new Error("Error cargando auditoría");
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
        if (!window.confirm("¿Eliminar este registro de campo permanentemente?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error al eliminar");
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
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-xl font-normal text-[#32363a] mb-1">Registros Detallados de Campo</h1>
                    <p className="text-xs text-[#6a6d70] uppercase tracking-widest font-bold">Administración de capturas físicas individuales</p>
                </div>
                <button
                    onClick={() => navigate('/view_counts')}
                    className="inline-flex items-center px-6 py-2 border-2 border-[#1e4a74] text-[#285f94] bg-white text-xs font-bold uppercase tracking-widest rounded shadow-sm hover:bg-blue-50 transition-all"
                >
                    Vista Agrupada
                </button>
            </div>

            {/* Admin Tool: Re-open Location */}
            <div className="mb-8">
                <div className="bg-[#fffdf5] border border-[#ffecb3] border-l-4 border-l-[#e9730c] rounded-lg py-3 px-6 shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-x-8 gap-y-4">
                        <div className="flex items-center text-[#e9730c] shrink-0">
                            <h2 className="text-sm font-bold uppercase tracking-tight">Corrección de Ubicaciones Cerradas</h2>
                        </div>
                        
                        <form onSubmit={handleReopenLocation} className="flex flex-col md:flex-row items-end gap-4 flex-grow lg:justify-end">
                            <div className="w-full md:w-32">
                                <label className="block text-[9px] uppercase tracking-widest font-bold text-[#6a6d70] mb-1">ID Sesión</label>
                                <input type="number" value={reopenSessionId} onChange={e => setReopenSessionId(e.target.value)} className="block w-full border border-[#d1d5db] rounded px-3 py-1.5 h-9 text-xs outline-none focus:ring-1 focus:ring-[#e9730c] transition-all" placeholder="ID" required />
                            </div>
                            <div className="w-full md:w-48">
                                <label className="block text-[9px] uppercase tracking-widest font-bold text-[#6a6d70] mb-1">Código Ubicación</label>
                                <input type="text" value={reopenLocationCode} onChange={e => setReopenLocationCode(e.target.value.toUpperCase())} className="block w-full border border-[#d1d5db] rounded px-3 py-1.5 h-9 text-xs outline-none focus:ring-1 focus:ring-[#e9730c] transition-all" placeholder="UBICACIÓN" required />
                            </div>
                            <button type="submit" className="w-full md:w-auto bg-[#e9730c] hover:bg-[#d1670b] text-white font-bold uppercase tracking-widest px-6 rounded h-9 text-[10px] transition-all shadow-sm">
                                Reabrir
                            </button>
                        </form>
                    </div>
                    {adminMsg && <div className="mt-2 text-green-600 text-[10px] font-bold animate-pulse">{adminMsg}</div>}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded border border-[#d9d9d9] overflow-hidden">
                <div className="bg-[#f2f2f2] px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between">
                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#32363a]">Base de Datos de Auditoría</h2>
                    <span className="text-[10px] px-2 py-1 rounded bg-white border border-gray-200 text-[#6a6d70] font-bold">{counts.length} REGISTROS TOTALES</span>
                </div>
                <div className="overflow-x-auto max-h-[65vh]">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="bg-[#1e4a74] text-white sticky top-0 z-10">
                            <tr>
                                {['ID', 'Sesión', 'Etapa', 'Auditor', 'Fecha / Hora', 'Item Code', 'Descripción', 'Ubicación', 'Cant. Física', 'Acciones'].map((h, i) => (
                                    <th key={i} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e5e5]">
                            {loading ? (
                                <tr><td colSpan="10" className="p-12 text-center text-gray-400 italic">Consultando base de datos...</td></tr>
                            ) : counts.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="p-16 text-center text-gray-400 uppercase text-xs tracking-widest">
                                        No existen registros de captura física
                                    </td>
                                </tr>
                            ) : (
                                counts.map((c) => (
                                    <tr key={c.id} className="hover:bg-[#f5f5f5] transition-colors border-b border-gray-50">
                                        <td className="px-4 py-2 text-xs text-gray-400">{c.id}</td>
                                        <td className="px-4 py-2 text-xs text-gray-400">{c.session_id}</td>
                                        <td className="px-4 py-2 text-xs font-bold text-blue-600">E{c.inventory_stage || '1'}</td>
                                        <td className="px-4 py-2 text-xs font-semibold text-gray-700">{c.username || 'N/A'}</td>
                                        <td className="px-4 py-2 text-[10px] text-gray-500 whitespace-nowrap">{c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                        <td className="px-4 py-2 text-xs font-bold text-slate-800">{c.item_code}</td>
                                        <td className="px-4 py-2 text-[11px] text-gray-500 truncate max-w-[200px]" title={c.item_description}>{c.item_description}</td>
                                        <td className="px-4 py-2 text-xs font-mono text-gray-600">{c.counted_location}</td>
                                        <td className="px-4 py-2 text-sm font-bold text-[#285f94]">{c.counted_qty}</td>
                                        <td className="px-4 py-2 text-center flex gap-4 justify-center">
                                            <button onClick={() => navigate(`/counts/edit/${c.id}`)} title="Editar Captura" className="text-gray-400 hover:text-blue-600 transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} title="Eliminar Registro" className="text-gray-400 hover:text-red-600 transition-colors">
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
