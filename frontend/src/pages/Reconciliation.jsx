import React, { useEffect, useState, useMemo } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { getDB, cacheData, getCachedData } from '../utils/offlineDb';

const Reconciliation = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Conciliación"); }, [setTitle]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'GRN', direction: 'ascending' });
    const [archiveVersions, setArchiveVersions] = useState([]);
    const [snapshotVersions, setSnapshotVersions] = useState([]);
    const [currentVersion, setCurrentVersion] = useState('');
    const [currentSnapshot, setCurrentSnapshot] = useState('');
    const [isOfflineData, setIsOfflineData] = useState(false);

    // Fetch data
    const fetchData = async (params = {}) => {
        setLoading(true);
        setIsOfflineData(false);

        if (navigator.onLine) {
            const queryParams = new URLSearchParams();
            if (params.archive_date) queryParams.append('archive_date', params.archive_date);
            if (params.snapshot_date) queryParams.append('snapshot_date', params.snapshot_date);

            try {
                const res = await fetch(`/api/views/reconciliation?${queryParams.toString()}`);
                if (res.ok) {
                    const response = await res.json();
                    if (response.data) {
                        setData(response.data);
                        if (!params.archive_date && !params.snapshot_date) {
                            await cacheData('last_reconciliation', response.data);
                        }
                    }
                    if (response.archive_versions) setArchiveVersions(response.archive_versions);
                    if (response.snapshot_versions) setSnapshotVersions(response.snapshot_versions);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.error("Error fetching reconciliation data:", err);
            }
        }

        try {
            const cachedData = await getCachedData('last_reconciliation');
            if (cachedData) {
                setData(cachedData);
                setIsOfflineData(true);
            }
        } catch (e) {
            console.error("Error loading cached reconciliation:", e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleArchiveSnapshot = async () => {
        if (!data || data.length === 0) return alert("No hay datos para archivar");
        if (!confirm("¿Deseas guardar una instantánea (SNAPSHOT) de esta conciliación?")) return;

        try {
            const res = await fetch('/api/views/reconciliation/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: data,
                    client_timestamp: new Date().toISOString()
                })
            });
            if (res.ok) {
                const result = await res.json();
                alert(`Instantánea guardada correctamente: ${result.archive_date}`);
                fetchData();
            } else {
                alert("Error al guardar la instantánea");
            }
        } catch (e) {
            alert("Error de conexión");
        }
    };

    const handleVersionChange = (e) => {
        const val = e.target.value;
        setCurrentVersion(val);
        setCurrentSnapshot('');
        fetchData({ archive_date: val });
    };

    const handleSnapshotChange = (e) => {
        const val = e.target.value;
        setCurrentSnapshot(val);
        setCurrentVersion('');
        fetchData({ snapshot_date: val });
    };

    const formatDateShort = (dateStr) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return dateStr; }
    };

    const sortedData = useMemo(() => {
        let sortableItems = [...data];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aKey = a[sortConfig.key];
                let bKey = b[sortConfig.key];
                if (typeof aKey === 'number' && typeof bKey === 'number') {
                    return sortConfig.direction === 'ascending' ? aKey - bKey : bKey - aKey;
                }
                aKey = aKey ? aKey.toString().toLowerCase() : '';
                bKey = bKey ? bKey.toString().toLowerCase() : '';
                if (aKey < bKey) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aKey > bKey) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [data, sortConfig]);

    const filteredData = useMemo(() => {
        return sortedData.filter(item => {
            if (!filterText) return true;
            return Object.values(item).some(val =>
                String(val).toLowerCase().includes(filterText.toLowerCase())
            );
        });
    }, [sortedData, filterText]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (name) => {
        if (sortConfig.key !== name) return <span className="ml-1 opacity-30">↕</span>;
        return sortConfig.direction === 'ascending' ? <span className="ml-1">↑</span> : <span className="ml-1">↓</span>;
    };

    return (
        <div className="flex flex-col h-full bg-[#fcfcfc] text-black font-sans font-normal">
            <div className="px-4 pt-2 pb-2 border-b border-zinc-100 bg-white/80 backdrop-blur-md sticky top-0 z-30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                    <div className="space-y-0.5">
                        <h1 className="text-lg tracking-tight text-black">Conciliación de Inventario</h1>
                        <div className="flex items-center gap-2">
                            <p className="text-[8px] uppercase tracking-[0.2em] text-black">Auditoría de Diferencias</p>
                            <span className="text-zinc-200"></span>
                            {isOfflineData ? (
                                <span className="text-[8px] text-black uppercase tracking-widest flex items-center gap-1">
                                    Offline
                                </span>
                            ) : (
                                <span className="text-[8px] text-black uppercase tracking-widest flex items-center gap-1">
                                    
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 bg-zinc-50/50 p-2 rounded-xl border border-zinc-100">
                    <div className="flex-1 min-w-[200px]">
                        <div style={{ position: 'relative' }}>
                            {/* Ícono lupa — pointer-events none para no bloquear el input */}
                            <span style={{
                                position: 'absolute',
                                left: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                pointerEvents: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#a1a1aa',
                                zIndex: 2
                            }}>
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                placeholder="BUSCAR REGISTRO..."
                                className="w-full h-9 text-[10px] bg-white border border-zinc-200 rounded-lg outline-none text-black uppercase tracking-wider"
                                style={{ paddingLeft: '32px', paddingRight: filterText ? '30px' : '12px' }}
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                            />
                            {/* Botón X para limpiar — solo visible cuando hay texto */}
                            {filterText && (
                                <button
                                    onClick={() => setFilterText('')}
                                    title="Limpiar búsqueda"
                                    style={{
                                        position: 'absolute',
                                        right: '8px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        background: '#e4e4e7',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '13px',
                                        lineHeight: 1,
                                        color: '#52525b',
                                        padding: 0,
                                        zIndex: 2
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="w-40">
                        <select
                            value={currentVersion}
                            onChange={handleVersionChange}
                            className="w-full h-9 px-2 text-[9px] text-black bg-white border border-zinc-200 rounded-lg outline-none cursor-pointer uppercase"
                        >
                            <option value="">LOGS ACTUALES</option>
                            {archiveVersions.map(v => (
                                <option key={v} value={v}>LOGS: {formatDateShort(v)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="w-40">
                        <select
                            value={currentSnapshot}
                            onChange={handleSnapshotChange}
                            className="w-full h-9 px-2 text-[9px] text-black bg-white border border-zinc-200 rounded-lg outline-none cursor-pointer uppercase"
                        >
                            <option value="">INSTANTÁNEAS</option>
                            {snapshotVersions.map(v => (
                                <option key={v} value={v}>SNAP: {formatDateShort(v)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                        <button
                            onClick={() => {
                                const params = new URLSearchParams();
                                if (currentVersion) params.append('archive_date', currentVersion);
                                if (currentSnapshot) params.append('snapshot_date', currentSnapshot);
                                params.append('timezone_offset', new Date().getTimezoneOffset());
                                window.location.href = `/api/export_reconciliation?${params.toString()}`;
                            }}
                            className="h-9 px-3 text-[9px] text-white rounded-lg shadow-sm flex items-center gap-1.5 uppercase tracking-widest active:scale-95 whitespace-nowrap" style={{ background: '#285f94' }} onMouseEnter={e => e.currentTarget.style.background='#1e4a74'} onMouseLeave={e => e.currentTarget.style.background='#285f94'}
                        >
                            Exportar
                        </button>

                        {!currentSnapshot && (
                            <button
                                onClick={handleArchiveSnapshot}
                                className="h-9 px-3 text-[9px] text-white rounded-lg shadow-sm flex items-center gap-1.5 uppercase tracking-widest active:scale-95 whitespace-nowrap" style={{ background: '#285f94' }} onMouseEnter={e => e.currentTarget.style.background='#1e4a74'} onMouseLeave={e => e.currentTarget.style.background='#285f94'}
                            >
                                Snapshot
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 px-4 py-2 overflow-hidden flex flex-col">
                <div className="bg-white border border-zinc-200 rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col flex-1">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-32 text-black">
                            Cargando...
                        </div>
                    ) : (
                        <>
                            <div className="overflow-auto max-h-[70vh]">
                                <table className="w-full text-left border-separate border-spacing-0">
                                    <thead className="sticky top-0 z-20">
                                        <tr style={{ background: '#354a5f' }}>
                                            {[
                                                { id: 'Import_Reference', label: 'I.R.' },
                                                { id: 'Waybill', label: 'WAYBILL' },
                                                { id: 'GRN', label: 'GRN' },
                                                { id: 'Codigo_Item', label: 'CODIGO ITEM' },
                                                { id: 'Descripcion', label: 'DESCRIPCION' },
                                                { id: 'Ubicacion', label: 'UBICACION' },
                                                { id: 'Reubicado', label: 'REUBICADO' },
                                                { id: 'Cant_Esperada', label: 'CANT ESPERADA' },
                                                { id: 'Cant_Recibida', label: 'CANT RECIBIDA' },
                                                { id: 'Diferencia', label: 'DIFERENCIA' },
                                                { id: 'Timestamp', label: 'FECHA' }
                                            ].map((head) => (
                                                <th
                                                    key={head.id}
                                                    onClick={() => requestSort(head.id)}
                                                    className="px-3 py-2 text-[10px] font-semibold text-white cursor-pointer select-none whitespace-nowrap uppercase tracking-wider"
                                                    style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#2a3c4e'}
                                                    onMouseLeave={e => e.currentTarget.style.background = ''}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        {head.label}
                                                        {getSortIcon(head.id)}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.length > 0 ? (
                                            filteredData.map((row, idx) => (
                                                <tr
                                                    key={idx}
                                                    className="transition-colors"
                                                    style={{ background: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#eef3f8'}
                                                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#f8f9fa'}
                                                >
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-zinc-700" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.Import_Reference}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-zinc-700" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.Waybill}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-zinc-700" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.GRN}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] font-medium" style={{ borderBottom: '1px solid #f0f0f0', color: '#285f94' }}>{row.Codigo_Item}</td>
                                                    <td className="px-3 py-1.5 truncate max-w-[300px] text-[11px] text-zinc-700 uppercase" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.Descripcion}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-zinc-700" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.Ubicacion || '-'}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-zinc-700" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.Reubicado || '-'}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-center text-zinc-700" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.Cant_Esperada}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-center font-bold text-zinc-900" style={{ borderBottom: '1px solid #f0f0f0' }}>{row.Cant_Recibida}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-center text-[11px] font-bold" style={{ borderBottom: '1px solid #f0f0f0', color: row.Diferencia > 0 ? '#285f94' : row.Diferencia < 0 ? '#dc2626' : '#030303ff' }}>
                                                        {row.Diferencia > 0 ? `+${row.Diferencia}` : row.Diferencia}
                                                    </td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-zinc-500" style={{ borderBottom: '1px solid #f0f0f0' }}>
                                                        {formatDateShort(row.Timestamp)}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="11" className="px-4 py-20 text-center text-zinc-400 text-[11px]">No se encontraron registros</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center gap-3 px-4 py-2 border-t border-zinc-100 bg-white text-[10px] text-zinc-500">
                                <span>Mostrando <span className="font-semibold text-zinc-700">{filteredData.length}</span> registros</span>
                                {!isOfflineData && (
                                    <span className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                        Datos en tiempo real
                                    </span>
                                )}
                                {isOfflineData && (
                                    <span className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                                        Datos sin conexión
                                    </span>
                                )}
                            </div>
                        </>
                    )}

                </div>
            </div>
        </div>
    );
};

export default Reconciliation;
