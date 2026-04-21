import React, { useState } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';

const StockSearch = () => {
    const { setTitle } = useOutletContext();
    const navigate = useNavigate();
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);

    React.useEffect(() => {
        setTitle("Consulta de Stock");
    }, [setTitle]);

    // Audio Beep Function
    const playBeep = () => {
        // Only play sound on mobile devices
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) return;

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
                setItemCode(''); // Clear input on success
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
                <div className="bg-gray-50 text-gray-900 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Búsqueda de Stock
                    </h2>
                    <button 
                        onClick={() => navigate('/spot-check')}
                        className="btn-sap btn-secondary text-[10px] uppercase font-bold tracking-wider px-4 flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Verificar Saldo
                    </button>
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
                                className="btn-sap btn-secondary w-[38px] h-[38px] p-0 flex items-center justify-center"
                                title="Escanear Código"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
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
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${parseFloat(String(itemData.physicalQty || '0').replace(',', '')) > 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                            }`}>
                            {parseFloat(String(itemData.physicalQty || '0').replace(',', '')) > 0 ? 'EN STOCK' : 'SIN STOCK'}
                        </span>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-1 md:col-span-2">
                            <label className="form-label text-gray-500">Descripción</label>
                            <div className="text-gray-900 font-medium text-lg">{itemData.description}</div>
                        </div>

                        <div>
                            <label className="form-label text-gray-500">Ubicación Principal</label>
                            <div className="mt-1">
                                <span className="inline-flex items-center px-4 py-1.5 rounded-md text-lg font-medium bg-blue-100 text-[#1e4a74] border border-blue-200 shadow-sm">
                                    {itemData.binLocation || 'N/A'}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="form-label text-gray-500">Stock Físico</label>
                            <div className="mt-1">
                                <span className="inline-flex items-center px-4 py-1.5 rounded-md text-lg font-bold bg-blue-100 text-[#1e4a74] border border-blue-200 shadow-sm">
                                    {itemData.physicalQty}
                                </span>
                            </div>
                        </div>

                        {itemData.aditionalBins && (
                            <div className="col-span-1 md:col-span-2">
                                <label className="form-label text-gray-500">Ubicaciones Adicionales</label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {itemData.aditionalBins.split(',').map((bin, index) => (
                                        bin.trim() && (
                                            <span key={index} className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-blue-100 text-[#1e4a74] border border-blue-200 shadow-sm">
                                                {bin.trim()}
                                            </span>
                                        )
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 col-span-1 md:col-span-2 border-t pt-4 mt-2">
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
                            <div>
                                <label className="form-label text-gray-500">SIC Code</label>
                                <div className="font-medium text-gray-700">{itemData.sicCode || '-'}</div>
                            </div>
                            <div>
                                <label className="form-label text-gray-500">ABC Code</label>
                                <div className="font-medium text-gray-700">{itemData.itemType || '-'}</div>
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
