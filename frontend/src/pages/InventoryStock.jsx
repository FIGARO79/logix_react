import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

const InventoryStock = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [stockData, setStockData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initial load or search logic
    const fetchStock = async (query = '') => {
        setLoading(true);
        setError(null);
        try {
            // If query is present, we might use a specific search endpoint or filter client-side if data is small
            // Given the backend `get_stock` returns all records, we'll fetch all and filter client-side for now
            // Or use `get_stock_item` for specific single item lookup if strict match.

            // Optimization: If `get_stock` is heavy, we might want to ask backend to filter.
            // For now, let's assume we fetch all and filter.

            let url = 'http://localhost:8000/api/stock';
            if (query) {
                // If the user entered a code, try the specific item endpoint first for speed? 
                // But the user might want partial match. 
                // Let's stick to client side filtering of the main list for simplicity unless huge.
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Error al cargar inventario');
            }
            const data = await response.json();

            // Client side filtering
            let filtered = data;
            if (query) {
                const lowerQ = query.toLowerCase();
                filtered = data.filter(item =>
                    String(item.Item_Code).toLowerCase().includes(lowerQ) ||
                    String(item.Item_Description).toLowerCase().includes(lowerQ)
                );
            }
            setStockData(filtered);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Load some initial data or leave empty?
        // fetchStock(); 
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchStock(searchTerm);
    };

    return (
        <Layout title="Consulta de Stock">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Search Bar */}
                <div className="mb-8 bg-white p-6 rounded-lg shadow-md border-t-4 border-[#0070d2]">
                    <form onSubmit={handleSearch} className="flex gap-4 items-end">
                        <div className="flex-grow">
                            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                                Buscar Artículo
                            </label>
                            <input
                                type="text"
                                name="search"
                                id="search"
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50 py-2 px-3 border"
                                placeholder="Código o Descripción..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-[#0070d2] hover:bg-[#005fb2] text-white font-bold py-2 px-6 rounded shadow transition-colors duration-200 flex items-center"
                        >
                            {loading ? (
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            )}
                            Buscar
                        </button>
                    </form>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Results Table */}
                {stockData.length > 0 && (
                    <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                        <div className="overflow-x-auto">
                            <table className="min-w-full leading-normal">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        <th className="px-5 py-3">Código Item</th>
                                        <th className="px-5 py-3">Descripción</th>
                                        <th className="px-5 py-3">Ubicación</th>
                                        <th className="px-5 py-3">Stock Sistema</th>
                                        <th className="px-5 py-3 text-right">Costo Unit.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockData.map((item, index) => (
                                        <tr key={index} className="hover:bg-gray-50 transition-colors duration-150 border-b border-gray-200 last:border-b-0">
                                            <td className="px-5 py-4 text-sm font-medium text-[#0070d2]">
                                                {item.Item_Code}
                                            </td>
                                            <td className="px-5 py-4 text-sm text-gray-700">
                                                {item.Item_Description}
                                            </td>
                                            <td className="px-5 py-4 text-sm text-gray-700 font-bold">
                                                {item.Bin_1 || 'N/A'}
                                            </td>
                                            <td className="px-5 py-4 text-sm text-gray-700">
                                                {item.Quantity || 0}
                                            </td>
                                            <td className="px-5 py-4 text-sm text-gray-700 text-right">
                                                ${parseFloat(item.Cost_per_Unit || 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 text-right">
                            Mostrando {stockData.length} resultados
                        </div>
                    </div>
                )}

                {stockData.length === 0 && !loading && !error && (
                    <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p className="mt-2 text-lg">Ingrese un término de búsqueda para comenzar</p>
                    </div>
                )}

            </div>
        </Layout>
    );
};

export default InventoryStock;
