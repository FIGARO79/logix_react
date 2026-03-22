import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const OccupancyDashboard = ({ setTitle }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (setTitle) setTitle('Warehouse Utilization Matrix');
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
        if (percentage === 0) return 'bg-slate-50 text-slate-300 border-slate-100';
        if (percentage < 30) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        if (percentage < 75) return 'bg-amber-50 text-amber-700 border-amber-100';
        return 'bg-red-50 text-red-700 border-red-100 font-bold';
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-slate-400 text-[10px] font-bold tracking-widest uppercase">Processing spatial data...</div>
        </div>
    );

    if (!data) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded border border-red-100 text-xs font-medium">Failed to retrieve warehouse metrics.</div>
        </div>
    );

    const allLevels = [0, 1, 2, 3, 4, 5];
    const zones = Object.keys(data.zones).sort();

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6 font-sans bg-[#fcfcfc] min-h-screen text-slate-800">
            
            {/* Header / Actions Section */}
            <div className="mb-8 border-b border-slate-200 pb-4 flex justify-between items-end">
                <div>
                    <h1 className="text-xl font-light text-slate-900 tracking-tight">Warehouse Occupancy Analytics</h1>
                    <p className="text-slate-400 text-[9px] uppercase tracking-widest font-bold">Real-time Bin Saturation & Density Map</p>
                </div>
                <button 
                    onClick={fetchData}
                    className="px-4 py-1.5 border border-slate-300 text-slate-600 bg-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-slate-50 transition-all shadow-sm"
                >
                    Refresh Data
                </button>
            </div>

            {/* Global Utilization Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
                {[
                    { label: 'Total Bins', val: data.summary.total_bins, color: 'text-slate-500' },
                    { label: 'Filled Capacity', val: data.summary.filled_bins, color: 'text-slate-900' },
                    { label: 'Available', val: data.summary.available_bins, color: 'text-slate-400' },
                    { label: 'Utilization %', val: `${data.summary.occupancy_pct}%`, color: data.summary.occupancy_pct > 85 ? 'text-red-600' : 'text-slate-900' },
                    { label: 'Active SKUs', val: data.summary.total_items, color: 'text-slate-500' },
                    { label: 'Density (SKU/Bin)', val: data.summary.avg_items_per_bin, color: 'text-slate-500' }
                ].map((s, i) => (
                    <div key={i} className="bg-white p-4 border border-slate-200 shadow-sm">
                        <label className="text-[9px] uppercase text-slate-400 font-bold tracking-widest block mb-1">{s.label}</label>
                        <p className={`text-xl font-light font-mono ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Heatmap Matrix Section */}
            <div className="bg-white border border-slate-200 shadow-sm mb-8 overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Bin Saturation Matrix (Level vs Zone)
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <th className="px-6 py-3 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">Zone Identifier</th>
                                {allLevels.map(level => (
                                    <th key={level} className="px-2 py-3 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                                        Level {level}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {zones.map(zoneName => {
                                const zoneData = data.zones[zoneName];
                                return (
                                    <tr key={zoneName} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-semibold text-slate-700 leading-none">{zoneName}</div>
                                            <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
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
                                                            h-16 flex flex-col items-center justify-center rounded-sm border
                                                            ${getHeatmapStyle(occupancyPercent)}
                                                            transition-all duration-200
                                                        `}>
                                                            <span className="text-lg font-mono font-light leading-none mb-1">{occupancyPercent}%</span>
                                                            <div className="text-[8px] uppercase tracking-tighter font-bold opacity-60 text-center">
                                                                {levelData.full_bins}/{levelData.total} Bins
                                                            </div>
                                                            <div className="text-[8px] font-medium opacity-50">
                                                                {levelData.occupied_skus} SKUs
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-16 flex items-center justify-center text-slate-200 font-mono text-xs">
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
                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/30 flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-50 border border-emerald-100 rounded-full"></div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Low Utilization</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-amber-50 border border-amber-100 rounded-full"></div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Optimal Load</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-50 border border-red-100 rounded-full"></div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saturated</span>
                    </div>
                    <div className="ml-auto text-[9px] font-medium text-slate-300 italic">
                        * Values indicate bins reaching configured capacity thresholds.
                    </div>
                </div>
            </div>

            {/* Granular Analytics Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* 1. Spatial Distribution */}
                <div className="bg-white p-6 border border-slate-200 shadow-sm">
                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">
                        Bin Distribution by Zone
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(data.analytics.bins_by_zone).map(([zone, count]) => (
                            <div key={zone} className="flex justify-between items-end border-b border-slate-50 pb-1.5">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-semibold text-slate-600">{zone}</span>
                                </div>
                                <span className="font-mono text-xs text-slate-400 font-bold">{count} <span className="text-[9px] uppercase ml-0.5 opacity-50">Units</span></span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. SKU Volume Distribution */}
                <div className="bg-white p-6 border border-slate-200 shadow-sm">
                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">
                        SKU Density by Zone
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(data.analytics.zones_by_items).map(([zone, count]) => {
                            const maxVal = Object.values(data.analytics.zones_by_items)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={zone}>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-tighter">
                                        <span>{zone}</span>
                                        <span className="text-slate-900 font-mono">{count}</span>
                                    </div>
                                    <div className="w-full bg-slate-50 h-0.5 overflow-hidden">
                                        <div className="h-full bg-slate-900 opacity-60" style={{ width: `${pct}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Operational Risk (Hot Aisles) */}
                <div className="bg-white p-6 border border-slate-200 shadow-sm">
                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2 text-red-800">
                        Critical Density (Top Aisles)
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(data.analytics.top_aisles).map(([aisle, count], idx) => {
                            const maxVal = Object.values(data.analytics.top_aisles)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={aisle}>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-tighter">
                                        <span>Aisle {aisle}</span>
                                        <span className="text-slate-400 font-mono">{count}</span>
                                    </div>
                                    <div className="w-full bg-slate-50 h-0.5 overflow-hidden">
                                        <div 
                                            className={`h-full ${idx === 0 ? 'bg-red-600' : 'bg-slate-900 opacity-40'}`} 
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
