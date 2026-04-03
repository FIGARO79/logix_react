import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import ScannerModal from '../components/ScannerModal';
import { getDB } from '../utils/offlineDb';
import { syncPendingInbound, checkAndSyncIfNeeded, downloadMasterData } from '../utils/syncManager';
import { useOffline } from '../hooks/useOffline';
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

    // --- Estados de UI ---
    const [loading, setLoading] = useState(false);
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
    const printFrameRef = useRef(null);

    // --- Helpers de Sincronización ---
    const runAutoSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        await checkAndSyncIfNeeded();
        setIsSyncing(false);
    };

    useEffect(() => {
        loadLogs();
        loadVersions();

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
            } else {
                console.error("Failed to load logs:", res.status, res.statusText);
                if (res.status === 401) window.location.href = '/login';
            }
        } catch (e) { console.error("Error loading logs from API", e); }

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

        // Cargar GRN info para cada item único
        const allLogs = [...pendingLogs, ...apiLogs];
        const uniqueItems = [...new Set(allLogs.map(l => l.itemCode))];
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
        const latestEntryMap = {}; // Guarda {id, ts} por cada itemCode

        allLogs.forEach(log => {
            const code = log.itemCode;
            totalsMap[code] = (totalsMap[code] || 0) + (parseInt(log.qtyReceived) || 0);

            const ts = new Date(log.timestamp).getTime();
            // Identificamos el log más reciente basándonos en el timestamp
            if (!latestEntryMap[code] || ts > latestEntryMap[code].ts) {
                latestEntryMap[code] = { id: log.id, ts: ts };
            }
        });

        // Agregar información de esperado y diferencia (solo en la última entrada)
        const logsWithGRN = allLogs.map(log => {
            const expected = grnMap[log.itemCode] || 0;
            const totalReceived = totalsMap[log.itemCode] || 0;
            const isLatest = latestEntryMap[log.itemCode]?.id === log.id;

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
                    if (!editId) setQuantity('');
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
                    if (xdockRemanente > 0) {
                        offlineSuggestedBin = 'XDOCK';
                    } else if (recentRelocation) {
                        offlineSuggestedBin = recentRelocation.payload.relocatedBin;
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
                    if (!editId) setQuantity('');
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

        const targetClientId = (typeof editId === 'string' && editId.includes('-')) ? editId : crypto.randomUUID();
        const payload = {
            importReference: importRef.trim().toUpperCase(),
            waybill: waybill.trim().toUpperCase(),
            itemCode: itemData.itemCode,
            itemDescription: itemData.description,
            quantity: parseInt(quantity),
            relocatedBin: relocatedBin.trim().toUpperCase(),
            client_id: targetClientId
        };

        if (navigator.onLine) {
            try {
                let res;
                if (editId) {
                    if (typeof editId === 'string' && editId.includes('-')) {
                        const db = await getDB();
                        await db.put('pending_sync', { id: editId, payload, timestamp: new Date().toISOString() });
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

        try {
            const db = await getDB();
            await db.put('pending_sync', {
                id: payload.client_id,
                payload,
                timestamp: new Date().toISOString(),
                editId: typeof editId === 'number' ? editId : null
            });
            if (!hasWarnedOffline) {
                alert("Guardado localmente (Offline).");
                setHasWarnedOffline(true);
            }
            loadLogs(); resetForm();
        } catch (e) { alert("Error al guardar localmente"); }
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

    const handlePrint = () => {
        const frame = printFrameRef.current;
        if (!frame) return alert("Error: No se encontró el marco de impresión.");
        
        // Logo Sandvik en Base64 para soporte offline total
        const sandvikLogoBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABJgAAADUCAYAAADQgZm0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAK92lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDMgNzkuOTY5MGE4N2ZjLCAyMDI1LzAzLzA2LTIwOjUwOjE2ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtbG5zOnRpZmY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vdGlmZi8xLjAvIiB4bWxuczpleGlmPSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wLyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgV2ViICgyMDI1LjguMS4wIDMxNmYxNGNmYzhjKSAoR29vZ2xlIENocm9tZSkiIHhtcDpDcmVhdGVEYXRlPSIyMDI1LTA1LTAxVDIwOjQ5OjQ0LTA1OjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyNS0wNS0wMVQyMDo1MjowOS0wNTowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyNS0wNS0wMVQyMDo1MjowOS0wNTowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NzdhYjJmMjEtNWQ0Yi00Nzk0LWJkOWYtMzE3ZjY4ZWVkOTI3IiB4bXBNTTpEb2N1bWVudElEPSJhZG9iZTpkb2NpZDpwaG90b3Nob3A6ZDQ0OWIzM2ItNjM1Zi05OTRmLTg4YTAtYjIyYTgxZWViNWZhIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6NzFiYjdjNmQtNzhmNy00ZmIxLWI3NzktOTdlYzUyMDRhNjUxIiB0aWZmOk9yaWVudGF0aW9uPSIxIiB0aWZmOlhSZXNvbHV0aW9uPSI5NjAwMDAvMTAwMDAiIHRpZmY6WVJlc29sdXRpb249Ijk2MDAwMC8xMDAwMCIgdGlmZjpSZXNvbHV0aW9uVW5pdD0iMiIgZXhpZjpDb2xvclNwYWNlPSI2NTUzNSIgZXhpZjpQaXhlbFhEaW1lbnNpb249IjExNzYiIGV4aWY6UGl4ZWxZRGltZW5zaW9uPSIyMTIiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjcxYmI3YzZkLTc4ZjctNGZiMS1iNzc5LTk3ZWM1MjA0YTY1MSIgc3RFdnQ6d2hlbj0iMjAyNS0wNS0wMVQyMDo0OTo0NC0wNTowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIFdlYiAoMjAyNS44LjEuMCAzMTZmMTRjZmM4YykgKEdvb2dsZSBDaHJvbWUpIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo2NzczNjhjOC04N2VjLTQzYTYtOWRlMS00MDk3MzZiMjhmNzAiIHN0RXZ0OndoZW49IjIwMjUtMDUtMDFUMjA6NTE6MzYtMDU6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBXZWIgKDIwMjUuOC4xLjAgMzE2ZjE0Y2ZjOGMpIChHb29nbGUgQ2hyb21lKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6MzZiZjQxNWYtZjlkMi00MWI4LWE4OWMtZmEwMDIzMmQyOTM4IiBzdEV2dDp3aGVuPSIyMDI1LTA1LTAxVDIwOjUyOjA5LTA1OjAwIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgV2ViICgyMDI1LjguMS4wIDMxNmYxNGNmYzhjKSAoR29vZ2xlIENocm9tZSkiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPHJkZjpsaSBzdEV2dDphY3Rpb249ImNvbnZlcnRlZCIgc3RFdnQ6cGFyYW1ldGVycz0iZnJvbSBkb2N1bWVudC92bmQuYWRvYmUuY3BzZCtkY3ggdG8gaW1hZ2UvcG5nIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJkZXJpdmVkIiBzdEV2dDpwYXJhbWV0ZXJzPSJjb252ZXJ0ZWQgZnJvbSBkb2N1bWVudC92bmQuYWRvYmUuY3BzZCtkY3ggdG8gaW1hZ2UvcG5nIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo3N2FiMmYyMS01ZDRiLTQ3OTQtYmQ5Zi0zMTdmNjhlZWQ5MjciIHN0RXZ0OndoZW49IjIwMjUtMDUtMDFUMjA6NTI6MDktMDU6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBXZWIgKDIwMjUuOC4xLjAgMzE2ZjE0Y2ZjOGMpIChHb29nbGUgQ2hyb21lKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6MzZiZjQxNWYtZjlkMi00MWI4LWE4OWMtZmEwMDIzMmQyOTM4IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjcxYmI3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";

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
                        margin-bottom: 2mm;
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
                        flex-grow: 1;
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
                    <img src="${sandvikLogoBase64}" alt="Sandvik" class="label-logo" />
                    
                    <!-- Header -->
                    <div class="label-item-code">${itemData?.itemCode || ''}</div>
                    <div class="label-item-description">${itemData?.description || ''}</div>

                    <div style="flex-grow: 1;"></div>
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
        const doc = frame.contentWindow.document; doc.open(); doc.write(htmlContent); doc.close();
    };

    return (
        <>
            <div className="container-wrapper px-4 pt-2 pb-4">
                <form onSubmit={handleSaveLog}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-2">
                        <div className="lg:col-span-2 bg-white p-2 rounded shadow border border-gray-200">
                            <div className="bg-white text-gray-900 px-2 py-3 -mx-2 -mt-2 mb-2 rounded-t border-b border-gray-100 flex justify-between items-center">
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
                                        {!editId && (
                                            <>
                                                <button type="button" className="btn-sap btn-secondary" onClick={() => setScannerOpen(true)} title="Escanear">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                                                </button>
                                                <button type="button" className="btn-sap btn-secondary" onClick={findItem} disabled={loading}>{loading ? '...' : '🔍'}</button>
                                            </>
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
                                            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 shadow-sm cursor-pointer hover:bg-emerald-100" onClick={() => setRelocatedBin(itemData.suggestedBin)}>
                                                <div className="flex justify-between border-b border-emerald-100 pb-0.5 mb-1"><span className="text-[10px] font-normal uppercase text-emerald-700">Sugerida</span><span className="text-[8px] italic text-gray-500">Tap usar</span></div>
                                                <div className="flex items-center gap-2"><svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg><span className="text-sm font-mono font-bold text-gray-800">{itemData.suggestedBin}</span></div>
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
                            <div className="flex gap-3"><button type="submit" className="btn-sap btn-primary w-60 h-10">{editId ? 'Guardar Cambios' : 'Añadir Registro'}</button> {editId && <button type="button" onClick={resetForm} className="btn-sap btn-secondary w-60 h-10">Cancelar</button>}</div>
                        </div>

                        <div className="lg:col-span-1">
                            <h2 className="text-lg font-semibold text-center mb-3">Vista Etiqueta</h2>
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
                                    <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.2, wordBreak: 'break-word', color: '#000' }}>{itemData?.itemCode || 'ITEM CODE'}</div>
                                    <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.1, wordBreak: 'break-word', marginBottom: '2mm', color: '#000' }}>{itemData?.description || 'Description'}</div>

                                    <div style={{ flexGrow: 1 }}></div>

                                    {/* Data Table */}
                                    <div style={{ fontSize: '9pt', lineHeight: 1.4, flexShrink: 0, color: '#000' }}>
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2mm', flexShrink: 0, flexGrow: 1 }}>
                                        <p style={{ fontSize: '7pt', margin: 0, maxWidth: '35mm', lineHeight: 1.1, color: '#000' }}>
                                            All trademarks and logotypes appearing on this label are owned by Sandvik Group
                                        </p>
                                        <div style={{ width: '25mm', height: '25mm', flexShrink: 0 }}>
                                            {qrImage ? <img src={qrImage} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div className="border border-gray-200 w-full h-full"></div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="w-full flex justify-center mt-4"><button type="button" onClick={handlePrint} className="btn-sap btn-primary btn-print-label h-10" disabled={!itemData}>Imprimir</button></div>
                        </div>
                    </div>
                </form>

                <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden">
                    <div className="bg-gray-50 text-gray-900 px-4 py-3 border-b border-gray-200 flex flex-col md:flex-row justify-between items-center">
                        <h2 className="text-base font-normal tracking-tight">Registros</h2>
                        <div className="flex gap-2 items-center">
                            <input type="text" placeholder="Buscar..." className="h-8 px-2 text-xs border border-gray-300 rounded w-full sm:w-72" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            <button onClick={() => window.location.href = currentVersion ? `/api/export_log?version_date=${currentVersion}` : '/api/export_log'} className="h-8 px-4 text-xs bg-emerald-600 text-white rounded">Exportar</button>
                            <select onChange={(e) => loadLogs(e.target.value)} className="h-8 px-3 text-xs bg-white border border-gray-300 rounded"><option value="">-- Actual --</option>{versions.map(v => <option key={v} value={v}>{formatDate(v)}</option>)}</select>
                            <button onClick={handleArchive} className="h-8 px-4 text-xs bg-red-600 text-white rounded">Archivar</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead className="bg-slate-700 text-white"><tr><th className="px-2 py-1.5 text-left">Ref</th><th className="px-2 py-1.5 text-left">Waybill</th><th className="px-2 py-1.5 text-left">Item</th><th className="px-2 py-1.5 text-left">Desc</th><th className="px-2 py-1.5 text-left">Orig</th><th className="px-2 py-1.5 text-left">New</th><th className="px-2 py-1.5 text-center">Qty</th><th className="px-2 py-1.5 text-center">Esp.</th><th className="px-2 py-1.5 text-center">Dif.</th><th className="px-2 py-1.5 text-left">Fecha</th><th className="px-2 py-1.5 text-left">User</th><th className="px-2 py-1.5 text-center">Acc</th></tr></thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredLogs.length === 0 ? <tr><td colSpan="12" className="text-center py-4">No hay registros</td></tr> : filteredLogs.map((log, idx) => (
                                    <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 ${log.isPending ? 'border-l-4 border-amber-400' : ''}`}>
                                        <td className="px-2 py-1.5">{log.importReference}</td><td className="px-2 py-1.5">{log.waybill}</td><td className="px-2 py-1.5 font-mono">{log.itemCode}</td><td className="px-2 py-1.5 truncate max-w-[180px]">{log.isPending && '⏳ '}{log.itemDescription}</td><td className="px-2 py-1.5">{log.binLocation}</td><td className="px-2 py-1.5">{log.relocatedBin}</td><td className="px-2 py-1.5 text-center">{log.qtyReceived}</td><td className="px-2 py-1.5 text-center">{log.expected_qty || 0}</td><td className={`px-2 py-1.5 text-center font-semibold ${(log.difference || 0) > 0 ? 'text-blue-600' :
                                            (log.difference || 0) < 0 ? 'text-red-600' : 'text-gray-900'
                                            }`}>{log.difference || 0}</td><td className="px-2 py-1.5 whitespace-nowrap">{formatDate(log.timestamp)}</td><td className="px-2 py-1.5 uppercase">{log.username}</td><td className="px-2 py-1.5"><div className="flex gap-1 justify-center"><button onClick={() => startEdit(log)}>✎</button><button onClick={() => handleDelete(log.id)}>🗑</button></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <iframe ref={printFrameRef} title="print-frame" style={{ position: 'fixed', top: '-1000px', width: '1px', height: '1px' }} />
            {scannerOpen && <ScannerModal onScan={handleScan} onClose={() => setScannerOpen(false)} />}
        </>
    );
};

export default Inbound;
