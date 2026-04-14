import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const ManageCycleCountDifferences = () => {
    const { setTitle } = useOutletContext();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filtros
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [onlyDifferences, setOnlyDifferences] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [editingItem, setEditingItem] = useState(null);
    const [newPhysicalQty, setNewPhysicalQty] = useState('');

    useEffect(() => {
        setTitle("Gestión de Diferencias");
    }, [setTitle]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {
                year: year,
                only_differences: onlyDifferences
            };
            if (month) params.month = month;

            const queryParams = new URLSearchParams(params);
            const res = await fetch(`/api/planner/cycle_count_differences?${queryParams}`);
            if (!res.ok) throw new Error("Error cargando datos");
            const result = await res.json();
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [year, month, onlyDifferences, refreshTrigger]);


    const handleEdit = (item) => {
        setEditingItem(item);
        setNewPhysicalQty(item.physical_qty);
    };

    const handleSaveEdit = async () => {
        if (!editingItem) return;

        try {
            const res = await fetch(`/api/planner/cycle_count_differences/${editingItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ physical_qty: parseInt(newPhysicalQty) })
            });

            if (res.ok) {
                setEditingItem(null);
                setRefreshTrigger(prev => prev + 1); // Recargar datos
                alert("Cantidad actualizada correctamente");
            } else {
                const err = await res.json();
                alert(err.detail || "Error al actualizar");
            }
        } catch (e) {
            alert("Error de conexión");
        }
    };

    // Helper para formatear fecha
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 pt-3 pb-6 font-sans bg-[#fcfcfc] min-h-screen text-zinc-800">
            
            {/* Header Técnico */}
            <div className="flex justify-between items-center mb-6 border-b border-zinc-200 pb-4">
                <div className="flex flex-col gap-0">
                    <h1 className="text-[14px] font-normal tracking-tight">Gestión de Diferencias</h1>
                    <p className="text-[8px] uppercase tracking-widest font-normal leading-none mt-0.5 text-zinc-900">Auditoría de Resultados y Ajustes de Ciclo</p>
                </div>
            </div>
            {/* Filtros */}
            <div className="bg-white p-4 border border-zinc-200 mb-6 flex flex-wrap gap-6 items-end shadow-sm">
                <div>
                    <label className="block text-[9px] uppercase font-bold text-zinc-900 tracking-widest mb-1.5">Año</label>
                    <input
                        type="number"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="h-8 border border-zinc-200 rounded px-3 w-24 text-xs focus:ring-1 focus:ring-zinc-900 outline-none transition-all"
                    />
                </div>
                <div>
                    <label className="block text-[9px] uppercase font-bold text-zinc-900 tracking-widest mb-1.5">Mes</label>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="h-8 border border-zinc-200 rounded px-3 w-36 text-xs focus:ring-1 focus:ring-zinc-900 outline-none transition-all cursor-pointer"
                    >
                        <option value="">Todos los meses</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('es-ES', { month: 'long' })}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center pb-2">
                    <input
                        type="checkbox"
                        checked={onlyDifferences}
                        onChange={(e) => setOnlyDifferences(e.target.checked)}
                        id="onlyDiff"
                        className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                    />
                    <label htmlFor="onlyDiff" className="ml-2 text-[10px] uppercase font-bold text-zinc-900 tracking-tight cursor-pointer select-none">Solo Diferencias</label>
                </div>
                <div className="flex-grow"></div>
                <button 
                    onClick={fetchData} 
                    className="h-8 bg-zinc-900 text-white px-6 text-[10px] font-bold uppercase tracking-widest rounded hover:bg-black transition-all shadow-sm"
                >
                    Actualizar Vista
                </button>
            </div>

            <div className="bg-white shadow-sm border border-zinc-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-zinc-900 text-white">
                        <tr>
                            {['Fecha Ejec.', 'Item Code', 'Descripción', 'Ubicación', 'ABC', 'Sistema', 'Física', 'Diff', 'Usuario', 'Acciones'].map((h, i) => (
                                <th key={i} className={`px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest ${i > 4 && i < 8 ? 'text-right' : (i === 4 || i === 9 ? 'text-center' : 'text-left')}`}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {loading ? (
                            <tr><td colSpan="10" className="text-center py-8 text-zinc-400 text-[10px] uppercase font-bold tracking-widest">Analizando discrepancias...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan="10" className="text-center py-8 text-zinc-400 text-[10px] uppercase font-bold tracking-widest">No se encontraron diferencias en este periodo.</td></tr>
                        ) : (
                            data.map((row) => (
                                <tr key={row.id} className="hover:bg-zinc-50/50 transition-colors leading-none">
                                    <td className="px-4 py-1.5 whitespace-nowrap text-[10px] text-zinc-600 font-mono">{formatDate(row.executed_date)}</td>
                                    <td className="px-4 py-1.5 font-mono font-bold text-[#285f94] text-[11px]">{row.item_code}</td>
                                    <td className="px-4 py-1.5 truncate max-w-[200px] text-[10px] text-zinc-800 uppercase font-bold" title={row.item_description}>{row.item_description}</td>
                                    <td className="px-4 py-1.5 text-[11px] text-zinc-600 font-mono uppercase">{row.bin_location}</td>
                                    <td className="px-4 py-1.5 text-center">
                                        {row.abc_code && (
                                            <span className={`px-2 py-0.5 inline-flex text-[9px] font-bold uppercase tracking-tight rounded border ${
                                                row.abc_code === 'A' ? 'bg-red-50 text-red-800 border-red-200' :
                                                row.abc_code === 'B' ? 'bg-amber-50 text-amber-800 border-amber-200' : 
                                                'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                                {row.abc_code}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-1.5 text-right font-mono text-[11px] text-zinc-600">{row.system_qty}</td>
                                    <td className="px-4 py-1.5 text-right font-mono text-[11px] text-zinc-900 font-bold">{row.physical_qty}</td>
                                    <td className={`px-4 py-1.5 text-right font-bold text-[11px] ${row.difference !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {row.difference > 0 ? `+${row.difference}` : row.difference}
                                    </td>
                                    <td className="px-4 py-1.5 text-[10px] text-zinc-600 uppercase font-medium">{row.username}</td>
                                    <td className="px-4 py-1.5 text-center">
                                        <button
                                            onClick={() => handleEdit(row)}
                                            className="text-[9px] font-bold uppercase tracking-widest text-[#285f94] hover:text-black transition-colors leading-none"
                                            title="Recuento"
                                        >
                                            RECOUNT
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Editar */}
            {editingItem && (
                <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white border border-zinc-200 shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="bg-zinc-900 px-6 py-3">
                            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Actualizar Cantidad Física</h3>
                        </div>
                        <div className="p-6">
                            <div className="mb-6 space-y-1">
                                <label className="text-[8px] uppercase font-bold text-zinc-400 tracking-widest block">Referencia</label>
                                <p className="text-sm font-bold text-zinc-900 tracking-tight">{editingItem.item_code}</p>
                                <p className="text-[10px] text-zinc-500 uppercase">{editingItem.item_description}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="p-3 bg-zinc-50 border border-zinc-100">
                                    <label className="text-[8px] uppercase font-bold text-zinc-400 tracking-widest block mb-1">Stock Sistema</label>
                                    <p className="text-xl font-light text-zinc-900">{editingItem.system_qty}</p>
                                </div>
                                <div className="p-3 bg-blue-50/30 border border-blue-100">
                                    <label className="text-[8px] uppercase font-bold text-blue-400 tracking-widest block mb-1">Stock Físico</label>
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-xl font-bold text-[#285f94] focus:outline-none"
                                        value={newPhysicalQty}
                                        onChange={(e) => setNewPhysicalQty(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingItem(null)}
                                    className="px-4 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-900 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    className="px-6 py-2 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-black transition-all shadow-md"
                                >
                                    Confirmar Ajuste
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageCycleCountDifferences;
