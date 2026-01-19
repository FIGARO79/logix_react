import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useSearchParams } from 'react-router-dom';

const PlannerExecution = () => {
    const [searchParams] = useSearchParams();
    // Default to today or url param
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || today);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Load items when date changes
    useEffect(() => {
        if (!selectedDate) return;
        fetchDailyItems(selectedDate);
    }, [selectedDate]);

    const fetchDailyItems = async (date) => {
        setLoading(true);
        setError(null);
        setItems([]);
        try {
            const response = await fetch(`http://localhost:8000/api/planner/daily_execution?date=${date}`);
            if (!response.ok) throw new Error('Error al cargar ítems planificados');

            const data = await response.json();
            // Initialize input state for each item (physical_qty)
            const initializedItems = data.map(item => ({
                ...item,
                physical_qty: '', // Input field value
                difference: null,   // Calc result
                status: 'pending' // pending, counted
            }));
            setItems(initializedItems);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCountChange = (index, value) => {
        const newItems = [...items];
        newItems[index].physical_qty = value;
        setItems(newItems);
    };

    const calculateDifference = (index) => {
        const newItems = [...items];
        const item = newItems[index];
        const qty = parseInt(item.physical_qty);

        if (!isNaN(qty)) {
            // Assuming system_qty is available in the fetched item data
            // Usually 'Quantity' from CSV or DB
            const sysQty = item.Quantity || 0;
            item.difference = qty - sysQty;
            item.status = 'counted';
        }
        setItems(newItems);
    };

    const handleSubmit = async (index) => {
        const item = items[index];
        if (item.status !== 'counted') return;

        setSubmitting(true);
        setError(null);
        setMessage(null);

        try {
            const payload = {
                item_code: item.Item_Code,
                item_description: item.Item_Description,
                bin_location: item.Bin_1 || 'N/A', // Or logic to pick effective bin
                system_qty: item.Quantity || 0,
                physical_qty: parseInt(item.physical_qty),
                difference: item.difference,
                executed_date: selectedDate,
                username: "admin", // Hardcoded for now
                abc_code: item.ABC_Code
            };

            const response = await fetch('http://localhost:8000/api/planner/save_execution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al guardar el conteo');

            setMessage(`Conteo guardado para ${item.Item_Code}`);

            // Mark as saved visually
            const newItems = [...items];
            newItems[index].saved = true;
            setItems(newItems);

        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout title="Ejecución Diaria de Conteos">
            <div className="max-w-7xl mx-auto px-4 py-8">

                {/* Date Selection */}
                <div className="bg-white p-4 rounded-lg shadow mb-6 flex items-center gap-4">
                    <label className="font-semibold text-gray-700">Fecha de Ejecución:</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                    <button
                        onClick={() => fetchDailyItems(selectedDate)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                    >
                        Actualizar
                    </button>
                    {message && <span className="text-green-600 text-sm font-medium ml-auto">{message}</span>}
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                    </div>
                ) : error ? (
                    <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded">{error}</div>
                ) : items.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-white rounded shadow">
                        No hay ítems planificados para esta fecha.
                    </div>
                ) : (
                    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ABC</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sistema</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Físico</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Dif</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {items.map((item, index) => (
                                    <tr key={index} className={item.saved ? "bg-green-50" : ""}>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-indigo-600">{item.Item_Code}</div>
                                            <div className="text-xs text-gray-500 truncate max-w-xs">{item.Item_Description}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 font-mono">{item.Bin_1 || 'N/A'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{item.ABC_Code}</td>
                                        <td className="px-6 py-4 text-sm text-right text-gray-900 font-medium">{item.Quantity || 0}</td>
                                        <td className="px-6 py-4 text-right">
                                            <input
                                                type="number"
                                                className="w-24 text-right p-1 border rounded border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                value={item.physical_qty}
                                                onChange={(e) => handleCountChange(index, e.target.value)}
                                                onBlur={() => calculateDifference(index)}
                                                disabled={item.saved}
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {item.difference !== null && (
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.difference === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {item.difference > 0 ? `+${item.difference}` : item.difference}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {!item.saved ? (
                                                <button
                                                    onClick={() => handleSubmit(index)}
                                                    disabled={submitting || item.status !== 'counted'}
                                                    className={`text-white px-3 py-1 rounded text-xs font-bold transition-colors ${item.status === 'counted'
                                                            ? 'bg-indigo-600 hover:bg-indigo-700'
                                                            : 'bg-gray-300 cursor-not-allowed'
                                                        }`}
                                                >
                                                    Guardar
                                                </button>
                                            ) : (
                                                <span className="text-green-600 font-bold text-xs">OK</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default PlannerExecution;
