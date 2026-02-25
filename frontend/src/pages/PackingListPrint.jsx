import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const PackingListPrint = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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

    const handlePrint = () => {
        // Simple, robust fallback to native printing
        // The CSS has 'print:hidden' for non-printable areas
        window.print();
    };

    if (loading) return <div className="p-8">Generando Packing List...</div>;
    if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
    if (!data) return <div className="p-8">No datos.</div>;

    const { packages } = data;
    const sortedPackageKeys = packages ? Object.keys(packages).sort((a, b) => parseInt(a) - parseInt(b)) : [];
    const isMultiPage = data.total_packages > 2;

    // Componente para el encabezado y la información del pedido (Reusable)
    const HeaderAndInfo = ({ currentPage, totalPages }) => (
        <>
            <div className="text-center mb-6 border-b border-black pb-4 print:mb-4">
                <h1 className="text-4xl uppercase tracking-tight mb-1 print:text-3xl text-black">Packing List</h1>
                <div className="text-xs text-gray-500 print:text-black">
                    {data.timestamp || ''}
                    <span className="ml-4 text-black border-l border-black pl-4 print:inline text-sm">
                        PÁGINA {currentPage} DE {totalPages}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm print:gap-2 print:mb-2">
                <div className="pb-1 border-b border-gray-100">
                    <span className="text-gray-500 uppercase text-[9px] print:text-black mr-2">Cliente:</span>
                    <span className="text-lg text-black leading-tight">{data.customer_name || 'N/A'}</span>
                </div>
                <div className="text-right pb-1 border-b border-gray-100">
                    <span className="text-gray-500 uppercase text-[9px] print:text-black mr-2">Total Bultos:</span>
                    <span className="text-xl text-[#285f94] print:text-black">{data.total_packages}</span>
                </div>
                <div className="col-span-2">
                    <span className="text-gray-500 uppercase text-[9px] print:text-black mr-2">Pedido / Despacho:</span>
                    <span className="text-base text-black">
                        {data.order_number} <span className="mx-1 text-gray-300">/</span> {data.despatch_number}
                    </span>
                </div>
            </div>
        </>
    );

    // Componente para la tabla de un bulto (Reusable)
    const PackageTable = ({ keyName, packageData }) => (
        <div className="border border-black rounded-lg overflow-hidden print:border-black print:rounded-none">
            <div className="bg-white text-black px-4 py-3 border-b border-black flex justify-between items-center print:py-2">
                <h3 className="text-xl uppercase">Bulto #{keyName}</h3>
                <span className="text-sm font-mono border border-black px-2 py-1 rounded">BOX-{keyName.padStart(3, '0')}</span>
            </div>
            <table className="min-w-full text-base">
                <thead className="bg-white text-black border-b border-black">
                    <tr>
                        <th className="px-4 py-1 text-left w-12 uppercase text-[10px] print:py-1">Línea</th>
                        <th className="px-4 py-1 text-left w-1/4 uppercase text-[10px] print:py-1">Código</th>
                        <th className="px-4 py-1 text-left w-1/2 uppercase text-[10px] print:py-1">Descripción</th>
                        <th className="px-4 py-1 text-right w-1/4 uppercase text-[10px] print:py-1">Cantidad</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 print:divide-black">
                    {packageData && packageData.length > 0 ? (
                        packageData.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 print:bg-transparent">
                                <td className="px-4 py-1 font-mono text-black text-[10px] text-gray-400 print:py-1">{item.order_line}</td>
                                <td className="px-4 py-1 font-mono text-black text-[11px] print:py-1">{item.item_code}</td>
                                <td className="px-4 py-1 text-black text-[11px] print:py-1">{item.description}</td>
                                <td className="px-4 py-1 text-right text-sm print:py-1">{item.quantity}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="3" className="px-4 py-8 text-center text-gray-500 italic">Bulto sin ítems registrados</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="bg-white min-h-screen text-black p-8 font-sans print:p-0">
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { margin: 1cm; }
                    body { -webkit-print-color-adjust: exact; color: #000 !important; background: #fff !important; }
                    thead, th, tr, td { background-color: transparent !important; background-image: none !important; color: #000 !important; }
                    .print-pure-black { color: #000 !important; border-color: #000 !important; }
                    .print-no-shadow { box-shadow: none !important; }
                    .print-bg-none { background: none !important; }
                    .print-border-bold { border-width: 1.5pt !important; border-color: #000 !important; }
                }
            `}} />

            {/* Control Bar - Hidden when printing */}
            <div className="no-print mb-6 sticky top-0 bg-white border-b shadow-sm z-10 print:hidden">
                <div className="max-w-3xl mx-auto flex justify-between items-center p-4">
                    <h1 className="text-lg text-[#285f94]">Vista Previa Packing List</h1>
                    <div className="flex gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition-colors"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handlePrint}
                            className="bg-[#285f94] text-white px-4 py-2 rounded hover:bg-[#1e4a74] shadow-md transition-all active:scale-95"
                        >
                            Imprimir
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="max-w-3xl mx-auto print:max-w-none print:w-full">
                {sortedPackageKeys.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                        <h3 className="text-xl text-gray-400 mb-2">Sin Bultos Asignados</h3>
                        <p className="text-gray-500">No hay contenido disponible para imprimir en este pedido.</p>
                    </div>
                ) : (
                    sortedPackageKeys.map((key, index) => (
                        <div
                            key={key}
                            className={`border p-8 bg-white mb-8 shadow-md rounded-lg print:border-none print:shadow-none print:p-0 print:m-0 print:rounded-none`}
                            style={index < sortedPackageKeys.length - 1 ? { pageBreakAfter: 'always' } : {}}
                        >
                            <HeaderAndInfo currentPage={index + 1} totalPages={sortedPackageKeys.length} />

                            <div className="mt-4 print:mt-2">
                                <PackageTable keyName={key} packageData={packages[key]} />
                            </div>

                            <div className="mt-8 pt-4 border-t border-gray-100 flex justify-center items-center text-[9px] text-gray-400 print:mt-12 print:border-gray-300 print:text-black">
                                <p className="tracking-widest uppercase">LOGIX - WMS</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default PackingListPrint;
