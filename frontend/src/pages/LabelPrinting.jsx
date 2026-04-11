import React, { useState, useEffect, useRef } from 'react';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import QRCode from 'qrcode';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { sandvikLogoBase64 } from '../assets/logo';
import SandvikLabel from '../components/labels/SandvikLabel';
import { useReactToPrint } from 'react-to-print';
import '../styles/Label.css';


const LabelPrinting = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Etiquetado"); }, [setTitle]);

    // States
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [qrImage, setQrImage] = useState(null);

    // Refs
    const itemCodeInputRef = useRef(null);
    const labelComponentRef = useRef(null);

    // QR Code Generation
    useEffect(() => {
        const activeCode = itemData?.itemCode || itemCode;
        if (activeCode) {
            QRCode.toDataURL(activeCode, { width: 256, margin: 0 })
                .then(url => setQrImage(url))
                .catch(err => console.error(err));
        } else {
            setQrImage(null);
        }
    }, [itemData, itemCode]);

    const findItem = async () => {
        if (!itemCode.trim()) {
            toast.error("Ingrese un código de item");
            return;
        }

        setLoading(true);
        setItemData(null);

        try {
            const res = await fetch(`/api/get_item_details/${encodeURIComponent(itemCode.toUpperCase())}`);
            const data = await res.json();

            if (res.ok) {
                setItemData({
                    itemCode: data.item_code,
                    description: data.description,
                    binLocation: data.bin_location,
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

    const handlePrint = useReactToPrint({
        contentRef: labelComponentRef,
        documentTitle: itemData ? `Etiqueta-${itemData.itemCode}` : 'Etiqueta',
        pageStyle: "@page { size: 70mm 100mm; margin: 0; } @media print { body { -webkit-print-color-adjust: exact; } }",
    });

    const totalWeight = itemData ? (parseFloat(itemData.weight || 0) * parseInt(quantity || 1)).toFixed(2) : '0.00';

    return (
        <div className="container-wrapper px-4 py-4">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">

                {/* Form Column */}
                <div className="lg:col-span-2 space-y-5 bg-white p-6 rounded-md shadow-md border border-gray-200">
                    <div className="bg-gray-50 text-gray-900 px-4 py-3 -mx-6 -mt-6 rounded-t-md mb-6 border-b border-gray-200">
                        <h1 className="text-base font-normal tracking-tight">Imprimir Etiqueta</h1>
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
                        <label className="form-label">Quantity Per Pack</label>
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

                    {/* Print Area Preview */}
                    <div className="flex justify-center">
                        <div ref={labelComponentRef} className="bg-white">
                            <SandvikLabel 
                                data={itemData} 
                                qrImage={qrImage} 
                                quantity={quantity} 
                                totalWeight={totalWeight} 
                            />
                        </div>
                    </div>

                    <div className="w-full flex justify-center mt-6">
                        <button
                            onClick={handlePrint}
                            disabled={!itemData}
                            className="btn-sap btn-primary btn-print-label h-10"
                        >
                            Imprimir Etiqueta
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default LabelPrinting;
