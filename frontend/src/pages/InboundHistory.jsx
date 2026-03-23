import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const InboundHistory = () => {
    const { setTitle } = useOutletContext();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const normalizeDate = (dateString) => {
        if (!dateString) return null;
        let normalized = dateString.trim().replace(' ', 'T');

        if (normalized.length === 10 && normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return `${normalized}T00:00:00`;
        }

        const hasTimeZone = normalized.includes('Z') ||
            normalized.match(/[+-]\d{2}:\d{2}$/) ||
            (normalized.includes('-') && normalized.split('T')[1]?.includes('-'));
        if (!hasTimeZone) normalized = `${normalized}Z`;
        return normalized;
    };

    const formatDate = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return '-';
        const date = new Date(normalized);
        if (isNaN(date.getTime())) return 'Fecha Inválida';
        return date.toLocaleString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    useEffect(() => {
        setTitle("Historial de Inbound");
    }, []);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/get_logs');
                if (!res.ok) throw new Error("Error loading logs");
                const data = await res.json();
                setLogs(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    const filteredLogs = logs.filter(log =>
        (log.itemCode && log.itemCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.waybill && log.waybill.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.importReference && log.importReference.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-white p-4 rounded shadow-sm border border-gray-200">
                <h1 className="text-lg font-semibold text-gray-800 mb-4 md:mb-0">Registros de Entrada (Inbound)</h1>
                <div className="flex gap-2 items-center">
                    <div className="relative w-full sm:w-72 flex-shrink-0">
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="h-8 px-2 pr-7 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] focus:outline-none w-full transition-all duration-150"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                                title="Borrar búsqueda"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                                </svg>
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => window.location.href = '/api/export_log'}
                        className="h-8 px-4 text-xs font-medium bg-emerald-600 text-white border border-emerald-700 rounded-md shadow-sm hover:bg-emerald-700 transition-all duration-150 flex items-center justify-center gap-1.5"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.914 2.914a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
                        Exportar
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded text-sm">{error}</div>}

            {/* Table */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto max-h-[70vh]">
                    <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-700 text-white sticky top-0 z-10">
                            <tr>
                                <th className="px-2 py-1.5 text-left font-medium">ID</th>
                                <th className="px-2 py-1.5 text-left font-medium">TIMESTAMP</th>
                                <th className="px-2 py-1.5 text-left font-medium">USUARIO</th>
                                <th className="px-2 py-1.5 text-left font-medium">I.R.</th>
                                <th className="px-2 py-1.5 text-left font-medium">WAYBILL</th>
                                <th className="px-2 py-1.5 text-left font-medium">ITEM CODE</th>
                                <th className="px-2 py-1.5 text-left font-medium">DESCRIPCIÓN</th>
                                <th className="px-2 py-1.5 text-left font-medium">UBICACIÓN</th>
                                <th className="px-2 py-1.5 text-left font-medium">REUBICACIÓN</th>
                                <th className="px-2 py-1.5 text-center font-medium">CANT. RECIBIDA</th>
                                <th className="px-2 py-1.5 text-center font-medium">CANT. GRN</th>
                                <th className="px-2 py-1.5 text-center font-medium">DIFERENCIA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading && <tr><td colSpan="12" className="py-4 text-center text-gray-500">Cargando...</td></tr>}
                            {filteredLogs.length === 0 && !loading && <tr><td colSpan="12" className="py-4 text-center text-gray-500">No encontrado.</td></tr>}
                            {filteredLogs.map((log, idx) => (
                                <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{log.id}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{formatDate(log.timestamp)}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{log.username?.toUpperCase()}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-800">{log.importReference}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-800">{log.waybill}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-[#285f94] font-mono font-medium">{log.itemCode}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-800 truncate max-w-xs" title={log.itemDescription}>{log.itemDescription}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-800 font-mono">{log.binLocation}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-800 font-mono">{log.relocatedBin}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-center font-mono">{log.qtyReceived}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-center text-gray-500 font-mono">{log.qtyGrn}</td>
                                    <td className={`px-2 py-1.5 whitespace-nowrap text-center font-mono font-semibold ${log.difference < 0 ? 'text-red-600' : log.difference > 0 ? 'text-[#285f94]' : 'text-gray-600'}`}>
                                        {log.difference > 0 ? `+${log.difference}` : log.difference}
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
