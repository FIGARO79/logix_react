import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';

const PickingAuditHistory = () => {
    const { setTitle } = useOutletContext();
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedAuditId, setExpandedAuditId] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAudit, setEditingAudit] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setTitle("Historial de Auditorías de Picking");
    }, []);

    useEffect(() => {
        const fetchAudits = async () => {
            try {
                const response = await fetch('/api/views/view_picking_audits', { credentials: 'include' });
                if (!response.ok) {
                    throw new Error('Error al cargar auditorías');
                }
                const data = await response.json();
                setAudits(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchAudits();
    }, []);

    const toggleExpand = (id) => {
        setExpandedAuditId(expandedAuditId === id ? null : id);
    };

    const normalizeDate = (dateString) => {
        if (!dateString) return null;
        // 1. Asegurar formato ISO (reemplazar espacio por T si es necesario)
        let normalized = dateString.trim().replace(' ', 'T');

        // 1. Si es solo fecha (YYYY-MM-DD), asumimos medianoche LOCAL para evitar saltos de día
        if (normalized.length === 10 && normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return `${normalized}T00:00:00`;
        }

        // 2. Detectar si ya tiene zona horaria (Z, +HH:MM, o -HH:MM al final)
        const hasTimeZone = normalized.includes('Z') ||
            normalized.match(/[+-]\d{2}:\d{2}$/) ||
            (normalized.includes('-') && normalized.split('T')[1]?.includes('-'));

        // 3. Si no tiene, añadir Z (UTC)
        if (!hasTimeZone) {
            normalized = `${normalized}Z`;
        }
        return normalized;
    };

    const isToday = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return false;

        const date = new Date(normalized);
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const formatDate = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return '';

        const date = new Date(normalized);
        if (isNaN(date.getTime())) return 'Fecha Inválida';

        return date.toLocaleString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false // Formato militar (24h)
        });
    };

    const handleEditClick = (audit) => {
        // Clonar para evitar mutación directa del estado hasta guardar
        const clonedAudit = {
            ...audit,
            items: audit.items.map(item => ({ ...item }))
        };
        setEditingAudit(clonedAudit);
        setIsEditModalOpen(true);
    };

    const handleQtyChange = (idx, value) => {
        const val = parseInt(value) || 0;
        const newItems = [...editingAudit.items];
        newItems[idx].qty_scan = val;
        newItems[idx].difference = val - newItems[idx].qty_req;
        setEditingAudit({ ...editingAudit, items: newItems });
    };

    const handleSaveEdit = async () => {
        setIsSubmitting(true);
        try {
            // Mapear para cumplir con el esquema del backend (PickingAudit)
            const payload = {
                order_number: editingAudit.order_number,
                despatch_number: editingAudit.despatch_number,
                customer_name: editingAudit.customer_name || 'N/A',
                status: editingAudit.status, // El backend recalculará el status
                items: editingAudit.items.map(item => ({
                    code: item.item_code,
                    description: item.description,
                    order_line: item.order_line || '',
                    qty_req: item.qty_req,
                    qty_scan: item.qty_scan
                })),
                packages: editingAudit.packages || 0,
                packages_assignment: {} // No soportamos edición de bultos aquí por ahora para simplificar
            };

            const response = await fetch(`/api/update_picking_audit/${editingAudit.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Error al actualizar');
            }

            // Recargar datos
            const res = await fetch('/api/views/view_picking_audits', { credentials: 'include' });
            if (res.ok) {
                setAudits(await res.json());
            }

            setIsEditModalOpen(false);
            setEditingAudit(null);
            alert("Auditoría actualizada exitosamente");
        } catch (err) {
            alert(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {loading && (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#285f94]"></div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                    <p className="text-red-700">{error}</p>
                </div>
            )}

            {!loading && !error && (
                <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
                    {/* Desktop View */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wider">
                                    <th className="px-3 py-2 text-center w-8"></th>
                                    <th className="px-3 py-2 whitespace-nowrap">ID</th>
                                    <th className="px-3 py-2 whitespace-nowrap">Pedido</th>
                                    <th className="px-3 py-2 whitespace-nowrap">Despacho</th>
                                    <th className="px-3 py-2">Cliente</th>
                                    <th className="px-3 py-2 whitespace-nowrap">Usuario</th>
                                    <th className="px-3 py-2 whitespace-nowrap">Fecha</th>
                                    <th className="px-3 py-2 text-center">Estado</th>
                                    <th className="px-3 py-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {audits.map((audit) => (
                                    <React.Fragment key={audit.id}>
                                        <tr
                                            className={`border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer ${expandedAuditId === audit.id ? 'bg-blue-50' : ''}`}
                                            onClick={() => toggleExpand(audit.id)}
                                        >
                                            <td className="px-3 py-2 text-center">
                                                <svg
                                                    className={`w-4 h-4 text-gray-500 transform transition-transform duration-200 ${expandedAuditId === audit.id ? 'rotate-90' : ''}`}
                                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </td>
                                            <td className="px-3 py-2 text-xs font-medium text-gray-900 whitespace-nowrap">{audit.id}</td>
                                            <td className="px-3 py-2 text-xs text-[#285f94] font-semibold whitespace-nowrap">{audit.order_number}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{audit.despatch_number}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[150px]" title={audit.customer_name}>{audit.customer_name || 'N/A'}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{audit.username}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(audit.timestamp)}</td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${audit.status === 'Completado' || audit.status === 'Aprobado' || audit.status === 'Completo'
                                                    ? 'bg-green-100 text-green-800 border-green-200' :
                                                    audit.status === 'Rechazado' || audit.status === 'Error'
                                                        ? 'bg-red-100 text-red-800 border-red-200' :
                                                        'bg-yellow-100 text-yellow-800 border-yellow-200'
                                                    }`}>
                                                    {audit.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <div className="flex justify-center gap-2">
                                                    {isToday(audit.timestamp) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEditClick(audit); }}
                                                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded transition-colors border border-blue-100 shadow-sm"
                                                            title="Editar Auditoría"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    <Link
                                                        to={`/packing_list/print/${audit.id}`}
                                                        className="p-1.5 bg-gray-50 text-gray-600 hover:bg-[#285f94] hover:text-white rounded transition-colors border border-gray-200 shadow-sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Imprimir Packing List"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                        </svg>
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Expandable Detail Row */}
                                        {expandedAuditId === audit.id && (
                                            <tr className="bg-gray-50">
                                                <td colSpan="9" className="p-4 border-b border-gray-200 shadow-inner">
                                                    <div className="bg-white rounded border border-gray-200 p-4">
                                                        <h4 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Detalle de Ítems Auditados</h4>
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="border-b border-gray-200 text-gray-500">
                                                                    <th className="py-1 text-left whitespace-nowrap">Código Item</th>
                                                                    <th className="py-1 text-left">Descripción</th>
                                                                    <th className="py-1 text-right whitespace-nowrap">Cant. Req.</th>
                                                                    <th className="py-1 text-right whitespace-nowrap">Cant. Esc.</th>
                                                                    <th className="py-1 text-right whitespace-nowrap">Dif.</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {audit.items.map((item, idx) => (
                                                                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                                                        <td className="py-1.5 font-medium whitespace-nowrap">{item.item_code}</td>
                                                                        <td className="py-1.5 text-gray-600 truncate max-w-[200px]" title={item.description}>{item.description}</td>
                                                                        <td className="py-1.5 text-right whitespace-nowrap">{item.qty_req}</td>
                                                                        <td className="py-1.5 text-right whitespace-nowrap">{item.qty_scan}</td>
                                                                        <td className={`py-1.5 text-right font-bold whitespace-nowrap ${item.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="block sm:hidden bg-gray-50 p-2 space-y-3">
                        {audits.map((audit) => (
                            <div key={audit.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${expandedAuditId === audit.id ? 'ring-2 ring-indigo-100' : ''}`}>
                                <div className="p-4" onClick={() => toggleExpand(audit.id)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-[#285f94]">{audit.order_number}</span>
                                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">{audit.despatch_number}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${audit.status === 'Completado' || audit.status === 'Aprobado' || audit.status === 'Completo'
                                            ? 'bg-green-100 text-green-800 border-green-200' :
                                            audit.status === 'Rechazado' || audit.status === 'Error'
                                                ? 'bg-red-100 text-red-800 border-red-200' :
                                                'bg-yellow-100 text-yellow-800 border-yellow-200'
                                            }`}>
                                            {audit.status}
                                        </span>
                                    </div>

                                    <div className="text-sm font-medium text-gray-800 mb-2">{audit.customer_name || 'Sin Cliente'}</div>

                                    <div className="flex justify-between items-end text-xs text-gray-500">
                                        <div>
                                            <div><span className="font-semibold">Usuario:</span> {audit.username}</div>
                                            <div>{formatDate(audit.timestamp)}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            {isToday(audit.timestamp) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditClick(audit); }}
                                                    className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            )}
                                            <Link
                                                to={`/packing_list/print/${audit.id}`}
                                                className="p-2 bg-gray-50 text-gray-500 rounded border border-gray-200"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                </svg>
                                            </Link>
                                            <button className="text-gray-400 hover:text-indigo-600">
                                                <svg
                                                    className={`w-6 h-6 transform transition-transform duration-200 ${expandedAuditId === audit.id ? 'rotate-180' : ''}`}
                                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Details (Mobile) */}
                                {expandedAuditId === audit.id && (
                                    <div className="bg-gray-50 border-t border-gray-100 p-3">
                                        <h4 className="font-bold text-gray-500 mb-2 text-xs uppercase tracking-wide">Detalles</h4>
                                        <div className="space-y-2">
                                            {audit.items.map((item, idx) => (
                                                <div key={idx} className="bg-white p-2 rounded border border-gray-200 flex justify-between items-center text-sm">
                                                    <div className="flex-1 min-w-0 pr-2">
                                                        <div className="font-medium text-gray-900 truncate">{item.item_code}</div>
                                                        <div className="text-xs text-gray-500 truncate">{item.description}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-gray-500">Req: {item.qty_req}</div>
                                                        <div className="font-bold">Scan: {item.qty_scan}</div>
                                                    </div>
                                                    <div className={`ml-3 w-8 text-right font-bold ${item.difference !== 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                        {item.difference > 0 ? `+${item.difference}` : item.difference}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && editingAudit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800">
                                Editar Auditoría: {editingAudit.order_number}
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="mb-4 text-sm text-gray-600">
                                <p><span className="font-semibold">Cliente:</span> {editingAudit.customer_name}</p>
                                <p><span className="font-semibold">Fecha:</span> {formatDate(editingAudit.timestamp)}</p>
                            </div>

                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Item</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Descripción</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-24">Req.</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-32">Escaneado</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-24">Dif.</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100 text-sm">
                                    {editingAudit.items.map((item, idx) => {
                                        const diff = item.qty_scan - item.qty_req;
                                        return (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-[#285f94]">{item.item_code}</td>
                                                <td className="px-4 py-3 text-gray-600 truncate max-w-xs">{item.description}</td>
                                                <td className="px-4 py-3 text-center text-gray-500">{item.qty_req}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="number"
                                                        value={item.qty_scan}
                                                        onChange={(e) => handleQtyChange(idx, e.target.value)}
                                                        className="w-24 text-center border-gray-300 rounded shadow-sm focus:border-[#285f94] focus:ring-[#285f94] font-bold"
                                                        min="0"
                                                    />
                                                </td>
                                                <td className={`px-4 py-3 text-center font-bold ${diff !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {diff > 0 ? `+${diff}` : diff}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2 bg-[#285f94] border border-transparent rounded-md text-sm font-medium text-white hover:bg-[#1e4a74] disabled:opacity-50"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PickingAuditHistory;
