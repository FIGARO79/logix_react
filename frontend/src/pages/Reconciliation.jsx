import React, { useEffect, useState, useMemo } from 'react';

const Reconciliation = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'GRN', direction: 'ascending' });

    // Fetch data
    const fetchData = () => {
        setLoading(true);
        fetch('/api/views/reconciliation')
            .then(res => res.json())
            .then(response => {
                if (response.data) setData(response.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching reconciliation data:", err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Sorting logic
    const sortedData = useMemo(() => {
        let sortableItems = [...data];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aKey = a[sortConfig.key];
                let bKey = b[sortConfig.key];

                // Handle numbers correctly
                if (typeof aKey === 'number' && typeof bKey === 'number') {
                    return sortConfig.direction === 'ascending' ? aKey - bKey : bKey - aKey;
                }
                // Handle strings
                aKey = aKey ? aKey.toString().toLowerCase() : '';
                bKey = bKey ? bKey.toString().toLowerCase() : '';

                if (aKey < bKey) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aKey > bKey) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [data, sortConfig]);

    // Filtering logic
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

    // Helper for Sort Icons
    const getSortIcon = (name) => {
        if (sortConfig.key !== name) return <span className="ml-1 text-gray-400">↕</span>;
        return sortConfig.direction === 'ascending' ? <span className="ml-1 text-black">↑</span> : <span className="ml-1 text-black">↓</span>;
    };

    return (
        <div className="p-2 sm:p-6 bg-gray-50 min-h-screen font-sans">
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-white p-4 rounded shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 md:mb-0 flex items-center gap-2">
                    Reconciliación de Inventario
                </h2>

                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto items-center">
                    {/* Search Box */}
                    <input
                        type="text"
                        placeholder="Buscar en tabla..."
                        className="h-8 px-3 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none w-full sm:w-52 transition-all duration-150"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />

                    {/* Export Button */}
                    <button
                        onClick={() => window.location.href = '/api/views/reconciliation/export'}
                        className="h-8 px-4 text-xs font-medium bg-emerald-600 text-white border border-emerald-700 rounded-md shadow-sm hover:bg-emerald-700 transition-all duration-150 flex items-center justify-center gap-1.5"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.914 2.914a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
                        Exportar
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
                {loading ? (
                    <div className="p-12 text-center text-gray-500 animate-pulse">
                        Cargando datos de reconciliación...
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead className="bg-slate-700 text-white">
                                <tr>
                                    {['GRN', 'Codigo_Item', 'Descripcion', 'Ubicacion', 'Reubicado', 'Cant_Esperada', 'Cant_Recibida', 'Diferencia'].map((head) => (
                                        <th
                                            key={head}
                                            onClick={() => requestSort(head)}
                                            className="px-2 py-1.5 text-left font-medium cursor-pointer transition select-none whitespace-nowrap hover:bg-slate-600"
                                        >
                                            <div className="flex items-center">
                                                {head.replace('_', ' ')}
                                                {getSortIcon(head)}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredData.length > 0 ? (
                                    filteredData.map((row, idx) => {
                                        const hasDiff = row.Diferencia !== 0;
                                        const baseClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                                        const rowClass = hasDiff ? "bg-red-50 hover:bg-red-100" : `${baseClass} hover:bg-blue-50`;
                                        const textClass = hasDiff ? "text-red-600 font-semibold" : "text-gray-600";

                                        return (
                                            <tr key={idx} className={`${rowClass} transition-colors`}>
                                                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-gray-900">{row.GRN}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap font-mono">{row.Codigo_Item}</td>
                                                <td className="px-2 py-1.5 truncate max-w-[180px]" title={row.Descripcion}>{row.Descripcion}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{row.Ubicacion}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-blue-600 font-medium">{row.Reubicado}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-center font-mono">{row.Cant_Esperada}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-center font-mono">{row.Cant_Recibida}</td>
                                                <td className={`px-2 py-1.5 whitespace-nowrap text-center font-mono font-semibold ${textClass}`}>
                                                    {row.Diferencia > 0 ? `+${row.Diferencia}` : row.Diferencia}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="px-2 py-4 text-center text-gray-500">
                                            No se encontraron datos {filterText && `para "${filterText}"`}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer / Stats */}
                {!loading && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex flex-col xs:flex-row items-center justify-between text-xs text-gray-500">
                        <span>Mostrando {filteredData.length} registros</span>
                        <span>Datos en tiempo real</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reconciliation;
