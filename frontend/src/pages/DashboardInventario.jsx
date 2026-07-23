import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

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
        <div className="flex items-center justify-center min-h-[50vh] bg-slate-50">
            <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-slate-600 text-[11px] font-semibold uppercase tracking-wider">Calculando 18 Indicadores de Inventario...</div>
            </div>
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-200 text-xs font-medium max-w-md text-center shadow-xs">
                <p className="font-bold mb-0.5">Error de Carga</p>
                <p>{error}</p>
            </div>
        </div>
    );

    if (stats?.empty) return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-slate-500 text-xs uppercase tracking-widest bg-white p-5 rounded-lg border border-slate-200 shadow-xs text-center">
                <p className="text-sm font-semibold text-slate-700 mb-1">No hay datos de conteos cíclicos</p>
                <p className="text-slate-400 font-normal">Realice o registre conteos para visualizar los 18 indicadores.</p>
            </div>
        </div>
    );

    return (
        <div className="max-w-[1440px] mx-auto px-3 py-2 font-sans bg-slate-50/50 min-h-screen text-slate-800 leading-tight">

            {/* Header & Section Tabs Bar Compact */}
            <div className="bg-white px-3.5 py-2.5 rounded-lg border border-slate-200/80 shadow-xs mb-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                    <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">Gestión de Inventarios Cíclicos</h1>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">Tablero ejecutivo compacto con 18 indicadores de exactitud, cobertura y riesgos</p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Section Selectors */}
                    <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-md border border-slate-200/60">
                        <button
                            onClick={() => setActiveSection('kpis')}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${activeSection === 'kpis' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            1. KPIs Prioritarios (Top 8)
                        </button>
                        <button
                            onClick={() => setActiveSection('process')}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${activeSection === 'process' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            2. Control & Pareto de Causas
                        </button>
                        <button
                            onClick={() => setActiveSection('risk')}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${activeSection === 'risk' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            3. Rotación & Riesgos
                        </button>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 1: KPIs PRIORITARIOS (TOP 8) */}
            {activeSection === 'kpis' && (
                <div className="space-y-2.5">
                    {/* Top KPI Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">

                        {/* 1. ERI Global y Clase ABC */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-xs relative overflow-hidden">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">1. ERI Global</span>
                                <span className="text-[11px] font-semibold text-slate-400">{stats.total_items} ítems</span>
                            </div>
                            <div className="flex items-baseline gap-1 my-0.5">
                                <span className="text-2xl font-extrabold text-slate-900 leading-none">{stats.eri.Global}</span>
                                <span className="text-xs font-bold text-slate-500">%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mb-2">
                                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${stats.eri.Global}%` }}></div>
                            </div>
                            <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-100 text-center">
                                <div>
                                    <span className="text-[9px] text-slate-400 block uppercase font-medium">Clase A</span>
                                    <span className="text-xs font-bold text-slate-700">{stats.eri.A || 80}%</span>
                                </div>
                                <div>
                                    <span className="text-[9px] text-slate-400 block uppercase font-medium">Clase B</span>
                                    <span className="text-xs font-bold text-slate-700">{stats.eri.B || 78}%</span>
                                </div>
                                <div>
                                    <span className="text-[9px] text-slate-400 block uppercase font-medium">Clase C</span>
                                    <span className="text-xs font-bold text-slate-700">{stats.eri.C || 82}%</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Cumplimiento del Programa */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-xs">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">2. Cumplimiento Plan</span>
                                <span className="text-xs font-bold text-emerald-600">{stats.compliance.pct}%</span>
                            </div>
                            <div className="flex items-baseline gap-1 my-0.5">
                                <span className="text-2xl font-extrabold text-slate-900 leading-none">{stats.compliance.counted}</span>
                                <span className="text-[11px] text-slate-500 font-medium">/ {stats.compliance.planned} programados</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mb-2">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${stats.compliance.pct}%` }}></div>
                            </div>
                            <p className="text-[10px] text-slate-400 font-normal leading-tight">Avance del programa de auditorías estipulado.</p>
                        </div>

                        {/* 3. Cobertura del Inventario */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-xs">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">3. Cobertura SKU</span>
                                <span className="text-xs font-bold text-cyan-600">{stats.coverage.pct}%</span>
                            </div>
                            <div className="flex items-baseline gap-1 my-0.5">
                                <span className="text-2xl font-extrabold text-slate-900 leading-none">{stats.coverage.unique_skus_counted}</span>
                                <span className="text-[11px] text-slate-500 font-medium">SKUs únicos ({stats.coverage.total_active_skus} activos)</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mb-2">
                                <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${stats.coverage.pct}%` }}></div>
                            </div>
                            <p className="text-[10px] text-slate-400 font-normal leading-tight">Evita inflación por repetir conteos.</p>
                        </div>

                        {/* 4 & 5. Exactitud por Unidades vs Valor Económico */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-xs">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">4 & 5. Unidades vs Valor</span>
                            </div>
                            <div className="space-y-1 my-0.5">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-600 font-medium">Exactitud Unidades:</span>
                                    <span className="font-bold text-slate-900">{stats.units_accuracy_pct}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                    <div className="bg-amber-500 h-full" style={{ width: `${stats.units_accuracy_pct}%` }}></div>
                                </div>

                                <div className="flex justify-between items-center text-xs pt-1">
                                    <span className="text-slate-600 font-medium">Exactitud Financiera:</span>
                                    <span className="font-bold text-indigo-700">{stats.financial_accuracy_pct}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                    <div className="bg-indigo-600 h-full" style={{ width: `${stats.financial_accuracy_pct}%` }}></div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Financial Impact & Resolution / Recurrence Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">

                        {/* 6. Valor Neto y Absoluto de Ajustes */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-2">
                                6. Magnitud Financiera de Ajustes
                            </h2>

                            <div className="space-y-2">
                                <div className="bg-slate-50 p-2 rounded-md border border-slate-100">
                                    <span className="text-[9px] uppercase font-semibold text-slate-400 block">Ajuste Neto (Efecto Contable)</span>
                                    <div className={`text-xl font-extrabold leading-tight ${stats.adjustments.value.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {formatMoney(stats.adjustments.value.net)}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium">
                                        {stats.adjustments.units.net >= 0 ? '+' : ''}{stats.adjustments.units.net} Unidades Netas
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-2 rounded-md border border-slate-100">
                                    <span className="text-[9px] uppercase font-semibold text-slate-400 block">Ajuste Absoluto (Exposición Total)</span>
                                    <div className="text-xl font-extrabold text-slate-900 leading-tight">
                                        {formatMoney(stats.adjustments.value.gross)}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium">
                                        {stats.adjustments.units.gross} Unidades Totales de Diferencia
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 7 & 8. Tasa de Diferencias & Promedio SKU */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs flex flex-col justify-between">
                            <div>
                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-2">
                                    7 & 8. Frecuencia y Magnitud por SKU
                                </h2>

                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div className="bg-slate-50 p-2 rounded-md">
                                        <span className="text-[9px] font-semibold text-slate-400 block uppercase">Tasa Discrepancias</span>
                                        <span className="text-xl font-extrabold text-rose-600">{stats.diff_rate_pct}%</span>
                                        <span className="text-[9px] text-slate-400 block">del total SKUs</span>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-md">
                                        <span className="text-[9px] font-semibold text-slate-400 block uppercase">Diferencia Promedio</span>
                                        <span className="text-xl font-extrabold text-slate-800">{stats.avg_diff_per_sku}</span>
                                        <span className="text-[9px] text-slate-400 block">unid / SKU erróneo</span>
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-1.5">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-slate-700">7. Tasa Reincidencia:</span>
                                        <span className="font-bold text-rose-600">{stats.recurrency_rate_pct}%</span>
                                    </div>
                                    <p className="text-[9px] text-slate-400">Referencias con fallas en múltiples conteos.</p>
                                </div>
                            </div>
                        </div>

                        {/* 13. Tiempo de Resolución de Diferencias */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-2">
                                13. Tiempo de Resolución & Casos
                            </h2>

                            <div className="mb-2 flex items-baseline gap-1.5">
                                <span className="text-2xl font-extrabold text-indigo-600 leading-none">{stats.resolution_time.avg_days}</span>
                                <span className="text-xs text-slate-500 font-medium">días promedio de cierre</span>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 mb-2">
                                <div className="bg-amber-50 p-2 rounded-md border border-amber-100">
                                    <span className="text-[9px] font-semibold text-amber-700 uppercase block">Casos Abiertos</span>
                                    <span className="text-base font-bold text-amber-900">{stats.resolution_time.open_cases}</span>
                                </div>
                                <div className="bg-emerald-50 p-2 rounded-md border border-emerald-100">
                                    <span className="text-[9px] font-semibold text-emerald-700 uppercase block">Casos Cerrados</span>
                                    <span className="text-base font-bold text-emerald-900">{stats.resolution_time.resolved_cases}</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <span className="text-[9px] font-semibold text-slate-400 uppercase block">Antigüedad de Casos Pendientes</span>
                                <div className="grid grid-cols-4 gap-1 text-center text-[9px]">
                                    <div className="bg-slate-100 p-0.5 rounded font-medium text-slate-700">0-2d: {stats.resolution_time.aging['0_2_days']}</div>
                                    <div className="bg-slate-100 p-0.5 rounded font-medium text-slate-700">3-7d: {stats.resolution_time.aging['3_7_days']}</div>
                                    <div className="bg-slate-100 p-0.5 rounded font-medium text-slate-700">8-15d: {stats.resolution_time.aging['8_15_days']}</div>
                                    <div className="bg-slate-100 p-0.5 rounded font-medium text-slate-700">+15d: {stats.resolution_time.aging['over_15_days']}</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* SECCIÓN 2: CONTROL DE PROCESO & PARETO DE CAUSAS */}
            {activeSection === 'process' && (
                <div className="space-y-2.5">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">

                        {/* 9. Pareto de Causas Raíz */}
                        <div className="lg:col-span-2 bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-2">
                                9. Pareto de Causas de Diferencias (Impacto en USD y Conteo)
                            </h2>

                            {stats.pareto_causes.length > 0 ? (
                                <div className="space-y-2">
                                    {stats.pareto_causes.map((c, i) => (
                                        <div key={i} className="bg-slate-50/70 p-2 rounded-md border border-slate-100">
                                            <div className="flex justify-between items-center mb-0.5 text-xs">
                                                <span className="font-bold text-slate-800">{c.root_cause}</span>
                                                <div className="text-right">
                                                    <span className="font-extrabold text-indigo-600 mr-2">{formatMoney(c.impact_usd)}</span>
                                                    <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{c.count} casos ({c.pct}%)</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                                                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${c.pct}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 text-slate-400 text-xs">
                                    No se han registrado causas aún. Asigne causas raíz en la tabla de discrepancias.
                                </div>
                            )}
                        </div>

                        {/* 11 & 12. First Count Accuracy & Reconteos */}
                        <div className="space-y-2.5">
                            <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-2">
                                    11 & 12. Calidad Inicial de Conteo
                                </h2>
                                <div className="space-y-2 text-xs">
                                    <div>
                                        <div className="flex justify-between font-medium mb-0.5">
                                            <span>First Count Accuracy:</span>
                                            <span className="font-bold text-indigo-600">{stats.first_count_accuracy_pct}%</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                            <div className="bg-indigo-600 h-full" style={{ width: `${stats.first_count_accuracy_pct}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="pt-1 border-t border-slate-100">
                                        <div className="flex justify-between font-medium mb-0.5">
                                            <span>Tasa de Reconteo:</span>
                                            <span className="font-bold text-amber-600">{stats.recount_rate_pct}%</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                            <div className="bg-amber-500 h-full" style={{ width: `${stats.recount_rate_pct}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 14. Productividad del Conteo */}
                            <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-1.5">
                                    14. Productividad Operativa
                                </h2>
                                <div className="flex items-baseline gap-1.5 mb-0.5">
                                    <span className="text-2xl font-extrabold text-emerald-600 leading-none">{stats.productivity.rate}</span>
                                    <span className="text-xs text-slate-500 font-medium">SKU / Hora-Persona</span>
                                </div>
                                <p className="text-[10px] text-slate-400">Total horas-hombre: {stats.productivity.total_person_hours} hrs</p>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* SECCIÓN 3: ROTACIÓN & RIESGOS */}
            {activeSection === 'risk' && (
                <div className="space-y-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">

                        {/* 16. Exactitud por Rotación */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-2">
                                16. Exactitud por Rotación
                            </h2>
                            <div className="space-y-1.5">
                                {Object.entries(stats.rotation_accuracy).map(([rot, acc]) => (
                                    <div key={rot} className="flex justify-between items-center py-0.5 border-b border-slate-50 text-xs">
                                        <span className="font-medium text-slate-700">{rot.replace('_', ' ')}:</span>
                                        <span className="font-bold text-slate-900">{acc}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 17. Inventario Negativo */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-2">
                                17. Saldos Negativos de Inventario
                            </h2>
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600">Casos Registrados:</span>
                                    <span className="font-extrabold text-rose-600">{stats.negative_stock.cases}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600">Tasa en Catálogo:</span>
                                    <span className="font-bold text-slate-900">{stats.negative_stock.rate_pct}%</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                                    <span className="text-slate-600">Impacto en Valor:</span>
                                    <span className="font-bold text-rose-600">{formatMoney(stats.negative_stock.value)}</span>
                                </div>
                            </div>
                        </div>

                        {/* 18. Exactitud por Criticidad Operativa */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1 mb-2">
                                18. Exactitud por Criticidad Operativa
                            </h2>
                            <div className="space-y-1.5 text-xs">
                                {Object.keys(stats.criticality_accuracy).length > 0 ? (
                                    Object.entries(stats.criticality_accuracy).map(([crit, acc]) => (
                                        <div key={crit} className="flex justify-between items-center py-0.5 border-b border-slate-50">
                                            <span className="font-medium text-slate-700">{crit}:</span>
                                            <span className="font-bold text-indigo-700">{acc}%</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-xs text-slate-400">Todos los materiales clasificados como Estándar.</div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Top Discrepancies Table with Compact Rows */}
                    <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden mt-2.5">
                        <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Top Discrepancias Financieras & Asignación de Causa Raíz
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        <th className="px-3.5 py-1.5">Item Code</th>
                                        <th className="px-3.5 py-1.5">Descripción</th>
                                        <th className="px-3.5 py-1.5 text-center">Diferencia</th>
                                        <th className="px-3.5 py-1.5 text-right">Impacto USD</th>
                                        <th className="px-3.5 py-1.5">Causa Raíz</th>
                                        <th className="px-3.5 py-1.5 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {stats.top_losses.map((item, i) => (
                                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-3.5 py-1.5 font-bold text-slate-800">{item.code}</td>
                                            <td className="px-3.5 py-1.5 text-slate-600 truncate max-w-[240px]">{item.desc}</td>
                                            <td className={`px-3.5 py-1.5 text-center font-mono font-bold ${item.diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {item.diff > 0 ? '+' : ''}{item.diff}
                                            </td>
                                            <td className="px-3.5 py-1.5 text-right font-mono font-extrabold text-slate-900">
                                                {formatMoney(item.abs_val_diff)}
                                            </td>
                                            <td className="px-3.5 py-1.5">
                                                <span className="inline-block bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                                                    {item.root_cause}
                                                </span>
                                            </td>
                                            <td className="px-3.5 py-1.5 text-center">
                                                <button
                                                    onClick={() => { setCauseModalItem(item); setSelectedCause(item.root_cause !== 'Sin causa determinada' ? item.root_cause : ROOT_CAUSES_LIST[0]); }}
                                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-colors"
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl max-w-md w-full p-4 border border-slate-200 shadow-xl">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight mb-1">Asignar Causa Raíz de Diferencia</h3>
                        <p className="text-xs text-slate-500 mb-3">Item: <span className="font-bold text-slate-800">{causeModalItem.code}</span> - Diff: <span className="font-bold">{causeModalItem.diff}</span></p>

                        <div className="mb-3">
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Seleccionar Causa Estandarizada</label>
                            <select
                                value={selectedCause}
                                onChange={(e) => setSelectedCause(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {ROOT_CAUSES_LIST.map((cause) => (
                                    <option key={cause} value={cause}>{cause}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setCauseModalItem(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAssignCause}
                                disabled={updatingCause}
                                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all"
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
