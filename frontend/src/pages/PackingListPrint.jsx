import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import '../styles/FluentPages.css';

const PackingListPrint = ({ setTitle, id: propId }) => {
    const { id: paramId } = useParams();
    const navigate = useNavigate();
    const id = propId || paramId;

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [qrMap, setQrMap] = useState({});

    useEffect(() => {
        if (!id || id === 'undefined') return;
        if (setTitle) {
            setTitle(`Packing List #${id}`);
        }
    }, [id, setTitle]);

    useEffect(() => {
        if (!id || id === 'undefined') return;
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/picking/packing_list/${id}`, { credentials: 'include' });
                if (!res.ok) throw new Error("Error al consultar datos de empaque.");
                const json = await res.json();
                setData(json);

                // Generar código QR enriquecido con información completa por cada bulto
                const packagesObj = json.packages || {};
                const keys = Object.keys(packagesObj).sort((a, b) => parseInt(a) - parseInt(b));
                const totalPkgs = json.total_packages || keys.length;

                const orderFormatted = json.order_number 
                    ? (json.despatch_number && !String(json.order_number).includes('/') 
                        ? `${json.order_number}/${json.despatch_number}` 
                        : json.order_number)
                    : (json.despatch_number ? `/${json.despatch_number}` : 'N/A');

                const cleanClient = (json.customer_name || json.customer_code || 'N/A').trim().substring(0, 32);
                const newQrMap = {};
                for (const pkgKey of keys) {
                    const qrLines = [
                        `SANDVIK PACKING LIST`,
                        `Orden: ${orderFormatted}`,
                        `Bulto: ${pkgKey}/${totalPkgs}`,
                        `Cliente: ${cleanClient}`,
                        `Ref: AUD-${id}`
                    ];
                    try {
                        const url = await QRCode.toDataURL(qrLines.join('\n'), {
                            width: 280,
                            margin: 1,
                            errorCorrectionLevel: 'M',
                            color: { dark: '#000000', light: '#ffffff' }
                        });
                        newQrMap[pkgKey] = url;
                    } catch (qrErr) {
                        console.warn("Error generando QR para bulto", pkgKey, qrErr);
                    }
                }
                setQrMap(newQrMap);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    useEffect(() => {
        // Desactivar temporalmente estilos de SAP Fiori para evitar interferencias con el print
        const fioriLink = document.querySelector('link[href*="sap_fiori_3"]');
        if (fioriLink) fioriLink.disabled = true;
        return () => {
            if (fioriLink) fioriLink.disabled = false;
        };
    }, []);

    const handlePrint = () => {
        setTimeout(() => {
            window.print();
        }, 300);
    };

    const formatDate = (isoOrStr) => {
        if (!isoOrStr) return '-';
        const d = new Date(isoOrStr.includes('T') ? isoOrStr : `${isoOrStr}T00:00:00`);
        if (isNaN(d.getTime())) return isoOrStr;
        return d.toLocaleString('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f3f2f1] flex items-center justify-center p-6 font-segoe-ui">
                <div className="bg-white p-6 rounded border border-[#d2d0ce] shadow-sm flex items-center gap-3">
                    <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    <span className="text-xs text-[#201f1e] font-medium">Generando Packing List...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#f3f2f1] flex items-center justify-center p-6 font-segoe-ui">
                <div className="bg-white p-6 rounded border border-red-200 shadow-sm max-w-md">
                    <h3 className="text-sm font-semibold text-red-700 mb-1">Error al generar documento</h3>
                    <p className="text-xs text-[#605e5c]">{error}</p>
                    <button
                        onClick={() => navigate(-1)}
                        className="mt-4 px-3 py-1.5 text-xs bg-white border border-[#d2d0ce] hover:bg-[#f3f2f1] rounded transition-colors"
                    >
                        Volver
                    </button>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { packages } = data;
    const sortedPackageKeys = packages ? Object.keys(packages).sort((a, b) => parseInt(a) - parseInt(b)) : [];
    const totalGlobalPackages = data.total_packages || sortedPackageKeys.length;

    // Conteo global de unidades
    const totalGlobalUnits = Object.values(packages || {}).reduce((acc, items) => {
        return acc + items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
    }, 0);

    return (
        <div className="packing-list-print-page bg-[#f3f2f1] min-h-screen text-black font-sans print:bg-white print:p-0 print:min-h-0">
            {/* ESTILOS DE IMPRESIÓN PARA TRANSFERENCIA TÉRMICA ZEBRA 100x150 mm */}
            <style dangerouslySetInnerHTML={{
                __html: `
                /* Vista en pantalla: proporción 100x150 mm */
                .packing-list-print-page .page-container {
                    background-color: #ffffff;
                    border: 1px solid #000000 !important;
                    border-radius: 2px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                    width: 100%;
                    max-width: 480px;
                    margin: 0 auto 1.5rem auto;
                }

                /* En vista de impresión (Ctrl + P o window.print): tamaño 100x150 mm sin márgenes sobrantes */
                @media print {
                    @page { 
                        size: 100mm 150mm; 
                        margin: 2mm 3mm 2mm 3mm; 
                    }
                    body, html, #root { 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important;
                        background: #ffffff !important; 
                        color: #000000 !important; 
                        font-family: Arial, Helvetica, sans-serif !important;
                        -webkit-font-smoothing: none !important;
                        text-rendering: geometricPrecision !important;
                    }
                    * {
                        color: #000000 !important;
                        border-color: #000000 !important;
                        text-shadow: none !important;
                    }
                    .no-print { 
                        display: none !important; 
                    }
                    .packing-list-print-page {
                        background: #ffffff !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .packing-list-print-page .page-container,
                    .page-container {
                        box-shadow: none !important;
                        border: none !important;
                        outline: none !important;
                        margin: 0 auto !important;
                        padding: 1mm 1.5mm !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        background: transparent !important;
                        border-radius: 0 !important;
                        box-sizing: border-box !important;
                    }
                    .page-break {
                        break-after: page;
                        page-break-after: always;
                    }
                    /* Bloques de inversión para máximo contraste térmico */
                    .thermal-invert,
                    .thermal-invert * {
                        background-color: #000000 !important;
                        color: #ffffff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    /* Tablas optimizadas para cabezal de 203/300 DPI */
                    .packing-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                    }
                    .packing-table thead tr {
                        border-top: 2px solid #000000 !important;
                        border-bottom: 2px solid #000000 !important;
                    }
                    .packing-table tbody tr {
                        border-bottom: 1px solid #000000 !important;
                    }
                    .packing-table tfoot tr {
                        border-top: 2px solid #000000 !important;
                        border-bottom: 2px solid #000000 !important;
                    }
                    tr { 
                        break-inside: avoid; 
                    }
                }
            `}} />

            {/* BARRA DE COMANDOS (FIJA EN PANTALLA, OCULTA AL IMPRIMIR) */}
            <div className="no-print sticky top-0 z-50 bg-white border-b border-[#e1dfdd] shadow-sm">
                <div className="max-w-[480px] mx-auto px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate(-1)}
                            className="px-2.5 py-1 text-xs font-semibold text-black bg-white border border-black hover:bg-neutral-100 rounded transition-colors"
                        >
                            &larr; Volver
                        </button>
                        <div className="border-l border-neutral-300 pl-2">
                            <span className="text-xs font-bold text-black">Etiqueta 100x150 mm</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="px-3 py-1.5 text-xs font-bold bg-black hover:bg-neutral-800 text-white rounded transition-colors shadow flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>🖨️</span> Imprimir Zebra
                        </button>
                    </div>
                </div>
            </div>

            {/* CONTENEDOR DE ETIQUETAS TÉRMICAS */}
            <div className="py-4 px-2 print:p-0 print:m-0">
                {sortedPackageKeys.length === 0 ? (
                    <div className="max-w-[480px] mx-auto bg-white p-8 rounded border border-black text-center text-xs font-bold text-black">
                        No hay bultos registrados en esta orden.
                    </div>
                ) : (
                    sortedPackageKeys.map((packageKey, index) => {
                        const items = packages[packageKey] || [];
                        const boxUnits = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
                        const isLastPage = index === sortedPackageKeys.length - 1;

                        const orderFormatted = data.order_number 
                            ? (data.despatch_number && !String(data.order_number).includes('/') 
                                ? `${data.order_number}/${data.despatch_number}` 
                                : data.order_number)
                            : (data.despatch_number ? `/${data.despatch_number}` : 'N/A');

                        return (
                            <div
                                key={packageKey}
                                className={`page-container p-3 mb-4 text-black ${
                                    !isLastPage ? 'page-break' : ''
                                }`}
                            >
                                {/* 1. CABECERA: LOGO + PACKING LIST + QR */}
                                <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-1.5">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xl font-black tracking-tighter text-black">SANDVIK</span>
                                        </div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-black">
                                            PACKING LIST
                                        </p>
                                        <div className="text-[9px] font-mono font-bold text-black mt-0.5">
                                            REF: AUD-{id} | {formatDate(data.timestamp)}
                                        </div>
                                    </div>

                                    {/* CÓDIGO QR NÍTIDO CON RENDERIZADO PIXELADO */}
                                    {qrMap[packageKey] && (
                                        <div className="shrink-0 pl-2 flex flex-col items-center">
                                            <img
                                                src={qrMap[packageKey]}
                                                alt={`QR Bulto ${packageKey}`}
                                                className="w-18 h-18 object-contain"
                                                style={{ imageRendering: 'pixelated' }}
                                            />
                                            <span className="font-mono text-[8px] font-bold text-black">SCAN QR</span>
                                        </div>
                                    )}
                                </div>

                                {/* 2. BANNER INVERTIDO: BULTO DESTACADO (MÁXIMO CONTRASTE) */}
                                <div className="thermal-invert bg-black text-white px-2 py-1 mb-1.5 flex items-center justify-between border border-black">
                                    <span className="font-mono font-black text-sm tracking-wider uppercase">
                                        BULTO {packageKey} DE {totalGlobalPackages}
                                    </span>
                                    <span className="font-mono font-bold text-xs uppercase">
                                        ORDEN: {orderFormatted}
                                    </span>
                                </div>

                                {/* 3. DATOS DEL CLIENTE Y ENVÍO */}
                                <div className="border-[1.5px] border-black mb-1.5 p-1.5 bg-white text-xs">
                                    <div className="flex justify-between items-start border-b border-black pb-1 mb-1">
                                        <div className="flex-1 pr-2">
                                            <span className="text-[9px] font-black uppercase text-black block tracking-tight">
                                                DESTINATARIO / CLIENTE:
                                            </span>
                                            <span className="text-xs font-black text-black block truncate leading-tight">
                                                {data.customer_code ? `${data.customer_code} - ` : ''}
                                                {data.customer_name || 'N/A'}
                                            </span>
                                        </div>
                                        <div className="text-right shrink-0 border-l border-black pl-2">
                                            <span className="text-[8px] font-bold uppercase text-black block">
                                                TOTAL BULTO:
                                            </span>
                                            <span className="font-mono text-xs font-black text-black">
                                                {boxUnits} UDS.
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span>Total Global Envío: <strong>{totalGlobalPackages} Cajas</strong></span>
                                        <span>Total Global Orden: <strong>{totalGlobalUnits} Uds</strong></span>
                                    </div>
                                </div>

                                {/* 4. TABLA DE ÍTEMS EMPACADOS */}
                                <div className="mb-2">
                                    <table className="packing-table w-full text-xs">
                                        <thead>
                                            <tr className="border-y-2 border-black bg-neutral-100 print:bg-transparent text-[9px] font-black uppercase text-black">
                                                <th className="py-1 px-1 text-center w-8">Pos.</th>
                                                <th className="py-1 px-1 text-left w-28">Código SKU</th>
                                                <th className="py-1 px-1 text-left">Descripción</th>
                                                <th className="py-1 px-1 text-right w-12">Cant.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black font-sans">
                                            {items.length > 0 ? (
                                                items.map((item, idx) => (
                                                    <tr key={idx} className="border-b border-black">
                                                        <td className="py-1 px-1 text-center font-mono font-bold text-[9px] text-black">
                                                            {item.order_line || String((idx + 1) * 10).padStart(4, '0')}
                                                        </td>
                                                        <td className="py-1 px-1 font-mono font-black text-black text-[11px] whitespace-nowrap">
                                                            {item.item_code}
                                                        </td>
                                                        <td className="py-1 px-1 text-black text-[10px] font-semibold leading-tight">
                                                            {item.description || '-'}
                                                        </td>
                                                        <td className="py-1 px-1 text-right font-mono font-black text-xs text-black whitespace-nowrap">
                                                            {item.quantity}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="py-4 text-center text-xs font-bold text-black italic">
                                                        Bulto sin líneas registradas.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-b-2 border-black text-xs font-black">
                                                <td colSpan="3" className="py-1 px-1 text-right uppercase text-[9px] tracking-tight">
                                                    SUBTOTAL EN ESTE BULTO:
                                                </td>
                                                <td className="py-1 px-1 text-right font-mono font-black text-xs">
                                                    {boxUnits}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* 5. SECCIÓN DE FIRMAS Y CONFORMIDAD (COMPACTA PARA 150 mm) */}
                                <div className="mt-2 pt-1 border-t-2 border-black">
                                    <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-bold mb-1">
                                        <div>
                                            <div className="border-b border-black h-5 mb-0.5"></div>
                                            <span className="block uppercase leading-none">Preparado</span>
                                            <span className="text-[8px] font-normal block leading-tight">Operaciones</span>
                                        </div>
                                        <div>
                                            <div className="border-b border-black h-5 mb-0.5"></div>
                                            <span className="block uppercase leading-none">Transportador</span>
                                            <span className="text-[8px] font-normal block leading-tight">Placa / C.C.</span>
                                        </div>
                                        <div>
                                            <div className="border-b border-black h-5 mb-0.5"></div>
                                            <span className="block uppercase leading-none">Recibido</span>
                                            <span className="text-[8px] font-normal block leading-tight">Firma / Sello</span>
                                        </div>
                                    </div>

                                    {/* 6. PIE DE ETIQUETA */}
                                    <div className="flex justify-between items-center text-[8px] font-mono font-bold text-black pt-1 border-t border-black">
                                        <span>SANDVIK &bull; LOGIX WMS</span>
                                        <span>AUD-{id} &bull; BULTO {packageKey}/{totalGlobalPackages}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default PackingListPrint;

