import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

const CycleCountHistory = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();
    const [recordings, setRecordings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setTitle("Logix - Registro de Conteos");
    }, [setTitle]);

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

    const handleExport = () => {
        window.location.href = '/api/counts/export_recordings';
    };

    const filteredRecordings = recordings.filter(rec =>
        (rec.item_code && rec.item_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (rec.description && rec.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (rec.username && rec.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="w-full bg-gray-50 min-h-screen font-sans text-[#333]">
            {/* Header bar similiar to screenshot */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-[48px] z-20">
                <div>
                    <h1 className="text-lg font-semibold text-gray-800">Registro Histórico</h1>
                    <p className="text-xs text-gray-500">Detalle de todas las ejecuciones de conteo cíclico</p>
                </div>
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="border border-gray-300 px-3 py-1.5 rounded text-sm w-64 focus:outline-none focus:border-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button
                        onClick={handleExport}
                        className="bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.914 2.914a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
                        Exportar
                    </button>
                    {/* Add Back button just in case */}
                    <button onClick={() => navigate('/counts')} className="text-gray-500 hover:text-gray-700">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            <div className="p-4 overflow-x-auto">
                {loading && <div className="text-center p-8 text-sm text-gray-500">Cargando datos...</div>}
                {error && <div className="bg-red-100 text-red-700 p-3 rounded text-sm mb-4">{error}</div>}

                {!loading && !error && (
                    <table className="w-full text-left border-collapse bg-white shadow-sm text-[11px] leading-tight">
                        <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                            <tr>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">STOCKROOM</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">ITEM CODE</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider w-64">DESCRIPTION</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">ITEM TYPE</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">CLASS</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">GROUP</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">SIC (CO)</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">SIC (STK)</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">WEIGHT</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-center">ABC</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">BIN</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">SYS STOCK</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">COUNTED</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">DIFF</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">VALUE (DIFFERENCE)</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">ITEM COST</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">COUNT VALUE</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider text-right">DATE</th>
                                <th className="px-2 py-3 font-bold uppercase tracking-wider">USER</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRecordings.map((rec, idx) => (
                                <tr key={rec.id} className={`hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                    <td className="px-2 py-2 font-medium text-gray-900">{rec.stockroom}</td>
                                    <td className="px-2 py-2">
                                        <span className="text-blue-600 font-medium hover:underline cursor-pointer">{rec.item_code}</span>
                                    </td>
                                    <td className="px-2 py-2 truncate max-w-[200px]" title={rec.description}>{rec.description}</td>
                                    <td className="px-2 py-2 text-gray-500">{rec.item_type}</td>
                                    <td className="px-2 py-2 text-gray-500">{rec.item_class}</td>
                                    <td className="px-2 py-2 text-gray-500">{rec.item_group}</td>
                                    <td className="px-2 py-2 text-gray-500">{rec.sic_company}</td>
                                    <td className="px-2 py-2 text-gray-500">{rec.sic_stockroom}</td>
                                    <td className="px-2 py-2 text-right">{rec.weight}</td>
                                    <td className="px-2 py-2 text-center">
                                        {rec.abc_code && (
                                            <span className={`inline-block w-5 h-5 leading-5 rounded-full text-[9px] font-bold 
                                                ${rec.abc_code === 'A' ? 'bg-red-100 text-red-800' :
                                                    rec.abc_code === 'B' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                                {rec.abc_code}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-gray-700">{rec.bin_location}</td>
                                    <td className="px-2 py-2 text-right font-medium text-gray-600">{rec.system_qty}</td>
                                    <td className="px-2 py-2 text-right font-bold text-gray-900">{rec.physical_qty}</td>
                                    <td className={`px-2 py-2 text-right font-bold ${rec.difference !== 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                        {rec.difference}
                                    </td>
                                    <td className="px-2 py-2 text-right text-gray-500">{formatMoney(rec.value_diff)}</td>
                                    <td className="px-2 py-2 text-right text-gray-500">{formatMoney(rec.cost)}</td>
                                    <td className="px-2 py-2 text-right text-gray-800 font-medium">{formatMoney(rec.count_value)}</td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap text-gray-500">
                                        {rec.executed_date ? new Date(rec.executed_date).toISOString().slice(0, 10) : '-'}
                                    </td>
                                    <td className="px-2 py-2 text-gray-500 truncate max-w-[100px]">{rec.username}</td>
                                </tr>
                            ))}
                            {filteredRecordings.length === 0 && (
                                <tr>
                                    <td colSpan="19" className="px-4 py-12 text-center text-gray-400">
                                        No se encontraron registros que coincidan con la búsqueda.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default CycleCountHistory;
