import React, { useEffect, useState } from 'react';

const Reconciliation = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch data from new API
        fetch('http://localhost:8000/api/views/reconciliation')
            .then(res => res.json())
            .then(response => {
                if (response.data) setData(response.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching reconciliation data:", err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="p-4">Cargando datos...</div>;

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 text-[#2c3e50]">Reconciliación</h2>
            <div className="overflow-x-auto shadow-md rounded-lg">
                <table className="min-w-full leading-normal">
                    <thead>
                        <tr className="bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            <th className="px-5 py-3 border-b-2 border-gray-200">GRN</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Item</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Descripción</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Esperada</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Recibida</th>
                            <th className="px-5 py-3 border-b-2 border-gray-200">Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, idx) => (
                            <tr key={idx} className="bg-white hover:bg-gray-50 text-sm">
                                <td className="px-5 py-5 border-b border-gray-200">{row.GRN}</td>
                                <td className="px-5 py-5 border-b border-gray-200">{row.Codigo_Item}</td>
                                <td className="px-5 py-5 border-b border-gray-200">{row.Descripcion}</td>
                                <td className="px-5 py-5 border-b border-gray-200">{row.Cant_Esperada}</td>
                                <td className="px-5 py-5 border-b border-gray-200">{row.Cant_Recibida}</td>
                                <td className={`px-5 py-5 border-b border-gray-200 font-bold ${row.Diferencia !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {row.Diferencia}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Reconciliation;
