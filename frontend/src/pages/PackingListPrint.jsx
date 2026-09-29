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
    const [printFormat, setPrintFormat] = useState(() => {
        return localStorage.getItem('logix_packing_print_format') || 'zebra';
    });

    const handleFormatChange = (newFormat) => {
        setPrintFormat(newFormat);
        try {
            localStorage.setItem('logix_packing_print_format', newFormat);
        } catch (e) {
            console.warn("No se pudo guardar la preferencia de formato", e);
        }
    };

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
                            width: 180,
                            margin: 0,
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
                        className="mt-4 px-3 py-1.5 text-xs font-semibold text-[#201f1e] bg-transparent border border-[#8a8886] hover:bg-[#f3f2f1] hover:border-[#323130] rounded transition-colors cursor-pointer"
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

    const isZebra = printFormat === 'zebra';

    return (
        <div className="packing-list-print-page bg-[#f3f2f1] min-h-screen text-black font-sans print:bg-white print:p-0 print:min-h-0">
            {/* ESTILOS DE IMPRESIÓN DINÁMICOS SEGÚN IMPRESORA / FORMATO */}
            <style dangerouslySetInnerHTML={{
                __html: `
                /* Vista en pantalla: según el formato seleccionado */
                .packing-list-print-page .page-container {
                    background-color: #ffffff;
                    border: 1px solid #000000 !important;
                    border-radius: 2px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                    width: 100%;
                    max-width: ${isZebra ? '480px' : '850px'};
                    margin: 0 auto 1.5rem auto;
                }

                /* Anulación absoluta de sombreados en pantalla */
                .packing-list-print-page .packing-table,
                .packing-list-print-page .packing-table thead,
                .packing-list-print-page .packing-table thead tr,
                .packing-list-print-page .packing-table thead th,
                .packing-list-print-page .packing-table th,
                .packing-list-print-page .packing-table tbody,
                .packing-list-print-page .packing-table tbody tr,
                .packing-list-print-page .packing-table tbody td,
                .packing-list-print-page .packing-table tfoot,
                .packing-list-print-page .packing-table tfoot tr,
                .packing-list-print-page .packing-table tfoot td,
                .packing-table thead,
                .packing-table thead tr,
                .packing-table thead th,
                .packing-table th {
                    background: transparent !important;
                    background-color: transparent !important;
                    background-image: none !important;
                }

                @media print {
                    @page { 
                        size: ${isZebra ? '100mm 150mm' : 'letter portrait'}; 
                        margin: ${isZebra ? '2mm 3mm 2mm 3mm' : '8mm 10mm 8mm 10mm'}; 
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
                        padding: ${isZebra ? '1mm 1.5mm' : '4mm 6mm'} !important;
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
                    .thermal-invert,
                    .thermal-invert * {
                        background-color: #000000 !important;
                        color: #ffffff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .packing-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        background: transparent !important;
                    }
                    .packing-table thead,
                    .packing-table thead tr,
                    .packing-table thead th,
                    .packing-table th {
                        background: transparent !important;
                        background-color: transparent !important;
                        background-image: none !important;
                    }
                    .packing-table thead tr {
                        border-top: 2px solid #000000 !important;
                        border-bottom: 2px solid #000000 !important;
                        background: transparent !important;
                    }
                    .packing-table tbody tr {
                        border-bottom: 1px solid #000000 !important;
                        background: transparent !important;
                    }
                    .packing-table tbody td {
                        background: transparent !important;
                        background-color: transparent !important;
                    }
                    .packing-table tfoot tr {
                        border-top: 2px solid #000000 !important;
                        border-bottom: 2px solid #000000 !important;
                        background: transparent !important;
                    }
                    .packing-table tfoot td {
                        background: transparent !important;
                        background-color: transparent !important;
                    }
                    tr { 
                        break-inside: avoid; 
                    }
                }
            `}} />

            {/* BARRA DE COMANDOS FLUENT UI CON SELECTOR DE FORMATO */}
            <div className="no-print sticky top-0 z-50 bg-white border-b border-[#edebe9] shadow-xs">
                <div className={`mx-auto px-4 py-2 flex items-center justify-between gap-3 ${isZebra ? 'max-w-[480px]' : 'max-w-[850px]'}`}>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate(-1)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#201f1e] bg-transparent border border-[#8a8886] hover:bg-[#f3f2f1] hover:border-[#323130] rounded transition-colors cursor-pointer"
                        >
                            &larr; Volver
                        </button>
                        <span className="text-xs font-semibold text-[#201f1e] hidden sm:inline">
                            Packing List #{id}
                        </span>
                    </div>

                    {/* SELECTOR SEGMENTADO SIN RELLENO ESTILO FLUENT UI */}
                    <div className="flex items-center border border-[#d2d0ce] bg-transparent p-0.5 rounded text-xs">
                        <button
                            type="button"
                            onClick={() => handleFormatChange('zebra')}
                            className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                                isZebra
                                    ? 'border border-[#0078d4] text-[#0078d4] font-semibold bg-transparent'
                                    : 'border border-transparent text-[#605e5c] hover:text-[#201f1e] hover:bg-[#f3f2f1] font-normal'
                            }`}
                            title="Rollo de 100x150 mm en impresora térmica Zebra"
                        >
                            Zebra (100x150)
                        </button>
                        <button
                            type="button"
                            onClick={() => handleFormatChange('letter')}
                            className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                                !isZebra
                                    ? 'border border-[#0078d4] text-[#0078d4] font-semibold bg-transparent'
                                    : 'border border-transparent text-[#605e5c] hover:text-[#201f1e] hover:bg-[#f3f2f1] font-normal'
                            }`}
                            title="Hoja Carta o A4 estándar"
                        >
                            Carta / A4
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="px-3.5 py-1.5 text-xs font-semibold bg-transparent text-[#0078d4] border border-[#0078d4] hover:bg-[#eff6fc] hover:text-[#106ebe] hover:border-[#106ebe] rounded transition-colors cursor-pointer flex items-center gap-1.5"
                        >                           
                            Imprimir {isZebra ? 'Zebra' : 'Carta'}
                        </button>
                    </div>
                </div>
            </div>

            {/* CONTENEDOR DE PÁGINAS / ETIQUETAS */}
            <div className={`mx-auto py-4 px-2 print:p-0 print:m-0 ${isZebra ? 'max-w-[480px]' : 'max-w-[850px]'}`}>
                {sortedPackageKeys.length === 0 ? (
                    <div className="bg-white p-8 rounded border border-black text-center text-xs font-semibold text-black">
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
                                className={`page-container text-black ${
                                    isZebra ? 'p-3 mb-4' : 'p-6 mb-6'
                                } ${!isLastPage ? 'page-break' : ''}`}
                            >
                                {/* 1. CABECERA */}
                                <div className={`flex items-center justify-between border-b-2 border-black ${isZebra ? 'pb-1 mb-1' : 'pb-2 mb-3'}`}>
                                    <div className="flex-1 pr-2">
                                        <div className="flex items-baseline gap-2">
                                            <span className={`${isZebra ? 'text-lg' : 'text-2xl'} font-semibold tracking-normal text-black leading-none`}>
                                                SANDVIK
                                            </span>
                                            <span className={`${isZebra ? 'text-[10px]' : 'text-sm'} font-semibold uppercase tracking-normal text-black leading-none`}>
                                                PACKING LIST
                                            </span>
                                        </div>
                                        <div className={`${isZebra ? 'text-[8px]' : 'text-[10px]'} font-mono font-semibold text-black mt-0.5 leading-tight`}>
                                            REF: AUD-{id} | {formatDate(data.timestamp)} | Pág. {index + 1} de {sortedPackageKeys.length}
                                        </div>
                                    </div>

                                    {/* CÓDIGO QR */}
                                    {qrMap[packageKey] && (
                                        <div className="shrink-0 flex items-center">
                                            <img
                                                src={qrMap[packageKey]}
                                                alt={`QR Bulto ${packageKey}`}
                                                style={{ 
                                                    width: isZebra ? '48px' : '68px', 
                                                    height: isZebra ? '48px' : '68px', 
                                                    minWidth: isZebra ? '48px' : '68px', 
                                                    imageRendering: 'pixelated' 
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* 2. BANNER DE BULTO Y PEDIDO (FONDO BLANCO CON BORDE Y TEXTO NEGRO) */}
                                <div className={`bg-white text-black border-2 border-black ${isZebra ? 'px-1.5 py-0.5 mb-1 text-xs' : 'px-3 py-1.5 mb-2 text-sm'} flex items-center justify-between`}>
                                    <span className="font-mono font-semibold tracking-normal uppercase text-black">
                                        BULTO {packageKey} DE {totalGlobalPackages}
                                    </span>
                                    <span className="font-mono font-semibold uppercase text-black">
                                        ORDEN: {orderFormatted}
                                    </span>
                                </div>

                                {/* 3. DATOS DEL CLIENTE Y ENVÍO */}
                                {isZebra ? (
                                    /* Modo Zebra: 2 líneas compactas */
                                    <div className="border border-black mb-1 px-1.5 py-0.5 bg-white text-[10px]">
                                        <div className="flex justify-between items-center leading-tight">
                                            <div className="flex-1 truncate pr-2">
                                                <span className="text-[8px] font-semibold uppercase mr-1">DESTINATARIO:</span>
                                                <span className="font-semibold text-[10px]">{data.customer_code ? `${data.customer_code} - ` : ''}{data.customer_name || 'N/A'}</span>
                                            </div>
                                            <div className="shrink-0 font-mono font-semibold text-[10px]">
                                                {boxUnits} UDS. EN BULTO
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-[8px] font-semibold text-black border-t border-black mt-0.5 pt-0.5">
                                            <span>Total Envío: {totalGlobalPackages} Cajas</span>
                                            <span>Total Orden: {totalGlobalUnits} Uds</span>
                                        </div>
                                    </div>
                                ) : (
                                    /* Modo Carta: Cuadrícula completa espaciosa */
                                    <div className="border-2 border-black mb-3 text-xs bg-white">
                                        <div className="flex items-center justify-between border-b-2 border-black px-3 py-2">
                                            <div className="flex-1 pr-4">
                                                <span className="text-[10px] font-semibold uppercase text-black block">Cliente / Destinatario:</span>
                                                <span className="text-sm font-semibold text-black block truncate">
                                                    {data.customer_code ? `${data.customer_code} - ` : ''}{data.customer_name || 'N/A'}
                                                </span>
                                            </div>
                                            <div className="text-right border-l-2 border-black pl-4 shrink-0">
                                                <span className="text-[10px] font-semibold uppercase text-black block">Total Bultos Envío:</span>
                                                <span className="text-base font-semibold font-mono text-black">{totalGlobalPackages} CAJAS</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 divide-x-2 divide-black px-3 py-2">
                                            <div>
                                                <span className="text-[10px] font-semibold uppercase text-black block">No. Orden / Despacho:</span>
                                                <span className="font-mono text-xs font-semibold text-black">{orderFormatted}</span>
                                            </div>
                                            <div className="pl-3 text-right">
                                                <span className="text-[10px] font-semibold uppercase text-black block">Total Unidades Orden:</span>
                                                <span className="font-mono text-xs font-semibold text-black">{totalGlobalUnits} uds.</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 4. TABLA DE ÍTEMS EMPACADOS */}
                                <div className={isZebra ? 'mb-1' : 'mb-3'}>
                                    <table className="packing-table w-full text-xs">
                                        <thead className="bg-transparent" style={{ backgroundColor: 'transparent', background: 'transparent' }}>
                                            <tr className={`border-y-2 border-black bg-transparent ${isZebra ? 'text-[8px]' : 'text-[10px]'} font-semibold uppercase text-black`} style={{ backgroundColor: 'transparent', background: 'transparent' }}>
                                                <th className={`${isZebra ? 'py-0.5 px-1 w-7' : 'py-1 px-2 w-10'} text-center bg-transparent`} style={{ backgroundColor: 'transparent', background: 'transparent' }}>Pos.</th>
                                                <th className={`${isZebra ? 'py-0.5 px-1 w-24' : 'py-1 px-2 w-32'} text-left bg-transparent`} style={{ backgroundColor: 'transparent', background: 'transparent' }}>Código SKU</th>
                                                <th className={`${isZebra ? 'py-0.5 px-1' : 'py-1 px-2'} text-left bg-transparent`} style={{ backgroundColor: 'transparent', background: 'transparent' }}>Descripción</th>
                                                <th className={`${isZebra ? 'py-0.5 px-1 w-10' : 'py-1 px-2 w-16'} text-right bg-transparent`} style={{ backgroundColor: 'transparent', background: 'transparent' }}>Cant.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black font-sans">
                                            {items.length > 0 ? (
                                                items.map((item, idx) => (
                                                    <tr key={idx} className="border-b border-black">
                                                        <td className={`${isZebra ? 'py-0.5 px-1 text-[8px]' : 'py-1.5 px-2 text-[10px]'} text-center font-mono font-semibold text-black`}>
                                                            {item.order_line || String((idx + 1) * 10).padStart(4, '0')}
                                                        </td>
                                                        <td className={`${isZebra ? 'py-0.5 px-1 text-[10px]' : 'py-1.5 px-2 text-xs'} font-mono font-semibold text-black whitespace-nowrap`}>
                                                            {item.item_code}
                                                        </td>
                                                        <td className={`${isZebra ? 'py-0.5 px-1 text-[9px] line-clamp-1' : 'py-1.5 px-2 text-[11px]'} text-black font-semibold leading-tight`}>
                                                            {item.description || '-'}
                                                        </td>
                                                        <td className={`${isZebra ? 'py-0.5 px-1 text-[10px]' : 'py-1.5 px-2 text-xs'} text-right font-mono font-semibold text-black whitespace-nowrap`}>
                                                            {item.quantity}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="py-2 text-center text-xs font-semibold text-black italic">
                                                        Bulto sin líneas registradas.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-b-2 border-black text-xs font-semibold">
                                                <td colSpan="3" className={`${isZebra ? 'py-0.5 px-1 text-[8px]' : 'py-1.5 px-2 text-[10px]'} text-right uppercase tracking-tight`}>
                                                    SUBTOTAL EN ESTE BULTO:
                                                </td>
                                                <td className={`${isZebra ? 'py-0.5 px-1 text-[10px]' : 'py-1.5 px-2 text-sm'} text-right font-mono font-semibold`}>
                                                    {boxUnits}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* 5. SECCIÓN DE FIRMAS */}
                                <div className={`${isZebra ? 'mt-1 pt-1 border-t-2' : 'mt-4 pt-3 border-t-2'} border-black`}>
                                    <div className={`grid grid-cols-3 ${isZebra ? 'gap-1.5 mb-0.5 text-[8px]' : 'gap-4 mb-2 text-[10px]'} text-center font-semibold`}>
                                        <div>
                                            <div className={`border-b border-black ${isZebra ? 'h-3.5 mb-0.5' : 'h-8 mb-1'}`}></div>
                                            <span className="block uppercase leading-none">Preparado</span>
                                            {!isZebra && <span className="text-[8px] font-normal block text-black mt-0.5">Operaciones SANDVIK</span>}
                                        </div>
                                        <div>
                                            <div className={`border-b border-black ${isZebra ? 'h-3.5 mb-0.5' : 'h-8 mb-1'}`}></div>
                                            <span className="block uppercase leading-none">Transportador</span>
                                            {!isZebra && <span className="text-[8px] font-normal block text-black mt-0.5">Placa / C.C.</span>}
                                        </div>
                                        <div>
                                            <div className={`border-b border-black ${isZebra ? 'h-3.5 mb-0.5' : 'h-8 mb-1'}`}></div>
                                            <span className="block uppercase leading-none">Recibido</span>
                                            {!isZebra && <span className="text-[8px] font-normal block text-black mt-0.5">Firma / Sello</span>}
                                        </div>
                                    </div>

                                    {/* 6. PIE DE ETIQUETA / DOCUMENTO */}
                                    <div className={`flex justify-between items-center ${isZebra ? 'text-[7px] pt-0.5' : 'text-[9px] pt-1.5'} font-mono font-semibold text-black border-t border-black`}>
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

