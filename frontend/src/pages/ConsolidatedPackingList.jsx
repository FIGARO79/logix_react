import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import '../styles/FluentPages.css';

const ConsolidatedPackingList = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [qrUrl, setQrUrl] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/shipments/${id}/packing_list`, { credentials: 'include' });
                if (!res.ok) throw new Error("Error al cargar datos del envío");
                const json = await res.json();
                setData(json);

                // Generar código QR del envío consolidado optimizado para escaneo instantáneo
                const ordersList = json.orders || [];
                const ordersSeq = ordersList.map(o => 
                    `${o.order_number}${o.despatch_number ? `/${o.despatch_number}` : ''}`
                ).join(', ');

                const qrLines = [
                    `SANDVIK - ENVIO CONSOLIDADO`,
                    `Envio: #${json.shipment_id || id}`,
                    `Transporte: ${json.carrier || 'N/A'}`,
                    `Ordenes: ${ordersSeq.substring(0, 40)}`,
                    `Ref: ENV-${id}`
                ];

                try {
                    const url = await QRCode.toDataURL(qrLines.join('\n'), {
                        width: 360,
                        margin: 4,
                        errorCorrectionLevel: 'L',
                        color: { dark: '#000000', light: '#ffffff' }
                    });
                    setQrUrl(url);
                } catch (qrErr) {
                    console.warn("Error generando QR para envío consolidado", qrErr);
                }
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

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleString('es-CO', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        } catch { return dateStr; }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f3f2f1] flex items-center justify-center p-6 font-segoe-ui">
                <div className="bg-white p-6 rounded border border-[#d2d0ce] shadow-sm flex items-center gap-3">
                    <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    <span className="text-xs text-[#201f1e] font-medium">Generando Packing List Consolidado...</span>
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

    // Calcular totales
    const totalOrders = data.orders ? data.orders.length : 0;
    const totalGlobalPackages = (data.orders || []).reduce((acc, o) => {
        const pkgs = o.packages ? Object.keys(o.packages).length : 0;
        return acc + pkgs;
    }, 0);

    const totalGlobalUnits = (data.orders || []).reduce((acc, o) => {
        const pkgUnits = Object.values(o.packages || {}).reduce((sum, items) => {
            return sum + items.reduce((itSum, it) => itSum + (parseFloat(it.quantity) || 0), 0);
        }, 0);
        const itemUnits = (o.items || []).reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
        return acc + (pkgUnits || itemUnits || 0);
    }, 0);

    // Obtener información única de clientes
    const uniqueClients = (data.orders || []).reduce((acc, o) => {
        const clientLabel = o.customer_code 
            ? `${o.customer_code} - ${o.customer_name}` 
            : (o.customer_name || 'CLIENTE');
        if (!acc.includes(clientLabel)) acc.push(clientLabel);
        return acc;
    }, []);
    const commonCustomerHeader = uniqueClients.join(' / ');

    return (
        <div className="consolidated-packing-list-page bg-[#f3f2f1] min-h-screen text-[#201f1e] font-segoe-ui print:bg-white print:p-0 print:min-h-0">
            {/* ESTILOS DE IMPRESIÓN LIMPIOS */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .consolidated-packing-list-page .page-container {
                    background-color: #ffffff;
                    border: 1px solid #d2d0ce !important;
                    border-radius: 4px;
                    box-shadow: 0 1.6px 3.6px 0 rgba(0,0,0,0.132), 0 0.3px 0.9px 0 rgba(0,0,0,0.108);
                }

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
                    .consolidated-packing-list-page {
                        background: #ffffff !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .consolidated-packing-list-page .page-container,
                    .page-container {
                        box-shadow: none !important;
                        border: none !important;
                        border-width: 0 !important;
                        outline: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        max-width: 100% !important;
                        width: 100% !important;
                        background: transparent !important;
                        border-radius: 0 !important;
                    }
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

            {/* BARRA DE COMANDOS FLUENT */}
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
                            <span className="text-xs font-semibold text-[#201f1e]">Envío Consolidado #{data.shipment_id || id}</span>
                            <span className="text-[11px] text-[#605e5c] ml-2">
                                ({totalOrders} pedidos | {totalGlobalPackages} bultos | {totalGlobalUnits} unidades)
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
                <div className="page-container p-8 mb-6 text-[#201f1e]">
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
                                Packing List Consolidado
                            </h1>
                            <span className="text-[10px] font-medium text-[#605e5c] uppercase tracking-wide">
                                Hoja de Envío y Despacho Consolidado
                            </span>
                        </div>

                        <div className="flex items-center gap-4 text-right">
                            <div className="text-[10px] text-[#605e5c] flex flex-col items-end justify-center">
                                <span className="font-bold text-[#201f1e] text-xs">
                                    Envío #{data.shipment_id || id}
                                </span>
                                <span className="mt-0.5">{formatDate(data.created_at)}</span>
                                <span className="font-mono text-[9px] text-[#605e5c] mt-0.5">REF: ENV-{id}</span>
                            </div>
                            {qrUrl && (
                                <div className="bg-white p-0.5 shrink-0 flex flex-col items-center">
                                    <img
                                        src={qrUrl}
                                        alt={`QR Envío ${data.shipment_id || id}`}
                                        className="w-24 h-24 object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* MATRIZ DE METADATOS DEL ENVÍO CONSOLIDADO */}
                    <div className="border border-[#c8c6c4] print:border-[#605e5c] mb-3 text-xs bg-[#faf9f8] print:bg-white print:rounded-none rounded overflow-hidden">
                        <div className="flex items-center justify-between border-b border-[#c8c6c4] print:border-[#605e5c] px-3 py-2">
                            <div className="flex-1 pr-4">
                                <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                    Cliente(s) / Destinatario(s):
                                </span>
                                <span className="text-xs font-bold text-[#201f1e] block truncate">
                                    {commonCustomerHeader || 'Varios Clientes'}
                                </span>
                            </div>
                            <div className="text-right border-l border-[#c8c6c4] print:border-[#605e5c] pl-4 shrink-0">
                                <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                    Total Bultos Consolidados:
                                </span>
                                <span className="text-sm font-bold font-mono text-[#201f1e]">
                                    {totalGlobalPackages} BULTOS
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 divide-x divide-[#c8c6c4] print:divide-[#605e5c] px-3 py-1.5 bg-white">
                            <div className="pr-2">
                                <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                    Transportadora / Vehículo:
                                </span>
                                <span className="font-mono text-xs font-bold text-[#201f1e]">
                                    {data.carrier || 'No asignada'}
                                </span>
                            </div>
                            <div className="px-3">
                                <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                    Consolidado por:
                                </span>
                                <span className="font-mono text-xs font-semibold text-[#201f1e]">
                                    {data.username || 'Operaciones'}
                                </span>
                            </div>
                            <div className="pl-3 text-right">
                                <span className="text-[9px] font-semibold uppercase text-[#605e5c] block tracking-wider">
                                    Total Pedidos:
                                </span>
                                <span className="font-mono text-xs font-bold text-[#201f1e]">
                                    {totalOrders} pedidos ({totalGlobalUnits} uds.)
                                </span>
                            </div>
                        </div>

                        {data.note && (
                            <div className="border-t border-[#c8c6c4] print:border-[#605e5c] px-3 py-1 bg-white text-[10px] text-[#605e5c]">
                                <span className="font-semibold uppercase tracking-wider mr-1">Observaciones:</span>
                                <span className="italic">{data.note}</span>
                            </div>
                        )}
                    </div>

                    {/* LISTADO DE PEDIDOS AGRUPADOS */}
                    {data.orders.length === 0 ? (
                        <div className="bg-white p-8 rounded border border-[#d2d0ce] text-center text-xs text-[#605e5c]">
                            No hay pedidos asociados a este envío consolidado.
                        </div>
                    ) : (
                        data.orders.map((order) => {
                            const sortedPkgKeys = order.packages
                                ? Object.keys(order.packages).sort((a, b) => parseInt(a) - parseInt(b))
                                : [];

                            const orderSeq = `${order.order_number}${order.despatch_number ? `/${order.despatch_number}` : ''}`;
                            const orderTotalUnits = Object.values(order.packages || {}).reduce((acc, items) => {
                                return acc + items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
                            }, 0);

                            return (
                                <div key={order.audit_id} className="mb-4 last:mb-0 break-inside-avoid">
                                    {/* CABECERA DEL PEDIDO AGRUPADO */}
                                    <div className="flex items-center justify-between border-b-2 border-[#201f1e] pb-1 mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-[#201f1e]">
                                                Orden:
                                            </span>
                                            <span className="font-mono text-xs font-bold text-[#201f1e]">
                                                {orderSeq}
                                            </span>
                                            {order.customer_name && (
                                                <span className="text-[11px] text-[#605e5c] font-medium ml-2">
                                                    &bull; {order.customer_code ? `[${order.customer_code}] ` : ''}{order.customer_name}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-[#605e5c] font-medium">
                                            {sortedPkgKeys.length} {sortedPkgKeys.length === 1 ? 'bulto' : 'bultos'} &bull; {orderTotalUnits} uds. &bull; AUD-{order.audit_id}
                                        </span>
                                    </div>

                                    {/* BULTOS DEL PEDIDO */}
                                    {sortedPkgKeys.length > 0 ? (
                                        sortedPkgKeys.map((key) => {
                                            const pkgItems = order.packages[key] || [];
                                            const pkgUnits = pkgItems.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);

                                            return (
                                                <div key={key} className="mb-2 last:mb-0">
                                                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#201f1e] bg-[#f3f2f1] px-2.5 py-0.5 border-t border-x border-[#d2d0ce] print:bg-transparent print:border-black">
                                                        <span>Bulto {key}</span>
                                                        <span className="font-normal text-[10px] text-[#605e5c] print:text-black">
                                                            {pkgItems.length} ítems &bull; {pkgUnits} unidades
                                                        </span>
                                                    </div>
                                                    <table className="packing-table w-full text-xs border border-[#d2d0ce] print:border-black">
                                                        <thead>
                                                            <tr className="border-b border-[#d2d0ce] bg-white print:border-black text-[10px]">
                                                                <th className="px-2.5 py-1 text-center font-bold uppercase w-12 text-[#201f1e]">
                                                                    Pos.
                                                                </th>
                                                                <th className="px-2.5 py-1 text-left font-bold uppercase w-28 text-[#201f1e]">
                                                                    Código SKU
                                                                </th>
                                                                <th className="px-2.5 py-1 text-left font-bold uppercase text-[#201f1e]">
                                                                    Descripción del Artículo
                                                                </th>
                                                                <th className="px-2.5 py-1 text-right font-bold uppercase w-20 text-[#201f1e]">
                                                                    Cant.
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[#e1dfdd] print:divide-[#d2d0ce]">
                                                            {pkgItems.map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-[#faf9f8] print:hover:bg-transparent">
                                                                    <td className="px-2.5 py-1 text-center font-mono text-[10px] text-[#605e5c] print:text-black">
                                                                        {item.order_line || String((idx + 1) * 10).padStart(4, '0')}
                                                                    </td>
                                                                    <td className="px-2.5 py-1 font-mono font-bold text-[#201f1e] text-[11px] whitespace-nowrap">
                                                                        {item.item_code}
                                                                    </td>
                                                                    <td className="px-2.5 py-1 text-[#201f1e] text-[11px] leading-snug">
                                                                        {item.description || '-'}
                                                                    </td>
                                                                    <td className="px-2.5 py-1 text-right font-mono font-bold text-xs text-[#201f1e] whitespace-nowrap">
                                                                        {item.quantity}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-2 px-3 text-xs text-[#605e5c] italic border border-dashed border-[#d2d0ce] rounded mb-2">
                                            Sin bultos individuales registrados.
                                        </div>
                                    )}

                                    {/* LÍNEAS DE ARTÍCULOS ADICIONALES DEL PEDIDO (SI APLICAN) */}
                                    {order.items && order.items.length > 0 && (
                                        <div className="mt-2">
                                            <div className="text-[10px] font-bold uppercase text-[#605e5c] mb-1">
                                                Resumen de Ítems de la Orden #{order.order_number}:
                                            </div>
                                            <table className="packing-table w-full text-xs border border-[#d2d0ce] print:border-black">
                                                <thead>
                                                    <tr className="border-b border-[#d2d0ce] bg-[#f3f2f1] print:bg-transparent text-[10px]">
                                                        <th className="px-2.5 py-1 text-center font-bold uppercase w-12 text-[#201f1e]">Línea</th>
                                                        <th className="px-2.5 py-1 text-left font-bold uppercase w-28 text-[#201f1e]">Código</th>
                                                        <th className="px-2.5 py-1 text-left font-bold uppercase text-[#201f1e]">Descripción</th>
                                                        <th className="px-2.5 py-1 text-right font-bold uppercase w-20 text-[#201f1e]">Cant.</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#e1dfdd] print:divide-[#d2d0ce]">
                                                    {order.items.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-[#faf9f8] print:hover:bg-transparent">
                                                            <td className="px-2.5 py-1 text-center font-mono text-[10px] text-[#605e5c] print:text-black">{item.order_line}</td>
                                                            <td className="px-2.5 py-1 font-mono font-bold text-[#201f1e] text-[11px]">{item.item_code}</td>
                                                            <td className="px-2.5 py-1 text-[#201f1e] text-[11px]">{item.description}</td>
                                                            <td className="px-2.5 py-1 text-right font-mono font-bold text-xs text-[#201f1e]">{item.quantity}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    {/* SECCIÓN DE CONFORMIDAD Y FIRMAS */}
                    <div className="mt-8 pt-4 border-t border-[#c8c6c4] print:border-[#605e5c]">
                        <p className="text-[9px] text-[#605e5c] uppercase text-center mb-6 tracking-wide">
                            Verifique el estado físico y los sellos de seguridad antes de firmar el documento de transporte consolidado.
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
                            <span className="font-mono">ENVÍO #{data.shipment_id || id} &bull; {totalOrders} PEDIDOS &bull; {totalGlobalPackages} BULTOS</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConsolidatedPackingList;
