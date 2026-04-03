import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
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

        // Logo Sandvik en Base64 para soporte offline total
        const sandvikLogoBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABJgAAADUCAYAAADQgZm0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAK92lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDMgNzkuOTY5MGE4N2ZjLCAyMDI1LzAzLzA2LTIwOjUwOjE2ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtbG5zOnRpZmY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vdGlmZi8xLjAvIiB4bWxuczpleGlmPSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wLyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgV2ViICgyMDI1LjguMS4wIDMxNmYxNGNmYzhjKSAoR29vZ2xlIENocm9tZSkiIHhtcDpDcmVhdGVEYXRlPSIyMDI1LTA1LTAxVDIwOjQ5OjQ0LTA1OjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyNS0wNS0wMVQyMDo1MjowOS0wNTowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyNS0wNS0wMVQyMDo1MjowOS0wNTowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NzdhYjJmMjEtNWQ0Yi00Nzk0LWJkOWYtMzE3ZjY4ZWVkOTI3IiB4bXBNTTpEb2N1bWVudElEPSJhZG9iZTpkb2NpZDpwaG90b3Nob3A6ZDQ0OWIzM2ItNjM1Zi05OTRmLTg4YTAtYjIyYTgxZWViNWZhIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6NzFiYjdjNmQtNzhmNy00ZmIxLWI3NzktOTdlYzUyMDRhNjUxIiB0aWZmOk9yaWVudGF0aW9uPSIxIiB0aWZmOlhSZXNvbHV0aW9uPSI5NjAwMDAvMTAwMDAiIHRpZmY6WVJlc29sdXRpb249Ijk2MDAwMC8xMDAwMCIgdGlmZjpSZXNvbHV0aW9uVW5pdD0iMiIgZXhpZjpDb2xvclNwYWNlPSI2NTUzNSIgZXhpZjpQaXhlbFhEaW1lbnNpb249IjExNzYiIGV4aWY6UGl4ZWxZRGltZW5zaW9uPSIyMTIiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjcxYmI3YzZkLTc4ZjctNGZiMS1iNzc5LTk3ZWM1MjA0YTY1MSIgc3RFdnQ6d2hlbj0iMjAyNS0wNS0wMVQyMDo0OTo0NC0wNTowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIFdlYiAoMjAyNS44LjEuMCAzMTZmMTRjZmM4YykgKEdvb2dsZSBDaHJvbWUpIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo2NzczNjhjOC04N2VjLTQzYTYtOWRlMS00MDk3MzZiMjhmNzAiIHN0RXZ0OndoZW49IjIwMjUtMDUtMDFUMjA6NTE6MzYtMDU6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBXZWIgKDIwMjUuOC4xLjAgMzE2ZjE0Y2ZjOGMpIChHb29nbGUgQ2hyb21lKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6MzZiZjQxNWYtZjlkMi00MWI4LWE4OWMtZmEwMDIzMmQyOTM4IiBzdEV2dDp3aGVuPSIyMDI1LTA1LTAxVDIwOjUyOjA5LTA1OjAwIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgV2ViICgyMDI1LjguMS4wIDMxNmYxNGNmYzhjKSAoR29vZ2xlIENocm9tZSkiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPHJkZjpsaSBzdEV2dDphY3Rpb249ImNvbnZlcnRlZCIgc3RFdnQ6cGFyYW1ldGVycz0iZnJvbSBkb2N1bWVudC92bmQuYWRvYmUuY3BzZCtkY3ggdG8gaW1hZ2UvcG5nIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJkZXJpdmVkIiBzdEV2dDpwYXJhbWV0ZXJzPSJjb252ZXJ0ZWQgZnJvbSBkb2N1bWVudC92bmQuYWRvYmUuY3BzZCtkY3ggdG8gaW1hZ2UvcG5nIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo3N2FiMmYyMS01ZDRiLTQ3OTQtYmQ5Zi0zMTdmNjhlZWQ5MjciIHN0RXZ0OndoZW49IjIwMjUtMDUtMDFUMjA6NTI6MDktMDU6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBXZWIgKDIwMjUuOC4xLjAgMzE2ZjE0Y2ZjOGMpIChHb29nbGUgQ2hyb21lKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6MzZiZjQxNWYtZjlkMi00MWI4LWE4OWMtZmEwMDIzMmQyOTM4IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjcxYmI3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";

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
                            <div class="label-value">${totalWeight} kg</div>
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
                            <img src="/static/images/logoytpe_sandvik.png" alt="Sandvik" style={{ height: '7mm', display: 'block', marginBottom: '3.5mm', flexShrink: 0, alignSelf: 'flex-start' }} />

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
