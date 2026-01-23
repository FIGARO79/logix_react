import React, { useEffect, useState, useMemo } from 'react';

const Reconciliation = () => {
    const [data, setData] = useState([]);
    const [archiveVersions, setArchiveVersions] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'GRN', direction: 'ascending' });

    // Fetch data (optionally with archive_date)
    const fetchData = (date = '') => {
        setLoading(true);
        let url = 'http://localhost:8000/api/views/reconciliation';
        if (date) {
            url += `?archive_date=${date}`;
        }
        
        fetch(url)
            .then(res => res.json())
            .then(response => {
                if (response.data) setData(response.data);
                if (response.archive_versions) setArchiveVersions(response.archive_versions);
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

    const handleArchiveChange = (e) => {
        const date = e.target.value;
        setSelectedDate(date);
        fetchData(date);
    };

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
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-4 rounded shadow-sm border border-gray-200">
                <h2 className="text-2xl font-bold text-[#354a5f] mb-4 md:mb-0 flex items-center">
                    📊 Reconciliación de Inventario
                </h2>
                
                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                   {/* Search Box */}
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2">
                             <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                             </svg>
                        </span>
                        <input
                            type="text"
                            placeholder="Buscar en tabla..."
                            className="pl-10 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none w-full sm:w-64"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                        />
                    </div>

                    {/* Archive Selector */}
                    <select 
                        className="py-2 px-4 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-gray-700"
                        value={selectedDate}
                        onChange={handleArchiveChange}
                    >
                        <option value="">📋 Ver Datos Actuales</option>
                        {archiveVersions.map(date => (
                            <option key={date} value={date}>🗄 Histórico: {date}</option>
                        ))}
                    </select>
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
                        <table className="min-w-full leading-normal">
                            <thead className="bg-[#eff1f4] border-b-2 border-gray-200">
                                <tr>
                                    {['GRN', 'Codigo_Item', 'Descripcion', 'Ubicacion', 'Reubicado', 'Cant_Esperada', 'Cant_Recibida', 'Diferencia'].map((head) => (
                                        <th 
                                            key={head}
                                            onClick={() => requestSort(head)}
                                            className="px-5 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition select-none whitespace-nowrap"
                                        >
                                            <div className="flex items-center">
                                                {head.replace('_', ' ')}
                                                {getSortIcon(head)}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredData.length > 0 ? (
                                    filteredData.map((row, idx) => {
                                        const hasDiff = row.Diferencia !== 0;
                                        const rowClass = hasDiff ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50";
                                        const textClass = hasDiff ? "text-red-700 font-semibold" : "text-gray-700";
                                        
                                        return (
                                            <tr key={idx} className={`${rowClass} transition-colors duration-150`}>
                                                <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">{row.GRN}</td>
                                                <td className="px-5 py-4 whitespace-nowrap">{row.Codigo_Item}</td>
                                                <td className="px-5 py-4 text-sm truncate max-w-xs" title={row.Descripcion}>{row.Descripcion}</td>
                                                <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-500">{row.Ubicacion}</td>
                                                <td className="px-5 py-4 whitespace-nowrap text-sm text-blue-600 font-medium">{row.Reubicado}</td>
                                                <td className="px-5 py-4 whitespace-nowrap text-right font-mono">{row.Cant_Esperada}</td>
                                                <td className="px-5 py-4 whitespace-nowrap text-right font-mono">{row.Cant_Recibida}</td>
                                                <td className={`px-5 py-4 whitespace-nowrap text-right font-mono text-base ${textClass}`}>
                                                    {row.Diferencia > 0 ? `+${row.Diferencia}` : row.Diferencia}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="px-5 py-8 text-center text-gray-500">
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
                        <span>
                            {selectedDate ? `Visualizando archivo del: ${selectedDate}` : 'Visualizando datos en tiempo real'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reconciliation;
