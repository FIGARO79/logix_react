import React, { useState, useEffect, useRef } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import QRCode from 'qrcode';
import ScannerModal from '../components/ScannerModal';
import { getDB, savePendingSync, cacheData, getCachedData } from '../utils/offlineDb';

import { syncPendingInbound, checkAndSyncIfNeeded, downloadMasterData } from '../utils/syncManager';
import { useOffline } from '../hooks/useOffline';
import { sandvikLogoBase64 } from '../assets/logo';
import SandvikLabel from '../components/labels/SandvikLabel';
import { useReactToPrint } from 'react-to-print';
import '../styles/Label.css';


const Inbound = () => {
    const { setTitle } = useOutletContext();
    const { isOnline, pendingCount, syncPendingData } = useOffline();

    useEffect(() => { setTitle("Recepción"); }, [setTitle]);


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
        const [validBins, setValidBins] = useState(new Set());

    // --- Estados de UI ---
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasWarnedOffline, setHasWarnedOffline] = useState(false);
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
    const labelComponentRef = useRef(null);

    // --- Helpers de Sincronización ---
    const runAutoSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        const didSync = await checkAndSyncIfNeeded();
        setIsSyncing(false);
        if (didSync) {
            console.log("Logix: Sincronización automática detectó cambios. Refrescando datos...");
            // Recargar logs para actualizar la tabla de diferencias
            loadLogs();
            // Si ya hay un item cargado, refrescar su información (cantidades esperadas)
            if (itemData && itemCode) {
                findItem();
            }
        }
    };

    useEffect(() => {
        loadLogs();
        loadVersions();
        loadSlottingBins();

        // Check inicial
        runAutoSync();
        syncPendingInbound().then(() => loadLogs());

        // Intervalo de revisión cada 10 minutos
        const syncInterval = setInterval(() => {
            runAutoSync();
        }, 600000);

        const handleFocus = () => runAutoSync();
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(syncInterval);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const loadSlottingBins = async () => {
        try {
            const res = await fetch('/static/json/slotting_parameters.json');
            if (res.ok) {
                const data = await res.json();
                if (data.storage) {
                    setValidBins(new Set(Object.keys(data.storage).map(b => b.toUpperCase())));
                }
            }
        } catch (e) {
            console.error("Error loading slotting bins", e);
        }
    };

    // Filter logs based on search term
    const filteredLogs = logs.filter(log =>
        (log.itemCode && log.itemCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.waybill && log.waybill.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.importReference && log.importReference.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.itemDescription && log.itemDescription.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Generar QR para la etiqueta cuando cambia el item o el código
    useEffect(() => {
        const activeCode = itemData?.itemCode || itemCode;
        if (activeCode) {
            QRCode.toDataURL(activeCode, { width: 256, margin: 0 })
                .then(url => setQrImage(url))
                .catch(err => console.error(err));
        } else {
            setQrImage(null);
        }
    }, [itemData, itemCode]);

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
                // Guardar en caché para acceso offline posterior
                if (!version || version === '') {
                    await cacheData('inbound_logs', apiLogs);
                }
            } else {
                console.error("Failed to load logs:", res.status, res.statusText);
                if (res.status === 401) window.location.href = '/login';
            }
        } catch (e) {
            console.error("Error loading logs from API", e);
            // Intentar cargar desde caché si estamos offline o la API falla
            if (!version || version === '') {
                apiLogs = await getCachedData('inbound_logs') || [];
                console.log("Cargado desde caché local:", apiLogs.length, "registros");
            }
        }

        // Cargar logs pendientes de IndexedDB
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

        // Deduplicación estricta usando Map por UUID (client_id)
        // El Map garantiza que solo exista una entrada por UUID, priorizando la del servidor
        const logMap = new Map();

        // 1. Primero los pendientes locales (prioridad más baja)
        pendingLogs.forEach(log => {
            const key = log.id; // UUID generado por crypto.randomUUID()
            logMap.set(key, log);
        });

        // 2. Después los del servidor (sobrescriben cualquier pendiente con el mismo client_id)
        apiLogs.forEach(log => {
            const key = log.client_id || `server_${log.id}`; // Priorizar client_id UUID
            logMap.set(key, log);
        });

        // 3. Ordenar por fecha (más reciente primero)
        const allLogsSorted = Array.from(logMap.values()).sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            if (timeB !== timeA) return timeB - timeA;
            return (b.id || 0) - (a.id || 0); // Desempate determinista por ID
        });

        const uniqueItems = [...new Set(allLogsSorted.map(l => l.itemCode))];

        const grnMap = {};
        try {
            const db = await getDB();
            for (const itemCode of uniqueItems) {
                const grnInfo = await db.get('grn_pending', itemCode);
                grnMap[itemCode] = grnInfo ? grnInfo.total_expected : 0;
            }
        } catch (e) { console.error("Error loading GRN info", e); }

        // Calcular total recibido por ítem y encontrar la última entrada (por timestamp) para cada uno
        const totalsMap = {};
        const latestEntryMap = {}; // Guarda ID del primer log encontrado para cada itemCode (ya ordenados)

        allLogsSorted.forEach(log => {
            const code = log.itemCode;
            // Asegurar que usamos qtyReceived del payload o campo directo
            const qty = parseInt(log.qtyReceived) || parseInt(log.quantity) || 0;
            totalsMap[code] = (totalsMap[code] || 0) + qty;

            if (!latestEntryMap[code]) {
                latestEntryMap[code] = log.id;
            }
        });

        // Agregar información de esperado y diferencia (solo en el primer registro de la lista para cada ítem)
        const logsWithGRN = allLogsSorted.map(log => {
            const expected = grnMap[log.itemCode] || 0;
            const totalReceived = totalsMap[log.itemCode] || 0;
            const isLatest = latestEntryMap[log.itemCode] === log.id;


            return {
                ...log,
                expected_qty: expected,
                difference: isLatest ? (totalReceived - expected) : 0
            };
        });

        setLogs(logsWithGRN);
    };

    const loadVersions = async () => {
        try {
            const res = await fetch('/api/logs/versions', { credentials: 'include' });
            if (res.ok) setVersions(await res.json());
        } catch (e) { console.error(e); }
    };

    const handleLookupReference = async (type, value) => {
        if (!value) return;
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
                        onlineDataFound = true;
                        return;
                    }
                }
            } catch (e) { console.error("Error lookup", e); }
        }

        if (!onlineDataFound) {
            try {
                const db = await getDB();
                const id = type === 'waybill' ? `wb_${normalizedValue}` : `ir_${normalizedValue}`;
                const match = await db.get('po_lookup', id);
                if (match) {
                    if (type === 'waybill' && match.import_ref) setImportRef(match.import_ref);
                    else if (type === 'import_ref' && match.waybill) setWaybill(match.waybill);
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

        let onlineFound = false;
        if (navigator.onLine) {
            try {
                const res = await fetch(`/api/find_item/${encodeURIComponent(normalizedCode)}/${encodeURIComponent(importRef)}`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setItemData(data);
                    if (!editId) {
                        setQuantity('');
                        // El binLocation ya viene actualizado del backend (effective_bin_location)
                        setRelocatedBin(''); 
                    }
                    quantityRef.current?.focus();
                    setLoading(false);
                    onlineFound = true;
                    return;
                }
            } catch (e) { console.error("Error finding item online", e); }
        }

        if (!onlineFound) {
            try {
                const db = await getDB();
                const localItem = await db.get('master_items', normalizedCode);
                if (localItem) {
                    const grnInfo = await db.get('grn_pending', normalizedCode);
                    const xdockInfo = await db.get('xdock_reservations', normalizedCode);

                    // Buscar si ya hay reubicaciones de este ítem en la cola local
                    const pendingLogs = await db.getAll('pending_sync');
                    const recentRelocation = pendingLogs
                        .filter(l => l.payload.itemCode === normalizedCode && l.payload.relocatedBin)
                        .pop();

                    // Calcular remanente XDOCK localmente 
                    const itemLogs = logs.filter(l => l.itemCode === normalizedCode);
                    const localCumulative = itemLogs.reduce((acc, curr) => acc + (parseInt(curr.qtyReceived) || 0), 0);
                    const totalRes = xdockInfo ? xdockInfo.total : 0;
                    const xdockRemanente = Math.max(0, totalRes - localCumulative);

                    let offlineSuggestedBin = null;
                    if (recentRelocation) {
                        offlineSuggestedBin = recentRelocation.payload.relocatedBin;
                    } else {
                        offlineSuggestedBin = localItem.Bin_1;
                    }

                    setItemData({
                        itemCode: localItem.Item_Code,
                        description: localItem.Item_Description,
                        binLocation: localItem.Bin_1,
                        weight: localItem.Weight_per_Unit,
                        itemType: localItem.ABC_Code_stockroom,
                        sicCode: localItem.SIC_Code_stockroom,
                        defaultQtyGrn: grnInfo ? grnInfo.total_expected : 0,
                        xdockTotal: totalRes,
                        xdockPending: xdockRemanente,
                        xdockCustomers: xdockInfo ? xdockInfo.customers : [],
                        is_offline_result: true,
                        suggestedBin: offlineSuggestedBin
                    });
                    if (!editId) {
                        setQuantity('');
                        // En offline mantenemos el comportamiento anterior
                        setRelocatedBin('');
                    }
                    quantityRef.current?.focus();
                } else {
                    alert("Item no encontrado en el maestro local.");
                    setItemData(null);
                }
            } catch (e) {
                console.error("Offline lookup error", e);
                alert("Error al buscar el ítem localmente.");
            }
            finally { setLoading(false); }
        }
    };

    const handleSaveLog = async (e) => {
        e.preventDefault();
        if (!itemData) return alert("Busque un item primero");

        // Validación de Ubicación (Slotting)
        if (relocatedBin.trim()) {
            const normalizedBin = relocatedBin.trim().toUpperCase();
            if (validBins.size > 0 && normalizedBin !== 'XDOCK' && !validBins.has(normalizedBin)) {
                alert(`La ubicación "${normalizedBin}" no existe.`);
                return;
            }
        }

        if (isSaving) return; // Bloquear doble clic
        setIsSaving(true);

        const targetClientId = (typeof editId === 'string' && editId.includes('-')) ? editId : crypto.randomUUID();
        const payload = {
            importReference: importRef.trim().toUpperCase(),
            waybill: waybill.trim().toUpperCase(),
            itemCode: itemData.itemCode,
            itemDescription: itemData.description,
            quantity: parseInt(quantity),
            qtyReceived: parseInt(quantity),
            relocatedBin: relocatedBin.trim().toUpperCase(),
            binLocation: itemData.binLocation,
            qtyGrn: itemData.defaultQtyGrn,
            client_id: targetClientId,
            timestamp: new Date().toISOString()
        };

        try {
            if (navigator.onLine) {
                try {
                    let res;
                    if (editId) {
                        if (typeof editId === 'string' && editId.includes('-')) {
                            await savePendingSync('inbound', payload, editId);
                            loadLogs(); resetForm(); return;
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
                    if (res.ok) { loadLogs(); resetForm(); return; }
                } catch (e) { console.error("Connection error, falling back to offline save", e); }
            }

            // Guardar offline
            await savePendingSync('inbound', payload, typeof editId === 'number' ? editId : null);
            if (!hasWarnedOffline) {
                alert("Guardado localmente (Offline).");
                setHasWarnedOffline(true);
            }
            loadLogs(); resetForm();
        } catch (e) {
            alert("Error al guardar");
        } finally {
            setIsSaving(false); // Siempre liberar el bloqueo
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Eliminar registro?")) return;
        if (typeof id === 'string' && id.includes('-')) {
            try {
                const db = await getDB();
                await db.delete('pending_sync', id);
                loadLogs(); return;
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
            loadLogs(); loadVersions();
        } catch (e) { alert("Error"); }
    };

    const resetForm = () => {
        setEditId(null); setItemCode(''); setQuantity(''); setRelocatedBin(''); setItemData(null);
        setTimeout(() => itemCodeRef.current?.focus(), 300);
    };

    const startEdit = (log) => {
        setEditId(log.id);
        setImportRef(log.importReference ? log.importReference.trim() : '');
        setWaybill(log.waybill ? log.waybill.trim() : '');
        setItemCode(log.itemCode);
        setQuantity(log.qtyReceived);
        setRelocatedBin(log.relocatedBin ? log.relocatedBin.trim() : '');
        fetch(`/api/find_item/${encodeURIComponent(log.itemCode)}/${encodeURIComponent(log.importReference)}`)
            .then(r => r.json()).then(data => setItemData(data));
    };

    const handleScan = (code) => {
        const upperCode = code.toUpperCase();
        setItemCode(upperCode);
        setScannerOpen(false);
        setTimeout(() => { setItemCode(upperCode); findItem(); }, 200);
    };

    const itemLogs = logs.filter(l => l.itemCode === itemData?.itemCode);
    const cumulativeQty = itemLogs.reduce((acc, curr) => acc + (parseInt(curr.qtyReceived) || 0), 0);
    const auditCount = itemLogs.length;
    const currentQtyNum = parseInt(quantity) || 0;
    const displayQty = (cumulativeQty + currentQtyNum);
    const itemWeight = parseFloat(itemData?.weight || 0);
    const totalWeight = isNaN(itemWeight) || isNaN(currentQtyNum) ? '0.00' : (itemWeight * (currentQtyNum || 1)).toFixed(2);

    // Cálculo dinámico de Xdock pendiente basado en lo que ya se ha registrado en la tabla
    const effectiveXdockPending = Math.max(0, (itemData?.xdockTotal || 0) - cumulativeQty);

    const handlePrint = useReactToPrint({
        contentRef: labelComponentRef,
        documentTitle: itemData ? `Etiqueta-${itemData.itemCode}` : 'Etiqueta',
        pageStyle: "@page { size: 70mm 100mm; margin: 0; } @media print { body { -webkit-print-color-adjust: exact; } }",
    });

    return (
        <>
            <div className="container-wrapper px-4 pt-2 pb-4 lg:h-[calc(100vh-5px)] lg:flex lg:flex-col lg:overflow-hidden">
                <form onSubmit={handleSaveLog} className="lg:flex-shrink-0 mb-1">

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-2">
                        <div className="lg:col-span-2 bg-white p-2 rounded shadow border border-gray-200">
                            <div className="bg-white text-gray-900 px-2 py-0 -mx-2 -mt-2 mb-2 rounded-t border-b border-gray-100 flex justify-between items-center">
                                <h1 className="text-base font-normal tracking-tight">Inbound - Recepción</h1>
                                <div className="flex items-center gap-2">
                                    {pendingCount > 0 && (
                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-md text-[10px] font-medium animate-pulse cursor-pointer" onClick={syncPendingData} title="Sincronizar pendientes ahora">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            {pendingCount} Pendientes
                                        </div>
                                    )}
                                    <button type="button" onClick={async () => { setIsSyncing(true); const ok = await downloadMasterData(); alert(ok ? '✅ Maestro sincronizado.' : '❌ Error.'); setIsSyncing(false); }} className={`p-1.5 rounded hover:bg-gray-200 ${isSyncing ? 'animate-spin' : ''}`} title="Sincronizar Maestro">
                                        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Import Reference</label>
                                    <input type="text" value={importRef} onChange={e => setImportRef(e.target.value.toUpperCase())} onBlur={e => handleLookupReference('import_ref', e.target.value)} placeholder="I.R." required />
                                </div>
                                <div>
                                    <label className="form-label">Waybill</label>
                                    <input type="text" value={waybill} onChange={e => setWaybill(e.target.value.toUpperCase())} onBlur={e => handleLookupReference('waybill', e.target.value)} placeholder="W.B." required />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="form-label">Item Code</label>
                                    <div className="flex gap-2">
                                        <input type="text" ref={itemCodeRef} value={itemCode} onChange={e => setItemCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), findItem())} placeholder="Escanear o Escribir" required disabled={!!editId} />
                                        <button type="button" className="btn-sap btn-secondary" onClick={findItem} disabled={loading}>
                                            {loading ? '...' : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                                                </svg>
                                            )}
                                        </button>
                                        {!editId && (
                                            <button type="button" className="btn-sap btn-secondary p-0 flex items-center justify-center" onClick={() => setScannerOpen(true)} title="Escanear">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 26 26" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4"><label className="form-label">Item Description</label><div className="data-field">{itemData?.description || ''}</div></div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                                <div><label className="form-label">Qty Received</label><input type="number" ref={quantityRef} value={quantity} onChange={e => setQuantity(e.target.value)} required min="1" /></div>
                                <div><label className="form-label">Bin (Original)</label><div className="data-field">{itemData?.binLocation || ''}</div></div>
                                <div><label className="form-label">Relocate (New)</label><input type="text" value={relocatedBin} onChange={e => setRelocatedBin(e.target.value.toUpperCase())} placeholder="(Opcional)" /></div>

                                {(effectiveXdockPending > 0 || itemData?.suggestedBin) && (
                                    <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                                        {effectiveXdockPending > 0 ? (
                                            <div className="bg-gray-50 border border-red-200 rounded p-2 shadow-sm">
                                                <h4 className="text-[10px] font-normal uppercase text-red-600 mb-1 border-b border-red-100 pb-0.5">XDOCK</h4>
                                                <div className="flex flex-col gap-0.5 text-black">
                                                    <div className="flex justify-between items-center text-[9px] uppercase font-normal"><span>Total Reservado:</span><span>{itemData.xdockTotal}</span></div>
                                                    <div className="flex justify-between items-center text-[9px] uppercase font-normal text-red-600"><span>Pendiente:</span><span>{effectiveXdockPending} UN</span></div>
                                                </div>
                                            </div>
                                        ) : <div className="hidden sm:block"></div>}

                                        {effectiveXdockPending > 0 && itemData?.xdockCustomers?.length > 0 ? (
                                            <div className="bg-gray-50 border border-red-200 rounded p-2 shadow-sm overflow-hidden">
                                                <h4 className="text-[10px] font-normal uppercase text-red-600 mb-1 border-b border-red-100 pb-0.5">RESERVAS:</h4>
                                                <div className="max-h-24 overflow-y-auto space-y-0.5 pr-1">
                                                    {itemData.xdockCustomers.map((c, idx) => (
                                                        <div key={idx} className="flex justify-between items-baseline text-[10px] border-b border-red-50 last:border-0 pb-0.5">
                                                            <div className="pr-2 text-black uppercase truncate"><span className="text-[9px]">{c?.name || 'SIN NOMBRE'}</span></div>
                                                            <span className="text-red-600 whitespace-nowrap">{c?.qty || 0} UN</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (effectiveXdockPending > 0 ? <div className="bg-gray-50 border border-red-200 rounded p-2 text-[10px] text-gray-400 italic flex items-center justify-center">Sin detalles</div> : <div className="hidden sm:block"></div>)}

                                        {itemData?.suggestedBin ? (
                                            <div className={`rounded p-2 shadow-sm cursor-pointer border ${(!itemData.binLocation || itemData.binLocation === 'N/A') && effectiveXdockPending > 0 ? 'bg-amber-50 border-amber-300 hover:bg-amber-100' : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'}`} onClick={() => setRelocatedBin(itemData.suggestedBin)}>
                                                <div className="flex justify-between border-b border-opacity-20 pb-0.5 mb-1">
                                                    <span className="text-[10px] font-bold uppercase">
                                                        {(!itemData.binLocation || itemData.binLocation === 'N/A') && effectiveXdockPending > 0 ? 'UBICACIÓN + XDOCK' : 'Sugerida'}
                                                    </span>
                                                    <span className="text-[8px] italic text-gray-500">Tap usar</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <svg className={`w-4 h-4 ${(!itemData.binLocation || itemData.binLocation === 'N/A') && effectiveXdockPending > 0 ? 'text-amber-600' : 'text-emerald-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                        <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    <span className="text-sm font-mono font-bold text-gray-800">{itemData.suggestedBin}</span>
                                                    {(!itemData.binLocation || itemData.binLocation === 'N/A') && effectiveXdockPending > 0 && (
                                                        <span className="ml-auto text-[10px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded">XDOCK</span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : <div className="hidden sm:block"></div>}
                                    </div>
                                )}
                                <div><label className="form-label">Aditional Bins</label><div className="data-field text-xs">{itemData?.aditionalBins || ''}</div></div>
                                <div><label className="form-label">ABC Type</label><div className="data-field">{itemData?.itemType || ''}</div></div>
                                <div><label className="form-label">SIC Code</label><div className="data-field">{itemData?.sicCode || ''}</div></div>
                            </div>

                            <div className="bg-gray-50 p-4 border border-gray-300 rounded mb-4">
                                <h3 className="text-xs font-medium uppercase text-gray-700 border-b-2 border-[#285f94] pb-1 mb-3">Resumen</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div><label className="form-label">Total Recibido</label><div className="data-field font-bold text-[#1e4a74]">{cumulativeQty}</div></div>
                                    <div><label className="form-label">Esperado</label><div className="data-field font-bold text-gray-700">{itemData?.defaultQtyGrn || 0}</div></div>
                                    <div><label className="form-label">Diferencia</label><div className={`data-field font-bold ${(cumulativeQty - (itemData?.defaultQtyGrn || 0)) > 0 ? 'text-blue-600' :
                                        (cumulativeQty - (itemData?.defaultQtyGrn || 0)) < 0 ? 'text-red-600' : 'text-gray-900'
                                        }`}>{cumulativeQty - (itemData?.defaultQtyGrn || 0)}</div></div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className={`h-9 px-6 text-[10px] text-white rounded-lg shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95 transition-all ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    style={{ background: '#285f94' }}
                                    onMouseEnter={e => !isSaving && (e.currentTarget.style.background='#1e4a74')}
                                    onMouseLeave={e => !isSaving && (e.currentTarget.style.background='#285f94')}
                                >
                                    {isSaving ? (
                                        <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> Guardando...</>
                                    ) : (
                                        editId ? 'Guardar Cambios' : 'Añadir Registro'
                                    )}
                                </button>
                                {editId && (
                                    <button 
                                        type="button" 
                                        onClick={resetForm} 
                                        className="h-9 px-6 text-[10px] text-zinc-700 bg-white border border-zinc-200 rounded-lg shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95 transition-all hover:bg-zinc-50"
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>

                        </div>

                        <div className="lg:col-span-1">
                            <h2 className="text-lg font-semibold text-center mb-3">Vista Etiqueta</h2>
                            <div className="flex justify-center">
                                <div ref={labelComponentRef} className="bg-white">
                                    <SandvikLabel 
                                        data={itemData} 
                                        qrImage={qrImage} 
                                        quantity={quantity} 
                                        relocatedBin={relocatedBin} 
                                        totalWeight={totalWeight} 
                                    />
                                </div>
                            </div>
                            <div className="w-full flex justify-center mt-4">
                                <button 
                                    type="button" 
                                    onClick={handlePrint} 
                                    className="h-9 px-8 text-[10px] text-white rounded-lg shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ background: '#285f94' }}
                                    onMouseEnter={e => !(!itemData) && (e.currentTarget.style.background='#1e4a74')}
                                    onMouseLeave={e => !(!itemData) && (e.currentTarget.style.background='#285f94')}
                                    disabled={!itemData}
                                >
                                    Imprimir
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden lg:flex-grow lg:flex lg:flex-col lg:min-h-0">
                    <div className="bg-zinc-50/50 px-4 py-3 border-b border-zinc-100 flex flex-col md:flex-row justify-between items-center lg:flex-shrink-0 gap-3">
                        <h2 className="text-base font-normal tracking-tight">Registros</h2>
                        <div className="flex flex-wrap gap-2 items-center justify-end">
                            <div className="relative w-full sm:w-64">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center text-zinc-400 z-10">
                                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input 
                                    type="text" 
                                    placeholder="BUSCAR..." 
                                    className="w-full h-9 text-[10px] bg-white border border-zinc-200 rounded-lg outline-none text-black uppercase tracking-wider focus:border-zinc-400 transition-all" 
                                    style={{ paddingLeft: '32px', paddingRight: searchTerm ? '30px' : '12px' }}
                                    value={searchTerm} 
                                    onChange={(e) => setSearchTerm(e.target.value)} 
                                />
                                {searchTerm && (
                                    <button 
                                        type="button" 
                                        onClick={() => setSearchTerm('')} 
                                        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all z-20 text-[11px] font-bold"
                                        title="Limpiar búsqueda"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            
                            <select 
                                onChange={(e) => loadLogs(e.target.value)} 
                                className="h-9 px-3 text-[9px] text-black bg-white border border-zinc-200 rounded-lg outline-none cursor-pointer uppercase w-full sm:w-40 focus:border-zinc-400 transition-all"
                            >
                                <option value="">ACTUAL</option>
                                {versions.map(v => <option key={v} value={v}>{formatDate(v, false)}</option>)}
                            </select>

                            <button 
                                onClick={() => {
                                    const offset = new Date().getTimezoneOffset();
                                    const baseUrl = currentVersion ? `/api/export_log?version_date=${currentVersion}` : '/api/export_log';
                                    window.location.href = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}timezone_offset=${offset}`;
                                }} 
                                className="h-9 px-4 text-[9px] text-white rounded-lg shadow-sm flex items-center gap-1.5 uppercase tracking-widest active:scale-95 transition-all whitespace-nowrap"
                                style={{ background: '#285f94' }}
                                onMouseEnter={e => e.currentTarget.style.background='#1e4a74'}
                                onMouseLeave={e => e.currentTarget.style.background='#285f94'}
                            >
                                Exportar
                            </button>
                            
                            <button 
                                onClick={handleArchive} 
                                className="h-9 px-4 text-[9px] text-white rounded-lg shadow-sm flex items-center gap-1.5 uppercase tracking-widest active:scale-95 transition-all whitespace-nowrap"
                                style={{ background: '#285f94' }}
                                onMouseEnter={e => e.currentTarget.style.background='#1e4a74'}
                                onMouseLeave={e => e.currentTarget.style.background='#285f94'}
                            >
                                Archivar
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto lg:flex-grow lg:overflow-y-auto min-h-0">
                        <table className="w-full text-xs border-collapse">
                            <thead className="sticky top-0 z-20">
                                <tr style={{ background: '#354a5f' }} className="text-white">
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Ref</th>
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Waybill</th>
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Item</th>
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Desc</th>
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Orig</th>
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">New</th>
                                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Qty</th>
                                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Esp.</th>
                                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Dif.</th>
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Fecha</th>
                                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">User</th>
                                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Acc</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-200">
                                {filteredLogs.length === 0 ? <tr><td colSpan="12" className="text-center py-4">No hay registros</td></tr> : filteredLogs.map((log, idx) => (
                                    <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 ${log.isPending ? 'border-l-4 border-amber-400' : ''}`}>
                                        <td className="px-2 py-0.5">{log.importReference}</td><td className="px-2 py-0.5">{log.waybill}</td><td className="px-2 py-0.5 font-mono">{log.itemCode}</td><td className="px-2 py-0.5 truncate max-w-[180px]">{log.itemDescription}</td><td className="px-2 py-0.5">{log.binLocation}</td><td className="px-2 py-0.5">{log.relocatedBin}</td><td className="px-2 py-0.5 text-center">{log.qtyReceived}</td><td className="px-2 py-0.5 text-center">{log.expected_qty || 0}</td><td className={`px-2 py-0.5 text-center font-semibold ${(log.difference || 0) > 0 ? 'text-blue-600' :
                                            (log.difference || 0) < 0 ? 'text-red-600' : 'text-gray-900'
                                            }`}>{log.difference || 0}</td><td className="px-2 py-0.5 whitespace-nowrap">{formatDate(log.timestamp)}</td><td className="px-2 py-0.5 uppercase">{log.username}</td>
                                        <td className="px-2 py-0.5">
                                            <div className="flex gap-1 justify-center">
                                                <button onClick={() => startEdit(log)} className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                                                    </svg>
                                                </button>
                                                <button onClick={() => handleDelete(log.id)} className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors" title="Eliminar">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
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
            </div>
            {scannerOpen && <ScannerModal onScan={handleScan} onClose={() => setScannerOpen(false)} />}
        </>
    );
};

export default Inbound;
