import React, { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import Layout from '../components/Layout';
import '../styles/Label.css';

// Componente imprimible (Etiqueta real)
const PrintableLabel = React.forwardRef(({ data }, ref) => {
    if (!data) return null;

    return (
        <div ref={ref} className="w-[100mm] h-[50mm] p-2 border border-black bg-white flex flex-col justify-between mx-auto print:mx-0 print:border-none">
            {/* Estilos específicos para impresión pueden ir en CSS global o Tailwind print modifiers */}
            <div className="text-center border-b-2 border-black pb-1">
                <h1 className="text-4xl font-black tracking-tighter">{data.bin_location}</h1>
            </div>

            <div className="flex-grow flex flex-col justify-center py-1">
                <h2 className="text-lg font-bold truncate leading-tight">{data.item_code}</h2>
                <p className="text-xs break-words leading-tight max-h-[3.2em] overflow-hidden">
                    {data.description}
                </p>
            </div>

            <div className="flex justify-between items-end border-t border-black pt-1">
                <span className="text-xs">Peso: {data.weight_kg} Kg</span>
                <span className="text-xs italic">Logix WMS</span>
            </div>
        </div>
    );
});

const LabelPrinting = () => {
    const [itemCode, setItemCode] = useState('');
    const [labelData, setLabelData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const componentRef = useRef();

    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        documentTitle: labelData ? `Label_${labelData.item_code}` : 'Label',
    });

    const searchItem = async (e) => {
        e.preventDefault();
        if (!itemCode) return;

        setLoading(true);
        setError(null);
        setLabelData(null);

        try {
            const response = await fetch(`http://localhost:8000/api/get_item_details/${itemCode}`);
            if (!response.ok) {
                if (response.status === 404) throw new Error('Artículo no encontrado');
                throw new Error('Error de conexión');
            }
            const data = await response.json();
            setLabelData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout title="Impresión de Etiquetas">
            <div className="max-w-3xl mx-auto px-4 py-8">

                {/* Search Box */}
                <div className="bg-white p-6 rounded-lg shadow-md mb-8 border-l-4 border-yellow-400">
                    <form onSubmit={searchItem} className="flex gap-4 items-end">
                        <div className="flex-grow">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Escanear o Ingresar Código</label>
                            <input
                                type="text"
                                value={itemCode}
                                onChange={(e) => setItemCode(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-500 focus:ring focus:ring-yellow-500 focus:ring-opacity-50 border p-2 text-lg uppercase"
                                placeholder="Código..."
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-[#2c3e50] hover:bg-[#1a252f] text-white font-bold py-2 px-6 rounded shadow transition-colors"
                        >
                            {loading ? '...' : 'Buscar'}
                        </button>
                    </form>
                    {error && <p className="mt-3 text-red-600 font-medium text-sm">{error}</p>}
                </div>

                {/* Preview & Print Action */}
                {labelData && (
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        {/* Preview Container */}
                        <div className="bg-gray-200 p-8 rounded-lg shadow-inner flex justify-center items-center flex-grow w-full md:w-auto">
                            <div className="bg-white shadow-xl transform scale-100 hover:scale-105 transition-transform duration-300">
                                {/* Pass ref to functional component via forwardRef */}
                                <PrintableLabel ref={componentRef} data={labelData} />
                            </div>
                        </div>

                        {/* Actions Side */}
                        <div className="w-full md:w-64 bg-white p-6 rounded-lg shadow-md flex flex-col gap-4">
                            <h3 className="font-bold text-gray-700 border-b pb-2">Acciones</h3>
                            <button
                                onClick={handlePrint}
                                className="w-full bg-[#0070d2] hover:bg-[#005fb2] text-white font-bold py-3 px-4 rounded shadow-lg flex items-center justify-center gap-2 transform active:scale-95 transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                IMPRIMIR
                            </button>
                            <button
                                onClick={() => { setLabelData(null); setItemCode(''); document.querySelector('input').focus(); }}
                                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded shadow transition-colors"
                            >
                                Limpiar
                            </button>

                            <div className="mt-4 text-xs text-gray-500">
                                <p>Tamaño etiqueta: 100x50mm</p>
                                <p>Asegúrese de configurar la impresora en modo "Etiqueta" y sin márgenes.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default LabelPrinting;
