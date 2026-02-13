import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';

const WaybillGRN = () => {
    const { setTitle } = useOutletContext();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const LIMIT = 50;

    const fetchData = async (reset = false) => {
        if (loading || (!hasMore && !reset)) return;

        setLoading(true);
        const currentOffset = reset ? 0 : offset;

        try {
            const res = await fetch(`/api/grn?limit=${LIMIT}&offset=${currentOffset}`, { credentials: 'include' });
            if (!res.ok) throw new Error("Error cargando datos de GRN");
            const result = await res.json();

            if (reset) {
                setData(result);
                setOffset(LIMIT);
            } else {
                setData(prev => [...prev, ...result]);
                setOffset(prev => prev + LIMIT);
            }

            setHasMore(result.length === LIMIT);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setTitle("Maestro Waybill-GRN");
        fetchData(true);
    }, []);

    // Detectar scroll al final de la tabla
    useEffect(() => {
        const handleScroll = (e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMore && !loading) {
                fetchData();
            }
        };

        const tableContainer = document.querySelector('.table-scroll-container');
        if (tableContainer) {
            tableContainer.addEventListener('scroll', handleScroll);
            return () => tableContainer.removeEventListener('scroll', handleScroll);
        }
    }, [hasMore, loading, offset]);

    const handleEdit = (item) => {
        setEditingItem({ ...item });
        setShowModal(true);
    };

    const handleNew = () => {
        setEditingItem({
            import_reference: '',
            waybill: '',
            grn_number: '',
            packs: 0,
            lines: '',
            aaf_date: new Date().toISOString().split('T')[0]
        });
        setShowModal(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const isNew = !editingItem.id;
        const url = isNew ? '/api/grn' : `/api/grn/${editingItem.id}`;
        const method = isNew ? 'POST' : 'PUT';

        try {
            // Convertir espacios a comas en grn_number
            const dataToSave = {
                ...editingItem,
                grn_number: editingItem.grn_number ? editingItem.grn_number.replace(/\s+/g, ',') : editingItem.grn_number
            };

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(dataToSave)
            });
            if (!res.ok) throw new Error(isNew ? "Error al crear" : "Error al actualizar");

            const savedItem = await res.json();

            // Actualizar lista localmente sin recargar
            if (isNew) {
                setData([savedItem, ...data]);
            } else {
                setData(data.map(item => item.id === savedItem.id ? savedItem : item));
            }

            toast.success(isNew ? "Registro creado" : "Registro actualizado");
            setShowModal(false);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const filteredData = data.filter(item =>
        item.import_reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.waybill.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.grn_number && item.grn_number.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="w-full px-2 py-4">
            {/* Header / Search */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200 gap-3">
                <div className="flex items-center gap-2">
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">Maestro de GRN</h1>
                        <p className="text-[10px] text-gray-500">Gestión de Waybills e Importaciones</p>
                    </div>
                </div>

                <div className="flex w-full md:w-auto gap-2">
                    <button
                        onClick={handleNew}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-all text-xs font-bold shadow-sm"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                        Nuevo
                    </button>
                    <div className="relative flex-grow min-w-[150px]">
                        <input
                            type="text"
                            placeholder="Buscar I.R, Waybill o GRN..."
                            className="block w-full px-3 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#285f94] focus:border-[#285f94] text-xs transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => fetchData(true)}
                        className="p-1.5 text-gray-500 hover:text-[#285f94] hover:bg-blue-50 rounded-md transition-colors border border-gray-200"
                        title="Refrescar"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-md rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto max-h-[75vh] table-scroll-container">
                    <table className="w-full text-xs border-collapse table-fixed">
                        <thead className="sticky top-0 bg-slate-800 text-white z-10">
                            <tr>
                                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-[9%]">Import Ref</th>
                                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-[18%]">Waybill</th>
                                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-[33%]">GRN Number</th>
                                <th className="px-2 py-2 text-center font-semibold uppercase tracking-wider text-[9px] w-[6%]">Packs</th>
                                <th className="px-2 py-2 text-center font-semibold uppercase tracking-wider text-[9px] w-[7%]">Lines</th>
                                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-[13%]">AAF Date</th>
                                <th className="px-2 py-2 text-center font-semibold uppercase tracking-wider text-[9px] w-[14%]">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 italic-text-fix">
                            {data.length === 0 && !loading ? (
                                <tr><td colSpan="7" className="py-6 text-center text-gray-400">No se encontraron resultados</td></tr>
                            ) : filteredData.map((item, idx) => (
                                <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/80 transition-all duration-150`}>
                                    <td className="px-2 py-1 font-bold text-gray-700 truncate" title={item.import_reference}>{item.import_reference}</td>
                                    <td className="px-2 py-1 font-medium text-[#285f94] underline underline-offset-2 decoration-blue-200 truncate" title={item.waybill}>{item.waybill}</td>
                                    <td className="px-2 py-1 text-gray-600 font-mono truncate" title={item.grn_number}>{item.grn_number || '-'}</td>
                                    <td className="px-2 py-1 text-center text-gray-600 font-mono font-medium">{item.packs}</td>
                                    <td className="px-2 py-1 text-center text-gray-600 truncate" title={item.lines}>{item.lines || '-'}</td>
                                    <td className="px-2 py-1 text-gray-500 text-[9px] truncate">
                                        {item.aaf_date ? item.aaf_date.split(' ')[0] : '-'}
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                        <button
                                            onClick={() => handleEdit(item)}
                                            className="text-[#285f94] hover:text-[#1e4a74] p-1 hover:bg-blue-100 rounded transition-all"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {loading && (
                                <tr><td colSpan="7" className="py-4 text-center text-[#285f94] text-xs">
                                    <div className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Cargando más registros...
                                    </div>
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 uppercase font-semibold">
                    <span>Total Registros: {filteredData.length}</span>
                </div>
            </div>

            {/* Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
                        <div className="bg-slate-800 px-4 py-2 flex justify-between items-center border-b border-slate-700">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                                {editingItem.id ? 'Editar Registro GRN' : 'Nuevo Registro GRN'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Import Ref</label>
                                    <input
                                        type="text"
                                        className={`w-full px-3 py-2 border rounded-lg outline-none transition-all ${editingItem.id ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : 'border-blue-100 focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94]'}`}
                                        value={editingItem.import_reference}
                                        onChange={(e) => setEditingItem({ ...editingItem, import_reference: e.target.value })}
                                        disabled={!!editingItem.id}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Waybill</label>
                                    <input
                                        type="text"
                                        className={`w-full px-3 py-2 border rounded-lg outline-none transition-all uppercase ${editingItem.id ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : 'border-blue-100 focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94]'}`}
                                        value={editingItem.waybill}
                                        onChange={(e) => setEditingItem({ ...editingItem, waybill: e.target.value.toUpperCase() })}
                                        disabled={!!editingItem.id}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">GRN Number</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-blue-100 rounded-lg focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] outline-none transition-all"
                                        value={editingItem.grn_number || ''}
                                        onChange={(e) => setEditingItem({ ...editingItem, grn_number: e.target.value })}
                                        placeholder="Ej: 16777"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Fecha AAF</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 border border-blue-100 rounded-lg focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] outline-none transition-all"
                                        value={editingItem.aaf_date || ''}
                                        onChange={(e) => setEditingItem({ ...editingItem, aaf_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Packs</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full px-3 py-2 border border-blue-100 rounded-lg focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] outline-none transition-all"
                                        value={editingItem.packs || ''}
                                        onChange={(e) => setEditingItem({ ...editingItem, packs: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Lines</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-blue-100 rounded-lg focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] outline-none transition-all"
                                        value={editingItem.lines || ''}
                                        onChange={(e) => setEditingItem({ ...editingItem, lines: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2 px-4 bg-[#285f94] rounded-lg text-white font-bold hover:bg-[#1e4a74] shadow-md shadow-blue-200 transition-all active:scale-95"
                                >
                                    {editingItem.id ? 'Guardar Cambios' : 'Crear Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WaybillGRN;
