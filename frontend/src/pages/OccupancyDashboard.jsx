import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import axios from 'axios';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { exportExcelFile } from '../utils/exportExcel';
import Spinner from '../components/Spinner';
import '../styles/FluentPages.css';

const OccupancyDashboard = () => {
    const { setTitle } = useOutletContext();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedCell, setSelectedCell] = useState(null); // { zone, level }
    const [cellDetails, setCellDetails] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [sekRate, setSekRate] = useState(null); // Tasa COP → SEK (viene del backend)
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (setTitle) setTitle('Ocupación de Bodega');
        fetchData();
    }, [setTitle]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/views/occupancy_stats');
            setData(response.data);
            // La tasa SEK viene cacheada desde el backend (1 consulta/día)
            if (response.data?.sek_rate) {
                setSekRate(response.data.sek_rate);
            }

        } catch (error) {
            console.error('Error fetching occupancy stats:', error);
            toast.error('Error loading occupancy analytics');
        } finally {
            setLoading(false);
        }
    };

    const handleCellClick = async (zone, level) => {
        setSelectedCell({ zone, level });
        setLoadingDetails(true);
        try {
            const params = { zone };
            if (level !== null && level !== undefined) {
                params.level = level;
            }
            const response = await axios.get('/api/views/occupancy_detail', { params });
            setCellDetails(response.data);
        } catch (error) {
            console.error('Error fetching occupancy details:', error);
            toast.error('Error loading bin details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleExportExcel = async () => {
        if (!data) return;
        setIsExporting(true);
        try {
            const response = await axios.get('/api/views/occupancy_detail', {
                params: { zone: 'ALL' }
            });
            const allBins = response.data || [];

            if (allBins.length === 0) {
                toast.warning('No se encontraron ubicaciones para exportar.');
                return;
            }

            const workbook = XLSX.utils.book_new();
            const dateStr = new Date().toISOString().slice(0, 10);
            const timeStr = new Date().toLocaleTimeString('es-CO', { hour12: false });

            const summary = data.summary || {};
            const zonesData = data.zones || {};
            const analytics = data.analytics || {};

            // ----------------------------------------------------
            // HOJA 1: RESUMEN Y ESTADÍSTICAS
            // ----------------------------------------------------
            const statsRows = [
                { 'CATEGORÍA': 'ENCABEZADO', 'MÉTRICA / INDICADOR': 'Fecha de Generación', 'VALOR': `${dateStr} ${timeStr}`, 'DETALLE': 'Reporte generado desde Logix WMS' },
                { 'CATEGORÍA': 'INDICADORES GLOBALES', 'MÉTRICA / INDICADOR': 'Total Ubicaciones (Bins)', 'VALOR': summary.total_bins || allBins.length, 'DETALLE': 'Capacidad total de infraestructura' },
                { 'CATEGORÍA': 'INDICADORES GLOBALES', 'MÉTRICA / INDICADOR': 'Ubicaciones Ocupadas', 'VALOR': summary.filled_bins || allBins.filter(b => b.status === 'OCUPADA').length, 'DETALLE': 'Bins con inventario físico activo' },
                { 'CATEGORÍA': 'INDICADORES GLOBALES', 'MÉTRICA / INDICADOR': 'Ubicaciones Vacías (Libres)', 'VALOR': summary.available_bins || allBins.filter(b => b.status === 'VACÍA').length, 'DETALLE': 'Bins disponibles para recepción/almacenamiento' },
                { 'CATEGORÍA': 'INDICADORES GLOBALES', 'MÉTRICA / INDICADOR': '% Ocupación Global', 'VALOR': `${summary.occupancy_pct || 0}%`, 'DETALLE': (summary.occupancy_pct || 0) >= 85 ? 'Saturación Alta' : (summary.occupancy_pct || 0) >= 30 ? 'Capacidad Activa' : 'Baja Saturación' },
                { 'CATEGORÍA': 'INDICADORES GLOBALES', 'MÉTRICA / INDICADOR': 'SKUs Activos en Stock', 'VALOR': summary.total_items || 0, 'DETALLE': 'Cantidad de referencias con existencia física' },
                { 'CATEGORÍA': 'INDICADORES GLOBALES', 'MÉTRICA / INDICADOR': 'Densidad Promedio de SKUs', 'VALOR': summary.avg_items_per_bin || 0, 'DETALLE': 'Promedio de SKUs por bin ocupado' },
                { 'CATEGORÍA': 'VALORIZACIÓN Y ROTACIÓN', 'MÉTRICA / INDICADOR': 'SKUs Clase A (Alto Valor)', 'VALOR': summary.abc_items_by_type?.A || 0, 'DETALLE': 'Referencias de mayor valor en stock' },
                { 'CATEGORÍA': 'VALORIZACIÓN Y ROTACIÓN', 'MÉTRICA / INDICADOR': 'SKUs Clase B (Valor Medio)', 'VALOR': summary.abc_items_by_type?.B || 0, 'DETALLE': 'Referencias de valor intermedio' },
                { 'CATEGORÍA': 'VALORIZACIÓN Y ROTACIÓN', 'MÉTRICA / INDICADOR': 'SKUs Clase C (Bajo Valor)', 'VALOR': summary.abc_items_by_type?.C || 0, 'DETALLE': 'Referencias de menor valor en stock' },
                { 'CATEGORÍA': 'VALORIZACIÓN Y ROTACIÓN', 'MÉTRICA / INDICADOR': 'Valor Total de Stock (COP)', 'VALOR': `$ ${Number(summary.stock_value || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 'DETALLE': sekRate ? `≈ ${(Number(summary.stock_value || 0) * sekRate).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} SEK` : 'Moneda local' },
                { 'CATEGORÍA': 'ESTADO CUARENTENA / FROZEN', 'MÉTRICA / INDICADOR': 'SKUs Frozen / Cuarentena', 'VALOR': summary.frozen_items || 0, 'DETALLE': 'Referencias bloqueadas' },
                { 'CATEGORÍA': 'ESTADO CUARENTENA / FROZEN', 'MÉTRICA / INDICADOR': 'Unidades en Frozen', 'VALOR': summary.frozen_units || 0, 'DETALLE': 'Unidades físicas retenidas' },
                { 'CATEGORÍA': 'ESTADO CUARENTENA / FROZEN', 'MÉTRICA / INDICADOR': 'Valor Stock Frozen (COP)', 'VALOR': `$ ${Number(summary.frozen_stock_value || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 'DETALLE': `${summary.frozen_stock_pct || 0}% del valor total en stock` },
            ];

            // Desglose por Zona
            Object.entries(zonesData).forEach(([zoneName, zData]) => {
                const occupied = zData.occupied || 0;
                const total = zData.total || 0;
                const vacios = Math.max(0, total - occupied);
                const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
                statsRows.push({
                    'CATEGORÍA': 'DESGLOSE POR ZONA',
                    'MÉTRICA / INDICADOR': `Zona: ${zoneName}`,
                    'VALOR': `${occupied} / ${total} Bins (${pct}% Ocupación)`,
                    'DETALLE': `${vacios} Vacíos • ${occupied} Ocupados`
                });
            });

            // Pasillos de mayor densidad
            if (analytics.top_aisles) {
                Object.entries(analytics.top_aisles).forEach(([aisle, count]) => {
                    statsRows.push({
                        'CATEGORÍA': 'PASILLOS DE MAYOR DENSIDAD',
                        'MÉTRICA / INDICADOR': `Pasillo ${aisle}`,
                        'VALOR': `${count} SKUs`,
                        'DETALLE': 'Densidad de ítems en pasillo'
                    });
                });
            }

            const wsResumen = XLSX.utils.json_to_sheet(statsRows);
            wsResumen['!cols'] = [
                { wch: 30 },
                { wch: 35 },
                { wch: 30 },
                { wch: 45 },
            ];
            XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen y Estadísticas');

            // ----------------------------------------------------
            // HOJA 2: DETALLE DE TODAS LAS UBICACIONES
            // ----------------------------------------------------
            const formatSaturation = (pct, skus) => {
                if (skus === 0) return 'Vacía';
                if (pct < 30) return 'Baja Utilización (<30%)';
                if (pct < 75) return 'Carga Óptima (30-75%)';
                return 'Saturado (≥75%)';
            };

            const allBinsRows = allBins.map(bin => ({
                'Ubicación (Bin)': bin.bin_code || '',
                'Zona': bin.zone || '',
                'Pasillo': bin.aisle || '',
                'Nivel': bin.level ?? '',
                'Rotación (Spot)': bin.spot || 'Cold',
                'Puntuación (Score)': bin.score ?? 0,
                'Estado': bin.status || (bin.skus > 0 ? 'OCUPADA' : 'VACÍA'),
                'Cantidad SKUs': bin.skus ?? 0,
                'Total Unidades Físicas': bin.units ?? 0,
                'Capacidad Máx. (SKUs)': bin.limit ?? 4,
                '% Ocupación': `${bin.occupancy_pct ?? 0}%`,
                'Nivel Saturación': formatSaturation(bin.occupancy_pct ?? 0, bin.skus ?? 0),
                'SKUs Almacenados': bin.items && bin.items.length > 0 ? bin.items.join(', ') : 'Ninguno (Vacía)'
            }));

            const wsDetalle = XLSX.utils.json_to_sheet(allBinsRows);
            wsDetalle['!cols'] = [
                { wch: 18 }, // Ubicación
                { wch: 18 }, // Zona
                { wch: 10 }, // Pasillo
                { wch: 8 },  // Nivel
                { wch: 16 }, // Spot
                { wch: 18 }, // Score
                { wch: 14 }, // Estado
                { wch: 15 }, // Cantidad SKUs
                { wch: 22 }, // Total Unidades Físicas
                { wch: 22 }, // Capacidad Máx
                { wch: 14 }, // % Ocupación
                { wch: 24 }, // Nivel Saturación
                { wch: 45 }, // SKUs Almacenados
            ];
            XLSX.utils.book_append_sheet(workbook, wsDetalle, 'Detalle Ubicaciones');

            // ----------------------------------------------------
            // HOJA 3: UBICACIONES VACÍAS (LIBRES)
            // ----------------------------------------------------
            const emptyBinsRows = allBins
                .filter(b => b.status === 'VACÍA' || b.skus === 0)
                .map(bin => ({
                    'Ubicación (Bin)': bin.bin_code || '',
                    'Zona': bin.zone || '',
                    'Pasillo': bin.aisle || '',
                    'Nivel': bin.level ?? '',
                    'Rotación (Spot)': bin.spot || 'Cold',
                    'Puntuación (Score)': bin.score ?? 0,
                    'Capacidad Máx. (SKUs)': bin.limit ?? 4,
                    'Estado': 'VACÍA',
                    'Disponibilidad': '100% Libre para Almacenar'
                }));

            const wsVacias = XLSX.utils.json_to_sheet(emptyBinsRows);
            wsVacias['!cols'] = [
                { wch: 18 },
                { wch: 18 },
                { wch: 10 },
                { wch: 8 },
                { wch: 16 },
                { wch: 18 },
                { wch: 22 },
                { wch: 12 },
                { wch: 28 },
            ];
            XLSX.utils.book_append_sheet(workbook, wsVacias, 'Ubicaciones Vacías');

            const fileName = `Reporte_Ocupacion_Bodega_${dateStr}.xlsx`;
            const success = await exportExcelFile(workbook, fileName);
            if (success) {
                toast.success(`Reporte exportado exitosamente (${allBins.length} ubicaciones).`);
            }
        } catch (error) {
            console.error('Error al exportar ocupación a Excel:', error);
            toast.error('Error al generar el archivo Excel de ocupación.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportZoneExcel = async (zoneName, levelNum, bins) => {
        if (!bins || bins.length === 0) return;
        try {
            const workbook = XLSX.utils.book_new();
            const dateStr = new Date().toISOString().slice(0, 10);
            const levelLabel = levelNum !== null && levelNum !== undefined ? `Nivel_${levelNum}` : 'Todos_Niveles';

            const formatSaturation = (pct, skus) => {
                if (skus === 0) return 'Vacía';
                if (pct < 30) return 'Baja Utilización (<30%)';
                if (pct < 75) return 'Carga Óptima (30-75%)';
                return 'Saturado (≥75%)';
            };

            const rows = bins.map(bin => ({
                'Ubicación (Bin)': bin.bin_code || '',
                'Zona': bin.zone || zoneName,
                'Pasillo': bin.aisle || '',
                'Nivel': bin.level ?? (levelNum !== null && levelNum !== undefined ? levelNum : ''),
                'Rotación (Spot)': bin.spot || 'Cold',
                'Puntuación (Score)': bin.score ?? 0,
                'Estado': bin.status || (bin.skus > 0 ? 'OCUPADA' : 'VACÍA'),
                'Cantidad SKUs': bin.skus ?? 0,
                'Total Unidades Físicas': bin.units ?? 0,
                'Capacidad Máx. (SKUs)': bin.limit ?? 4,
                '% Ocupación': `${bin.occupancy_pct ?? 0}%`,
                'Nivel Saturación': formatSaturation(bin.occupancy_pct ?? 0, bin.skus ?? 0),
                'SKUs Almacenados': bin.items && bin.items.length > 0 ? bin.items.join(', ') : 'Ninguno (Vacía)'
            }));

            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [
                { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 8 },
                { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 15 },
                { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 24 },
                { wch: 45 }
            ];
            XLSX.utils.book_append_sheet(workbook, ws, `Zona ${zoneName}`);

            const fileName = `Ocupacion_Zona_${zoneName}_${levelLabel}_${dateStr}.xlsx`;
            await exportExcelFile(workbook, fileName);
            toast.success(`Zona exportada exitosamente: ${fileName}`);
        } catch (error) {
            console.error('Error al exportar zona:', error);
            toast.error('Error al exportar datos de la zona seleccionada.');
        }
    };

    const getHeatmapStyle = (percentage) => {
        if (percentage === 0) {
            return 'bg-zinc-100 text-black border-zinc-200 font-normal';
        }
        if (percentage < 30) {
            return 'bg-emerald-200 text-black border-emerald-300 font-normal';
        }
        if (percentage < 75) {
            return 'bg-amber-200 text-black border-amber-300 font-normal';
        }
        return 'bg-red-300 text-black border-red-300 font-normal';
    };

    if (loading) return (
        <Spinner size="lg" label="Procesando datos espaciales..." fullPage />
    );

    if (!data) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-red-50 text-red-750 px-4 py-2 rounded border border-red-200 text-[12px] font-normal">Failed to retrieve warehouse metrics.</div>
        </div>
    );

    const allLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const zones = Object.keys(data.zones).sort();

    const summary = data?.summary || {};
    const totalBins = summary.total_bins || 0;
    const filledBins = summary.filled_bins || 0;
    const availableBins = summary.available_bins || 0;
    const occupancyPct = summary.occupancy_pct || 0;
    const totalItems = summary.total_items || 0;
    const avgItemsPerBin = summary.avg_items_per_bin || 0;
    const itemsA = summary.abc_items_by_type?.A || 0;
    const itemsB = summary.abc_items_by_type?.B || 0;
    const itemsC = summary.abc_items_by_type?.C || 0;
    const stockValue = summary.stock_value || 0;
    const frozenItems = summary.frozen_items || 0;
    const frozenUnits = summary.frozen_units || 0;
    const frozenStockValue = summary.frozen_stock_value || 0;
    const frozenStockPct = summary.frozen_stock_pct || 0;


    const indicators = [
        {
            label: 'Total Bins',
            val: totalBins.toLocaleString(),
            subtext: 'Capacidad total',
            tooltip: `${totalBins.toLocaleString()} Bins configurados en total`
        },
        {
            label: 'Bins Ocupados',
            val: filledBins.toLocaleString(),
            subtext: totalBins > 0 ? `${Math.round((filledBins / totalBins) * 100)}% ocupación` : 'Con inventario',
            tooltip: `${filledBins.toLocaleString()} Bins con carga de SKUs`
        },
        {
            label: 'Bins Libres',
            val: availableBins.toLocaleString(),
            subtext: totalBins > 0 ? `${Math.round((availableBins / totalBins) * 100)}% disponible` : 'Disponibles',
            tooltip: `${availableBins.toLocaleString()} Bins disponibles para almacenamiento`
        },
        {
            label: 'Ocupación',
            val: `${occupancyPct}%`,
            subtext: occupancyPct >= 85 ? 'Saturación alta' : occupancyPct >= 30 ? 'Capacidad activa' : 'Baja saturación',
            valClass: occupancyPct >= 85 ? 'text-[#a4262c]' : 'text-[#201f1e]',
            tooltip: `Nivel de ocupación global: ${occupancyPct}%`
        },
        {
            label: 'SKUs Activos',
            val: totalItems.toLocaleString(),
            subtext: 'En almacenamiento',
            tooltip: `${totalItems.toLocaleString()} SKUs almacenados`
        },
        {
            label: 'Densidad SKU',
            val: avgItemsPerBin,
            subtext: 'Promedio por bin',
            tooltip: `Densidad promedio: ${avgItemsPerBin} SKUs por bin ocupado`
        },
        {
            label: 'Clase A',
            val: itemsA.toLocaleString(),
            subtext: 'Alto valor',
            tooltip: `Ítems Clase A: ${itemsA.toLocaleString()} SKUs (Mayor valor en stock)`
        },
        {
            label: 'Clase B',
            val: itemsB.toLocaleString(),
            subtext: 'Valor medio',
            tooltip: `Ítems Clase B: ${itemsB.toLocaleString()} SKUs (Valor intermedio)`
        },
        {
            label: 'Clase C',
            val: itemsC.toLocaleString(),
            subtext: 'Bajo valor',
            tooltip: `Ítems Clase C: ${itemsC.toLocaleString()} SKUs (Menor valor en stock)`
        },
        {
            label: 'Valor Total Stock',
            val: `$ ${Number(stockValue).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} COP`,
            subtext: sekRate
                ? `≈ ${(Number(stockValue) * sekRate).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} SEK`
                : 'COP',
            valClass: 'text-[13px] xl:text-[11px] 2xl:text-[13px] text-[#201f1e]',
            tooltip: sekRate
                ? `COP: $ ${Number(stockValue).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — SEK: kr ${(Number(stockValue) * sekRate).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tasa: 1 COP = ${sekRate} SEK)`
                : `Valor exacto: $ ${Number(stockValue).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP`
        },
        {
            label: 'Items Frozen',
            val: frozenItems.toLocaleString(),
            subtext: `${frozenUnits.toLocaleString()} unidades`,
            tooltip: `${frozenItems.toLocaleString()} SKUs en congelado / cuarentena (${frozenUnits.toLocaleString()} unidades en total)`
        },
        {
            label: 'Valor Frozen',
            val: `$ ${Number(frozenStockValue).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} COP`,
            subtext: `${Number(frozenStockPct).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% del stock`,
            valClass: 'text-[13px] xl:text-[11px] 2xl:text-[13px] text-[#201f1e]',
            tooltip: `Valor en frozen: $ ${Number(frozenStockValue).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP (${Number(frozenStockPct).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% del stock total)`
        }
    ];

    return (
        <div className="occupancy-dashboard-page max-w-[1600px] mx-auto px-6 pt-3 pb-6 font-segoe-ui bg-[#fcfcfc] min-h-screen text-[#201f1e] text-[12px] antialiased">

            {/* Header with Title and Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                <div>
                    <h2 className="text-[14px] font-normal uppercase text-[#201f1e]">
                        Control de Ocupación y Capacidad de Almacenamiento
                    </h2>
                    <p className="text-[11px] text-[#605e5c] mt-0.5 font-normal">
                        Métricas de saturación espacial, densidad de SKUs y disponibilidad de slots en tiempo real
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={fetchData}
                        disabled={loading}
                        className="h-8 px-3 text-xs text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f3f3] rounded font-normal transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs flex items-center gap-1.5"
                        title="Actualizar métricas"
                    >
                        <svg className={`w-3.5 h-3.5 text-[#605e5c] ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Refrescar</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={isExporting || loading}
                        className="h-8 px-3 text-xs text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f3f3] rounded font-normal transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs flex items-center gap-1.5"
                        title="Exportar reporte completo de ocupación a Excel (.xlsx)"
                    >
                        {isExporting ? (
                            <>
                                <Spinner size="xs" />
                                <span>Exportando...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5 text-[#107c10]" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1.8 14.5l-1.3-2.1-1.3 2.1h-1.6l2.1-3.2-2-3.1h1.6l1.2 2 1.2-2h1.6l-2 3.1 2.1 3.2h-1.6zM13 9V3.5L18.5 9H13z"/>
                                </svg>
                                <span>Exportar Excel</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Global Utilization Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-4">
                {indicators.map((card, idx) => (
                    <div
                        key={idx}
                        title={card.tooltip}
                        className="bg-white min-w-0 px-3 py-2 rounded border border-[#d2d0ce] shadow-xs flex flex-col justify-between h-[82px] transition-colors hover:border-[#a19f9d]"
                    >
                        <span className="text-[12px] uppercase font-normal text-[#1F1E1E] block truncate leading-none">
                            {card.label}
                        </span>

                        <div className="flex items-baseline my-0.5">
                            <span className={`font-segoe-ui text-[20px] xl:text-[18px] 2xl:text-[20px] font-normal leading-none truncate ${card.valClass || 'text-[#1F1E1E]'}`}>
                                {card.val}
                            </span>
                        </div>

                        <span className="text-[14px] font-normal text-[#1F1E1E] block truncate leading-none">
                            {card.subtext}
                        </span>
                    </div>
                ))}
            </div>

            {/* Heatmap Matrix Section */}
            <div className="bg-white border border-zinc-300 shadow-sm mb-8 overflow-hidden text-black">
                <div className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center text-black">
                    <h3 className="text-[14px] font-normal font-segoe-ui text-black uppercase">
                        Matriz de Saturación de Bins (Nivel vs Zona)
                    </h3>
                </div>
                <div className="overflow-x-auto text-black">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-zinc-100 border-b border-zinc-300">
                                <th className="px-4 py-1.5 text-left text-[14px] !font-normal font-segoe-ui text-[#201f1e] uppercase border-b border-zinc-300">Identificador de Zona</th>
                                {allLevels.map(level => (
                                    <th key={level} className="px-2 py-1.5 text-center text-[14px] !font-normal font-segoe-ui text-[#201f1e] uppercase border-b border-zinc-300">
                                        Nivel {level}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                            {zones.map(zoneName => {
                                const zoneData = data.zones[zoneName];
                                const zoneOccupancyPct = zoneData.total > 0
                                    ? Math.round((zoneData.occupied / zoneData.total) * 100)
                                    : 0;
                                const isZoneSelected = selectedCell && selectedCell.zone === zoneName && selectedCell.level === null;
                                return (
                                    <tr key={zoneName} className="hover:bg-zinc-50/50 transition-colors">
                                        <td
                                            onClick={() => handleCellClick(zoneName, null)}
                                            className={`px-4 py-1.5 cursor-pointer transition-all duration-200 ${isZoneSelected
                                                ? 'bg-zinc-100 border-l-4 border-black font-normal'
                                                : 'hover:bg-zinc-100/70'
                                                }`}
                                        >
                                            <div className="text-[14px] font-normal text-black uppercase flex items-center gap-1.5">
                                                <span className="hover:underline">{zoneName}</span>
                                                <span className="text-[12px] text-[#8a8886] font-normal lowercase">(Ver todo)</span>
                                            </div>
                                            <div className="text-[14px] text-[#1F1E1E] font-normal mt-0.5 uppercase">
                                                {zoneData.total} Bins Total • {zoneOccupancyPct}% Ocupación
                                            </div>
                                        </td>
                                        {allLevels.map(level => {
                                            const levelData = zoneData.levels[level] || { total: 0, full_bins: 0, occupied_skus: 0, total_occupancy_pct: 0, occupied_bins: 0 };
                                            const occupancyPercent = levelData.total > 0
                                                ? (levelData.total_occupancy_pct !== undefined
                                                    ? Math.round(levelData.total_occupancy_pct / levelData.total)
                                                    : Math.round((levelData.full_bins / levelData.total) * 100))
                                                : 0;

                                            const isSelected = selectedCell && selectedCell.zone === zoneName && selectedCell.level === level;

                                            return (
                                                <td key={level} className="px-1 py-1">
                                                    {levelData.total > 0 ? (
                                                        <div
                                                            onClick={() => handleCellClick(zoneName, level)}
                                                            className={`
                                                                w-full h-16 flex flex-col items-center justify-center rounded-sm border
                                                                ${getHeatmapStyle(occupancyPercent)}
                                                                cursor-pointer hover:border-zinc-400 hover:shadow-sm transition-all duration-200
                                                                ${isSelected ? 'ring-2 ring-black border-transparent scale-105 shadow-md z-10' : ''}
                                                            `}
                                                        >
                                                            <span className="text-[14px] font-normal leading-none mb-1 text-black">{occupancyPercent}%</span>
                                                            <div className="text-[14px] uppercase font-normal opacity-90 text-center text-black">
                                                                {levelData.occupied_bins !== undefined ? levelData.occupied_bins : levelData.full_bins}/{levelData.total} Bins
                                                            </div>
                                                            <div className="text-[14px] font-normal opacity-85 text-black">
                                                                {levelData.occupied_skus} SKUs
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-16 flex items-center justify-center text-[#d2d0ce] font-segoe-ui text-[14px]">
                                                            —
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Legend Bar Compact */}
                <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center gap-6 text-black">
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-emerald-200 border border-emerald-300 rounded-sm"></div>
                        <span className="text-[12px] font-normal text-black uppercase">Baja Utilización</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-amber-200 border border-amber-300 rounded-sm"></div>
                        <span className="text-[12px] font-normal text-black uppercase">Carga Óptima</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-red-300 border border-red-300 rounded-sm"></div>
                        <span className="text-[12px] font-normal text-black uppercase">Saturado</span>
                    </div>
                    <div className="ml-auto text-[12px] font-normal text-black">
                        * Los valores indican bins alcanzando umbrales de capacidad configurados.
                    </div>
                </div>
            </div>

            {/* Bin Details Matrix Section */}
            {selectedCell && (
                <div className="bg-white border border-zinc-300 shadow-md mb-8 overflow-hidden transition-all duration-300 text-black">
                    <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center text-black">
                        <div>
                            <h3 className="text-[12px] font-normal text-black uppercase">
                                Mapa de Ubicaciones: Zona {selectedCell.zone} {selectedCell.level !== null ? `— Nivel ${selectedCell.level}` : '— Todos los Niveles'}
                            </h3>
                            <p className="text-[12px] text-black font-normal uppercase mt-1">
                                {loadingDetails ? 'Cargando infraestructura...' : `${cellDetails.length} Ubicaciones encontradas`}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {cellDetails.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => handleExportZoneExcel(selectedCell.zone, selectedCell.level, cellDetails)}
                                    className="h-7 px-2.5 text-[11px] text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f3f3] rounded font-normal transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                                    title="Exportar únicamente esta zona/nivel a Excel"
                                >
                                    <svg className="w-3.5 h-3.5 text-[#107c10]" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1.8 14.5l-1.3-2.1-1.3 2.1h-1.6l2.1-3.2-2-3.1h1.6l1.2 2 1.2-2h1.6l-2 3.1 2.1 3.2h-1.6zM13 9V3.5L18.5 9H13z"/>
                                    </svg>
                                    <span>Exportar Zona</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => { setSelectedCell(null); setCellDetails([]); }}
                                className="text-[#605e5c] hover:text-[#201f1e] hover:bg-[#f3f3f3] rounded p-1 transition-colors cursor-pointer"
                                title="Cerrar detalle"
                                aria-label="Cerrar detalle"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="p-6">
                        {loadingDetails ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Spinner size="md" label="Analizando mapa de slots..." />
                            </div>
                        ) : cellDetails.length === 0 ? (
                            <div className="text-center py-12 text-black text-[12px] font-normal">
                                No se encontraron bins configurados para la Zona {selectedCell.zone} {selectedCell.level !== null ? `en el Nivel ${selectedCell.level}` : 'en ningún nivel'}.
                            </div>
                        ) : (
                            <div className="space-y-8 text-black">
                                {/* Agrupar por Pasillo */}
                                {Object.entries(
                                    cellDetails.reduce((acc, bin) => {
                                        const aisle = bin.aisle || 'Sin Pasillo';
                                        if (!acc[aisle]) acc[aisle] = [];
                                        acc[aisle].push(bin);
                                        return acc;
                                    }, {})
                                ).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([aisle, bins]) => (
                                    <div key={aisle} className="border border-zinc-200 rounded-sm p-4 bg-zinc-50/50">
                                        <div className="flex items-center justify-between mb-4 border-b border-zinc-200 pb-2">
                                            <span className="text-[14px] font-normal text-black">
                                                Pasillo: {aisle}
                                            </span>
                                            <span className="text-[14px] text-black font-normal font-segoe-ui">
                                                {bins.length} Bins
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 lg:grid-cols-12 gap-1.5">
                                            {bins.map(bin => {
                                                const occupancyColor =
                                                    bin.occupancy_pct === 0 ? 'bg-zinc-100 text-black border-zinc-200 font-normal' :
                                                        bin.occupancy_pct < 30 ? 'bg-emerald-200 text-black border-emerald-300 font-normal' :
                                                            bin.occupancy_pct < 75 ? 'bg-amber-200 text-black border-amber-300 font-normal' :
                                                                'bg-red-300 text-black border-red-300 font-normal';

                                                return (
                                                    <div
                                                        key={bin.bin_code}
                                                        title={`${bin.bin_code} • ${bin.skus} SKUs • ${bin.spot}`}
                                                        className={`border p-1.5 rounded-sm flex flex-col justify-between h-14 ${occupancyColor} shadow-sm`}
                                                    >
                                                        <div className="flex justify-between items-start gap-0.5">
                                                            <span className="text-[14px] font-normal font-segoe-ui text-black truncate">{bin.bin_code}</span>
                                                            <span className={`text-[10px] uppercase font-normal px-0.5 rounded-sm shrink-0 ${bin.spot === 'Hot'
                                                                ? 'bg-orange-500 text-white'
                                                                : 'bg-blue-500 text-white'
                                                                }`}>
                                                                {bin.spot}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-end">
                                                            <span className="text-[14px] font-normal font-segoe-ui leading-none text-black opacity-80">{bin.skus} SKUs</span>
                                                            <span className="text-[14px] font-segoe-ui font-normal text-black">{bin.occupancy_pct}%</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Granular Analytics Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-black">

                {/* 1. Spatial Distribution */}
                <div className="bg-white p-6 border border-zinc-200 shadow-sm">
                    <h3 className="text-[14px] font-normal text-black uppercase mb-4 border-b border-zinc-100 pb-2">
                        Distribución de Bins por Zona
                    </h3>
                    <div className="space-y-4">
                        {(() => {
                            const totalBins = Object.values(data.analytics.bins_by_zone).reduce((acc, val) => acc + val, 0);
                            return Object.entries(data.analytics.bins_by_zone).map(([zone, count]) => {
                                const percentage = totalBins > 0 ? ((count / totalBins) * 100).toFixed(1) : 0;
                                return (
                                    <div key={zone} className="flex justify-between items-end border-b border-zinc-50 pb-1.5">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[14px] font-normal text-black">{zone}</span>
                                        </div>
                                        <span className="text-black font-normal text-[14px]">
                                            {count} <span className="text-[14px] ml-0.5 text-black font-normal">Units</span>
                                            <span className="text-black font-normal text-[14px] ml-2">({percentage}%)</span>
                                        </span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>

                {/* 2. SKU Volume Distribution */}
                <div className="bg-white p-6 border border-zinc-200 shadow-sm text-black">
                    <h3 className="text-[14px] font-normal text-black uppercase mb-4 border-b border-zinc-100 pb-2">
                        Densidad de SKUs por Zona
                    </h3>
                    <div className="space-y-4">
                        {(() => {
                            const totalItems = Object.values(data.analytics.zones_by_items).reduce((acc, val) => acc + val, 0);
                            return Object.entries(data.analytics.zones_by_items).map(([zone, count]) => {
                                const maxVal = Object.values(data.analytics.zones_by_items)[0] || 1;
                                const pct = Math.round((count / maxVal) * 100);
                                const itemPct = totalItems > 0 ? ((count / totalItems) * 100).toFixed(1) : 0;
                                return (
                                    <div key={zone}>
                                        <div className="flex justify-between text-[14px] font-normal text-black mb-1">
                                            <span>{zone}</span>
                                            <span className="text-black font-normal text-[14px]">
                                                {count}
                                                <span className="text-black font-normal text-[14px] ml-2">({itemPct}%)</span>
                                            </span>
                                        </div>
                                        <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }}></div>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>

                {/* 3. Operational Risk (Hot Aisles) */}
                <div className="bg-white p-6 border border-zinc-200 shadow-sm text-black">
                    <h3 className="text-[14px] font-normal text-black uppercase mb-4 border-b border-zinc-100 pb-2">
                        Densidad Crítica (Pasillos Principales)
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(data.analytics.top_aisles).map(([aisle, count], idx) => {
                            const maxVal = Object.values(data.analytics.top_aisles)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={aisle}>
                                    <div className="flex justify-between text-[14px] font-normal text-black mb-1">
                                        <span>Pasillo {aisle}</span>
                                        <span className="text-black font-normal text-[14px]">{count}</span>
                                    </div>
                                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${idx === 0 ? 'bg-red-600' : 'bg-blue-500'}`}
                                            style={{ width: `${pct}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default OccupancyDashboard;
