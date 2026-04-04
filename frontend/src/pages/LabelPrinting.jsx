import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { sandvikLogoBase64 } from '../assets/logo';
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
    const printFrameRef = useRef(null);

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

    const handlePrint = () => {
        const frame = printFrameRef.current;
        if (!frame) {
            toast.error("Error: No se encontró el marco de impresión.");
            return;
        }

        if (!itemData) return;

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Etiqueta ${itemData ? itemData.itemCode : ''}</title>
                <style>
                    @page { size: 70mm 100mm; margin: 0; }
                    html, body { 
                        width: 70mm; height: 100mm; margin: 0; padding: 0; 
                        overflow: hidden; background: white; 
                        font-family: Arial, sans-serif; 
                    }
                    .label-container {
                        width: 70mm; height: 100mm; 
                        box-sizing: border-box;
                        padding: 3.5mm; 
                        background: white;
                        display: flex;
                        flex-direction: column;
                    }
                    .label-logo { 
                        height: 7mm; 
                        display: block; 
                        margin-bottom: 3.5mm;
                        flex-shrink: 0;
                        align-self: flex-start;
                    }
                    .label-item-code { 
                        font-family: Arial, sans-serif;
                        font-size: 12pt; 
                        font-weight: bold; 
                        margin: 0; 
                        line-height: 1.2; 
                        color: #000;
                        word-break: break-word;
                    }
                    .label-item-description { 
                        font-family: Arial, sans-serif;
                        font-size: 12pt; 
                        font-weight: bold; 
                        margin: 0 0 2mm 0;
                        line-height: 1.2; 
                        color: #000;
                        word-break: break-word;
                        margin-bottom: 2mm;
                    }
                    
                    /* Grid Data Table */
                    .label-data-table {
                        width: 100%;
                        font-size: 9pt;
                        line-height: 1.4;
                        flex-shrink: 0;
                    }
                    .label-row {
                        display: grid;
                        grid-template-columns: 28mm 1fr;
                    }
                    .label-label {
                         font-weight: normal; color: #000;
                    }
                    .label-value {
                         font-weight: normal; color: #000;
                    }
                    
                    /* Footer */
                    .label-footer { 
                        display: flex; 
                        align-items: flex-end; 
                        justify-content: space-between;
                        margin-top: 2mm;
                        flex-shrink: 0;
                        flex-grow: 1;
                    }
                    
                    .label-disclaimer { 
                        font-size: 7pt; 
                        color: #000; 
                        max-width: 35mm; 
                        line-height: 1.1; 
                        margin: 0; 
                    }
                    
                    #qrCodeContainer { 
                        width: 25mm; 
                        height: 25mm; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center;
                        flex-shrink: 0;
                    }
                    #qrCodeContainer img { width: 100%; height: 100%; object-fit: contain; }
                </style>
            </head>
            <body>
                <div class="label-container">
                    <!-- Logo -->
                    <img src="${sandvikLogoBase64}" alt="Sandvik" class="label-logo" />
                    
                    <!-- Header -->
                    <div class="label-item-code">${itemData?.itemCode || ''}</div>
                    <div class="label-item-description">${itemData?.description || ''}</div>

                    <div style="flex-grow: 1;"></div>
                    <!-- Data Grid -->
                    <div class="label-data-table">
                        <div class="label-row">
                            <div class="label-label">Quantity/pack</div>
                            <div class="label-value">${quantity || 1} EA</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Product weight</div>
                            <div class="label-value">${(parseFloat(itemData.weight || 0) * (parseInt(quantity) || 1)).toFixed(2)} kg</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Packaging date</div>
                            <div class="label-value">${new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Bin location</div>
                            <div class="label-value">${itemData?.binLocation || ''}</div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="label-footer">
                        <p class="label-disclaimer">All trademarks and logotypes appearing on this label are owned by Sandvik Group</p>
                        <div id="qrCodeContainer">
                            ${qrImage ? `<img src="${qrImage}" />` : ''}
                        </div>
                    </div>
                </div>
                <script>
                    window.onload = function() { setTimeout(function(){ window.print(); }, 200); }
                </script>
            </body>
            </html>
        `;

        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();
    };

    const totalWeight = itemData ? (parseFloat(itemData.weight || 0) * parseInt(quantity || 1)).toFixed(2) : '0.00';

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
                        <div style={{
                            width: '70mm',
                            height: '100mm',
                            padding: '3.5mm',
                            boxSizing: 'border-box',
                            background: 'white',
                            border: '1px solid #ccc',
                            fontFamily: 'Arial, sans-serif',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {/* Logo */}
                            <img src={sandvikLogoBase64} alt="Sandvik" style={{ height: '7mm', display: 'block', marginBottom: '3.5mm', flexShrink: 0, alignSelf: 'flex-start' }} />

                            {/* Header */}
                            <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.2, wordBreak: 'break-word', color: '#000' }}>{itemData?.itemCode || 'ITEM CODE'}</div>
                            <div style={{ fontSize: '11pt', fontWeight: 'bold', lineHeight: 1.1, wordBreak: 'break-word', marginBottom: '2mm', color: '#000' }}>{itemData?.description || 'Description'}</div>

                            <div style={{ flexGrow: 1 }}></div>

                            {/* Data Table */}
                            <div style={{ fontSize: '9pt', lineHeight: 1.4, flexShrink: 0, color: '#000' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                    <div>Quantity/pack</div>
                                    <div>{quantity || 1} EA</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                    <div>Product weight</div>
                                    <div>{totalWeight} kg</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                    <div>Packaging date</div>
                                    <div>{new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                    <div>Bin location</div>
                                    <div>{itemData?.binLocation || ''}</div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2mm', flexShrink: 0, flexGrow: 1 }}>
                                <p style={{ fontSize: '7pt', margin: 0, maxWidth: '35mm', lineHeight: 1.1, color: '#000' }}>
                                    All trademarks and logotypes appearing on this label are owned by Sandvik Group
                                </p>
                                <div style={{ width: '25mm', height: '25mm', flexShrink: 0 }}>
                                    {qrImage ? <img src={qrImage} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div className="border border-gray-200 w-full h-full"></div>}
                                </div>
                            </div>
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

            {/* Hidden Iframe for Printing Labels */}
            <iframe
                ref={printFrameRef}
                title="print-label-frame"
                style={{ position: 'fixed', top: '-1000px', left: '-1000px', width: '1px', height: '1px', border: 'none' }}
            />
        </div>
    );
};

export default LabelPrinting;
