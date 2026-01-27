import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const PackingListPrint = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const printFrameRef = React.useRef(null);

    useEffect(() => {
        // 1. Fetch Data
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/picking/packing_list/${id}`, { credentials: 'include' });
                if (!res.ok) throw new Error("Error loading data");
                const json = await res.json();
                setData(json);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();

        // 2. Disable SAP Fiori Styles (Conflicts with printing)
        const sapLink = document.querySelector('link[href*="sap_fiori_3"]');
        if (sapLink) {
            sapLink.disabled = true;
            console.log("SAP Theme disabled for printing");
        }

        // Cleanup: Re-enable on exit
        return () => {
            if (sapLink) {
                sapLink.disabled = false;
                console.log("SAP Theme re-enabled");
            }
        };
    }, [id]);

    if (loading) return <div className="p-8">Generando Packing List...</div>;
    if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
    if (!data) return <div className="p-8">No datos.</div>;

    const { packages } = data;
    const sortedPackageKeys = Object.keys(packages).sort((a, b) => parseInt(a) - parseInt(b));

    const handlePrint = () => {
        const frame = printFrameRef.current;
        if (!frame) {
            alert("Error: No se encontró el marco de impresión.");
            return;
        }

        const { packages } = data;
        const sortedPackageKeys = Object.keys(packages).sort((a, b) => parseInt(a) - parseInt(b));

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Packing List - ${data.order_number}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; color: black; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
                    .header h1 { margin: 0; font-size: 24px; color: #0a6ed1; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 14px; }
                    .package { border: 1px solid #ccc; margin-bottom: 20px; page-break-inside: avoid; }
                    .package-header { background: #f0f0f0; padding: 10px; font-weight: bold; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; background: #fafafa; }
                    td { padding: 8px; border-bottom: 1px solid #eee; }
                    .text-right { text-align: right; }
                    @media print {
                        .no-print { display: none; }
                        @page { margin: 1cm; size: A4; }
                        body { -webkit-print-color-adjust: exact; }
                        .package-header { background: #f0f0f0 !important; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>PACKING LIST</h1>
                    <div>${data.timestamp}</div>
                </div>

                <div class="info-grid">
                    <div>
                        <strong>CLIENTE:</strong><br>${data.customer_name}
                    </div>
                    <div class="text-right">
                        <strong>TOTAL BULTOS:</strong><br>${data.total_packages}
                    </div>
                    <div>
                        <strong>PEDIDO:</strong><br>${data.order_number}
                    </div>
                    <div class="text-right">
                        <strong>DESPACHO:</strong><br>${data.despatch_number}
                    </div>
                </div>

                ${sortedPackageKeys.map(key => `
                    <div class="package">
                        <div class="package-header">
                            <span>BULTO #${key}</span>
                            <span>BOX-${key.padStart(3, '0')}</span>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>CÓDIGO</th>
                                    <th>DESCRIPCIÓN</th>
                                    <th class="text-right">CANTIDAD</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${packages[key].map(item => `
                                    <tr>
                                        <td>${item.item_code}</td>
                                        <td>${item.description}</td>
                                        <td class="text-right">${item.quantity}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `).join('')}
            </body>
            </html>
        `;

        // Write to iframe
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();

        // Wait for images/styles to load then print
        frame.contentWindow.focus();
        setTimeout(() => {
            frame.contentWindow.print();
        }, 500);
    };

    return (
        <div className="bg-white min-h-screen text-black p-8 font-sans">
            {/* The on-screen preview uses standard Tailwind */}
            {/* The on-screen preview uses standard Tailwind */}
            <div className="no-print mb-6 sticky top-0 bg-white border-b shadow-sm z-10">
                <div className="max-w-3xl mx-auto flex justify-between items-center p-4">
                    <h1 className="text-lg font-bold">Vista Previa Packing List</h1>
                    <div className="flex gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handlePrint}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-bold"
                        >
                            Imprimir
                        </button>
                    </div>
                </div>
            </div>

            <div id="printable-section" className="max-w-3xl mx-auto border p-8 bg-white">

                {/* Header */}
                <div className="text-center mb-8 border-b pb-4">
                    <h1 className="text-3xl font-extrabold uppercase tracking-wide mb-2">Packing List</h1>
                    <div className="text-sm text-gray-500">{data.timestamp}</div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                    <div>
                        <p className="font-bold text-gray-500 uppercase text-xs">Cliente</p>
                        <p className="text-lg font-semibold">{data.customer_name}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-gray-500 uppercase text-xs">Total Bultos</p>
                        <p className="text-lg font-semibold">{data.total_packages}</p>
                    </div>
                    <div>
                        <p className="font-bold text-gray-500 uppercase text-xs">Pedido</p>
                        <p className="text-lg">{data.order_number}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-gray-500 uppercase text-xs">Despacho</p>
                        <p className="text-lg">{data.despatch_number}</p>
                    </div>
                </div>

                {/* Packages */}
                <div className="space-y-6">
                    {sortedPackageKeys.length === 0 ? (
                        <p className="text-center text-gray-500 italic py-8">No hay items asignados a bultos.</p>
                    ) : (
                        sortedPackageKeys.map(key => (
                            <div key={key} className="page-break border rounded-lg break-inside-avoid shadow-sm print:shadow-none print:border-gray-300">
                                <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center print:bg-gray-50">
                                    <h3 className="font-bold text-lg">Bulto #{key}</h3>
                                    <span className="text-xs text-gray-500 font-mono">BOX-{key.padStart(3, '0')}</span>
                                </div>
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="px-4 py-2 text-left w-1/4">Código</th>
                                            <th className="px-4 py-2 text-left w-1/2">Descripción</th>
                                            <th className="px-4 py-2 text-right w-1/4">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {packages[key].map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-2 font-mono text-gray-700">{item.item_code}</td>
                                                <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{item.description}</td>
                                                <td className="px-4 py-2 text-right font-bold">{item.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="mt-12 pt-8 border-t text-center text-xs text-gray-400">
                    <p>Logix - Sistema de Gestión de Almacén</p>
                </div>
            </div>

            {/* Hidden Iframe for Printing */}
            <iframe
                ref={printFrameRef}
                title="print-frame"
                style={{ position: 'fixed', top: '-1000px', left: '-1000px', width: '1px', height: '1px', border: 'none' }}
            />
        </div>
    );
};

export default PackingListPrint;
