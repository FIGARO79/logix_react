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
            <div className="text-center mb-8 border-b pb-4 print:mb-4">
                <h1 className="text-3xl font-extrabold uppercase tracking-wide mb-2 print:text-2xl">Packing List</h1>
                <div className="text-sm text-gray-500">
                    {data.timestamp || ''}
                    {isMultiPage && (
                        <span className="ml-4 font-bold text-black border-l pl-4 print:inline">
                            PÁGINA {currentPage} DE {totalPages}
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 text-sm print:gap-4 print:mb-4">
                <div>
                    <p className="font-bold text-gray-500 uppercase text-xs">Cliente</p>
                    <p className="text-lg font-semibold">{data.customer_name || ''}</p>
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
        </>
    );

    // Componente para la tabla de un bulto (Reusable)
    const PackageTable = ({ keyName, packageData }) => (
        <div className="border rounded-lg break-inside-avoid shadow-sm print:shadow-none print:border-gray-300 print:mb-4" style={{ pageBreakInside: 'avoid' }}>
            <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center print:bg-gray-50 print:py-1">
                <h3 className="font-bold text-lg print:text-base">Bulto #{keyName}</h3>
                <span className="text-xs text-gray-500 font-mono">BOX-{keyName.padStart(3, '0')}</span>
            </div>
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>
                        <th className="px-4 py-2 text-left w-1/4 print:py-1">Código</th>
                        <th className="px-4 py-2 text-left w-1/2 print:py-1">Descripción</th>
                        <th className="px-4 py-2 text-right w-1/4 print:py-1">Cantidad</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {packageData && packageData.length > 0 ? (
                        packageData.map((item, idx) => (
                            <tr key={idx}>
                                <td className="px-4 py-2 font-mono text-gray-700 print:py-1">{item.item_code}</td>
                                <td className="px-4 py-2 text-gray-600 truncate max-w-xs print:py-1">{item.description}</td>
                                <td className="px-4 py-2 text-right font-bold print:py-1">{item.quantity}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="3" className="px-4 py-4 text-center text-gray-500 italic">Bulto vacío</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="bg-white min-h-screen text-black p-8 font-sans print:p-0">
            {/* Control Bar - Hidden when printing */}
            <div className="no-print mb-6 sticky top-0 bg-white border-b shadow-sm z-10 print:hidden">
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
                            className="bg-[#285f94] text-white px-4 py-2 rounded hover:bg-[#1e4a74] font-bold"
                        >
                            Imprimir
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="max-w-3xl mx-auto print:max-w-none print:w-full">
                {isMultiPage ? (
                    // VISTA MULTI-PÁGINA: Un encabezado y un bulto por página
                    sortedPackageKeys.map((key, index) => (
                        <div
                            key={key}
                            className="border p-8 bg-white mb-8 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0"
                            style={index < sortedPackageKeys.length - 1 ? { pageBreakAfter: 'always' } : {}}
                        >
                            <HeaderAndInfo currentPage={index + 1} totalPages={sortedPackageKeys.length} />
                            <PackageTable keyName={key} packageData={packages[key]} />
                            <div className="mt-12 pt-8 border-t text-center text-xs text-gray-400 print:mt-auto print:pt-4">
                                <p>Logix - Sistema de Gestión de Almacén</p>
                            </div>
                        </div>
                    ))
                ) : (
                    // VISTA CONSOLIDADA: Un encabezado para hasta 2 bultos
                    <div className="border p-8 bg-white shadow-sm print:border-none print:shadow-none print:p-0">
                        <HeaderAndInfo />
                        <div className="space-y-6 print:space-y-4">
                            {sortedPackageKeys.length === 0 ? (
                                <div className="text-center py-8 border rounded-lg bg-gray-50 print:bg-transparent print:border-gray-200">
                                    <h3 className="text-lg font-bold text-gray-500 mb-2">Sin Contenido</h3>
                                    <p className="text-gray-500 italic">No hay items asignados a bultos para este pedido.</p>
                                </div>
                            ) : (
                                sortedPackageKeys.map((key) => (
                                    <PackageTable key={key} keyName={key} packageData={packages[key]} />
                                ))
                            )}
                        </div>
                        <div className="mt-12 pt-8 border-t text-center text-xs text-gray-400 print:mt-8 print:pt-4">
                            <p>Logix - Sistema de Gestión de Almacén</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PackingListPrint;
