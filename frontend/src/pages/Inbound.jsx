import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// API CONSTANTS
const API_BASE_URL = 'http://localhost:8000/api'; // Adjust if needed

const Inbound = () => {
    const { setTitle } = useOutletContext();

    // --- State ---
    const [importReference, setImportReference] = useState('');
    const [waybill, setWaybill] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState('');
    const [relocatedBin, setRelocatedBin] = useState('');

    // Data State
    const [logs, setLogs] = useState([]);
    const [itemDetails, setItemDetails] = useState(null);
    const [archiveVersions, setArchiveVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState('');

    // UI State
    const [loading, setLoading] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [editingLogId, setEditingLogId] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // Refs for focus management
    const quantityInputRef = useRef(null);
    const itemCodeInputRef = useRef(null);

    useEffect(() => {
        setTitle("Recepción (Inbound)");
        loadInitialLogs();
        loadArchiveVersions();
    }, []);

    // --- API Calls ---

    const loadInitialLogs = async (version = null) => {
        setLoading(true);
        try {
            let url = `${API_BASE_URL}/views/view_logs`;
            if (version) url += `?version_date=${encodeURIComponent(version)}`;

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                setLogs(data);
            } else {
                toast.error("Error cargando registros");
            }
        } catch (error) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const loadArchiveVersions = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/inbound/versions`);
            if (response.ok) {
                const data = await response.json();
                setArchiveVersions(data);
            }
        } catch (error) {
            console.error("Error fetching versions", error);
        }
    };

    const findItemData = async (e) => {
        if (e) e.preventDefault();
        if (!itemCode.trim()) return;

        try {
            const response = await fetch(`${API_BASE_URL}/stock/find_item?item_code=${itemCode.trim()}`);
            if (response.ok) {
                const data = await response.json();
                setItemDetails(data.info || data); // Adjust based on API structure

                // Auto-fill bin if available and not set manually or if valid
                if (data.info?.Bin_1) {
                    setRelocatedBin(data.info.Bin_1);
                }

                toast.success("Artículo encontrado");
                quantityInputRef.current?.focus();
            } else {
                setItemDetails(null);
                toast.error("Artículo no encontrado en Maestro");
            }
        } catch (error) {
            toast.error("Error buscando artículo");
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        if (editingLogId) {
            handleUpdateLog();
            return;
        }

        if (!itemDetails || !quantity || !waybill || !importReference) {
            toast.warning("Complete todos los campos requeridos");
            return;
        }

        const payload = {
            importReference: importReference,
            waybill: waybill.toUpperCase(),
            itemCode: itemCode,
            itemDescription: itemDetails.Item_Description || itemDetails.description || "N/A",
            qtyReceived: parseInt(quantity),
            binLocation: itemDetails.Bin_1 || "N/A",
            relocatedBin: relocatedBin.toUpperCase() || itemDetails.Bin_1 || "N/A",
            username: "user" // Should come from context
        };

        try {
            // Using the generic log add endpoint or inbound specific if exists
            // Assuming basic add_log logic exists or reused
            const response = await fetch(`${API_BASE_URL}/logs/add_log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                toast.success("Registro añadido");
                loadInitialLogs();
                // Clear partial fields
                setItemCode('');
                setQuantity('');
                setItemDetails(null);
                itemCodeInputRef.current?.focus();
            } else {
                toast.error("Error guardando registro");
            }
        } catch (error) {
            toast.error("Error de conexión");
        }
    };

    const handleUpdateLog = async () => {
        if (!editingLogId) return;

        const payload = {
            waybill: waybill.toUpperCase(),
            qtyReceived: parseInt(quantity),
            relocatedBin: relocatedBin.toUpperCase()
        };

        try {
            const response = await fetch(`${API_BASE_URL}/inbound/log/${editingLogId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                toast.success("Registro actualizado");
                setEditingLogId(null);
                loadInitialLogs();
                // Reset form
                setItemCode('');
                setQuantity('');
                setItemDetails(null);
            } else {
                toast.error("Error actualizando registro");
            }
        } catch (error) {
            toast.error("Error de conexión");
        }
    };

    const handleEditClick = (log) => {
        setEditingLogId(log.id);
        setItemCode(log.itemCode);
        setWaybill(log.waybill || '');
        setQuantity(log.qtyReceived);
        setRelocatedBin(log.relocatedBin || '');
        setImportReference(log.importReference || importReference);

        // Mock item details for display
        setItemDetails({
            Item_Code: log.itemCode,
            Item_Description: log.description || log.itemDescription,
            Weight_per_Unit: 0 // Would need to fetch real details if needed
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleArchive = async () => {
        if (!window.confirm("¿Está seguro de archivar la base actual?")) return;

        try {
            const response = await fetch(`${API_BASE_URL}/inbound/archive`, { method: 'POST' });
            if (response.ok) {
                toast.success("Registros archivados");
                loadInitialLogs();
                loadArchiveVersions();
            } else {
                toast.error("Error al archivar");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    const handleExport = async () => {
        try {
            let url = `${API_BASE_URL}/inbound/export`;
            if (selectedVersion) url += `?version_date=${encodeURIComponent(selectedVersion)}`;

            window.open(url, '_blank');
        } catch (e) {
            toast.error("Error al iniciar descarga");
        }
    };

    const handlePrint = () => {
        if (!itemDetails) return;
        window.print();
    };

    // --- Helpers ---
    const calculateWeight = () => {
        if (!itemDetails || !quantity) return "0.00";
        const unitWeight = parseFloat(itemDetails.Weight_per_Unit || itemDetails.weight || 0);
        return (unitWeight * parseInt(quantity)).toFixed(2);
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedLogs = React.useMemo(() => {
        let sortableItems = [...logs];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [logs, sortConfig]);

    // --- Render ---
    return (
        <div className="container-wrapper p-4 font-sans text-xs sm:text-sm">
            <ToastContainer position="top-right" autoClose={3000} />

            {/* LABEL PRINT AREA (Hidden on screen, Visible on print) */}
            <div className="label-print-area hidden print:block">
                <div className="label-container flex flex-col justify-between h-full p-2 border relative">
                    <div className="flex justify-between items-start mb-2">
                        <div className="w-1/2">
                            <img src="/static/images/logix_logo.png" alt="Logo" className="label-logo h-8 object-contain" />
                        </div>
                    </div>
                    <div className="flex-grow">
                        <div className="label-item-code text-2xl font-bold mb-1">{itemDetails?.Item_Code || itemCode}</div>
                        <div className="label-item-description text-lg font-bold mb-8">{itemDetails?.Item_Description?.substring(0, 60) || "Descripción del Ítem"}</div>

                        <div className="label-data-field flex justify-between border-b border-black mb-1">
                            <span className="font-bold">CANTIDAD:</span>
                            <span className="text-xl">{quantity || "1"}</span>
                        </div>
                        <div className="label-data-field flex justify-between border-b border-black mb-1">
                            <span className="font-bold">UBICACIÓN:</span>
                            <span className="text-xl">{relocatedBin || itemDetails?.Bin_1 || "-"}</span>
                        </div>
                        <div className="label-data-field flex justify-between border-b border-black mb-1">
                            <span className="font-bold">PESO TOTAL (KG):</span>
                            <span className="text-xl">{calculateWeight()}</span>
                        </div>
                        <div className="label-data-field flex justify-between border-b border-black mb-1">
                            <span className="font-bold">FECHA:</span>
                            <span className="text-sm">{new Date().toLocaleDateString('es-CO')}</span>
                        </div>
                    </div>
                    <div className="label-bottom-section mt-auto pt-4 flex items-end justify-between">
                        <div className="label-disclaimer text-[10px] w-2/3">
                            Este material es propiedad de Logix. Verificar contenido antes de recepción.
                        </div>
                        <div className="w-24 h-24 border border-black flex items-center justify-center text-center text-[10px]">
                            QR Code
                        </div>
                    </div>
                </div>
            </div>

            {/* SCREEN ONLY CONTENT */}
            <div className="screen-content mb-6">

                {/* CONFIGURATION & FORM GRID */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* LEFT COLUMN: FORM */}
                    <div className="col-span-1 lg:col-span-2 bg-white shadow-sm border border-gray-300 rounded overflow-hidden">
                        <div className="bg-[#354a5f] text-white px-4 py-2 text-sm font-bold uppercase tracking-wider">
                            Inbound - Recepción de Mercancía
                        </div>
                        <div className="p-4">
                            <form onSubmit={(e) => { e.preventDefault(); findItemData(); }}>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Minuta / Import Reference</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 p-1.5 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 uppercase"
                                            value={importReference}
                                            onChange={e => setImportReference(e.target.value)}
                                            placeholder="I.R."
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Guía / Waybill</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 p-1.5 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 uppercase"
                                            value={waybill}
                                            onChange={e => setWaybill(e.target.value)}
                                            placeholder="W.B."
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-4 items-end">
                                    <div className="col-span-2">
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Item Code</label>
                                        <div className="flex">
                                            <input
                                                ref={itemCodeInputRef}
                                                type="text"
                                                className="w-full border border-gray-300 p-1.5 rounded-l text-sm font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                                value={itemCode}
                                                onChange={e => setItemCode(e.target.value)}
                                                placeholder="Ingrese código y presione Enter..."
                                                onKeyDown={e => e.key === 'Enter' && findItemData(e)}
                                            />
                                            <button type="button" onClick={findItemData} className="bg-[#354a5f] text-white px-3 py-1.5 rounded-r hover:bg-opacity-90">
                                                🔍
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Item Description</label>
                                    <div className="w-full bg-gray-100 border border-gray-300 p-2 rounded text-sm min-h-[34px] overflow-hidden text-ellipsis whitespace-nowrap font-medium text-gray-700">
                                        {itemDetails?.Item_Description || "..."}
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Quantity Received</label>
                                        <input
                                            ref={quantityInputRef}
                                            type="number"
                                            className="w-full border border-gray-300 p-1.5 rounded text-sm font-bold text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            value={quantity}
                                            onChange={e => setQuantity(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Bin Location (Original)</label>
                                        <div className="w-full bg-gray-100 border border-gray-300 p-1.5 rounded text-sm text-gray-700">
                                            {itemDetails?.Bin_1 || "-"}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Relocate Bin (New)</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 p-1.5 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 uppercase"
                                            value={relocatedBin}
                                            onChange={e => setRelocatedBin(e.target.value)}
                                            placeholder="(Opcional)"
                                        />
                                    </div>
                                </div>

                                <div className="border-t border-gray-200 pt-4 mt-4">
                                    <h4 className="text-[11px] font-bold text-gray-500 uppercase mb-2">Resumen de Cantidades</h4>
                                    <div className="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded text-sm">
                                        <div>
                                            <span className="block text-[10px] text-gray-500 uppercase">Qty. Received</span>
                                            <span className="font-bold text-gray-800">{itemDetails?.totals?.total_received || 0}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-gray-500 uppercase">Qty. GRN (Expected)</span>
                                            <span className="font-bold text-gray-800">{itemDetails?.totals?.total_expected || 0}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-gray-500 uppercase">Difference</span>
                                            <span className={`font-bold ${(itemDetails?.totals?.difference || 0) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                {itemDetails?.totals?.difference || 0}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={handleFormSubmit}
                                        disabled={!quantity}
                                        className={`flex-1 py-2 px-4 rounded font-bold text-white shadow transition-colors ${editingLogId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[var(--sap-yellow)] hover:bg-[var(--sap-yellow-light)] text-gray-800 border border-[var(--sap-yellow-light)]'}`}
                                    >
                                        {editingLogId ? 'Guardar Cambios' : 'Añadir Registro'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExport}
                                        className="flex-1 py-2 px-4 rounded font-bold text-white shadow bg-[#4b5563] hover:bg-[#374151] flex items-center justify-center gap-2"
                                    >
                                        <span>📥 Exportar Log</span>
                                    </button>
                                </div>

                            </form>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: LABEL PREVIEW */}
                    <div className="col-span-1">
                        <div className="bg-white shadow-sm border border-gray-300 rounded p-4 h-full relative">
                            <h3 className="text-gray-700 font-bold mb-4 border-b pb-2">Vista Etiqueta</h3>

                            {/* VISUAL LABEL PREVIEW (Mocks the printed one) */}
                            <div className="border border-gray-300 bg-white p-3 shadow-sm mx-auto aspect-[265/378] w-full max-w-[260px] flex flex-col text-xs select-none pointer-events-none">
                                <div className="flex justify-between items-start mb-2">
                                    <img src="/static/images/logix_logo.png" alt="Logo" className="h-6 object-contain" />
                                </div>
                                <div className="font-bold text-lg mb-1 leading-tight">{itemDetails?.Item_Code || "ITEM CODE"}</div>
                                <div className="font-bold text-sm mb-4 leading-tight text-gray-600 line-clamp-2">{itemDetails?.Item_Description || "Item Description"}</div>

                                <div className="flex justify-between border-b border-gray-200 mb-1 py-0.5">
                                    <span className="font-semibold text-gray-500">Quantity</span>
                                    <span>{quantity || "1"}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-200 mb-1 py-0.5">
                                    <span className="font-semibold text-gray-500">Product Weight</span>
                                    <span>{calculateWeight()}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-200 mb-1 py-0.5">
                                    <span className="font-semibold text-gray-500">Bin Loc</span>
                                    <span>{relocatedBin || itemDetails?.Bin_1 || "N/A"}</span>
                                </div>

                                <div className="mt-auto flex justify-end pt-2">
                                    <div className="w-16 h-16 border border-dashed border-gray-400 flex items-center justify-center text-[8px] text-gray-400">
                                        QR
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handlePrint}
                                disabled={!itemDetails}
                                className="w-full mt-6 bg-[var(--sap-yellow)] border border-[var(--sap-yellow-light)] text-gray-800 font-bold py-2 rounded shadow hover:bg-[var(--sap-yellow-light)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Imprimir Etiqueta
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            {/* LOGS TABLE (Bottom) */}
            <div className="bg-white shadow-sm border border-gray-300 rounded overflow-hidden">
                <div className="bg-[#354a5f] text-white px-4 py-2 text-sm font-bold flex justify-between items-center">
                    <span>Registros de Inbound</span>

                    <div className="flex gap-2">
                        <button onClick={handleArchive} className="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2 py-1 rounded">
                            Base Limpia
                        </button>
                        <button onClick={() => window.location.href = '/reconciliation'} className="bg-[#5a6c7d] hover:bg-[#4a5c6d] text-white text-[10px] px-2 py-1 rounded">
                            Ver Conciliación
                        </button>
                        <select
                            className="text-black text-[10px] rounded p-0.5"
                            value={selectedVersion}
                            onChange={(e) => { setSelectedVersion(e.target.value); loadInitialLogs(e.target.value); }}
                        >
                            <option value="">-- Versión Actual --</option>
                            {archiveVersions.map(v => (
                                <option key={v} value={v}>Arch: {new Date(v).toLocaleDateString()}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-[#4a5f7f] text-white uppercase font-bold sticky top-0">
                            <tr>
                                <th className="px-3 py-2">Import Reference</th>
                                <th className="px-3 py-2">Waybill</th>
                                <th className="px-3 py-2">Item Code</th>
                                <th className="px-3 py-2">Item Description</th>
                                <th className="px-3 py-2 border-l border-white/10">Bin Location (Original)</th>
                                <th className="px-3 py-2">Relocated Bin (New)</th>
                                <th className="px-3 py-2 text-right border-l border-white/10">Qty. Received</th>
                                <th className="px-3 py-2 text-right">Qty. Expected</th>
                                <th className="px-3 py-2 text-center text-blue-200 border-l border-white/10">Difference</th>
                                <th className="px-3 py-2">Timestamp</th>
                                <th className="px-3 py-2 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {sortedLogs.length > 0 ? (
                                sortedLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-blue-50 transition-colors">
                                        <td className="px-3 py-1.5 align-middle">{log.importReference || "-"}</td>
                                        <td className="px-3 py-1.5 align-middle">{log.waybill || "-"}</td>
                                        <td className="px-3 py-1.5 align-middle font-semibold text-gray-700">{log.itemCode}</td>
                                        <td className="px-3 py-1.5 align-middle truncate max-w-[200px]" title={log.description}>{log.description}</td>
                                        <td className="px-3 py-1.5 align-middle border-l border-gray-100">{log.binLocation}</td>
                                        <td className="px-3 py-1.5 align-middle">{log.relocatedBin}</td>
                                        <td className="px-3 py-1.5 align-middle text-right font-bold border-l border-gray-100">{log.qtyReceived}</td>
                                        <td className="px-3 py-1.5 align-middle text-right text-gray-500">{log.qtyGrn || 0}</td>
                                        <td className={`px-3 py-1.5 align-middle text-center font-bold border-l border-gray-100 ${log.difference < 0 ? 'text-red-600' : (log.difference > 0 ? 'text-blue-600' : 'text-gray-400')}`}>
                                            {log.difference || 0}
                                        </td>
                                        <td className="px-3 py-1.5 align-middle text-gray-500">{new Date(log.timestamp).toLocaleString('es-CO')}</td>
                                        <td className="px-3 py-1.5 align-middle text-center">
                                            {!selectedVersion && (
                                                <button onClick={() => handleEditClick(log)} className="text-gray-500 hover:text-blue-600 p-1" title="Editar">
                                                    ✏️
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="11" className="px-4 py-8 text-center text-gray-400 italic">No hay registros para mostrar.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Inbound;
