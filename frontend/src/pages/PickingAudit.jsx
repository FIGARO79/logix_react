import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';

// Sound effects using Web Audio API
const createBeep = (frequency, duration) => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = frequency > 600 ? 'sine' : 'square';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        console.error("Audio error", e);
    }
};

const playSuccess = () => createBeep(800, 0.1);
const playError = () => createBeep(200, 0.2);

const PickingAudit = () => {
    const { setTitle } = useOutletContext();

    // -- State --
    // Load Section
    const [orderNumber, setOrderNumber] = useState('');
    const [despatchNumber, setDespatchNumber] = useState('');
    const [loadingOrder, setLoadingOrder] = useState(false);
    const [trackingData, setTrackingData] = useState([]);

    // Audit Section
    const [auditActive, setAuditActive] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [orderItems, setOrderItems] = useState([]);

    // Scanning
    const [itemCodeInput, setItemCodeInput] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);

    // Modals & Finalize
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showPackagesModal, setShowPackagesModal] = useState(false);
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [packagesCount, setPackagesCount] = useState('');
    const [packageAssignments, setPackageAssignments] = useState({}); // { item_code: { pkg_index: qty } }

    useEffect(() => {
        setTitle("Logix - Chequeo de Picking");
        loadTrackingData();
    }, [setTitle]);

    // Initialize assignments when entering assignment modal
    const prepareAssignment = () => {
        const count = parseInt(packagesCount);
        if (!count || count <= 0) {
            submitAudit(); // No packages, just submit
            return;
        }

        // Init structure: { "ITEM01": { 1: 0, 2: 0 }, ... }
        const initialAssignments = {};
        orderItems.forEach(item => {
            const row = {};
            for (let i = 1; i <= count; i++) {
                row[i] = 0;
            }
            // Auto-assign to box 1 if only 1 box? Optional, let's keep it 0 for explicit user input
            // OR if only 1 box, pre-fill it?
            if (count === 1) {
                row[1] = item.qty_scan;
            }
            initialAssignments[item.code] = row;
        });
        setPackageAssignments(initialAssignments);
        setShowPackagesModal(false);
        setShowAssignmentModal(true);
    };

    // -- API Calls --

    const loadTrackingData = async () => {
        try {
            const res = await fetch('/api/picking/tracking', { credentials: 'include' });
            if (res.ok) {
                setTrackingData(await res.json());
            }
        } catch (e) { console.error(e); }
    };

    const handleLoadOrder = async () => {
        if (!orderNumber || !despatchNumber) {
            toast.error("Ingrese Order y Despatch Number");
            return;
        }
        setLoadingOrder(true);
        try {
            const res = await fetch(`/api/picking/order/${orderNumber}/${despatchNumber}`, { credentials: 'include' }); // Matches picking.py endpoint
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    setCustomerName(data[0]['Customer Name']);
                    // Map CSV columns to internal state
                    const items = data.map(row => ({
                        code: row['Item Code'],
                        description: row['Item Description'],
                        order_line: row['Order Line'],
                        qty_req: parseInt(row['Qty'] || 0),
                        qty_scan: 0,
                        difference: 0
                    }));
                    setOrderItems(items);
                    setAuditActive(true);
                    toast.success("Pedido cargado");
                } else {
                    toast.error("Pedido vacio o no encontrado");
                }
            } else {
                toast.error("Pedido no encontrado");
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setLoadingOrder(false);
        }
    };

    const handleReset = () => {
        setAuditActive(false);
        setOrderItems([]);
        setOrderNumber('');
        setDespatchNumber('');
        setCustomerName('');
        setShowAssignmentModal(false);
        setPackageAssignments({});
        setPackagesCount('');
        loadTrackingData();
    };

    const handleAssignmentChange = (itemCode, pkgNum, value) => {
        const val = parseInt(value) || 0;
        setPackageAssignments(prev => ({
            ...prev,
            [itemCode]: {
                ...prev[itemCode],
                [pkgNum]: val
            }
        }));
    };

    // -- Audit Logic --

    const handleScan = (code) => {
        const cleanCode = code.trim().toUpperCase();
        if (!cleanCode) return;

        // Find item in list
        // Prioridad: Buscar primero una línea que NO esté completa
        let itemIndex = orderItems.findIndex(i => i.code === cleanCode && i.qty_scan < i.qty_req);

        // Si todas están completas (o no encontró), buscar la primera coincidencia general para sumar el exceso
        if (itemIndex === -1) {
            itemIndex = orderItems.findIndex(i => i.code === cleanCode);
        }

        if (itemIndex > -1) {
            const newItems = [...orderItems];
            const item = newItems[itemIndex];

            // Increment scan
            item.qty_scan += 1;
            item.difference = item.qty_scan - item.qty_req;

            setOrderItems(newItems);
            setItemCodeInput('');

            // Feedback
            if (item.qty_scan <= item.qty_req) {
                playSuccess();
                toast.success(`Leído: ${item.code}`);
            } else {
                playError(); // Over-scan warning
                toast.warning(`Exceso: ${item.code}`);
            }
        } else {
            playError();
            toast.error(`Item NO pertenece al pedido: ${cleanCode}`);
        }
    };

    const handleFinalize = () => {
        // Check differences
        const hasDifferences = orderItems.some(i => i.qty_scan !== i.qty_req);
        if (hasDifferences) {
            setShowConfirmModal(true);
        } else {
            setShowPackagesModal(true);
        }
    };

    const submitAudit = async (statusOverride) => {
        const payload = {
            order_number: orderNumber,
            despatch_number: despatchNumber,
            customer_name: customerName,
            status: statusOverride || (orderItems.some(i => i.qty_scan !== i.qty_req) ? 'Con Diferencia' : 'Completo'),
            items: orderItems.map(i => ({
                code: i.code,
                description: i.description,
                order_line: i.order_line,
                qty_req: i.qty_req,
                qty_scan: i.qty_scan
            })),
            packages: parseInt(packagesCount || 0),
            packages_assignment: packageAssignments
        };

        try {
            const res = await fetch('/api/save_picking_audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success("Auditoría Finalizada Correctamente");
                handleReset();
                setShowConfirmModal(false);
                setShowPackagesModal(false);
                setShowAssignmentModal(false);
                setPackagesCount('');
            } else {
                const err = await res.json();
                toast.error(err.detail || "Error al guardar");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    // -- Scanner Effect --
    // -- Scanner Effect --
    // -- Scanner Logic --
    // The previous manual useEffect is removed in favor of ScannerModal


    // -- Render --

    if (auditActive) {
        return (
            <div className="container-wrapper max-w-5xl mx-auto px-4 py-4">
                <ToastContainer position="top-right" autoClose={2000} />
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                    <div className="flex justify-between items-start mb-6 border-b pb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Auditoría en Curso</h1>
                            <p className="text-gray-600">Orden: <span className="font-mono font-bold text-black">{orderNumber} / {despatchNumber}</span></p>
                            <p className="text-gray-600">Cliente: <span className="font-bold text-black">{customerName}</span></p>
                        </div>
                        <button onClick={handleReset} className="btn-sap btn-secondary text-xs">Cancelar / Salir</button>
                    </div>

                    {/* Scan Input */}
                    <div className="mb-6 flex gap-2">
                        <div className="flex-grow">
                            <label className="form-label">Item Code (Scan)</label>
                            <input
                                type="text"
                                value={itemCodeInput}
                                onChange={e => setItemCodeInput(e.target.value.toUpperCase())}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleScan(itemCodeInput);
                                    }
                                }}
                                className="w-full uppercase"
                                placeholder="Escanear o escribir..."
                                autoFocus
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                onClick={() => setScannerOpen(true)}
                                className="btn-sap btn-secondary h-[38px] px-3"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                            </button>
                            <button onClick={() => handleScan(itemCodeInput)} className="btn-sap btn-secondary h-[38px]">Buscar</button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-gray-300 rounded mb-6">
                        <table className="w-full text-left sap-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Descripción</th>
                                    <th className="text-center w-16">Req</th>
                                    <th className="text-center w-16">Scan</th>
                                    <th className="text-center w-16">Dif</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderItems.map((item, idx) => {
                                    const diff = item.qty_scan - item.qty_req;
                                    const isComplete = item.qty_scan === item.qty_req;
                                    const isOver = item.qty_scan > item.qty_req;

                                    return (
                                        <tr key={idx} className={isComplete ? 'bg-green-50' : isOver ? 'bg-red-50' : ''}>
                                            <td className="font-medium">{item.code}</td>
                                            <td className="text-sm truncate max-w-[200px]">{item.description}</td>
                                            <td className="text-center">{item.qty_req}</td>
                                            <td className="text-center font-bold">{item.qty_scan}</td>
                                            <td className={`text-center font-bold ${diff !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {diff > 0 ? `+${diff}` : diff}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <button onClick={handleFinalize} className="btn-sap btn-primary w-full py-3 text-lg">
                        Finalizar Auditoría
                    </button>
                </div>

                {/* Modals */}
                {/* Scanner Modal */}
                {scannerOpen && (
                    <ScannerModal
                        title="Escanear Código"
                        onScan={(code) => {
                            setScannerOpen(false);
                            handleScan(code);
                        }}
                        onClose={() => setScannerOpen(false)}
                    />
                )}

                {/* Confirmation Modal */}
                {showConfirmModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                            <h3 className="text-lg font-bold text-yellow-600 mb-2">Diferencias Detectadas</h3>
                            <p className="mb-4 text-gray-700">Hay ítems con diferencias. ¿Desea finalizar con errores?</p>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowConfirmModal(false)} className="btn-sap btn-secondary">Cancelar</button>
                                <button onClick={() => { setShowConfirmModal(false); setShowPackagesModal(true); }} className="btn-sap btn-primary bg-yellow-500 border-yellow-600">Sí, Continuar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Packages Modal */}
                {showPackagesModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                            <h3 className="text-lg font-bold mb-2">Cantidad de Bultos</h3>
                            <p className="mb-2 text-gray-600">Ingrese total de paquetes:</p>
                            <input
                                type="number"
                                value={packagesCount}
                                onChange={e => setPackagesCount(e.target.value)}
                                className="mb-4 text-center text-xl"
                                autoFocus
                                min="0"
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowPackagesModal(false)} className="btn-sap btn-secondary">Cancelar</button>
                                <button onClick={() => prepareAssignment()} className="btn-sap btn-primary bg-blue-600 border-blue-700 text-white">Continuar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Assignment Modal */}
                {showAssignmentModal && (
                    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                            <h3 className="text-lg font-bold mb-4">Distribuir Ítems en Bultos</h3>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="p-2 text-left border">Item</th>
                                            <th className="p-2 text-center border w-24">Total Scan</th>
                                            {Array.from({ length: parseInt(packagesCount) || 1 }).map((_, i) => (
                                                <th key={i} className="p-2 text-center border w-20">Bulto {i + 1}</th>
                                            ))}
                                            <th className="p-2 text-center border w-24">Asignado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderItems.map(item => {
                                            const assignments = packageAssignments[item.code] || {};
                                            const totalAssigned = Object.values(assignments).reduce((a, b) => a + b, 0);
                                            const isMatch = totalAssigned === item.qty_scan;

                                            // Only show items that have been scanned
                                            if (item.qty_scan === 0) return null;

                                            return (
                                                <tr key={item.code} className="border-b hover:bg-gray-50">
                                                    <td className="p-2 border font-medium">
                                                        {item.code}
                                                        <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                                                    </td>
                                                    <td className="p-2 text-center border font-bold">{item.qty_scan}</td>
                                                    {Array.from({ length: parseInt(packagesCount) || 1 }).map((_, i) => (
                                                        <td key={i} className="p-1 border text-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                className="w-16 text-center border rounded p-1"
                                                                value={assignments[i + 1] || 0}
                                                                onChange={(e) => handleAssignmentChange(item.code, i + 1, e.target.value)}
                                                                onFocus={(e) => e.target.select()}
                                                            />
                                                        </td>
                                                    ))}
                                                    <td className={`p-2 text-center border font-bold ${isMatch ? 'text-green-600' : 'text-red-600'}`}>
                                                        {totalAssigned}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setShowAssignmentModal(false)} className="btn-sap btn-secondary">Atrás</button>
                                <button onClick={() => submitAudit()} className="btn-sap btn-success bg-green-600 border-green-700 text-white">
                                    Guardar y Finalizar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Load Order View
    return (
        <div className="container-wrapper max-w-3xl mx-auto px-4 py-8">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="bg-white p-8 rounded-lg shadow-xl border border-gray-200">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Cargar Pedido Picking</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="form-label">Order Number</label>
                        <input
                            type="text"
                            value={orderNumber}
                            onChange={e => setOrderNumber(e.target.value)}
                            placeholder="Ej: 0043785"
                        />
                    </div>
                    <div>
                        <label className="form-label">Despatch Number</label>
                        <input
                            type="text"
                            value={despatchNumber}
                            onChange={e => setDespatchNumber(e.target.value)}
                            placeholder="Ej: 00"
                        />
                    </div>
                </div>

                <button
                    onClick={handleLoadOrder}
                    disabled={loadingOrder}
                    className="btn-sap btn-primary w-full py-3 mb-8 text-base shadow-sm"
                >
                    {loadingOrder ? 'Cargando...' : 'Comenzar Auditoría'}
                </button>

                {/* Tracking Table */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-semibold text-gray-700">Pedidos Recientes</h3>
                        <button onClick={loadTrackingData} className="text-blue-600 text-sm hover:underline">Actualizar</button>
                    </div>
                    <div className="border border-gray-200 rounded overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-sm sap-table">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Despatch</th>
                                    <th>Cliente</th>
                                    <th>Líneas</th>
                                    <th>Fecha</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trackingData.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center p-4 text-gray-500">No hay pedidos recientes</td></tr>
                                ) : (
                                    trackingData.map((t, idx) => (
                                        <tr key={idx} className="cursor-pointer hover:bg-blue-50" onClick={() => {
                                            setOrderNumber(t.order_number);
                                            setDespatchNumber(t.despatch_number);
                                        }}>
                                            <td className="font-medium">{t.order_number}</td>
                                            <td>{t.despatch_number}</td>
                                            <td className="truncate max-w-[150px]">{t.customer_name}</td>
                                            <td className="text-center font-bold text-blue-600">{t.total_lines}</td>
                                            <td className="text-gray-500 text-xs">{t.print_date}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PickingAudit;