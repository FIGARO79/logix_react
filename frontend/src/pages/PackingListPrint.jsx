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
                const clientStr = json.customer_code
                    ? `${json.customer_code} - ${json.customer_name || 'N/A'}`
                    : (json.customer_name || 'N/A');

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
                            width: 360,
                            margin: 4,
                            errorCorrectionLevel: 'L',
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
        <div className="packing-list-print-page bg-[#f3f2f1] min-h-screen text-[#201f1e] font-segoe-ui print:bg-white print:p-0 print:min-h-0">
            {/* ESTILOS DE IMPRESIÓN LIMPIOS Y NEUTRALIZACIÓN DE BORDES AZULES */}
            <style dangerouslySetInnerHTML={{
                __html: `
                /* En pantalla: borde gris neutro sutil para simular la hoja (anula el forzado global #1679E0) */
                .packing-list-print-page .page-container {
                    background-color: #ffffff;
                    border: 1px solid #d2d0ce !important;
                    border-radius: 4px;
                    box-shadow: 0 1.6px 3.6px 0 rgba(0,0,0,0.132), 0 0.3px 0.9px 0 rgba(0,0,0,0.108);
                }

                .packing-list-print-page div.bg-white.border,
                .packing-list-print-page div.bg-white.border-2,
                .packing-list-print-page div[class*="bg-white"][class*="border-"] {
                    border-color: #d2d0ce !important;
                }

                /* En vista de impresión (Ctrl + P o window.print): cero bordes en el contenedor */
                @media print {
                    @page { 
                        size: A4 portrait; 
                        margin: 10mm 12mm 10mm 12mm; 
                    }
                    body, html, #root { 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important;
                        background: #ffffff !important; 
                        color: #000000 !important; 
                    }
                    .no-print { 
                        display: none !important; 
                    }
                    .packing-list-print-page {
                        background: #ffffff !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    /* ELIMINAR COMPLETAMENTE EL RECUADRO EXTERIOR EN LA IMPRESIÓN */
                    .packing-list-print-page .page-container,
                    .page-container {
                        box-shadow: none !important;
                        border: none !important;
                        border-width: 0 !important;
                        border-style: none !important;
                        border-color: transparent !important;
                        outline: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        max-width: 100% !important;
                        width: 100% !important;
                        background: transparent !important;
                        border-radius: 0 !important;
                    }
                    .page-break {
                        break-after: page;
                        page-break-after: always;
                    }
                    /* ESTILOS REFINADOS PARA TABLAS Y LÍNEAS DE IMPRESIÓN */
                    .packing-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                    }
                    .packing-table thead tr {
                        border-top: 1.5px solid #201f1e !important;
                        border-bottom: 1.5px solid #201f1e !important;
                    }
                    .packing-table tbody tr {
                        border-bottom: 1px solid #e1dfdd !important;
                    }
                    .packing-table tfoot tr {
                        border-top: 1.5px solid #201f1e !important;
                        border-bottom: 1.5px solid #201f1e !important;
                    }
                    tr { 
                        break-inside: avoid; 
                    }
                }
            `}} />

            {/* BARRA DE COMANDOS FLUENT (FIJA EN PANTALLA, OCULTA AL IMPRIMIR) */}
            <div className="no-print sticky top-0 z-50 bg-white border-b border-[#e1dfdd] shadow-sm">
                <div className="max-w-[850px] mx-auto px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="px-3 py-1 text-xs font-medium text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f2f1] rounded transition-colors"
                        >
                            &larr; Volver
                        </button>
                        <div className="border-l border-[#e1dfdd] pl-3">
                            <span className="text-xs font-semibold text-[#201f1e]">Packing List #{id}</span>
                            <span className="text-[11px] text-[#605e5c] ml-2">
                                ({totalGlobalPackages} bultos | {totalGlobalUnits} unidades)
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="px-4 py-1.5 text-xs font-medium bg-black hover:bg-neutral-800 text-white rounded transition-colors shadow-sm flex items-center gap-1.5"
                        >
                            <span>🖨️</span> Imprimir Documento
                        </button>
                    </div>
                </div>
            </div>

            {/* CONTENEDOR TIPO HOJA A4 */}
            <div className="max-w-[850px] mx-auto py-6 px-4 print:p-0 print:m-0 print:max-w-none">
                {sortedPackageKeys.length === 0 ? (
                    <div className="bg-white p-12 rounded border border-[#d2d0ce] text-center text-xs text-[#605e5c]">
                        No hay bultos registrados en esta orden.
                    </div>
                ) : (
                    sortedPackageKeys.map((packageKey, index) => {
                        const items = packages[packageKey] || [];
                        const boxUnits = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
                        const isLastPage = index === sortedPackageKeys.length - 1;

                        return (
                            <div
                                key={packageKey}
                                className={`page-container p-8 mb-6 text-[#201f1e] ${
                                    !isLastPage ? 'page-break' : ''
                                }`}
                            >
                                {/* CABECERA INSTITUCIONAL */}
                                <div className="flex items-start justify-between border-b border-[#201f1e] pb-1.5 mb-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl font-bold tracking-tight text-[#201f1e]">SANDVIK</span>
                                        </div>
                                        <p className="text-[10px] uppercase tracking-wider text-[#605e5c] mt-0.5 font-medium">
                                            Despacho y Logística
                                        </p>
                                    </div>
                                    <div className="text-center pt-1">
                                        <h1 className="text-lg font-bold uppercase tracking-wider text-[#201f1e]">
                                            Packing List
                                        </h1>
                                        <span className="text-[10px] font-medium text-[#605e5c] uppercase tracking-wide">
                                            Lista de Empaque y Despacho
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4 text-right">
                                        <div className="text-[10px] text-[#605e5c] flex flex-col items-end justify-center">
                                            <span className="font-bold text-[#201f1e] text-xs">
                                                Pág. {index + 1} de {sortedPackageKeys.length}
                                            </span>
                                            <span className="mt-0.5">{formatDate(data.timestamp)}</span>
                                            <span className="font-mono text-[9px] text-[#605e5c] mt-0.5">REF: AUD-{id}</span>
                                        </div>
                                        {qrMap[packageKey] && (
                                            <div className="bg-white p-0.5 shrink-0 flex flex-col items-center">
                                                <img
                                                    src={qrMap[packageKey]}
                                                    alt={`QR Bulto ${packageKey}`}
                                                    className="w-24 h-24 object-contain"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* MATRIZ DE METADATOS DEL PEDIDO */}
                                <div className="border border-[#c8c6c4] print:border-[#605e5c] mb-3 text-xs bg-[#faf9f8] print:bg-white print:rounded-none rounded overflow-hidden">
                                    <div className="flex items-center justify-between border-b border-[#c8c6c4] print:border-[#605e5c] px-3 py-2">
                                        <div className="flex-1 pr-4">
                                            <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                                Cliente / Destinatario:
                                            </span>
                                            <span className="text-xs font-bold text-[#201f1e] block truncate">
                                                {data.customer_code ? `${data.customer_code} - ` : ''}
                                                {data.customer_name || 'N/A'}
                                            </span>
                                        </div>
                                        <div className="text-right border-l border-[#c8c6c4] print:border-[#605e5c] pl-4 shrink-0">
                                            <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                                Total Bultos Envío:
                                            </span>
                                            <span className="text-sm font-bold font-mono text-[#201f1e]">
                                                {totalGlobalPackages} CAJAS
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 divide-x divide-[#c8c6c4] print:divide-[#605e5c] px-3 py-1.5 bg-white">
                                        <div className="pr-2">
                                            <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                                No. Orden (Pedido / Despacho):
                                            </span>
                                            <span className="font-mono text-xs font-bold text-[#201f1e]">
                                                {data.order_number 
                                                    ? (data.despatch_number && !String(data.order_number).includes('/') 
                                                        ? `${data.order_number}/${data.despatch_number}` 
                                                        : data.order_number)
                                                    : (data.despatch_number ? `/${data.despatch_number}` : 'N/A')}
                                            </span>
                                        </div>
                                        <div className="pl-3 text-right">
                                            <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                                Total Unidades Orden:
                                            </span>
                                            <span className="font-mono text-xs font-bold text-[#201f1e]">
                                                {totalGlobalUnits} uds.
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* SECCIÓN DEL BULTO ESPECÍFICO */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between border-b-2 border-[#201f1e] pb-1 mb-1.5">
                                        <span className="font-bold uppercase tracking-wider text-xs text-[#201f1e]">
                                            Bulto {packageKey} de {totalGlobalPackages}
                                        </span>
                                        <span className="text-[11px] text-[#605e5c] font-medium">
                                            Contenido: {items.length} {items.length === 1 ? 'ítem' : 'ítems'} &bull; {boxUnits} {boxUnits === 1 ? 'unidad' : 'unidades'}
                                        </span>
                                    </div>

                                    {/* TABLA DE PRODUCTOS REFINADA */}
                                    <table className="packing-table w-full text-xs">
                                        <thead>
                                            <tr className="border-y border-[#323130] bg-[#f3f2f1] print:bg-transparent text-[10px]">
                                                <th className="px-3 py-1.5 text-center font-bold uppercase w-12 text-[#201f1e]">
                                                    Pos.
                                                </th>
                                                <th className="px-3 py-1.5 text-left font-bold uppercase w-32 text-[#201f1e]">
                                                    Código SKU
                                                </th>
                                                <th className="px-3 py-1.5 text-left font-bold uppercase text-[#201f1e]">
                                                    Descripción del Artículo
                                                </th>
                                                <th className="px-3 py-1.5 text-right font-bold uppercase w-20 text-[#201f1e]">
                                                    Cant.
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e1dfdd] print:divide-[#d2d0ce]">
                                            {items.length > 0 ? (
                                                items.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-[#faf9f8] print:hover:bg-transparent">
                                                        <td className="px-3 py-1.5 text-center font-mono text-[10px] text-[#605e5c] print:text-black">
                                                            {item.order_line || String((idx + 1) * 10).padStart(4, '0')}
                                                        </td>
                                                        <td className="px-3 py-1.5 font-mono font-bold text-[#201f1e] text-[11px] whitespace-nowrap">
                                                            {item.item_code}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-[#201f1e] text-[11px] leading-snug">
                                                            {item.description || '-'}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-right font-mono font-bold text-xs text-[#201f1e] whitespace-nowrap">
                                                            {item.quantity}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="py-6 text-center text-xs text-[#605e5c] italic">
                                                        Bulto sin líneas registradas.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-[#201f1e] border-b border-[#201f1e] text-xs font-semibold bg-[#faf9f8] print:bg-transparent">
                                                <td colSpan="3" className="px-3 py-1.5 text-right uppercase text-[10px] tracking-wider text-[#605e5c] print:text-black">
                                                    Subtotal Unidades en este Bulto:
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-sm text-[#201f1e]">
                                                    {boxUnits}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* SECCIÓN DE CONFORMIDAD Y FIRMAS */}
                                <div className="mt-8 pt-4 border-t border-[#c8c6c4] print:border-[#605e5c]">
                                    <p className="text-[9px] text-[#605e5c] uppercase text-center mb-6 tracking-wide">
                                        Verifique el estado físico y los sellos de seguridad antes de firmar el documento de transporte.
                                    </p>
                                    <div className="grid grid-cols-3 gap-8 text-center text-xs">
                                        <div>
                                            <div className="border-b border-[#605e5c] mb-1 h-8"></div>
                                            <span className="text-[10px] font-semibold text-[#201f1e] block uppercase">
                                                Preparado / Auditado
                                            </span>
                                            <span className="text-[9px] text-[#605e5c] block">Operaciones SANDVIK</span>
                                        </div>
                                        <div>
                                            <div className="border-b border-[#605e5c] mb-1 h-8"></div>
                                            <span className="text-[10px] font-semibold text-[#201f1e] block uppercase">
                                                Transportador / Conductor
                                            </span>
                                            <span className="text-[9px] text-[#605e5c] block">C.C. / Placa</span>
                                        </div>
                                        <div>
                                            <div className="border-b border-[#605e5c] mb-1 h-8"></div>
                                            <span className="text-[10px] font-semibold text-[#201f1e] block uppercase">
                                                Recibido Conforme (Cliente)
                                            </span>
                                            <span className="text-[9px] text-[#605e5c] block">Firma, Nombre y Sello</span>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-between items-center text-[9px] text-[#605e5c] pt-2 border-t border-[#edebe9] print:border-gray-300">
                                        <span>Documento generado para SANDVIK &bull; LOGIX WMS</span>
                                        <span className="font-mono">ID: {id} &bull; Bulto {packageKey} de {totalGlobalPackages}</span>
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
