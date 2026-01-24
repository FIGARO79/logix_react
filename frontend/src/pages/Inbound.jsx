import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import '../styles/Label.css';

const Inbound = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Logix - Inbound"); }, [setTitle]);
    // ... (rest of states)
    // --- Estados del Formulario ---
    const [importRef, setImportRef] = useState('');
    const [waybill, setWaybill] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState('');
    const [relocatedBin, setRelocatedBin] = useState('');

    // --- Estados de Datos ---
    const [itemData, setItemData] = useState(null);
    const [logs, setLogs] = useState([]);
    const [versions, setVersions] = useState([]);

    // --- Estados de UI ---
    const [loading, setLoading] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [qrImage, setQrImage] = useState(null);
    const [editId, setEditId] = useState(null); // ID si estamos editando

    // --- Refs ---
    const scannerRef = useRef(null);
    const quantityRef = useRef(null);

    // Carga inicial
    useEffect(() => {
        loadLogs();
        loadVersions();
    }, []);

    // Generar QR para la etiqueta cuando cambia el item
    useEffect(() => {
        if (itemData?.itemCode) {
            QRCode.toDataURL(itemData.itemCode, { width: 96, margin: 1 })
                .then(url => setQrImage(url))
                .catch(err => console.error(err));
        } else {
            setQrImage(null);
        }
    }, [itemData]);

    // --- Funciones API ---

    const loadLogs = async (version = '') => {
        try {
            const url = version
                ? `http://localhost:8000/api/get_logs?version_date=${version}`
                : `http://localhost:8000/api/get_logs`;
            const res = await fetch(url);
            if (res.ok) setLogs(await res.json());
        } catch (e) { console.error("Error loading logs", e); }
    };

    const loadVersions = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/inbound/versions');
            if (res.ok) setVersions(await res.json());
        } catch (e) { console.error(e); }
    };

    const findItem = async () => {
        if (!itemCode || !importRef) {
            alert("Ingrese Import Reference e Item Code");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:8000/api/find_item/${encodeURIComponent(itemCode)}/${encodeURIComponent(importRef)}`);
            const data = await res.json();
            if (res.ok) {
                setItemData(data);
                // Si estamos editando, mantenemos la cantidad del log, si no, vacía o 1
                if (!editId && quantity === '') setQuantity('1');
                quantityRef.current?.focus();
            } else {
                alert(data.error || "Item no encontrado");
                setItemData(null);
            }
        } catch (e) {
            alert("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLog = async (e) => {
        e.preventDefault();
        if (!itemData) return alert("Busque un item primero");

        const payload = {
            importReference: importRef.toUpperCase(),
            waybill: waybill.toUpperCase(),
            itemCode: itemData.itemCode,
            quantity: parseInt(quantity),
            relocatedBin: relocatedBin.toUpperCase()
        };

        try {
            let res;
            if (editId) {
                // Endpoint para actualizar
                res = await fetch(`http://localhost:8000/api/inbound/log/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        waybill: payload.waybill,
                        qtyReceived: payload.quantity,
                        relocatedBin: payload.relocatedBin
                    })
                });
            } else {
                // Endpoint para crear
                res = await fetch(`http://localhost:8000/api/add_log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                loadLogs();
                resetForm();
            } else {
                const err = await res.json();
                alert(err.detail || err.error || "Error al guardar");
            }
        } catch (e) { alert("Error de conexión"); }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Eliminar registro?")) return;
        try {
            await fetch(`http://localhost:8000/api/delete_log/${id}`, { method: 'DELETE' });
            loadLogs();
        } catch (e) { alert("Error"); }
    };

    const handleArchive = async () => {
        if (!confirm("¿Archivar registros actuales y limpiar base?")) return;
        try {
            await fetch(`http://localhost:8000/api/inbound/archive`, { method: 'POST' });
            loadLogs();
            loadVersions();
        } catch (e) { alert("Error"); }
    };

    // --- Helpers UI ---
    const resetForm = () => {
        setEditId(null);
        setItemCode('');
        setQuantity('');
        setRelocatedBin('');
        setItemData(null);
        // Mantener Import Ref y Waybill por comodidad (UX legacy)
    };

    const startEdit = (log) => {
        setEditId(log.id);
        setImportRef(log.importReference);
        setWaybill(log.waybill);
        setItemCode(log.itemCode);
        setQuantity(log.qtyReceived);
        setRelocatedBin(log.relocatedBin || '');
        // Buscar datos del item para llenar la UI
        fetch(`http://localhost:8000/api/find_item/${encodeURIComponent(log.itemCode)}/${encodeURIComponent(log.importReference)}`)
            .then(r => r.json())
            .then(data => setItemData(data));
    };

    // Escáner
    // Escáner
    useEffect(() => {
        if (scannerOpen) {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;
            html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 250 },
                (text) => {
                    setItemCode(text.toUpperCase());

                    // Stop first, then UI updates
                    html5QrCode.stop().then(() => {
                        html5QrCode.clear();
                        setScannerOpen(false);
                        scannerRef.current = null;
                        // Trigger search with the NEW code
                        setTimeout(() => checkAndFind(text.toUpperCase()), 200);
                    }).catch(console.error);
                },
                () => { }
            ).catch(err => {
                console.error(err);
                setScannerOpen(false);
                alert("No se pudo iniciar la cámara");
            });
        }

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(console.error);
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
                    alert("Flash no disponible");
                });
        }
    };

    // Helper wrapper to ensure state is fresh or passed directly
    const checkAndFind = (code) => {
        if (!code || !importRef) return; // Silent return if missing deps
        // Logic duplicated from findItem but accepts code arg
        setLoading(true);
        fetch(`http://localhost:8000/api/find_item/${encodeURIComponent(code)}/${encodeURIComponent(importRef)}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    setItemData(null);
                } else {
                    setItemData(data);
                    if (!editId && quantity === '') setQuantity('1');
                    quantityRef.current?.focus();
                }
            })
            .catch(() => alert("Error de conexión"))
            .finally(() => setLoading(false));
    };

    // Cálculos
    const diff = itemData ? (parseInt(quantity || 0) - (itemData.defaultQtyGrn || 0)) : 0;
    const totalWeight = itemData ? (parseFloat(itemData.weight || 0) * parseInt(quantity || 1)).toFixed(2) : 'N/A';

    return (
        <>
            <div className="container-wrapper px-4 py-4">
                <form onSubmit={handleSaveLog}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">

                        {/* COLUMNA IZQUIERDA: FORMULARIO */}
                        <div className="lg:col-span-2 bg-white p-4 rounded shadow border border-gray-200">
                            {/* Header Form */}
                            <div className="bg-gray-700 text-white px-3 py-2 -mx-4 -mt-4 mb-4 rounded-t">
                                <h1 className="text-sm font-semibold uppercase tracking-wide">Inbound - Recepción</h1>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Import Reference</label>
                                    <input type="text" value={importRef} onChange={e => setImportRef(e.target.value.toUpperCase())} placeholder="I.R." required disabled={!!editId} />
                                </div>
                                <div>
                                    <label className="form-label">Waybill</label>
                                    <input type="text" value={waybill} onChange={e => setWaybill(e.target.value.toUpperCase())} placeholder="W.B." required />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="form-label">Item Code</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={itemCode} onChange={e => setItemCode(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), findItem())}
                                            placeholder="Escanear o Escribir" required disabled={!!editId} />
                                        {!editId && (
                                            <>
                                                <button type="button" className="btn-sap btn-secondary" onClick={() => setScannerOpen(true)} title="Escanear">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                                                </button>
                                                <button type="button" className="btn-sap btn-secondary" onClick={findItem} disabled={loading}>
                                                    {loading ? '...' : '🔍'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="form-label">Item Description</label>
                                <div className="data-field">{itemData?.description || ''}</div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                                <div>
                                    <label className="form-label">Qty Received</label>
                                    <input type="number" ref={quantityRef} value={quantity} onChange={e => setQuantity(e.target.value)} required min="1" />
                                </div>
                                <div>
                                    <label className="form-label">Bin (Original)</label>
                                    <div className="data-field">{itemData?.binLocation || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">Relocate (New)</label>
                                    <input type="text" value={relocatedBin} onChange={e => setRelocatedBin(e.target.value.toUpperCase())} placeholder="(Opcional)" />
                                </div>
                                <div>
                                    <label className="form-label">Aditional Bins</label>
                                    <div className="data-field text-xs">{itemData?.aditionalBins || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">ABC Type</label>
                                    <div className="data-field">{itemData?.itemType || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">SIC Code</label>
                                    <div className="data-field">{itemData?.sicCode || ''}</div>
                                </div>
                            </div>

                            {/* Resumen Cantidades */}
                            <div className="bg-gray-50 p-4 border border-gray-300 rounded mb-4">
                                <h3 className="text-xs font-bold uppercase text-gray-700 border-b-2 border-blue-600 pb-1 mb-3">Resumen de Cantidades</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div><label className="form-label">Qty Received</label><div className="data-field">{quantity || 0}</div></div>
                                    <div><label className="form-label">Qty Expected (GRN)</label><div className="data-field">{itemData?.defaultQtyGrn || 0}</div></div>
                                    <div>
                                        <label className="form-label">Difference</label>
                                        <div className={`data-field font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-blue-600' : ''}`}>
                                            {diff > 0 ? `+${diff}` : diff}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button type="submit" className="btn-sap btn-primary w-60 h-10">
                                    {editId ? 'Guardar Cambios' : 'Añadir Registro'}
                                </button>
                                {editId && (
                                    <button type="button" onClick={resetForm} className="btn-sap btn-secondary w-60 h-10">
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: ETIQUETA (PREVIEW & PRINT) */}
                        <div className="lg:col-span-1">
                            <h2 className="text-lg font-semibold text-center mb-3">Vista Etiqueta</h2>

                            {/* Área de Impresión (clase label-print-area activada por CSS print) */}
                            <div className="label-print-area">
                                <div className="label-container">
                                    <div>
                                        <img src="/static/images/logoytpe_sandvik.png" alt="Sandvik" className="label-logo" />
                                        <p className="label-item-code">{itemData?.itemCode || 'ITEM CODE'}</p>
                                        <p className="label-item-description">{itemData?.description || 'Item Description'}</p>

                                        <div className="label-data-field">
                                            <span>Quantity Received</span>
                                            <span>{quantity || 1}</span>
                                        </div>
                                        <div className="label-data-field">
                                            <span>Product weight</span>
                                            <span>{totalWeight}</span>
                                        </div>
                                        <div className="label-data-field">
                                            <span>Bin Location</span>
                                            <span>{relocatedBin || itemData?.binLocation || 'BIN'}</span>
                                        </div>
                                        <div className="label-data-field">
                                            <span>Reception Date</span>
                                            <span>{new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</span>
                                        </div>
                                    </div>

                                    <div className="label-bottom-section">
                                        <p className="label-disclaimer">All trademarks and logotypes appearing on this label are owned by Sandvik Group</p>
                                        <div id="qrCodeContainer">
                                            {qrImage ? <img src={qrImage} alt="QR" /> : <span className="text-xs text-gray-400">QR Code</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button type="button" onClick={() => window.print()} className="btn-sap btn-primary w-full mt-4 h-10" disabled={!itemData}>
                                Imprimir Etiqueta
                            </button>
                        </div>
                    </div>
                </form>

                {/* TABLA DE REGISTROS */}
                <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden">
                    <div className="bg-gray-700 text-white px-4 py-2 flex justify-between items-center">
                        <h2 className="text-sm font-semibold">Registros de Inbound</h2>
                        <div className="flex gap-2">
                            <button onClick={() => window.location.href = '/update'} className="btn-sap btn-secondary toolbar-btn">Act. Archivos</button>
                            <select onChange={(e) => loadLogs(e.target.value)} className="h-8 text-black text-xs rounded border border-gray-300">
                                <option value="">-- Versión Actual --</option>
                                {versions.map(v => (
                                    <option key={v} value={v}>Archivado: {new Date(v).toLocaleString()}</option>
                                ))}
                            </select>
                            <button onClick={handleArchive} className="btn-sap bg-red-600 text-white border-red-700 hover:bg-red-700 toolbar-btn">Base Limpia</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse sap-table">
                            <thead>
                                <tr>
                                    <th>Ref</th>
                                    <th>Waybill</th>
                                    <th>Item Code</th>
                                    <th>Descripción</th>
                                    <th>Bin (Orig)</th>
                                    <th>Bin (New)</th>
                                    <th>Qty Rec</th>
                                    <th>Qty Exp</th>
                                    <th>Dif</th>
                                    <th>Hora</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr><td colSpan="11" className="text-center p-4 text-gray-500">No hay registros</td></tr>
                                ) : logs.map(log => (
                                    <tr key={log.id}>
                                        <td>{log.importReference}</td>
                                        <td>{log.waybill}</td>
                                        <td>{log.itemCode}</td>
                                        <td className="max-w-[200px] truncate" title={log.itemDescription}>{log.itemDescription}</td>
                                        <td>{log.binLocation}</td>
                                        <td>{log.relocatedBin}</td>
                                        <td>{log.qtyReceived}</td>
                                        <td>{log.qtyGrn}</td>
                                        <td className={log.difference < 0 ? 'text-red-600 font-bold' : log.difference > 0 ? 'text-blue-600 font-bold' : ''}>
                                            {log.difference}
                                        </td>
                                        <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                                        <td className="flex gap-1 justify-center">
                                            <button onClick={() => startEdit(log)} className="text-blue-600 hover:bg-blue-50 p-1 rounded">✎</button>
                                            <button onClick={() => handleDelete(log.id)} className="text-red-600 hover:bg-red-50 p-1 rounded">🗑</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal Scanner */}
            {scannerOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg relative">
                        <h3 className="text-center font-bold text-lg mb-4 text-gray-800">Apunta la cámara al código de barras</h3>
                        <div id="reader" className="rounded-lg overflow-hidden mb-4 border-2 border-gray-100"></div>

                        <div className="flex gap-4">
                            <button
                                onClick={toggleTorch}
                                className={`flex items-center justify-center w-14 h-12 rounded bg-[#34495e] hover:bg-[#2c3e50] text-white transition-colors ${torchOn ? 'ring-2 ring-yellow-400' : ''}`}
                                title={torchOn ? "Apagar Flash" : "Encender Flash"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M2 6a6 6 0 1 1 10.174 4.31c-.203.196-.359.4-.453.619l-.762 1.769A.5.5 0 0 1 10.5 13a.5.5 0 0 1 0 1 .5.5 0 0 1 0 1l-.224.447a1 1 0 0 1-.894.553H6.618a1 1 0 0 1-.894-.553L5.5 15a.5.5 0 0 1 0-1 .5.5 0 0 1 0-1 .5.5 0 0 1-.46-.302l-.761-1.77a1.964 1.964 0 0 0-.453-.618A5.984 5.984 0 0 1 2 6zm6-5a5 5 0 0 0-3.479 8.592c.263.254.514.564.676.941L5.83 12h4.342l.632-1.467c.162-.377.413-.687.676-.941A5 5 0 0 0 8 1z" />
                                </svg>
                            </button>
                            <button onClick={() => {
                                if (scannerRef.current) scannerRef.current.stop();
                                setScannerOpen(false);
                            }} className="flex-grow bg-[#d32f2f] hover:bg-[#b71c1c] text-white font-bold py-2 px-4 rounded transition-colors text-lg">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Inbound;