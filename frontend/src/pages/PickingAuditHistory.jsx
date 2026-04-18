import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const PickingAuditHistory = () => {
    const { setTitle } = useOutletContext();
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedAuditId, setExpandedAuditId] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAudit, setEditingAudit] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showShipmentModal, setShowShipmentModal] = useState(false);
    const [shipmentNote, setShipmentNote] = useState('');
    const [shipmentCarrier, setShipmentCarrier] = useState('');
    const [creatingShipment, setCreatingShipment] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setTitle("Pickings Empacados");
    }, [setTitle]);

    useEffect(() => {
        fetchAudits();
    }, []);

    const fetchAudits = async () => {
        try {
            const response = await fetch('/api/views/view_picking_audits', { credentials: 'include' });
            if (!response.ok) throw new Error('Error al cargar auditorías');
            const data = await response.json();
            setAudits(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id) => setExpandedAuditId(expandedAuditId === id ? null : id);

    const normalizeDate = (dateString) => {
        if (!dateString) return null;
        let normalized = dateString.trim().replace(' ', 'T');
        if (normalized.length === 10 && normalized.match(/^\d{4}-\d{2}-\d{2}$/)) return `${normalized}T00:00:00`;
        const hasTimeZone = normalized.includes('Z') || normalized.match(/[+-]\d{2}:\d{2}$/) || (normalized.includes('-') && normalized.split('T')[1]?.includes('-'));
        if (!hasTimeZone) normalized = `${normalized}Z`;
        return normalized;
    };

    const isToday = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return false;
        const date = new Date(normalized);
        const today = new Date();
        return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    };

    const formatDate = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return '';
        const date = new Date(normalized);
        if (isNaN(date.getTime())) return 'Fecha Inválida';
        return date.toLocaleString(undefined, {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    };

    const handleEditClick = (audit) => {
        setEditingAudit({ ...audit, items: audit.items.map(item => ({ ...item })) });
        setIsEditModalOpen(true);
    };

    const handleQtyChange = (idx, value) => {
        const val = parseInt(value) || 0;
        const newAudit = { ...editingAudit };
        const item = newAudit.items[idx];
        const key = `${item.item_code}:${item.order_line || ''}`;

        if (newAudit.packages > 0) {
            if (!newAudit.packages_assignment) newAudit.packages_assignment = {};
            if (!newAudit.packages_assignment[key]) newAudit.packages_assignment[key] = {};
            const packageKeys = Object.keys(newAudit.packages_assignment[key]);
            const targetPkg = packageKeys.length > 0 ? packageKeys[0] : "1";
            newAudit.packages_assignment[key][targetPkg] = val;
            item.qty_scan = Object.values(newAudit.packages_assignment[key]).reduce((a, b) => a + (parseInt(b) || 0), 0);
        } else {
            item.qty_scan = val;
        }
        item.difference = item.qty_scan - item.qty_req;
        setEditingAudit(newAudit);
    };

    const handleSaveEdit = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                order_number: editingAudit.order_number,
                despatch_number: editingAudit.despatch_number,
                customer_code: editingAudit.customer_code || '',
                customer_name: editingAudit.customer_name || 'N/A',
                status: editingAudit.status,
                items: editingAudit.items.map(item => ({
                    code: item.item_code,
                    description: item.description,
                    order_line: item.order_line || '',
                    qty_req: item.qty_req,
                    qty_scan: item.qty_scan
                })),
                packages: parseInt(editingAudit.packages) || 0,
                packages_assignment: editingAudit.packages_assignment || {}
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
            await fetchAudits();
            setIsEditModalOpen(false);
            toast.success("Auditoría actualizada exitosamente");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddNewPackage = () => setEditingAudit(prev => ({ ...prev, packages: (parseInt(prev.packages) || 0) + 1 }));
    const handleRemoveLastPackage = () => {
        if (!editingAudit.packages || editingAudit.packages <= 0) return;
        const lastPkg = editingAudit.packages.toString();
        let hasAssignments = false;
        if (editingAudit.packages_assignment) {
            for (let key in editingAudit.packages_assignment) {
                if (editingAudit.packages_assignment[key][lastPkg] > 0) { hasAssignments = true; break; }
            }
        }
        if (hasAssignments) { toast.warning(`El bulto ${lastPkg} tiene ítems asignados.`); return; }
        setEditingAudit(prev => ({ ...prev, packages: Math.max(0, prev.packages - 1) }));
    };

    const handlePkgQtyChange = (itemIdx, pkgNum, value) => {
        const val = parseInt(value) || 0;
        const newAudit = { ...editingAudit };
        const item = newAudit.items[itemIdx];
        const key = `${item.item_code}:${item.order_line || ''}`;
        if (!newAudit.packages_assignment) newAudit.packages_assignment = {};
        if (!newAudit.packages_assignment[key]) newAudit.packages_assignment[key] = {};
        newAudit.packages_assignment[key][pkgNum] = val;
        item.qty_scan = Object.values(newAudit.packages_assignment[key]).reduce((a, b) => a + (parseInt(b) || 0), 0);
        item.difference = item.qty_scan - item.qty_req;
        setEditingAudit(newAudit);
    };

    const handleAssignToPackage = (itemIdx, pkgNum) => {
        if (!pkgNum) return;
        if (pkgNum === "NEW") {
            const newPkg = (editingAudit.packages || 0) + 1;
            setEditingAudit(prev => {
                const next = { ...prev, packages: newPkg };
                const item = next.items[itemIdx];
                const key = `${item.item_code}:${item.order_line || ''}`;
                if (!next.packages_assignment) next.packages_assignment = {};
                if (!next.packages_assignment[key]) next.packages_assignment[key] = {};
                next.packages_assignment[key][newPkg] = 1;
                item.qty_scan = Object.values(next.packages_assignment[key]).reduce((a, b) => a + (parseInt(b) || 0), 0);
                item.difference = item.qty_scan - item.qty_req;
                return next;
            });
        } else {
            const newAudit = { ...editingAudit };
            const item = newAudit.items[itemIdx];
            const key = `${item.item_code}:${item.order_line || ''}`;
            if (!newAudit.packages_assignment) newAudit.packages_assignment = {};
            if (!newAudit.packages_assignment[key]) newAudit.packages_assignment[key] = {};
            if (!newAudit.packages_assignment[key][pkgNum]) {
                newAudit.packages_assignment[key][pkgNum] = 1;
                item.qty_scan = Object.values(newAudit.packages_assignment[key]).reduce((a, b) => a + (parseInt(b) || 0), 0);
                item.difference = item.qty_scan - item.qty_req;
                setEditingAudit(newAudit);
            }
        }
    };

    const removePackageAssignment = (itemIdx, pkgNum) => {
        const newAudit = { ...editingAudit };
        const item = newAudit.items[itemIdx];
        const key = `${item.item_code}:${item.order_line || ''}`;
        if (newAudit.packages_assignment?.[key]) {
            delete newAudit.packages_assignment[key][pkgNum];
            item.qty_scan = Object.values(newAudit.packages_assignment[key]).reduce((a, b) => a + (parseInt(b) || 0), 0);
            item.difference = item.qty_scan - item.qty_req;
            setEditingAudit(newAudit);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleCreateShipment = async () => {
        setCreatingShipment(true);
        try {
            const res = await fetch('/api/shipments/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audit_ids: [...selectedIds], note: shipmentNote || null, carrier: shipmentCarrier || null }),
                credentials: 'include'
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Error al crear envío');
            toast.success("Envío creado exitosamente");
            setShowShipmentModal(false);
            setSelectedIds(new Set());
            setTimeout(() => navigate('/shipments'), 1500);
        } catch (err) { toast.error(err.message); }
        finally { setCreatingShipment(false); }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 font-sans bg-[#fcfcfc] min-h-screen text-zinc-800">
            <ToastContainer position="top-right" autoClose={3000} />

            {/* Header Profesional */}
            <div className="mb-8 border-b border-zinc-200 pb-6 flex justify-between items-end">
                <div className="flex flex-col gap-0">
                    <h1 className="text-base font-normal tracking-tight">Pickings Empacados</h1>
                    <p className="text-[8px] uppercase tracking-widest font-normal leading-none mt-0.5 text-black">Historial de Auditorías y Consolidación de Envíos</p>
                </div>
                <div className="text-[9px] font-bold text-black uppercase tracking-widest">
                    {audits.length} Registros Encontrados
                </div>
            </div>

            {loading && (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
                </div>
            )}

            {error && (
                <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 border border-red-100 text-[10px] font-bold uppercase tracking-widest">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <div className="bg-white border border-zinc-200 shadow-sm overflow-hidden">
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200">
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-center w-10">Envío</th>
                                    <th className="px-4 py-1.5 text-center w-8"></th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-left">ID</th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-left">Orden</th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-left">Despacho</th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-left">Cliente</th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-left">Usuario</th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-left">Fecha</th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-center">Estado</th>
                                    <th className="px-4 py-1.5 text-[9px] font-bold text-white uppercase tracking-widest text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {audits.map((audit) => (
                                    <React.Fragment key={audit.id}>
                                        <tr
                                            className={`border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors cursor-pointer
                                                ${expandedAuditId === audit.id ? 'bg-zinc-50' : ''}
                                                ${selectedIds.has(audit.id) ? 'bg-blue-50/50' : ''}`}
                                            onClick={() => toggleExpand(audit.id)}
                                        >
                                            <td className="px-4 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(audit.id)}
                                                    onChange={() => toggleSelect(audit.id)}
                                                    className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-4 py-1.5 text-center">
                                                <svg
                                                    className={`w-3 h-3 text-zinc-500 transform transition-transform duration-200 ${expandedAuditId === audit.id ? 'rotate-90' : ''}`}
                                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </td>
                                            <td className="px-4 py-1.5 text-[11px] font-bold text-zinc-900">{audit.id}</td>
                                            <td className="px-4 py-1.5 text-[11px] font-bold text-[#285f94]">{audit.order_number}</td>
                                            <td className="px-4 py-1.5 text-[11px] text-zinc-600 font-mono uppercase">{audit.despatch_number}</td>
                                            <td className="px-4 py-1.5 text-[10px] text-zinc-800 truncate max-w-[200px] uppercase font-bold">
                                                 {audit.customer_code && audit.customer_code.trim() !== "" && (
                                                     <span className="text-zinc-500 mr-2">[{audit.customer_code}]</span>
                                                 )}
                                                {audit.customer_name || 'N/A'}
                                            </td>
                                            <td className="px-4 py-1.5 text-[10px] text-zinc-700 uppercase font-medium">{audit.username}</td>
                                            <td className="px-4 py-1.5 text-[10px] text-zinc-600 font-mono">{formatDate(audit.timestamp)}</td>
                                            <td className="px-4 py-1.5 text-center">
                                                <span className={`px-2 py-0.5 inline-flex text-[9px] font-bold uppercase tracking-tight rounded border ${
                                                    audit.status === 'Completado' || audit.status === 'Completo'
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                                                }`}>
                                                    {audit.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                                                <div className="flex justify-center items-center gap-4">
                                                    {isToday(audit.timestamp) && (
                                                        <button
                                                            onClick={() => handleEditClick(audit)}
                                                            className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors leading-none"
                                                            title="Editar"
                                                        >
                                                            Editar
                                                        </button>
                                                    )}
                                                    <Link
                                                        to={`/packing_list/print/${audit.id}`}
                                                        className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-[#285f94] transition-colors leading-none"
                                                        title="Imprimir"
                                                    >
                                                        Print
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>

                                        {expandedAuditId === audit.id && (
                                            <tr className="bg-zinc-50/50">
                                                <td colSpan="10" className="px-10 py-4 border-b border-zinc-100">
                                                    <div className="bg-white border border-zinc-200 p-4 shadow-sm">
                                                        <h4 className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-4 border-b border-zinc-50 pb-2">Detalle de Contenido</h4>
                                                        <table className="w-full">
                                                            <thead>
                                                                <tr className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">
                                                                    <th className="pb-2 text-left w-12">Lín.</th>
                                                                    <th className="pb-2 text-left">SKU</th>
                                                                    <th className="pb-2 text-left">Descripción</th>
                                                                    <th className="pb-2 text-right">Req.</th>
                                                                    <th className="pb-2 text-right">Esc.</th>
                                                                    <th className="pb-2 text-right">Dif.</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="text-[10px]">
                                                                {audit.items.map((item, idx) => (
                                                                    <tr key={idx} className="border-t border-zinc-50 hover:bg-zinc-50/30">
                                                                        <td className="py-2 font-mono text-zinc-400">{item.order_line}</td>
                                                                        <td className="py-2 font-bold text-zinc-800">{item.item_code}</td>
                                                                        <td className="py-2 text-zinc-500 uppercase text-[9px]">{item.description}</td>
                                                                        <td className="py-2 text-right font-mono">{item.qty_req}</td>
                                                                        <td className="py-2 text-right font-mono font-bold">{item.qty_scan}</td>
                                                                        <td className={`py-2 text-right font-mono font-bold ${item.difference !== 0 ? 'text-red-500' : 'text-emerald-500'}`}>
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

                    {/* Mobile View */}
                    <div className="block sm:hidden bg-zinc-50 p-2 space-y-3">
                        {audits.map((audit) => (
                            <div key={audit.id} className="bg-white border border-zinc-200 p-4 shadow-sm" onClick={() => toggleExpand(audit.id)}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                        <span className="text-[12px] font-bold text-[#285f94] tracking-tight">{audit.order_number}</span>
                                        <span className="text-[8px] text-zinc-400 uppercase tracking-widest">{audit.despatch_number}</span>
                                    </div>
                                    <span className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-tight rounded border ${audit.status === 'Completo' || audit.status === 'Completado' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700'}`}>
                                        {audit.status}
                                    </span>
                                </div>
                                <div className="text-[10px] font-bold text-zinc-700 uppercase mb-3 truncate">
                                    {audit.customer_code && audit.customer_code.trim() !== "" && (
                                         <span className="text-zinc-400 mr-1">[{audit.customer_code}]</span>
                                     )}
                                    {audit.customer_name}
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-zinc-50">
                                    <span className="text-[8px] font-mono text-zinc-400">{formatDate(audit.timestamp)}</span>
                                    <div className="flex gap-4">
                                        <Link to={`/packing_list/print/${audit.id}`} className="text-[9px] font-bold uppercase text-zinc-400 hover:text-zinc-900" onClick={e => e.stopPropagation()}>Print</Link>
                                    </div>
                                </div>
                                {expandedAuditId === audit.id && (
                                    <div className="mt-4 pt-4 border-t border-zinc-100 space-y-2">
                                        {audit.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-[9px] bg-zinc-50 p-2 rounded">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-zinc-800">{item.item_code}</span>
                                                    <span className="text-zinc-400 text-[8px]">L: {item.order_line}</span>
                                                </div>
                                                <div className="font-mono">
                                                    <span className="text-zinc-400">{item.qty_req}</span>
                                                    <span className="mx-1">/</span>
                                                    <span className="font-bold">{item.qty_scan}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Selection Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 text-white px-8 py-3 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-300">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{selectedIds.size} Auditorías</span>
                    <button 
                        onClick={() => setShowShipmentModal(true)} 
                        className="bg-white text-zinc-900 px-6 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                    >
                        Consolidar Envío
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-zinc-500 hover:text-white transition-colors">✕</button>
                </div>
            )}

            {/* Shipment Modal */}
            {showShipmentModal && (
                <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-zinc-200 shadow-2xl w-full max-w-md p-8">
                        <h3 className="text-[12px] font-bold text-zinc-900 uppercase tracking-tight mb-6">Crear Envío Consolidado</h3>
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Transportadora</label>
                                <input type="text" value={shipmentCarrier} onChange={e => setShipmentCarrier(e.target.value)} className="w-full h-10 border border-zinc-200 px-4 text-xs outline-none focus:ring-1 focus:ring-zinc-900 bg-zinc-50" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Observaciones</label>
                                <textarea value={shipmentNote} onChange={e => setShipmentNote(e.target.value)} className="w-full border border-zinc-200 p-4 text-xs outline-none focus:ring-1 focus:ring-zinc-900 bg-zinc-50" rows={3} />
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end gap-4">
                            <button onClick={() => setShowShipmentModal(false)} className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900">Cancelar</button>
                            <button onClick={handleCreateShipment} className="px-8 py-2 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-800">
                                {creatingShipment ? 'Procesando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && editingAudit && (
                <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-zinc-200 shadow-2xl w-full max-w-5xl p-8 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-start mb-8 border-b border-zinc-100 pb-6">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-tight">Editar Auditoría ID #{editingAudit.id}</h3>
                                <div className="text-[9px] text-zinc-400 uppercase tracking-widest flex items-center gap-4">
                                    <span>Orden: <span className="text-zinc-900 font-bold">{editingAudit.order_number}</span></span>
                                    <span>Cliente: <span className="text-zinc-900 font-bold">{editingAudit.customer_name}</span></span>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-4 bg-zinc-50 px-4 py-2 rounded border border-zinc-100">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bultos: {editingAudit.packages || 0}</span>
                                    <div className="flex gap-2">
                                        <button onClick={handleRemoveLastPackage} className="w-6 h-6 flex items-center justify-center bg-white border border-zinc-200 text-zinc-900 hover:bg-zinc-100 rounded text-sm font-bold transition-all shadow-sm">−</button>
                                        <button onClick={handleAddNewPackage} className="w-6 h-6 flex items-center justify-center bg-zinc-900 text-white hover:bg-zinc-800 rounded text-sm font-bold transition-all shadow-sm">+</button>
                                    </div>
                                </div>
                                <button onClick={() => setIsEditModalOpen(false)} className="text-zinc-300 hover:text-zinc-900 text-xl transition-colors px-2">✕</button>
                            </div>
                        </div>

                        <div className="overflow-y-auto mb-8 pr-2">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="bg-zinc-50 border-b border-zinc-100 text-[8px] font-bold text-zinc-400 uppercase tracking-widest">
                                        <th className="p-4 text-left w-12">Lín.</th>
                                        <th className="p-4 text-left w-32">Código</th>
                                        <th className="p-4 text-left">Descripción</th>
                                        <th className="p-4 text-center w-20">Req.</th>
                                        <th className="p-4 text-center w-32">Escaneado</th>
                                        <th className="p-4 text-left">Distribución en Bultos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {editingAudit.items.map((item, idx) => {
                                        const key = `${item.item_code}:${item.order_line || ''}`;
                                        const assignments = editingAudit.packages_assignment?.[key] || {};
                                        const packageKeys = Object.keys(assignments);
                                        const isUsingPackages = editingAudit.packages > 0;

                                        return (
                                            <tr key={idx} className="border-b border-zinc-50 hover:bg-zinc-50/20 transition-colors">
                                                <td className="p-4 font-mono text-[9px] text-zinc-400">{item.order_line}</td>
                                                <td className="p-4 text-[11px] font-bold text-zinc-900">{item.item_code}</td>
                                                <td className="p-4 text-[9px] text-zinc-500 uppercase truncate max-w-xs">{item.description}</td>
                                                <td className="p-4 text-center text-[11px] font-mono text-zinc-400">{item.qty_req}</td>
                                                <td className="p-4 text-center">
                                                    <div className="inline-flex items-center border border-zinc-200 bg-white rounded-md overflow-hidden">
                                                        <button onClick={() => handleQtyChange(idx, Math.max(0, item.qty_scan - 1))} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 text-lg font-light transition-colors">−</button>
                                                        <input
                                                            type="text" inputMode="numeric"
                                                            value={item.qty_scan}
                                                            onChange={(e) => handleQtyChange(idx, e.target.value.replace(/\D/g, ''))}
                                                            className="h-8 w-12 text-center text-[12px] font-bold text-zinc-900 bg-transparent border-x border-zinc-100 focus:outline-none"
                                                        />
                                                        <button onClick={() => handleQtyChange(idx, item.qty_scan + 1)} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 text-lg font-light transition-colors">+</button>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    {isUsingPackages ? (
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            {packageKeys
                                                                .filter(pkgNum => (parseInt(assignments[pkgNum]) || 0) > 0)
                                                                .map(pkgNum => {
                                                                    const qty = parseInt(assignments[pkgNum]) || 0;
                                                                    return (
                                                                        <div key={pkgNum} className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 p-1.5 rounded">
                                                                            <span className="text-[8px] font-bold text-zinc-400 uppercase px-1">B{pkgNum}</span>
                                                                            <div className="flex items-center border border-zinc-200 bg-white rounded overflow-hidden h-6">
                                                                                <button onClick={() => qty - 1 <= 0 ? removePackageAssignment(idx, pkgNum) : handlePkgQtyChange(idx, pkgNum, qty - 1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-50 transition-colors text-sm">−</button>
                                                                                <span className="w-8 text-center text-[10px] font-bold font-mono">{qty}</span>
                                                                                <button onClick={() => handlePkgQtyChange(idx, pkgNum, qty + 1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-50 transition-colors text-sm">+</button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            <select
                                                                onChange={(e) => { handleAssignToPackage(idx, e.target.value); e.target.value = ''; }}
                                                                className="h-9 px-3 text-[9px] font-bold uppercase tracking-widest bg-white border border-dashed border-zinc-300 rounded cursor-pointer outline-none hover:border-zinc-900 hover:text-zinc-900 transition-all text-zinc-400"
                                                                defaultValue=""
                                                            >
                                                                <option value="" disabled>+ Añadir Bulto</option>
                                                                {Array.from({ length: editingAudit.packages || 0 }, (_, i) => i + 1)
                                                                    .filter(p => !packageKeys.includes(p.toString()))
                                                                    .map(p => <option key={p} value={p}>Bulto {p}</option>)
                                                                }
                                                                <option value="NEW">＋ Nuevo Bulto</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[9px] text-zinc-300 uppercase italic tracking-widest">Sin asignación de bultos</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end gap-4 pt-8 border-t border-zinc-100">
                            <button onClick={() => setIsEditModalOpen(false)} className="px-8 py-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900">Cancelar</button>
                            <button onClick={handleSaveEdit} className="px-10 py-2 bg-zinc-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-800 disabled:bg-zinc-100" disabled={isSubmitting}>
                                {isSubmitting ? 'Guardando...' : 'Publicar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PickingAuditHistory;
