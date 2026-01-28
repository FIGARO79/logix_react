import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
    const [torchOn, setTorchOn] = useState(false);
    const scannerRef = useRef(null);

    // Load items when date changes
    useEffect(() => {
        if (!selectedDate) return;
        fetchDailyItems(selectedDate);
    }, [selectedDate]);

    // Scanner Effect
    useEffect(() => {
        if (scannerOpen) {
            import('html5-qrcode').then(({ Html5Qrcode }) => {
                const html5QrCode = new Html5Qrcode("planner-reader");
                scannerRef.current = html5QrCode;

                html5QrCode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    (decodedText) => {
                        handleScan(decodedText);
                    },
                    (errorMessage) => { }
                ).catch(err => {
                    console.error(err);
                    setScannerOpen(false);
                    toast.error("Error al iniciar cámara");
                });
            });
        }

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(console.error);
            }
        };
    }, [scannerOpen]);

    const toggleTorch = () => {
        if (scannerRef.current) {
            scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: !torchOn }]
            })
                .then(() => setTorchOn(!torchOn))
                .catch(err => {
                    console.error(err);
                    toast.error("Flash no disponible");
                });
        }
    };

    const handleScan = (code) => {
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

            // Stop scanner? User choice usually. Let's close it to let them count.
            setScannerOpen(false);
            if (scannerRef.current) scannerRef.current.stop().then(() => scannerRef.current.clear());

        } else {
            toast.warning("Item no está en la lista de hoy");
        }
    };


    const fetchDailyItems = async (date) => {
        setLoading(true);
        setError(null);
        setItems([]);
        try {
            const response = await fetch(`http://localhost:8000/api/planner/execution/daily_items?date=${date}`);
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

    const handleSubmit = async (index) => {
        const item = items[index];
        if (item.status !== 'counted') return;

        setSubmitting(true);
        setError(null);
        setMessage(null);

        try {
            const payload = {
                item_code: item.item_code,
                item_description: item.description,
                bin_location: item.bin_location || 'N/A',
                system_qty: item.system_qty || 0,
                physical_qty: parseInt(item.physical_qty),
                difference: item.difference,
                executed_date: selectedDate,
                username: "admin",
                abc_code: item.abc_code
            };

            const response = await fetch('http://localhost:8000/api/planner/save_execution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al guardar el conteo');

            setMessage(`Conteo guardado para ${item.item_code}`);
            toast.success(`Guardado: ${item.item_code}`);

            // Mark as saved visually
            const newItems = [...items];
            newItems[index].saved = true;
            setItems(newItems);

        } catch (err) {
            setError(err.message);
            toast.error("Error al guardar");
        } finally {
            setSubmitting(false);
        }
    };

    return (
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
                <button
                    onClick={() => setScannerOpen(true)}
                    className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ml-auto"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" />
                        <path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" />
                        <path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" />
                        <path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" />
                        <path d="M12 9h2V8h-2z" />
                    </svg>
                    Escanear
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
                        <thead>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Item</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Ubicación</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">ABC</th>
                                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">Sistema</th>
                                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider w-32">Físico</th>
                                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">Dif</th>
                                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {items.map((item, index) => (
                                <tr key={index} className={item.saved ? "bg-green-50" : ""}>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-indigo-600">{item.item_code}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{item.bin_location || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{item.abc_code}</td>
                                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-medium">{item.system_qty || 0}</td>
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

            {/* Scanner Modal */}
            {scannerOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg relative">
                        <h3 className="text-center font-bold text-lg mb-4 text-gray-800">Apunta la cámara al código de barras</h3>
                        <div id="planner-reader" className="rounded-lg overflow-hidden mb-4 border-2 border-gray-100"></div>

                        <div className="flex gap-3">
                            <button
                                onClick={toggleTorch}
                                className={`flex-1 h-12 flex items-center justify-center gap-2 rounded bg-[#34495e] hover:bg-[#2c3e50] text-white font-medium transition-colors ${torchOn ? 'ring-2 ring-yellow-400' : ''}`}
                                title={torchOn ? "Apagar Flash" : "Encender Flash"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M2 6a6 6 0 1 1 10.174 4.31c-.203.196-.359.4-.453.619l-.762 1.769A.5.5 0 0 1 10.5 13a.5.5 0 0 1 0 1 .5.5 0 0 1 0 1l-.224.447a1 1 0 0 1-.894.553H6.618a1 1 0 0 1-.894-.553L5.5 15a.5.5 0 0 1 0-1 .5.5 0 0 1 0-1 .5.5 0 0 1-.46-.302l-.761-1.77a1.964 1.964 0 0 0-.453-.618A5.984 5.984 0 0 1 2 6zm6-5a5 5 0 0 0-3.479 8.592c.263.254.514.564.676.941L5.83 12h4.342l.632-1.467c.162-.377.413-.687.676-.941A5 5 0 0 0 8 1z" />
                                </svg>
                                Flash
                            </button>
                            <button onClick={() => {
                                if (scannerRef.current) scannerRef.current.stop();
                                setScannerOpen(false);
                            }} className="flex-1 h-12 flex items-center justify-center bg-[#d32f2f] hover:bg-[#b71c1c] text-white font-medium rounded transition-colors">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlannerExecution;
