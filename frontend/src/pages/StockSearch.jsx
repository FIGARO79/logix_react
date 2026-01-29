import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';

const StockSearch = () => {
    const { setTitle } = useOutletContext();
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);

    React.useEffect(() => {
        setTitle('Logix - Consultar Stock');
    }, [setTitle]);

    // Audio Beep Function
    const playBeep = () => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // 800Hz beep
        oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    };

    // Función para ejecutar búsqueda directamente (usada por el scanner)
    const executeSearch = async (code) => {
        if (!code.trim()) return;

        setLoading(true);
        setError('');
        setItemData(null);

        try {
            const res = await fetch(`/api/find_item/${encodeURIComponent(code)}/NA`);
            const data = await res.json();

            if (res.ok) {
                setItemData(data);
                playBeep(); // Beep on success
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

    const handleScan = (code) => {
        setScannerOpen(false);
        setItemCode(code);
        executeSearch(code);
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!itemCode.trim()) return;
        executeSearch(itemCode);
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
                                placeholder=""
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
                            <div className="data-field font-bold bg-blue-50 text-blue-900 border-blue-200">
                                {itemData.physicalQty || 0}
                            </div>
                        </div>

                        {itemData.aditionalBins && (
                            <div className="col-span-1 md:col-span-2">
                                <label className="form-label text-gray-500">Ubicaciones Adicionales</label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {itemData.aditionalBins.split(',').map((bin, index) => (
                                        bin.trim() && (
                                            <span key={index} className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-sm">
                                                {bin.trim()}
                                            </span>
                                        )
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 col-span-1 md:col-span-2 border-t pt-4 mt-2">
                            <div>
                                <label className="form-label text-gray-500">Peso (kg)</label>
                                <div>{itemData.weight || '-'}</div>
                            </div>
                            <div>
                                <label className="form-label text-gray-500">Última Fecha Ingreso</label>
                                <div>{itemData.dateLastReceived || '-'}</div>
                            </div>
                            <div>
                                <label className="form-label text-gray-500">Reemplazado Por</label>
                                <div>{itemData.supersededBy || '-'}</div>
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
            {/* Scanner Modal */}
            {scannerOpen && (
                <ScannerModal
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />
            )}
        </div>
    );
};

export default StockSearch;
