import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Layout from '../components/Layout';

// Sonidos sintetizados (para no depender de archivos externos)
const playSound = (type) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } else {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
};

const InventoryStock = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const scannerRef = useRef(null);

    const toggleTorch = () => {
        if (scannerRef.current) {
            scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: !torchOn }]
            })
                .then(() => setTorchOn(!torchOn))
                .catch(err => console.error("Flash no disponible", err));
        }
    };

    // Campos mapeados exactamente como en stock.html
    const fields = [
        { id: "Item_Code", label: "Item Code" },
        { id: "Item_Description", label: "Descripción" },
        { id: "Physical_Qty", label: "Cantidad Física" },
        { id: "Frozen_Qty", label: "Cantidad Congelada" },
        { id: "Bin_1", label: "Ubicación Principal" },
        { id: "Aditional_Bin_Location", label: "Ubicaciones Adicionales" },
        { id: "ABC_Code_stockroom", label: "Código ABC" },
        { id: "Weight_per_Unit", label: "Peso por Unidad" },
        { id: "SupersededBy", label: "Reemplazado Por" }
    ];

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError(null);
        setItemData(null);

        try {
            // Usamos el endpoint específico de item en lugar de traer todo el stock
            const response = await fetch(`http://localhost:8000/api/stock_item/${encodeURIComponent(searchTerm.toUpperCase())}`);
            const data = await response.json();

            if (response.ok && !data.error) {
                setItemData(data);
                playSound('success');
            } else {
                setError(data.error || "Artículo no encontrado");
                playSound('error');
            }
        } catch (err) {
            setError("Error de conexión al buscar el artículo");
            playSound('error');
        } finally {
            setLoading(false);
        }
    };

    // Lógica del Escáner
    useEffect(() => {
        if (scannerOpen && !scannerRef.current) {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;

            html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 250 },
                (decodedText) => {
                    // Success
                    setSearchTerm(decodedText);
                    setScannerOpen(false);
                    scannerRef.current.stop().then(() => {
                        scannerRef.current.clear();
                        scannerRef.current = null;
                    });
                    // Trigger search in next tick
                    setTimeout(() => handleSearch(), 100);
                },
                (errorMessage) => { /* ignore */ }
            ).catch(err => {
                setError("No se pudo iniciar la cámara");
                setScannerOpen(false);
            });
        }
    }, [scannerOpen]);

    const closeScanner = () => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
                scannerRef.current.clear();
                scannerRef.current = null;
            });
        }
        setScannerOpen(false);
    };

    return (
        <Layout title="Logix - Consultar Inventario">
            <div className="max-w-[800px] mx-auto px-4 py-3">
                <div className="bg-white p-6 rounded-md shadow-md border border-[#d9d9d9]">
                    {/* Header estilo SAP */}
                    <div className="bg-[#f2f2f2] text-[#32363a] px-4 py-3 -mx-6 -mt-6 mb-4 rounded-t-md border-b border-[#d9d9d9]">
                        <h1 className="text-base font-semibold m-0 font-sans">Consulta de Inventario</h1>
                    </div>

                    {/* Controles de Búsqueda */}
                    <form onSubmit={handleSearch} className="flex items-end gap-2 mb-4">
                        <div className="flex-grow">
                            <label className="block font-semibold mb-1 text-xs text-[#32363a] uppercase tracking-wide">
                                Ingrese el código del artículo
                            </label>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                                placeholder="Buscar por Item Code..."
                                className="w-full border border-[#89919a] p-2 rounded-[3px] text-[13px] bg-white focus:outline-none focus:border-[#0a6ed1] focus:ring-2 focus:ring-[#0a6ed1]/10 transition-all"
                                autoFocus
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setScannerOpen(true)}
                            className="h-[38px] px-3 bg-[#6a6d70] hover:bg-[#5a6d70] text-white rounded-[3px] shadow-sm flex items-center justify-center transition-all"
                            title="Escanear código"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" />
                                <path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" />
                                <path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" />
                                <path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" />
                                <path d="M12 9h2V8h-2z" />
                            </svg>
                        </button>
                        <button
                            type="submit"
                            className="h-[38px] px-3 bg-[#6a6d70] hover:bg-[#5a6d70] text-white rounded-[3px] shadow-sm flex items-center justify-center transition-all"
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" />
                                </svg>
                            )}
                        </button>
                    </form>

                    {/* Mensaje de Error */}
                    {error && (
                        <div className="mb-4 bg-[#fef6f6] border-l-4 border-[#b00] text-[#b00] p-3 text-sm flex items-center">
                            <span className="font-bold mr-2">Error:</span> {error}
                        </div>
                    )}

                    {/* Formulario de Resultados (Card View) */}
                    <div className="space-y-1 mt-6 grid grid-cols-1 gap-0">
                        {fields.map((field) => (
                            <div key={field.id}>
                                <label className="block font-semibold mb-1 text-xs text-[#32363a] uppercase tracking-wide">
                                    {field.label}
                                </label>
                                <div className="bg-[#f8f9fa] px-3 py-2 rounded-[3px] min-h-[38px] border border-[#d9d9d9] text-[#32363a] text-[13px] leading-relaxed flex items-center break-words">
                                    {itemData ? (itemData[field.id] !== null && itemData[field.id] !== undefined ? itemData[field.id] : '') : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal Scanner */}
            {scannerOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg">
                        <h3 className="text-center font-bold text-lg mb-4 text-gray-800">Escanear Código de Barras</h3>
                        <div id="reader" className="rounded-lg overflow-hidden mb-4 border-2 border-gray-100"></div>
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
                            <button
                                onClick={closeScanner}
                                className="flex-1 h-12 flex items-center justify-center bg-[#d32f2f] hover:bg-[#b71c1c] text-white font-medium rounded transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default InventoryStock;