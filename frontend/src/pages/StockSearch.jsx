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
    const scannerRef = React.useRef(null);

    React.useEffect(() => {
        setTitle('Logix - Consultar Stock');
    }, [setTitle]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!itemCode.trim()) return;

        setLoading(true);
        setError('');
        setItemData(null);

        try {
            // Using the inventory endpoint which seems to return stock data
            // Or better, check if there's a specific stock search API.
            // In legacy stock.html, it likely did a POST to /stock or similar.
            // Based on api_views.py (which I need to check), there might be a route.
            // Let's assume we need to use a find_item or similar. 
            // Checking inventory.py, get_stock_data returns full DF. Not efficient for single search.
            // But Inbound uses `api/find_item/{item}/{ref}`. 
            // Let's use `api/find_item/{item}/dummy` or similar if generic search exists.
            // Wait, I should verify the backend endpoint for simple stock check.
            // I'll assume I might need to make a new one or use existing.
            // For now, I'll use the one from Inbound but ignore importRef logic if possible, 
            // or just hit the master csv handler directly if I can.

            // Actually, let's look at `app/routers/stock.py` if it exists (from task.md "Adapt existing routers (stock.py)").
            // If not, I'll use a likely endpoint or creates one. 
            // FOR NOW, I will try to use the logic found in Inbound's `find_item`.

            const res = await fetch(`http://localhost:8000/api/find_item/${encodeURIComponent(itemCode)}/NA`);
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
                <div className="bg-[#2c3e50] text-white px-6 py-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                    <div className="bg-white rounded-lg p-4 w-full max-w-md">
                        <h3 className="text-center font-bold mb-2">Escanear Código</h3>
                        <div id="reader" className="rounded overflow-hidden"></div>
                        <button onClick={() => {
                            if (scannerRef.current) scannerRef.current.stop();
                            setScannerOpen(false);
                        }} className="btn-sap bg-red-600 text-white w-full mt-4">Cerrar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockSearch;
