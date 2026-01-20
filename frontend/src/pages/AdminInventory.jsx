import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';

const AdminInventory = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [stage, setStage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/admin/inventory/summary');
            if (res.status === 401 || res.status === 403) {
                navigate('/admin/login'); // Redirect to admin login if unauthorized
                return;
            }
            if (!res.ok) throw new Error("Error al cargar estadísticas");
            const data = await res.json();
            setStats(data.stats);
            setStage(data.stage);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const handleAction = async (actionUrl, confirmText) => {
        if (!window.confirm(confirmText)) return;

        setLoading(true);
        setMessage(null);
        setError(null);

        try {
            const res = await fetch(actionUrl, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error en la operación");
            }
            const data = await res.json();
            setMessage(data.message);
            fetchStats(); // Reload state
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = (stageNum) => {
        // Direct link download
        window.location.href = `/api/export_recount_list/${stageNum}`;
    };

    const handleReport = () => {
        window.location.href = `/admin/inventory/report`;
    };

    return (
        <Layout title="Administración de Inventario"> {/* Layout might need adjustment if sidebar is not desired for admin, but consistency is good */}
            <div className="max-w-7xl mx-auto px-4 py-8">

                {/* Header / Shell Bar already in Layout, but let's add specific Admin Header if needed or just use Page Title */}
                <div className="flex justify-between items-center mb-8 border-b pb-4">
                    <h1 className="text-3xl font-bold text-gray-800">Panel de Control de Inventario</h1>
                    <div className="flex gap-4">
                        <button
                            onClick={() => navigate('/admin/users')}
                            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                        >
                            Gestionar Usuarios
                        </button>
                    </div>
                </div>

                {message && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">{message}</div>}
                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">{error}</div>}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Cycle Control */}
                    <div className="space-y-6">
                        {/* Current Stage */}
                        <div className="bg-white p-6 rounded-lg shadow-md text-center border-t-4 border-blue-600">
                            <h3 className="text-gray-500 uppercase text-xs font-bold tracking-wider mb-2">Etapa Actual</h3>
                            <div className="text-4xl font-bold text-blue-600">
                                {stage === 0 ? 'Inactivo / Finalizado' : `Etapa ${stage}`}
                            </div>
                        </div>

                        {/* Stage 1 Card */}
                        <div className={`p-6 rounded-lg shadow border ${stage === 0 || stage === 4 ? 'bg-white border-blue-200' : 'bg-gray-50 border-gray-200 opacity-75'}`}>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Etapa 1: Conteo Total</h3>
                            <p className="text-gray-600 text-sm mb-4">Inicia un nuevo ciclo. Limpia conteos anteriores. Requiere confirmación.</p>
                            <button
                                onClick={() => handleAction('/api/admin/inventory/start_stage_1', '¿Iniciar Etapa 1? Se borrarán todos los datos anteriores.')}
                                disabled={loading || (stage !== 0 && stage !== 4)}
                                className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                Iniciar Inventario (Etapa 1)
                            </button>
                        </div>

                        {/* Stage 2 Card */}
                        <div className={`p-6 rounded-lg shadow border ${stage === 1 ? 'bg-white border-yellow-300' : 'bg-gray-50 border-gray-200 opacity-75'}`}>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Etapa 2: Primer Reconteo</h3>
                            <p className="text-gray-600 text-sm mb-4">Calcula diferencias de Etapa 1 y genera lista de reconteo.</p>
                            <button
                                onClick={() => handleAction('/api/admin/inventory/advance_stage/2', '¿Avanzar a Etapa 2?')}
                                disabled={loading || stage !== 1}
                                className="w-full bg-yellow-500 text-white py-2 rounded font-semibold hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed mb-2"
                            >
                                Calcular y Avanzar a Etapa 2
                            </button>
                            {stage === 2 && (
                                <button onClick={() => handleExport(2)} className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
                                    Exportar Lista Reconteo (Etapa 2)
                                </button>
                            )}
                        </div>

                        {/* Stage 3 Card */}
                        <div className={`p-6 rounded-lg shadow border ${stage === 2 ? 'bg-white border-yellow-300' : 'bg-gray-50 border-gray-200 opacity-75'}`}>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Etapa 3: Segundo Reconteo</h3>
                            <p className="text-gray-600 text-sm mb-4">Calcula diferencias de Etapa 2 y genera nueva lista.</p>
                            <button
                                onClick={() => handleAction('/api/admin/inventory/advance_stage/3', '¿Avanzar a Etapa 3?')}
                                disabled={loading || stage !== 2}
                                className="w-full bg-yellow-500 text-white py-2 rounded font-semibold hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed mb-2"
                            >
                                Calcular y Avanzar a Etapa 3
                            </button>
                            {stage === 3 && (
                                <button onClick={() => handleExport(3)} className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
                                    Exportar Lista Reconteo (Etapa 3)
                                </button>
                            )}
                        </div>

                        {/* Stage 4 Card */}
                        <div className={`p-6 rounded-lg shadow border ${stage === 3 ? 'bg-white border-yellow-300' : 'bg-gray-50 border-gray-200 opacity-75'}`}>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Etapa 4: Conteo Final</h3>
                            <p className="text-gray-600 text-sm mb-4">Último conteo de diferencias restantes.</p>
                            <button
                                onClick={() => handleAction('/api/admin/inventory/advance_stage/4', '¿Avanzar a Etapa 4?')}
                                disabled={loading || stage !== 3}
                                className="w-full bg-yellow-500 text-white py-2 rounded font-semibold hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed mb-2"
                            >
                                Avanzar a Etapa 4
                            </button>
                            {stage === 4 && (
                                <button onClick={() => handleExport(4)} className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
                                    Exportar Lista Reconteo (Etapa 4)
                                </button>
                            )}
                        </div>

                        {/* Finalize Card */}
                        <div className={`p-6 rounded-lg shadow border ${stage === 4 ? 'bg-green-50 border-green-500' : 'bg-gray-50 border-gray-200 opacity-75'}`}>
                            <h3 className="text-xl font-bold text-green-800 mb-2">Finalizar Ciclo</h3>
                            <p className="text-gray-600 text-sm mb-4">Cierra el inventario y permite generar informe final.</p>

                            {stage === 4 && (
                                <button onClick={handleReport} className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 mb-4">
                                    Generar Informe Final de Conteos
                                </button>
                            )}

                            <button
                                onClick={() => handleAction('/api/admin/inventory/finalize', '¿Finalizar Inventario?')}
                                disabled={loading || stage !== 4}
                                className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                Finalizar y Cerrar Inventario
                            </button>
                        </div>
                    </div>

                    {/* Right: Stats Summary */}
                    <div className="bg-white p-6 rounded-lg shadow-md h-fit">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Resumen del Inventario</h2>

                        {!stats ? (
                            <p className="text-gray-500">Cargando estadísticas...</p>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">General</h3>
                                    <div className="flex justify-between py-2 border-b">
                                        <span className="text-gray-600">Items en Maestro</span>
                                        <span className="font-mono font-bold">{stats.general?.total_items_master || 0}</span>
                                    </div>
                                </div>

                                {stats.stages && Object.entries(stats.stages).map(([sNum, sStats]) => (
                                    <div key={sNum} className="bg-gray-50 p-4 rounded border">
                                        <h4 className="font-bold text-blue-700 mb-2">Etapa {sNum}</h4>
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span>Items Contados:</span>
                                                <span className="font-medium">{sStats.items_counted}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Unidades Totales:</span>
                                                <span className="font-medium">{sStats.total_units_counted}</span>
                                            </div>
                                            <div className="flex justify-between text-red-600">
                                                <span>Con Diferencia:</span>
                                                <span className="font-bold">{sStats.items_with_discrepancy}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Precisión:</span>
                                                <span className="font-bold text-green-600">{sStats.accuracy}</span>
                                            </div>
                                            {sStats.items_in_recount_list !== undefined && (
                                                <div className="flex justify-between border-t pt-1 mt-1 font-bold text-gray-700">
                                                    <span>Para Reconteo (Sig. Etapa):</span>
                                                    <span>{sStats.items_in_recount_list}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default AdminInventory;
