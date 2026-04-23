import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import * as Icons from '../components/Icons';

const SlottingConfig = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
    const [activeTab, setActiveTab] = useState('storage');
    const [config, setConfig] = useState({ turnover: {}, storage: {} });
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [searchTerm, setSearchSpec] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);

    const fetchSummary = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/slotting-summary', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setSummary(data);
            } else {
                setSummary({ total: 0, in_use: 0, free: 0, occupancy_pct: 0, by_zone: {} });
            }
        } catch (err) {
            setSummary({ total: 0, in_use: 0, free: 0, occupancy_pct: 0, by_zone: {} });
        }
    }, []);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/slotting-config', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    throw new Error('No tiene permisos para acceder a esta configuración');
                }
                throw new Error('No se pudo cargar la configuración');
            }
            const data = await res.json();
            setConfig(data);
            fetchSummary();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [fetchSummary]);

    useEffect(() => {
        fetchConfig();
        if (setTitle) setTitle("Config. Slotting");
    }, [fetchConfig, setTitle]);

    const handleSave = async (updatedConfig = config) => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch('/api/admin/slotting-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedConfig),
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Error al guardar en el servidor');
            setSuccess('Configuración actualizada correctamente.');
            setConfig(updatedConfig);
            fetchSummary();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async () => {
        if (!selectedFile) return;
        if (!window.confirm("¿Está seguro de reemplazar TODO el layout actual?")) return;

        setSaving(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const res = await fetch('/api/admin/slotting-upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Error al procesar archivo');
            setSuccess(data.message);
            setShowUpload(false);
            setSelectedFile(null);
            fetchConfig();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const updateBin = (binCode, field, value) => {
        const newConfig = { ...config };
        newConfig.storage[binCode][field] = value;
        setConfig(newConfig);
    };

    const filteredBins = useMemo(() => {
        return Object.entries(config.storage)
            .filter(([code]) => code.toLowerCase().includes(searchTerm.toLowerCase()))
            .slice(0, 150);
    }, [config.storage, searchTerm]);

    const getSpotColor = (spot) => {
        switch (spot?.toLowerCase()) {
            case 'hot': return 'text-[#354a5f] font-black';
            case 'warm': return 'text-[#0070f3] font-bold';
            case 'cold': return 'text-[#6a6d70]';
            default: return 'text-zinc-400';
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 pt-3 pb-6 font-sans bg-[#fcfcfc] min-h-screen text-zinc-800">
            {/* Header Técnico */}
            <div className="flex justify-between items-center mb-6 border-b border-zinc-200 pb-4">
                <div className="flex flex-col gap-0">
                    <h1 className="text-base font-normal tracking-tight">Estrategia de Slotting y Layout</h1>
                    <p className="text-[8px] uppercase tracking-widest font-normal leading-none mt-0.5">Configuración de Almacenamiento y Reglas SIC</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowUpload(!showUpload)}
                        className="bg-white border border-zinc-300 text-black px-4 py-2 rounded hover:bg-zinc-50 transition-colors text-[12px] font-normal shadow-sm flex items-center gap-2"
                    >
                        <Icons.UploadIcon className="w-4 h-4" />
                        Cargar Excel
                    </button>
                    <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="bg-[#285f94] text-white px-4 py-2 rounded hover:bg-[#1e4a74] transition-colors text-[12px] font-normal shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? 'Guardando...' : <><Icons.CheckCircleIcon className="w-4 h-4 text-white/80" /> Publicar Cambios</>}
                    </button>
                </div>
            </div>

            {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-r shadow-sm text-xs font-medium uppercase tracking-tight">{success}</div>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r shadow-sm text-xs font-medium uppercase tracking-tight">{error}</div>}

            {/* Tab Navigation */}
            <div className="flex border-b border-zinc-200 mb-6">
                <button
                    onClick={() => setActiveTab('storage')}
                    className={`px-6 py-3 text-[12px] font-normal border-b-2 transition-colors ${activeTab === 'storage' ? 'border-[#285f94] text-[#285f94]' : 'border-transparent text-black hover:text-black hover:border-zinc-300'}`}
                >
                    Mapa de Ubicaciones
                </button>
                <button
                    onClick={() => setActiveTab('turnover')}
                    className={`px-6 py-3 text-[12px] font-normal border-b-2 transition-colors ${activeTab === 'turnover' ? 'border-[#285f94] text-[#285f94]' : 'border-transparent text-black hover:text-black hover:border-zinc-300'}`}
                >
                    Estrategia SIC
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 space-y-6">
                    {showUpload && (
                        <div className="bg-blue-50/50 border-l-4 border-[#285f94] rounded p-6 shadow-sm animate-fadeIn">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                    <Icons.UploadIcon className="w-4 h-4 text-[#285f94]" />
                                    Carga Masiva de Layout
                                </h2>
                                <button
                                    onClick={() => window.location.href = '/api/admin/slotting-template'}
                                    className="text-[10px] font-bold text-[#285f94] hover:underline uppercase tracking-widest flex items-center gap-1"
                                >
                                    <Icons.DownloadIcon className="w-3 h-3" />
                                    Descargar Layout Actual
                                </button>
                            </div>
                            <div
                                className="border-2 border-dashed border-zinc-200 rounded-lg p-8 text-center cursor-pointer hover:bg-white transition-colors"
                                onClick={() => fileInputRef.current.click()}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files?.length > 0) setSelectedFile(e.dataTransfer.files[0]); }}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={e => setSelectedFile(e.target.files[0])} />
                                <p className="text-[11px] text-black font-bold uppercase tracking-widest">{selectedFile ? `Seleccionado: ${selectedFile.name}` : 'Arrastre su archivo Excel o haga clic aquí'}</p>
                            </div>
                            <div className="mt-4 flex justify-end gap-3">
                                <button onClick={() => { setShowUpload(false); setSelectedFile(null); }} className="text-[12px] font-normal text-black px-4 py-2 uppercase tracking-widest">Cancelar</button>
                                <button onClick={handleFileUpload} disabled={!selectedFile || saving} className="bg-[#285f94] text-white px-6 py-2 rounded text-[12px] font-normal uppercase tracking-widest hover:bg-[#1e4a74] transition-colors disabled:bg-zinc-100 disabled:text-black shadow-sm">Subir y Reemplazar</button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white shadow-sm rounded border border-zinc-200 overflow-hidden h-[calc(100vh-240px)] flex flex-col">
                        <div className="bg-[#f2f2f2] px-4 py-1.5 border-b border-zinc-200 flex flex-row justify-between items-center gap-4">
                            <div className="flex-1 max-w-[180px]">
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className="h-6 w-full p-0 px-2 text-[10px] placeholder:text-[10px] font-normal border border-zinc-300 rounded focus:ring-1 focus:ring-[#285f94] outline-none transition-all uppercase"
                                    value={searchTerm}
                                    onChange={e => setSearchSpec(e.target.value)}
                                />
                            </div>
                            <div className="whitespace-nowrap shrink-0">
                                <span className="text-[10px] text-black font-normal uppercase tracking-tight">{filteredBins.length} registros</span>
                            </div>
                        </div>
                        <div className="overflow-auto flex-1 custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#354a5f] sticky top-0 z-10 shadow-sm text-white">
                                    {activeTab === 'storage' ? (
                                        <tr>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider">BIN</th>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider">ZONA</th>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-center w-20">PASILLO</th>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-center w-20">NIVEL</th>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-center">SPOT</th>
                                        </tr>
                                    ) : (
                                        <tr>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider">SIC</th>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider">RANGO</th>
                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-center">ESTRATEGIA</th>
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="divide-y divide-black">
                                    {loading ? (
                                        <tr><td colSpan="5" className="p-8 text-center text-black text-[11px] font-bold uppercase italic tracking-widest">Sincronizando...</td></tr>
                                    ) : activeTab === 'storage' ? (
                                        filteredBins.map(([code, info]) => (
                                            <tr key={code} className="hover:bg-[#f5f5f5] transition-colors leading-none">
                                                <td className="px-4 py-2 font-mono text-[11px] font-bold text-[#285f94] uppercase tracking-tight">{code}</td>
                                                <td className="px-4 py-2">
                                                    <select value={info.zone} onChange={e => updateBin(code, 'zone', e.target.value)} className="bg-transparent border-none text-[11px] font-bold uppercase focus:ring-0 p-0 h-6 w-full cursor-pointer tracking-tight">
                                                        <option value="Rack">Rack</option>
                                                        <option value="Minuteria">Minutería</option>
                                                        <option value="Cantilever">Cantilever</option>
                                                        <option value="Floor">Piso / Isla</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2 text-center w-20">
                                                    <input type="text" value={info.aisle} onChange={e => updateBin(code, 'aisle', e.target.value)} className="bg-white border border-zinc-300 rounded w-10 text-[11px] font-bold text-center h-6 p-0 font-mono" />
                                                </td>
                                                <td className="px-4 py-2 text-center w-20">
                                                    <input type="text" value={info.level} onChange={e => updateBin(code, 'level', e.target.value)} className="bg-white border border-zinc-300 rounded w-10 text-[11px] font-bold text-center h-6 p-0 font-mono" />
                                                </td>
                                                <td className="px-4 py-2 text-center leading-none">
                                                    <select value={info.spot} onChange={e => updateBin(code, 'spot', e.target.value)} className={`text-[10px] font-bold bg-transparent border-none outline-none cursor-pointer uppercase tracking-tighter p-0 h-6 text-center w-full ${getSpotColor(info.spot)}`}>
                                                        <option value="Hot" className="text-black">Hot</option>
                                                        <option value="Warm" className="text-black">Warm</option>
                                                        <option value="Cold" className="text-black">Cold</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        Object.entries(config.turnover)
                                            .sort((a, b) => {
                                                const order = ['W', 'X', 'Y', 'K', 'L', 'Z', '0'];
                                                let idxA = order.indexOf(a[0]);
                                                let idxB = order.indexOf(b[0]);
                                                if (idxA === -1) idxA = 99;
                                                if (idxB === -1) idxB = 99;
                                                return idxA - idxB;
                                            })
                                            .map(([sic, info]) => (
                                                <tr key={sic} className="hover:bg-[#f5f5f5] transition-colors leading-none">
                                                    <td className="px-4 py-2 font-bold text-black text-[11px] uppercase">{sic}</td>
                                                    <td className="px-4 py-2 text-black font-bold text-[10px] uppercase tracking-tight">{info.range}</td>
                                                    <td className="px-4 py-2 text-center">
                                                        <select value={info.spot} onChange={e => { const n = { ...config }; n.turnover[sic].spot = e.target.value; setConfig(n); }} className={`text-[10px] font-bold bg-transparent border-none outline-none cursor-pointer uppercase tracking-tighter p-0 h-6 text-center w-24 ${getSpotColor(info.spot)}`}>
                                                            <option value="hot" className="text-black">Hot</option>
                                                            <option value="warm" className="text-black">Warm</option>
                                                            <option value="cold" className="text-black">Cold</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="mt-2 text-[10px] text-black font-normal uppercase tracking-[0.2em] text-center italic">
                        {activeTab === 'storage' ? `Mostrando registros del layout maestro` : 'Estrategia de asignación según frecuencia de rotación'}
                    </div>
                </div>

                {/* Right Panel: Summary Dashboard */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded shadow-sm border border-black sticky top-20 overflow-y-auto h-[calc(100vh-240px)] custom-scrollbar">
                        <h2 className="text-lg font-normal text-black mb-4 border-b pb-2">Estado del Almacén</h2>
                        {!summary ? (
                            <div className="flex justify-center py-8 text-black text-xs italic">Calculando estadísticas...</div>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xs font-normal text-black uppercase tracking-widest mb-3 tracking-tighter">Capacidad Física</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-sm border-b border-black pb-1">
                                            <span className="text-black uppercase text-[10px] font-normal">Total Bins</span>
                                            <span className="font-mono font-medium text-black text-right min-w-[60px]">{summary.total}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-black pb-1">
                                            <span className="text-black uppercase text-[10px] font-normal">Bins en Uso</span>
                                            <span className="font-mono font-medium text-[#285f94] text-right min-w-[60px]">{summary.in_use}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-black uppercase text-[10px] font-normal">Disponibles</span>
                                            <span className="font-mono font-medium text-emerald-600 text-right min-w-[60px]">{summary.free}</span>
                                        </div>
                                        <div className="pt-2">
                                            <div className="flex justify-between text-[10px] font-normal text-black mb-1 uppercase tracking-tight">
                                                <span>Índice de Ocupación</span>
                                                <span className={summary.occupancy_pct > 90 ? 'text-red-600 font-black' : 'text-[#285f94]'}>{summary.occupancy_pct}%</span>
                                            </div>
                                            <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden shadow-inner">
                                                <div className={`h-full transition-all duration-1000 ${summary.occupancy_pct > 90 ? 'bg-red-500' : 'bg-[#285f94]'}`} style={{ width: `${summary.occupancy_pct}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-normal text-black uppercase tracking-widest mb-3 border-t border-black pt-4">Zonas de Inventario</h3>
                                    <div className="space-y-2">
                                        {Object.entries(summary.by_zone || {}).sort((a, b) => b[1] - a[1]).map(([zone, count]) => (
                                            <div key={zone} className="flex justify-between items-center text-[11px] group py-0.5 border-b border-transparent hover:border-black">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-black group-hover:bg-[#285f94] transition-colors"></span>
                                                    <span className="text-black group-hover:text-black transition-colors uppercase font-normal text-[9px]">{zone}</span>
                                                </div>
                                                <span className="font-mono font-medium text-black">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-normal text-black uppercase tracking-widest mb-3 border-t border-black pt-4">Saturación</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-[11px] border-b border-black pb-1">
                                            <span className="text-black uppercase font-normal text-[9px]">Ítems Activos</span>
                                            <span className="font-mono font-medium text-black">{summary.total_items_in_bins ?? '—'}</span>
                                        </div>
                                        <div className="pt-1">
                                            <div className="flex justify-between text-[9px] font-normal text-black mb-1 uppercase">
                                                <span>Promedio ítems / bin</span>
                                                <span className={(summary.avg_items_per_bin ?? 0) > 5 ? 'text-red-600' : 'text-[#285f94]'}>{summary.avg_items_per_bin ?? '—'}</span>
                                            </div>
                                            <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
                                                <div className="h-full bg-[#285f94]" style={{ width: `${Math.min(((summary.avg_items_per_bin ?? 0) / 8) * 100, 100)}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {summary.zones_by_items && Object.keys(summary.zones_by_items).length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-normal text-black uppercase tracking-widest mb-3 border-t border-zinc-50 pt-4">Zonas Saturadas</h3>
                                        <div className="space-y-2">
                                            {Object.entries(summary.zones_by_items).slice(0, 5).map(([zone, count]) => (
                                                <div key={zone}>
                                                    <div className="flex justify-between text-[9px] font-normal text-black mb-1 uppercase">
                                                        <span>{zone}</span>
                                                        <span className="text-[#285f94] font-mono">{count} SKUs</span>
                                                    </div>
                                                    <div className="w-full bg-zinc-50 h-1 rounded-full overflow-hidden">
                                                        <div className="h-full bg-zinc-300" style={{ width: `${Math.min((count / 100) * 100, 100)}%` }}></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {summary.top_aisles && Object.keys(summary.top_aisles).length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-normal text-black uppercase tracking-widest mb-3 border-t border-zinc-50 pt-4">Top Pasillos</h3>
                                        <div className="space-y-2">
                                            {Object.entries(summary.top_aisles).slice(0, 5).map(([aisle, count]) => (
                                                <div key={aisle} className="flex justify-between items-center text-[11px]">
                                                    <span className="text-black uppercase font-normal text-[9px]">Pasillo {aisle}</span>
                                                    <span className="font-mono font-medium text-[#285f94]">{count} SKUs</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SlottingConfig;
