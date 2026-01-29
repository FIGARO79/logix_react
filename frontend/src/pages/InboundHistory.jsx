import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const InboundHistory = () => {
    const { setTitle } = useOutletContext();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

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
        (log.user && log.user.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-white p-4 rounded shadow-sm border border-gray-200">
                <h1 className="text-lg font-semibold text-gray-800 mb-4 md:mb-0">Registros de Entrada (Inbound)</h1>
                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        placeholder="Buscar por item o usuario..."
                        className="h-8 px-3 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none w-56 transition-all duration-150"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
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
                <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-700 text-white">
                            <tr>
                                <th className="px-2 py-1.5 text-left font-medium">ID</th>
                                <th className="px-2 py-1.5 text-left font-medium">Timestamp</th>
                                <th className="px-2 py-1.5 text-left font-medium">Usuario</th>
                                <th className="px-2 py-1.5 text-left font-medium">Item</th>
                                <th className="px-2 py-1.5 text-center font-medium">Recibido</th>
                                <th className="px-2 py-1.5 text-center font-medium">Sistema</th>
                                <th className="px-2 py-1.5 text-center font-medium">Diferencia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading && <tr><td colSpan="7" className="py-4 text-center text-gray-500">Cargando...</td></tr>}
                            {filteredLogs.length === 0 && !loading && <tr><td colSpan="7" className="py-4 text-center text-gray-500">No encontrado.</td></tr>}
                            {filteredLogs.map((log, idx) => (
                                <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{log.id}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{log.timestamp}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap font-medium text-gray-900">{log.user}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-blue-600 font-mono font-medium">{log.itemCode}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-center font-mono">{log.qtyReceived}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-center text-gray-500 font-mono">{log.qtySystem}</td>
                                    <td className={`px-2 py-1.5 whitespace-nowrap text-center font-mono font-semibold ${log.difference < 0 ? 'text-red-600' : log.difference > 0 ? 'text-blue-600' : 'text-gray-600'}`}>
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
