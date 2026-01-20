import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const PackingListPrint = () => {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/picking/packing_list/${id}`);
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
    }, [id]);

    if (loading) return <div className="p-8">Generando Packing List...</div>;
    if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
    if (!data) return <div className="p-8">No datos.</div>;

    const { packages } = data;
    const sortedPackageKeys = Object.keys(packages).sort((a, b) => parseInt(a) - parseInt(b));

    return (
        <div className="bg-white min-h-screen text-black p-8 font-sans">
            <style>{`
                @media print {
                    @page { margin: 1cm; size: A4; }
                    body { -webkit-print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .page-break { page-break-inside: avoid; margin-bottom: 2rem; }
                }
            `}</style>

            <div className="no-print mb-6 sticky top-0 bg-white border-b p-4 shadow-sm z-10 flex justify-between items-center">
                <h1 className="text-lg font-bold">Vista Previa Packing List</h1>
                <div className="flex gap-4">
                    <button
                        onClick={() => window.close()}
                        className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                    >
                        Cerrar
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-bold"
                    >
                        Imprimir
                    </button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto border p-8 print:border-none print:p-0">

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
                            <div key={key} className="page-break border rounded-lg overflow-hidden break-inside-avoid shadow-sm print:shadow-none print:border-gray-300">
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
        </div>
    );
};

export default PackingListPrint;
