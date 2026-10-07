import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const ManageCycleCountDifferences = () => {
    const { setTitle } = useOutletContext();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

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
            console.error("Error al cargar diferencias:", err);
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
        <div className="manage-cycle-diff-page max-w-[1400px] mx-auto px-6 pt-3 pb-6 font-sans bg-[#fcfcfc] min-h-screen text-[#323130]">
            
            {/* Header Técnico */}
            <div className="flex justify-between items-center mb-6 border-b border-[#e1dfdd] pb-4">
                <div className="flex flex-col gap-0">
                    <h1 className="text-[18px] font-normal text-[#201f1e] leading-tight">Gestión de Diferencias</h1>
                    <p className="text-xs font-normal text-[#605e5c] mt-0.5">Auditoría de Resultados y Ajustes de Ciclo</p>
                </div>
            </div>
            {/* Filtros */}
            <div className="bg-white p-4 border border-[#e1dfdd] rounded mb-6 flex flex-wrap gap-6 items-end shadow-sm">
                <div>
                    <label className="block text-xs uppercase font-normal text-[#605e5c] mb-1.5">Año</label>
                    <input
                        type="number"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="h-8 border border-[#d2d0ce] rounded px-3 w-24 text-xs focus:ring-1 focus:ring-[#0078d4] focus:border-[#0078d4] outline-none transition-all"
                    />
                </div>
                <div>
                    <label className="block text-xs uppercase font-normal text-[#605e5c] mb-1.5">Mes</label>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="h-8 border border-[#d2d0ce] rounded px-3 w-36 text-xs focus:ring-1 focus:ring-[#0078d4] focus:border-[#0078d4] outline-none transition-all cursor-pointer"
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
                        className="w-3.5 h-3.5 rounded border-[#d2d0ce] text-[#0078d4] focus:ring-[#0078d4] cursor-pointer"
                    />
                    <label htmlFor="onlyDiff" className="ml-2 text-xs font-normal text-[#323130] cursor-pointer select-none">Solo Diferencias</label>
                </div>
                <div className="flex-grow"></div>
                <button 
                    onClick={fetchData} 
                    className="h-8 bg-[#0078d4] hover:bg-[#106ebe] text-white px-6 text-xs font-normal rounded transition-colors shadow-sm"
                >
                    Actualizar Vista
                </button>
            </div>

            <div className="bg-white shadow-sm border border-[#e1dfdd] rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#e1dfdd]">
                        <tr>
                            {['Fecha Ejec.', 'Item Code', 'Descripción', 'Ubicación', 'ABC', 'Sistema', 'Física', 'Diff', 'Usuario', 'Acciones'].map((h, i) => (
                                <th key={i} className={`px-4 py-2.5 text-xs font-normal text-[#605e5c] uppercase ${i > 4 && i < 8 ? 'text-right' : (i === 4 || i === 9 ? 'text-center' : 'text-left')}`}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {loading ? (
                            <tr><td colSpan="10" className="text-center py-8 text-[#605e5c] text-xs font-normal">Analizando discrepancias...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan="10" className="text-center py-8 text-[#605e5c] text-xs font-normal">No se encontraron diferencias en este periodo.</td></tr>
                        ) : (
                            data.map((row) => (
                                <tr key={row.id} className="hover:bg-[#f9f9f9] transition-colors">
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-[#605e5c] font-mono">{formatDate(row.executed_date)}</td>
                                    <td className="px-4 py-2 font-mono font-normal text-[#0078d4] text-xs">{row.item_code}</td>
                                    <td className="px-4 py-2 truncate max-w-[200px] text-xs text-[#323130] uppercase font-normal" title={row.item_description}>{row.item_description}</td>
                                    <td className="px-4 py-2 text-xs text-[#605e5c] font-mono uppercase">{row.bin_location}</td>
                                    <td className="px-4 py-2 text-center">
                                        {row.abc_code && (
                                            <span className={`px-2 py-0.5 inline-flex text-xs font-normal uppercase rounded border ${
                                                row.abc_code === 'A' ? 'bg-red-50 text-red-800 border-red-200' :
                                                row.abc_code === 'B' ? 'bg-amber-50 text-amber-800 border-amber-200' : 
                                                'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                                {row.abc_code}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-xs text-[#605e5c]">{row.system_qty}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs text-[#201f1e] font-normal">{row.physical_qty}</td>
                                    <td className={`px-4 py-2 text-right font-normal text-xs ${row.difference !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {row.difference > 0 ? `+${row.difference}` : row.difference}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-[#605e5c] uppercase font-normal">{row.username}</td>
                                    <td className="px-4 py-2 text-center">
                                        <button
                                            onClick={() => handleEdit(row)}
                                            className="text-xs font-normal uppercase text-[#0078d4] hover:text-[#106ebe] transition-colors"
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white border border-[#e1dfdd] rounded shadow-xl max-w-sm w-full overflow-hidden">
                        <div className="bg-[#f3f3f3] border-b border-[#e1dfdd] px-6 py-3">
                            <h3 className="text-xs font-normal text-[#201f1e] uppercase">Actualizar Cantidad Física</h3>
                        </div>
                        <div className="p-6">
                            <div className="mb-6 space-y-1">
                                <label className="text-xs uppercase font-normal text-[#605e5c] block">Referencia</label>
                                <p className="text-sm font-normal text-[#0078d4]">{editingItem.item_code}</p>
                                <p className="text-xs text-[#605e5c] uppercase">{editingItem.item_description}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="p-3 bg-[#f9f9f9] border border-[#e1dfdd] rounded">
                                    <label className="text-xs uppercase font-normal text-[#605e5c] block mb-1">Stock Sistema</label>
                                    <p className="text-xl font-normal text-[#201f1e]">{editingItem.system_qty}</p>
                                </div>
                                <div className="p-3 bg-blue-50/30 border border-[#0078d4] rounded">
                                    <label className="text-xs uppercase font-normal text-[#0078d4] block mb-1">Stock Físico</label>
                                    <input
                                        type="number"
                                        className="w-full bg-transparent text-xl font-normal text-[#0078d4] focus:outline-none"
                                        value={newPhysicalQty}
                                        onChange={(e) => setNewPhysicalQty(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingItem(null)}
                                    className="px-4 py-2 text-xs font-normal text-[#605e5c] hover:text-[#201f1e] transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    className="px-6 py-2 bg-[#0078d4] text-white text-xs font-normal rounded hover:bg-[#106ebe] transition-all shadow-sm"
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
