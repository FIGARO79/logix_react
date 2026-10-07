import React, { useState, useEffect, useMemo } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import '../styles/FluentPages.css';

const InboundAudit = () => {
    const { setTitle } = useOutletContext();
    const queryClient = useQueryClient();

    // Filtros y pestañas
    const [searchTerm, setSearchTerm] = useState('');
    const [searchLogic, setSearchLogic] = useState('auto'); // 'auto', 'and', 'or'
    const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'shortage', 'surplus', 'swap', 'recurrent'
    const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history'

    // Estados de modales
    const [selectedClaimModal, setSelectedClaimModal] = useState(null); // Alerta para reclamo individual
    const [resolveModalAlert, setResolveModalAlert] = useState(null); // Alerta para resolver
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [resolveStatus, setResolveStatus] = useState('resolved'); // 'resolved', 'dismissed'
    const [selectedAlertIds, setSelectedAlertIds] = useState([]);
    const [isBulkResolve, setIsBulkResolve] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [showConsolidatedModal, setShowConsolidatedModal] = useState(false);
    const [consolidatedIR, setConsolidatedIR] = useState('');

    // Estados de acciones en ejecución
    const [runningAudit, setRunningAudit] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [actionMessage, setActionMessage] = useState(null);

    useEffect(() => {
        setTitle("Auditoría de Inbound");
    }, [setTitle]);

    // --- QUERY REACTIVA DIRIGIDA POR EVENTOS (SIN POLLING CONSTANTE) ---
    const {
        data: alerts = [],
        isLoading,
        refetch
    } = useQuery({
        queryKey: ['inbound-auditor-alerts'],
        queryFn: async () => {
            const res = await fetch('/api/inbound/auditor/alerts', { credentials: 'include' });
            if (!res.ok) throw new Error("Error al consultar las alertas de auditoría.");
            return res.json();
        },
        refetchOnWindowFocus: true,
    });

    // Sincronización automática dirigida por eventos al ingresar o modificar recepciones
    useEffect(() => {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('logix_events');
            bc.onmessage = (event) => {
                if (event.data?.type === 'INBOUND_MUTATED') {
                    setTimeout(() => {
                        refetch();
                    }, 350);
                }
            };
            return () => bc.close();
        }
    }, [refetch]);

    const showNotification = (msg, isError = false) => {
        setActionMessage({ text: msg, isError });
        setTimeout(() => setActionMessage(null), 4000);
    };

    // Ejecución manual forzada de la auditoría
    const handleRunAudit = async () => {
        setRunningAudit(true);
        try {
            const res = await fetch('/api/inbound/auditor/run', {
                method: 'POST',
                credentials: 'include'
            });
            if (!res.ok) throw new Error("Error al ejecutar la auditoría algorítmica.");
            const result = await res.json();
            showNotification(
                `Auditoría ejecutada: ${result.new_alerts || 0} nuevas, ${result.updated_alerts || 0} actualizadas dinámicamente, ${result.auto_resolved || 0} auto-resueltas.`
            );
            queryClient.invalidateQueries({ queryKey: ['inbound-auditor-alerts'] });
        } catch (err) {
            showNotification(err.message, true);
        } finally {
            setRunningAudit(false);
        }
    };

    // Limpieza de base de datos de alertas
    const handleClearAlerts = async (target) => {
        setClearing(true);
        try {
            const res = await fetch(`/api/inbound/auditor/clear?target=${target}`, {
                method: 'POST',
                credentials: 'include'
            });
            if (!res.ok) throw new Error("Error al limpiar las alertas de auditoría.");
            const data = await res.json();
            showNotification(data.message || "Limpieza realizada con éxito.");
            setShowClearModal(false);
            queryClient.invalidateQueries({ queryKey: ['inbound-auditor-alerts'] });
        } catch (err) {
            showNotification(err.message, true);
        } finally {
            setClearing(false);
        }
    };

    // Envío de resolución (individual o masivo)
    const handleResolveSubmit = async (e) => {
        e.preventDefault();
        if (!isBulkResolve && !resolveModalAlert) return;
        if (isBulkResolve && selectedAlertIds.length === 0) return;

        try {
            const url = isBulkResolve
                ? '/api/inbound/auditor/alerts/resolve-bulk'
                : `/api/inbound/auditor/alerts/${resolveModalAlert.id}/resolve`;

            const body = isBulkResolve
                ? { alert_ids: selectedAlertIds, status: resolveStatus, resolution_notes: resolutionNotes }
                : { status: resolveStatus, resolution_notes: resolutionNotes };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include'
            });

            if (!res.ok) throw new Error(isBulkResolve ? "No se pudieron resolver las alertas." : "No se pudo resolver la alerta.");

            showNotification(isBulkResolve ? "Alertas resueltas con éxito." : "Alerta resuelta con éxito.");
            setResolveModalAlert(null);
            setIsBulkResolve(false);
            setResolutionNotes('');
            setSelectedAlertIds([]);
            queryClient.invalidateQueries({ queryKey: ['inbound-auditor-alerts'] });
        } catch (err) {
            showNotification(err.message, true);
        }
    };

    // Selección masiva
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const visiblePendingIds = filteredAlerts
                .filter(a => a.status === 'pending')
                .map(a => a.id);
            setSelectedAlertIds(visiblePendingIds);
        } else {
            setSelectedAlertIds([]);
        }
    };

    const handleSelectRow = (alertId) => {
        setSelectedAlertIds(prev =>
            prev.includes(alertId)
                ? prev.filter(id => id !== alertId)
                : [...prev, alertId]
        );
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        showNotification("Copiado al portapapeles.");
    };

    const openMailClient = (subject, body) => {
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    };

    // --- CÁLCULO DE MÉTRICAS GLOBALES ---
    const metrics = useMemo(() => {
        const pending = alerts.filter(a => a.status === 'pending');
        const resolved = alerts.filter(a => a.status === 'resolved');
        const dismissed = alerts.filter(a => a.status === 'dismissed');

        const shortages = pending.filter(a => a.difference < 0);
        const surpluses = pending.filter(a => a.difference > 0);
        const swaps = pending.filter(a => a.notes && a.notes.includes("Posible cruce/troca"));

        const totalShortageRisk = shortages.reduce((acc, a) => acc + (a.financial_impact || 0), 0);
        const totalSurplusUnits = surpluses.reduce((acc, a) => acc + a.difference, 0);

        const totalFinished = resolved.length + dismissed.length;
        const totalOverall = alerts.length;
        const conciliationRate = totalOverall > 0 ? Math.round((totalFinished / totalOverall) * 100) : 100;

        return {
            total: totalOverall,
            countPending: pending.length,
            countResolved: resolved.length,
            countDismissed: dismissed.length,
            shortagesCount: shortages.length,
            totalShortageRisk,
            surplusesCount: surpluses.length,
            totalSurplusUnits,
            swapsCount: swaps.length,
            conciliationRate
        };
    }, [alerts]);

    // Lista de Import References con faltantes pendientes (para reclamo consolidado)
    const activeImportRefsWithShortages = useMemo(() => {
        const irMap = {};
        alerts
            .filter(a => a.status === 'pending' && a.difference < 0)
            .forEach(a => {
                if (!irMap[a.import_reference]) {
                    irMap[a.import_reference] = [];
                }
                irMap[a.import_reference].push(a);
            });
        return irMap;
    }, [alerts]);

    const hasActiveFilters = Boolean(searchTerm || typeFilter !== 'all');

    const clearAllFilters = () => {
        setSearchTerm('');
        setSearchLogic('auto');
        setTypeFilter('all');
    };

    // Lista de argumentos de búsqueda separados por comas
    const searchTerms = useMemo(() => {
        if (!searchTerm) return [];
        return searchTerm
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(Boolean);
    }, [searchTerm]);

    // Función auxiliar de coincidencia de un término contra los campos de una alerta
    const alertMatchesTerm = (alert, term) => {
        if (!term) return true;
        return Boolean(
            alert.item_code?.toLowerCase().includes(term) ||
            alert.description?.toLowerCase().includes(term) ||
            alert.import_reference?.toLowerCase().includes(term) ||
            alert.waybill?.toLowerCase().includes(term) ||
            alert.grn?.toLowerCase().includes(term) ||
            alert.notes?.toLowerCase().includes(term) ||
            alert.resolution_notes?.toLowerCase().includes(term)
        );
    };

    // Base filtrada previamente por pestaña y tipo
    const baseFilteredAlerts = useMemo(() => {
        return alerts.filter(alert => {
            // Filtro por pestaña
            if (activeTab === 'pending' && alert.status !== 'pending') return false;
            if (activeTab === 'history' && alert.status === 'pending') return false;

            // Filtro por tipo
            if (typeFilter === 'shortage' && alert.difference >= 0) return false;
            if (typeFilter === 'surplus' && alert.difference <= 0) return false;
            if (typeFilter === 'recurrent' && alert.alert_type !== 'recurrent_shortage') return false;
            if (typeFilter === 'swap' && (!alert.notes || !alert.notes.includes("Posible cruce/troca"))) return false;

            return true;
        });
    }, [alerts, activeTab, typeFilter]);

    // Verificación de si existe al menos una alerta que coincida con TODOS los términos simultáneamente (AND)
    const hasIntersection = useMemo(() => {
        if (searchTerms.length <= 1) return false;
        return baseFilteredAlerts.some(alert => searchTerms.every(t => alertMatchesTerm(alert, t)));
    }, [baseFilteredAlerts, searchTerms]);

    // Lógica efectiva de búsqueda: 'and' (Todos) u 'or' (Cualquiera)
    const effectiveSearchLogic = useMemo(() => {
        if (searchLogic !== 'auto') return searchLogic;
        return hasIntersection ? 'and' : 'or';
    }, [searchLogic, hasIntersection]);

    // Filtrado de alertas por argumentos ingresados (uno o múltiples separados por comas)
    const filteredAlerts = useMemo(() => {
        if (searchTerms.length === 0) return baseFilteredAlerts;

        if (searchTerms.length === 1) {
            return baseFilteredAlerts.filter(alert => alertMatchesTerm(alert, searchTerms[0]));
        }

        if (effectiveSearchLogic === 'and') {
            return baseFilteredAlerts.filter(alert => searchTerms.every(t => alertMatchesTerm(alert, t)));
        } else {
            return baseFilteredAlerts.filter(alert => searchTerms.some(t => alertMatchesTerm(alert, t)));
        }
    }, [baseFilteredAlerts, searchTerms, effectiveSearchLogic]);

    const formatDate = (isoString) => {
        if (!isoString) return '-';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        return date.toLocaleString('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    // Generador de reclamo consolidado para una IR
    const consolidatedClaimData = useMemo(() => {
        if (!consolidatedIR || !activeImportRefsWithShortages[consolidatedIR]) return null;
        const items = activeImportRefsWithShortages[consolidatedIR];
        const totalItems = items.length;
        const totalDiffUnits = items.reduce((sum, i) => sum + Math.abs(i.difference), 0);
        const totalFinancialImpact = items.reduce((sum, i) => sum + (i.financial_impact || 0), 0);
        const waybill = items[0]?.waybill || 'N/A';

        const linesText = items.map((it, idx) => 
            `${idx + 1}. Item: ${it.item_code} | Desc: ${it.description || 'N/A'} | Esperado: ${it.qty_expected} | Recibido: ${it.qty_received} | Faltante: ${it.difference} un. | Impacto: $${(it.financial_impact || 0).toFixed(2)}`
        ).join('\n');

        const subject = `Reclamo Consolidado de Recepcion - Import Reference: ${consolidatedIR} (Waybill: ${waybill})`;
        const body = `Asunto: ${subject}\n\nEstimado Proveedor,\n\nA traves del Agente de Auditoria de LOGIX WMS, notificamos la deteccion consolidada de discrepancias fisicas (faltantes) en la recepcion correspondiente a la Import Reference: ${consolidatedIR} (Waybill: ${waybill}).\n\nResumen General:\n- Total de referencias con faltante: ${totalItems}\n- Unidades totales faltantes: ${totalDiffUnits}\n- Valor monetario estimado en faltantes: $${totalFinancialImpact.toFixed(2)} USD\n\nDetalle de Items Afectados:\n${linesText}\n\nSolicitamos su colaboracion para verificar este despacho en sus registros y confirmar el envio de las unidades faltantes o la correspondiente nota de credito.\n\nAtentamente,\nDepartamento de Auditoria de Inbound\nLOGIX - Warehouse Management System`;

        return {
            items,
            totalItems,
            totalDiffUnits,
            totalFinancialImpact,
            waybill,
            subject,
            body
        };
    }, [consolidatedIR, activeImportRefsWithShortages]);

    return (
        <div className="inbound-audit-page w-full px-6 py-5 font-segoe-ui bg-white min-h-screen text-black">
            {/* ENCABEZADO */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 mb-4 border-b border-black/20 gap-3">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-normal text-black">
                        RECEPCION / AGENTE DE AUDITORIA
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                        <h1 className="text-xl font-semibold text-black">Auditoría de Inbound</h1>
                    </div>
                    <p className="text-xs text-black mt-0.5">
                        Monitoreo algorítmico reactivo: recálculo automático al registrar o alterar recepciones en almacén.
                    </p>
                </div>

                {/* BOTONES DE ACCIÓN */}
                <div className="flex items-center gap-2">
                    {Object.keys(activeImportRefsWithShortages).length > 0 && (
                        <button
                            onClick={() => {
                                const firstIR = Object.keys(activeImportRefsWithShortages)[0];
                                setConsolidatedIR(firstIR);
                                setShowConsolidatedModal(true);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded text-black bg-white border border-black/30 hover:bg-neutral-100 transition-colors"
                        >
                            Reclamo Consolidado
                        </button>
                    )}

                    <button
                        onClick={() => setShowClearModal(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded text-black bg-white border border-black/30 hover:bg-neutral-100 transition-colors"
                    >
                        Limpiar Registros
                    </button>

                    <button
                        onClick={handleRunAudit}
                        disabled={runningAudit}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded text-white transition-colors ${
                            runningAudit ? 'bg-neutral-400 cursor-not-allowed' : 'bg-black hover:bg-neutral-800'
                        }`}
                    >
                        {runningAudit ? "Auditando..." : "Ejecutar Auditoría"}
                    </button>
                </div>
            </div>

            {/* NOTIFICACIÓN */}
            {actionMessage && (
                <div className="mb-4 px-3.5 py-2 rounded text-xs font-medium flex items-center justify-between border bg-white text-black border-black/30">
                    <span>{actionMessage.text}</span>
                    <button onClick={() => setActionMessage(null)} className="text-black hover:opacity-60 text-sm leading-none ml-2">&times;</button>
                </div>
            )}

            {/* TARJETAS MÉTRICAS (SIN BADGES EN LOS NÚMEROS, FUENTES NEGRAS) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {/* CARD 1: Alertas Activas */}
                <div className="bg-white p-3 rounded border border-black/20 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-black uppercase tracking-normal">Alertas Activas</span>
                        {metrics.swapsCount > 0 && (
                            <span className="text-[11px] text-black">
                                ({metrics.swapsCount} cruces)
                            </span>
                        )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-normal text-black">{metrics.countPending}</span>
                        <span className="text-xs text-black">de {metrics.total} detectadas</span>
                    </div>
                    <div className="text-[11px] text-black mt-1 pt-1.5 border-t border-black/10">
                        {metrics.shortagesCount} faltantes | {metrics.surplusesCount} sobrantes
                    </div>
                </div>

                {/* CARD 2: Faltantes Críticos */}
                <div className="bg-white p-3 rounded border border-black/20 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-black uppercase tracking-normal">Faltantes Críticos</span>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-2xl font-normal text-black">{metrics.shortagesCount}</span>
                        <span className="text-sm font-medium font-mono text-black">
                            ${metrics.totalShortageRisk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </span>
                    </div>
                    <div className="text-[11px] text-black mt-1 pt-1.5 border-t border-black/10">
                        Impacto financiero pendiente
                    </div>
                </div>

                {/* CARD 3: Sobrantes */}
                <div className="bg-white p-3 rounded border border-black/20 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-black uppercase tracking-normal">Sobrantes Físicos</span>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-2xl font-normal text-black">+{metrics.totalSurplusUnits}</span>
                        <span className="text-xs text-black">{metrics.surplusesCount} líneas</span>
                    </div>
                    <div className="text-[11px] text-black mt-1 pt-1.5 border-t border-black/10">
                        Unidades excedentes sobre orden
                    </div>
                </div>

                {/* CARD 4: Tasa de Conciliación */}
                <div className="bg-white p-3 rounded border border-black/20 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-black uppercase tracking-normal">Conciliación</span>
                        <span className="text-xs font-medium text-black">{metrics.conciliationRate}%</span>
                    </div>
                    <div className="w-full bg-neutral-200 h-1.5 rounded overflow-hidden mt-2.5">
                        <div
                            className="bg-black h-full transition-all duration-300 rounded"
                            style={{ width: `${metrics.conciliationRate}%` }}
                        ></div>
                    </div>
                    <div className="text-[11px] text-black mt-2 pt-1 border-t border-black/10 flex justify-between">
                        <span>{metrics.countResolved} resueltas</span>
                        <span>{metrics.countDismissed} descartadas</span>
                    </div>
                </div>
            </div>

            {/* BARRA DE COMANDOS */}
            <div className="bg-white p-2.5 rounded border border-black/20 mb-3.5 flex flex-col gap-2.5">
                {/* PESTAÑAS Y BOTÓN DE RESTABLECER */}
                <div className="flex items-center justify-between border-b border-black/10 pb-2">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`px-3 py-1 text-xs transition-all border-b-2 ${
                                activeTab === 'pending'
                                    ? 'border-black text-black font-normal'
                                    : 'border-transparent text-black/70 hover:text-black font-normal'
                            }`}
                        >
                            Alertas Activas ({metrics.countPending})
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-3 py-1 text-xs transition-all border-b-2 ${
                                activeTab === 'history'
                                    ? 'border-black text-black font-normal'
                                    : 'border-transparent text-black/70 hover:text-black font-normal'
                            }`}
                        >
                            Historial Resueltas ({metrics.countResolved + metrics.countDismissed})
                        </button>
                    </div>

                    {hasActiveFilters && (
                        <button
                            onClick={clearAllFilters}
                            className="text-xs text-black underline hover:opacity-75"
                        >
                            Restablecer filtros
                        </button>
                    )}
                </div>

                {/* CASILLA ÚNICA DE BÚSQUEDA UNIVERSAL */}
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-row items-center gap-2 w-full">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Buscar por ítem, I.R., Waybill, GRN (separe con coma para múltiples criterios)..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    if (!e.target.value) setSearchLogic('auto');
                                }}
                                className="w-full pl-3 pr-7 py-1 text-xs border border-black/30 rounded focus:outline-none focus:border-black text-black bg-white"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setSearchLogic('auto');
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-black hover:opacity-60 text-sm leading-none"
                                    title="Limpiar búsqueda"
                                >
                                    &times;
                                </button>
                            )}
                        </div>
                        <div className="w-48 shrink-0">
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-black/30 rounded bg-white text-black focus:outline-none focus:border-black"
                            >
                                <option value="all">Todos los Tipos</option>
                                <option value="shortage">Faltantes</option>
                                <option value="surplus">Sobrantes</option>
                                <option value="swap">Posibles Cruces (Trocas)</option>
                                <option value="recurrent">Faltantes Recurrentes</option>
                            </select>
                        </div>
                    </div>

                    {/* INDICADOR Y CONTROL PARA BÚSQUEDA MÚLTIPLE POR COMAS */}
                    {searchTerms.length > 1 && (
                        <div className="flex flex-wrap items-center justify-between px-2.5 py-1.5 rounded bg-neutral-100 border border-black/20 text-xs text-black gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-black">
                                    {searchTerms.length} argumentos activos:
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {searchTerms.map((term, idx) => (
                                        <span
                                            key={idx}
                                            className="px-1.5 py-0.5 rounded bg-white border border-black/30 font-mono text-[11px] text-black"
                                        >
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-black">Modo de filtro:</span>
                                <div className="inline-flex rounded border border-black/30 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setSearchLogic('and')}
                                        className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                            effectiveSearchLogic === 'and'
                                                ? 'bg-black text-white'
                                                : 'bg-white text-black hover:bg-neutral-100'
                                        }`}
                                        title="Coincidencia simultánea: debe cumplir todos los argumentos (AND)"
                                    >
                                        Todos (Y)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSearchLogic('or')}
                                        className={`px-2 py-0.5 text-[11px] font-medium border-l border-black/30 transition-colors ${
                                            effectiveSearchLogic === 'or'
                                                ? 'bg-black text-white'
                                                : 'bg-white text-black hover:bg-neutral-100'
                                        }`}
                                        title="Coincidencia alternativa: cumple con cualquiera de los argumentos (OR)"
                                    >
                                        Cualquiera (O)
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ACCIONES MASIVAS */}
            {activeTab === 'pending' && selectedAlertIds.length > 0 && (
                <div className="bg-neutral-100 border border-black/20 px-3.5 py-2 mb-3 rounded flex justify-between items-center">
                    <span className="text-xs text-black font-medium">
                        {selectedAlertIds.length} alertas seleccionadas
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setIsBulkResolve(true);
                                setResolveStatus('resolved');
                                setResolutionNotes('');
                            }}
                            className="px-3 py-1 bg-black hover:bg-neutral-800 text-white rounded text-xs font-medium transition-colors"
                        >
                            Resolver Selección
                        </button>
                        <button
                            onClick={() => setSelectedAlertIds([])}
                            className="px-3 py-1 bg-white border border-black/30 text-black hover:bg-neutral-100 rounded text-xs transition-colors"
                        >
                            Desmarcar Todo
                        </button>
                    </div>
                </div>
            )}

            {/* TABLA PRINCIPAL */}
            <div className="bg-white rounded border border-black/20 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-neutral-100 text-black border-b border-black/20 text-xs">
                                {activeTab === 'pending' && (
                                    <th className="px-3 py-1.5 text-center font-medium w-8 text-black">
                                        <input
                                            type="checkbox"
                                            checked={filteredAlerts.length > 0 && selectedAlertIds.length === filteredAlerts.filter(a => a.status === 'pending').length}
                                            onChange={handleSelectAll}
                                            className="rounded border-black/40 text-black focus:ring-0 cursor-pointer"
                                        />
                                    </th>
                                )}
                                <th className="px-3 py-1.5 text-left font-medium text-black">FECHA</th>
                                <th className="px-3 py-1.5 text-left font-medium text-black">I.R. / WAYBILL</th>
                                <th className="px-3 py-1.5 text-left font-medium text-black">GRN</th>
                                <th className="px-3 py-1.5 text-left font-medium text-black">CODIGO ITEM</th>
                                <th className="px-3 py-1.5 text-left font-medium text-black">DESCRIPCION</th>
                                <th className="px-3 py-1.5 text-center font-medium text-black">ESP.</th>
                                <th className="px-3 py-1.5 text-center font-medium text-black">REC.</th>
                                <th className="px-3 py-1.5 text-center font-medium text-black">DIF.</th>
                                <th className="px-3 py-1.5 text-right font-medium text-black">COSTO UNIT.</th>
                                <th className="px-3 py-1.5 text-right font-medium text-black">IMPACTO</th>
                                <th className="px-3 py-1.5 text-center font-medium text-black">TIPO</th>
                                <th className="px-3 py-1.5 text-left font-medium text-black min-w-[180px]">DIAGNOSTICO DEL AGENTE</th>
                                {activeTab === 'history' && <th className="px-3 py-1.5 text-left font-medium text-black">RESOLUCION</th>}
                                <th className="px-3 py-1.5 text-center font-medium text-black">ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/10">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={activeTab === 'pending' ? 15 : 14} className="py-8 text-center text-black">
                                        Cargando alertas de auditoría...
                                    </td>
                                </tr>
                            ) : filteredAlerts.length === 0 ? (
                                <tr>
                                    <td colSpan={activeTab === 'pending' ? 15 : 14} className="py-8 text-center text-black">
                                        No hay discrepancias registradas en esta sección.
                                    </td>
                                </tr>
                            ) : (
                                filteredAlerts.map(alert => {
                                    const isDynamicAdjusted = alert.notes && alert.notes.includes("Ajustado dinámicamente");
                                    const isSwapDetected = alert.notes && alert.notes.includes("Posible cruce/troca");

                                    return (
                                        <tr 
                                            key={alert.id}
                                            className={`hover:bg-neutral-50 transition-colors ${
                                                selectedAlertIds.includes(alert.id) ? 'bg-neutral-100' : ''
                                            }`}
                                        >
                                            {activeTab === 'pending' && (
                                                <td className="px-3 py-1 text-center whitespace-nowrap">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedAlertIds.includes(alert.id)}
                                                        onChange={() => handleSelectRow(alert.id)}
                                                        className="rounded border-black/40 text-black focus:ring-0 cursor-pointer"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-3 py-1 whitespace-nowrap text-black">
                                                {formatDate(alert.created_at)}
                                            </td>
                                            <td className="px-3 py-1 whitespace-nowrap font-mono text-black">
                                                <div>{alert.import_reference}</div>
                                                {alert.waybill && alert.waybill !== alert.import_reference && (
                                                    <div className="text-[10px] text-black">{alert.waybill}</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-1 whitespace-nowrap font-mono text-black">
                                                {alert.grn}
                                            </td>
                                            <td className="px-3 py-1 whitespace-nowrap font-mono font-medium text-black">
                                                {alert.item_code}
                                            </td>
                                            <td className="px-3 py-1 text-black max-w-xs truncate" title={alert.description}>
                                                {alert.description || '-'}
                                            </td>
                                            <td className="px-3 py-1 whitespace-nowrap text-center font-mono text-black">
                                                {alert.qty_expected}
                                            </td>
                                            <td className="px-3 py-1 whitespace-nowrap text-center font-mono text-black">
                                                {alert.qty_received}
                                            </td>
                                            {/* SIN BADGE EN EL NÚMERO DE DIFERENCIA */}
                                            <td className="px-3 py-1 whitespace-nowrap text-center font-mono font-medium text-black">
                                                {alert.difference > 0 ? `+${alert.difference}` : alert.difference}
                                            </td>
                                            <td className="px-3 py-1 whitespace-nowrap text-right font-mono text-black">
                                                {alert.cost_per_unit !== undefined ? `$${alert.cost_per_unit.toFixed(2)}` : '-'}
                                            </td>
                                            {/* IMPACTO EN FUENTE NEGRA, SIN BADGE */}
                                            <td className="px-3 py-1 whitespace-nowrap text-right font-mono font-medium text-black">
                                                {alert.financial_impact !== undefined ? `$${alert.financial_impact.toFixed(2)}` : '-'}
                                            </td>
                                            <td className="px-3 py-1 whitespace-nowrap text-center text-black">
                                                <span className="text-black text-xs font-normal">
                                                    {alert.alert_type === 'recurrent_shortage'
                                                        ? 'Faltante Recurrente'
                                                        : alert.alert_type === 'surplus'
                                                            ? 'Excedente'
                                                            : 'Faltante Inicial'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1 text-black">
                                                <div className="flex flex-col gap-0.5 max-w-sm">
                                                    <div className="flex items-center gap-1">
                                                        {isDynamicAdjusted && (
                                                            <span className="px-1 py-0.5 rounded text-[9px] font-medium text-black bg-neutral-100 border border-black/20">
                                                                Ajustado en vivo
                                                            </span>
                                                        )}
                                                        {isSwapDetected && (
                                                            <span className="px-1 py-0.5 rounded text-[9px] font-medium text-black bg-neutral-100 border border-black/20">
                                                                Posible Troca
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[11px] text-black line-clamp-2 leading-tight" title={alert.notes}>
                                                        {alert.notes || '-'}
                                                    </span>
                                                </div>
                                            </td>
                                            {activeTab === 'history' && (
                                                <td className="px-3 py-1 text-black">
                                                    <div className="flex flex-col gap-0.5 max-w-xs">
                                                        <span className="text-[10px] uppercase font-medium tracking-normal text-black">
                                                            {alert.status === 'resolved' ? 'Resuelta' : 'Descartada'} - {formatDate(alert.resolved_at)}
                                                        </span>
                                                        <span className="text-[11px] italic truncate text-black" title={alert.resolution_notes}>
                                                            "{alert.resolution_notes || 'Sin comentarios'}"
                                                        </span>
                                                    </div>
                                                </td>
                                            )}
                                            <td className="px-3 py-1 whitespace-nowrap text-center">
                                                <div className="flex justify-center items-center gap-1">
                                                    <button
                                                        onClick={() => setSelectedClaimModal(alert)}
                                                        className="px-2 py-0.5 text-[11px] font-medium text-black bg-white border border-black/30 rounded hover:bg-neutral-100 transition-colors"
                                                    >
                                                        Reclamar
                                                    </button>
                                                    {alert.status === 'pending' && (
                                                        <button
                                                            onClick={() => {
                                                                setResolveModalAlert(alert);
                                                                setIsBulkResolve(false);
                                                                setResolutionNotes('');
                                                            }}
                                                            className="px-2 py-0.5 text-[11px] font-medium text-black bg-white border border-black/30 rounded hover:bg-neutral-100 transition-colors"
                                                        >
                                                            Resolver
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL: RECLAMO INDIVIDUAL */}
            {selectedClaimModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4 font-segoe-ui">
                    <div className="bg-white rounded border border-black/20 shadow-lg max-w-2xl w-full overflow-hidden">
                        <div className="bg-neutral-100 text-black px-4 py-2.5 flex justify-between items-center border-b border-black/20">
                            <span className="text-xs font-medium uppercase tracking-normal text-black">Borrador de Reclamo</span>
                            <button onClick={() => setSelectedClaimModal(null)} className="text-lg leading-none text-black hover:opacity-60 focus:outline-none">&times;</button>
                        </div>
                        <div className="p-4">
                            <div className="mb-3 p-2.5 bg-neutral-50 border border-black/20 rounded text-xs text-black flex justify-between items-center">
                                <div>
                                    <span className="font-medium text-black">Item: {selectedClaimModal.item_code}</span>
                                    <span className="mx-2 text-black/40">|</span>
                                    <span className="text-black">I.R.: {selectedClaimModal.import_reference}</span>
                                    <span className="mx-2 text-black/40">|</span>
                                    <span className="font-medium text-black">Diferencia: {selectedClaimModal.difference} un.</span>
                                </div>
                                <span className="font-mono text-xs text-black">
                                    Impacto: ${(selectedClaimModal.financial_impact || 0).toFixed(2)} USD
                                </span>
                            </div>

                            <textarea
                                readOnly
                                className="w-full h-64 text-xs font-mono p-2.5 border border-black/30 rounded bg-white text-black focus:outline-none"
                                value={selectedClaimModal.draft_claim_email}
                            ></textarea>
                        </div>
                        <div className="bg-neutral-100 px-4 py-2 flex justify-end gap-2 border-t border-black/20">
                            <button
                                onClick={() => setSelectedClaimModal(null)}
                                className="px-3 py-1 text-xs font-medium text-black bg-white border border-black/30 hover:bg-neutral-200 rounded transition-colors"
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={() => openMailClient(
                                    `Reclamo discrepancia - I.R.: ${selectedClaimModal.import_reference} / GRN: ${selectedClaimModal.grn}`,
                                    selectedClaimModal.draft_claim_email
                                )}
                                className="px-3 py-1 text-xs font-medium text-black bg-white border border-black/30 hover:bg-neutral-200 rounded transition-colors"
                            >
                                Abrir en Correo (mailto)
                            </button>
                            <button
                                onClick={() => copyToClipboard(selectedClaimModal.draft_claim_email)}
                                className="px-3 py-1 text-xs font-medium bg-black hover:bg-neutral-800 text-white rounded transition-colors"
                            >
                                Copiar Texto
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: RECLAMO CONSOLIDADO POR IMPORT REFERENCE */}
            {showConsolidatedModal && consolidatedClaimData && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4 font-segoe-ui">
                    <div className="bg-white rounded border border-black/20 shadow-lg max-w-2xl w-full overflow-hidden">
                        <div className="bg-neutral-100 text-black px-4 py-2.5 flex justify-between items-center border-b border-black/20">
                            <span className="text-xs font-medium uppercase tracking-normal text-black">Reclamo Consolidado de Importación</span>
                            <button onClick={() => setShowConsolidatedModal(false)} className="text-lg leading-none text-black hover:opacity-60 focus:outline-none">&times;</button>
                        </div>
                        <div className="p-4 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between bg-neutral-50 p-2 rounded border border-black/20">
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-medium text-black">Seleccionar I.R.:</label>
                                    <select
                                        value={consolidatedIR}
                                        onChange={(e) => setConsolidatedIR(e.target.value)}
                                        className="px-2 py-1 text-xs border border-black/30 rounded bg-white text-black font-mono focus:outline-none"
                                    >
                                        {Object.keys(activeImportRefsWithShortages).map(ir => (
                                            <option key={ir} value={ir}>
                                                {ir} ({activeImportRefsWithShortages[ir].length} faltantes)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="text-xs font-mono font-medium text-black">
                                    Total Faltante: {consolidatedClaimData.totalDiffUnits} un. | ${consolidatedClaimData.totalFinancialImpact.toFixed(2)} USD
                                </div>
                            </div>

                            <textarea
                                readOnly
                                className="w-full h-72 text-xs font-mono p-2.5 border border-black/30 rounded bg-white text-black focus:outline-none"
                                value={consolidatedClaimData.body}
                            ></textarea>
                        </div>
                        <div className="bg-neutral-100 px-4 py-2 flex justify-end gap-2 border-t border-black/20">
                            <button
                                onClick={() => setShowConsolidatedModal(false)}
                                className="px-3 py-1 text-xs font-medium text-black bg-white border border-black/30 hover:bg-neutral-200 rounded transition-colors"
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={() => openMailClient(consolidatedClaimData.subject, consolidatedClaimData.body)}
                                className="px-3 py-1 text-xs font-medium text-black bg-white border border-black/30 hover:bg-neutral-200 rounded transition-colors"
                            >
                                Abrir en Correo (mailto)
                            </button>
                            <button
                                onClick={() => copyToClipboard(consolidatedClaimData.body)}
                                className="px-3 py-1 text-xs font-medium bg-black hover:bg-neutral-800 text-white rounded transition-colors"
                            >
                                Copiar Texto Consolidado
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: RESOLVER ALERTA */}
            {(resolveModalAlert || isBulkResolve) && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4 font-segoe-ui">
                    <form onSubmit={handleResolveSubmit} className="bg-white rounded border border-black/20 shadow-lg max-w-md w-full overflow-hidden">
                        <div className="bg-neutral-100 text-black px-4 py-2.5 flex justify-between items-center border-b border-black/20">
                            <span className="text-xs font-medium uppercase tracking-normal text-black">
                                {isBulkResolve ? `Resolver ${selectedAlertIds.length} Alertas` : "Resolver Alerta"}
                            </span>
                            <button type="button" onClick={() => { setResolveModalAlert(null); setIsBulkResolve(false); }} className="text-lg leading-none text-black hover:opacity-60 focus:outline-none">&times;</button>
                        </div>
                        <div className="p-4 flex flex-col gap-3">
                            {isBulkResolve ? (
                                <div className="text-xs bg-neutral-50 p-2.5 rounded border border-black/20 text-black">
                                    <p className="font-medium text-black">Resolución masiva</p>
                                    <p className="text-black mt-0.5">Se marcarán {selectedAlertIds.length} alertas seleccionadas con la justificación indicada.</p>
                                </div>
                            ) : (
                                <div className="text-xs bg-neutral-50 p-2.5 rounded border border-black/20 text-black">
                                    <p className="font-medium font-mono text-black">{resolveModalAlert.item_code} - {resolveModalAlert.description}</p>
                                    <p className="text-black mt-0.5">I.R.: {resolveModalAlert.import_reference} | Faltante: {resolveModalAlert.difference} un.</p>
                                </div>
                            )}

                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] uppercase font-medium tracking-normal text-black">Acción</label>
                                <select
                                    className="px-2 py-1 text-xs border border-black/30 rounded bg-white text-black focus:outline-none focus:border-black"
                                    value={resolveStatus}
                                    onChange={(e) => setResolveStatus(e.target.value)}
                                >
                                    <option value="resolved">Marcar como Resuelto (Mercancía conciliada / Reclamo enviado)</option>
                                    <option value="dismissed">Descartar (Diferencia tolerada / Ajuste contable)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] uppercase font-medium tracking-normal text-black">Notas / Justificación</label>
                                <textarea
                                    required
                                    placeholder="Ingresa los comentarios de resolución..."
                                    className="w-full h-20 text-xs p-2 border border-black/30 rounded focus:outline-none focus:border-black text-black"
                                    value={resolutionNotes}
                                    onChange={(e) => setResolutionNotes(e.target.value)}
                                ></textarea>
                            </div>
                        </div>
                        <div className="bg-neutral-100 px-4 py-2 flex justify-end gap-2 border-t border-black/20">
                            <button
                                type="button"
                                onClick={() => { setResolveModalAlert(null); setIsBulkResolve(false); }}
                                className="px-3 py-1 text-xs font-medium text-black bg-white border border-black/30 hover:bg-neutral-200 rounded transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1 text-xs font-medium bg-black hover:bg-neutral-800 text-white rounded transition-colors"
                            >
                                Confirmar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL: LIMPIAR ALERTAS */}
            {showClearModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4 font-segoe-ui">
                    <div className="bg-white rounded border border-[#d2d0ce] shadow-md max-w-lg w-full overflow-hidden text-left flex flex-col">
                        {/* Cabecera */}
                        <div className="bg-[#f3f3f3] text-[#201f1e] px-4 py-2.5 flex justify-between items-center border-b border-[#d2d0ce]">
                            <span className="text-xs font-normal uppercase tracking-normal text-[#201f1e]">Depuración de Base de Datos</span>
                            <button
                                type="button"
                                onClick={() => setShowClearModal(false)}
                                aria-label="Cerrar"
                                title="Cerrar"
                                className="text-lg leading-none text-[#605e5c] hover:text-[#201f1e] focus:outline-none"
                            >
                                &times;
                            </button>
                        </div>

                        {/* Cuerpo */}
                        <div className="p-4 flex flex-col gap-3 text-[#201f1e]">
                            <p className="text-xs text-[#605e5c] leading-relaxed">
                                Selecciona una opción para depurar los registros de auditoría:
                            </p>

                            <div className="flex flex-col gap-2.5 w-full">
                                <button
                                    type="button"
                                    onClick={() => handleClearAlerts('history')}
                                    disabled={clearing}
                                    style={{ height: 'auto', minHeight: 'auto', display: 'flex' }}
                                    className="w-full !h-auto !min-h-0 text-left p-3 border border-[#d2d0ce] hover:border-[#8a8886] hover:bg-[#f9f9f9] rounded transition-colors flex flex-col gap-1 focus:outline-none focus:ring-1 focus:ring-[#0078d4] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="text-xs font-normal text-[#201f1e] leading-snug break-words">
                                        Limpiar Solo Historial (Resueltas y Descartadas)
                                    </span>
                                    <span className="text-[11px] text-[#605e5c] leading-relaxed break-words">
                                        Mantiene las alertas activas pendientes y vacía únicamente los registros archivados.
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleClearAlerts('all')}
                                    disabled={clearing}
                                    style={{ height: 'auto', minHeight: 'auto', display: 'flex' }}
                                    className="w-full !h-auto !min-h-0 text-left p-3 border border-[#d2d0ce] hover:border-[#8a8886] hover:bg-[#f9f9f9] rounded transition-colors flex flex-col gap-1 focus:outline-none focus:ring-1 focus:ring-[#0078d4] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="text-xs font-normal text-[#201f1e] leading-snug break-words">
                                        Reiniciar Toda la Base de Datos de Alertas
                                    </span>
                                    <span className="text-[11px] text-[#605e5c] leading-relaxed break-words">
                                        Elimina todas las alertas. Las discrepancias vigentes se regenerarán automáticamente al ingresar ítems.
                                    </span>
                                </button>
                            </div>

                            {clearing && (
                                <div className="flex items-center gap-2 py-1 text-xs text-[#605e5c]">
                                    <span className="animate-spin text-xs">⏳</span>
                                    <span>Procesando depuración de registros...</span>
                                </div>
                            )}
                        </div>

                        {/* Pie del modal */}
                        <div className="bg-[#f3f3f3] px-4 py-2 flex justify-end gap-2 border-t border-[#d2d0ce]">
                            <button
                                type="button"
                                onClick={() => setShowClearModal(false)}
                                disabled={clearing}
                                className="px-3 py-1 text-xs font-normal text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#e1dfdd] rounded transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InboundAudit;
