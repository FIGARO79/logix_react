import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';

const ManageCycleCountDifferences = () => {
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    // Filtros
    const [filterYear, setFilterYear] = useState('');
    const [filterMonth, setFilterMonth] = useState('');
    const [filterItemCode, setFilterItemCode] = useState('');
    const [filterDifferencesOnly, setFilterDifferencesOnly] = useState(true);

    // Modal Edit
    const [editModal, setEditModal] = useState({ open: false, id: null, itemCode: '', system: 0, physical: 0 });

    useEffect(() => {
        // Set default year
        setFilterYear(new Date().getFullYear().toString());
    }, []);

    // Cargar datos cuando cambian los filtros principales (Año/Mes/OnlyDiff)
    useEffect(() => {
        loadDifferences();
    }, [filterYear, filterMonth, filterDifferencesOnly]);

    // Filtrar localmente cuando cambia el filtro de texto
    useEffect(() => {
        if (!filterItemCode) {
            setFilteredData(data);
        } else {
            setFilteredData(data.filter(item => item.item_code.includes(filterItemCode.toUpperCase())));
        }
    }, [data, filterItemCode]);

    const loadDifferences = async () => {
        // No cargar si no hay año (opcional, pero buena práctica)
        if (!filterYear) return;

        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (filterYear) params.append('year', filterYear);
            if (filterMonth) params.append('month', filterMonth);
            params.append('only_differences', filterDifferencesOnly);

            const res = await fetch(`http://localhost:8000/api/planner/cycle_count_differences?${params.toString()}`);
            if (!res.ok) throw new Error('Error al cargar datos');
            const json = await res.json();
            setData(json);
            setFilteredData(json); // Reset filtro texto
        } catch (err) {
            setError(err.message);
            setData([]);
            setFilteredData([]);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (item) => {
        setEditModal({
            open: true,
            id: item.id,
            itemCode: item.item_code,
            system: item.system_qty,
            physical: item.physical_qty
        });
    };

    const handleSaveEdit = async () => {
        const qty = parseInt(editModal.physical);
        if (isNaN(qty) || qty < 0) {
            alert("Cantidad inválida");
            return;
        }

        try {
            const res = await fetch(`http://localhost:8000/api/planner/cycle_count_differences/${editModal.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ physical_qty: qty })
            });

            if (!res.ok) throw new Error("Error al guardar");

            setMessage("Cantidad actualizada exitosamente");
            setEditModal({ ...editModal, open: false });

            // Recargar datos para ver cambio
            loadDifferences();
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            alert(err.message);
        }
    };

    const exportToExcel = () => {
        // Simple HTML table export strategy or Backend endpoint if available?
        // Backend `generate_plan` is for PLAN, not Differences. 
        // We'll implemented a quick frontend-to-csv or similar if requested.
        // For now, let's stick to the "Action" button style.
        alert("Función de exportar pendiente de backend (o usar librería JS).");
    };

    return (
        <Layout title="Gestión de Diferencias - Cíclicos">
            <div className="max-w-9xl mx-auto px-4 py-6">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-xl font-normal text-gray-800">Gestión de Diferencias (Planificador)</h1>
                        <p className="text-sm text-gray-500">Verifique y edite las cantidades de los conteos cíclicos</p>
                    </div>
                </div>

                {message && <div className="bg-green-100 text-green-800 p-3 rounded mb-4">{message}</div>}

                {/* Filtros */}
                <div className="bg-white p-4 rounded shadow border border-gray-200 mb-6 flex flex-wrap gap-4 items-end">
                    <div className="w-24">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Año</label>
                        <input type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)} className="w-full border p-2 rounded text-sm" />
                    </div>
                    <div className="w-32">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Mes</label>
                        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-full border p-2 rounded text-sm">
                            <option value="">Todos</option>
                            <option value="1">Enero</option>
                            <option value="2">Febrero</option>
                            <option value="3">Marzo</option>
                            <option value="4">Abril</option>
                            <option value="5">Mayo</option>
                            <option value="6">Junio</option>
                            <option value="7">Julio</option>
                            <option value="8">Agosto</option>
                            <option value="9">Septiembre</option>
                            <option value="10">Octubre</option>
                            <option value="11">Noviembre</option>
                            <option value="12">Diciembre</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Item Code</label>
                        <input
                            type="text"
                            value={filterItemCode}
                            onChange={e => setFilterItemCode(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full border p-2 rounded text-sm uppercase"
                        />
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer border p-2 rounded bg-gray-50 hover:bg-gray-100">
                            <input
                                type="checkbox"
                                checked={filterDifferencesOnly}
                                onChange={e => setFilterDifferencesOnly(e.target.checked)}
                            />
                            Solo con Diferencia
                        </label>
                    </div>
                    <div>
                        <button onClick={loadDifferences} className="btn-sap btn-primary h-[38px] flex items-center gap-2">
                            Filtrar
                        </button>
                    </div>
                </div>

                {/* Tabla */}
                <div className="bg-white rounded shadow overflow-hidden border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 uppercase font-semibold border-b">
                                <tr>
                                    <th className="p-3">Fecha</th>
                                    <th className="p-3">Item Code</th>
                                    <th className="p-3">Descripción</th>
                                    <th className="p-3">Ubicación</th>
                                    <th className="p-3">ABC</th>
                                    <th className="p-3 text-right">Qty Sistema</th>
                                    <th className="p-3 text-right">Qty Contada</th>
                                    <th className="p-3 text-right">Diferencia</th>
                                    <th className="p-3">Usuario</th>
                                    <th className="p-3">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading && <tr><td colSpan="10" className="p-6 text-center">Cargando...</td></tr>}
                                {!loading && filteredData.length === 0 && <tr><td colSpan="10" className="p-6 text-center text-gray-500">No hay registros</td></tr>}

                                {filteredData.map(item => {
                                    const diffClass = item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : 'text-gray-400';
                                    const abcClass = item.abc_code === 'A' ? 'bg-red-100 text-red-800' : item.abc_code === 'B' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800';

                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="p-3 whitespace-nowrap">{item.executed_date}</td>
                                            <td className="p-3 font-medium">{item.item_code}</td>
                                            <td className="p-3 truncate max-w-xs">{item.item_description}</td>
                                            <td className="p-3">{item.bin_location}</td>
                                            <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${abcClass}`}>{item.abc_code}</span></td>
                                            <td className="p-3 text-right text-gray-600">{item.system_qty}</td>
                                            <td className="p-3 text-right font-bold text-gray-900">{item.physical_qty}</td>
                                            <td className={`p-3 text-right font-bold ${diffClass}`}>
                                                {item.difference > 0 ? `+${item.difference}` : item.difference}
                                            </td>
                                            <td className="p-3 text-xs text-gray-500">{item.username}</td>
                                            <td className="p-3">
                                                <button onClick={() => handleEditClick(item)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                                                    Editar
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal Editar */}
            {editModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
                        <h2 className="text-lg font-bold mb-4">Editar Cantidad (Cíclico)</h2>
                        <div className="mb-4 space-y-2">
                            <div className="text-sm"><strong>Item:</strong> {editModal.itemCode}</div>
                            <div className="text-sm"><strong>Qty Sistema:</strong> {editModal.system}</div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm font-bold mb-1">Nueva Cantidad Contada</label>
                            <input
                                type="number"
                                className="w-full border-2 border-blue-500 rounded p-2 text-xl font-bold"
                                value={editModal.physical}
                                onChange={e => setEditModal({ ...editModal, physical: e.target.value })}
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditModal({ ...editModal, open: false })} className="px-4 py-2 border rounded">Cancelar</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default ManageCycleCountDifferences;
