import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import ScannerModal from '../components/ScannerModal';
import { getDB } from '../utils/offlineDb';
import { syncPendingInbound, checkAndSyncIfNeeded, downloadMasterData } from '../utils/syncManager';
import '../styles/Label.css';

const Inbound = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Logix - Inbound"); }, [setTitle]);
    // ... (rest of states)
    // --- Estados del Formulario ---
    const [importRef, setImportRef] = useState('');
    const [waybill, setWaybill] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState('');
    const [relocatedBin, setRelocatedBin] = useState('');

    // --- Estados de Datos ---
    const [itemData, setItemData] = useState(null);
    const [logs, setLogs] = useState([]);
    const [versions, setVersions] = useState([]);
    const [currentVersion, setCurrentVersion] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // --- Estados de UI ---
    const [loading, setLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [offline, setOffline] = useState(!navigator.onLine);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [qrImage, setQrImage] = useState(null);
    const [editId, setEditId] = useState(null);

    const normalizeDate = (dateString) => {
        if (!dateString) return null;
        let normalized = dateString.trim().replace(' ', 'T');

        if (normalized.length === 10 && normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return `${normalized}T00:00:00`;
        }

        const hasTimeZone = normalized.includes('Z') ||
            normalized.match(/[+-]\d{2}:\d{2}$/) ||
            (normalized.includes('-') && normalized.split('T')[1]?.includes('-'));
        if (!hasTimeZone) normalized = `${normalized}Z`;
        return normalized;
    };

    const formatDate = (dateString, showTime = true) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return '-';
        const date = new Date(normalized);
        if (isNaN(date.getTime())) return 'Fecha Inválida';

        const options = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        };

        if (showTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
            options.hour12 = false;
        }

        return date.toLocaleString('es-CO', options);
    };

    // --- Refs ---
    const quantityRef = useRef(null);
    const itemCodeRef = useRef(null);
    const printFrameRef = useRef(null);

    // --- Helpers de Sincronización ---
    const runAutoSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        await checkAndSyncIfNeeded();
        setIsSyncing(false);
    };

    // Carga inicial y listeners de red/foco
    useEffect(() => {
        loadLogs();
        loadVersions();
        
        // Check inicial
        runAutoSync();
        syncPendingInbound().then(() => loadLogs());

        // Intervalo de revisión cada 10 minutos (600,000 ms)
        const syncInterval = setInterval(() => {
            runAutoSync();
        }, 600000);

        const handleOnline = () => {
            setOffline(false);
            runAutoSync();
            syncPendingInbound().then(() => loadLogs());
        };
        
        const handleFocus = () => {
            // Al volver a la pestaña, verificar si hubo cambios en el servidor
            runAutoSync();
        };

        const handleOffline = () => setOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(syncInterval);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    // Filter logs based on search term
    const filteredLogs = logs.filter(log =>
        (log.itemCode && log.itemCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.waybill && log.waybill.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.importReference && log.importReference.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.itemDescription && log.itemDescription.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Generar QR para la etiqueta cuando cambia el item
    useEffect(() => {
        if (itemData?.itemCode) {
            QRCode.toDataURL(itemData.itemCode, { width: 256, margin: 0 })
                .then(url => setQrImage(url))
                .catch(err => console.error(err));
        } else {
            setQrImage(null);
        }
    }, [itemData]);

    // --- Funciones API ---

    const loadLogs = async (version = '') => {
        setCurrentVersion(version);
        let apiLogs = [];
        try {
            const url = version
                ? `/api/get_logs?version_date=${version}`
                : `/api/get_logs`;
            const res = await fetch(url, { credentials: 'include' });
            if (res.ok) {
                apiLogs = await res.json();
            } else {
                console.error("Failed to load logs:", res.status, res.statusText);
                if (res.status === 401) window.location.href = '/login';
            }
        } catch (e) { console.error("Error loading logs from API", e); }

        // Cargar logs pendientes de IndexedDB (solo para la versión actual)
        let pendingLogs = [];
        if (!version || version === '') {
            try {
                const db = await getDB();
                const pending = await db.getAll('pending_sync');
                pendingLogs = pending.map(p => ({
                    ...p.payload,
                    id: p.id,
                    timestamp: p.timestamp,
                    username: 'LOCAL (Sync)',
                    isPending: true,
                    itemDescription: p.payload.itemDescription || 'Cargando...'
                }));
            } catch (e) { console.error("Error loading pending logs", e); }
        }

        setLogs([...pendingLogs, ...apiLogs]);
    };

    const loadVersions = async () => {
        try {
            const res = await fetch('/api/logs/versions', { credentials: 'include' });
            if (res.ok) setVersions(await res.json());
        } catch (e) { console.error(e); }
    };

    const handleLookupReference = async (type, value) => {
        if (!value || editId) return;
        const normalizedValue = value.trim().toUpperCase();

        let onlineDataFound = false;
        if (navigator.onLine) {
            try {
                const params = type === 'waybill' ? `waybill=${encodeURIComponent(normalizedValue)}` : `import_ref=${encodeURIComponent(normalizedValue)}`;
                const res = await fetch(`/api/inbound/lookup_reference?${params}`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if ((type === 'waybill' && data.import_ref) || (type === 'import_ref' && data.waybill)) {
                        if (data.waybill) setWaybill(data.waybill);
                        if (data.import_ref) setImportRef(data.import_ref);
                        console.log(`Logix: Datos de ${type} encontrados en servidor.`);
                        onlineDataFound = true;
                        return;
                    }
                }
            } catch (e) { console.error("Error lookup", e); }
        }

        // Modo Offline o Fallback (Si no se encontró online o estamos offline)
        if (!onlineDataFound) {
            try {
                const db = await getDB();
                const id = type === 'waybill' ? `wb_${normalizedValue}` : `ir_${normalizedValue}`;
                const match = await db.get('po_lookup', id);
                
                if (match) {
                    console.log(`Logix: Datos de ${type} encontrados en DB Local (match id: ${id})`);
                    if (type === 'waybill' && match.import_ref) {
                        setImportRef(match.import_ref);
                    } else if (type === 'import_ref' && match.waybill) {
                        setWaybill(match.waybill);
                    }
                } else {
                    console.warn(`Logix: No se encontró match local para ${id}`);
                }
            } catch (e) { console.error("Offline lookup error", e); }
        }
    };

    const findItem = async () => {
        if (!itemCode || !importRef) {
            alert("Ingrese Import Reference e Item Code");
            return;
        }
        setLoading(true);
        const normalizedCode = itemCode.trim().toUpperCase();

        // 1. Intentar Online para obtener predicciones IA y datos frescos
        if (navigator.onLine) {
            try {
                const res = await fetch(`/api/find_item/${encodeURIComponent(normalizedCode)}/${encodeURIComponent(importRef)}`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setItemData(data);
                    if (!editId) setQuantity('');
                    quantityRef.current?.focus();
                    setLoading(false);
                    return;
                }
            } catch (e) { console.log("Fallo fetch online, intentando offline..."); }
        }

        // 2. Modo Offline (Fallback)
        try {
            const db = await getDB();
            const item = await db.get('master_items', normalizedCode);
            if (item) {
                // Obtener GRN y Xdock de sus propias tablas
                const grn = await db.get('grn_pending', normalizedCode);
                const xdock = await db.get('xdock_reservations', normalizedCode);

                const data = {
                    itemCode: item.Item_Code,
                    description: item.Item_Description,
                    binLocation: item.Bin_1,
                    suggestedBin: null, // IA no disponible offline
                    is_ai_prediction: false,
                    xdockTotal: xdock ? xdock.total : 0,
                    xdockPending: xdock ? xdock.total : 0, // Simplificación offline
                    weight: item.Weight_per_Unit,
                    defaultQtyGrn: grn ? grn.total_expected : 0,
                    itemType: item.ABC_Code_stockroom,
                    sicCode: item.SIC_Code_stockroom
                };
                setItemData(data);
                if (!editId) setQuantity('');
                quantityRef.current?.focus();
            } else {
                alert("Item no encontrado en el maestro local.");
                setItemData(null);
            }
        } catch (e) {
            alert("Error al acceder a la base de datos local");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLog = async (e) => {
        e.preventDefault();
        if (!itemData) return alert("Busque un item primero");

        const payload = {
            importReference: importRef.trim().toUpperCase(),
            waybill: waybill.trim().toUpperCase(),
            itemCode: itemData.itemCode,
            itemDescription: itemData.description, // Guardar descripción para mostrar offline
            quantity: parseInt(quantity),
            relocatedBin: relocatedBin.trim().toUpperCase()
        };

        if (navigator.onLine) {
            try {
                let res;
                if (editId) {
                    // Si es un editId de tipo UUID (string), significa que estamos editando un registro local aún no subido
                    // pero el API update_log espera un ID numérico de la DB.
                    // Por simplicidad, los edits de pendientes se manejan localmente.
                    if (typeof editId === 'string' && editId.includes('-')) {
                        const db = await getDB();
                        await db.put('pending_sync', {
                            id: editId,
                            payload,
                            timestamp: new Date().toISOString()
                        });
                        loadLogs();
                        resetForm();
                        return;
                    }

                    res = await fetch(`/api/update_log/${editId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            importReference: payload.importReference,
                            waybill: payload.waybill,
                            qtyReceived: payload.quantity,
                            relocatedBin: payload.relocatedBin
                        })
                    });
                } else {
                    res = await fetch(`/api/add_log`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(payload)
                    });
                }

                if (res.ok) {
                    loadLogs();
                    resetForm();
                    return;
                } else {
                    const err = await res.json();
                    console.error("Error API:", err);
                }
            } catch (e) {
                console.error("Connection error, falling back to offline save", e);
            }
        }

        // Modo Offline: Guardar en IndexedDB
        try {
            const db = await getDB();
            const id = editId || crypto.randomUUID();
            await db.put('pending_sync', {
                id,
                payload,
                timestamp: new Date().toISOString(),
                editId: typeof editId === 'number' ? editId : null // Guardar el ID real si era un edit de algo existente
            });
            alert("Guardado localmente (Offline). Se sincronizará al recuperar conexión.");
            loadLogs();
            resetForm();
        } catch (e) {
            alert("Error al guardar localmente");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Eliminar registro?")) return;
        
        // Si el ID es un UUID (string), es local
        if (typeof id === 'string' && id.includes('-')) {
            try {
                const db = await getDB();
                await db.delete('pending_sync', id);
                loadLogs();
                return;
            } catch (e) { console.error(e); }
        }

        try {
            await fetch(`/api/delete_log/${id}`, { method: 'DELETE', credentials: 'include' });
            loadLogs();
        } catch (e) { alert("Error"); }
    };

    const handleArchive = async () => {
        if (!confirm("¿Archivar registros actuales y limpiar base?")) return;
        try {
            await fetch(`/api/logs/archive`, { method: 'POST', credentials: 'include' });
            loadLogs();
            loadVersions();
        } catch (e) { alert("Error"); }
    };

    // --- Helpers UI ---
    const resetForm = () => {
        setEditId(null);
        setItemCode('');
        setQuantity('');
        setRelocatedBin('');
        setItemData(null);
        // Mantener Import Ref y Waybill por comodidad (UX legacy)
        // Focus en itemCode para entrada rápida de datos
        setTimeout(() => itemCodeRef.current?.focus(), 300);
    };

    const startEdit = (log) => {
        setEditId(log.id);
        setImportRef(log.importReference ? log.importReference.trim() : '');
        setWaybill(log.waybill ? log.waybill.trim() : '');
        setItemCode(log.itemCode);
        setQuantity(log.qtyReceived);
        setRelocatedBin(log.relocatedBin ? log.relocatedBin.trim() : '');
        // Buscar datos del item para llenar la UI
        fetch(`/api/find_item/${encodeURIComponent(log.itemCode)}/${encodeURIComponent(log.importReference)}`)
            .then(r => r.json())
            .then(data => setItemData(data));
    };

    // Escáner
    // Escáner
    const handleScan = (code) => {
        const upperCode = code.toUpperCase();
        setItemCode(upperCode);
        setScannerOpen(false);
        setTimeout(() => checkAndFind(upperCode), 200);
    };

    // Helper wrapper to ensure state is fresh or passed directly
    const checkAndFind = (code) => {
        if (!code) return;
        // Solo necesitamos que el itemCode esté seteado y llamar a findItem
        // findItem ahora es robusto ante fallos de red
        setItemCode(code);
        setTimeout(() => findItem(), 0);
    };

    // Cálculos para Inbound Ciego
    const itemLogs = logs.filter(l => l.itemCode === itemData?.itemCode);
    const cumulativeQty = itemLogs.reduce((acc, curr) => acc + curr.qtyReceived, 0);
    const auditCount = itemLogs.length;
    const displayQty = (cumulativeQty + parseInt(quantity || 0));

    const totalWeight = itemData ? (parseFloat(itemData.weight || 0) * parseInt(quantity || 1)).toFixed(2) : 'N/A';

    const handlePrint = () => {
        const frame = printFrameRef.current;
        if (!frame) {
            alert("Error: No se encontró el marco de impresión.");
            return;
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Etiqueta ${itemData ? itemData.itemCode : ''}</title>
                <style>
                    @page { size: 70mm 100mm; margin: 0; }
                    html, body { 
                        width: 70mm; height: 100mm; margin: 0; padding: 0; 
                        overflow: hidden; background: white; 
                        font-family: Arial, sans-serif; 
                    }
                    .label-container {
                        width: 70mm; height: 100mm; 
                        box-sizing: border-box;
                        padding: 3.5mm; 
                        background: white;
                        display: flex;
                        flex-direction: column;
                    }
                    .label-logo { 
                        height: 7mm; 
                        display: block; 
                        margin-bottom: 3.5mm;
                        flex-shrink: 0;
                        align-self: flex-start;
                    }
                    .label-item-code { 
                        font-family: Arial, sans-serif;
                        font-size: 12pt; 
                        font-weight: bold; 
                        margin: 0; 
                        line-height: 1.2; 
                        color: #000;
                        word-break: break-word;
                    }
                    .label-item-description { 
                        font-family: Arial, sans-serif;
                        font-size: 12pt; 
                        font-weight: bold; 
                        margin: 0 0 2mm 0;
                        line-height: 1.2; 
                        color: #000;
                        word-break: break-word;
                        flex-grow: 1;
                    }
                    
                    /* Grid Data Table */
                    .label-data-table {
                        width: 100%;
                        font-size: 9pt;
                        line-height: 1.4;
                        flex-shrink: 0;
                    }
                    .label-row {
                        display: grid;
                        grid-template-columns: 28mm 1fr;
                    }
                    .label-label {
                         font-weight: normal; color: #000;
                    }
                    .label-value {
                         font-weight: normal; color: #000;
                    }
                    
                    /* Footer */
                    .label-footer { 
                        display: flex; 
                        align-items: flex-end; 
                        justify-content: space-between;
                        margin-top: 2mm;
                        flex-shrink: 0;
                    }
                    
                    .label-disclaimer { 
                        font-size: 7pt; 
                        color: #000; 
                        max-width: 35mm; 
                        line-height: 1.1; 
                        margin: 0; 
                    }
                    
                    #qrCodeContainer { 
                        width: 25mm; 
                        height: 25mm; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center;
                        flex-shrink: 0;
                    }
                    #qrCodeContainer img { width: 100%; height: 100%; object-fit: contain; }
                </style>
            </head>
            <body>
                <div class="label-container">
                    <!-- Logo -->
                    <img src="/static/images/logoytpe_sandvik.png" alt="Sandvik" class="label-logo" />
                    
                    <!-- Header -->
                    <div class="label-item-code">${itemData?.itemCode || ''}</div>
                    <div class="label-item-description">${itemData?.description || ''}</div>

                    <!-- Data Grid -->
                    <div class="label-data-table">
                        <div class="label-row">
                            <div class="label-label">Quantity/pack</div>
                            <div class="label-value">${quantity || 1} EA</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Product weight</div>
                            <div class="label-value">${totalWeight} kg</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Packaging date</div>
                            <div class="label-value">${new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Bin location</div>
                            <div class="label-value">${relocatedBin || itemData?.binLocation || ''}</div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="label-footer">
                        <p class="label-disclaimer">All trademarks and logotypes appearing on this label are owned by Sandvik Group</p>
                        <div id="qrCodeContainer">
                            ${qrImage ? `<img src="${qrImage}" />` : ''}
                        </div>
                    </div>
                </div>
                <script>
                    window.onload = function() { setTimeout(function(){ window.print(); }, 200); }
                </script>
            </body>
            </html>
        `;

        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();
    };

    return (
        <>
            <div className="container-wrapper px-4 py-4">
                <form onSubmit={handleSaveLog}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">

                        {/* COLUMNA IZQUIERDA: FORMULARIO */}
                        <div className="lg:col-span-2 bg-white p-4 rounded shadow border border-gray-200">
                            {/* Header Form */}
                            <div className="bg-gray-50 text-gray-900 px-4 py-3 -mx-4 -mt-4 mb-4 rounded-t border-b border-gray-200 flex justify-between items-center">
                                <h1 className="text-base font-semibold tracking-tight">Inbound - Recepción</h1>
                                <div className="flex items-center gap-2">
                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase ${offline ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        <span className={`w-2 h-2 rounded-full ${offline ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                                        {offline ? 'Modo Offline' : 'Conectado'}
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={async () => {
                                            setIsSyncing(true);
                                            const ok = await downloadMasterData();
                                            if (ok) {
                                                alert('✅ Maestro sincronizado correctamente.');
                                            } else {
                                                alert('❌ Error al sincronizar. Revisa la consola.');
                                            }
                                            setIsSyncing(false);
                                        }}
                                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isSyncing ? 'animate-spin pointer-events-none' : ''}`}
                                        title="Forzar Sincronización de Maestro"
                                    >
                                        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Import Reference</label>
                                    <input type="text" value={importRef}
                                        onChange={e => setImportRef(e.target.value.toUpperCase())}
                                        onBlur={e => handleLookupReference('import_ref', e.target.value)}
                                        placeholder="I.R." required />
                                </div>
                                <div>
                                    <label className="form-label">Waybill</label>
                                    <input type="text" value={waybill}
                                        onChange={e => setWaybill(e.target.value.toUpperCase())}
                                        onBlur={e => handleLookupReference('waybill', e.target.value)}
                                        placeholder="W.B." required />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="form-label">Item Code</label>
                                    <div className="flex gap-2">
                                        <input type="text" ref={itemCodeRef} value={itemCode} onChange={e => setItemCode(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), findItem())}
                                            placeholder="Escanear o Escribir" required disabled={!!editId} />
                                        {!editId && (
                                            <>
                                                <button type="button" className="btn-sap btn-secondary" onClick={() => setScannerOpen(true)} title="Escanear">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                                                </button>
                                                <button type="button" className="btn-sap btn-secondary" onClick={findItem} disabled={loading}>
                                                    {loading ? '...' : '🔍'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="form-label">Item Description</label>
                                <div className="data-field">{itemData?.description || ''}</div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                                <div>
                                    <label className="form-label">Qty Received</label>
                                    <input type="number" ref={quantityRef} value={quantity} onChange={e => setQuantity(e.target.value)} required min="1" />

                                    {/* Sugerencia de Cross-Docking (Xdock) - Solo se muestra si hay saldo pendiente */}
                                    {itemData?.xdockPending > 0 && (
                                        <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 shadow-sm">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-bold uppercase text-red-700 tracking-tight">Cross-Docking (Xdock)</span>
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                    <span>Total Reservado:</span>
                                                    <span className="font-mono text-gray-700">{itemData.xdockTotal}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] uppercase font-bold">
                                                    <span className="text-red-600">Pendiente Separar:</span>
                                                    <span className="font-mono text-sm text-red-800">{itemData.xdockPending} UNIDADES</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="form-label">Bin (Original)</label>
                                    <div className="data-field">{itemData?.binLocation || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">Relocate (New)</label>
                                    <div className="flex flex-col gap-2">
                                        <input type="text" value={relocatedBin} onChange={e => setRelocatedBin(e.target.value.toUpperCase())} placeholder="(Opcional)" />

                                        {itemData?.suggestedBin && (
                                            <div
                                                className="bg-emerald-50 border border-emerald-200 rounded p-2 cursor-pointer hover:bg-emerald-100 transition-colors"
                                                onClick={() => setRelocatedBin(itemData.suggestedBin)}
                                                title="Haz clic para usar esta ubicación"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[10px] font-bold uppercase ${itemData?.is_ai_prediction ? 'text-blue-700' : 'text-emerald-700'}`}>
                                                        {itemData?.is_ai_prediction ? 'Predicción IA' : 'Sugerencia Slotting'}
                                                    </span>
                                                    <span className="text-[8px] italic text-gray-500">Tap para usar</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    <span className="text-sm font-mono font-bold text-gray-800">{itemData.suggestedBin}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="form-label">Aditional Bins</label>
                                    <div className="data-field text-xs">{itemData?.aditionalBins || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">ABC Type</label>
                                    <div className="data-field">{itemData?.itemType || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">SIC Code</label>
                                    <div className="data-field">{itemData?.sicCode || ''}</div>
                                </div>
                            </div>

                            {/* Resumen Cantidades (Proceso Ciego) */}
                            <div className="bg-gray-50 p-4 border border-gray-300 rounded mb-4">
                                <h3 className="text-xs font-bold uppercase text-gray-700 border-b-2 border-[#285f94] pb-1 mb-3">Resumen de Cantidades</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="form-label">Qty Received (Total)</label>
                                        <div className="data-field font-bold text-[#1e4a74]">{displayQty}</div>
                                    </div>
                                    <div>
                                        <label className="form-label">Contado</label>
                                        <div className="data-field font-bold text-gray-700">
                                            {auditCount} {auditCount === 1 ? 'vez' : 'veces'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button type="submit" className="btn-sap btn-primary w-60 h-10">
                                    {editId ? 'Guardar Cambios' : 'Añadir Registro'}
                                </button>
                                {editId && (
                                    <button type="button" onClick={resetForm} className="btn-sap btn-secondary w-60 h-10">
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: ETIQUETA (PREVIEW & PRINT) */}
                        <div className="lg:col-span-1">
                            <h2 className="text-lg font-semibold text-center mb-3">Vista Etiqueta</h2>

                            {/* Área de Impresión (clase label-print-area activada por CSS print) */}
                            {/* Área de Impresión (clase label-print-area activada por CSS print) */}
                            <div className="flex justify-center">
                                <div style={{
                                    width: '70mm',
                                    height: '100mm',
                                    padding: '3.5mm',
                                    boxSizing: 'border-box',
                                    background: 'white',
                                    border: '1px solid #ccc',
                                    fontFamily: 'Arial, sans-serif',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {/* Logo */}
                                    <img src="/static/images/logoytpe_sandvik.png" alt="Sandvik" style={{ height: '7mm', display: 'block', marginBottom: '3.5mm', flexShrink: 0, alignSelf: 'flex-start' }} />

                                    {/* Header */}
                                    <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.2, wordBreak: 'break-word' }}>{itemData?.itemCode || 'ITEM CODE'}</div>
                                    <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.2, wordBreak: 'break-word', flexGrow: 1, marginBottom: '2mm' }}>{itemData?.description || 'Description'}</div>

                                    {/* Data Table */}
                                    <div style={{ fontSize: '9pt', lineHeight: 1.4, flexShrink: 0 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Quantity/pack</div>
                                            <div>{quantity || 1} EA</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Product weight</div>
                                            <div>{totalWeight} kg</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Packaging date</div>
                                            <div>{new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Bin location</div>
                                            <div>{relocatedBin || itemData?.binLocation || ''}</div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2mm', flexShrink: 0 }}>
                                        <p style={{ fontSize: '7pt', margin: 0, maxWidth: '35mm', lineHeight: 1.1, color: '#000' }}>
                                            All trademarks and logotypes appearing on this label are owned by Sandvik Group
                                        </p>
                                        <div style={{ width: '25mm', height: '25mm', flexShrink: 0 }}>
                                            {qrImage ? <img src={qrImage} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div className="border border-gray-200 w-full h-full"></div>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full flex justify-center mt-4">
                                <button type="button" onClick={handlePrint} className="btn-sap btn-primary btn-print-label h-10" disabled={!itemData}>
                                    Imprimir Etiqueta
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                {/* TABLA DE REGISTROS */}
                <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden">
                    <div className="bg-gray-50 text-gray-900 px-4 py-3 border-b border-gray-200 flex flex-col md:flex-row justify-between items-center">
                        <h2 className="text-base font-semibold tracking-tight whitespace-nowrap mb-2 md:mb-0">Registros de Inbound</h2>
                        <div className="flex gap-2 items-center flex-wrap md:flex-nowrap justify-center md:justify-end">
                            <div className="relative w-full sm:w-72 flex-shrink-0">
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className="h-8 px-2 pr-7 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] focus:outline-none w-full transition-all duration-150"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                                        title="Borrar búsqueda"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <button onClick={() => window.location.href = currentVersion ? `/api/export_log?version_date=${currentVersion}` : '/api/export_log'} className="h-8 px-4 text-xs font-medium bg-emerald-600 text-white border border-emerald-700 rounded-md shadow-sm hover:bg-emerald-700 transition-all duration-150 flex items-center justify-center gap-1.5">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.914 2.914a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
                                Exportar
                            </button>
                            <select onChange={(e) => loadLogs(e.target.value)} className="h-8 w-44 px-3 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] transition-all duration-150 cursor-pointer">
                                <option value="">-- Versión Actual --</option>
                                {versions.map(v => (
                                    <option key={v} value={v}>Archivado: {formatDate(v)}</option>
                                ))}
                            </select>
                            <button onClick={handleArchive} className="h-8 px-4 text-xs font-medium bg-red-600 text-white border border-red-700 rounded-md shadow-sm hover:bg-red-700 transition-all duration-150 flex items-center justify-center">
                                Base Limpia
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead className="bg-slate-700 text-white">
                                <tr>
                                    <th className="px-2 py-1.5 text-left font-medium">Ref</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Waybill</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Item Code</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Descripción</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Bin (Orig)</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Bin (New)</th>
                                    <th className="px-2 py-1.5 text-center font-medium">Qty Rec</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Fecha/Hora</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Usuario</th>
                                    <th className="px-2 py-1.5 text-center font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredLogs.length === 0 ? (
                                    <tr><td colSpan="10" className="text-center py-4 text-gray-500">No hay registros</td></tr>
                                ) : filteredLogs.map((log, idx) => (
                                    <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors ${log.isPending ? 'border-l-4 border-amber-400' : ''}`}>
                                        <td className="px-2 py-1.5">{log.importReference}</td>
                                        <td className="px-2 py-1.5">{log.waybill}</td>
                                        <td className="px-2 py-1.5 font-mono">{log.itemCode}</td>
                                        <td className="px-2 py-1.5 max-w-[180px] truncate" title={log.itemDescription}>
                                            {log.isPending && <span className="inline-block w-2 h-2 bg-amber-500 rounded-full mr-1.5 animate-pulse" title="Pendiente de Sincronización"></span>}
                                            {log.itemDescription}
                                        </td>
                                        <td className="px-2 py-1.5">{log.binLocation}</td>
                                        <td className="px-2 py-1.5">{log.relocatedBin}</td>
                                        <td className="px-2 py-1.5 text-center">{log.qtyReceived}</td>
                                        <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                                        <td className="px-2 py-1.5 text-gray-600">{log.username?.toUpperCase()}</td>
                                        <td className="px-2 py-1.5">
                                            <div className="flex gap-1 justify-center">
                                                <button onClick={() => startEdit(log)} className="w-6 h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded flex items-center justify-center transition-colors" title="Editar">✎</button>
                                                <button onClick={() => handleDelete(log.id)} className="w-6 h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded flex items-center justify-center transition-colors" title="Eliminar">🗑</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Hidden Iframe for Printing Labels */}
            <iframe
                ref={printFrameRef}
                title="print-label-frame"
                style={{ position: 'fixed', top: '-1000px', left: '-1000px', width: '1px', height: '1px', border: 'none' }}
            />

            {/* Modal Scanner */}
            {/* Modal Scanner */}
            {scannerOpen && (
                <ScannerModal
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />
            )}
        </>
    );
};

export default Inbound;