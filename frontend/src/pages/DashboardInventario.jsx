import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import '../styles/FluentPages.css';

// Únicamente iconos que comunican una función interactiva o estado crítico
const Icons = {
    ShieldAlert: () => (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    ),
    Refresh: () => (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
    )
};

const DashboardInventario = () => {
    const { setTitle } = useOutletContext();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Sección activa y causa raíz
    const [activeSection, setActiveSection] = useState('kpis'); // 'kpis' | 'process' | 'risk'
    const [causeModalItem, setCauseModalItem] = useState(null);
    const [selectedCause, setSelectedCause] = useState('Error de picking');
    const [updatingCause, setUpdatingCause] = useState(false);

    const ROOT_CAUSES_LIST = [
        "Recepción pendiente o incorrecta",
        "Movimiento no registrado",
        "Error de picking",
        "Ubicación incorrecta",
        "Error de unidad de medida",
        "Devolución no procesada",
        "Daño o pérdida",
        "Material mezclado",
        "Error de identificación o etiquetado",
        "Ajuste anterior incorrecto",
        "Diferencia sin causa determinada"
    ];

    useEffect(() => {
        setTitle("Métricas Avanzadas de Cíclicos");
    }, [setTitle]);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/counts/dashboard_stats', { credentials: 'include' });
            if (!res.ok) throw new Error("Error cargando estadísticas de inventario");
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignCause = async () => {
        if (!causeModalItem) return;
        setUpdatingCause(true);
        try {
            const res = await fetch(`/api/counts/recordings/${causeModalItem.id}/root_cause`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ root_cause: selectedCause })
            });
            if (res.ok) {
                setCauseModalItem(null);
                await fetchStats();
            } else {
                alert("Error al actualizar la causa raíz");
            }
        } catch (e) {
            alert("Error de conexión");
        } finally {
            setUpdatingCause(false);
        }
    };

    const formatMoney = (val) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(val || 0);
    };

    if (loading) return (
        <div className="dashboard-inventario-page flex items-center justify-center min-h-[60vh] bg-[#f9f9f9] font-segoe-ui">
            <div className="flex flex-col items-center gap-3 bg-white p-8 rounded border border-[#d2d0ce] shadow-xs">
                <div className="w-8 h-8 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin"></div>
                <div className="text-[#201f1e] text-xs font-normal">Cargando indicadores ejecutivos...</div>
            </div>
        </div>
    );

    if (error) return (
        <div className="dashboard-inventario-page flex items-center justify-center min-h-[50vh] font-segoe-ui p-4">
            <div className="bg-[#fde7e9] text-[#a4262c] p-5 rounded border border-[#f3b2b6] text-xs font-normal max-w-md text-center shadow-xs">
                <div className="flex items-center justify-center gap-2 mb-1.5 font-normal text-sm">
                    <Icons.ShieldAlert />
                    <span>Error de Conexión o Carga</span>
                </div>
                <p className="text-[#201f1e]">{error}</p>
            </div>
        </div>
    );

    if (stats?.empty) return (
        <div className="dashboard-inventario-page flex items-center justify-center min-h-[50vh] font-segoe-ui p-4">
            <div className="text-[#201f1e] bg-white p-6 rounded border border-[#d2d0ce] shadow-xs text-center max-w-sm">
                <h3 className="text-sm font-normal text-[#201f1e] mb-1">Sin Registros de Conteos Cíclicos</h3>
                <p className="text-xs text-[#605e5c] font-normal">Realice auditorías de inventario para visualizar los indicadores en tiempo real.</p>
            </div>
        </div>
    );

    return (
        <div className="dashboard-inventario-page max-w-[1440px] mx-auto px-4 py-3 font-segoe-ui bg-[#f9f9f9] min-h-screen text-[#201f1e] leading-normal">

            {/* Top Navigation & Control Header */}
            <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h1 className="text-base font-normal text-[#201f1e] leading-tight mb-0.5">
                        Tablero de Gestión de Inventarios
                    </h1>
                    <p className="text-xs text-[#605e5c] font-normal">
                        Control de exactitud, cobertura, pareto de causas y exposición de riesgos
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Navigation Tabs (Fluent Pivot Style - Sin negritas ni iconos decorativos) */}
                    <div className="flex items-center gap-1 bg-[#f3f3f3] p-0.5 rounded border border-[#d2d0ce]">
                        <button
                            onClick={() => setActiveSection('kpis')}
                            className={`px-3 py-1.5 rounded text-xs font-normal transition-colors ${
                                activeSection === 'kpis'
                                    ? 'bg-white text-[#0078d4] shadow-xs border border-[#d2d0ce]'
                                    : 'text-[#605e5c] hover:text-[#201f1e] hover:bg-[#e1dfdd]/40'
                            }`}
                        >
                            KPIs Prioritarios
                        </button>
                        <button
                            onClick={() => setActiveSection('process')}
                            className={`px-3 py-1.5 rounded text-xs font-normal transition-colors ${
                                activeSection === 'process'
                                    ? 'bg-white text-[#0078d4] shadow-xs border border-[#d2d0ce]'
                                    : 'text-[#605e5c] hover:text-[#201f1e] hover:bg-[#e1dfdd]/40'
                            }`}
                        >
                            Control & Pareto
                        </button>
                        <button
                            onClick={() => setActiveSection('risk')}
                            className={`px-3 py-1.5 rounded text-xs font-normal transition-colors ${
                                activeSection === 'risk'
                                    ? 'bg-white text-[#0078d4] shadow-xs border border-[#d2d0ce]'
                                    : 'text-[#605e5c] hover:text-[#201f1e] hover:bg-[#e1dfdd]/40'
                            }`}
                        >
                            Rotación & Riesgos
                        </button>
                    </div>

                    <button
                        onClick={fetchStats}
                        title="Actualizar datos"
                        className="p-1.5 text-[#201f1e] hover:text-[#0078d4] bg-white hover:bg-[#f3f3f3] rounded border border-[#d2d0ce] shadow-xs transition-colors"
                        aria-label="Actualizar datos"
                    >
                        <Icons.Refresh />
                    </button>
                </div>
            </div>

            {/* SECCIÓN 1: KPIs PRIORITARIOS (TOP 8) */}
            {activeSection === 'kpis' && (
                <div className="space-y-3">
                    {/* Grid Principal de 4 Tarjetas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

                        {/* 1. ERI Global y Clase ABC */}
                        <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-xs text-[#605e5c] font-normal">1. ERI Global</span>
                                    <span className="text-xs font-normal text-[#605e5c]">{stats.total_items} ítems</span>
                                </div>
                                <div className="flex items-baseline gap-1 my-1">
                                    <span className="text-2xl font-normal text-[#201f1e] leading-none">{stats.eri.Global}</span>
                                    <span className="text-xs font-normal text-[#605e5c]">%</span>
                                </div>
                                <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden my-2">
                                    <div className="bg-[#0078d4] h-full transition-all duration-500" style={{ width: `${stats.eri.Global}%` }}></div>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#edebe9] text-center">
                                <div className="bg-[#f9f9f9] p-1.5 rounded border border-[#edebe9]">
                                    <span className="text-[11px] text-[#605e5c] block font-normal">Clase A</span>
                                    <span className="text-xs font-normal text-[#201f1e]">{stats.eri.A || 80}%</span>
                                </div>
                                <div className="bg-[#f9f9f9] p-1.5 rounded border border-[#edebe9]">
                                    <span className="text-[11px] text-[#605e5c] block font-normal">Clase B</span>
                                    <span className="text-xs font-normal text-[#201f1e]">{stats.eri.B || 78}%</span>
                                </div>
                                <div className="bg-[#f9f9f9] p-1.5 rounded border border-[#edebe9]">
                                    <span className="text-[11px] text-[#605e5c] block font-normal">Clase C</span>
                                    <span className="text-xs font-normal text-[#201f1e]">{stats.eri.C || 82}%</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Cumplimiento del Programa */}
                        <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-xs text-[#605e5c] font-normal">2. Cumplimiento Plan</span>
                                    <span className="text-xs font-normal text-[#201f1e] bg-[#f3f3f3] px-2 py-0.5 rounded border border-[#d2d0ce]">
                                        {stats.compliance.pct}%
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-1 my-1">
                                    <span className="text-2xl font-normal text-[#201f1e] leading-none">{stats.compliance.counted}</span>
                                    <span className="text-xs text-[#605e5c] font-normal">/ {stats.compliance.planned} programados</span>
                                </div>
                                <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden my-2">
                                    <div className="bg-[#0078d4] h-full transition-all duration-500" style={{ width: `${stats.compliance.pct}%` }}></div>
                                </div>
                            </div>
                            <p className="text-xs text-[#605e5c] font-normal leading-relaxed">Avance real sobre el programa estipulado de auditorías.</p>
                        </div>

                        {/* 3. Cobertura del Inventario */}
                        <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-xs text-[#605e5c] font-normal">3. Cobertura SKU</span>
                                    <span className="text-xs font-normal text-[#201f1e] bg-[#f3f3f3] px-2 py-0.5 rounded border border-[#d2d0ce]">
                                        {stats.coverage.pct}%
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-1 my-1">
                                    <span className="text-2xl font-normal text-[#201f1e] leading-none">{stats.coverage.unique_skus_counted}</span>
                                    <span className="text-xs text-[#605e5c] font-normal">SKUs ({stats.coverage.total_active_skus} activos)</span>
                                </div>
                                <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden my-2">
                                    <div className="bg-[#0078d4] h-full transition-all duration-500" style={{ width: `${stats.coverage.pct}%` }}></div>
                                </div>
                            </div>
                            <p className="text-xs text-[#605e5c] font-normal leading-relaxed">Garantiza diversidad de muestra sin repetir códigos.</p>
                        </div>

                        {/* 4 & 5. Exactitud por Unidades vs Valor Económico */}
                        <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs flex flex-col justify-between">
                            <div>
                                <div className="text-xs text-[#605e5c] font-normal mb-2">
                                    4 & 5. Unidades vs Valor
                                </div>
                                <div className="space-y-2">
                                    <div>
                                        <div className="flex justify-between items-center text-xs mb-1">
                                            <span className="text-[#605e5c] font-normal">Exactitud Unidades:</span>
                                            <span className="font-normal text-[#201f1e]">{stats.units_accuracy_pct}%</span>
                                        </div>
                                        <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden">
                                            <div className="bg-[#605e5c] h-full" style={{ width: `${stats.units_accuracy_pct}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="pt-1.5 border-t border-[#edebe9]">
                                        <div className="flex justify-between items-center text-xs mb-1">
                                            <span className="text-[#605e5c] font-normal">Exactitud Financiera:</span>
                                            <span className="font-normal text-[#0078d4]">{stats.financial_accuracy_pct}%</span>
                                        </div>
                                        <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden">
                                            <div className="bg-[#0078d4] h-full" style={{ width: `${stats.financial_accuracy_pct}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Fila Secundaria de Métricas e Impacto Financiero */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

                        {/* 6. Valor Neto y Absoluto de Ajustes */}
                        <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                            <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                6. Magnitud Financiera de Ajustes
                            </h2>

                            <div className="space-y-2.5">
                                <div className="bg-[#f9f9f9] p-3 rounded border border-[#d2d0ce]">
                                    <span className="text-xs font-normal text-[#605e5c] block mb-0.5">Ajuste Neto (Efecto Contable)</span>
                                    <div className={`text-xl font-normal leading-tight font-mono ${stats.adjustments.value.net < 0 ? 'text-[#a4262c]' : 'text-[#201f1e]'}`}>
                                        {formatMoney(stats.adjustments.value.net)}
                                    </div>
                                    <div className="text-xs text-[#605e5c] font-normal mt-1">
                                        {stats.adjustments.units.net >= 0 ? '+' : ''}{stats.adjustments.units.net} Unidades Netas
                                    </div>
                                </div>

                                <div className="bg-[#f9f9f9] p-3 rounded border border-[#d2d0ce]">
                                    <span className="text-xs font-normal text-[#605e5c] block mb-0.5">Ajuste Absoluto (Exposición Total)</span>
                                    <div className="text-xl font-normal text-[#201f1e] leading-tight font-mono">
                                        {formatMoney(stats.adjustments.value.gross)}
                                    </div>
                                    <div className="text-xs text-[#605e5c] font-normal mt-1">
                                        {stats.adjustments.units.gross} Unidades Totales de Diferencia
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 7 & 8. Frecuencia y Magnitud por SKU */}
                        <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs flex flex-col justify-between">
                            <div>
                                <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                    7 & 8. Frecuencia y Magnitud por SKU
                                </h2>

                                <div className="grid grid-cols-2 gap-2.5 mb-3">
                                    <div className="bg-[#f9f9f9] p-2.5 rounded border border-[#d2d0ce]">
                                        <span className="text-xs font-normal text-[#605e5c] block mb-1">Tasa Discrepancias</span>
                                        <span className="text-2xl font-normal text-[#201f1e]">{stats.diff_rate_pct}%</span>
                                        <span className="text-xs text-[#605e5c] block font-normal mt-0.5">del total SKUs</span>
                                    </div>
                                    <div className="bg-[#f9f9f9] p-2.5 rounded border border-[#d2d0ce]">
                                        <span className="text-xs font-normal text-[#605e5c] block mb-1">Diferencia Promedio</span>
                                        <span className="text-2xl font-normal text-[#201f1e]">{stats.avg_diff_per_sku}</span>
                                        <span className="text-xs text-[#605e5c] block font-normal mt-0.5">unid / SKU erróneo</span>
                                    </div>
                                </div>

                                <div className="border-t border-[#edebe9] pt-2.5">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-normal text-[#201f1e]">7. Tasa Reincidencia:</span>
                                        <span className="font-normal text-[#201f1e]">{stats.recurrency_rate_pct}%</span>
                                    </div>
                                    <p className="text-xs text-[#605e5c] font-normal mt-1">Referencias con fallas registradas en múltiples auditorías.</p>
                                </div>
                            </div>
                        </div>

                        {/* 13. Tiempo de Resolución de Diferencias */}
                        <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                            <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                13. Tiempo de Resolución & Casos
                            </h2>

                            <div className="mb-3 flex items-baseline gap-2">
                                <span className="text-2xl font-normal text-[#201f1e] leading-none">{stats.resolution_time.avg_days}</span>
                                <span className="text-xs text-[#605e5c] font-normal">días promedio de cierre</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-[#f9f9f9] p-2.5 rounded border border-[#d2d0ce]">
                                    <span className="text-xs font-normal text-[#605e5c] block mb-0.5">Casos Abiertos</span>
                                    <span className="text-lg font-normal text-[#201f1e]">{stats.resolution_time.open_cases}</span>
                                </div>
                                <div className="bg-[#f9f9f9] p-2.5 rounded border border-[#d2d0ce]">
                                    <span className="text-xs font-normal text-[#605e5c] block mb-0.5">Casos Cerrados</span>
                                    <span className="text-lg font-normal text-[#201f1e]">{stats.resolution_time.resolved_cases}</span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <span className="text-xs font-normal text-[#605e5c] block">Antigüedad de Casos Pendientes</span>
                                <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                                    <div className="bg-[#f9f9f9] p-1.5 rounded border border-[#d2d0ce] font-normal text-[#201f1e]">0-2d: {stats.resolution_time.aging['0_2_days']}</div>
                                    <div className="bg-[#f9f9f9] p-1.5 rounded border border-[#d2d0ce] font-normal text-[#201f1e]">3-7d: {stats.resolution_time.aging['3_7_days']}</div>
                                    <div className="bg-[#f9f9f9] p-1.5 rounded border border-[#d2d0ce] font-normal text-[#201f1e]">8-15d: {stats.resolution_time.aging['8_15_days']}</div>
                                    <div className="bg-[#f9f9f9] p-1.5 rounded border border-[#d2d0ce] font-normal text-[#201f1e]">+15d: {stats.resolution_time.aging['over_15_days']}</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* SECCIÓN 2: CONTROL DE PROCESO & PARETO DE CAUSAS */}
            {activeSection === 'process' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

                        {/* 9. Pareto de Causas Raíz */}
                        <div className="lg:col-span-2 bg-white p-4 rounded border border-[#d2d0ce] shadow-xs">
                            <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                9. Pareto de Causas de Diferencias (Impacto en USD y Conteo)
                            </h2>

                            {stats.pareto_causes.length > 0 ? (
                                <div className="space-y-2.5">
                                    {stats.pareto_causes.map((c, i) => (
                                        <div key={i} className="bg-[#f9f9f9] p-3 rounded border border-[#d2d0ce]">
                                            <div className="flex justify-between items-center mb-1.5 text-xs">
                                                <span className="font-normal text-[#201f1e]">{c.root_cause}</span>
                                                <div className="text-right">
                                                    <span className="font-normal text-[#201f1e] font-mono mr-3">{formatMoney(c.impact_usd)}</span>
                                                    <span className="text-xs font-normal bg-[#f3f3f3] text-[#201f1e] border border-[#d2d0ce] px-2 py-0.5 rounded">
                                                        {c.count} casos ({c.pct}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden">
                                                <div className="bg-[#0078d4] h-full transition-all duration-500" style={{ width: `${c.pct}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-[#605e5c] text-xs font-normal bg-[#f9f9f9] rounded border border-dashed border-[#d2d0ce]">
                                    No se han registrado causas aún. Asigne causas raíz en la tabla de discrepancias.
                                </div>
                            )}
                        </div>

                        {/* 11 & 12. First Count Accuracy & Reconteos */}
                        <div className="space-y-3">
                            <div className="bg-white p-4 rounded border border-[#d2d0ce] shadow-xs">
                                <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                    11 & 12. Calidad Inicial de Conteo
                                </h2>
                                <div className="space-y-3 text-xs">
                                    <div>
                                        <div className="flex justify-between font-normal mb-1">
                                            <span className="text-[#605e5c]">First Count Accuracy:</span>
                                            <span className="font-normal text-[#201f1e]">{stats.first_count_accuracy_pct}%</span>
                                        </div>
                                        <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden">
                                            <div className="bg-[#0078d4] h-full" style={{ width: `${stats.first_count_accuracy_pct}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="pt-2.5 border-t border-[#edebe9]">
                                        <div className="flex justify-between font-normal mb-1">
                                            <span className="text-[#605e5c]">Tasa de Reconteo:</span>
                                            <span className="font-normal text-[#201f1e]">{stats.recount_rate_pct}%</span>
                                        </div>
                                        <div className="w-full bg-[#edebe9] h-1.5 rounded overflow-hidden">
                                            <div className="bg-[#605e5c] h-full" style={{ width: `${stats.recount_rate_pct}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 14. Productividad del Conteo */}
                            <div className="bg-white p-4 rounded border border-[#d2d0ce] shadow-xs">
                                <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-2">
                                    14. Productividad Operativa
                                </h2>
                                <div className="flex items-baseline gap-2 mb-1">
                                    <span className="text-2xl font-normal text-[#201f1e] leading-none">{stats.productivity.rate}</span>
                                    <span className="text-xs text-[#605e5c] font-normal">SKU / Hora-Persona</span>
                                </div>
                                <p className="text-xs text-[#605e5c] font-normal mt-1">Total horas-hombre invertidas: {stats.productivity.total_person_hours} hrs</p>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* SECCIÓN 3: ROTACIÓN & RIESGOS */}
            {activeSection === 'risk' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                        {/* 16. Exactitud por Rotación */}
                        <div className="bg-white p-4 rounded border border-[#d2d0ce] shadow-xs">
                            <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                16. Exactitud por Rotación
                            </h2>
                            <div className="space-y-2 text-xs">
                                {Object.entries(stats.rotation_accuracy).map(([rot, acc]) => (
                                    <div key={rot} className="flex justify-between items-center py-1.5 border-b border-[#edebe9]">
                                        <span className="font-normal text-[#605e5c] capitalize">{rot.replace('_', ' ')}:</span>
                                        <span className="font-normal text-[#201f1e] bg-[#f9f9f9] border border-[#d2d0ce] px-2 py-0.5 rounded">{acc}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 17. Inventario Negativo (Riesgo real señalado con tono semántico contenido) */}
                        <div className="bg-white p-4 rounded border border-[#d2d0ce] shadow-xs">
                            <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                17. Saldos Negativos de Inventario
                            </h2>
                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-[#605e5c] font-normal">Casos Registrados:</span>
                                    <span className={`px-2 py-0.5 rounded border font-normal ${stats.negative_stock.cases > 0 ? 'text-[#a4262c] bg-[#fde7e9] border-[#f3b2b6]' : 'text-[#201f1e] bg-[#f3f3f3] border-[#d2d0ce]'}`}>
                                        {stats.negative_stock.cases}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[#605e5c] font-normal">Tasa en Catálogo:</span>
                                    <span className="font-normal text-[#201f1e]">{stats.negative_stock.rate_pct}%</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-[#edebe9]">
                                    <span className="text-[#605e5c] font-normal">Impacto en Valor:</span>
                                    <span className={`font-mono font-normal ${stats.negative_stock.value !== 0 ? 'text-[#a4262c]' : 'text-[#201f1e]'}`}>
                                        {formatMoney(stats.negative_stock.value)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 18. Exactitud por Criticidad Operativa */}
                        <div className="bg-white p-4 rounded border border-[#d2d0ce] shadow-xs">
                            <h2 className="text-xs text-[#605e5c] font-normal border-b border-[#edebe9] pb-2 mb-3">
                                18. Exactitud por Criticidad Operativa
                            </h2>
                            <div className="space-y-2 text-xs">
                                {Object.keys(stats.criticality_accuracy).length > 0 ? (
                                    Object.entries(stats.criticality_accuracy).map(([crit, acc]) => (
                                        <div key={crit} className="flex justify-between items-center py-1.5 border-b border-[#edebe9]">
                                            <span className="font-normal text-[#605e5c]">{crit}:</span>
                                            <span className="font-normal text-[#201f1e] bg-[#f3f3f3] px-2 py-0.5 rounded border border-[#d2d0ce]">{acc}%</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-xs text-[#605e5c] font-normal py-2">Todos los materiales clasificados como Estándar.</div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Top Discrepancies Table with Compact Rows */}
                    <div className="bg-white rounded border border-[#d2d0ce] shadow-xs overflow-hidden mt-3">
                        <div className="px-4 py-2.5 border-b border-[#d2d0ce] flex justify-between items-center bg-[#f9f9f9]">
                            <h2 className="text-xs text-[#605e5c] font-normal">
                                Top Discrepancias Financieras & Asignación de Causa Raíz
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[#f3f3f3] text-xs font-normal text-[#201f1e] border-b border-[#d2d0ce]">
                                        <th className="px-4 py-2.5 font-semibold">Código Item</th>
                                        <th className="px-4 py-2.5 font-semibold">Descripción</th>
                                        <th className="px-4 py-2.5 text-center font-semibold">Diferencia</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">Impacto USD</th>
                                        <th className="px-4 py-2.5 font-semibold">Causa Raíz</th>
                                        <th className="px-4 py-2.5 text-center font-semibold">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#edebe9] text-xs">
                                    {stats.top_losses.map((item, i) => (
                                        <tr key={i} className="hover:bg-[#f3f9fd] transition-colors">
                                            <td className="px-4 py-2.5 font-normal text-[#201f1e] font-mono">{item.code}</td>
                                            <td className="px-4 py-2.5 text-[#201f1e] font-normal truncate max-w-[260px]">{item.desc}</td>
                                            <td className={`px-4 py-2.5 text-center font-mono font-normal ${item.diff < 0 ? 'text-[#a4262c]' : 'text-[#201f1e]'}`}>
                                                {item.diff > 0 ? '+' : ''}{item.diff}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono font-normal text-[#201f1e]">
                                                {formatMoney(item.abs_val_diff)}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className="inline-block bg-[#f9f9f9] text-[#201f1e] text-xs font-normal px-2.5 py-0.5 rounded border border-[#d2d0ce]">
                                                    {item.root_cause}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <button
                                                    onClick={() => { setCauseModalItem(item); setSelectedCause(item.root_cause !== 'Sin causa determinada' ? item.root_cause : ROOT_CAUSES_LIST[0]); }}
                                                    className="text-xs font-normal text-[#0078d4] hover:text-[#106ebe] bg-white hover:bg-[#f3f3f3] border border-[#d2d0ce] hover:border-[#0078d4] px-2.5 py-1 rounded transition-colors"
                                                >
                                                    Asignar Causa
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Asignar Causa Raíz */}
            {causeModalItem && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 z-50 font-segoe-ui">
                    <div className="bg-white rounded border border-[#d2d0ce] shadow-2xl max-w-md w-full p-5">
                        <h3 className="text-sm font-normal text-[#201f1e] mb-1">Asignar Causa Raíz de Diferencia</h3>
                        <p className="text-xs text-[#605e5c] mb-4">
                            Item: <span className="font-normal text-[#201f1e]">{causeModalItem.code}</span> — Discrepancia: <span className="font-normal text-[#a4262c]">{causeModalItem.diff} unid</span>
                        </p>

                        <div className="mb-4">
                            <label className="text-xs font-normal text-[#201f1e] block mb-1.5">Seleccionar Causa Estandarizada</label>
                            <select
                                value={selectedCause}
                                onChange={(e) => setSelectedCause(e.target.value)}
                                className="w-full bg-white border border-[#8a8886] rounded p-2 text-xs font-normal text-[#201f1e] focus:outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] transition-all"
                            >
                                {ROOT_CAUSES_LIST.map((cause) => (
                                    <option key={cause} value={cause}>{cause}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-[#edebe9]">
                            <button
                                onClick={() => setCauseModalItem(null)}
                                className="px-3.5 py-1.5 rounded text-xs font-normal text-[#201f1e] bg-white hover:bg-[#f3f3f3] border border-[#d2d0ce] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAssignCause}
                                disabled={updatingCause}
                                className="px-4 py-1.5 rounded text-xs font-normal text-white bg-[#0078d4] hover:bg-[#106ebe] border border-transparent shadow-xs transition-all disabled:opacity-50"
                            >
                                {updatingCause ? 'Guardando...' : 'Guardar Causa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DashboardInventario;

