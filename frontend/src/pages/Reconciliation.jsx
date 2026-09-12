import React, { useEffect, useState, useMemo } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { useLocation } from 'react-router-dom';
import { cacheData, getCachedData } from '../utils/offlineDb';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { exportExcelFile } from '../utils/exportExcel';
import '../styles/Reconciliation.css';

const Reconciliation = () => {
    const { setTitle } = useOutletContext();
    const location = useLocation();
    useEffect(() => { setTitle("Conciliación"); }, [setTitle]);
    // Filtros de navegación
    const [selectedIR, setSelectedIR] = useState('');
    const [selectedGRN, setSelectedGRN] = useState('');
    const [filterText, setFilterText] = useState('');
    const [filterOnlyDiff, setFilterOnlyDiff] = useState(false);
    const [filterNoDiff, setFilterNoDiff] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'GRN', direction: 'ascending' });
    const [isOfflineData, setIsOfflineData] = useState(false);

    // Estado local para justificaciones y rectificaciones de diferencias por fila (clave: `${IR}_${GRN}_${ItemCode}_${OrderLine}`)
    const [differenceEdits, setDifferenceEdits] = useState({});

    // Modal de Edición de Diferencia individual
    const [editingRow, setEditingRow] = useState(null);
    const [editReason, setEditReason] = useState('');
    const [editComment, setEditComment] = useState('');
    const [editRectifiedQty, setEditRectifiedQty] = useState('');

    // Modal de Guardar Conciliación
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveNotes, setSaveNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

    // Modal de Historial de Conciliaciones Guardadas
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [savedHistoryList, setSavedHistoryList] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [viewingDetail, setViewingDetail] = useState(null);
    const [, setIsLoadingDetail] = useState(false);

    // Query para obtener datos de conciliación activa
    const { data: queryData = { data: [] }, isLoading: loading, refetch } = useQuery({
        queryKey: ['reconciliation'],
        queryFn: async () => {
            setIsOfflineData(false);
            try {
                const res = await fetch(`/api/views/reconciliation`).catch(() => null);
                if (res && res.ok) {
                    const response = await res.json().catch(() => null);
                    if (response && response.data) {
                        await cacheData('last_reconciliation', response.data);
                        return response;
                    }
                }
            } catch (e) {
                console.log("Error loading reconciliation data, using local cache.");
            }

            const cachedData = await getCachedData('last_reconciliation');
            if (cachedData) setIsOfflineData(true);
            return { data: cachedData || [] };
        },
        refetchInterval: () => {
            if (location.pathname !== '/reconciliation') return false;
            return 5000;
        },
        refetchOnWindowFocus: true,
        refetchOnMount: 'always',
        staleTime: 0
    });

    useEffect(() => {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('logix_events');
            bc.onmessage = (event) => {
                if (event.data?.type === 'INBOUND_MUTATED') {
                    refetch();
                }
            };
            return () => bc.close();
        }
    }, [refetch]);

    const rawData = useMemo(() => queryData?.data || [], [queryData]);

    // Extraer listas únicas de IR y GRN disponibles para autocompletado y filtros
    const availableIRs = useMemo(() => {
        const set = new Set();
        rawData.forEach(r => {
            if (r.Import_Reference && r.Import_Reference !== 'SIN I.R. MAESTRA') {
                set.add(r.Import_Reference);
            }
        });
        return Array.from(set).sort();
    }, [rawData]);

    const availableGRNs = useMemo(() => {
        const set = new Set();
        rawData.forEach(r => {
            if (selectedIR && r.Import_Reference !== selectedIR) return;
            if (r.GRN && r.GRN !== 'SIN GRN') {
                set.add(r.GRN);
            }
        });
        return Array.from(set).sort();
    }, [rawData, selectedIR]);

    const formatDateShort = (dateStr) => {
        if (!dateStr) return '';
        try {
            let cleanStr = dateStr.trim();
            if (cleanStr.includes(' ') && !cleanStr.includes('T')) {
                cleanStr = cleanStr.replace(' ', 'T');
            }
            const hasTimezone = cleanStr.endsWith('Z') ||
                cleanStr.includes('+') ||
                (cleanStr.includes('T') && cleanStr.split('T')[1].includes('-')) ||
                (!cleanStr.includes('T') && cleanStr.lastIndexOf('-') > 7);

            if (!hasTimezone) {
                cleanStr = cleanStr + 'Z';
            }

            const date = new Date(cleanStr);
            return date.toLocaleString('es-CO', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch (e) {
            return dateStr;
        }
    };

    // Aplicar ediciones de diferencia sobre los datos antes de filtrar y ordenar
    const processedData = useMemo(() => {
        return rawData.map(row => {
            const rowKey = `${row.Import_Reference}_${row.GRN}_${row.Codigo_Item}_${row.Order_Line || ''}`;
            const edit = differenceEdits[rowKey];

            if (!edit) return row;

            const rectQty = edit.rectified_qty !== undefined && edit.rectified_qty !== '' ? Number(edit.rectified_qty) : row.Cant_Recibida;
            const diff = rectQty - row.Cant_Esperada;

            return {
                ...row,
                Cant_Recibida: rectQty,
                Diferencia: diff,
                Motivo_Diferencia: edit.difference_reason || '',
                Observacion_Operador: edit.operator_comment || '',
                hasCustomEdit: true
            };
        });
    }, [rawData, differenceEdits]);

    // Filtrar por IR seleccionada, GRN seleccionada y búsqueda en texto
    const filteredBySelectors = useMemo(() => {
        return processedData.filter(item => {
            if (selectedIR && item.Import_Reference !== selectedIR) return false;
            if (selectedGRN && item.GRN !== selectedGRN) return false;
            return true;
        });
    }, [processedData, selectedIR, selectedGRN]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredBySelectors];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let res = 0;
                let aKey = a[sortConfig.key];
                let bKey = b[sortConfig.key];

                if (sortConfig.key === 'Order_Line') {
                    const aNum = parseInt(aKey, 10) || 0;
                    const bNum = parseInt(bKey, 10) || 0;
                    res = aNum - bNum;
                } else if (typeof aKey === 'number' && typeof bKey === 'number') {
                    res = aKey - bKey;
                } else {
                    aKey = aKey ? aKey.toString().toLowerCase() : '';
                    bKey = bKey ? bKey.toString().toLowerCase() : '';
                    if (aKey < bKey) res = -1;
                    else if (aKey > bKey) res = 1;
                }

                if (sortConfig.direction === 'descending') {
                    res = -res;
                }

                if (res === 0) {
                    const aLine = parseInt(a.Order_Line, 10) || 0;
                    const bLine = parseInt(b.Order_Line, 10) || 0;
                    if (aLine !== bLine) return aLine - bLine;
                    return (a.Codigo_Item || '').localeCompare(b.Codigo_Item || '');
                }

                return res;
            });
        }
        return sortableItems;
    }, [filteredBySelectors, sortConfig]);

    const searchedData = useMemo(() => {
        if (!filterText) return sortedData;
        const searchStr = filterText.toLowerCase();
        return sortedData.filter(item => {
            return Object.entries(item).some(([key, val]) => {
                if (val === null || val === undefined) return false;
                if (key === 'id') return false;
                if (key === 'Timestamp') {
                    return formatDateShort(val).toLowerCase().includes(searchStr);
                }
                return String(val).toLowerCase().includes(searchStr);
            });
        });
    }, [sortedData, filterText]);

    const diffStats = useMemo(() => {
        let withDiff = 0;
        let withoutDiff = 0;
        searchedData.forEach(item => {
            if (Math.abs(item.Diferencia || 0) > 0.0001) {
                withDiff++;
            } else {
                withoutDiff++;
            }
        });
        return { withDiff, withoutDiff };
    }, [searchedData]);

    const finalDisplayData = useMemo(() => {
        if (!filterOnlyDiff && !filterNoDiff) return searchedData;
        return searchedData.filter(item => {
            const hasDiff = Math.abs(item.Diferencia || 0) > 0.0001;
            if (filterOnlyDiff && !hasDiff) return false;
            if (filterNoDiff && hasDiff) return false;
            return true;
        });
    }, [searchedData, filterOnlyDiff, filterNoDiff]);

    // Resumen de la conciliación en pantalla
    const reconciliationSummary = useMemo(() => {
        let totalExp = 0;
        let totalRec = 0;
        let diffLines = 0;
        let justifiedLines = 0;

        finalDisplayData.forEach(r => {
            totalExp += (r.Cant_Esperada || 0);
            totalRec += (r.Cant_Recibida || 0);
            if (Math.abs(r.Diferencia || 0) > 0.0001) {
                diffLines++;
                if (r.Motivo_Diferencia || r.Observacion_Operador) {
                    justifiedLines++;
                }
            }
        });

        return {
            totalLines: finalDisplayData.length,
            totalExp,
            totalRec,
            totalDiff: totalRec - totalExp,
            diffLines,
            justifiedLines
        };
    }, [finalDisplayData]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (name) => {
        if (sortConfig.key !== name) return <span className="ml-1 opacity-30">↕</span>;
        return sortConfig.direction === 'ascending' ? <span className="ml-1">↑</span> : <span className="ml-1">↓</span>;
    };

    const handleExport = async () => {
        const dataToExport = finalDisplayData.length > 0 ? finalDisplayData : (filteredBySelectors.length > 0 ? filteredBySelectors : rawData);
        if (!dataToExport || dataToExport.length === 0) {
            alert("No hay datos cargados para exportar.");
            return;
        }

        const formattedData = dataToExport.map(row => ({
            'Import Ref (I.R.)': row.Import_Reference || '',
            'Waybill': row.Waybill || '',
            'GRN': row.GRN || '',
            'Línea PO': row.Order_Line || '',
            'Código Ítem': row.Codigo_Item || '',
            'Descripción': row.Descripcion || '',
            'Ubicación': row.Ubicacion || '',
            'Reubicado': row.Reubicado || '',
            'Cant. Esperada': row.Cant_Esperada ?? 0,
            'Cant. Recibida': row.Cant_Recibida ?? 0,
            'Diferencia': row.Diferencia ?? 0,
            'Motivo Discrepancia': row.Motivo_Diferencia || '',
            'Observación Operador': row.Observacion_Operador || '',
            'Fecha': row.Timestamp ? formatDateShort(row.Timestamp) : ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Conciliación');

        const prefix = selectedGRN ? `GRN_${selectedGRN}` : (selectedIR ? `IR_${selectedIR}` : 'General');
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `Conciliacion_${prefix}_${dateStr}.xlsx`;

        await exportExcelFile(workbook, fileName);
    };

    // Apertura del modal de edición de diferencia
    const handleOpenEditRow = (row) => {
        const rowKey = `${row.Import_Reference}_${row.GRN}_${row.Codigo_Item}_${row.Order_Line || ''}`;
        const existing = differenceEdits[rowKey];

        setEditingRow(row);
        setEditReason(existing?.difference_reason || row.Motivo_Diferencia || '');
        setEditComment(existing?.operator_comment || row.Observacion_Operador || '');
        setEditRectifiedQty(existing?.rectified_qty !== undefined ? String(existing.rectified_qty) : String(row.Cant_Recibida));
    };

    const handleSaveRowEdit = (e) => {
        e.preventDefault();
        if (!editingRow) return;

        const rowKey = `${editingRow.Import_Reference}_${editingRow.GRN}_${editingRow.Codigo_Item}_${editingRow.Order_Line || ''}`;
        const rectNum = editRectifiedQty.trim() !== '' ? parseFloat(editRectifiedQty) : editingRow.Cant_Recibida;

        const editData = {
            difference_reason: editReason.trim(),
            operator_comment: editComment.trim(),
            rectified_qty: isNaN(rectNum) ? editingRow.Cant_Recibida : rectNum
        };

        // Guardar en estado local (inmediato)
        setDifferenceEdits(prev => ({
            ...prev,
            [rowKey]: editData
        }));

        // Guardar en BD (asíncrono, no bloquea UI)
        fetch('/api/inbound/upsert_draft_comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grn_number: editingRow.GRN,
                import_reference: editingRow.Import_Reference,
                waybill: editingRow.Waybill || '',
                order_line: editingRow.Order_Line || '',
                item_code: editingRow.Codigo_Item,
                difference_reason: editData.difference_reason,
                operator_comment: editData.operator_comment,
                qty_received: editData.rectified_qty
            })
        }).catch(err => console.error("Error guardando comentario:", err));

        setEditingRow(null);
    };

    const handleClearRowEdit = () => {
        if (!editingRow) return;
        const rowKey = `${editingRow.Import_Reference}_${editingRow.GRN}_${editingRow.Codigo_Item}_${editingRow.Order_Line || ''}`;
        setDifferenceEdits(prev => {
            const next = { ...prev };
            delete next[rowKey];
            return next;
        });
        setEditingRow(null);
    };

    // Guardar snapshot de conciliación permanente
    const handleConfirmSaveReconciliation = async () => {
        // IMPORTANTE: usar filteredBySelectors (todos los ítems de la GRN seleccionada)
        // y NO finalDisplayData (que puede estar filtrado por texto o por diferencias),
        // para garantizar que el archivo siempre contenga las 100% de las líneas.
        const targetData = filteredBySelectors.length > 0 ? filteredBySelectors : rawData;
        if (targetData.length === 0) {
            alert("No hay registros filtrados para conciliar y guardar.");
            return;
        }

        setIsSaving(true);
        try {
            const uniqueGRNs = Array.from(new Set(targetData.map(r => r.GRN).filter(Boolean)));
            const uniqueIRs = Array.from(new Set(targetData.map(r => r.Import_Reference).filter(Boolean)));
            const uniqueWBs = Array.from(new Set(targetData.map(r => r.Waybill).filter(Boolean)));

            const grnToSave = selectedGRN || (uniqueGRNs.length === 1 ? uniqueGRNs[0] : (uniqueGRNs.length > 1 ? 'VARIAS' : 'SIN GRN'));
            const irToSave = selectedIR || (uniqueIRs.length === 1 ? uniqueIRs[0] : (uniqueIRs.length > 1 ? 'VARIAS' : 'SIN IR'));
            const wbToSave = uniqueWBs.length === 1 ? uniqueWBs[0] : (uniqueWBs.length > 1 ? 'VARIOS' : '');

            const payload = {
                grn_number: grnToSave,
                import_reference: irToSave,
                waybill: wbToSave,
                items: targetData.map(r => ({
                    grn_number: r.GRN,
                    import_reference: r.Import_Reference,
                    waybill: r.Waybill,
                    order_line: r.Order_Line || '',
                    item_code: r.Codigo_Item,
                    description: r.Descripcion,
                    location: r.Ubicacion,
                    relocated_bin: r.Reubicado,
                    qty_expected: r.Cant_Esperada,
                    qty_received: r.Cant_Recibida,
                    difference: r.Diferencia,
                    difference_reason: r.Motivo_Diferencia || '',
                    operator_comment: r.Observacion_Operador || '',
                })),
                notes: saveNotes.trim()
            };

            const res = await fetch('/api/inbound/save_grn_reconciliation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const dataRes = await res.json();
                setSaveSuccessMsg(`¡Conciliación de GRN ${grnToSave} guardada exitosamente con ID #${dataRes.id}!`);
                setTimeout(() => {
                    setSaveSuccessMsg('');
                    setShowSaveModal(false);
                    setSaveNotes('');
                }, 2000);
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Error al guardar conciliación: ${err.detail || err.error || 'Error en servidor'}`);
            }
        } catch (e) {
            alert(`Error de conexión al guardar: ${e.message || e}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Cargar historial de fotos guardadas
    const fetchSavedHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const res = await fetch('/api/inbound/saved_grn_reconciliations');
            if (res.ok) {
                const list = await res.json();
                setSavedHistoryList(list || []);
            }
        } catch (e) {
            console.error("Error al cargar historial:", e);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleOpenHistory = () => {
        setShowHistoryModal(true);
        fetchSavedHistory();
    };

    const handleViewSavedDetail = async (id) => {
        setIsLoadingDetail(true);
        try {
            const res = await fetch(`/api/inbound/saved_grn_reconciliations/${id}`);
            if (res.ok) {
                const detail = await res.json();
                setViewingDetail(detail);
            }
        } catch (e) {
            alert("Error al cargar detalle de la conciliación");
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleDeleteSavedRecon = async (id, grnNum) => {
        if (!confirm(`¿Estás seguro de eliminar el registro histórico de la GRN ${grnNum}?`)) return;
        try {
            const res = await fetch(`/api/inbound/saved_grn_reconciliations/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setSavedHistoryList(prev => prev.filter(item => item.id !== id));
                if (viewingDetail?.header?.id === id) {
                    setViewingDetail(null);
                }
            } else {
                alert("Error al eliminar conciliación");
            }
        } catch (e) {
            alert("Error de conexión");
        }
    };

    // Exportar detalle de conciliación guardada en el historial
    const handleExportSavedDetail = async (detail) => {
        if (!detail || !detail.items || detail.items.length === 0) {
            alert("No hay ítems para exportar en esta conciliación histórica.");
            return;
        }

        const header = detail.header || {};
        const formattedData = detail.items.map(it => ({
            'Línea PO': it.order_line || '',
            'Código Ítem': it.item_code || '',
            'Descripción': it.description || '',
            'Ubicación': it.location || '',
            'Reubicado': it.relocated_bin || '',
            'Cant. Esperada': it.qty_expected ?? 0,
            'Cant. Recibida': it.qty_received ?? 0,
            'Diferencia': it.difference ?? 0,
            'Motivo Discrepancia': it.difference_reason || '',
            'Observación Operador': it.operator_comment || '',
            'I.R.': it.import_reference || header.import_reference || '',
            'Waybill': it.waybill || header.waybill || '',
            'GRN': it.grn_number || header.grn_number || '',
            'Fecha Guardado': header.reconciled_at ? formatDateShort(header.reconciled_at) : '',
            'Operador': header.reconciled_by || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `GRN_${header.grn_number || 'Historial'}`);

        const dateStr = (header.reconciled_at || new Date().toISOString()).slice(0, 10);
        const fileName = `Conciliacion_Historica_GRN_${header.grn_number || 'Snapshot'}_${dateStr}.xlsx`;

        await exportExcelFile(workbook, fileName);
    };

    const handleExportSavedFromList = async (id) => {
        try {
            const res = await fetch(`/api/inbound/saved_grn_reconciliations/${id}`);
            if (res.ok) {
                const detail = await res.json();
                if (detail) {
                    await handleExportSavedDetail(detail);
                } else {
                    alert("No se encontró el detalle de la conciliación para exportar.");
                }
            } else {
                alert("Error al obtener los datos de la conciliación.");
            }
        } catch (e) {
            console.error("Error al exportar conciliación desde historial:", e);
            alert(`Error al exportar la conciliación: ${e.message}`);
        }
    };

    return (
        <div className="reconciliation-page flex flex-col h-full bg-[#f9f9f9] text-[#201f1e] font-segoe-ui">
            {/* Barra de Filtros y Acciones */}
            <div className="px-4 py-2.5 border-b border-[#d2d0ce] bg-white sticky top-0 z-30 shadow-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                    
                    {/* Selector de I.R. */}
                    <div className="w-44 flex flex-col">
                        <label className="text-normal font-normal text-[#605e5c] mb-0.5">Import Ref (I.R.)</label>
                        <div className="relative">
                            <input
                                list="ir-list"
                                type="text"
                                placeholder="TODAS LAS I.R."
                                value={selectedIR}
                                onChange={(e) => {
                                    setSelectedIR(e.target.value.trim().toUpperCase());
                                    setSelectedGRN(''); // Reset GRN al cambiar IR
                                }}
                                className="w-full h-8 px-2 text-xs text-[#201f1e] font-normal bg-white border border-[#8a8886] rounded outline-none uppercase focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                            />
                            <datalist id="ir-list">
                                {availableIRs.map(ir => (
                                    <option key={ir} value={ir} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    {/* Selector de GRN */}
                    <div className="w-40 flex flex-col">
                        <label className="text-normal font-normal text-[#605e5c] mb-0.5">Número de GRN</label>
                        <div className="relative">
                            <input
                                list="grn-list"
                                type="text"
                                placeholder="TODAS LAS GRN"
                                value={selectedGRN}
                                onChange={(e) => setSelectedGRN(e.target.value.trim().toUpperCase())}
                                className="w-full h-8 px-2 text-xs text-[#201f1e] font-normal bg-white border border-[#8a8886] rounded outline-none uppercase focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                            />
                            <datalist id="grn-list">
                                {availableGRNs.map(g => (
                                    <option key={g} value={g} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    {/* Búsqueda General */}
                    <div className="flex-1 min-w-[200px] flex flex-col">
                        <label className="text-normal font-normal text-[#605e5c] mb-0.5">Búsqueda Rápida</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Buscar ítem, descripción, ubicación..."
                                className="w-full h-8 px-2.5 text-xs bg-white border border-[#8a8886] rounded outline-none text-[#201f1e] font-normal focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                                style={{ paddingRight: filterText ? '28px' : '10px' }}
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                            />
                            {filterText && (
                                <button
                                    onClick={() => setFilterText('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#edebe9] hover:bg-[#d2d0ce] text-[#605e5c] flex items-center justify-center text-[10px]"
                                    aria-label="Borrar búsqueda"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Botón Limpiar Filtros */}
                    {(selectedIR || selectedGRN || filterText || filterOnlyDiff || filterNoDiff) && (
                        <div className="self-end">
                            <button
                                onClick={() => {
                                    setSelectedIR('');
                                    setSelectedGRN('');
                                    setFilterText('');
                                    setFilterOnlyDiff(false);
                                    setFilterNoDiff(false);
                                }}
                                className="h-8 px-3 text-xs text-[#201f1e] bg-white hover:bg-[#f3f3f3] border border-[#d2d0ce] rounded transition-colors font-normal cursor-pointer"
                            >
                                Limpiar
                            </button>
                        </div>
                    )}

                    {/* Acciones Principales */}
                    <div className="flex items-center gap-2 ml-auto self-end">
                        {/* Botón Historial Guardado */}
                        <button
                            onClick={handleOpenHistory}
                            className="h-8 px-3 text-xs text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f3f3] rounded font-normal transition-colors cursor-pointer shadow-xs"
                        >
                            Historial Guardado
                        </button>

                        {/* Botón Guardar Conciliación */}
                        <button
                            onClick={() => setShowSaveModal(true)}
                            disabled={filteredBySelectors.length === 0}
                            className="h-8 px-3.5 text-xs text-white bg-[#0078d4] hover:bg-[#106ebe] border border-transparent rounded font-normal transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                        >
                            Guardar Conciliación
                        </button>

                        {/* Botón Exportar */}
                        <button
                            onClick={handleExport}
                            disabled={loading || rawData.length === 0}
                            className="h-8 px-3 text-xs text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f3f3] rounded font-normal transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs whitespace-nowrap"
                        >
                            Exportar Excel
                        </button>
                    </div>
                </div>

                {/* Banner de Resumen de Conciliación Seleccionada */}
                <div className="flex flex-wrap items-center gap-4 bg-[#f9f9f9] px-3 py-1.5 mt-2 rounded border border-[#d2d0ce] text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#605e5c] font-normal">Líneas:</span>
                        <span className="font-normal text-[#201f1e]">{reconciliationSummary.totalLines}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#605e5c] font-normal">Cant. Esperada:</span>
                        <span className="font-normal text-[#201f1e]">{reconciliationSummary.totalExp}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#605e5c] font-normal">Cant. Recibida:</span>
                        <span className="font-normal text-[#201f1e]">{reconciliationSummary.totalRec}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#605e5c] font-normal">Diferencia Neta:</span>
                        <span className={`font-normal ${reconciliationSummary.totalDiff < 0 ? 'text-[#a4262c]' : reconciliationSummary.totalDiff > 0 ? 'text-[#0078d4]' : 'text-[#201f1e]'}`}>
                            {reconciliationSummary.totalDiff > 0 ? `+${reconciliationSummary.totalDiff}` : reconciliationSummary.totalDiff}
                        </span>
                    </div>

                    {/* Separador */}
                    <div className="h-3.5 w-px bg-[#d2d0ce] hidden sm:block"></div>

                    {/* Filtros de Diferencia */}
                    <div className="flex items-center gap-3">
                        <label htmlFor="filter-only-diff" className="flex items-center gap-1.5 cursor-pointer select-none text-[#201f1e] font-normal">
                            <input
                                id="filter-only-diff"
                                type="checkbox"
                                checked={filterOnlyDiff}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setFilterOnlyDiff(checked);
                                    if (checked) setFilterNoDiff(false);
                                }}
                                className="w-3.5 h-3.5 rounded border-[#8a8886] cursor-pointer"
                            />
                            <span>Solo Diferencias</span>
                            <span className="px-1.5 py-0.2 text-[11px] rounded border border-[#d2d0ce] bg-white text-[#201f1e] font-normal">
                                {diffStats.withDiff}
                            </span>
                        </label>

                        <label htmlFor="filter-no-diff" className="flex items-center gap-1.5 cursor-pointer select-none text-[#201f1e] font-normal">
                            <input
                                id="filter-no-diff"
                                type="checkbox"
                                checked={filterNoDiff}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setFilterNoDiff(checked);
                                    if (checked) setFilterOnlyDiff(false);
                                }}
                                className="w-3.5 h-3.5 rounded border-[#8a8886] cursor-pointer"
                            />
                            <span>Sin Diferencias</span>
                            <span className="px-1.5 py-0.2 text-[11px] rounded border border-[#d2d0ce] bg-white text-[#201f1e] font-normal">
                                {diffStats.withoutDiff}
                            </span>
                        </label>
                    </div>

                    {reconciliationSummary.diffLines > 0 && (
                        <div className="flex items-center gap-1.5 ml-auto">
                            <span className="px-2 py-0.5 rounded text-[11px] font-normal bg-[#fff4ce] text-[#797673] border border-[#d2d0ce]">
                                {reconciliationSummary.diffLines} línea(s) con discrepancia ({reconciliationSummary.justifiedLines} justificadas)
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabla Principal de Conciliación */}
            <div className="flex-1 px-4 py-2 overflow-hidden flex flex-col">
                <div className="bg-white border border-[#d2d0ce] shadow-xs overflow-hidden flex flex-col flex-1 rounded">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-32 text-[#605e5c] text-xs font-normal">
                            Cargando datos de conciliación...
                        </div>
                    ) : (
                        <>
                            <div className="overflow-auto max-h-[68vh]">
                                <table className="w-full text-left border-collapse font-normal">
                                    <thead className="sticky top-0 z-20 font-normal">
                                        <tr className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce] font-normal">
                                            {[
                                                { id: 'Import_Reference', label: 'I.R.' },
                                                { id: 'Waybill', label: 'Waybill' },
                                                { id: 'GRN', label: 'GRN' },
                                                { id: 'Order_Line', label: 'Línea' },
                                                { id: 'Codigo_Item', label: 'Código Ítem' },
                                                { id: 'Descripcion', label: 'Descripción' },
                                                { id: 'Ubicacion', label: 'Ubicación' },
                                                { id: 'Reubicado', label: 'Reubicado' },
                                                { id: 'Cant_Esperada', label: 'Cant. Esperada' },
                                                { id: 'Cant_Recibida', label: 'Cant. Recibida' },
                                                { id: 'Diferencia', label: 'Diferencia' },
                                                { id: 'Motivo', label: 'Motivo / Observación' },
                                                { id: 'Timestamp', label: 'Fecha' },
                                                { id: 'Acciones', label: 'Acciones' }
                                            ].map((head) => (
                                                <th
                                                    key={head.id}
                                                    onClick={() => !['Acciones', 'Motivo'].includes(head.id) && requestSort(head.id)}
                                                    className={`px-3 py-1.5 text-xs font-semibold text-[#201f1e] bg-[#f3f3f3] border-b border-[#d2d0ce] ${!['Acciones', 'Motivo'].includes(head.id) ? 'cursor-pointer select-none hover:bg-[#edebe9]' : ''} whitespace-nowrap transition-colors`}
                                                    style={{ borderRight: '1px solid #edebe9' }}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        {head.label}
                                                        {!['Acciones', 'Motivo'].includes(head.id) && getSortIcon(head.id)}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="font-normal divide-y divide-[#edebe9]">
                                        {finalDisplayData.length > 0 ? (
                                            finalDisplayData.map((row, idx) => {
                                                const hasDiff = Math.abs(row.Diferencia || 0) > 0.0001;
                                                const hasEdit = !!(row.Motivo_Diferencia || row.Observacion_Operador || row.hasCustomEdit);

                                                return (
                                                    <tr
                                                        key={idx}
                                                        className="hover:bg-[#f3f9fd] transition-colors"
                                                    >
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-[#201f1e]">{row.Import_Reference}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-[#201f1e]">{row.Waybill}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-[#201f1e]">{row.GRN}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-[#201f1e] text-center">{row.Order_Line || '-'}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap font-mono text-[#0078d4]">{row.Codigo_Item}</td>
                                                        <td className="px-3 py-1 font-normal text-sm truncate max-w-[260px] text-[#201f1e]">{row.Descripcion}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-[#201f1e]">{row.Ubicacion || '-'}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-[#201f1e]">{row.Reubicado || '-'}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-center text-[#201f1e]">{row.Cant_Esperada}</td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-center text-[#201f1e]">{row.Cant_Recibida}</td>
                                                        <td className={`px-3 py-1 font-normal text-sm whitespace-nowrap text-center font-mono ${row.Diferencia < 0 ? 'text-[#a4262c]' : row.Diferencia > 0 ? 'text-[#0078d4]' : 'text-[#201f1e]'}`}>
                                                            {row.Diferencia > 0 ? `+${row.Diferencia}` : row.Diferencia}
                                                        </td>
                                                        <td className="px-3 py-1 font-normal text-sm max-w-[200px] truncate text-[#605e5c]">
                                                            {row.Motivo_Diferencia ? (
                                                                <span className="inline-block text-[11px] bg-[#f3f3f3] text-[#201f1e] px-2 py-0.5 rounded border border-[#d2d0ce] font-normal">
                                                                    <span className="truncate">{row.Motivo_Diferencia}</span>
                                                                </span>
                                                            ) : (
                                                                <span className="text-[#605e5c]">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-1 font-normal text-sm whitespace-nowrap text-[#605e5c]">
                                                            {formatDateShort(row.Timestamp)}
                                                        </td>
                                                        <td className="px-2 py-1 font-normal text-sm whitespace-nowrap text-center">
                                                            <button
                                                                onClick={() => handleOpenEditRow(row)}
                                                                className={`h-6 px-2.5 text-xs rounded font-normal transition-colors cursor-pointer border ${hasEdit ? 'bg-[#eff6fc] text-[#0078d4] border-[#c7e0f4] hover:bg-[#deecf9]' : hasDiff ? 'bg-white text-[#0078d4] border-[#d2d0ce] hover:bg-[#f3f3f3]' : 'bg-white text-[#201f1e] border-[#d2d0ce] hover:bg-[#f3f3f3]'}`}
                                                            >
                                                                <span>{hasEdit ? 'Justificado' : 'Editar'}</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={14} className="px-4 py-20 text-center text-[#605e5c] text-xs font-normal">
                                                    No se encontraron registros para los filtros seleccionados
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer de estado */}
                            <div className="flex items-center gap-3 px-4 py-2 border-t border-[#edebe9] bg-[#f9f9f9] text-xs text-[#605e5c]">
                                <span>Mostrando <span className="font-normal text-[#201f1e]">{finalDisplayData.length}</span> de <span className="font-normal text-[#201f1e]">{rawData.length}</span> registros totales</span>
                                {!isOfflineData ? (
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#107c10] inline-block"></span>
                                        Datos en tiempo real
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#ca5010] inline-block"></span>
                                        Datos sin conexión
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* MODAL 1: Justificar / Editar Diferencia de Ítem */}
            {editingRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
                    <div className="bg-white rounded border border-[#d2d0ce] shadow-2xl max-w-lg w-full overflow-hidden">
                        <div className="px-5 py-3 border-b border-[#d2d0ce] bg-[#f3f3f3] flex items-center justify-between">
                            <h3 className="text-sm font-normal text-[#201f1e]">
                                Conciliar / Editar Diferencia de Ítem
                            </h3>
                            <button
                                onClick={() => setEditingRow(null)}
                                className="text-[#605e5c] hover:text-[#201f1e] text-base font-normal cursor-pointer"
                                aria-label="Cerrar"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveRowEdit} className="p-5 space-y-4 text-xs">
                            {/* Resumen del Ítem */}
                            <div className="bg-[#f9f9f9] p-3 rounded border border-[#d2d0ce] grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-[#605e5c] block text-[11px] font-normal">Ítem:</span>
                                    <span className="font-mono text-[#0078d4] text-xs">{editingRow.Codigo_Item}</span>
                                </div>
                                <div>
                                    <span className="text-[#605e5c] block text-[11px] font-normal">Línea PO:</span>
                                    <span className="font-normal text-[#201f1e]">{editingRow.Order_Line || '-'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-[#605e5c] block text-[11px] font-normal">Descripción:</span>
                                    <span className="text-[#201f1e]">{editingRow.Descripcion}</span>
                                </div>
                                <div>
                                    <span className="text-[#605e5c] block text-[11px] font-normal">GRN:</span>
                                    <span className="font-normal text-[#201f1e]">{editingRow.GRN}</span>
                                </div>
                                <div>
                                    <span className="text-[#605e5c] block text-[11px] font-normal">I.R. / Waybill:</span>
                                    <span className="font-normal text-[#201f1e]">{editingRow.Import_Reference} / {editingRow.Waybill}</span>
                                </div>
                            </div>

                            {/* Comparación de Cantidades */}
                            <div className="grid grid-cols-3 gap-2 bg-[#f9f9f9] p-3 rounded border border-[#d2d0ce] text-center">
                                <div>
                                    <span className="text-[#605e5c] block text-[11px] font-normal">Esperada</span>
                                    <span className="text-sm font-normal text-[#201f1e]">{editingRow.Cant_Esperada}</span>
                                </div>
                                <div>
                                    <span className="text-[#605e5c] block text-[11px] font-normal">Recibida Actual</span>
                                    <span className="text-sm font-normal text-[#201f1e]">{editingRow.Cant_Recibida}</span>
                                </div>
                                <div>
                                    <span className="text-[#605e5c] block text-[11px] font-normal">Diferencia</span>
                                    <span className={`text-sm font-mono font-normal ${editingRow.Diferencia < 0 ? 'text-[#a4262c]' : editingRow.Diferencia > 0 ? 'text-[#0078d4]' : 'text-[#201f1e]'}`}>
                                        {editingRow.Diferencia > 0 ? `+${editingRow.Diferencia}` : editingRow.Diferencia}
                                    </span>
                                </div>
                            </div>

                            {/* Campo de Rectificación de Cantidad */}
                            <div>
                                <label className="block text-xs font-normal text-[#201f1e] mb-1">
                                    Cantidad Recibida Confirmada / Rectificada:
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={editRectifiedQty}
                                    onChange={(e) => setEditRectifiedQty(e.target.value)}
                                    className="w-full h-8 px-2 text-xs bg-white border border-[#8a8886] rounded outline-none font-normal focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                                />
                                <span className="text-[11px] text-[#605e5c] mt-0.5 block">
                                    Ajuste este valor si se realizó un reconteo físico directo del ítem.
                                </span>
                            </div>

                            {/* Selector de Motivo de Diferencia */}
                            <div>
                                <label className="block text-xs font-normal text-[#201f1e] mb-1">
                                    Motivo de la Discrepancia:
                                </label>
                                <select
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                    className="w-full h-8 px-2 text-xs bg-white border border-[#8a8886] rounded outline-none font-normal focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                                >
                                    <option value="">-- Seleccionar Motivo --</option>
                                    <option value="Sin Diferencia / Conforme">Sin Diferencia / Conforme</option>
                                    <option value="Faltante en Origen / Proveedor">Faltante en Origen / Proveedor</option>
                                    <option value="Sobrante en Envío">Sobrante en Envío</option>
                                    <option value="Mercancía Dañada / Rechazada">Mercancía Dañada / Rechazada</option>
                                    <option value="Error de Conteo Físico Rectificado">Error de Conteo Físico Rectificado</option>
                                    <option value="Ítem Trocado / No Corresponde">Ítem Trocado / No Corresponde</option>
                                    <option value="Diferencia Aceptada por Operador">Diferencia Aceptada por Operador</option>
                                    <option value="Otro Motivo">Otro Motivo</option>
                                </select>
                            </div>

                            {/* Campo de Observaciones */}
                            <div>
                                <label className="block text-xs font-normal text-[#201f1e] mb-1">
                                    Observación / Justificación del Operador:
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Detalle o nota explicativa para la auditoría..."
                                    value={editComment}
                                    onChange={(e) => setEditComment(e.target.value)}
                                    className="w-full p-2 text-xs bg-white border border-[#8a8886] rounded outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                                />
                            </div>

                            {/* Botones de Acción */}
                            <div className="flex items-center justify-between pt-2 border-t border-[#edebe9]">
                                <button
                                    type="button"
                                    onClick={handleClearRowEdit}
                                    className="px-3 py-1.5 text-xs font-normal text-[#a4262c] bg-white hover:bg-[#fde7e9] border border-[#d2d0ce] hover:border-[#f3b2b6] rounded transition-colors cursor-pointer"
                                >
                                    Restablecer Original
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingRow(null)}
                                        className="px-3.5 py-1.5 text-xs font-normal text-[#201f1e] bg-white hover:bg-[#f3f3f3] border border-[#d2d0ce] rounded transition-colors cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-1.5 text-xs font-normal text-white bg-[#0078d4] hover:bg-[#106ebe] border border-transparent rounded shadow-xs cursor-pointer transition-colors"
                                    >
                                        Guardar Justificación
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: Guardar Conciliación Snapshot en BD */}
            {showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
                    <div className="bg-white rounded border border-[#d2d0ce] shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="px-5 py-3 border-b border-[#d2d0ce] bg-[#f3f3f3] flex items-center justify-between">
                            <h3 className="text-sm font-normal text-[#201f1e]">
                                Guardar Conciliación Permanente
                            </h3>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                className="text-[#605e5c] hover:text-[#201f1e] text-base font-normal cursor-pointer"
                                aria-label="Cerrar"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 space-y-4 text-xs">
                            {saveSuccessMsg ? (
                                <div className="bg-[#dff6dd] text-[#107c10] p-4 rounded border border-[#a19f9d]/30 text-center font-normal">
                                    <p>{saveSuccessMsg}</p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-[#605e5c] leading-relaxed font-normal">
                                        Se guardará una fotografía histórica completa de la conciliación en la base de datos para fines de auditoría.
                                    </p>

                                    {/* Resumen a Guardar */}
                                    <div className="bg-[#f9f9f9] p-3 rounded border border-[#d2d0ce] space-y-1.5">
                                        <div className="flex justify-between">
                                            <span className="text-[#605e5c] font-normal text-[11px]">GRN a Conciliar:</span>
                                            <span className="font-normal text-[#201f1e]">{selectedGRN || 'TODAS LAS VISIBLES'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#605e5c] font-normal text-[11px]">Import Reference:</span>
                                            <span className="font-normal text-[#201f1e]">{selectedIR || 'TODAS LAS VISIBLES'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#605e5c] font-normal text-[11px]">Total Líneas:</span>
                                            <span className="font-normal text-[#201f1e]">{reconciliationSummary.totalLines}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#605e5c] font-normal text-[11px]">Cant. Esperada:</span>
                                            <span className="font-normal text-[#201f1e]">{reconciliationSummary.totalExp}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#605e5c] font-normal text-[11px]">Cant. Recibida:</span>
                                            <span className="font-normal text-[#201f1e]">{reconciliationSummary.totalRec}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-[#edebe9] pt-1">
                                            <span className="text-[#605e5c] font-normal text-[11px]">Diferencia Neta:</span>
                                            <span className={`font-mono font-normal ${reconciliationSummary.totalDiff < 0 ? 'text-[#a4262c]' : reconciliationSummary.totalDiff > 0 ? 'text-[#0078d4]' : 'text-[#201f1e]'}`}>
                                                {reconciliationSummary.totalDiff > 0 ? `+${reconciliationSummary.totalDiff}` : reconciliationSummary.totalDiff}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Campo de Notas */}
                                    <div>
                                        <label className="block text-xs font-normal text-[#201f1e] mb-1">
                                            Notas Generales de la Conciliación (Opcional):
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="Observaciones de cierre, número de acta, etc..."
                                            value={saveNotes}
                                            onChange={(e) => setSaveNotes(e.target.value)}
                                            className="w-full p-2 text-xs bg-white border border-[#8a8886] rounded outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                                        />
                                    </div>

                                    {/* Botones */}
                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edebe9]">
                                        <button
                                            type="button"
                                            onClick={() => setShowSaveModal(false)}
                                            className="px-3.5 py-1.5 text-xs font-normal text-[#201f1e] bg-white hover:bg-[#f3f3f3] border border-[#d2d0ce] rounded transition-colors cursor-pointer"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirmSaveReconciliation}
                                            disabled={isSaving}
                                            className="px-4 py-1.5 text-xs font-normal text-white rounded shadow-xs bg-[#0078d4] hover:bg-[#106ebe] border border-transparent transition-colors disabled:opacity-50 cursor-pointer"
                                        >
                                            {isSaving ? 'Guardando en BD...' : 'Confirmar y Guardar'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: Historial de Conciliaciones Guardadas */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
                    <div className="bg-white rounded border border-[#d2d0ce] shadow-2xl w-full max-w-[92vw] max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="px-5 py-3 border-b border-[#d2d0ce] bg-[#f3f3f3] flex items-center justify-between">
                            <h3 className="text-sm font-normal text-[#201f1e]">
                                Historial de Conciliaciones Guardadas
                            </h3>
                            <button
                                onClick={() => {
                                    setShowHistoryModal(false);
                                    setViewingDetail(null);
                                }}
                                className="text-[#605e5c] hover:text-[#201f1e] text-base font-normal cursor-pointer"
                                aria-label="Cerrar"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 flex-1 overflow-auto">
                            {viewingDetail ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
                                        <div>
                                            <button
                                                onClick={() => setViewingDetail(null)}
                                                className="text-xs font-normal text-[#0078d4] hover:underline flex items-center gap-1 mb-1 cursor-pointer"
                                            >
                                                ← Volver al listado
                                            </button>
                                            <h4 className="text-sm font-normal text-[#201f1e]">
                                                Conciliación GRN: {viewingDetail.header.grn_number} (IR: {viewingDetail.header.import_reference})
                                            </h4>
                                            <p className="text-[11px] text-[#605e5c]">
                                                Fecha: {formatDateShort(viewingDetail.header.reconciled_at)} | Operador: {viewingDetail.header.reconciled_by}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded text-[11px] font-normal border border-[#d2d0ce] bg-[#f3f3f3] text-[#201f1e]">
                                                {viewingDetail.header.status}
                                            </span>
                                            <button
                                                onClick={() => handleExportSavedDetail(viewingDetail)}
                                                className="px-3 py-1 text-xs font-normal text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f3f3] rounded shadow-xs transition-colors cursor-pointer"
                                                title="Exportar esta conciliación a Excel"
                                            >
                                                Exportar Excel
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tabla de ítems guardados en la foto */}
                                    <div className="overflow-x-auto border border-[#d2d0ce] rounded">
                                        <table className="w-full table-fixed text-left text-sm border-collapse">
                                            <thead className="bg-[#f3f3f3] text-[#201f1e] font-normal border-b border-[#d2d0ce] sticky top-0">
                                                <tr>
                                                    <th className="px-2 py-1.5 font-normal">Línea</th>
                                                    <th className="px-2 py-1.5 font-normal">Ítem</th>
                                                    <th className="px-2 py-1.5 w-[22%] font-normal">Descripción</th>
                                                    <th className="px-2 py-1.5 font-normal">Ubicación</th>
                                                    <th className="px-2 py-1.5 text-center font-normal">Esperada</th>
                                                    <th className="px-2 py-1.5 text-center font-normal">Recibida</th>
                                                    <th className="px-2 py-1.5 text-center font-normal">Diferencia</th>
                                                    <th className="px-2 py-1.5 font-normal">Motivo / Justificación</th>
                                                </tr>
                                            </thead>
                                             <tbody className="divide-y divide-[#edebe9]">
                                                {viewingDetail.items.map((it, i) => (
                                                    <tr key={i} className="hover:bg-[#f3f9fd] transition-colors">
                                                        <td className="px-2 py-1 text-center text-[#201f1e]">{it.order_line || '-'}</td>
                                                        <td className="px-2 py-1 font-mono text-[#0078d4]">{it.item_code}</td>
                                                        <td className="px-2 py-1 break-words text-[#201f1e]">{it.description}</td>
                                                        <td className="px-2 py-1 text-[#201f1e]">{it.location || '-'}</td>
                                                        <td className="px-2 py-1 text-center text-[#201f1e]">{it.qty_expected}</td>
                                                        <td className="px-2 py-1 text-center text-[#201f1e]">{it.qty_received}</td>
                                                        <td className={`px-2 py-1 text-center font-mono font-normal ${it.difference < 0 ? 'text-[#a4262c]' : it.difference > 0 ? 'text-[#0078d4]' : 'text-[#201f1e]'}`}>
                                                            {it.difference > 0 ? `+${it.difference}` : it.difference}
                                                        </td>
                                                        <td className="px-2 py-1 text-[11px] text-[#605e5c] break-words">
                                                            {it.difference_reason && <span className="font-normal text-[#201f1e] block">{it.difference_reason}</span>}
                                                            {it.operator_comment && <span>{it.operator_comment}</span>}
                                                            {!it.difference_reason && !it.operator_comment && <span className="text-[#605e5c]">-</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {isLoadingHistory ? (
                                        <div className="py-16 text-center text-[#605e5c] text-xs font-normal">
                                            Cargando historial de conciliaciones...
                                        </div>
                                    ) : savedHistoryList.length > 0 ? (
                                        <div className="overflow-y-auto overflow-x-hidden max-h-[60vh] border border-[#d2d0ce] rounded">
                                            <table className="w-full table-fixed text-left text-sm border-collapse">
                                                <thead className="bg-[#f3f3f3] text-[#201f1e] font-normal border-b border-[#d2d0ce] sticky top-0">
                                                    <tr>
                                                        <th className="px-3 py-1.5 w-[6%] font-normal">ID</th>
                                                        <th className="px-3 py-1.5 font-normal">GRN</th>
                                                        <th className="px-3 py-1.5 font-normal">I.R.</th>
                                                        <th className="px-3 py-1.5 w-[14%] font-normal">Fecha Guardado</th>
                                                        <th className="px-3 py-1.5 font-normal">Operador</th>
                                                        <th className="px-3 py-1.5 text-center font-normal">Líneas</th>
                                                        <th className="px-3 py-1.5 text-center font-normal">Esperada</th>
                                                        <th className="px-3 py-1.5 text-center font-normal">Recibida</th>
                                                        <th className="px-3 py-1.5 text-center font-normal">Diferencia</th>
                                                        <th className="px-3 py-1.5 text-center font-normal">Estado</th>
                                                        <th className="px-3 py-1.5 w-[18%] text-center font-normal">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#edebe9]">
                                                    {savedHistoryList.map((rec) => (
                                                        <tr key={rec.id} className="hover:bg-[#f3f9fd] transition-colors">
                                                            <td className="px-3 py-1 font-mono text-[#605e5c]">#{rec.id}</td>
                                                            <td className="px-3 py-1 font-normal text-[#201f1e]">{rec.grn_number}</td>
                                                            <td className="px-3 py-1 text-[#201f1e]">{rec.import_reference}</td>
                                                            <td className="px-3 py-1 text-[#605e5c] break-words">{formatDateShort(rec.reconciled_at)}</td>
                                                            <td className="px-3 py-1 text-[#605e5c]">{rec.reconciled_by}</td>
                                                            <td className="px-3 py-1 text-center text-[#201f1e]">{rec.total_lines}</td>
                                                            <td className="px-3 py-1 text-center font-normal text-[#201f1e]">{rec.total_expected}</td>
                                                            <td className="px-3 py-1 text-center font-normal text-[#201f1e]">{rec.total_received}</td>
                                                            <td className={`px-3 py-1 text-center font-mono font-normal ${rec.total_difference < 0 ? 'text-[#a4262c]' : rec.total_difference > 0 ? 'text-[#0078d4]' : 'text-[#201f1e]'}`}>
                                                                {rec.total_difference > 0 ? `+${rec.total_difference}` : rec.total_difference}
                                                            </td>
                                                            <td className="px-3 py-1 text-center">
                                                                <span className="px-2 py-0.5 rounded text-[11px] font-normal border border-[#d2d0ce] bg-[#f3f3f3] text-[#201f1e]">
                                                                    {rec.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-1 text-center align-middle">
                                                                <div className="flex flex-row items-center justify-center gap-1.5 whitespace-nowrap">
                                                                    {/* Botón Ver Detalle */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleViewSavedDetail(rec.id)}
                                                                        className="h-6 px-2 inline-flex items-center justify-center rounded border border-[#d2d0ce] bg-white text-[#0078d4] hover:bg-[#f3f3f3] hover:border-[#0078d4] shadow-xs transition-colors cursor-pointer text-xs font-normal"
                                                                        title="Ver detalle de conciliación"
                                                                    >
                                                                        Detalle
                                                                    </button>

                                                                    {/* Botón Exportar Excel */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleExportSavedFromList(rec.id)}
                                                                        className="h-6 px-2 inline-flex items-center justify-center rounded border border-[#d2d0ce] bg-white text-[#201f1e] hover:bg-[#f3f3f3] shadow-xs transition-colors cursor-pointer text-xs font-normal"
                                                                        title="Exportar a Excel"
                                                                    >
                                                                        Excel
                                                                    </button>

                                                                    {/* Botón Eliminar */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteSavedRecon(rec.id, rec.grn_number)}
                                                                        className="h-7 px-2 inline-flex items-center justify-center rounded border border-[#d2d0ce] bg-white text-[#a4262c] hover:bg-[#fde7e9] hover:border-[#f3b2b6] shadow-xs transition-colors cursor-pointer text-xs font-normal"
                                                                        title="Eliminar conciliación guardada"
                                                                    >
                                                                        Eliminar
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="py-16 text-center text-[#605e5c] text-xs font-normal">
                                            No hay conciliaciones guardadas permanentemente aún.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reconciliation;

