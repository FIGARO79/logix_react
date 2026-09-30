import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import * as XLSX from 'xlsx';
import { exportExcelFile } from '../utils/exportExcel';
import '../styles/FluentPages.css';

const AdminInventory = () => {
    const { setTitle } = useOutletContext();
    const [activeTab, setActiveTab] = useState('cycle');

    // --- Cycle Control State ---
    const [stats, setStats] = useState(null);
    const [stage, setStage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    // --- Reconciliation State ---
    const [reconItems, setReconItems] = useState([]);
    const [reconLoading, setReconLoading] = useState(false);
    const [reconFilter, setReconFilter] = useState('counted'); // 'uncounted' | 'counted' | 'pending' | 'all'
    const [searchQuery, setSearchQuery] = useState('');
    const [reconPage, setReconPage] = useState(1);
    const [reconPageSize, setReconPageSize] = useState(100);

    const reconCounts = useMemo(() => {
        let counted = 0;
        let pending = 0;
        let uncounted = 0;
        let total = 0;
        for (let i = 0; i < reconItems.length; i++) {
            const item = reconItems[i];
            const hasStock = Number(item.system_qty || 0) > 0;
            const isCounted = item.is_counted || item.c1 !== null || item.c2 !== null || item.c3 !== null || item.c4 !== null;

            if (isCounted) {
                counted++;
                if (item.status === 'PENDING' || item.status === 'PENDING_RECOUNT') {
                    pending++;
                }
            } else if (hasStock) {
                uncounted++;
            }

            if (hasStock || isCounted) {
                total++;
            }
        }
        return {
            total,
            counted,
            pending,
            uncounted
        };
    }, [reconItems]);

    useEffect(() => {
        setReconPage(1);
    }, [reconFilter, searchQuery]);

    const filteredReconItems = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return reconItems.filter((item) => {
            const hasStock = Number(item.system_qty || 0) > 0;
            const isCounted = item.is_counted || item.c1 !== null || item.c2 !== null || item.c3 !== null || item.c4 !== null;

            if (q) {
                const match =
                    (item.item_code && item.item_code.toLowerCase().includes(q)) ||
                    (item.description && item.description.toLowerCase().includes(q)) ||
                    (item.bin_location && item.bin_location.toLowerCase().includes(q)) ||
                    (item.system_location && item.system_location.toLowerCase().includes(q)) ||
                    (item.scanned_location && item.scanned_location.toLowerCase().includes(q));
                if (!match) return false;
            }

            if (reconFilter === 'uncounted') {
                return hasStock && !isCounted;
            }
            if (reconFilter === 'counted') {
                return isCounted;
            }
            if (reconFilter === 'pending') {
                return isCounted && (item.status === 'PENDING' || item.status === 'PENDING_RECOUNT');
            }
            return hasStock || isCounted; // 'all': solo items con existencia > 0 o contados
        });
    }, [reconItems, searchQuery, reconFilter]);

    const totalReconPages = Math.ceil(filteredReconItems.length / reconPageSize) || 1;
    const paginatedReconItems = useMemo(() => {
        const start = (reconPage - 1) * reconPageSize;
        return filteredReconItems.slice(start, start + reconPageSize);
    }, [filteredReconItems, reconPage, reconPageSize]);

    const handleExportFilteredExcel = async () => {
        if (!filteredReconItems.length) {
            alert('No hay registros para exportar con los filtros actuales.');
            return;
        }
        const formattedData = filteredReconItems.map(item => ({
            'Ítem': item.item_code,
            'Descripción': item.description,
            'Ubicación Sistema': item.system_location || item.bin_location || '—',
            'Ubicación Escaneada': item.scanned_location || item.counted_location || '—',
            'Costo': item.cost,
            'Cant. Sistema': item.system_qty,
            'Etapa 1': item.c1 !== null ? item.c1 : '',
            'Etapa 2': item.c2 !== null ? item.c2 : '',
            'Etapa 3': item.c3 !== null ? item.c3 : '',
            'Etapa 4': item.c4 !== null ? item.c4 : '',
            'Contado': item.is_counted ? item.final_counted : 'Sin Contar',
            'Diferencia': item.is_counted ? item.diff_qty : '',
            'Valor Diferencia': item.is_counted ? item.diff_val : '',
            'Estado': item.is_counted ? (item.status === 'OK' ? 'Cuadrado' : item.status) : 'PENDIENTE CONTEO'
        }));
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
        const filterNames = {
            uncounted: 'Faltan_Por_Contar',
            counted: 'Solo_Contados',
            pending: 'Con_Diferencia',
            all: 'Todos_Los_Items'
        };
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `Inventario_${filterNames[reconFilter] || 'Conciliacion'}_${dateStr}.xlsx`;
        await exportExcelFile(workbook, fileName);
    };

    const fetchReconciliation = useCallback(async () => {
        setReconLoading(true);
        try {
            const res = await fetch('/api/admin/inventory/reconciliation');
            if (!res.ok) throw new Error("Error cargando conciliación");
            const data = await res.json();
            setReconItems(data.items);
        } catch (err) {
            setError(err.message);
        } finally {
            setReconLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/inventory/summary');
            if (!res.ok) throw new Error("Error al cargar estadísticas");
            const data = await res.json();
            setStats(data.stats);
            setStage(data.stage);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', actionUrl: null });

    const openConfirmModal = (actionUrl, title, message) => {
        setConfirmModal({ open: true, title, message, actionUrl });
    };

    const executeAction = async (actionUrl) => {
        setConfirmModal({ open: false, title: '', message: '', actionUrl: null });
        setLoading(true); setMessage(null); setError(null);
        try {
            const res = await fetch(actionUrl, { method: 'POST' });
            if (!res.ok) {
                let errorMsg = "Error en la operación";
                try {
                    const data = await res.json();
                    errorMsg = data.detail || data.message || errorMsg;
                } catch {
                    const text = await res.text();
                    errorMsg = text || `Error HTTP ${res.status} al ejecutar acción.`;
                }
                throw new Error(errorMsg);
            }
            const data = await res.json();
            setMessage(data.message);
            fetchStats();
            fetchReconciliation();
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('logix_events');
                bc.postMessage({ type: 'CYCLE_COUNT_MUTATED' });
                bc.close();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [auditorZones, setAuditorZones] = useState([]);
    const [editedZones, setEditedZones] = useState({});
    const [availableAisles, setAvailableAisles] = useState(['CA', 'EB', 'EC', 'ED', 'EE', 'Piso', 'RA', 'RB', 'RC', 'RD', 'RE']);

    const fetchAvailableAisles = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/inventory/available_aisles');
            if (res.ok) {
                const data = await res.json();
                if (data.aisles && Array.isArray(data.aisles) && data.aisles.length > 0) {
                    setAvailableAisles(data.aisles);
                }
            }
        } catch (e) { console.error(e); }
    }, []);

    const fetchAuditorZones = useCallback(async (forceReset = false) => {
        fetchAvailableAisles();
        try {
            const res = await fetch('/api/admin/inventory/auditor_zones');
            if (res.ok) {
                const data = await res.json();
                setAuditorZones(Array.isArray(data) ? data : []);
                setEditedZones(prev => {
                    const newEdited = { ...prev };
                    if (Array.isArray(data)) {
                        data.forEach(u => {
                            if (forceReset || newEdited[u.id] === undefined) {
                                newEdited[u.id] = u.assigned_zones || '';
                            }
                        });
                    }
                    return newEdited;
                });
            }
        } catch (e) { console.error(e); }
    }, [fetchAvailableAisles]);

    const handleSaveZones = async (userId) => {
        const zonesString = editedZones[userId] || '';
        try {
            const res = await fetch('/api/admin/inventory/assign_zones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, assigned_zones: zonesString })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error guardando zonas");
            }
            setMessage(`Pasillos actualizados correctamente.`);
            fetchAuditorZones(true);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        if (setTitle) setTitle("Adm. Inventario");
    }, [setTitle]);

    useEffect(() => {
        fetchStats();
        if (activeTab === 'reconciliation') {
            fetchReconciliation();
        } else if (activeTab === 'zones') {
            fetchAuditorZones();
        }

        let interval = setInterval(() => {
            if (navigator.onLine && !document.hidden) {
                fetchStats();
            }
        }, 5000);

        let bc;
        if (typeof BroadcastChannel !== 'undefined') {
            bc = new BroadcastChannel('logix_events');
            bc.onmessage = (event) => {
                if (event.data?.type === 'CYCLE_COUNT_MUTATED') {
                    fetchStats();
                    fetchReconciliation();
                    fetchAuditorZones();
                }
            };
        }

        return () => {
            clearInterval(interval);
            if (bc) bc.close();
        };
    }, [activeTab, fetchStats, fetchReconciliation, fetchAuditorZones]);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 20000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 20000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    return (
        <div className="admin-inventory-page max-w-[1400px] mx-auto px-6 pt-4 pb-6 bg-[#fcfcfc] min-h-screen text-[#201f1e] text-[12px]">

            {/* Header de la página */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-xl font-semibold text-[#201f1e] tracking-tight">Administración de Inventario</h1>
                    <p className="text-xs text-[#605e5c]">Control de fases, conciliación de existencias y asignación de zonas</p>
                </div>
            </div>

            {message && (
                <div className="bg-[#dff6dd] border-l-4 border-[#107c10] text-[#107c10] px-4 py-2.5 mb-4 rounded-r shadow-xs text-xs flex justify-between items-center">
                    <span>{message}</span>
                    <button onClick={() => setMessage(null)} className="ml-4 font-bold text-[#107c10] hover:opacity-80 cursor-pointer">✕</button>
                </div>
            )}
            {error && (
                <div className="bg-[#fde7e9] border-l-4 border-[#a4262c] text-[#a4262c] px-4 py-2.5 mb-4 rounded-r shadow-xs text-xs flex justify-between items-center">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-4 font-bold text-[#a4262c] hover:opacity-80 cursor-pointer">✕</button>
                </div>
            )}

            {/* Tab Navigation (Fluent Pivot) */}
            <div className="flex border-b border-[#d2d0ce] mb-6 gap-1">
                <button
                    onClick={() => setActiveTab('cycle')}
                    className={`px-5 py-2.5 text-xs transition-colors cursor-pointer border-b-2 ${
                        activeTab === 'cycle'
                            ? 'border-[#0078d4] text-[#0078d4] font-semibold'
                            : 'border-transparent text-[#605e5c] hover:text-[#201f1e] hover:border-[#c7e0f4] font-normal'
                    }`}
                >
                    Fases del Inventario
                </button>
                <button
                    onClick={() => setActiveTab('reconciliation')}
                    className={`px-5 py-2.5 text-xs transition-colors cursor-pointer border-b-2 ${
                        activeTab === 'reconciliation'
                            ? 'border-[#0078d4] text-[#0078d4] font-semibold'
                            : 'border-transparent text-[#605e5c] hover:text-[#201f1e] hover:border-[#c7e0f4] font-normal'
                    }`}
                >
                    Estado de Inventario y Conciliación
                </button>
                <button
                    onClick={() => setActiveTab('zones')}
                    className={`px-5 py-2.5 text-xs transition-colors cursor-pointer border-b-2 ${
                        activeTab === 'zones'
                            ? 'border-[#0078d4] text-[#0078d4] font-semibold'
                            : 'border-transparent text-[#605e5c] hover:text-[#201f1e] hover:border-[#c7e0f4] font-normal'
                    }`}
                >
                    Asignación de Zonas por Auditor
                </button>
            </div>

            {activeTab === 'cycle' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    <div className="lg:col-span-3 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                {
                                    s: 1,
                                    t: 'FASE 1: CONTEO GENERAL',
                                    d: 'Apertura del ciclo. Reseteo de bases de datos y captura inicial física wall-to-wall.',
                                    actionUrl: stage === 0 ? '/api/admin/inventory/start_stage_1' : '/api/admin/inventory/advance_stage/2',
                                    title: stage === 0 ? '¿Iniciar Fase 1 (Conteo General)?' : '¿Concluir Fase 1 y Avanzar a Reconteo R1?',
                                    message: stage === 0
                                        ? 'Al iniciar el ciclo se resetearán las capturas previas para comenzar el nuevo conteo general.'
                                        : 'Al concluir la Fase 1 se consolidarán las capturas actuales y se generará automáticamente la lista de reconteo (R1) para los ítems con diferencias o faltantes.',
                                    label: stage === 0 ? 'INICIAR FASE 1' : stage === 1 ? 'CONCLUIR FASE 1' : 'FASE COMPLETADA',
                                    enabled: stage === 0 || stage === 1
                                },
                                {
                                    s: 2,
                                    t: 'FASE 2: RECONTEO R1',
                                    d: 'Cálculo de diferencias de Fase 1 y verificación de discrepancias en campo.',
                                    actionUrl: '/api/admin/inventory/advance_stage/3',
                                    title: '¿Concluir Fase 2 (Reconteo R1)?',
                                    message: 'Al concluir la Fase 2 se evaluarán las diferencias persistentes y se generará la lista de reconteo R2 para la Fase 3.',
                                    label: stage < 2 ? 'EN ESPERA' : stage === 2 ? 'CONCLUIR FASE 2' : 'FASE COMPLETADA',
                                    enabled: stage === 2
                                },
                                {
                                    s: 3,
                                    t: 'FASE 3: RECONTEO R2',
                                    d: 'Segunda validación enfocada en discrepancias persistentes.',
                                    actionUrl: '/api/admin/inventory/advance_stage/4',
                                    title: '¿Concluir Fase 3 (Reconteo R2)?',
                                    message: 'Al concluir la Fase 3 se pasará a la Fase 4 de Auditoría y Cierre Final.',
                                    label: stage < 3 ? 'EN ESPERA' : stage === 3 ? 'CONCLUIR FASE 3' : 'FASE COMPLETADA',
                                    enabled: stage === 3
                                },
                                {
                                    s: 4,
                                    t: 'FASE 4: AUDITORÍA FINAL',
                                    d: 'Validación técnica final e informe consolidado previa al cierre del ejercicio.',
                                    actionUrl: '/api/admin/inventory/report',
                                    isDownload: true,
                                    title: '¿Generar Informe de Cierre (Fase 4)?',
                                    message: 'Se consolidará y descargará el informe final maestro W2W en Excel con los conteos y diferencias de todas las etapas.',
                                    label: stage < 4 ? 'EN ESPERA' : stage === 4 ? 'INFORME DE CIERRE' : 'FASE COMPLETADA',
                                    enabled: stage === 4
                                }
                            ].map((item) => (
                                <div key={item.s} className={`p-6 border bg-white shadow-sm transition-all ${stage === item.s ? 'border-black ring-1 ring-black' : 'border-zinc-200 opacity-60'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-[12px] font-normal text-black uppercase">{item.t}</h3>
                                         <span className={`text-[10px] font-normal px-2 py-0.5 rounded uppercase ${
                                             stage === item.s
                                                 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                 : stage > item.s
                                                 ? 'bg-slate-100 text-black border border-slate-300'
                                                 : 'bg-zinc-50 text-zinc-500 border border-zinc-200'
                                         }`}>
                                             {stage === item.s ? '● ACTIVO' : stage > item.s ? '✓ COMPLETADO' : `FASE 0${item.s}`}
                                         </span>
                                    </div>
                                    <p className="text-[12px] text-black mb-6 leading-relaxed uppercase font-normal">{item.d}</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                if (item.isDownload) {
                                                    window.location.href = item.actionUrl;
                                                } else {
                                                    openConfirmModal(item.actionUrl, item.title, item.message);
                                                }
                                            }}
                                            disabled={loading || !item.enabled}
                                            className={`flex-1 h-8 text-xs font-normal uppercase rounded transition-colors cursor-pointer ${
                                                stage === item.s
                                                    ? 'bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] text-white shadow-xs'
                                                    : 'bg-[#f3f2f1] text-[#a19f9d] border border-[#d2d0ce] disabled:opacity-50 cursor-not-allowed'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                        {stage >= item.s && !item.isDownload && (
                                            <button
                                                onClick={() => {
                                                    if (item.s === 1) {
                                                        window.location.href = '/api/export_counts?stage=1';
                                                    } else {
                                                        window.location.href = `/api/export_recount_list/${item.s}`;
                                                    }
                                                }}
                                                title={`Descargar Listado / Registro de Fase ${item.s}`}
                                                className="px-3 border border-[#d2d0ce] rounded bg-white hover:bg-[#f3f2f1] text-[#201f1e] font-normal text-xs flex items-center justify-center shadow-2xs cursor-pointer"
                                            >
                                                Excel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={`p-8 border-2 border-dashed transition-all rounded ${stage === 4 ? 'border-[#0078d4] bg-[#eff6fc]/30' : 'border-[#d2d0ce] bg-transparent opacity-50'}`}>
                             <div className="flex flex-col items-center text-center">
                                <h3 className="text-xs font-semibold text-[#201f1e] mb-1 uppercase">Finalización y Cierre del Ejercicio</h3>
                                <p className="text-xs text-[#605e5c] mb-6">Cierre definitivo de registros y reinicio para un nuevo ciclo</p>
                                <div className="flex gap-4 w-full max-w-md">
                                    <button
                                        onClick={() => window.location.href = `/api/admin/inventory/report`}
                                        disabled={stage !== 4}
                                        className="flex-1 h-9 bg-white border border-[#d2d0ce] text-[#201f1e] text-xs font-normal uppercase rounded hover:bg-[#f3f2f1] disabled:opacity-50 transition-all shadow-xs cursor-pointer flex items-center justify-center"
                                    >
                                        Reporte Excel
                                    </button>
                                    <button
                                        onClick={() => openConfirmModal(
                                            '/api/admin/inventory/finalize',
                                            '¿Cerrar y Reiniciar Ciclo de Inventario?',
                                            '⚠️ ATENCIÓN: Esta acción finalizará el ejercicio activo, congelará la base de datos actual y reiniciará el sistema a estado inicial (Fase 0) para un nuevo inventario. ¿Desea proceder?'
                                        )}
                                        disabled={loading || stage !== 4}
                                        className="flex-1 h-9 bg-[#a4262c] hover:bg-[#8e1922] text-white text-xs font-normal uppercase rounded disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                                    >
                                        Cerrar Ciclo
                                    </button>
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* Resumen Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded shadow-sm border border-zinc-200 sticky top-20">
                            <h2 className="text-[12px] font-normal text-black mb-4 border-b pb-2">Estado del Inventario</h2>
                            {!stats ? (
                                <div className="text-center py-6 text-black text-[12px]">Cargando estadísticas...</div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <div className="text-[12px] text-black uppercase font-normal mb-1">Items Registrados</div>
                                        <div className="text-2xl font-normal text-black font-mono">{stats.items_count}</div>
                                    </div>
                                    <div>
                                        <div className="text-[12px] text-black uppercase font-normal mb-1">Registros de Campo</div>
                                        <div className="text-2xl font-normal text-black font-mono">{stats.total_counts}</div>
                                    </div>
                                     <div className="pt-4 border-t border-zinc-100">
                                        <div className="text-[12px] text-black uppercase font-normal mb-1">Fase Activa</div>
                                        <div className="text-sm font-normal text-black uppercase">
                                            {stats.current_stage === 0 ? 'Sin Iniciar' : `Fase ${stats.current_stage}`}
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-zinc-50 space-y-4">
                                        {stats?.stages && Object.entries(stats.stages).map(([sNum, sStats]) => (
                                            <div key={sNum} className="flex justify-between items-center text-[12px] group py-0.5 border-b border-transparent hover:border-zinc-100">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 group-hover:bg-black transition-colors"></span>
                                                    <span className="text-black group-hover:text-black transition-colors uppercase font-normal text-[12px]">Stage 0{sNum} Accuracy</span>
                                                </div>
                                                <span className="font-mono font-normal text-black text-[12px]">{sStats.accuracy}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}



            {activeTab === 'reconciliation' && (
                <div className="space-y-6">
                    <div>
                        {/* Panel de Conciliación Principal */}
                        <div className="w-full">
                            <div className="bg-white shadow-sm rounded border border-[#d2d0ce] overflow-hidden">
                                <div className="bg-[#f9f9f9] px-4 py-2.5 border-b border-[#d2d0ce] flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3">
                                    <div className="flex gap-3 flex-1 items-center flex-wrap">
                                        <div className="relative flex-1 min-w-[240px] max-w-[360px]">
                                            <input
                                                type="text"
                                                placeholder="Buscar SKU, descripción o ubicación..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="h-8 w-full px-3 pr-7 text-xs bg-white border border-[#d2d0ce] rounded focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] outline-none text-[#201f1e] placeholder-[#8a8886] transition-colors"
                                            />
                                            {searchQuery && (
                                                <button
                                                    onClick={() => setSearchQuery('')}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8a8886] hover:text-[#201f1e] text-xs font-bold cursor-pointer"
                                                    title="Limpiar búsqueda"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap items-center">
                                            <button
                                                onClick={() => setReconFilter('uncounted')}
                                                className={`px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer flex items-center ${
                                                    reconFilter === 'uncounted'
                                                        ? 'bg-[#0078d4] border-[#0078d4] text-white font-medium shadow-xs'
                                                        : 'bg-white border-[#d2d0ce] text-[#201f1e] hover:bg-[#f3f2f1]'
                                                }`}
                                            >
                                                <span>Faltan por Contar</span>
                                                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-medium ${
                                                    reconFilter === 'uncounted' ? 'bg-white/20 text-white' : 'bg-[#fff4ce] text-[#ca5010] border border-[#fed9cc]'
                                                }`}>
                                                    {reconCounts.uncounted}
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setReconFilter('counted')}
                                                className={`px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer flex items-center ${
                                                    reconFilter === 'counted'
                                                        ? 'bg-[#0078d4] border-[#0078d4] text-white font-medium shadow-xs'
                                                        : 'bg-white border-[#d2d0ce] text-[#201f1e] hover:bg-[#f3f2f1]'
                                                }`}
                                            >
                                                <span>Solo Contados</span>
                                                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-medium ${
                                                    reconFilter === 'counted' ? 'bg-white/20 text-white' : 'bg-[#edebe9] text-[#605e5c]'
                                                }`}>
                                                    {reconCounts.counted}
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setReconFilter('pending')}
                                                className={`px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer flex items-center ${
                                                    reconFilter === 'pending'
                                                        ? 'bg-[#0078d4] border-[#0078d4] text-white font-medium shadow-xs'
                                                        : 'bg-white border-[#d2d0ce] text-[#201f1e] hover:bg-[#f3f2f1]'
                                                }`}
                                            >
                                                <span>Con Diferencia</span>
                                                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-medium ${
                                                    reconFilter === 'pending' ? 'bg-white/20 text-white' : 'bg-[#fde7e9] text-[#a4262c] border border-[#f8b6be]'
                                                }`}>
                                                    {reconCounts.pending}
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setReconFilter('all')}
                                                className={`px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer flex items-center ${
                                                    reconFilter === 'all'
                                                        ? 'bg-[#0078d4] border-[#0078d4] text-white font-medium shadow-xs'
                                                        : 'bg-white border-[#d2d0ce] text-[#201f1e] hover:bg-[#f3f2f1]'
                                                }`}
                                            >
                                                <span>Todos</span>
                                                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-medium ${
                                                    reconFilter === 'all' ? 'bg-white/20 text-white' : 'bg-[#edebe9] text-[#605e5c]'
                                                }`}>
                                                    {reconCounts.total}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center shrink-0">
                                        <button
                                            onClick={fetchReconciliation}
                                            disabled={reconLoading}
                                            className="h-8 px-3 text-xs text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f2f1] active:bg-[#edebe9] rounded font-normal transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                                            title="Actualizar datos de conciliación"
                                        >
                                            {reconLoading ? 'Actualizando...' : 'Refrescar'}
                                        </button>
                                        <button
                                            onClick={handleExportFilteredExcel}
                                            className="h-8 px-3 text-xs text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f2f1] active:bg-[#edebe9] rounded font-normal transition-colors cursor-pointer shadow-xs"
                                            title="Exportar vista actual filtrada a Excel (.xlsx)"
                                        >
                                            Exportar Excel
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto max-h-[calc(100vh-360px)]">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-zinc-100 text-zinc-800 border-b border-zinc-300 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                {[
                                                    'Ítem',
                                                    'Descripción',
                                                    'Ubic. Sistema',
                                                    'Ubic. Escaneada',
                                                    'Costo',
                                                    'Sist',
                                                    'Etapa 1',
                                                    'Etapa 2',
                                                    'Etapa 3',
                                                    'Etapa 4',
                                                    'Contado',
                                                    'Diff',
                                                    'Valor Diff',
                                                ].map((h, i) => (
                                                    <th
                                                        key={i}
                                                        className={`px-2 py-1 text-[10px] font-normal uppercase ${['Ítem', 'Descripción', 'Ubic. Sistema', 'Ubic. Escaneada'].includes(h) ? 'text-left' : 'text-center'}`}
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100">
                                            {paginatedReconItems.map((item) => (
                                                <tr
                                                    key={item.item_code}
                                                    className="hover:bg-[#f5f8fc] transition-colors leading-none h-6"
                                                >
                                                    <td className="px-2 py-0.5 text-left text-sm font-normal text-zinc-900 uppercase whitespace-nowrap">
                                                        {item.item_code}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-left text-sm font-normal text-zinc-600 truncate max-w-[200px]" title={item.description}>
                                                        {item.description}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-left text-sm font-normal text-zinc-700 uppercase whitespace-nowrap">
                                                        {item.system_location || item.bin_location || '—'}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-left text-sm font-normal text-zinc-700 uppercase whitespace-nowrap">
                                                        {item.scanned_location || item.counted_location || '—'}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-center font-normal text-sm">
                                                        ${item.cost.toFixed(2)}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-center font-normal text-sm text-zinc-600 bg-zinc-50/50">
                                                        {item.system_qty}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-center font-normal text-sm text-zinc-500">
                                                        {item.c1 !== null ? item.c1 : '-'}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-center font-normal text-sm text-zinc-500">
                                                        {item.c2 !== null ? item.c2 : '-'}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-center font-normal text-sm text-zinc-500">
                                                        {item.c3 !== null ? item.c3 : '-'}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-center font-normal text-sm text-zinc-500">
                                                        {item.c4 !== null ? item.c4 : '-'}
                                                    </td>
                                                    <td className="px-2 py-0.5 text-center font-normal text-sm bg-zinc-50/50">
                                                        {item.is_counted ? item.final_counted : (
                                                            <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded text-[10px] font-normal uppercase">
                                                                Sin Contar
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td
                                                        className={`px-2 py-0.5 text-center font-normal text-sm ${
                                                            !item.is_counted
                                                                ? 'text-zinc-400'
                                                                : item.diff_qty > 0
                                                                ? 'text-green-600'
                                                                : item.diff_qty < 0
                                                                ? 'text-red-600'
                                                                : 'text-zinc-400'
                                                        }`}
                                                    >
                                                        {!item.is_counted ? '-' : item.diff_qty > 0 ? `+${item.diff_qty}` : item.diff_qty}
                                                    </td>
                                                    <td
                                                        className={`px-2 py-0.5 text-center font-normal text-sm ${
                                                            !item.is_counted
                                                                ? 'text-zinc-400'
                                                                : item.diff_val > 0
                                                                ? 'text-green-600'
                                                                : item.diff_val < 0
                                                                ? 'text-red-600'
                                                                : 'text-zinc-400'
                                                        }`}
                                                    >
                                                        {!item.is_counted ? '-' : item.diff_val > 0 ? `+$${item.diff_val.toFixed(2)}` : `$${item.diff_val.toFixed(2)}`}
                                                    </td>
                                                </tr>
                                            ))}
                                            {filteredReconItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={13} className="text-center py-8 text-zinc-400 italic">
                                                        No hay datos para mostrar con los filtros seleccionados.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {filteredReconItems.length > 0 && (
                                    <div className="bg-[#f9f9f9] px-4 py-2 border-t border-[#d2d0ce] flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-xs text-[#605e5c] w-full box-border min-h-[40px]">
                                        {/* Selector de cantidad y resumen de registros */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                <span>Mostrar:</span>
                                                <select
                                                    value={reconPageSize}
                                                    onChange={(e) => {
                                                        setReconPageSize(Number(e.target.value));
                                                        setReconPage(1);
                                                    }}
                                                    className="h-7 border border-[#d2d0ce] rounded px-1.5 bg-white text-xs text-[#201f1e] outline-none cursor-pointer focus:border-[#0078d4] shadow-2xs"
                                                >
                                                    <option value={50}>50</option>
                                                    <option value={100}>100</option>
                                                    <option value={250}>250</option>
                                                    <option value={500}>500</option>
                                                </select>
                                                <span>por página</span>
                                            </div>
                                            <span className="text-[#d2d0ce] hidden sm:inline">|</span>
                                            <div className="whitespace-nowrap">
                                                Mostrando <span className="font-semibold text-[#201f1e]">{((reconPage - 1) * reconPageSize) + 1}</span> - <span className="font-semibold text-[#201f1e]">{Math.min(reconPage * reconPageSize, filteredReconItems.length)}</span> de <span className="font-semibold text-[#201f1e]">{filteredReconItems.length}</span> ítems
                                            </div>
                                        </div>

                                        {/* Botones de paginación con margen seguro respecto al borde derecho */}
                                        <div className="flex items-center gap-1 shrink-0 ml-auto pr-3">
                                            <button
                                                onClick={() => setReconPage(1)}
                                                disabled={reconPage === 1}
                                                className="h-7 w-7 flex items-center justify-center border border-[#d2d0ce] rounded bg-white hover:bg-[#f3f2f1] text-[#201f1e] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors text-xs select-none shadow-2xs"
                                                title="Primera página"
                                            >
                                                «
                                            </button>
                                            <button
                                                onClick={() => setReconPage(p => Math.max(1, p - 1))}
                                                disabled={reconPage === 1}
                                                className="h-7 px-2.5 flex items-center justify-center border border-[#d2d0ce] rounded bg-white hover:bg-[#f3f2f1] text-[#201f1e] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors whitespace-nowrap text-xs select-none shadow-2xs"
                                                title="Página anterior"
                                            >
                                                ‹ Ant
                                            </button>
                                            <span className="h-7 px-2 flex items-center justify-center font-medium text-[#201f1e] whitespace-nowrap text-xs select-none">
                                                {reconPage} / {totalReconPages}
                                            </span>
                                            <button
                                                onClick={() => setReconPage(p => Math.min(totalReconPages, p + 1))}
                                                disabled={reconPage === totalReconPages}
                                                className="h-7 px-2.5 flex items-center justify-center border border-[#d2d0ce] rounded bg-white hover:bg-[#f3f2f1] text-[#201f1e] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors whitespace-nowrap text-xs select-none shadow-2xs"
                                                title="Página siguiente"
                                            >
                                                Sig ›
                                            </button>
                                            <button
                                                onClick={() => setReconPage(totalReconPages)}
                                                disabled={reconPage === totalReconPages}
                                                className="h-7 w-7 flex items-center justify-center border border-[#d2d0ce] rounded bg-white hover:bg-[#f3f2f1] text-[#201f1e] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors text-xs select-none shadow-2xs"
                                                title="Última página"
                                            >
                                                »
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Asignación de Zonas */}
            {activeTab === 'zones' && (
                <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs text-black">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-zinc-100">
                        <div>
                            <h2 className="text-sm font-normal text-black uppercase">
                                Asignación de Zonas y Pasillos a Auditores
                            </h2>
                            <p className="text-[11px] text-zinc-500 font-normal">
                                Seleccione los pasillos autorizados para cada auditor en la matriz inferior.
                            </p>
                            <div className="mt-2 p-2 bg-[#fff4ce] border border-[#fed9cc] rounded text-xs text-[#7a4100] font-normal">
                                <strong>Nota:</strong> Si no se marca ningún pasillo, el auditor mantiene acceso a todos los pasillos.
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-300 bg-zinc-100 text-[11px] text-zinc-800 uppercase font-normal">
                                    <th className="px-3 py-1.5 text-zinc-800">ID</th>
                                    <th className="px-3 py-1.5 text-zinc-800">Usuario Auditor</th>
                                    <th className="px-3 py-1.5 text-zinc-800">Pasillos Asignados</th>
                                    <th className="px-3 py-1.5 text-right text-zinc-800">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {(auditorZones || []).map((userItem) => {
                                    const currentStr = editedZones[userItem.id] ?? userItem.assigned_zones ?? '';
                                    const activeList = currentStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

                                    return (
                                        <tr key={userItem.id} className="hover:bg-zinc-50/60 transition-colors">
                                            <td className="px-3 py-1 font-mono text-sm text-zinc-500">{userItem.id}</td>
                                            <td className="px-3 py-1 font-normal text-black text-sm uppercase">{userItem.username}</td>
                                            <td className="px-3 py-1 space-y-2">
                                                {/* Lista compacta de pasillos oficiales con Checkboxes en una sola fila */}
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {availableAisles.map(aisle => {
                                                        const isChecked = activeList.includes(aisle.toUpperCase());
                                                        const toggleAisle = () => {
                                                            let newList;
                                                            if (isChecked) {
                                                                newList = activeList.filter(a => a !== aisle.toUpperCase());
                                                            } else {
                                                                newList = [...activeList, aisle.toUpperCase()];
                                                            }
                                                            setEditedZones({ ...editedZones, [userItem.id]: newList.join(', ') });
                                                        };

                                                        return (
                                                            <label
                                                                key={aisle}
                                                                className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors cursor-pointer text-xs font-mono select-none ${
                                                                    isChecked
                                                                        ? 'border-[#0078d4] bg-[#eff6fc] text-[#0078d4] font-medium shadow-2xs'
                                                                        : 'border-[#d2d0ce] bg-white text-[#605e5c] hover:bg-[#f3f2f1] font-normal'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={toggleAisle}
                                                                    className="w-3.5 h-3.5 rounded border-[#8a8886] text-[#0078d4] focus:ring-[#0078d4] cursor-pointer accent-[#0078d4] shrink-0"
                                                                />
                                                                <span className="whitespace-nowrap">{aisle}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-3 py-1 text-right">
                                                <button
                                                    onClick={() => handleSaveZones(userItem.id)}
                                                    className="px-3.5 py-1 bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] text-white text-xs font-normal rounded transition-colors shadow-xs cursor-pointer"
                                                >
                                                    Guardar Pasillos
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {(auditorZones || []).length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="text-center py-8 text-zinc-400 italic font-normal">
                                            No se encontraron usuarios auditores en el sistema.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.open && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white max-w-md w-full rounded-xl shadow-xl border border-slate-200 p-5 text-black">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-base font-normal shrink-0">
                                ⚠️
                            </div>
                            <div>
                                <h3 className="text-xs font-normal text-black uppercase">
                                    {confirmModal.title}
                                </h3>
                                <p className="text-[9px] text-zinc-500 uppercase">
                                    Confirmación de Transición de Fase
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-black leading-relaxed mb-5 bg-slate-50 p-3 rounded border border-slate-200 font-normal">
                            {confirmModal.message}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmModal({ open: false, title: '', message: '', actionUrl: null })}
                                className="px-4 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-black text-[10px] font-normal uppercase rounded transition-colors cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => executeAction(confirmModal.actionUrl)}
                                className="px-5 py-1.5 bg-black hover:bg-zinc-800 text-white text-[10px] font-normal uppercase rounded shadow-xs transition-all cursor-pointer"
                            >
                                Sí, Concluir Fase
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminInventory;
