import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getDB } from '../utils/offlineDb';

const InboundHistory = () => {
    const { setTitle } = useOutletContext();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [versions, setVersions] = useState([]);
    const [currentVersion, setCurrentVersion] = useState('');

    const normalizeDate = (dateString) => {
        if (!dateString) return null;
        let normalized = dateString.trim().replace(' ', 'T');
        if (normalized.length === 10 && normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return `${normalized}T00:00:00`;
        }
        const hasTimeZone = normalized.includes('Z') || normalized.match(/[+-]\d{2}:\d{2}$/);
        if (!hasTimeZone) normalized = `${normalized}Z`;
        return normalized;
    };

    const formatDate = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return '-';
        const date = new Date(normalized);
        if (isNaN(date.getTime())) return 'Fecha Inválida';
        return date.toLocaleString('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    };

    useEffect(() => {
        setTitle("Historial de Inbound");
        loadVersions();
    }, [setTitle]);

    const loadVersions = async () => {
        try {
            const res = await fetch('/api/logs/versions', { credentials: 'include' });
            if (res.ok) setVersions(await res.json());
        } catch (e) { console.error("Error loading versions", e); }
    };

    const loadLogs = async (version = '') => {
        setLoading(true);
        setCurrentVersion(version);
        try {
            const url = version ? `/api/get_logs?version_date=${version}` : `/api/get_logs`;
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) throw new Error("Error loading logs");
            const data = await res.json();

            // Ordenar por fecha (más reciente primero)
            const sortedData = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Obtener datos del reporte 280 desde IndexedDB (Cache local)
            const grnMap = {};
            try {
                const db = await getDB();
                const uniqueItems = [...new Set(sortedData.map(l => l.itemCode))];
                for (const itemCode of uniqueItems) {
                    const grnInfo = await db.get('grn_pending', itemCode);
                    grnMap[itemCode] = grnInfo ? grnInfo.total_expected : 0;
                }
            } catch (e) { console.error("Offline GRN error", e); }

            // Calcular totales por ítem y marcar última entrada para mostrar diferencia
            const totalsMap = {};
            const latestEntryMap = {};

            sortedData.forEach(log => {
                const code = log.itemCode;
                totalsMap[code] = (totalsMap[code] || 0) + (parseInt(log.qtyReceived) || 0);
                if (!latestEntryMap[code]) latestEntryMap[code] = log.id;
            });

            const enrichedLogs = sortedData.map(log => {
                const expected = grnMap[log.itemCode] || parseInt(log.qtyGrn) || 0;
                const totalReceived = totalsMap[log.itemCode] || 0;
                const isLatest = latestEntryMap[log.itemCode] === log.id;

                return {
                    ...log,
                    expected_qty: expected,
                    difference: isLatest ? (totalReceived - expected) : 0
                };
            });

            setLogs(enrichedLogs);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadLogs(); }, []);

    const filteredLogs = logs.filter(log =>
        (log.itemCode && log.itemCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.waybill && log.waybill.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.importReference && log.importReference.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="w-full px-4 py-6">
            {/* Header con Buscador y Selector de Versiones */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-white p-4 rounded shadow-sm border border-gray-200">
                <h1 className="text-lg font-semibold text-gray-800">Registros de Entrada (Inbound)</h1>
                <div className="flex gap-2 items-center">
                    <input
                        type="text" placeholder="Buscar..."
                        className="h-8 px-2 text-xs border border-gray-300 rounded-md w-full sm:w-64"
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <select 
                        onChange={(e) => loadLogs(e.target.value)}
                        className="h-8 px-3 text-xs bg-white border border-gray-300 rounded outline-none focus:border-[var(--sap-primary)] w-full sm:w-40"
                    >
                        <option value="">-- Actual --</option>
                        {versions.map(v => <option key={v} value={v}>{formatDate(v)}</option>)}
                    </select>
                    <button
                        onClick={() => window.location.href = currentVersion ? `/api/export_log?version_date=${currentVersion}` : '/api/export_log'}
                        className="h-8 px-4 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 flex items-center gap-1.5 transition-all"
                    >
                        Exportar
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded text-sm">{error}</div>}

            {/* Tabla de Historial Enriquecida */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto max-h-[70vh]">
                    <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-700 text-white sticky top-0 z-10">
                            <tr>
                                <th className="px-2 py-1.5 text-left">TIMESTAMP</th>
                                <th className="px-2 py-1.5 text-left">USUARIO</th>
                                <th className="px-2 py-1.5 text-left">I.R.</th>
                                <th className="px-2 py-1.5 text-left">WAYBILL</th>
                                <th className="px-2 py-1.5 text-left">ITEM CODE</th>
                                <th className="px-2 py-1.5 text-left">UBICACIÓN</th>
                                <th className="px-2 py-1.5 text-left">REUBICACIÓN</th>
                                <th className="px-2 py-1.5 text-center">CANT.</th>
                                <th className="px-2 py-1.5 text-center">ESP.</th>
                                <th className="px-2 py-1.5 text-center">DIF.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading && <tr><td colSpan="10" className="py-4 text-center">Cargando...</td></tr>}
                            {!loading && filteredLogs.length === 0 && <tr><td colSpan="10" className="py-4 text-center">No se encontraron registros.</td></tr>}
                            {filteredLogs.map((log, idx) => (
                                <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                                    <td className="px-2 py-1.5 uppercase">{log.username}</td>
                                    <td className="px-2 py-1.5">{log.importReference}</td>
                                    <td className="px-2 py-1.5">{log.waybill}</td>
                                    <td className="px-2 py-1.5 font-mono text-[#285f94]">{log.itemCode}</td>
                                    <td className="px-2 py-1.5 font-mono">{log.binLocation}</td>
                                    <td className="px-2 py-1.5 font-mono">{log.relocatedBin}</td>
                                    <td className="px-2 py-1.5 text-center font-mono">{log.qtyReceived}</td>
                                    <td className="px-2 py-1.5 text-center text-gray-500 font-mono">{log.expected_qty}</td>
                                    <td className={`px-2 py-1.5 text-center font-mono font-semibold ${(log.difference || 0) > 0 ? 'text-blue-600' : (log.difference || 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                        {log.difference || 0}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InboundHistory;
