import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';

const ManageCountDifferences = () => {
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    // Filtros
    const [filterItemCode, setFilterItemCode] = useState('');
    const [filterType, setFilterType] = useState('all'); // all, negative, positive, zero

    // Modales
    const [editModal, setEditModal] = useState({ open: false, id: null, itemCode: '', desc: '', loc: '', system: 0, counted: 0 });
    const [deleteModal, setDeleteModal] = useState({ open: false, id: null, itemCode: '' });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        filterTable();
    }, [data, filterItemCode, filterType]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('http://localhost:8000/api/counts/differences');
            if (!res.ok) throw new Error('Error al cargar datos');
            const json = await res.json();
            setData(json.items || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const filterTable = () => {
        let res = [...data];
        const code = filterItemCode.toUpperCase();

        if (code) {
            res = res.filter(item => item.item_code.includes(code));
        }

        if (filterType === 'negative') res = res.filter(item => item.difference < 0);
        else if (filterType === 'positive') res = res.filter(item => item.difference > 0);
        else if (filterType === 'zero') res = res.filter(item => item.difference === 0);

        setFilteredData(res);
    };

    // --- Acciones de Edición ---
    const handleEditClick = (item) => {
        setEditModal({
            open: true,
            id: item.count_id,
            itemCode: item.item_code,
            desc: item.description,
            loc: item.location,
            system: item.system_qty,
            counted: item.counted_qty
        });
    };

    const handleSaveEdit = async () => {
        const qty = parseInt(editModal.counted);
        if (isNaN(qty) || qty < 0) {
            alert("Cantidad inválida");
            return;
        }

        try {
            const res = await fetch(`http://localhost:8000/api/counts/${editModal.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ counted_qty: qty })
            });
            if (!res.ok) throw new Error("Error al guardar");

            setMessage("Cantidad actualizada exitosamente");
            setEditModal({ ...editModal, open: false });
            loadData();
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            alert(err.message);
        }
    };

    // --- Acciones de Eliminación ---
    const handleDeleteClick = (item) => {
        setDeleteModal({ open: true, id: item.count_id, itemCode: item.item_code });
    };

    const handleConfirmDelete = async () => {
        try {
            const res = await fetch(`http://localhost:8000/api/counts/${deleteModal.id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error("Error al eliminar");

            setMessage("Registro eliminado");
            setDeleteModal({ ...deleteModal, open: false });
            loadData();
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            alert(err.message);
        }
    };

    // Exportar a Excel (reutiliza endpoint backend)
    const handleExport = () => {
        window.location.href = 'http://localhost:8000/api/export_counts';
    };

    return (
        <Layout title="Gestión de Diferencias de Conteo">
            <div className="max-w-7xl mx-auto px-4 py-6">

                {/* Header Page */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-xl font-normal text-gray-800">Gestión de Diferencias</h1>
                        <p className="text-sm text-gray-500">Verifica y edita las cantidades contadas vs. sistema</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleExport} className="btn-sap btn-secondary flex items-center gap-2">
                            <span className="text-green-600 font-bold">⬇</span> Exportar Excel
                        </button>
                        <button onClick={loadData} className="btn-sap btn-secondary flex items-center gap-2">
                            <span>↻</span> Actualizar
                        </button>
                    </div>
                </div>

                {message && <div className="bg-green-100 text-green-800 p-3 rounded mb-4 border border-green-200">{message}</div>}
                {error && <div className="bg-red-100 text-red-800 p-3 rounded mb-4 border border-red-200">{error}</div>}

                {/* Filtros */}
                <div className="bg-white p-4 rounded shadow border border-gray-200 mb-6 flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Filtrar por Item Code</label>
                        <input
                            type="text"
                            className="w-full border p-2 rounded text-sm uppercase"
                            placeholder="EJ: ABC123..."
                            value={filterItemCode}
                            onChange={(e) => setFilterItemCode(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Mostrar</label>
                        <select
                            className="w-full border p-2 rounded text-sm"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <option value="all">Todas las diferencias</option>
                            <option value="negative">Solo negativas ( - )</option>
                            <option value="positive">Solo positivas ( + )</option>
                            <option value="zero">Diferencia 0</option>
                        </select>
                    </div>
                    <div>
                        <button onClick={() => { setFilterItemCode(''); setFilterType('all'); }} className="btn-sap btn-secondary h-[38px]">
                            Limpiar Filtros
                        </button>
                    </div>
                </div>

                {/* Tabla */}
                <div className="bg-white rounded shadow overflow-hidden border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="uppercase font-semibold border-b">
                                <tr>
                                    <th className="p-3 w-20">Acciones</th>
                                    <th className="p-3">Item Code</th>
                                    <th className="p-3">Descripción</th>
                                    <th className="p-3">Ubicación</th>
                                    <th className="p-3 text-right">Qty Sistema</th>
                                    <th className="p-3 text-right">Qty Contada</th>
                                    <th className="p-3 text-right">Diferencia</th>
                                    <th className="p-3 text-right">% Var</th>
                                    <th className="p-3">Fecha</th>
                                    <th className="p-3">Usuario</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading && (
                                    <tr><td colSpan="10" className="p-6 text-center text-gray-500">Cargando datos...</td></tr>
                                )}
                                {!loading && filteredData.length === 0 && (
                                    <tr><td colSpan="10" className="p-6 text-center text-gray-500">No hay registros para mostrar.</td></tr>
                                )}
                                {filteredData.map((item) => (
                                    <tr key={item.count_id} className={`hover:bg-gray-50 ${item.difference !== 0 ? 'bg-orange-50/30' : ''}`}>
                                        <td className="p-3 flex gap-2">
                                            <button onClick={() => handleEditClick(item)} className="text-blue-600 hover:text-blue-800" title="Editar">
                                                ✎
                                            </button>
                                            <button onClick={() => handleDeleteClick(item)} className="text-red-600 hover:text-red-800" title="Eliminar">
                                                🗑
                                            </button>
                                        </td>
                                        <td className="p-3 font-semibold text-blue-800">{item.item_code}</td>
                                        <td className="p-3 truncate max-w-xs" title={item.description}>{item.description}</td>
                                        <td className="p-3">{item.location}</td>
                                        <td className="p-3 text-right">{item.system_qty}</td>
                                        <td className="p-3 text-right font-bold">{item.counted_qty}</td>
                                        <td className={`p-3 text-right font-bold ${item.difference > 0 ? 'text-blue-600' : item.difference < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                                        </td>
                                        <td className="p-3 text-right">{item.percentage_variance}%</td>
                                        <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{item.date}</td>
                                        <td className="p-3 text-xs text-gray-500">{item.username}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal Editar */}
            {editModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                        <h2 className="text-lg font-bold mb-4">Editar Cantidad Contada</h2>
                        <div className="space-y-3 mb-6">
                            <div><span className="font-semibold text-xs text-gray-500 uppercase">Item Code:</span> <div className="font-mono">{editModal.itemCode}</div></div>
                            <div><span className="font-semibold text-xs text-gray-500 uppercase">Descripción:</span> <div className="text-sm">{editModal.desc}</div></div>
                            <div><span className="font-semibold text-xs text-gray-500 uppercase">Ubicación:</span> <div>{editModal.loc}</div></div>
                            <div><span className="font-semibold text-xs text-gray-500 uppercase">Qty Sistema:</span> <div>{editModal.system}</div></div>

                            <div>
                                <label className="block font-bold mb-1">Nueva Cantidad Contada</label>
                                <input
                                    type="number"
                                    className="w-full border-2 border-blue-500 rounded p-2 text-xl font-bold"
                                    value={editModal.counted}
                                    onChange={(e) => setEditModal({ ...editModal, counted: e.target.value })}
                                    autoFocus
                                    min="0"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditModal({ ...editModal, open: false })} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Eliminar */}
            {deleteModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 border-t-4 border-red-600">
                        <h2 className="text-lg font-bold mb-2 text-red-700">Confirmar Eliminación</h2>
                        <p className="mb-4 text-gray-700">
                            ¿Estás seguro de que deseas eliminar el registro del item <strong>{deleteModal.itemCode}</strong>?
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteModal({ ...deleteModal, open: false })} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                            <button onClick={handleConfirmDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-bold">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}

        </Layout>
    );
};

export default ManageCountDifferences;
