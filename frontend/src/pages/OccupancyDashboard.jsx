import React, { useState, useEffect } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import axios from 'axios';
import { toast } from 'react-toastify';

const OccupancyDashboard = () => {
    const { setTitle } = useOutletContext();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

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

    const getHeatmapStyle = (percentage) => {
        if (percentage === 0) return 'bg-slate-50 text-slate-600 border-slate-200';
        if (percentage < 30) return 'bg-emerald-50 text-emerald-900 border-emerald-200';
        if (percentage < 75) return 'bg-amber-50 text-amber-900 border-amber-200';
        return 'bg-red-50 text-red-900 border-red-200 font-bold';
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-zinc-900 text-[11px] font-bold tracking-widest uppercase">Processing spatial data...</div>
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
        <div className="occupancy-dashboard-page max-w-[1600px] mx-auto px-6 pt-3 pb-6 font-sans bg-[#fcfcfc] min-h-screen text-[#323130]">

            {/* Header / Actions Section */}
            <div className="mb-8 border-b border-[#e1dfdd] pb-4 flex justify-between items-end">
                <div>
                    <h1 className="text-[18px] font-normal text-[#201f1e] leading-tight">Ocupación de Bodega</h1>
                    <p className="text-[#605e5c] text-xs font-normal mt-0.5">Mapa de Saturación y Densidad de Bins</p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-[#0078d4] hover:bg-[#106ebe] text-white text-xs font-normal rounded transition-colors shadow-sm"
                >
                    Actualizar Datos
                </button>
            </div>

            {/* Global Utilization Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
                {[
                    { label: 'Total Bins', val: data.summary.total_bins, color: 'text-[#201f1e]' },
                    { label: 'Filled Capacity', val: data.summary.filled_bins, color: 'text-[#201f1e]' },
                    { label: 'Available', val: data.summary.available_bins, color: 'text-[#201f1e]' },
                    { label: 'Utilization %', val: `${data.summary.occupancy_pct}%`, color: data.summary.occupancy_pct > 85 ? 'text-red-700' : 'text-[#201f1e]' },
                    { label: 'Active SKUs', val: data.summary.total_items, color: 'text-[#201f1e]' },
                    { label: 'Density (SKU/Bin)', val: data.summary.avg_items_per_bin, color: 'text-[#201f1e]' }
                ].map((s, i) => (
                    <div key={i} className="bg-white p-4 border border-[#e1dfdd] rounded shadow-sm">
                        <label className="text-xs uppercase text-[#605e5c] font-normal block mb-1">{s.label}</label>
                        <p className={`text-2xl font-normal font-mono ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Heatmap Matrix Section */}
            <div className="bg-white border border-[#e1dfdd] rounded shadow-sm mb-8 overflow-hidden">
                <div className="px-6 py-3 border-b border-[#e1dfdd] bg-[#f9f9f9] flex justify-between items-center">
                    <h3 className="text-xs font-normal text-[#201f1e] uppercase">
                        Matriz de Saturación de Bins (Nivel vs Zona)
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-[#f3f3f3] border-b border-[#e1dfdd]">
                                <th className="px-6 py-3 text-left text-xs font-normal text-[#605e5c] uppercase">Identificador de Zona</th>
                                {allLevels.map(level => (
                                    <th key={level} className="px-2 py-3 text-center text-xs font-normal text-[#605e5c] uppercase">
                                        Nivel {level}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e1dfdd]">
                            {zones.map(zoneName => {
                                const zoneData = data.zones[zoneName];
                                return (
                                    <tr key={zoneName} className="hover:bg-[#f9f9f9] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-normal text-[#0078d4] leading-none">{zoneName}</div>
                                            <div className="text-xs text-[#605e5c] font-normal mt-1">
                                                {zoneData.total} Bins Total
                                            </div>
                                        </td>
                                        {allLevels.map(level => {
                                            const levelData = zoneData.levels[level] || { total: 0, full_bins: 0, occupied_skus: 0 };
                                            const occupancyPercent = levelData.total > 0
                                                ? Math.round((levelData.full_bins / levelData.total) * 100)
                                                : 0;

                                            return (
                                                <td key={level} className="px-1 py-2">
                                                    {levelData.total > 0 ? (
                                                        <div className={`
                                                            w-full h-16 flex flex-col items-center justify-center rounded-sm border
                                                            ${getHeatmapStyle(occupancyPercent)}
                                                            transition-all duration-200
                                                        `}>
                                                            <span className="text-lg font-mono font-bold leading-none mb-1">{occupancyPercent}%</span>
                                                            <div className="text-[9px] uppercase tracking-tighter font-bold opacity-90 text-center">
                                                                {levelData.full_bins}/{levelData.total} Bins
                                                            </div>
                                                            <div className="text-[9px] font-bold opacity-80">
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
                <div className="px-6 py-3 border-t border-[#e1dfdd] bg-[#f9f9f9] flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-emerald-50 border border-emerald-300 rounded-full"></div>
                        <span className="text-xs font-normal text-[#323130] uppercase">Baja Utilización</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-amber-50 border border-amber-300 rounded-full"></div>
                        <span className="text-xs font-normal text-[#323130] uppercase">Carga Óptima</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-red-50 border border-red-300 rounded-full"></div>
                        <span className="text-xs font-normal text-[#323130] uppercase">Saturado</span>
                    </div>
                    <div className="ml-auto text-xs text-[#8a8886] italic">
                        * Los valores indican bins alcanzando umbrales de capacidad configurados.
                    </div>
                </div>
            </div>

            {/* Granular Analytics Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* 1. Spatial Distribution */}
                <div className="bg-white p-6 border border-[#e1dfdd] rounded shadow-sm">
                    <h3 className="text-xs font-normal text-[#201f1e] uppercase mb-6 border-b border-[#e1dfdd] pb-2">
                        Distribución de Bins por Zona
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(data.analytics.bins_by_zone).map(([zone, count]) => (
                            <div key={zone} className="flex justify-between items-end border-b border-[#f3f3f3] pb-1.5">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-normal text-[#201f1e]">{zone}</span>
                                </div>
                                <span className="font-mono text-sm text-[#201f1e] font-normal">{count} <span className="text-xs uppercase ml-0.5 text-[#605e5c]">Units</span></span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. SKU Volume Distribution */}
                <div className="bg-white p-6 border border-[#e1dfdd] rounded shadow-sm">
                    <h3 className="text-xs font-normal text-[#201f1e] uppercase mb-6 border-b border-[#e1dfdd] pb-2">
                        Densidad de SKUs por Zona
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(data.analytics.zones_by_items).map(([zone, count]) => {
                            const maxVal = Object.values(data.analytics.zones_by_items)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={zone}>
                                    <div className="flex justify-between text-xs font-normal text-[#201f1e] mb-1.5">
                                        <span>{zone}</span>
                                        <span className="text-[#201f1e] font-mono">{count}</span>
                                    </div>
                                    <div className="w-full bg-[#f3f3f3] h-1.5 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#0078d4]" style={{ width: `${pct}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Operational Risk (Hot Aisles) */}
                <div className="bg-white p-6 border border-[#e1dfdd] rounded shadow-sm">
                    <h3 className="text-xs font-normal text-[#201f1e] uppercase mb-6 border-b border-[#e1dfdd] pb-2">
                        Densidad Crítica (Pasillos Principales)
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(data.analytics.top_aisles).map(([aisle, count], idx) => {
                            const maxVal = Object.values(data.analytics.top_aisles)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={aisle}>
                                    <div className="flex justify-between text-xs font-normal text-[#201f1e] mb-1.5">
                                        <span>Pasillo {aisle}</span>
                                        <span className="text-[#201f1e] font-mono">{count}</span>
                                    </div>
                                    <div className="w-full bg-[#f3f3f3] h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${idx === 0 ? 'bg-red-600' : 'bg-[#106ebe]'}`}
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
