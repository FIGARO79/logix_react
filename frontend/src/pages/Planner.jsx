import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';

const Planner = () => {
    const [config, setConfig] = useState({ start_date: '', end_date: '', holidays: [] });
    const [planData, setPlanData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    // Initial Load
    useEffect(() => {
        const fetchConfigAndPlan = async () => {
            try {
                // Load Current Config
                const configRes = await fetch('http://localhost:8000/api/planner/config');
                if (configRes.ok) {
                    const configData = await configRes.json();
                    setConfig(prev => ({ ...prev, ...configData }));
                }

                // Load Saved Plan
                const planRes = await fetch('http://localhost:8000/api/planner/current_plan');
                if (planRes.ok) {
                    const savedPlan = await planRes.json();
                    if (Array.isArray(savedPlan)) {
                        setPlanData(savedPlan);
                    }
                }

            } catch (err) {
                console.error("Error loading planner data", err);
            }
        };
        fetchConfigAndPlan();
    }, []);

    const handleGeneratePlan = async () => {
        setLoading(true);
        setError(null);
        try {
            // Use update_count_plan to generate AND save
            const queryParams = new URLSearchParams({
                start_date: config.start_date,
                end_date: config.end_date
            });

            const response = await fetch(`http://localhost:8000/api/planner/update_plan?${queryParams}`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Error al generar el plan');

            const data = await response.json();
            setPlanData(data);
            setMessage("Plan generado y guardado correctamente.");

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        setSaving(true);
        try {
            const response = await fetch('http://localhost:8000/api/planner/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!response.ok) throw new Error('Error al guardar configuración');
            setMessage("Configuración de fechas guardada.");
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadExcel = async () => {
        // Direct link to download
        const queryParams = new URLSearchParams({
            start_date: config.start_date,
            end_date: config.end_date
        });
        window.open(`http://localhost:8000/api/planner/generate?${queryParams}`, '_blank');
    };

    return (
        <Layout title="Planificador de Conteos (ABC)">
            <div className="max-w-7xl mx-auto px-4 py-8">

                {/* Configuration Card */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-[#0070d2]">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Configuración del Ciclo</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                        <div className="flex flex-col">
                            <label className="text-sm font-semibold text-gray-600 mb-1">Fecha Inicio</label>
                            <input
                                type="date"
                                className="form-input rounded-md border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50"
                                value={config.start_date}
                                onChange={(e) => setConfig({ ...config, start_date: e.target.value })}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm font-semibold text-gray-600 mb-1">Fecha Fin</label>
                            <input
                                type="date"
                                className="form-input rounded-md border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50"
                                value={config.end_date}
                                onChange={(e) => setConfig({ ...config, end_date: e.target.value })}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSaveConfig}
                                disabled={saving}
                                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded shadow transition-colors flex-grow"
                            >
                                {saving ? 'Guardando...' : 'Guardar Fechas'}
                            </button>
                            <button
                                onClick={handleGeneratePlan}
                                disabled={loading || !config.start_date || !config.end_date}
                                className="bg-[#0070d2] hover:bg-[#005fb2] text-white font-bold py-2 px-4 rounded shadow transition-colors flex-grow"
                            >
                                {loading ? 'Generando...' : 'Generar Plan'}
                            </button>
                        </div>
                    </div>
                    {message && <p className="mt-3 text-green-600 font-medium">{message}</p>}
                    {error && <p className="mt-3 text-red-600 font-medium">{error}</p>}
                </div>

                {/* Actions Bar */}
                {planData.length > 0 && (
                    <div className="flex justify-end gap-4 mb-4">
                        <button
                            onClick={handleDownloadExcel}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Descargar Excel
                        </button>
                        <Link
                            to="/planner/execution"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded shadow flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                            Ir a Ejecución Diaria
                        </Link>
                    </div>
                )}

                {/* Plan Preview Table */}
                {planData.length > 0 && (
                    <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">
                                Vista Previa del Plan ({planData.length} registros)
                            </h3>
                        </div>
                        <div className="overflow-x-auto max-h-[600px]">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0 md:static">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Plan</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ítem</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ABC</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frecuencia</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Costo</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {planData.slice(0, 100).map((row, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.Planned_Date}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.Item_Code}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${row.ABC_Code === 'A' ? 'bg-green-100 text-green-800' :
                                                        row.ABC_Code === 'B' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {row.ABC_Code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.Frequency}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${parseFloat(row.Cost_per_Unit || 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {planData.length > 100 && (
                                <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500">
                                    Mostrando primeros 100 de {planData.length} registros...
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default Planner;
