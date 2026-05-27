import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import axios from 'axios';
import { toast } from 'react-toastify';

const OccupancyDashboard = () => {
    const { setTitle } = useOutletContext();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedCell, setSelectedCell] = useState(null); // { zone, level }
    const [cellDetails, setCellDetails] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        if (setTitle) setTitle('Mapa de Slotting');
        fetchData();
    }, [setTitle]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/views/occupancy_stats');
            setData(response.data);
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
            const response = await axios.get('/api/views/occupancy_detail', {
                params: { zone, level }
            });
            setCellDetails(response.data);
        } catch (error) {
            console.error('Error fetching occupancy details:', error);
            toast.error('Error loading bin details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const getHeatmapStyle = (percentage) => {
        if (percentage === 0) {
            return 'bg-zinc-100 text-zinc-400 border-zinc-200';
        }
        if (percentage < 30) {
            return 'bg-emerald-200 text-emerald-950 border-emerald-300';
        }
        if (percentage < 75) {
            return 'bg-amber-200 text-amber-950 border-amber-300';
        }
        return 'bg-rose-200 text-rose-950 border-rose-300 font-semibold';
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-zinc-900 text-[11px] font-medium  tracking-widest uppercase">Processing spatial data...</div>
        </div>
    );

    if (!data) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-red-50 text-red-700 px-4 py-2 rounded border border-red-200 text-xs font-medium">Failed to retrieve warehouse metrics.</div>
        </div>
    );

    const allLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const zones = Object.keys(data.zones).sort();

    return (
        <div className="max-w-[1600px] mx-auto px-6 pt-3 pb-6 font-sans bg-[#fcfcfc] min-h-screen text-zinc-900">

            {/* Header / Actions Section */}
            <div className="mb-8 border-b border-zinc-300 pb-4 flex justify-between items-end">
                <div>
                    <h1 className="text-[18px] font-medium  text-zinc-950 tracking-tight">Ocupación de Bodega</h1>
                    <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-medium ">Mapa de Saturación y Densidad de Bins</p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-1.5 border border-zinc-900 text-zinc-900 bg-white text-[10px] font-medium  uppercase tracking-widest rounded hover:bg-zinc-900 hover:text-white transition-all shadow-sm"
                >
                    Actualizar Datos
                </button>
            </div>

            {/* Global Utilization Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
                {[
                    { label: 'Total Bins', val: data.summary.total_bins, color: 'text-zinc-900' },
                    { label: 'Filled Capacity', val: data.summary.filled_bins, color: 'text-zinc-900' },
                    { label: 'Available', val: data.summary.available_bins, color: 'text-zinc-900' },
                    { label: 'Utilization %', val: `${data.summary.occupancy_pct}%`, color: data.summary.occupancy_pct > 85 ? 'text-red-700' : 'text-zinc-900' },
                    { label: 'Active SKUs', val: data.summary.total_items, color: 'text-zinc-900' },
                    { label: 'Density (SKU/Bin)', val: data.summary.avg_items_per_bin, color: 'text-zinc-900' }
                ].map((s, i) => (
                    <div key={i} className="bg-white p-4 border border-zinc-200 shadow-sm">
                        <label className="text-[10px] uppercase text-zinc-600 font-medium  tracking-widest block mb-1">{s.label}</label>
                        <p className={`text-2xl font-medium  font-mono ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Heatmap Matrix Section */}
            <div className="bg-white border border-zinc-300 shadow-sm mb-8 overflow-hidden">
                <div className="px-6 py-3 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center">
                    <h3 className="text-[11px] font-medium  text-zinc-900 uppercase tracking-widest">
                        Matriz de Saturación de Bins (Nivel vs Zona)
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-zinc-950">
                                <th className="px-6 py-3 text-left text-[11px] font-medium text-white uppercase tracking-wider border-b border-zinc-900">Identificador de Zona</th>
                                {allLevels.map(level => (
                                    <th key={level} className="px-2 py-3 text-center text-[12px] font-medium text-white uppercase tracking-wider border-b border-zinc-800">
                                        Nivel {level}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                            {zones.map(zoneName => {
                                const zoneData = data.zones[zoneName];
                                return (
                                    <tr key={zoneName} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium  text-zinc-900 leading-none">{zoneName}</div>
                                            <div className="text-[10px] text-zinc-600 font-medium  mt-1 uppercase tracking-tighter">
                                                {zoneData.total} Bins Total
                                            </div>
                                        </td>
                                        {allLevels.map(level => {
                                            const levelData = zoneData.levels[level] || { total: 0, full_bins: 0, occupied_skus: 0 };
                                            const occupancyPercent = levelData.total > 0
                                                ? Math.round((levelData.full_bins / levelData.total) * 100)
                                                : 0;

                                            const isSelected = selectedCell && selectedCell.zone === zoneName && selectedCell.level === level;

                                            return (
                                                <td key={level} className="px-1 py-2">
                                                    {levelData.total > 0 ? (
                                                        <div 
                                                            onClick={() => handleCellClick(zoneName, level)}
                                                            className={`
                                                                w-full h-16 flex flex-col items-center justify-center rounded-sm border
                                                                ${getHeatmapStyle(occupancyPercent)}
                                                                cursor-pointer hover:border-zinc-400 hover:shadow-sm transition-all duration-200
                                                                ${isSelected ? 'ring-2 ring-zinc-950 border-transparent scale-105 shadow-md z-10' : ''}
                                                            `}
                                                        >
                                                            <span className="text-lg font-mono font-medium  leading-none mb-1">{occupancyPercent}%</span>
                                                            <div className="text-[9px] uppercase tracking-tighter font-medium  opacity-90 text-center">
                                                                {levelData.full_bins}/{levelData.total} Bins
                                                            </div>
                                                            <div className="text-[9px] font-medium  opacity-80">
                                                                {levelData.occupied_skus} SKUs
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-16 flex items-center justify-center text-zinc-200 font-mono text-xs">
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
                <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-emerald-200 border border-emerald-300 rounded-sm"></div>
                        <span className="text-[10px] font-medium text-zinc-700 uppercase tracking-wider">Baja Utilización</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-amber-200 border border-amber-300 rounded-sm"></div>
                        <span className="text-[10px] font-medium text-zinc-700 uppercase tracking-wider">Carga Óptima</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-rose-200 border border-rose-300 rounded-sm"></div>
                        <span className="text-[10px] font-medium text-zinc-700 uppercase tracking-wider">Saturado</span>
                    </div>
                    <div className="ml-auto text-[10px] font-medium text-zinc-500 italic">
                        * Los valores indican bins alcanzando umbrales de capacidad configurados.
                    </div>
                </div>
            </div>

            {/* Bin Details Matrix Section */}
            {selectedCell && (
                <div className="bg-white border border-zinc-300 shadow-md mb-8 overflow-hidden transition-all duration-300">
                    <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center">
                        <div>
                            <h3 className="text-[12px] font-bold text-zinc-950 uppercase tracking-widest">
                                Mapa de Ubicaciones: Zona {selectedCell.zone} — Nivel {selectedCell.level}
                            </h3>
                            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-1">
                                {loadingDetails ? 'Cargando infraestructura...' : `${cellDetails.length} Ubicaciones encontradas`}
                            </p>
                        </div>
                        <button
                            onClick={() => { setSelectedCell(null); setCellDetails([]); }}
                            className="text-zinc-400 hover:text-zinc-950 transition-colors p-1"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="p-6">
                        {loadingDetails ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mb-4"></div>
                                <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Analizando mapa de slots...</span>
                            </div>
                        ) : cellDetails.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500 text-xs font-medium">
                                No se encontraron bins configurados para la Zona {selectedCell.zone} en el Nivel {selectedCell.level}.
                            </div>
                        ) : (
                            <div className="space-y-8">
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
                                            <span className="text-xs font-bold text-zinc-900 uppercase tracking-widest">
                                                Pasillo: {aisle}
                                            </span>
                                            <span className="text-[10px] text-zinc-500 font-medium font-mono">
                                                {bins.length} Bins
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                            {bins.map(bin => {
                                                const occupancyColor = 
                                                    bin.occupancy_pct === 0 ? 'bg-zinc-100 text-zinc-400 border-zinc-200' :
                                                    bin.occupancy_pct < 30 ? 'bg-emerald-200 text-emerald-950 border-emerald-300' :
                                                    bin.occupancy_pct < 75 ? 'bg-amber-200 text-amber-950 border-amber-300' :
                                                    'bg-rose-200 text-rose-950 border-rose-300 font-semibold';

                                                return (
                                                    <div 
                                                        key={bin.bin_code} 
                                                        className={`border p-2.5 rounded-sm flex flex-col justify-between h-20 ${occupancyColor} shadow-sm`}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <span className="text-xs font-bold font-mono tracking-tight">{bin.bin_code}</span>
                                                            <span className={`text-[8px] uppercase font-bold px-1 rounded-sm ${
                                                                bin.spot === 'Hot' 
                                                                    ? 'bg-orange-500 text-white' 
                                                                    : 'bg-blue-500 text-white'
                                                            }`}>
                                                                {bin.spot}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 flex justify-between items-end">
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] uppercase tracking-tighter opacity-80">SKUs</span>
                                                                <span className="text-sm font-bold font-mono leading-none">{bin.skus}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-[10px] font-mono font-bold">{bin.occupancy_pct}%</span>
                                                            </div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* 1. Spatial Distribution */}
                <div className="bg-white p-6 border border-zinc-200 shadow-sm">
                    <h3 className="text-[11px] font-medium  text-zinc-900 uppercase tracking-widest mb-6 border-b border-zinc-100 pb-2">
                        Distribución de Bins por Zona
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(data.analytics.bins_by_zone).map(([zone, count]) => (
                            <div key={zone} className="flex justify-between items-end border-b border-zinc-50 pb-1.5">
                                <div className="flex items-center gap-3">
                                    <span className="text-[11px] font-medium  text-zinc-900">{zone}</span>
                                </div>
                                <span className="font-mono text-sm text-zinc-950 font-medium ">{count} <span className="text-[10px] uppercase ml-0.5 text-zinc-500 font-medium ">Units</span></span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. SKU Volume Distribution */}
                <div className="bg-white p-6 border border-zinc-200 shadow-sm">
                    <h3 className="text-[11px] font-medium  text-zinc-900 uppercase tracking-widest mb-6 border-b border-zinc-100 pb-2">
                        Densidad de SKUs por Zona
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(data.analytics.zones_by_items).map(([zone, count]) => {
                            const maxVal = Object.values(data.analytics.zones_by_items)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={zone}>
                                    <div className="flex justify-between text-[11px] font-medium  text-zinc-900 mb-1.5 uppercase tracking-tighter">
                                        <span>{zone}</span>
                                        <span className="text-zinc-950 font-mono">{count}</span>
                                    </div>
                                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                                        <div className="h-full bg-zinc-900" style={{ width: `${pct}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Operational Risk (Hot Aisles) */}
                <div className="bg-white p-6 border border-zinc-200 shadow-sm">
                    <h3 className="text-[11px] font-medium  text-red-800 uppercase tracking-widest mb-6 border-b border-zinc-100 pb-2">
                        Densidad Crítica (Pasillos Principales)
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(data.analytics.top_aisles).map(([aisle, count], idx) => {
                            const maxVal = Object.values(data.analytics.top_aisles)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={aisle}>
                                    <div className="flex justify-between text-[11px] font-medium  text-zinc-900 mb-1.5 uppercase tracking-tighter">
                                        <span>Pasillo {aisle}</span>
                                        <span className="text-zinc-950 font-mono">{count}</span>
                                    </div>
                                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${idx === 0 ? 'bg-red-600' : 'bg-zinc-800'}`}
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
