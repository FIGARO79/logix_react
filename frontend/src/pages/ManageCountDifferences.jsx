import React, { useState, useEffect, useCallback } from 'react';
import { useTabContext } from '../hooks/useTabContext';
import '../styles/FluentPages.css';

const ManageCountDifferences = () => {
    const { setTitle } = useTabContext();
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
        if (setTitle) setTitle("Gestión de Diferencias");
        loadData();
    }, [setTitle]);

    useEffect(() => {
        filterTable();
    }, [filterTable]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/counts/differences');
            if (!res.ok) throw new Error('Error al cargar datos');
            const json = await res.json();
            setData(json.items || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const filterTable = useCallback(() => {
        let res = [...data];
        const search = filterItemCode.trim().toUpperCase();

        if (search) {
            res = res.filter(item =>
                (item.item_code && item.item_code.toUpperCase().includes(search)) ||
                (item.description && item.description.toUpperCase().includes(search)) ||
                (item.location && item.location.toUpperCase().includes(search)) ||
                (item.username && item.username.toUpperCase().includes(search))
            );
        }

        if (filterType === 'negative') res = res.filter(item => item.difference < 0);
        else if (filterType === 'positive') res = res.filter(item => item.difference > 0);
        else if (filterType === 'zero') res = res.filter(item => item.difference === 0);

        setFilteredData(res);
    }, [data, filterItemCode, filterType]);

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
            const res = await fetch(`/api/counts/${editModal.id}`, {
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
            const res = await fetch(`/api/counts/${deleteModal.id}`, {
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
        const params = new URLSearchParams();
        window.location.href = `/api/export_counts?${params.toString()}`;
    };

    return (
        <div className="manage-count-diff-page max-w-7xl mx-auto px-4 py-4 text-xs">

            {/* Header Page */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-lg font-normal text-[#201f1e]">Gestión de Diferencias</h1>
                    <p className="text-[11px] text-[#605e5c]">Verifica y edita las cantidades contadas vs. sistema</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="bg-white text-[#201f1e] border border-[#d2d0ce] px-3 py-1.5 rounded hover:bg-[#f3f3f3] hover:border-[#8a8886] flex items-center gap-1.5 text-xs font-normal transition-colors"
                    >
                        <span className="text-[#107c10]">⬇</span> Exportar Excel
                    </button>
                    <button
                        onClick={loadData}
                        className="bg-white text-[#201f1e] border border-[#d2d0ce] px-3 py-1.5 rounded hover:bg-[#f3f3f3] hover:border-[#8a8886] flex items-center gap-1.5 text-xs font-normal transition-colors"
                    >
                        <span>↻</span> Actualizar
                    </button>
                </div>
            </div>

            {message && <div className="bg-[#dff6dd] text-[#107c10] p-2.5 rounded mb-3 border border-[#a2e6a1]">{message}</div>}
            {error && <div className="bg-[#fde7e9] text-[#a4262c] p-2.5 rounded mb-3 border border-[#f8b8bc]">{error}</div>}

            {/* Filtros */}
            <div className="bg-white p-3 rounded shadow-sm border border-[#d2d0ce] mb-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-normal uppercase text-[#605e5c] mb-1">Filtrar por Item Code</label>
                    <input
                        type="text"
                        className="w-full border border-[#8a8886] p-1.5 rounded text-xs uppercase text-[#201f1e] focus:outline-none focus:border-[#0078d4]"
                        placeholder="EJ: ABC123..."
                        value={filterItemCode}
                        onChange={(e) => setFilterItemCode(e.target.value)}
                    />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] font-normal uppercase text-[#605e5c] mb-1">Mostrar</label>
                    <select
                        className="w-full border border-[#8a8886] p-1.5 rounded text-xs text-[#201f1e] focus:outline-none focus:border-[#0078d4]"
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
                    <button
                        onClick={() => { setFilterItemCode(''); setFilterType('all'); }}
                        className="bg-[#f3f3f3] text-[#201f1e] border border-[#d2d0ce] px-3 py-1.5 rounded hover:bg-[#edebe9] text-xs font-normal transition-colors"
                    >
                        Limpiar Filtros
                    </button>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded shadow-sm overflow-hidden border border-[#d2d0ce]">
                <div className="bg-[#f2f2f2] px-3 py-1.5 border-b border-[#e1dfdd] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 max-w-md bg-white border border-[#8a8886] rounded px-2.5 py-0.5 focus-within:border-[#0078d4]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <input
                            type="text"
                            className="w-full text-xs outline-none bg-transparent placeholder-[#605e5c] uppercase text-[#201f1e]"
                            placeholder="Buscar por SKU, Descripción, Ubicación o Usuario..."
                            value={filterItemCode}
                            onChange={(e) => setFilterItemCode(e.target.value)}
                        />
                        {filterItemCode && (
                            <button onClick={() => setFilterItemCode('')} className="text-[#605e5c] hover:text-[#201f1e] text-xs font-normal">
                                ✕
                            </button>
                        )}
                    </div>
                    <div className="text-[10px] text-[#605e5c] font-normal">
                        {filteredData.length} registros
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce] uppercase font-normal text-[10px] sticky top-0 z-10">
                            <tr>
                                <th className="px-2.5 py-1.5 w-16 text-[#201f1e] font-normal">Acciones</th>
                                <th className="px-2.5 py-1.5 text-[#201f1e] font-normal">Item Code</th>
                                <th className="px-2.5 py-1.5 text-[#201f1e] font-normal">Descripción</th>
                                <th className="px-2.5 py-1.5 text-[#201f1e] font-normal">Ubicación</th>
                                <th className="px-2.5 py-1.5 text-right text-[#201f1e] font-normal">Qty Sistema</th>
                                <th className="px-2.5 py-1.5 text-right text-[#201f1e] font-normal">Qty Contada</th>
                                <th className="px-2.5 py-1.5 text-right text-[#201f1e] font-normal">Diferencia</th>
                                <th className="px-2.5 py-1.5 text-right text-[#201f1e] font-normal">% Var</th>
                                <th className="px-2.5 py-1.5 text-[#201f1e] font-normal">Fecha</th>
                                <th className="px-2.5 py-1.5 text-[#201f1e] font-normal">Usuario</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e1dfdd]">
                            {loading && (
                                <tr><td colSpan="10" className="p-6 text-center text-[#605e5c]">Cargando datos...</td></tr>
                            )}
                            {!loading && filteredData.length === 0 && (
                                <tr><td colSpan="10" className="p-6 text-center text-[#605e5c]">No hay registros para mostrar.</td></tr>
                            )}
                            {filteredData.map((item) => (
                                <tr key={item.count_id} className={`hover:bg-[#f3f9fd] transition-colors border-b border-[#e1dfdd] ${item.difference !== 0 ? 'bg-[#fff4ce]/20' : ''}`}>
                                    <td className="px-2.5 py-1 flex gap-1.5">
                                        <button onClick={() => handleEditClick(item)} className="p-1 text-[#0078d4] hover:bg-[#eff6fc] rounded transition-colors cursor-pointer" title="Editar">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                                            </svg>
                                        </button>
                                        <button onClick={() => handleDeleteClick(item)} className="p-1 text-[#a4262c] hover:bg-[#fde7e9] rounded transition-colors cursor-pointer" title="Eliminar">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                            </svg>
                                        </button>
                                    </td>
                                    <td className="px-2.5 py-1 font-normal text-[#0078d4] uppercase">{item.item_code}</td>
                                    <td className="px-2.5 py-1 truncate max-w-xs text-[#201f1e]" title={item.description}>{item.description}</td>
                                    <td className="px-2.5 py-1 text-[#201f1e] uppercase">{item.location}</td>
                                    <td className="px-2.5 py-1 text-right text-[#201f1e]">{item.system_qty}</td>
                                    <td className="px-2.5 py-1 text-right font-normal text-[#201f1e]">{item.counted_qty}</td>
                                    <td className={`px-2.5 py-1 text-right font-normal ${item.difference > 0 ? 'text-[#107c10]' : item.difference < 0 ? 'text-[#a4262c]' : 'text-[#605e5c]'}`}>
                                        {item.difference > 0 ? `+${item.difference}` : item.difference}
                                    </td>
                                    <td className="px-2.5 py-1 text-right text-[#201f1e]">{item.percentage_variance}%</td>
                                    <td className="px-2.5 py-1 text-sm text-[#605e5c] whitespace-nowrap">
                                        {item.date ? new Date(item.date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                                    </td>
                                    <td className="px-2.5 py-1 text-sm text-[#605e5c]">{item.username}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Editar */}
            {editModal.open && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded shadow-lg w-full max-w-md p-5 border border-[#d2d0ce]">
                        <h2 className="text-base font-normal text-[#201f1e] mb-3">Editar Cantidad Contada</h2>
                        <div className="space-y-2.5 mb-4 text-xs">
                            <div><span className="font-normal text-[10px] text-[#605e5c] uppercase">Item Code:</span> <div className="font-mono text-[#201f1e]">{editModal.itemCode}</div></div>
                            <div><span className="font-normal text-[10px] text-[#605e5c] uppercase">Descripción:</span> <div className="text-xs text-[#201f1e]">{editModal.desc}</div></div>
                            <div><span className="font-normal text-[10px] text-[#605e5c] uppercase">Ubicación:</span> <div className="text-[#201f1e]">{editModal.loc}</div></div>
                            <div><span className="font-normal text-[10px] text-[#605e5c] uppercase">Qty Sistema:</span> <div className="text-[#201f1e]">{editModal.system}</div></div>

                            <div className="pt-2">
                                <label className="block text-xs font-normal text-[#201f1e] mb-1">Nueva Cantidad Contada</label>
                                <input
                                    type="number"
                                    className="w-full border border-[#8a8886] rounded p-2 text-base text-[#201f1e] focus:outline-none focus:border-[#0078d4]"
                                    value={editModal.counted}
                                    onChange={(e) => setEditModal({ ...editModal, counted: e.target.value })}
                                    autoFocus
                                    min="0"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditModal({ ...editModal, open: false })} className="px-3 py-1.5 border border-[#d2d0ce] rounded bg-[#f3f3f3] text-[#201f1e] hover:bg-[#edebe9] text-xs font-normal transition-colors">Cancelar</button>
                            <button onClick={handleSaveEdit} className="px-4 py-1.5 bg-[#0078d4] text-white rounded hover:bg-[#106ebe] text-xs font-normal transition-colors">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Eliminar */}
            {deleteModal.open && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded shadow-lg w-full max-w-sm p-5 border border-[#d2d0ce] border-t-4 border-t-[#a4262c]">
                        <h2 className="text-base font-normal mb-2 text-[#a4262c]">Confirmar Eliminación</h2>
                        <p className="mb-4 text-xs text-[#201f1e]">
                            ¿Estás seguro de que deseas eliminar el registro del item <strong>{deleteModal.itemCode}</strong>?
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteModal({ ...deleteModal, open: false })} className="px-3 py-1.5 border border-[#d2d0ce] rounded bg-[#f3f3f3] text-[#201f1e] hover:bg-[#edebe9] text-xs font-normal transition-colors">Cancelar</button>
                            <button onClick={handleConfirmDelete} className="px-4 py-1.5 bg-[#a4262c] text-white rounded hover:bg-[#8f1f25] text-xs font-normal transition-colors">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ManageCountDifferences;
