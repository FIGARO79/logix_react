import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';

const CycleCountHistory = () => {
    const navigate = useNavigate();
    const [recordings, setRecordings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchRecordings = async () => {
            try {
                const res = await fetch('/api/counts/recordings');
                if (!res.ok) throw new Error("Error loading recordings");
                const data = await res.json();
                setRecordings(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchRecordings();
    }, []);

    // Format currency
    const formatMoney = (amount) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    };

    const filteredRecordings = recordings.filter(rec =>
        (rec.item_code && rec.item_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (rec.description && rec.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (rec.username && rec.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <Layout title="Historial de Conteos Cíclicos">
            <div className="max-w-8xl mx-auto px-4 py-8"> {/* Wide container for big table */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">Historial de Conteos (Detallado)</h1>
                    <div className="flex gap-4">
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="border p-2 rounded shadow-sm w-64"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button onClick={() => navigate('/counts')} className="bg-gray-100 text-blue-600 px-4 py-2 rounded hover:bg-gray-200 border">
                            Volver al Tablero
                        </button>
                    </div>
                </div>

                {loading && <div className="text-center p-8">Cargando historial completo...</div>}
                {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

                {!loading && !error && (
                    <div className="bg-white shadow rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2 text-left font-bold text-gray-600 uppercase">ID</th>
                                    <th className="px-3 py-2 text-left font-bold text-gray-600 uppercase">Fecha</th>
                                    <th className="px-3 py-2 text-left font-bold text-gray-600 uppercase">Usuario</th>
                                    <th className="px-3 py-2 text-left font-bold text-gray-600 uppercase">Item</th>
                                    <th className="px-3 py-2 text-left font-bold text-gray-600 uppercase">Desc</th>
                                    <th className="px-3 py-2 text-left font-bold text-gray-600 uppercase">Stockroom</th>
                                    <th className="px-3 py-2 text-left font-bold text-gray-600 uppercase">Bin</th>
                                    <th className="px-3 py-2 text-right font-bold text-gray-600 uppercase bg-blue-50">Físico</th>
                                    <th className="px-3 py-2 text-right font-bold text-gray-600 uppercase">Sistema</th>
                                    <th className="px-3 py-2 text-right font-bold text-gray-600 uppercase">Dif</th>
                                    <th className="px-3 py-2 text-right font-bold text-gray-600 uppercase">Costo Unit.</th>
                                    <th className="px-3 py-2 text-right font-bold text-gray-600 uppercase">Valor Dif.</th>
                                    <th className="px-3 py-2 text-right font-bold text-gray-600 uppercase">Valor Total</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredRecordings.map(rec => (
                                    <tr key={rec.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-500">{rec.id}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{rec.executed_date ? new Date(rec.executed_date).toLocaleString() : '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{rec.username}</td>
                                        <td className="px-3 py-2 font-medium text-blue-600">{rec.item_code}</td>
                                        <td className="px-3 py-2 truncate max-w-xs text-gray-500" title={rec.description}>{rec.description}</td>
                                        <td className="px-3 py-2 text-gray-500">{rec.stockroom}</td>
                                        <td className="px-3 py-2 text-gray-600">{rec.bin_location}</td>
                                        <td className="px-3 py-2 text-right font-bold bg-blue-50 border-l border-r border-blue-100">{rec.physical_qty}</td>
                                        <td className="px-3 py-2 text-right text-gray-600">{rec.system_qty}</td>
                                        <td className={`px-3 py-2 text-right font-bold ${rec.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {rec.difference > 0 ? `+${rec.difference}` : rec.difference}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-500">{formatMoney(rec.cost)}</td>
                                        <td className={`px-3 py-2 text-right font-bold ${rec.value_diff !== 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                            {formatMoney(rec.value_diff)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatMoney(rec.count_value)}</td>
                                    </tr>
                                ))}
                                {filteredRecordings.length === 0 && (
                                    <tr><td colSpan="13" className="p-4 text-center text-gray-500">No se encontraron registros.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default CycleCountHistory;
