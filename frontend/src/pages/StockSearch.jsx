import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const StockSearch = () => {
    const { setTitle } = useOutletContext();
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const scannerRef = React.useRef(null);

    React.useEffect(() => {
        setTitle('Logix - Consultar Stock');
    }, [setTitle]);

    // Robust Scanner Effect
    React.useEffect(() => {
        if (scannerOpen) {
            import('html5-qrcode').then(({ Html5Qrcode }) => {
                // Ensure proper cleanup of previous instances
                if (scannerRef.current) {
                    try { scannerRef.current.clear(); } catch (e) { }
                }

                const html5QrCode = new Html5Qrcode("reader");
                scannerRef.current = html5QrCode;

                html5QrCode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    (decodedText) => {
                        // Success callback
                        setItemCode(decodedText.toUpperCase());

                        // Stop scanning safely
                        if (html5QrCode.isScanning) {
                            html5QrCode.stop().then(() => {
                                html5QrCode.clear();
                                setScannerOpen(false);
                                scannerRef.current = null;
                            }).catch(console.error);
                        }
                    },
                    (errorMessage) => {
                        // parse error, ignore loop
                    }
                ).catch((err) => {
                    console.error("Error starting scanner", err);
                    toast.error("Error al iniciar cámara: " + err);
                    setScannerOpen(false);
                });
            });
        }

        // Cleanup function when component unmounts or scanner closes
        return () => {
            if (scannerRef.current) {
                try {
                    // Try to stop if it looks like it's scanning, silence errors
                    scannerRef.current.stop().catch(() => { });
                    try { scannerRef.current.clear(); } catch (e) { }
                } catch (e) { }
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

    const handleStopScanner = () => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
                try { scannerRef.current.clear(); } catch (e) { }
                setScannerOpen(false);
                scannerRef.current = null;
            }).catch((err) => {
                console.error(err);
                setScannerOpen(false);
            });
        } else {
            setScannerOpen(false);
        }
    };
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!itemCode.trim()) return;

        setLoading(true);
        setError('');
        setItemData(null);

        try {
            const res = await fetch(`/api/find_item/${encodeURIComponent(itemCode)}/NA`);
            const data = await res.json();

            if (res.ok) {
                setItemData(data);
            } else {
                setError(data.error || 'Item no encontrado');
                toast.error(data.error || 'Item no encontrado');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión');
            toast.error('Error de conexión al servidor');
        } finally {
            setLoading(false);
        }
    };

    const clearSearch = () => {
        setItemCode('');
        setItemData(null);
        setError('');
    };

    return (
        <div className="container-wrapper max-w-4xl mx-auto px-4 py-8">
            <ToastContainer position="top-right" autoClose={3000} />

            {/* Search Card */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6 border border-gray-200">
                <div className="bg-gray-50 text-gray-900 px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Búsqueda de Stock
                    </h2>
                </div>

                <div className="p-6">
                    <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
                        <div className="flex-grow">
                            <label className="form-label mb-1">Código de Item</label>
                            <input
                                type="text"
                                value={itemCode}
                                onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                                className="w-full uppercase"
                                placeholder="Ej: 80205555"
                                autoFocus
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                type="button"
                                onClick={() => setScannerOpen(true)}
                                className="btn-sap btn-secondary h-[38px] px-3"
                                title="Escanear Código"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" />
                                </svg>
                            </button>
                            <button
                                type="submit"
                                className="btn-sap btn-primary h-[38px]"
                                disabled={loading}
                            >
                                {loading ? 'Buscando...' : 'Consultar'}
                            </button>
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="btn-sap btn-secondary h-[38px]"
                            >
                                Limpiar
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Results Card */}
            {itemData && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 animate-fade-in">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 text-lg">{itemData.itemCode}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${parseInt(itemData.physicalQty || 0) > 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                            }`}>
                            {parseInt(itemData.physicalQty || 0) > 0 ? 'EN STOCK' : 'SIN STOCK'}
                        </span>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-1 md:col-span-2">
                            <label className="form-label text-gray-500">Descripción</label>
                            <div className="text-gray-900 font-medium text-lg">{itemData.description}</div>
                        </div>

                        <div>
                            <label className="form-label text-gray-500">Ubicación Principal</label>
                            <div className="data-field bg-blue-50 text-blue-900 border-blue-200">
                                {itemData.binLocation || 'N/A'}
                            </div>
                        </div>

                        <div>
                            <label className="form-label text-gray-500">Stock Físico</label>
                            <div className="data-field font-bold text-lg">
                                {itemData.physicalQty || 0}
                            </div>
                        </div>

                        {itemData.aditionalBins && (
                            <div className="col-span-1 md:col-span-2">
                                <label className="form-label text-gray-500">Ubicaciones Adicionales</label>
                                <div className="data-field text-sm">
                                    {itemData.aditionalBins}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 col-span-1 md:col-span-2 border-t pt-4 mt-2">
                            <div>
                                <label className="form-label text-gray-500">Peso (kg)</label>
                                <div>{itemData.weight || '-'}</div>
                            </div>
                            <div>
                                <label className="form-label text-gray-500">Cantidad GRN</label>
                                <div>{itemData.defaultQtyGrn || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State / Intro */}
            {!itemData && !error && (
                <div className="text-center text-gray-500 mt-12">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    <p>Ingrese un código de item para consultar su disponibilidad y ubicación.</p>
                </div>
            )}

            {/* Scanner Modal */}
            {scannerOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg relative">
                        <h3 className="text-center font-bold text-lg mb-4 text-gray-800">Apunta la cámara al código de barras</h3>
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
                                onClick={handleStopScanner}
                                className="flex-1 h-12 flex items-center justify-center bg-[#d32f2f] hover:bg-[#b71c1c] text-white font-medium rounded transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockSearch;
