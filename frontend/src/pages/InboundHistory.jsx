import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';

const InboundHistory = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/logs/inbound');
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
        <Layout title="Historial de Inbound">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">Registros de Entrada (Inbound)</h1>
                    <div className="w-1/3">
                        <input
                            type="text"
                            placeholder="Buscar por item o usuario..."
                            className="w-full border p-2 rounded shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}

                <div className="bg-white shadow rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recibido</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sistema</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Diferencia</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading && <tr><td colSpan="7" className="p-4 text-center">Cargando...</td></tr>}
                            {filteredLogs.length === 0 && !loading && <tr><td colSpan="7" className="p-4 text-center">No encontrado.</td></tr>}
                            {filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.timestamp}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{log.user}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-bold">{log.itemCode}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.qtyReceived}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.qtySystem}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${log.difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {log.difference}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
};

export default InboundHistory;
