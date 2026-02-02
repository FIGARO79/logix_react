import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';

const PlannerExecution = () => {
    const { setTitle } = useOutletContext();
    const [searchParams] = useSearchParams();
    // Default to today or url param
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || today);

    useEffect(() => { setTitle("Ejecución Diaria de Conteos"); }, [setTitle]);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Scanner State
    const [scannerOpen, setScannerOpen] = useState(false);

    // Load items when date changes
    useEffect(() => {
        if (!selectedDate) return;
        fetchDailyItems(selectedDate);
    }, [selectedDate]);

    const handleScan = (code) => {
        setScannerOpen(false);
        const cleanCode = code.trim().toUpperCase();
        // Buscar item
        const index = items.findIndex(i => i.item_code === cleanCode);

        if (index !== -1) {
            // Found
            toast.success(`Item encontrado: ${cleanCode}`);

            // Focus input logic - assuming we render inputs with id={`qty-${index}`}
            setTimeout(() => {
                const el = document.getElementById(`qty-${index}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.focus();
                    el.select(); // Select content for easy overwrite
                }
            }, 100);

        } else {
            toast.warning("Item no está en la lista de hoy");
        }
    };


    const fetchDailyItems = async (date) => {
        setLoading(true);
        setError(null);
        setItems([]);
        try {
            const response = await fetch(`/api/planner/execution/daily_items?date=${date}`);
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
            const sysQty = item.system_qty || 0;
            item.difference = qty - sysQty;
            item.status = 'counted';
        }
        setItems(newItems);
    };

    const handleBulkSave = async () => {
        // Filter items that have actual counts
        const countedItems = items.filter(item => item.status === 'counted' && !item.saved);

        if (countedItems.length === 0) {
            toast.warning("No hay items nuevos para guardar.");
            return;
        }

        if (!window.confirm(`¿Estás seguro de guardar ${countedItems.length} items?`)) {
            return;
        }

        setSubmitting(true);
        setError(null);
        setMessage(null);

        try {
            const itemsPayload = countedItems.map(item => ({
                item_code: item.item_code,
                description: item.description,
                bin_location: item.bin_location || 'N/A',
                system_qty: item.system_qty || 0,
                physical_qty: parseInt(item.physical_qty),
                abc_code: item.abc_code
            }));

            const payload = {
                date: selectedDate,
                items: itemsPayload
            };

            const response = await fetch('/api/planner/execution/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al guardar los conteos');

            const result = await response.json();
            toast.success(result.message || "Conteos guardados exitosamente");
            setMessage("Guardado exitoso. Puede continuar o cambiar de fecha.");

            // Mark saved items visually
            const newItems = items.map(item => {
                const isSaved = countedItems.some(c => c.item_code === item.item_code);
                return isSaved ? { ...item, saved: true } : item;
            });
            setItems(newItems);

        } catch (err) {
            console.error(err);
            setError(err.message);
            toast.error("Error al guardar conteos");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8">

            {/* Date Selection - Mobile Optimized */}
            <div className="bg-white p-3 sm:p-4 rounded-lg shadow mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2 flex-1">
                        <label className="font-semibold text-gray-700 text-sm whitespace-nowrap">Fecha:</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="flex-1 rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => fetchDailyItems(selectedDate)}
                            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded text-sm font-medium transition-colors"
                        >
                            Actualizar
                        </button>
                        <button
                            onClick={() => setScannerOpen(true)}
                            className="flex-1 sm:flex-none bg-gray-700 hover:bg-gray-800 text-white px-4 py-2.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" />
                                <path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" />
                                <path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" />
                                <path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" />
                                <path d="M12 9h2V8h-2z" />
                            </svg>
                            <span className="hidden sm:inline">Escanear</span>
                            <span className="sm:hidden">Scan</span>
                        </button>
                    </div>
                </div>
                {message && <span className="block mt-2 text-green-600 text-sm font-medium">{message}</span>}
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
                <div className="bg-white shadow overflow-hidden rounded-lg">
                    {/* Desktop Table View */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-[#34495e] text-white">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-auto">Item</th>
                                    <th className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider w-24">Ubicación</th>
                                    <th className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16">ABC</th>
                                    <th className="px-1 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16">Físico</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {items.map((item, index) => (
                                    <tr key={index} className={item.saved ? "bg-green-50" : ""}>
                                        <td className="px-2 py-2">
                                            <div className="text-sm font-medium text-indigo-600">{item.item_code}</div>
                                            <div className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-xs">{item.description}</div>
                                        </td>
                                        <td className="px-1 py-2 text-sm text-gray-500 font-mono text-center">
                                            <div>{item.bin_location || 'N/A'}</div>
                                            {item.additional_locations && (
                                                <div className="text-[10px] text-gray-400 mt-0.5" title="Ubicaciones Adicionales">
                                                    {item.additional_locations}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-1 py-2 text-sm text-gray-500 text-center">{item.abc_code}</td>
                                        <td className="px-0 py-2 text-center">
                                            <input
                                                id={`qty-${index}`}
                                                type="number"
                                                className="w-16 text-center p-1 border rounded border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 text-sm no-spinner"
                                                value={item.physical_qty}
                                                onChange={(e) => handleCountChange(index, e.target.value)}
                                                onBlur={() => calculateDifference(index)}
                                                disabled={item.saved}
                                                placeholder="-"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="block sm:hidden bg-gray-50 p-2 space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className={`bg-white rounded-lg shadow-sm p-3 border ${item.saved ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className="text-lg font-bold text-indigo-700 block">{item.item_code}</span>
                                        <span className="text-xs text-gray-500">{item.description}</span>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${item.abc_code === 'A' ? 'bg-red-100 text-red-800' :
                                        item.abc_code === 'B' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-blue-100 text-blue-800'
                                        }`}>
                                        {item.abc_code}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center mt-3">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Ubicación</span>
                                        <span className="text-sm font-mono font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded self-start">
                                            {item.bin_location || 'N/A'}
                                        </span>
                                        {item.additional_locations && (
                                            <span className="text-[10px] text-gray-500 mt-1 pl-1">
                                                <span className="font-bold">Adic:</span> {item.additional_locations}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">Cant. Física</span>
                                        <input
                                            id={`qty-mobile-${index}`}
                                            type="number"
                                            className="w-24 text-center p-2 border rounded-lg border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 text-lg font-bold shadow-sm"
                                            value={item.physical_qty}
                                            onChange={(e) => handleCountChange(index, e.target.value)}
                                            onBlur={() => calculateDifference(index)}
                                            disabled={item.saved}
                                            placeholder="0"
                                            inputMode="numeric"
                                        />
                                    </div>
                                </div>
                                {item.saved && (
                                    <div className="mt-2 text-right">
                                        <span className="text-xs font-bold text-green-600 flex items-center justify-end gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            Guardado
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Bulk Save Footer */}
                    <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200">
                        <div className="text-sm text-gray-700">
                            Items contados: <span className="font-bold">{items.filter(i => i.status === 'counted').length}</span> / {items.length}
                        </div>
                        <button
                            onClick={handleBulkSave}
                            disabled={submitting || items.filter(i => i.status === 'counted').length === 0}
                            className={`w-full sm:w-auto px-6 py-2.5 rounded-md text-sm font-bold text-white shadow-sm transition-colors ${submitting || items.filter(i => i.status === 'counted').length === 0
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                                }`}
                        >
                            {submitting ? 'Guardando...' : 'Guardar y Finalizar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Scanner Modal */}
            {
                scannerOpen && (
                    <ScannerModal
                        onScan={handleScan}
                        onClose={() => setScannerOpen(false)}
                    />
                )
            }
        </div >
    );
};

export default PlannerExecution;
