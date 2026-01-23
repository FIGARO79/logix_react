import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

const PickingAudit = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext();

    useEffect(() => { setTitle("Chequeo de Picking"); }, []);

    // --- Estados ---
    const [step, setStep] = useState('load'); // 'load' | 'audit'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [trackingOrders, setTrackingOrders] = useState([]);

    // Inputs Carga
    const [orderInput, setOrderInput] = useState('');
    const [despatchInput, setDespatchInput] = useState('');

    // Datos Auditoría
    const [currentOrder, setCurrentOrder] = useState(null);
    const [auditItems, setAuditItems] = useState([]);
    const [itemInput, setItemInput] = useState('');

    // --- Modales ---
    const [qtyModal, setQtyModal] = useState({ open: false, index: null, value: '' });
    const [confirmModal, setConfirmModal] = useState(false); // Modal "Confirmar con diferencias"
    const [packagesModal, setPackagesModal] = useState({ open: false, value: '' }); // Modal "Bultos"

    // --- Carga Inicial (Tracking) ---
    useEffect(() => { fetchTracking(); }, []);

    const fetchTracking = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/picking/tracking');
            if (res.ok) setTrackingOrders(await res.json());
        } catch (e) { console.error(e); }
    };

    // --- Lógica: Cargar Pedido ---
    const handleLoadOrder = async (oNum, dNum) => {
        if (!oNum || !dNum) return;
        setLoading(true); setError(null);
        try {
            const res = await fetch(`http://localhost:8000/api/picking/order/${oNum}/${dNum}`);
            if (!res.ok) throw new Error('Pedido no encontrado o error en servidor');

            const data = await res.json();
            if (data.length === 0) throw new Error('El pedido no tiene líneas');

            // Agrupar items (mismo código = misma línea visual)
            const itemsMap = {};
            data.forEach(row => {
                const code = row['Item Code'];
                if (!itemsMap[code]) {
                    itemsMap[code] = {
                        code: code,
                        description: row['Item Description'],
                        qty_req: 0,
                        qty_scan: 0,
                        order_line: row['Order Line']
                    };
                }
                itemsMap[code].qty_req += parseFloat(row['Qty']);
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

    // --- Lógica: Escanear Item ---
    const handleScan = (e) => {
        e.preventDefault();
        const code = itemInput.trim().toUpperCase();
        if (!code) return;

        const idx = auditItems.findIndex(i => i.code === code);
        if (idx === -1) {
            setError(`Item ${code} no pertenece al pedido.`);
            // Reproducir sonido Error
        } else {
            // Abrir modal de cantidad para el item encontrado
            setQtyModal({ open: true, index: idx, value: '' });
            setError(null);
        }
        setItemInput('');
    };

    const submitQty = (e) => {
        e.preventDefault();
        const q = parseInt(qtyModal.value);
        if (isNaN(q) || q < 0) return;

        const newItems = [...auditItems];
        const item = newItems[qtyModal.index];

        // Validación opcional: No escanear más de lo requerido? (El original avisaba pero dejaba)
        if (item.qty_scan + q > item.qty_req) {
            if (!confirm(`Estás excediendo la cantidad requerida (${item.qty_req}). ¿Continuar?`)) return;
        }

        item.qty_scan += q;
        setAuditItems(newItems);
        setQtyModal({ open: false, index: null, value: '' });

        // Auto check si completó
        if (item.qty_scan === item.qty_req) setMessage(`Item ${item.code} COMPLETADO.`);
    };

    // --- Lógica: Finalizar ---
    const requestFinalize = () => {
        const hasDiff = auditItems.some(i => i.qty_scan !== i.qty_req);
        if (hasDiff) {
            setConfirmModal(true); // "Hay diferencias, ¿seguro?"
        } else {
            setPackagesModal({ open: true, value: '' }); // Directo a bultos
        }
    };

    const confirmDifferences = () => {
        setConfirmModal(false);
        setPackagesModal({ open: true, value: '' }); // Ir a bultos tras confirmar
    };

    const submitFinalize = async (e) => {
        e.preventDefault();
        const packs = parseInt(packagesModal.value);
        if (isNaN(packs) || packs < 1) {
            alert("Ingrese al menos 1 bulto.");
            return;
        }

        setLoading(true);
        const hasDiff = auditItems.some(i => i.qty_scan !== i.qty_req);
        const status = hasDiff ? 'Con Diferencia' : 'Completo';

        try {
            const res = await fetch('http://localhost:8000/api/save_picking_audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_number: currentOrder.orderNumber,
                    despatch_number: currentOrder.despatchNumber,
                    customer_name: currentOrder.customerName,
                    status: status,
                    packages: packs,
                    items: auditItems
                })
            });

            if (!res.ok) throw new Error("Error al guardar");

            alert("¡Auditoría Guardada!");
            navigate('/view_picking_audits');
        } catch (err) {
            setError(err.message);
            setPackagesModal({ ...packagesModal, open: false }); // Cerrar modal si falla
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-6 font-sans">
            {step === 'load' && (
                <div className="grid gap-6">
                    {/* Carga */}
                    <div className="bg-white p-6 rounded shadow border-l-4 border-blue-600">
                        <h2 className="text-xl font-bold mb-4 text-gray-800">1. Cargar Pedido</h2>
                        <div className="flex gap-4">
                            <input className="border p-2 rounded w-1/2" placeholder="Order Number" value={orderInput} onChange={e => setOrderInput(e.target.value)} />
                            <input className="border p-2 rounded w-1/2" placeholder="Despatch Number" value={despatchInput} onChange={e => setDespatchInput(e.target.value)} />
                        </div>
                        <button onClick={() => handleLoadOrder(orderInput, despatchInput)} disabled={loading} className="mt-4 w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700">
                            {loading ? 'Cargando...' : 'Cargar Pedido'}
                        </button>
                    </div>
                    {/* Tabla Tracking */}
                    <div className="bg-white p-6 rounded shadow">
                        <h3 className="text-lg font-bold mb-4">Pedidos Recientes</h3>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 uppercase"><tr className="border-b"><th className="p-2">Order</th><th className="p-2">Despatch</th><th className="p-2">Cliente</th><th className="p-2">Acción</th></tr></thead>
                            <tbody>
                                {trackingOrders.map((o, i) => (
                                    <tr key={i} className="border-b hover:bg-gray-50">
                                        <td className="p-2">{o.order_number}</td>
                                        <td className="p-2">{o.despatch_number}</td>
                                        <td className="p-2">{o.customer_name}</td>
                                        <td className="p-2"><button onClick={() => handleLoadOrder(o.order_number, o.despatch_number)} className="text-blue-600 font-bold hover:underline">Auditar</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {step === 'audit' && (
                <div>
                    {/* Header Pedido */}
                    <div className="bg-white p-4 rounded shadow border-l-4 border-yellow-500 mb-6 flex justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">{currentOrder.customerName}</h1>
                            <p className="text-gray-600 font-mono">OD: {currentOrder.orderNumber} | DP: {currentOrder.despatchNumber}</p>
                        </div>
                        <button onClick={() => setStep('load')} className="text-gray-500 underline">Cambiar</button>
                    </div>

                    {/* Barra Escáner */}
                    <form onSubmit={handleScan} className="flex gap-2 mb-4">
                        <input autoFocus className="flex-grow border-2 border-gray-300 rounded p-3 text-lg" placeholder="Escanear ITEM CODE..." value={itemInput} onChange={e => setItemInput(e.target.value)} />
                        <button type="submit" className="bg-gray-800 text-white px-6 font-bold rounded">OK</button>
                    </form>

                    {error && <div className="bg-red-100 text-red-800 p-3 rounded mb-4 font-bold">⚠️ {error}</div>}
                    {message && <div className="bg-green-100 text-green-800 p-3 rounded mb-4 font-bold">✅ {message}</div>}

                    {/* Tabla Items */}
                    <div className="bg-white shadow rounded overflow-hidden mb-6">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="p-3 text-left">Item</th>
                                    <th className="p-3 text-center">Línea</th>
                                    <th className="p-3 text-center">Req</th>
                                    <th className="p-3 text-center">Scan</th>
                                    <th className="p-3 text-center">Dif</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {auditItems.map((item, i) => {
                                    const dif = item.qty_scan - item.qty_req;
                                    const rowClass = dif === 0 && item.qty_scan > 0 ? 'bg-green-50' : dif !== 0 && item.qty_scan > 0 ? 'bg-red-50' : '';
                                    return (
                                        <tr key={i} className={`hover:bg-gray-50 ${rowClass}`}>
                                            <td className="p-3">
                                                <div className="font-bold text-gray-800">{item.code}</div>
                                                <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                                            </td>
                                            <td className="p-3 text-center text-xs font-mono text-gray-500">{item.order_line}</td>
                                            <td className="p-3 text-center font-bold text-gray-600">{item.qty_req}</td>
                                            <td className="p-3 text-center font-bold text-blue-600 text-lg">{item.qty_scan}</td>
                                            <td className="p-3 text-center font-bold">
                                                <span className={dif === 0 ? 'text-green-600' : 'text-red-600'}>{dif > 0 ? `+${dif}` : dif}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <button onClick={requestFinalize} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded text-xl shadow-lg transition-transform transform active:scale-95">
                        {loading ? 'Guardando...' : 'FINALIZAR AUDITORÍA'}
                    </button>
                </div>
            )}

            {/* Modal Cantidad */}
            {qtyModal.open && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <form onSubmit={submitQty} className="bg-white p-6 rounded-lg shadow-2xl w-80">
                        <h3 className="font-bold text-lg mb-2 text-gray-800">{auditItems[qtyModal.index].code}</h3>
                        <p className="text-sm text-gray-500 mb-4 truncate">{auditItems[qtyModal.index].description}</p>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Cantidad Alistada</label>
                        <input autoFocus type="number" className="w-full border-2 border-blue-500 rounded p-2 text-2xl text-center mb-6 font-bold"
                            value={qtyModal.value} onChange={e => setQtyModal({ ...qtyModal, value: e.target.value })} />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setQtyModal({ open: false, index: null, value: '' })} className="px-4 py-2 bg-gray-200 rounded font-bold text-gray-600">Cancelar</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Confirmar</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal Confirmación Diferencias */}
            {confirmModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-2xl w-96 border-t-4 border-yellow-500">
                        <h3 className="font-bold text-xl mb-4 text-yellow-700">⚠️ Diferencias Detectadas</h3>
                        <p className="text-gray-600 mb-6">Hay items faltantes o sobrantes en el picking. ¿Deseas finalizar de todos modos?</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setConfirmModal(false)} className="px-4 py-2 bg-gray-200 rounded font-bold text-gray-700">Revisar</button>
                            <button onClick={confirmDifferences} className="px-4 py-2 bg-yellow-500 text-white rounded font-bold hover:bg-yellow-600">Sí, Finalizar con Error</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Bultos */}
            {packagesModal.open && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <form onSubmit={submitFinalize} className="bg-white p-6 rounded-lg shadow-2xl w-80 border-t-4 border-green-500">
                        <h3 className="font-bold text-lg mb-4 text-gray-800">📦 Total de Bultos</h3>
                        <input autoFocus type="number" min="1" className="w-full border-2 border-gray-300 rounded p-2 text-3xl text-center mb-6 font-bold"
                            value={packagesModal.value} onChange={e => setPackagesModal({ ...packagesModal, value: e.target.value })} placeholder="0" />
                        <button type="submit" className="w-full py-3 bg-green-600 text-white rounded font-bold text-lg hover:bg-green-700">Guardar y Salir</button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default PickingAudit;