import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';

const CycleCounts = () => {
    const { setTitle } = useOutletContext();
    const [counts, setCounts] = useState([]);
    const [usernames, setUsernames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterUser, setFilterUser] = useState('');

    useEffect(() => {
        setTitle("Conteos de Inventario");
    }, []);

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const response = await fetch('http://localhost:8000/api/views/view_counts');
                if (!response.ok) {
                    throw new Error('Error al cargar conteos');
                }
                const data = await response.json();
                setCounts(data.counts);
                setUsernames(data.usernames);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchCounts();
    }, []);

    const filteredCounts = filterUser
        ? counts.filter(c => c.username === filterUser)
        : counts;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <select
                        className="form-select block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-[#0070d2] focus:border-[#0070d2] sm:text-sm rounded-md"
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                    >
                        <option value="">Todos los Usuarios</option>
                        {usernames.map(u => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                    </select>
                </div>
                <div className="flex gap-2">
                    <Link
                        to="/view_counts/recordings" // Create page for this later if needed (history)
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded shadow transition-colors text-sm"
                    >
                        Ver Histórico
                    </Link>
                    {/* Add Count manually logic if needed or just scan link */}
                    <Link
                        to="/counts/new" // This would be the "scan" part similar to inbound
                        className="bg-[#0070d2] hover:bg-[#005fb2] text-white font-bold py-2 px-4 rounded shadow transition-colors text-sm"
                    >
                        + Nuevo Conteo
                    </Link>
                </div>
            </div>

            {/* Main Table */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0070d2]"></div>
                </div>
            ) : error ? (
                <div className="text-red-600 bg-red-50 p-4 border border-red-200 rounded">{error}</div>
            ) : (
                <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ítem</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación Contada</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cant. Física</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sistema</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Diferencia</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredCounts.map((count) => (
                                    <tr key={count.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{count.username || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-[#0070d2]">{count.item_code}</div>
                                            <div className="text-sm text-gray-500 truncate max-w-xs" title={count.item_description}>{count.item_description}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{count.counted_location}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">{count.counted_qty}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{count.system_qty}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${count.difference === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {count.difference > 0 ? `+${count.difference}` : count.difference}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(count.timestamp).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CycleCounts;
