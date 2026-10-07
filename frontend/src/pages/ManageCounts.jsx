import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import '../styles/FluentPages.css';

const ManageCounts = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
    const [counts, setCounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Tolerance Settings State
    const [settings, setSettings] = useState({ w2w_qty_tolerance: 0.02, w2w_val_tolerance: 10.0 });
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState('');

    // Reopen Location Form State
    const [reopenSessionId, setReopenSessionId] = useState('');
    const [reopenLocationCode, setReopenLocationCode] = useState('');
    const [adminMsg, setAdminMsg] = useState('');

    useEffect(() => { setTitle("Edición de Conteos"); }, [setTitle]);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/w2w/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    w2w_qty_tolerance: data.w2w_qty_tolerance ?? 0.02,
                    w2w_val_tolerance: data.w2w_val_tolerance ?? 10.0
                });
            }
        } catch (e) {
            console.error("Error al cargar ajustes de tolerancia:", e);
        }
    }, []);

    const fetchCounts = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/counts/all');
            if (!res.ok) throw new Error("Error cargando auditoría");
            const data = await res.json();
            setCounts(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCounts();
        fetchSettings();
    }, [fetchSettings]);

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSettingsLoading(true);
        setSettingsMsg('');
        try {
            const res = await fetch('/api/w2w/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                setSettingsMsg("AJUSTES GUARDADOS");
                setTimeout(() => setSettingsMsg(''), 4000);
            } else {
                throw new Error("Error al guardar ajustes");
            }
        } catch (e) {
            alert(e.message);
        } finally {
            setSettingsLoading(false);
        }
    };

    const filteredCounts = counts.filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        return (
            (c.item_code && c.item_code.toLowerCase().includes(q)) ||
            (c.item_description && c.item_description.toLowerCase().includes(q)) ||
            (c.counted_location && c.counted_location.toLowerCase().includes(q)) ||
            (c.username && c.username.toLowerCase().includes(q)) ||
            (c.session_id && String(c.session_id).includes(q)) ||
            (c.id && String(c.id).includes(q))
        );
    });

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este registro de campo permanentemente?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Error al eliminar");
            fetchCounts(); // Reload all
        } catch (err) {
            alert(err.message);
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
            fetchCounts();
        } catch (err) {
            alert(err.message);
        }
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
            setAdminMsg("UBICACIÓN REABIERTA");
            setReopenLocationCode('');
            setTimeout(() => setAdminMsg(''), 4000);
        } catch (e) { alert(e.message); }
    };

    return (
        <div className="manage-counts-page max-w-[1920px] mx-auto px-4 py-2 text-xs">

            {/* Page Header */}
            <div className="mb-3 flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-normal text-[#201f1e] uppercase">Gestión de Capturas</h1>
                    <p className="text-[11px] text-[#605e5c]">Administra registros de conteo físico y ajustes de tolerancia WMS</p>
                </div>
                <button
                    onClick={() => navigate('/view_counts')}
                    className="inline-flex items-center px-4 py-1.5 border border-[#d2d0ce] text-[#201f1e] bg-white text-[11px] font-normal uppercase rounded shadow-sm hover:bg-[#f3f3f3] hover:border-[#8a8886] transition-all cursor-pointer"
                >
                    Vista Agrupada ➔
                </button>
            </div>

            {/* Admin Tools: Re-open Location & Tolerance Settings */}
            <div className="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Ajustes de Tolerancia (WMS) */}
                <div className="bg-[#f9f9f9] border border-[#d2d0ce] border-l-4 border-l-[#0078d4] rounded py-2 px-4 shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                        <h2 className="text-[11px] font-normal uppercase text-[#0078d4]">Ajustes de Tolerancia (WMS)</h2>
                        {settingsMsg && <span className="text-[10px] text-emerald-700 font-normal animate-pulse">{settingsMsg}</span>}
                    </div>
                    <form onSubmit={handleSaveSettings} className="flex flex-col sm:flex-row items-end gap-2.5">
                        <div className="w-full sm:w-1/2">
                            <label className="block text-[9px] uppercase font-normal text-[#605e5c] mb-0.5">Tolerancia Qty (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={settings.w2w_qty_tolerance}
                                onChange={(e) => setSettings({ ...settings, w2w_qty_tolerance: parseFloat(e.target.value) || 0 })}
                                className="block w-full border border-[#8a8886] rounded px-2 py-0.5 h-7 text-xs bg-white focus:outline-none focus:border-[#0078d4]"
                                required
                            />
                        </div>
                        <div className="w-full sm:w-1/2">
                            <label className="block text-[9px] uppercase font-normal text-[#605e5c] mb-0.5">Tolerancia Costo ($ USD)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={settings.w2w_val_tolerance}
                                onChange={(e) => setSettings({ ...settings, w2w_val_tolerance: parseFloat(e.target.value) || 0 })}
                                className="block w-full border border-[#8a8886] rounded px-2 py-0.5 h-7 text-xs bg-white focus:outline-none focus:border-[#0078d4]"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={settingsLoading}
                            className="w-full sm:w-auto bg-[#0078d4] hover:bg-[#106ebe] text-white font-normal uppercase px-3.5 rounded h-7 text-[10px] transition-all shadow-sm shrink-0 whitespace-nowrap cursor-pointer"
                        >
                            {settingsLoading ? 'GUARDANDO...' : 'GUARDAR'}
                        </button>
                    </form>
                </div>

                {/* Corrección de Ubicaciones Cerradas */}
                <div className="bg-[#fffdf5] border border-[#ffecb3] border-l-4 border-l-[#ca5010] rounded py-2 px-4 shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                        <h2 className="text-[11px] font-normal uppercase text-[#ca5010]">Corrección de Ubicaciones Cerradas</h2>
                        {adminMsg && <span className="text-[10px] text-emerald-700 font-normal animate-pulse">{adminMsg}</span>}
                    </div>
                    <form onSubmit={handleReopenLocation} className="flex flex-col sm:flex-row items-end gap-2.5">
                        <div className="w-full sm:w-1/2">
                            <label className="block text-[9px] uppercase font-normal text-[#605e5c] mb-0.5">ID Sesión</label>
                            <input type="number" value={reopenSessionId} onChange={e => setReopenSessionId(e.target.value)} className="block w-full border border-[#8a8886] rounded px-2 py-0.5 h-7 text-xs bg-white focus:outline-none focus:border-[#ca5010]" placeholder="ID" required />
                        </div>
                        <div className="w-full sm:w-1/2">
                            <label className="block text-[9px] uppercase font-normal text-[#605e5c] mb-0.5">Código Ubicación</label>
                            <input type="text" value={reopenLocationCode} onChange={e => setReopenLocationCode(e.target.value.toUpperCase())} className="block w-full border border-[#8a8886] rounded px-2 py-0.5 h-7 text-xs bg-white focus:outline-none focus:border-[#ca5010]" placeholder="UBICACIÓN" required />
                        </div>
                        <button type="submit" className="w-full sm:w-auto bg-[#ca5010] hover:bg-[#a23d08] text-white font-normal uppercase px-3.5 rounded h-7 text-[10px] transition-all shadow-sm shrink-0 whitespace-nowrap cursor-pointer">
                            Reabrir
                        </button>
                    </form>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded border border-[#d9d9d9] overflow-hidden">
                <div className="bg-[#f2f2f2] px-3 py-1.5 border-b border-[#e5e5e5] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 max-w-md bg-white border border-[#8a8886] rounded px-2.5 py-0.5 focus-within:border-[#0078d4]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <input
                            type="text"
                            className="w-full text-xs outline-none bg-transparent placeholder-[#605e5c] uppercase text-[#201f1e]"
                            placeholder="Buscar por SKU, Descripción, Ubicación, Auditor, Sesión..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="text-[#605e5c] hover:text-[#201f1e] text-xs font-normal px-1">
                                ✕
                            </button>
                        )}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-[#d2d0ce] text-[#605e5c] font-normal uppercase">
                        {filteredCounts.length} / {counts.length} REGISTROS TOTALES
                    </span>
                </div>
                <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full text-left border-collapse">
                        <thead className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce] sticky top-0 z-10">
                            <tr>
                                {['ID', 'Sesión', 'Etapa', 'Auditor', 'Fecha / Hora', 'Item Code', 'Descripción', 'Ubicación', 'Cant. Física', 'Cant. Sistema', 'Diferencia', 'Estado', 'Acciones'].map((h, i) => (
                                    <th key={i} className={`px-2 py-1 text-[10px] font-normal uppercase whitespace-nowrap ${['Cant. Física', 'Cant. Sistema', 'Diferencia'].includes(h) ? 'text-right' : h === 'Acciones' || h === 'Estado' ? 'text-center' : 'text-left'}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e1dfdd]">
                            {loading ? (
                                <tr><td colSpan="13" className="p-4 text-center text-[#605e5c] font-normal text-xs">Consultando base de datos...</td></tr>
                            ) : filteredCounts.length === 0 ? (
                                <tr>
                                    <td colSpan="13" className="p-8 text-center text-[#605e5c] uppercase text-xs font-normal">
                                        No existen registros que coincidan con la búsqueda
                                    </td>
                                </tr>
                            ) : (
                                filteredCounts.map((c) => {
                                    const sysQty = c.system_qty ?? 0;
                                    const diff = c.difference ?? ((c.counted_qty ?? 0) - sysQty);
                                    const absDiff = Math.abs(diff);

                                    let status = 'OK';
                                    if (absDiff > 0.0001) {
                                        if (c.manually_approved || c.status === 'APPROVED_MANUAL') {
                                            status = 'APPROVED_MANUAL';
                                        } else {
                                            const exceedsQty = sysQty > 0 ? (absDiff / sysQty) > (settings.w2w_qty_tolerance || 0.02) : absDiff > 0;
                                            const exceedsVal = (absDiff * (c.cost_per_unit || 0)) > (settings.w2w_val_tolerance || 10.0);
                                            status = (exceedsQty || exceedsVal) ? 'PENDING' : 'APPROVED_AUTO';
                                        }
                                    }

                                    return (
                                        <tr key={c.id} className="hover:bg-[#f3f9fd] transition-colors leading-none border-b border-[#e1dfdd] h-6">
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#605e5c]">{c.id}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#605e5c]">#{c.session_id}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#0078d4]">E{c.inventory_stage || '1'}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e]">{c.username || 'N/A'}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#605e5c] whitespace-nowrap">{c.timestamp ? new Date(c.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e] uppercase">{c.item_code}</td>
                                            <td className="px-2 py-0.5 text-sm text-[#605e5c] font-normal truncate max-w-[240px]" title={c.item_description}>{c.item_description}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e] uppercase">{c.counted_location}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#0078d4] text-right">{c.counted_qty}</td>
                                            <td className="px-2 py-0.5 text-sm font-normal text-[#201f1e] text-right">{sysQty}</td>
                                            <td className={`px-2 py-0.5 text-sm font-normal text-right ${
                                                diff < 0 ? 'text-[#a4262c]' : diff > 0 ? 'text-[#107c10]' : 'text-[#605e5c]'
                                            }`}>
                                                {diff > 0 ? `+${diff}` : diff}
                                            </td>
                                            <td className="px-2 py-0.5 text-center">
                                                {status === 'OK' && (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-normal rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                                                        SIN DIF
                                                    </span>
                                                )}
                                                {status === 'APPROVED_AUTO' && (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-normal rounded bg-[#dff6dd] text-[#107c10] border border-[#a2e6a1]">
                                                        AUTO OK
                                                    </span>
                                                )}
                                                {status === 'APPROVED_MANUAL' && (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-normal rounded bg-[#eff6fc] text-[#0078d4] border border-[#c7e0f4]">
                                                        APROB SUPERV
                                                    </span>
                                                )}
                                                {status === 'PENDING' && (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-normal rounded bg-[#fde7e9] text-[#a4262c] border border-[#f8b8bc]">
                                                        EXCEDE TOLER
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-2 py-0.5 text-center">
                                                <div className="flex gap-1.5 justify-center items-center">
                                                     {status === 'PENDING' && (
                                                         <button
                                                             onClick={() => handleApproveItem(c.item_code)}
                                                             title="Aprobar Diferencia Manualmente"
                                                             className="p-0.5 text-[#107c10] hover:text-[#0b5a0b] hover:bg-[#dff6dd] rounded transition-colors cursor-pointer"
                                                         >
                                                             <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                                                 <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                             </svg>
                                                         </button>
                                                     )}
                                                    <button onClick={() => navigate(`/counts/edit/${c.id}`)} title="Editar Captura" className="p-0.5 text-[#605e5c] hover:text-[#0078d4] transition-colors">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                    </button>
                                                    <button onClick={() => handleDelete(c.id)} title="Eliminar Registro" className="p-0.5 text-[#605e5c] hover:text-[#a4262c] transition-colors">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
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
export default ManageCounts;
