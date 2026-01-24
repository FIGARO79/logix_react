import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const ManageCycleCountDifferences = () => {
    const { setTitle } = useOutletContext();
    const [loading, setLoading] = useState(false);
    const [auditItems, setAuditItems] = useState([]);

    // Filters
    const [filterYear, setFilterYear] = useState('');
    const [filterMonth, setFilterMonth] = useState('');
    const [filterItemCode, setFilterItemCode] = useState('');
    const [filterOnlyDiff, setFilterOnlyDiff] = useState(true);

    // Edit Modal
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [editPhysicalQty, setEditPhysicalQty] = useState('');

    useEffect(() => {
        setTitle("Logix - Gestión de Diferencias");
        loadDifferences();
    }, [setTitle]);

    const loadDifferences = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterYear) params.append('year', filterYear);
            if (filterMonth) params.append('month', filterMonth);
            params.append('only_differences', filterOnlyDiff);

            const res = await fetch(`/api/planner/cycle_count_differences?${params.toString()}`);
            if (res.ok) {
                let data = await res.json();
                if (filterItemCode) {
                    data = data.filter(i => i.item_code.includes(filterItemCode.toUpperCase()));
                }
                setAuditItems(data);
            } else {
                toast.error("Error cargando diferencias");
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (item) => {
        setCurrentItem(item);
        setEditPhysicalQty(item.physical_qty);
        setEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!currentItem) return;
        try {
            const res = await fetch(`/api/planner/cycle_count_differences/${currentItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ physical_qty: parseInt(editPhysicalQty) })
            });

            if (res.ok) {
                toast.success("Cantidad actualizada");
                setEditModalOpen(false);
                loadDifferences();
            } else {
                toast.error("Error al guardar");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    return (
        <div className="container-wrapper max-w-6xl mx-auto px-4 py-6">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="mb-6">
                <h1 className="text-xl font-normal text-gray-800 mb-2">Gestión de Diferencias</h1>
                <p className="text-sm text-gray-500">Verifique y edite las cantidades encontradas en los conteos cíclicos</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4 mb-6 bg-white p-4 rounded shadow-sm border border-gray-200">
                <div>
                    <label className="form-label text-xs">Año</label>
                    <input type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)} className="w-24 p-1 border rounded" placeholder="YYYY" />
                </div>
                <div>
                    <label className="form-label text-xs">Mes</label>
                    <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-32 p-1 border rounded">
                        <option value="">Todos</option>
                        {[...Array(12)].map((_, i) => <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('es', { month: 'long' })}</option>)}
                    </select>
                </div>
                <div className="flex-grow">
                    <label className="form-label text-xs">Código Item</label>
                    <input type="text" value={filterItemCode} onChange={e => setFilterItemCode(e.target.value)} className="w-full p-1 border rounded uppercase" placeholder="Buscar..." />
                </div>
                <div className="flex items-center mb-2">
                    <input type="checkbox" checked={filterOnlyDiff} onChange={e => setFilterOnlyDiff(e.target.checked)} className="mr-2" />
                    <span className="text-sm">Solo diferencias</span>
                </div>
                <button onClick={loadDifferences} className="btn-sap btn-primary text-xs py-2 px-4 h-[34px]">Filtrar</button>
            </div>

            {/* Table */}
            <div className="bg-white shadow rounded overflow-hidden border border-gray-200">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Cargando...</div>
                ) : auditItems.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No se encontraron registros</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs border-b">
                                <tr>
                                    <th className="px-4 py-3">Fecha</th>
                                    <th className="px-4 py-3">Item</th>
                                    <th className="px-4 py-3">Descripción</th>
                                    <th className="px-4 py-3">Ubicación</th>
                                    <th className="px-4 py-3">ABC</th>
                                    <th className="px-4 py-3 text-right">Sis</th>
                                    <th className="px-4 py-3 text-right">Físico</th>
                                    <th className="px-4 py-3 text-right">Dif</th>
                                    <th className="px-4 py-3">Usuario</th>
                                    <th className="px-4 py-3">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {auditItems.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-xs">{item.executed_date}</td>
                                        <td className="px-4 py-2 font-medium">{item.item_code}</td>
                                        <td className="px-4 py-2 text-xs truncate max-w-[200px]" title={item.item_description}>{item.item_description}</td>
                                        <td className="px-4 py-2">{item.bin_location}</td>
                                        <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.abc_code === 'A' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{item.abc_code}</span></td>
                                        <td className="px-4 py-2 text-right">{item.system_qty}</td>
                                        <td className="px-4 py-2 text-right font-bold">{item.physical_qty}</td>
                                        <td className={`px-4 py-2 text-right font-bold ${item.difference !== 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                            {item.difference > 0 ? '+' : ''}{item.difference}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-500">{item.username}</td>
                                        <td className="px-4 py-2">
                                            <button onClick={() => handleEditClick(item)} className="text-blue-600 hover:text-blue-800 text-xs font-semibold border border-blue-200 px-2 py-1 rounded bg-blue-50">
                                                Editar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editModalOpen && currentItem && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
                        <h2 className="text-lg font-bold mb-4 text-gray-800">Editar Cantidad</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="form-label">Item</label>
                                <div className="p-2 bg-gray-50 border rounded text-sm text-gray-600">{currentItem.item_code}</div>
                            </div>
                            <div>
                                <label className="form-label">Cantidad Sistema</label>
                                <div className="p-2 bg-gray-50 border rounded text-sm text-gray-600">{currentItem.system_qty}</div>
                            </div>
                            <div>
                                <label className="form-label">Cantidad Física (Nueva)</label>
                                <input
                                    type="number"
                                    value={editPhysicalQty}
                                    onChange={e => setEditPhysicalQty(e.target.value)}
                                    className="w-full p-2 border rounded font-bold text-lg"
                                />
                            </div>
                            <div>
                                <label className="form-label">Diferencia Resultante</label>
                                <div className={`p-2 border rounded text-sm font-bold ${parseInt(editPhysicalQty) - currentItem.system_qty !== 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                                    {parseInt(editPhysicalQty) - currentItem.system_qty}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setEditModalOpen(false)} className="btn-sap btn-secondary">Cancelar</button>
                            <button onClick={handleSaveEdit} className="btn-sap btn-primary">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageCycleCountDifferences;
