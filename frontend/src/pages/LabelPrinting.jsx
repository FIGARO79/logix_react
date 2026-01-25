import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '../styles/Label.css';

const LabelPrinting = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Logix - Etiquetado"); }, [setTitle]);

    // States
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [qrImage, setQrImage] = useState(null);

    // Refs
    const itemCodeInputRef = useRef(null);

    // QR Code Generation
    useEffect(() => {
        if (itemData?.itemCode) {
            QRCode.toDataURL(itemData.itemCode, { width: 96, margin: 1 })
                .then(url => setQrImage(url))
                .catch(err => console.error(err));
        } else {
            setQrImage(null);
        }
    }, [itemData]);

    const findItem = async () => {
        if (!itemCode.trim()) {
            toast.error("Ingrese un código de item");
            return;
        }

        setLoading(true);
        setItemData(null);

        try {
            const res = await fetch(`http://localhost:8000/api/get_item_details/${encodeURIComponent(itemCode.toUpperCase())}`);
            const data = await res.json();

            if (res.ok) {
                // Map API response (snake_case) to component expectation or use directly
                setItemData({
                    itemCode: data.item_code,
                    description: data.description,
                    binLocation: data.bin_location, // Effective bin (relocated or original)
                    aditionalBins: data.additional_bins,
                    weight: data.weight_kg
                });
                toast.success("Item encontrado");
            } else {
                toast.error(data.detail || "Item no encontrado");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        if (!itemData) return;
        window.print();
    };

    const totalWeight = itemData ? (parseFloat(itemData.weight || 0) * parseInt(quantity || 1)).toFixed(2) : 'N/A';

    return (
        <div className="container-wrapper px-4 py-4">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">

                {/* Form Column */}
                <div className="lg:col-span-2 space-y-5 bg-white p-6 rounded-md shadow-md border border-gray-200">
                    <div className="bg-gray-50 text-gray-900 px-4 py-3 -mx-6 -mt-6 rounded-t-md mb-6 border-b border-gray-200">
                        <h1 className="text-base font-semibold tracking-tight">Imprimir Etiqueta</h1>
                    </div>

                    <div>
                        <label className="form-label">Item Code</label>
                        <div className="flex items-center gap-2">
                            <input
                                ref={itemCodeInputRef}
                                type="text"
                                value={itemCode}
                                onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && findItem()}
                                className="flex-grow uppercase"
                                placeholder="Ingrese código y presione Enter"
                                autoFocus
                            />
                            <button
                                onClick={findItem}
                                className="btn-sap btn-secondary h-[38px] px-3 flex-shrink-0"
                                disabled={loading}
                            >
                                {loading ? '...' : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Item Description</label>
                        <div className="data-field bg-gray-50">{itemData?.description || ''}</div>
                    </div>

                    <div>
                        <label className="form-label">Quantity Received</label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            min="1"
                            className="w-1/3"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <label className="form-label">Bin Location</label>
                            <div className="data-field bg-gray-50">{itemData?.binLocation || ''}</div>
                        </div>
                        <div>
                            <label className="form-label">Additional Bins</label>
                            <div className="data-field bg-gray-50 text-xs">{itemData?.aditionalBins || ''}</div>
                        </div>
                    </div>
                </div>

                {/* Label Preview Column */}
                <div className="lg:col-span-1">
                    <h2 className="text-lg font-semibold text-gray-700 mb-3 text-center">Vista Previa</h2>

                    {/* Print Area - Classes trigger print visibility */}
                    <div className="label-print-area flex justify-center">
                        <div className="label-container bg-white">
                            <div>
                                <img src="/static/images/logoytpe_sandvik.png" alt="Sandvik" className="label-logo" />
                                <p className="label-item-code">{itemData?.itemCode || 'ITEM CODE'}</p>
                                <p className="label-item-description">{itemData?.description || 'Item Description'}</p>

                                <div className="space-y-1">
                                    <div className="label-data-field">
                                        <span>Quantity Received</span>
                                        <span>{quantity}</span>
                                    </div>
                                    <div className="label-data-field">
                                        <span>Product weight</span>
                                        <span>{totalWeight} {totalWeight !== 'N/A' ? 'kg' : ''}</span>
                                    </div>
                                    <div className="label-data-field">
                                        <span>Bin Location</span>
                                        <span>{itemData?.binLocation || 'BIN'}</span>
                                    </div>
                                    <div className="label-data-field">
                                        <span>Packing Date</span>
                                        <span>{new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="label-bottom-section mt-auto pt-4 flex items-end justify-between">
                                <p className="label-disclaimer text-[10px] leading-tight text-gray-500 max-w-[60%]">
                                    All trademarks and logotypes appearing on this label are owned by Sandvik Group
                                </p>
                                <div id="qrCodeContainer" className="border border-gray-200 rounded p-1">
                                    {qrImage ? <img src={qrImage} alt="QR" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">QR Code</div>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handlePrint}
                        disabled={!itemData}
                        className="btn-sap btn-primary w-full mt-6 py-2"
                    >
                        Imprimir Etiqueta
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LabelPrinting;
