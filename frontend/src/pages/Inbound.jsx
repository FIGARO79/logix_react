import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';

const Inbound = () => {
    const { setTitle } = useOutletContext();

    // --- State Management ---
    const [importReference, setImportReference] = useState('');
    const [waybill, setWaybill] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [relocatedBin, setRelocatedBin] = useState('');
    const [logs, setLogs] = useState([]);
    const [currentItemData, setCurrentItemData] = useState(null);
    const [editingLogId, setEditingLogId] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [archiveVersions, setArchiveVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState('');

    const findItemBtnRef = useRef(null);
    const addLogEntryBtnRef = useRef(null);
    const itemCodeInputRef = useRef(null);


    useEffect(() => {
        setTitle("Logix - Inbound");
        loadInitialLogs();
        loadArchiveVersions();
    }, []);

    // --- Toast Notifications ---
    const showToast = (message, type = "info") => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    // --- API Calls ---
    const loadInitialLogs = async (versionDate = null) => {
        showToast(versionDate ? "Cargando histórico..." : "Cargando registros...", "info");
        try {
            let url = `/api/get_logs`;
            if (versionDate) {
                url += `?version_date=${encodeURIComponent(versionDate)}`;
            }
            const response = await fetch(url, { cache: 'no-cache' });
            if (response.ok) {
                const data = await response.json();
                setLogs(data);
                showToast("Registros cargados.", "success");
            } else {
                showToast("Error al cargar registros.", "error");
            }
        } catch (error) {
            showToast("Error de conexión al cargar registros.", "error");
        }
    };
    
    const loadArchiveVersions = async () => {
        try {
            const response = await fetch(`/api/logs/versions`);
            if (response.ok) {
                const versions = await response.json();
                setArchiveVersions(versions);
            }
        } catch (e) {
            console.error("Error cargando versiones:", e);
        }
    };

    const findItemData = async (isEditing = false) => {
        const code = itemCode.trim().toUpperCase();
        const packingList = importReference.trim().toUpperCase();

        if (!code || !packingList) {
            showToast("Ingrese Import Reference y Item Code.", "error");
            return;
        }

        if (!isEditing) {
            showToast("Buscando artículo...", "info");
        }

        try {
            const response = await fetch(`/api/find_item/${encodeURIComponent(code)}/${encodeURIComponent(packingList)}`);
            const data = await response.json();

            if (response.ok) {
                setCurrentItemData(data);
                showToast(`Artículo "${data.description || code}" encontrado.`, "success");
                if (itemCodeInputRef.current) {
                    itemCodeInputRef.current.focus();
                }

            } else {
                showToast(data.error, "error");
                setCurrentItemData(null);
            }
        } catch (error) {
            showToast("Error de conexión al buscar.", "error");
            setCurrentItemData(null);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (editingLogId) {
            // Handle update logic
        } else {
            await addLogEntry();
        }
    };

    const addLogEntry = async () => {
        if (!currentItemData) {
            showToast("Por favor, busque un artículo primero.", "error");
            return;
        }

        const logData = {
            importReference: importReference.trim().toUpperCase(),
            waybill: waybill.trim().toUpperCase(),
            itemCode: currentItemData.itemCode,
            quantity: parseInt(quantity),
            relocatedBin: relocatedBin.trim().toUpperCase(),
        };

        showToast("Añadiendo registro...", "info");
        try {
            const response = await fetch(`/api/add_log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(logData)
            });

            if (response.ok) {
                const result = await response.json();
                showToast(result.message || "Registro añadido.", "success");
                await loadInitialLogs();
                clearItemSpecificFields();
                if (itemCodeInputRef.current) itemCodeInputRef.current.focus();
            } else {
                const errorResult = await response.json();
                showToast(errorResult.error, "error");
            }

        } catch (error) {
            showToast("Error de conexión al añadir registro.", "error");
        }
    };

    const clearItemSpecificFields = () => {
        setItemCode("");
        setQuantity(1);
        setRelocatedBin("");
        setCurrentItemData(null);
        setEditingLogId(null);
    };

    const handleArchiveLogs = async () => {
        if (!confirm("¿Está seguro de que desea limpiar la base? Esta acción archivará los registros actuales.")) return;

        showToast("Archivando registros...", "info");
        try {
            const response = await fetch(`/api/logs/archive`, { method: "POST" });
            if (response.ok) {
                showToast("Base limpiada y registros archivados.", "success");
                await loadInitialLogs();
                await loadArchiveVersions();
            } else {
                const err = await response.json();
                showToast(err.detail || "Error al archivar.", "error");
            }
        } catch (error) {
            showToast("Error de conexión al archivar.", "error");
        }
    };

    const handleExport = () => {
        let url = `/api/export_logs`;
        if (selectedVersion) {
            url += `?version_date=${encodeURIComponent(selectedVersion)}`;
        }
        window.location.href = url;
    };
    const handleCleanBase = () => {
        // La función de limpiar base ahora es manejada por handleArchiveLogs
        handleArchiveLogs();
    };


    const difference = currentItemData ? quantity - (currentItemData.defaultQtyGrn || 0) : 0;
    const receptionDate = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });

    return (
        <>
            <div id="toast-container">
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast ${toast.type} show`}>
                        <span>{toast.message}</span>
                    </div>
                ))}
            </div>

            <div className="container-wrapper mx-auto px-4 py-4 sm:px-6 lg:px-8">
                <form id="main-form" onSubmit={handleFormSubmit}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8 mb-2">
                        {/* Columna Izquierda: Formulario Principal */}
                        <div className="lg:col-span-2 space-y-2 bg-white p-4 rounded-md shadow-md border border-gray-200">
                            <div style={{ background: 'linear-gradient(135deg, var(--sap-header-bg) 0%, #34495e 100%)', color: 'white', padding: '6px 10px', margin: '-16px -16px 16px -16px', borderRadius: '4px 4px 0 0' }}>
                                <h1 className="text-base font-semibold" style={{ margin: 0, letterSpacing: '0.3px' }}>Inbound - Recepción de Mercancía</h1>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div>
                                    <label htmlFor="importReference" className="form-label">Import Reference</label>
                                    <input type="text" id="importReference" name="importReference" placeholder="I.R." required
                                        value={importReference} onChange={e => setImportReference(e.target.value.toUpperCase())} />
                                </div>
                                <div>
                                    <label htmlFor="waybill" className="form-label">Waybill</label>
                                    <input type="text" id="waybill" name="waybill" placeholder="W.B." required
                                        value={waybill} onChange={e => setWaybill(e.target.value.toUpperCase())} />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="itemCode" className="form-label">Item Code.</label>
                                    <div className="flex items-end gap-2">
                                        <input type="text" id="itemCode" name="itemCode" className="flex-grow" placeholder="Ingrese código y presione Enter o Buscar" required
                                            ref={itemCodeInputRef} value={itemCode} onChange={e => setItemCode(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && findItemData()} />
                                        <button type="button" id="scanItemBtn" title="Escanear código de barras" className="btn-secondary h-9 w-auto px-3 flex-shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                                            </svg>
                                        </button>
                                        <button type="button" id="findItemBtn" title="Buscar" className="btn-secondary h-9 w-auto px-3 flex-shrink-0" ref={findItemBtnRef} onClick={() => findItemData()}>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="itemDescription" className="form-label">Item Description.</label>
                                <div id="itemDescription" className="data-field min-h-[38px]">{currentItemData?.description || ''}</div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                    <label htmlFor="quantity" className="form-label">Quantity Received.</label>
                                    <input type="number" id="quantity" name="quantity" min="1" className="w-full sm:w-1/2" required
                                        value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} />
                                </div>
                                <div>
                                    <label htmlFor="binLocation" className="form-label">Bin Location (Original).</label>
                                    <div id="binLocation" className="data-field min-h-[38px]">{currentItemData?.binLocation || ''}</div>
                                </div>
                                <div>
                                    <label htmlFor="relocatedBin" className="form-label">Relocate Bin (New).</label>
                                    <input type="text" id="relocatedBin" name="relocatedBin" className="w-full sm:w-1/2" placeholder="(Opcional)"
                                        value={relocatedBin} onChange={e => setRelocatedBin(e.target.value.toUpperCase())} />
                                </div>
                                <div>
                                    <label htmlFor="aditionalBins" className="form-label">Aditional Bins.</label>
                                    <div id="aditionalBins" className="data-field min-h-[38px]">{currentItemData?.aditionalBins || ''}</div>
                                </div>
                                <div>
                                    <label htmlFor="itemtype" className="form-label">ABC.</label>
                                    <div id="itemtype" className="data-field min-h-[38px]">{currentItemData?.itemType || ''}</div>
                                </div>
                                <div>
                                    <label htmlFor="sicCode" className="form-label">Sic Code.</label>
                                    <div id="sicCode" className="data-field min-h-[38px]">{currentItemData?.sicCode || ''}</div>
                                </div>
                            </div>

                            <div style={{ backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '3px', border: '1px solid var(--sap-border)', marginTop: '8px' }}>
                                <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sap-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid var(--sap-primary)', paddingBottom: '6px' }}>
                                    Resumen de Cantidades
                                </h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div><label className="form-label text-xs">Qty. Received</label>
                                        <div id="qtyReceived" className="data-field text-sm">{quantity}</div>
                                    </div>
                                    <div><label className="form-label text-xs">Qty. GRN (Expected)</label>
                                        <div id="qtyGrn" className="data-field text-sm">{currentItemData?.defaultQtyGrn || 0}</div>
                                    </div>
                                    <div><label className="form-label text-xs">Difference.</label>
                                        <div id="difference" className={`data-field text-sm font-bold ${difference < 0 ? 'text-red-600' : (difference > 0 ? 'text-blue-600' : '')}`}>{difference}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap justify-start items-center mt-6 gap-3">
                                <button type="submit" id="addLogEntryBtn" className="btn-primary w-60 h-10" ref={addLogEntryBtnRef}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    <span>{editingLogId ? 'Guardar Cambios' : 'Añadir Registro'}</span>
                                </button>
                                <a id="exportLogBtn" href="#" onClick={handleExport} className="btn-secondary w-60 h-10">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                    <span>Exportar Log</span>
                                </a>
                            </div>
                        </div>

                        {/* Columna Derecha: Vista de Etiqueta */}
                        <div className="lg:col-span-1">
                            <h2 className="text-lg font-semibold text-gray-700 mb-3 text-center">Vista Etiqueta</h2>
                            <div className="label-print-area">
                                <div className="label-container">
                                    {/* Contenido de la etiqueta */}
                                    <div>
                                        <div className="mb-3">
                                            <img src="/static/images/logoytpe_sandvik.png" alt="Logotipo Sandvik" className="label-logo" />
                                            <p className="label-item-code" id="labelItemCode">{currentItemData?.itemCode || 'ITEM CODE'}</p>
                                            <p className="label-item-description" id="labelItemDescription">{currentItemData?.description || 'Item Description'}</p>
                                        </div>
                                        <div className="mb-2 space-y-1">
                                            <div className="label-data-field"><span>Quantity Received</span><span id="labelQtyPackSpan">{quantity}</span></div>
                                            <div className="label-data-field"><span>Product weight</span><span id="labelWeight">{currentItemData?.weight || 'N/A'}</span></div>
                                            <div className="label-data-field"><span>Bin Location</span><span id="labelBinLocation">{relocatedBin || currentItemData?.binLocation || 'BIN'}</span></div>
                                            <div className="label-data-field"><span>Reception Date</span><span id="labelReceptionDate">{receptionDate}</span></div>
                                        </div>
                                    </div>
                                    <div className="label-bottom-section">
                                        <p className="label-disclaimer">All trademarks and logotypes appearing on this label are owned by Sandvik Group</p>
                                        <div id="qrCodeContainer">
                                            <div className="qr-placeholder">QR Code</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button type="button" id="printLabelBtn" className="btn-primary h-10 btn-print-label mt-4" onClick={() => window.print()}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-15.75A1.125 1.125 0 013 21.375v-9.75c0-.621.504-1.125 1.125-1.125H4.5m15 0V4.875c0-.621-.504-1.125-1.125-1.125h-12.75c-.621 0-1.125.504-1.125 1.125V10.5m15 0h-15" />
                                </svg>
                                <span>Imprimir Etiqueta</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Tabla de Logs */}
            <div style={{ backgroundColor: '#ffffff', padding: 0, borderRadius: '4px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)', border: '1px solid var(--sap-border)', overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(135deg, var(--sap-header-bg) 0%, #34495e 100%)', color: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 600, margin: 0, letterSpacing: '0.3px' }}>Registros de Inbound</h2>
                    <div className="flex items-center">
                    <button onClick={() => window.location.href='/update'} className="btn-secondary toolbar-btn" style={{marginRight: '0.5rem'}} title="Actualizar Archivos Maestros">Actualizar Archivos</button>
                        <select id="archiveSelector" className="archive-selector toolbar-btn" value={selectedVersion} onChange={e => { setSelectedVersion(e.target.value); loadInitialLogs(e.target.value); }}>
                            <option value="">-- Versión Actual --</option>
                            {archiveVersions.map(v => (
                                <option key={v} value={v}>Archivo: {new Date(v).toLocaleString('es-CO')}</option>
                            ))}
                        </select>
                        <button id="cleanBaseBtn" className="btn-clean-base toolbar-btn" title="Archivar registros actuales y limpiar tabla" onClick={handleCleanBase}>Base Limpia</button>
                        <button id="viewReconciliationBtn" onClick={() => window.location.href='/reconciliation'} className="btn-secondary toolbar-btn ml-2">Ver Conciliación</button>
                    </div>
                </div>
                <div className="overflow-x-auto" style={{ padding: '1px' }}>
                    <table className="min-w-full" id="logTable">
                        <thead>
                            <tr>
                                {/* Encabezados de tabla */}
                                <th>Import Reference</th>
                                <th>Waybill</th>
                                <th>Item Code</th>
                                <th>Item Description</th>
                                <th>Bin Location (Original)</th>
                                <th>Relocated Bin (New)</th>
                                <th>Qty. Received</th>
                                <th>Qty. Expected</th>
                                <th>Difference</th>
                                <th>Timestamp</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="logTableBody" className="divide-y divide-gray-200">
                            {logs.map(log => (
                                <tr key={log.id}>
                                    <td>{log.importReference}</td>
                                    <td>{log.waybill}</td>
                                    <td>{log.itemCode}</td>
                                    <td>{log.itemDescription}</td>
                                    <td>{log.binLocation}</td>
                                    <td>{log.relocatedBin}</td>
                                    <td>{log.qtyReceived}</td>
                                    <td>{log.qtyGrn}</td>
                                    <td className={`font-bold ${log.difference < 0 ? 'text-red-600' : (log.difference > 0 ? 'text-blue-600' : '')}`}>{log.difference}</td>
                                    <td>{new Date(log.timestamp).toLocaleString("es-CO")}</td>
                                    <td>
                                        <button className="action-btn edit-btn" onClick={() => {
                                            setEditingLogId(log.id);
                                            setImportReference(log.importReference);
                                            setWaybill(log.waybill);
                                            setItemCode(log.itemCode);
                                            setQuantity(log.qtyReceived);
                                            setRelocatedBin(log.relocatedBin);
                                            findItemData(true);
                                        }}>✏️</button>
                                        {/* Botón de eliminar podría ir aquí */}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <p id="emptyTableMessage" className={`text-center text-gray-500 mt-4 ${logs.length > 0 ? 'hidden' : ''}`}>No hay registros aún.</p>
        </>
    );
};

export default Inbound;