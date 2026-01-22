import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { useReactToPrint } from 'react-to-print';

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
    
    // Scanner State
    const [isScanning, setIsScanning] = useState(false);
    
    // QR Code State for Label
    const [qrDataUrl, setQrDataUrl] = useState('');

    // Sorting State
    const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

    // Refs
    const findItemBtnRef = useRef(null);
    const addLogEntryBtnRef = useRef(null);
    const itemCodeInputRef = useRef(null);
    const labelRef = useRef(null); // Ref for the printable area
    const scannerRef = useRef(null); // Ref for the scanner element

    useEffect(() => {
        setTitle("Logix - Inbound");
        loadInitialLogs();
        loadArchiveVersions();
        
        // Cleanup scanner on unmount
        return () => {
             if (isScanning) {
                 stopScanner();
             }
        };
    }, []);

    // Update Label QR and Weight whenever relevant data changes
    useEffect(() => {
        if (currentItemData?.itemCode) {
            generateQR(currentItemData.itemCode);
        } else {
            setQrDataUrl('');
        }
    }, [currentItemData, quantity, relocatedBin]);

    // --- Printing Hook ---
    const handlePrint = useReactToPrint({
        content: () => labelRef.current,
        documentTitle: 'Etiqueta_Inbound',
        pageStyle: `
            @page {
                size: 70mm 100mm;
                margin: 0mm;
            }
            @media print {
                body {
                    margin: 0;
                    padding: 0;
                }
            }
        `,
        onAfterPrint: () => showToast("Impresión finalizada", "info")
    });


    // --- Toast Notifications ---
    const showToast = (message, type = "info") => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    // --- QR Code Generator ---
    const generateQR = async (text) => {
        try {
            const url = await QRCode.toDataURL(text, { 
                width: 96, 
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });
            setQrDataUrl(url);
        } catch (err) {
            console.error("Error generating QR", err);
            setQrDataUrl('');
        }
    };

    // --- API Calls ---
    const loadInitialLogs = async (versionDate = null) => {
        // Only show loading toast if not a background update
        if (!editingLogId) {
             showToast(versionDate ? "Cargando histórico..." : "Cargando registros...", "info");
        }
        
        try {
            let url = `/api/get_logs`;
            if (versionDate) {
                url += `?version_date=${encodeURIComponent(versionDate)}`;
            }
            const response = await fetch(url, { cache: 'no-cache' });
            if (response.ok) {
                const data = await response.json();
                setLogs(data);
                if (!editingLogId) showToast("Registros cargados.", "success");
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

    const findItemData = async (isEditing = false, codeOverride = null) => {
        const code = codeOverride || itemCode.trim().toUpperCase();
        const packingList = importReference.trim().toUpperCase();

        if (!code || !packingList) {
            if (!isEditing) showToast("Ingrese Import Reference y Item Code.", "error");
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
                if (!isEditing) {
                    showToast(`Artículo "${data.description || code}" encontrado.`, "success");
                    if (itemCodeInputRef.current) {
                        itemCodeInputRef.current.focus();
                    }
                }
            } else {
                showToast(data.error, "error");
                if(!isEditing) setCurrentItemData(null);
            }
        } catch (error) {
            showToast("Error de conexión al buscar.", "error");
            if(!isEditing) setCurrentItemData(null);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (editingLogId) {
            await handleUpdateLogEntry();
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

    const handleUpdateLogEntry = async () => {
        if (!editingLogId) return;
        
        const quantityVal = parseInt(quantity);
        if (isNaN(quantityVal) || quantityVal < 0) {
            showToast("La cantidad debe ser un número válido.", "error");
            return;
        }

        const logDataToUpdate = {
            waybill: waybill.trim().toUpperCase(),
            qtyReceived: quantityVal,
            relocatedBin: relocatedBin.trim().toUpperCase()
        };

        showToast(`Actualizando registro ID: ${editingLogId}...`, "info");
        try {
            const response = await fetch(`/api/update_log/${editingLogId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(logDataToUpdate)
            });

            if (response.ok) {
                const result = await response.json();
                showToast(result.message || "Registro actualizado.", "success");
                await loadInitialLogs();
                cancelEditMode();
            } else {
                const errorResult = await response.json();
                showToast(errorResult.error || "Error al actualizar", "error");
            }
        } catch (error) {
            showToast("Error de conexión al actualizar.", "error");
        }
    };

    const clearItemSpecificFields = () => {
        setItemCode("");
        setQuantity(1);
        setRelocatedBin("");
        setCurrentItemData(null);
        setQrDataUrl('');
    };

    const cancelEditMode = () => {
        setEditingLogId(null);
        clearItemSpecificFields();
        setImportReference(""); // Optional: keep or clear IR/Waybill depending on workflow. Legacy kept them I think.
        // Actually legacy kept IR/Waybill usually. Let's keep them but clear item fields.
        // But if we want to reset completely:
        // setWaybill("");
        showToast("Edición cancelada.", "info");
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

    const handleDeleteLog = async (logId) => {
        if (!confirm("¿Está seguro de eliminar este registro?")) return;

        showToast("Eliminando...", "info");
        try {
            const response = await fetch(`/api/delete_log/${logId}`, { method: 'DELETE' });
            if (response.ok) {
                showToast("Registro eliminado.", "success");
                loadInitialLogs();
            } else {
                const data = await response.json();
                showToast(data.detail || "Error al eliminar.", "error");
            }
        } catch (error) {
            showToast("Error de conexión.", "error");
        }
    };

    const handleEditClick = (log) => {
        setEditingLogId(log.id);
        setImportReference(log.importReference);
        setWaybill(log.waybill);
        setItemCode(log.itemCode);
        setQuantity(log.qtyReceived);
        setRelocatedBin(log.relocatedBin || '');
        
        // Find item data to populate details
        // We need to temporarily set state variables or pass directly
        findItemData(true, log.itemCode);
        window.scrollTo(0, 0);
    };

    // --- Scanner Logic ---
    const startScanner = () => {
        setIsScanning(true);
        // Delay slighty to allow modal to render
        setTimeout(() => {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;
            html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText, decodedResult) => {
                    // Success callback
                    stopScanner();
                    setItemCode(decodedText.toUpperCase());
                    // Trigger search after state update (might need effect or direct call)
                    // Since setItemCode is async, we can just call findItemData with the value
                    setTimeout(() => findItemData(false, decodedText.toUpperCase()), 100);
                },
                (errorMessage) => {
                    // parse error, ignore it.
                }
            ).catch(err => {
                console.error("Error starting scanner", err);
                showToast("No se pudo iniciar la cámara.", "error");
                setIsScanning(false);
            });
        }, 100);
    };

    const stopScanner = () => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
                scannerRef.current.clear();
                setIsScanning(false);
            }).catch(err => {
                console.error("Failed to stop scanner", err);
                setIsScanning(false);
            });
        } else {
            setIsScanning(false);
        }
    };

    // --- Sorting Logic ---
    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedLogs = useMemo(() => {
        let sortableLogs = [...logs];
        if (sortConfig.key !== null) {
            sortableLogs.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];
                
                // Handle text comparisons
                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                if (aVal < bVal) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableLogs;
    }, [logs, sortConfig]);

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return '↕';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

    // --- Calculations ---
    const difference = currentItemData ? quantity - (currentItemData.defaultQtyGrn || 0) : 0;
    const receptionDate = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const totalWeight = currentItemData && currentItemData.weight 
        ? (parseFloat(currentItemData.weight) * quantity).toFixed(2) 
        : 'N/A';

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
                        {/* Left Column: Main Form */}
                        <div className="lg:col-span-2 space-y-2 bg-white p-4 rounded-md shadow-md border border-gray-200">
                            <div style={{ background: 'linear-gradient(135deg, var(--sap-header-bg) 0%, #34495e 100%)', color: 'white', padding: '6px 10px', margin: '-16px -16px 16px -16px', borderRadius: '4px 4px 0 0' }}>
                                <h1 className="text-base font-semibold" style={{ margin: 0, letterSpacing: '0.3px' }}>Inbound - Recepción de Mercancía</h1>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div>
                                    <label htmlFor="importReference" className="form-label">Import Reference</label>
                                    <input type="text" id="importReference" name="importReference" placeholder="I.R." required
                                        value={importReference} onChange={e => setImportReference(e.target.value.toUpperCase())} 
                                        readOnly={!!editingLogId}
                                        className={editingLogId ? 'bg-gray-100' : ''}
                                        />
                                </div>
                                <div>
                                    <label htmlFor="waybill" className="form-label">Waybill</label>
                                    <input type="text" id="waybill" name="waybill" placeholder="W.B." required
                                        value={waybill} onChange={e => setWaybill(e.target.value.toUpperCase())} />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="itemCode" className="form-label">Item Code.</label>
                                    <div className="flex items-end gap-2">
                                        <input type="text" id="itemCode" name="itemCode" className={`flex-grow ${editingLogId ? 'bg-gray-100' : ''}`} placeholder="Ingrese código y presione Enter o Buscar" required
                                            ref={itemCodeInputRef} value={itemCode} onChange={e => setItemCode(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && findItemData()} 
                                            readOnly={!!editingLogId}
                                            />
                                        
                                        {!editingLogId && (
                                            <button type="button" id="scanItemBtn" title="Escanear código de barras" 
                                                className="btn-secondary h-9 w-auto px-3 flex-shrink-0"
                                                onClick={startScanner}>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                                                </svg>
                                            </button>
                                        )}
                                        
                                        {!editingLogId && (
                                            <button type="button" id="findItemBtn" title="Buscar" className="btn-secondary h-9 w-auto px-3 flex-shrink-0" ref={findItemBtnRef} onClick={() => findItemData()}>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                                </svg>
                                            </button>
                                        )}
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
                                
                                {editingLogId && (
                                    <button type="button" onClick={cancelEditMode} className="btn-secondary w-60 h-10 bg-gray-500 hover:bg-gray-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        <span>Cancelar Edición</span>
                                    </button>
                                )}

                                <a id="exportLogBtn" href="#" onClick={handleExport} className="btn-secondary w-60 h-10">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                    <span>Exportar Log</span>
                                </a>
                            </div>
                        </div>

                        {/* Right Column: Label View */}
                        <div className="lg:col-span-1">
                            <h2 className="text-lg font-semibold text-gray-700 mb-3 text-center">Vista Etiqueta</h2>
                            <div className="label-print-area" ref={labelRef}>
                                <div className="label-container">
                                    {/* Label Content */}
                                    <div>
                                        <div className="mb-3">
                                            <img src="/static/images/logoytpe_sandvik.png" alt="Logotipo Sandvik" className="label-logo" />
                                            <p className="label-item-code" id="labelItemCode">{currentItemData?.itemCode || 'ITEM CODE'}</p>
                                            <p className="label-item-description" id="labelItemDescription">{currentItemData?.description || 'Item Description'}</p>
                                        </div>
                                        <div className="mb-2 space-y-1">
                                            <div className="label-data-field">
                                                <span>Quantity Received</span>
                                                <span className="label-qty-span">{quantity}</span>
                                            </div>
                                            <div className="label-data-field"><span>Product weight</span><span id="labelWeight">{totalWeight}</span></div>
                                            <div className="label-data-field"><span>Bin Location</span><span id="labelBinLocation">{relocatedBin || currentItemData?.binLocation || 'BIN'}</span></div>
                                            <div className="label-data-field"><span>Reception Date</span><span id="labelReceptionDate">{receptionDate}</span></div>
                                        </div>
                                    </div>
                                    <div className="label-bottom-section">
                                        <p className="label-disclaimer">All trademarks and logotypes appearing on this label are owned by Sandvik Group</p>
                                        <div id="qrCodeContainer">
                                            {qrDataUrl ? (
                                                <img src={qrDataUrl} alt="QR Code" style={{ width: '100%', height: '100%' }} />
                                            ) : (
                                                <div className="qr-placeholder">QR Code</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button type="button" id="printLabelBtn" className="btn-primary h-10 btn-print-label mt-4 flex items-center justify-center gap-2" 
                                onClick={handlePrint}
                                disabled={!currentItemData}>
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

            {/* Log Table */}
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
                        <button id="cleanBaseBtn" className="btn-clean-base toolbar-btn" title="Archivar registros actuales y limpiar tabla" onClick={handleArchiveLogs}>Base Limpia</button>
                        <button id="viewReconciliationBtn" onClick={() => window.location.href='/reconciliation'} className="btn-secondary toolbar-btn ml-2">Ver Conciliación</button>
                    </div>
                </div>
                <div className="overflow-x-auto" style={{ padding: '1px' }}>
                    <table className="min-w-full" id="logTable">
                        <thead>
                            <tr>
                                <th onClick={() => requestSort('importReference')} className="cursor-pointer">Import Reference {getSortIndicator('importReference')}</th>
                                <th onClick={() => requestSort('waybill')} className="cursor-pointer">Waybill {getSortIndicator('waybill')}</th>
                                <th onClick={() => requestSort('itemCode')} className="cursor-pointer">Item Code {getSortIndicator('itemCode')}</th>
                                <th onClick={() => requestSort('itemDescription')} className="cursor-pointer">Item Description {getSortIndicator('itemDescription')}</th>
                                <th onClick={() => requestSort('binLocation')} className="cursor-pointer">Bin (Original) {getSortIndicator('binLocation')}</th>
                                <th onClick={() => requestSort('relocatedBin')} className="cursor-pointer">Relocate Bin {getSortIndicator('relocatedBin')}</th>
                                <th onClick={() => requestSort('qtyReceived')} className="cursor-pointer">Qty. Received {getSortIndicator('qtyReceived')}</th>
                                <th onClick={() => requestSort('qtyGrn')} className="cursor-pointer">Qty. Expected {getSortIndicator('qtyGrn')}</th>
                                <th onClick={() => requestSort('difference')} className="cursor-pointer">Difference {getSortIndicator('difference')}</th>
                                <th onClick={() => requestSort('timestamp')} className="cursor-pointer">Timestamp {getSortIndicator('timestamp')}</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="logTableBody" className="divide-y divide-gray-200">
                            {sortedLogs.map(log => (
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
                                        <div className="flex space-x-2">
                                            <button className="text-blue-600 hover:text-blue-800" title="Editar" onClick={() => handleEditClick(log)}>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                </svg>
                                            </button>
                                            <button className="text-red-600 hover:text-red-800" title="Eliminar" onClick={() => handleDeleteLog(log.id)}>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <p id="emptyTableMessage" className={`text-center text-gray-500 mt-4 ${logs.length > 0 ? 'hidden' : ''}`}>No hay registros aún.</p>
            
            {/* Scanner Modal */}
            {isScanning && (
                <div id="scanner-modal" className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-4 max-w-lg w-full">
                        <h3 className="text-lg font-bold mb-4 text-center">Apunta la cámara al código de barras</h3>
                        <div id="reader" className="w-full rounded-md overflow-hidden border bg-black" style={{ minHeight: '300px' }}></div>
                        <button onClick={stopScanner} className="mt-4 w-full bg-red-600 text-white py-2 rounded-md hover:bg-red-700">Cancelar</button>
                    </div>
                </div>
            )}
        </>
    );
};

export default Inbound;