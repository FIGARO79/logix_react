import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const OccupancyDashboard = ({ setTitle }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (setTitle) setTitle('Mapa de Calor - Ocupación');
        fetchData();
    }, [setTitle]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/views/occupancy_stats');
            setData(response.data);
        } catch (error) {
            console.error('Error fetching occupancy stats:', error);
            toast.error('Error al cargar las estadísticas de ocupación');
        } finally {
            setLoading(false);
        }
    };

    const getHeatmapColor = (percentage) => {
        if (percentage === 0) return 'bg-gray-100 text-gray-400';
        if (percentage < 30) return 'bg-green-100 text-green-800 border-green-200';
        if (percentage < 70) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        return 'bg-red-100 text-red-800 border-red-200 font-bold';
    };

    if (loading) return <div className="p-8 text-center text-xs">Cargando análisis de ocupación...</div>;
    if (!data) return <div className="p-8 text-center text-red-500 text-xs">No se pudieron cargar los datos.</div>;

    const allLevels = [0, 1, 2, 3, 4, 5];
    const zones = Object.keys(data.zones).sort();

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-bold text-gray-800">
                        Dashboard de Ocupación Visual
                    </h1>
                    <p className="text-gray-500 text-[11px]">Mapa de calor del almacén y analítica de saturación</p>
                </div>
                <button 
                    onClick={fetchData}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors shadow-sm text-[11px] font-medium flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                    Actualizar
                </button>
            </header>

            {/* Resumen Superior Expandido */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight mb-0.5">Total Bins</p>
                    <p className="text-base font-bold text-gray-700">{data.summary.total_bins}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight mb-0.5">En Uso</p>
                    <p className="text-base font-bold text-blue-600">{data.summary.filled_bins}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight mb-0.5">Disponibles</p>
                    <p className="text-base font-bold text-emerald-600">{data.summary.available_bins}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight mb-0.5">Ocupación %</p>
                    <p className={`text-base font-bold ${data.summary.occupancy_pct > 85 ? 'text-red-600' : 'text-blue-600'}`}>
                        {data.summary.occupancy_pct}%
                    </p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight mb-0.5">Total Ítems</p>
                    <p className="text-base font-bold text-gray-700">{data.summary.total_items}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight mb-0.5">Ítems / Bin</p>
                    <p className="text-base font-bold text-gray-700">{data.summary.avg_items_per_bin}</p>
                </div>
            </div>

            {/* Mapa de Calor */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <h2 className="font-bold text-gray-600 uppercase text-[10px] tracking-widest">
                        Saturación por Niveles
                    </h2>
                    <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold uppercase">Tiempo Real</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="p-3 text-left text-[10px] font-bold text-gray-400 uppercase border-b border-gray-200">Zona / Pasillo</th>
                                {allLevels.map(level => (
                                    <th key={level} className="p-3 text-center text-[10px] font-bold text-gray-400 uppercase border-b border-gray-200">
                                        Nivel {level}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {zones.map(zoneName => {
                                const zoneData = data.zones[zoneName];
                                return (
                                    <tr key={zoneName} className="hover:bg-gray-50/30 transition-colors">
                                        <td className="p-3 border-b border-gray-100 font-bold text-gray-600 text-xs">
                                            {zoneName}
                                            <div className="text-[9px] text-gray-400 font-normal">
                                                {zoneData.total} bins
                                            </div>
                                        </td>
                                        {allLevels.map(level => {
                                            const levelData = zoneData.levels[level] || { total: 0, full_bins: 0, occupied_skus: 0 };
                                            const occupancyPercent = levelData.total > 0 
                                                ? Math.round((levelData.full_bins / levelData.total) * 100) 
                                                : 0;
                                            
                                            return (
                                                <td key={level} className="p-1.5 border-b border-gray-100">
                                                    {levelData.total > 0 ? (
                                                        <div className={`
                                                            h-14 flex flex-col items-center justify-center rounded border
                                                            ${getHeatmapColor(occupancyPercent)}
                                                            transition-all duration-300 shadow-sm
                                                        `}>
                                                            <span className="text-base leading-none mb-0.5 font-bold">{occupancyPercent}%</span>
                                                            <div className="text-[8px] uppercase tracking-tighter opacity-80 text-center font-bold">
                                                                {levelData.full_bins}/{levelData.total} Llenos
                                                            </div>
                                                            <div className="text-[8px] opacity-70">
                                                                {levelData.occupied_skus} SKUs
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-14 flex items-center justify-center text-gray-300 text-[9px]">
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
                
                <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-200 flex flex-wrap gap-4 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-green-100 border border-green-200 rounded-sm"></div> Bajo
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-yellow-100 border border-yellow-200 rounded-sm"></div> Medio
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-red-100 border border-red-200 rounded-sm"></div> Saturado
                    </div>
                    <div className="ml-auto italic normal-case font-medium text-gray-400 text-right">
                        * % basado en bins que alcanzaron su capacidad máxima de SKUs.
                    </div>
                </div>
            </div>

            {/* Analítica Detallada (Copiada y adaptada de SlottingConfig) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Distribución Física (Bins por Zona) */}
                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-5 border-b pb-2">
                        Distribución por Zona (Bins)
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(data.analytics.bins_by_zone).map(([zone, count]) => (
                            <div key={zone} className="flex justify-between items-center text-[11px]">
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                    <span className="text-gray-600 font-medium">{zone}</span>
                                </div>
                                <span className="font-mono text-gray-500 font-bold">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Zonas más saturadas (Ítems por Zona) */}
                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-5 border-b pb-2">
                        Volumen de Ítems por Zona
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(data.analytics.zones_by_items).map(([zone, count]) => {
                            const maxVal = Object.values(data.analytics.zones_by_items)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={zone}>
                                    <div className="flex justify-between text-[10px] font-bold text-gray-600 mb-1">
                                        <span>{zone}</span>
                                        <span className="text-blue-600">{count}</span>
                                    </div>
                                    <div className="w-full bg-gray-50 rounded-full h-1 overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Top Pasillos */}
                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-5 border-b pb-2">
                        Pasillos con más SKUs
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(data.analytics.top_aisles).map(([aisle, count], idx) => {
                            const maxVal = Object.values(data.analytics.top_aisles)[0] || 1;
                            const pct = Math.round((count / maxVal) * 100);
                            return (
                                <div key={aisle}>
                                    <div className="flex justify-between text-[10px] font-bold text-gray-600 mb-1">
                                        <span>Pasillo {aisle}</span>
                                        <span className="text-gray-400">{count}</span>
                                    </div>
                                    <div className="w-full bg-gray-50 rounded-full h-1 overflow-hidden">
                                        <div 
                                            className={`h-full ${idx === 0 ? 'bg-red-400' : idx === 1 ? 'bg-amber-400' : 'bg-blue-400'}`} 
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
