import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';

const PickingAuditHistory = () => {
    const { setTitle } = useOutletContext();
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedAuditId, setExpandedAuditId] = useState(null);

    useEffect(() => {
        setTitle("Historial de Auditorías de Picking");
    }, []);

    useEffect(() => {
        const fetchAudits = async () => {
            try {
                const response = await fetch('http://localhost:8000/api/views/view_picking_audits');
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

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {loading && (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0070d2]"></div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                    <p className="text-red-700">{error}</p>
                </div>
            )}

            {!loading && !error && (
                <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wider">
                                    <th className="px-5 py-3 text-center w-10"></th>
                                    <th className="px-5 py-3">ID</th>
                                    <th className="px-5 py-3">Pedido</th>
                                    <th className="px-5 py-3">Despacho</th>
                                    <th className="px-5 py-3">Cliente</th>
                                    <th className="px-5 py-3">Usuario</th>
                                    <th className="px-5 py-3">Fecha</th>
                                    <th className="px-5 py-3 text-center">Estado</th>
                                    <th className="px-5 py-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {audits.map((audit) => (
                                    <React.Fragment key={audit.id}>
                                        <tr
                                            className={`border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer ${expandedAuditId === audit.id ? 'bg-blue-50' : ''}`}
                                            onClick={() => toggleExpand(audit.id)}
                                        >
                                            <td className="px-5 py-4 text-center">
                                                <svg
                                                    className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${expandedAuditId === audit.id ? 'rotate-90' : ''}`}
                                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </td>
                                            <td className="px-5 py-4 text-sm font-medium text-gray-900">{audit.id}</td>
                                            <td className="px-5 py-4 text-sm text-[#0070d2] font-semibold">{audit.order_number}</td>
                                            <td className="px-5 py-4 text-sm text-gray-600">{audit.despatch_number}</td>
                                            <td className="px-5 py-4 text-sm text-gray-600">{audit.customer_name || 'N/A'}</td>
                                            <td className="px-5 py-4 text-sm text-gray-600">{audit.username}</td>
                                            <td className="px-5 py-4 text-sm text-gray-600">{formatDate(audit.timestamp)}</td>
                                            <td className="px-5 py-4 text-center">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${audit.status === 'Completado' || audit.status === 'Aprobado' ? 'bg-green-100 text-green-800' :
                                                    audit.status === 'Rechazado' || audit.status === 'Error' ? 'bg-red-100 text-red-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {audit.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <Link
                                                    to={`/print-packing-list/${audit.id}`}
                                                    className="text-gray-500 hover:text-[#0070d2]"
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Imprimir Packing List"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                    </svg>
                                                </Link>
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
                                                                    <th className="py-2 text-left">Código Item</th>
                                                                    <th className="py-2 text-left">Descripción</th>
                                                                    <th className="py-2 text-right">Cant. Req.</th>
                                                                    <th className="py-2 text-right">Cant. Escaneada</th>
                                                                    <th className="py-2 text-right">Diferencia</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {audit.items.map((item, idx) => (
                                                                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                                                        <td className="py-2 font-medium">{item.item_code}</td>
                                                                        <td className="py-2 text-gray-600">{item.description}</td>
                                                                        <td className="py-2 text-right">{item.qty_req}</td>
                                                                        <td className="py-2 text-right">{item.qty_scan}</td>
                                                                        <td className={`py-2 text-right font-bold ${item.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
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
                </div>
            )}
        </div>
    );
};

export default PickingAuditHistory;
