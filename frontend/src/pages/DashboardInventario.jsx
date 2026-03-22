import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const DashboardInventario = () => {
    const { setTitle } = useOutletContext();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setTitle("Inventory Intelligence Dashboard");
        fetchStats();
    }, [setTitle]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/counts/dashboard_stats', { credentials: 'include' });
            if (!res.ok) throw new Error("Error loading inventory statistics");
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
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
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-slate-400 text-[10px] font-bold tracking-widest uppercase">Analyzing master data...</div>
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded border border-red-100 text-xs font-medium">{error}</div>
        </div>
    );

    if (stats?.empty) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-slate-400 text-xs uppercase tracking-widest">No data available. Initiate cycle counts.</div>
        </div>
    );

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 font-sans bg-[#fcfcfc] min-h-screen text-slate-800">
            
            {/* Header Section Compact */}
            <div className="mb-6 border-b border-slate-200 pb-4 flex justify-between items-end">
                <div>
                    <h1 className="text-xl font-light text-slate-900 tracking-tight">Inventory Accuracy Metrics</h1>
                    <p className="text-slate-400 text-[9px] uppercase tracking-widest font-bold">Operational Performance Insight</p>
                </div>
                <div className="text-right">
                    <span className="text-slate-400 text-[9px] uppercase font-bold tracking-widest block">Audit Sample</span>
                    <span className="text-xl font-light text-slate-700">{stats.total_items} <span className="text-[10px] text-slate-400 ml-0.5">Items</span></span>
                </div>
            </div>

            {/* ERI Section Compact */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 border border-slate-200 shadow-sm">
                    <label className="text-[9px] uppercase text-slate-400 font-bold tracking-widest block mb-2">ERI Global</label>
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-3xl font-light text-slate-900">{stats.eri.Global}</span>
                        <span className="text-sm text-slate-300">%</span>
                    </div>
                    <div className="mt-2 h-0.5 w-full bg-slate-100">
                        <div className="bg-slate-900 h-full" style={{width: `${stats.eri.Global}%`}}></div>
                    </div>
                </div>
                {['A', 'B', 'C'].map(clase => (
                    <div key={clase} className="bg-white p-4 border border-slate-200 shadow-sm">
                        <label className="text-[9px] uppercase text-slate-400 font-bold tracking-widest block mb-2">Class {clase} Accuracy</label>
                        <div className="flex items-baseline gap-0.5">
                            <span className="text-2xl font-light text-slate-800">{stats.eri[clase]}</span>
                            <span className="text-xs text-slate-300">%</span>
                        </div>
                        <div className="mt-2 h-0.5 w-full bg-slate-100">
                            <div className={`h-full ${clase === 'A' ? 'bg-slate-700' : clase === 'B' ? 'bg-slate-500' : 'bg-slate-300'}`} 
                                 style={{width: `${stats.eri[clase]}%`}}></div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Financial Impact & Pareto Compact */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                
                {/* Adjustments Column Compact */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 border border-slate-200 shadow-sm h-full">
                        <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">
                            Financial Impact
                        </h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="text-[9px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Net Reconciliation</label>
                                <div className={`text-2xl font-light ${stats.adjustments.value.net >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                    {formatMoney(stats.adjustments.value.net)}
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium">
                                    {stats.adjustments.units.net > 0 ? '+' : ''}{stats.adjustments.units.net} Units Net
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Gross Variance</label>
                                <div className="text-2xl font-light text-slate-900">
                                    {formatMoney(stats.adjustments.value.gross)}
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium">
                                    {stats.adjustments.units.gross} Total Units
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-50">
                                <p className="text-[9px] text-slate-300 leading-tight uppercase font-medium">
                                    * Absolute sum of discrepancies.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Discrepancies Table Compact */}
                <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            Top 10 Value Variance
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50">
                                <tr>
                                    <th className="px-6 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Item</th>
                                    <th className="px-6 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Qty Diff</th>
                                    <th className="px-6 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Abs Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stats.top_losses.map((item, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-1.5">
                                            <div className="text-xs font-semibold text-slate-700">{item.code}</div>
                                            <div className="text-[9px] text-slate-400 truncate max-w-[200px]">{item.desc}</div>
                                        </td>
                                        <td className={`px-6 py-1.5 text-center font-mono text-[11px] ${item.diff > 0 ? 'text-slate-600' : 'text-red-500'}`}>
                                            {item.diff > 0 ? '+' : ''}{item.diff}
                                        </td>
                                        <td className="px-6 py-1.5 text-right font-mono text-[11px] text-slate-900 font-medium">
                                            {formatMoney(item.abs_val_diff)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Performance & Hot Zones Compact */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* User Performance Compact */}
                <div className="bg-white p-6 border border-slate-200 shadow-sm">
                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">
                        Personnel Audit Quality
                    </h3>
                    <div className="space-y-6">
                        {stats.productivity.map((u, i) => (
                            <div key={i}>
                                <div className="flex justify-between items-end mb-1.5">
                                    <div>
                                        <span className="text-xs font-semibold text-slate-700 block leading-tight">{u.user}</span>
                                        <span className="text-[9px] text-slate-400 uppercase font-bold">{u.items} Audits</span>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-xs font-mono font-bold ${u.error_rate > 10 ? 'text-red-500' : 'text-slate-900'}`}>{u.error_rate}% <span className="text-[9px] text-slate-300 ml-0.5">Error</span></span>
                                    </div>
                                </div>
                                <div className="w-full bg-slate-100 h-0.5">
                                    <div className="bg-slate-900 h-full opacity-60" style={{width: `${(u.items / stats.total_items) * 100}%`}}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Location Risk Zones Compact */}
                <div className="bg-white p-6 border border-slate-200 shadow-sm">
                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">
                        Variance Density by Zone
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {stats.zones.map((z, i) => (
                            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                                <div className="flex items-center gap-4">
                                    <div className="text-lg font-light text-slate-300 w-6">
                                        {z.zone}
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">Zone {z.zone}</p>
                                        <p className="text-[10px] text-slate-400">{z.total} Samples</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-lg font-mono font-bold ${z.error_rate > 15 ? 'text-red-600' : 'text-slate-800'}`}>{z.error_rate}%</p>
                                    <p className="text-[8px] uppercase text-slate-300 font-bold tracking-tighter">Density</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default DashboardInventario;
