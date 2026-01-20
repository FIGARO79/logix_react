import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

const PickingAudit = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();

    useEffect(() => {
        setTitle("Chequeo de Picking");
    }, []);

    // UI States
    const [step, setStep] = useState('load'); // 'load', 'audit'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    // Data States
    const [trackingOrders, setTrackingOrders] = useState([]);
    const [currentOrder, setCurrentOrder] = useState(null); // { orderNumber, despatchNumber, customerName, items: [] }

    // Inputs
    const [orderInput, setOrderInput] = useState('');
    const [despatchInput, setDespatchInput] = useState('');
    const [itemInput, setItemInput] = useState('');

    // Active Audit State
    const [auditItems, setAuditItems] = useState([]);
    const [packagesInput, setPackagesInput] = useState('');

    // Modal States
    const [quantityModalOpen, setQuantityModalOpen] = useState(false);
    const [selectedItemIndex, setSelectedItemIndex] = useState(null);
    const [tempQuantity, setTempQuantity] = useState('');

    // Audio
    // Simple beep logic using Web Audio API if needed, or browser beep.

    // --- Tracking Data ---
    const fetchTracking = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/picking/tracking');
            if (res.ok) {
                const data = await res.json();
                setTrackingOrders(data);
            }
        } catch (e) {
            console.error("Tracking fetch error", e);
        }
    };

    useEffect(() => {
        fetchTracking();
    }, []);


    // --- Load Order ---
    const handleLoadOrder = async (oNum, dNum) => {
        if (!oNum || !dNum) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`http://localhost:8000/api/picking/order/${oNum}/${dNum}`);
            if (!res.ok) throw new Error('Pedido no encontrado');

            const data = await res.json();
            // Data is list of lines. Group/Process them.
            if (data.length === 0) throw new Error('Pedido sin líneas');

            // Initialize audit state
            const itemsMap = {};
            data.forEach(row => {
                if (!itemsMap[row['Item Code']]) {
                    itemsMap[row['Item Code']] = {
                        code: row['Item Code'],
                        description: row['Item Description'],
                        qty_req: 0,
                        qty_scan: 0,
                        order_line: row['Order Line']
                    };
                }
                itemsMap[row['Item Code']].qty_req += parseFloat(row['Qty']);
            });

            setAuditItems(Object.values(itemsMap));
            setCurrentOrder({
                orderNumber: oNum,
                despatchNumber: dNum,
                customerName: data[0]['Customer Name']
            });
            setStep('audit');

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- Audit Logic ---
    const handleScanItem = (e) => {
        e.preventDefault();
        if (!itemInput) return;

        const code = itemInput.toUpperCase();
        // Find item
        const index = auditItems.findIndex(i => i.code === code);

        if (index === -1) {
            // Item not in order!
            // Depending on logic, maybe add as extra or show error.
            // Legacy showed error or allowed adding extra? 
            // Usually strict audit means show error.
            setError(`Item ${code} no pertenece a este pedido.`);
            // Or add it dynamically if extra allowed. Let's assume strict for now.
            // But usually we might want to track extra items. 
            // Let's ask user quantity directly for found item.
        } else {
            setSelectedItemIndex(index);
            setQuantityModalOpen(true);
            setTempQuantity(''); // Clear previous
            setTimeout(() => document.getElementById('qty-input-modal').focus(), 100);
        }
        setItemInput('');
    };

    const confirmQuantity = () => {
        if (selectedItemIndex === null) return;

        const qty = parseInt(tempQuantity);
        if (isNaN(qty)) return;

        const newItems = [...auditItems];
        newItems[selectedItemIndex].qty_scan += qty;
        setAuditItems(newItems);

        setQuantityModalOpen(false);
        setSelectedItemIndex(null);
        setTempQuantity('');
        setMessage(`Agregado ${qty} a ${newItems[selectedItemIndex].code}`);
    };

    const handleFinalize = async () => {
        // Here we could ask for total packages
        const packs = prompt("Ingrese cantidad total de bultos/paquetes:", "0");
        if (packs === null) return; // Cancelled

        const totalPackages = parseInt(packs) || 0;

        setLoading(true);
        // Calculate status
        const hasDiff = auditItems.some(i => i.qty_scan !== i.qty_req);
        const status = hasDiff ? 'Con Diferencia' : 'Completo';

        const payload = {
            order_number: currentOrder.orderNumber,
            despatch_number: currentOrder.despatchNumber,
            customer_name: currentOrder.customerName,
            status: status,
            packages: totalPackages,
            items: auditItems
        };

        try {
            const res = await fetch('http://localhost:8000/api/save_picking_audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Error al guardar auditoría");

            alert("Auditoría Guardada Exitosamente");
            navigate('/view_picking_audits'); // Go to history

        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">

            {step === 'load' && (
                <div className="grid gap-8">
                    {/* Load Form */}
                    <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-600">
                        <h2 className="text-xl font-bold mb-4">Cargar Pedido</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                className="p-2 border rounded"
                                placeholder="Order Number"
                                value={orderInput}
                                onChange={e => setOrderInput(e.target.value)}
                            />
                            <input
                                className="p-2 border rounded"
                                placeholder="Despatch Number"
                                value={despatchInput}
                                onChange={e => setDespatchInput(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => handleLoadOrder(orderInput, despatchInput)}
                            disabled={loading}
                            className="mt-4 w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Cargando...' : 'Cargar Pedido'}
                        </button>
                        {error && <p className="text-red-500 mt-2">{error}</p>}
                    </div>

                    {/* Tracking Table */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h3 className="text-lg font-bold mb-4 flex justify-between items-center">
                            Pedidos Disponibles
                            <button onClick={fetchTracking} className="text-sm bg-gray-200 px-3 py-1 rounded">Actualizar</button>
                        </h3>
                        <div className="overflow-x-auto max-h-64">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Despatch</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Líneas</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {trackingOrders.map((o, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-sm">{o.order_number}</td>
                                            <td className="px-4 py-2 text-sm">{o.despatch_number}</td>
                                            <td className="px-4 py-2 text-sm truncate max-w-xs">{o.customer_name}</td>
                                            <td className="px-4 py-2 text-sm text-center">{o.total_lines}</td>
                                            <td className="px-4 py-2 text-center">
                                                <button
                                                    onClick={() => handleLoadOrder(o.order_number, o.despatch_number)}
                                                    className="text-blue-600 hover:text-blue-900 font-bold text-sm"
                                                >
                                                    Auditar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {step === 'audit' && currentOrder && (
                <div className="space-y-6">
                    {/* Header Info */}
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500 flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold">{currentOrder.customerName}</h1>
                            <p className="text-gray-600">Orden: {currentOrder.orderNumber} / {currentOrder.despatchNumber}</p>
                        </div>
                        <button onClick={() => setStep('load')} className="text-gray-500 hover:text-gray-700">Cambiar Pedido</button>
                    </div>

                    {/* Scan Form */}
                    <form onSubmit={handleScanItem} className="flex gap-2">
                        <input
                            className="flex-grow p-3 border rounded text-lg shadow-sm"
                            placeholder="Escanear Ítem..."
                            value={itemInput}
                            onChange={e => setItemInput(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" className="bg-gray-800 text-white px-6 py-2 rounded font-bold hover:bg-black">
                            OK
                        </button>
                    </form>
                    {error && <div className="bg-red-100 text-red-800 p-3 rounded">{error}</div>}
                    {message && <div className="bg-green-100 text-green-800 p-3 rounded">{message}</div>}

                    {/* Items Table */}
                    <div className="bg-white shadow rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Req</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Scan</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Dif</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {auditItems.map((item, idx) => {
                                    const dif = item.qty_scan - item.qty_req;
                                    return (
                                        <tr key={idx} className={dif === 0 && item.qty_scan > 0 ? 'bg-green-50' : dif !== 0 && item.qty_scan > 0 ? 'bg-red-50' : ''}>
                                            <td className="px-4 py-2">
                                                <div className="font-bold text-gray-900">{item.code}</div>
                                                <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                                            </td>
                                            <td className="px-4 py-2 text-center font-bold text-gray-700">{item.qty_req}</td>
                                            <td className="px-4 py-2 text-center font-bold text-blue-600">{item.qty_scan}</td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${dif === 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                                    {dif > 0 ? `+${dif}` : dif}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <button
                        onClick={handleFinalize}
                        disabled={loading}
                        className="w-full bg-green-600 text-white font-bold py-4 rounded shadow-lg text-xl hover:bg-green-700 transition-colors"
                    >
                        {loading ? 'Guardando...' : 'FINALIZAR AUDITORÍA'}
                    </button>
                </div>
            )}

            {/* Quantity Modal */}
            {quantityModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-80">
                        <h3 className="text-lg font-bold mb-4">{auditItems[selectedItemIndex]?.code}</h3>
                        <p className="mb-2 text-sm text-gray-600">{auditItems[selectedItemIndex]?.description}</p>
                        <label className="block text-sm font-bold mb-1">Cantidad Alistada:</label>
                        <input
                            id="qty-input-modal"
                            type="number"
                            className="w-full border p-2 rounded text-2xl text-center mb-4"
                            value={tempQuantity}
                            onChange={e => setTempQuantity(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && confirmQuantity()}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setQuantityModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
                            <button onClick={confirmQuantity} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PickingAudit;
