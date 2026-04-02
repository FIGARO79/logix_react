import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

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
        setTitle("Gestión de Diferencias - Conteos Cíclicos");
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
            const res = await fetch(`/api/planner/cycle_count_differences?${queryParams}`, { credentials: 'include' });
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
                credentials: 'include',
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
        <div className="max-w-7xl mx-auto px-4 py-6 font-sans">
            {/* Filtros */}
            <div className="bg-white p-4 rounded shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-gray-700 font-medium mb-1">Año</label>
                    <input
                        type="number"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 w-20"
                    />
                </div>
                <div>
                    <label className="block text-gray-700 font-medium mb-1">Mes</label>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 w-32"
                    >
                        <option value="">Todos</option>
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
                        className="mr-2"
                    />
                    <label htmlFor="onlyDiff" className="cursor-pointer select-none">Solo Diferencias</label>
                </div>
                <div className="flex-grow"></div>
                <button onClick={fetchData} className="bg-[#285f94] text-white px-4 py-1.5 rounded hover:bg-[#1e4a74] transition">
                    Actualizar
                </button>
            </div>

            <div className="bg-white shadow-sm rounded border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse text-[11px] leading-tight">
                    <thead className="bg-slate-700 text-white">
                        <tr>
                            <th className="px-3 py-2">Fecha Ejec.</th>
                            <th className="px-3 py-2">Item Code</th>
                            <th className="px-3 py-2">Descripción</th>
                            <th className="px-3 py-2">Ubicación</th>
                            <th className="px-3 py-2 text-center">ABC</th>
                            <th className="px-3 py-2 text-right">Cant. Sistema</th>
                            <th className="px-3 py-2 text-right">Cant. Física</th>
                            <th className="px-3 py-2 text-right">Diferencia</th>
                            <th className="px-3 py-2">Usuario</th>
                            <th className="px-3 py-2 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="10" className="text-center py-4 text-gray-500">Cargando...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan="10" className="text-center py-4 text-gray-500">No se encontraron registros.</td></tr>
                        ) : (
                            data.map((row) => (
                                <tr key={row.id} className="hover:bg-blue-50 transition-colors">
                                    <td className="px-3 py-1 whitespace-nowrap">{formatDate(row.executed_date)}</td>
                                    <td className="px-3 py-1 font-mono font-medium text-[#1e4a74]">{row.item_code}</td>
                                    <td className="px-3 py-1 truncate max-w-[200px]" title={row.item_description}>{row.item_description}</td>
                                    <td className="px-3 py-1">{row.bin_location}</td>
                                    <td className="px-3 py-1 text-center">
                                        {row.abc_code && (
                                            <span className={`inline-block w-5 h-5 leading-5 rounded-full text-[9px] font-bold 
                                                ${row.abc_code === 'A' ? 'bg-red-100 text-red-800' :
                                                    row.abc_code === 'B' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                                {row.abc_code}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1 text-right font-mono">{row.system_qty}</td>
                                    <td className="px-3 py-1 text-right font-mono">{row.physical_qty}</td>
                                    <td className={`px-3 py-1 text-right font-bold ${row.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {row.difference > 0 ? `+${row.difference}` : row.difference}
                                    </td>
                                    <td className="px-3 py-1 text-gray-600">{row.username}</td>
                                    <td className="px-3 py-1 text-center">
                                        <button
                                            onClick={() => handleEdit(row)}
                                            className="bg-blue-50 hover:bg-blue-100 text-[#285f94] p-1 rounded border border-blue-200 transition-colors"
                                            title="Recount"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full">
                        <h3 className="text-lg font-semibold mb-4">Actualizar Cantidad Física</h3>
                        <p className="mb-2 text-gray-600">Item: <strong>{editingItem.item_code}</strong></p>
                        <p className="mb-4 text-gray-600">Cant. Sistema: {editingItem.system_qty}</p>

                        <label className="block mb-1 text-sm font-medium">Nueva Cantidad Física:</label>
                        <input
                            type="number"
                            className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-[#285f94]"
                            value={newPhysicalQty}
                            onChange={(e) => setNewPhysicalQty(e.target.value)}
                            autoFocus
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setEditingItem(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2 bg-[#285f94] text-white rounded hover:bg-[#1e4a74]"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageCycleCountDifferences;
