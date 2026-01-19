import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';

const Inbound = () => {
    const navigate = useNavigate();
    const [importReference, setImportReference] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [itemDetails, setItemDetails] = useState(null);
    const [inputData, setInputData] = useState({
        quantity: '',
        binLocation: '',
        observaciones: ''
    });
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    // Fetch Item Info when checking code
    const checkItem = async (e) => {
        e.preventDefault();
        if (!itemCode) return;

        setLoadingInfo(true);
        setError(null);
        setMessage(null);
        setItemDetails(null);

        try {
            const url = `http://localhost:8000/api/find_item?item_code=${itemCode}&import_reference=${importReference}`;
            const response = await fetch(url);

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Error al buscar el ítem');
            }

            const data = await response.json();
            setItemDetails(data);

            // Auto-fill suggested bin if available
            if (data.info && data.info.Bin_1) {
                setInputData(prev => ({ ...prev, binLocation: data.info.Bin_1 }));
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingInfo(false);
        }
    };

    const handleConfirm = async () => {
        if (!itemDetails || !inputData.quantity) return;

        setSubmitting(true);
        setError(null);
        setMessage(null);

        try {
            const payload = {
                itemCode: itemCode,
                Quantity: parseInt(inputData.quantity),
                binLocation: inputData.binLocation,
                observaciones: inputData.observaciones,
                import_reference: importReference,
                username: "admin" // Hardcoded for now, should come from context
            };

            const response = await fetch('http://localhost:8000/api/add_log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Error al guardar el registro');
            }

            const result = await response.json();
            setMessage("Registro guardado exitosamente");

            // Reset for next scan
            setItemCode('');
            setItemDetails(null);
            setInputData({ quantity: '', binLocation: '', observaciones: '' });

            // Focus back on item input (using ref ideally, simple logic here)
            document.getElementById('item_code').focus();

        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout title="Recepción (Inbound)">
            <div className="max-w-4xl mx-auto px-4 py-8">

                {/* Reference Configuration */}
                <div className="bg-white p-6 rounded-lg shadow-md mb-6 border-l-4 border-[#0070d2]">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">Configuración de Recepción</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Referencia Importación</label>
                            <input
                                type="text"
                                value={importReference}
                                onChange={(e) => setImportReference(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50 border p-2"
                                placeholder="Ej. IMP-2024-001"
                            />
                        </div>
                    </div>
                </div>

                {/* Scan Area */}
                <div className="bg-white p-6 rounded-lg shadow-md mb-6 border-l-4 border-gray-400">
                    <form onSubmit={checkItem} className="flex gap-4 items-end">
                        <div className="flex-grow">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Escanear Artículo</label>
                            <input
                                id="item_code"
                                type="text"
                                value={itemCode}
                                onChange={(e) => setItemCode(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50 border p-2 text-lg"
                                placeholder="Código de barras..."
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loadingInfo || !itemCode}
                            className="bg-[#0070d2] hover:bg-[#005fb2] text-white font-bold py-2 px-6 rounded shadow transition-colors"
                        >
                            {loadingInfo ? 'Buscando...' : 'Buscar'}
                        </button>
                    </form>
                </div>

                {/* Feedback Messages */}
                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
                {message && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{message}</div>}

                {/* Result Item Card */}
                {itemDetails && (
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 animate-fade-in-up">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800">{itemDetails.info?.Item_Description || itemCode}</h3>
                            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                                {itemDetails.info?.Item_Code || itemCode}
                            </span>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Detail Info */}
                            <div className="space-y-3 text-sm">
                                <p><span className="font-semibold text-gray-600">Total Esperado (GRN):</span> <span className="font-bold text-gray-800">{itemDetails.totals?.total_expected || 0}</span></p>
                                <p><span className="font-semibold text-gray-600">Total Recibido:</span> <span className="font-bold text-[#0070d2]">{itemDetails.totals?.total_received || 0}</span></p>
                                <p><span className="font-semibold text-gray-600">Diferencia Actual:</span>
                                    <span className={`font-bold ml-1 ${(itemDetails.totals?.difference || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {itemDetails.totals?.difference || 0}
                                    </span>
                                </p>
                            </div>

                            {/* Action Form */}
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <div className="mb-3">
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Cantidad Recibida</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border border-gray-300 rounded focus:ring-[#0070d2] focus:border-[#0070d2]"
                                        value={inputData.quantity}
                                        onChange={(e) => setInputData({ ...inputData, quantity: e.target.value })}
                                        onKeyDown={(e) => e.key === 'Enter' && document.getElementById('btn-confirm').click()}
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Ubicación (Bin)</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-gray-300 rounded focus:ring-[#0070d2] focus:border-[#0070d2]"
                                        value={inputData.binLocation}
                                        onChange={(e) => setInputData({ ...inputData, binLocation: e.target.value })}
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Observaciones</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-gray-300 rounded focus:ring-[#0070d2] focus:border-[#0070d2]"
                                        value={inputData.observaciones}
                                        onChange={(e) => setInputData({ ...inputData, observaciones: e.target.value })}
                                    />
                                </div>
                                <button
                                    id="btn-confirm"
                                    onClick={handleConfirm}
                                    disabled={submitting}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded shadow transition-transform active:scale-95"
                                >
                                    {submitting ? 'Guardando...' : 'CONFIRMAR ENTRADA'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default Inbound;
