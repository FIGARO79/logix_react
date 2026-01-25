import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
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
                navigate('/admin/login');
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
            fetchStats();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = (stageNum) => {
        window.location.href = `/api/export_recount_list/${stageNum}`;
    };

    const handleReport = () => {
        window.location.href = `/admin/inventory/report`;
    };

    return (
        <AdminLayout title="Administración de Inventario">
            {/* Header Area */}
            <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
                <h1 className="text-2xl font-normal text-gray-800">Panel de Control de Inventario</h1>
                <div className="flex gap-4">
                    <button
                        onClick={() => navigate('/admin/users')}
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                        Gestionar Usuarios
                    </button>
                </div>
            </div>

            {message && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-r shadow-sm">{message}</div>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r shadow-sm">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Cycle Control (2 cols) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Current Stage Banner */}
                    <div className="bg-white p-6 rounded shadow-sm border-t-4 border-[#0a6ed1] text-center">
                        <h3 className="text-gray-500 uppercase text-xs font-bold tracking-wider mb-2">Etapa Actual</h3>
                        <div className="text-4xl font-light text-[#0a6ed1]">
                            {stage === 0 ? 'Sin Ciclo Activo' : `Etapa ${stage}`}
                        </div>
                    </div>

                    {/* Stage cards grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Stage 1 */}
                        <div className={`p-5 rounded shadow-sm border transition-all ${stage === 0 || stage === 4 ? 'bg-white border-blue-200 ring-1 ring-blue-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-medium text-gray-900">Etapa 1: Conteo Total</h3>
                                <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">INIT</span>
                            </div>
                            <p className="text-gray-500 text-xs mb-4">Inicia un nuevo ciclo. Limpia conteos anteriores. Requiere confirmación.</p>
                            <button
                                onClick={() => handleAction('/api/admin/inventory/start_stage_1', '¿Iniciar Etapa 1? Se borrarán todos los datos anteriores.')}
                                disabled={loading || (stage !== 0 && stage !== 4)}
                                className="w-full bg-[#0a6ed1] text-white py-2 rounded text-sm hover:bg-[#0854a0] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                            >
                                Iniciar Inventario
                            </button>
                        </div>

                        {/* Stage 2 */}
                        <div className={`p-5 rounded shadow-sm border transition-all ${stage === 1 ? 'bg-white border-[#e9730c] ring-1 ring-orange-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-medium text-gray-900">Etapa 2: Primer Reconteo</h3>
                                <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">R1</span>
                            </div>
                            <p className="text-gray-500 text-xs mb-4">Calcula diferencias de Etapa 1 y genera listas.</p>
                            <div className="space-y-2">
                                <button
                                    onClick={() => handleAction('/api/admin/inventory/advance_stage/2', '¿Avanzar a Etapa 2?')}
                                    disabled={loading || stage !== 1}
                                    className="w-full bg-[#e9730c] text-white py-2 rounded text-sm hover:bg-[#cf660b] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Calcular y Avanzar
                                </button>
                                {stage === 2 && (
                                    <button onClick={() => handleExport(2)} className="w-full border border-green-600 text-green-700 py-1.5 rounded text-sm hover:bg-green-50 transition-colors">
                                        Descargar Lista Reconteo
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Stage 3 */}
                        <div className={`p-5 rounded shadow-sm border transition-all ${stage === 2 ? 'bg-white border-[#e9730c] ring-1 ring-orange-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-medium text-gray-900">Etapa 3: Segundo Reconteo</h3>
                                <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">R2</span>
                            </div>
                            <p className="text-gray-500 text-xs mb-4">Revisión de diferencias persistentes.</p>
                            <div className="space-y-2">
                                <button
                                    onClick={() => handleAction('/api/admin/inventory/advance_stage/3', '¿Avanzar a Etapa 3?')}
                                    disabled={loading || stage !== 2}
                                    className="w-full bg-[#e9730c] text-white py-2 rounded text-sm hover:bg-[#cf660b] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Calcular y Avanzar
                                </button>
                                {stage === 3 && (
                                    <button onClick={() => handleExport(3)} className="w-full border border-green-600 text-green-700 py-1.5 rounded text-sm hover:bg-green-50 transition-colors">
                                        Descargar Lista Reconteo
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Stage 4 */}
                        <div className={`p-5 rounded shadow-sm border transition-all ${stage === 3 ? 'bg-white border-[#e9730c] ring-1 ring-orange-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-medium text-gray-900">Etapa 4: Final</h3>
                                <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">FIN</span>
                            </div>
                            <p className="text-gray-500 text-xs mb-4">Último conteo de diferencias restantes.</p>
                            <div className="space-y-2">
                                <button
                                    onClick={() => handleAction('/api/admin/inventory/advance_stage/4', '¿Avanzar a Etapa 4?')}
                                    disabled={loading || stage !== 3}
                                    className="w-full bg-[#e9730c] text-white py-2 rounded text-sm hover:bg-[#cf660b] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Avanzar a Etapa 4
                                </button>
                                {stage === 4 && (
                                    <button onClick={() => handleExport(4)} className="w-full border border-green-600 text-green-700 py-1.5 rounded text-sm hover:bg-green-50 transition-colors">
                                        Descargar Lista Reconteo
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Finalize Card */}
                    <div className={`p-6 rounded shadow-sm border transition-all ${stage === 4 ? 'bg-white border-green-500 ring-1 ring-green-100 check-pattern' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                        <h3 className="text-lg font-medium text-green-800 mb-2">Finalizar Ciclo</h3>
                        <p className="text-gray-600 text-sm mb-4">Cierra el inventario y permite generar informe final.</p>

                        <div className="flex flex-col sm:flex-row gap-3">
                            {stage === 4 && (
                                <button onClick={handleReport} className="flex-1 bg-white border border-blue-600 text-blue-700 py-2 rounded text-sm hover:bg-blue-50 transition-colors font-medium">
                                    Generar Informe Final (Excel)
                                </button>
                            )}

                            <button
                                onClick={() => handleAction('/api/admin/inventory/finalize', '¿Finalizar Inventario?')}
                                disabled={loading || stage !== 4}
                                className="flex-1 bg-[#107e3e] text-white py-2 rounded text-sm hover:bg-[#0c6b33] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                                Finalizar y Cerrar Inventario
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Stats Summary */}
                <div className="bg-white p-6 rounded shadow-sm h-fit border border-gray-200 sticky top-20">
                    <h2 className="text-lg font-normal text-gray-800 mb-4 border-b pb-2">Resumen en Tiempo Real</h2>

                    {!stats ? (
                        <div className="flex justify-center py-8 text-gray-400">
                            <span className="text-sm">Cargando datos...</span>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">General</h3>
                                <div className="flex justify-between items-center text-sm mb-2">
                                    <span className="text-gray-600">Items en Maestro</span>
                                    <span className="font-mono font-medium bg-gray-100 px-2 py-0.5 rounded">{stats.general?.total_items_master || 0}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {stats.stages && Object.entries(stats.stages).map(([sNum, sStats]) => (
                                    <div key={sNum} className="group">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                            <h4 className="font-medium text-sm text-gray-800">Etapa {sNum}</h4>
                                        </div>

                                        <div className="pl-4 border-l-2 border-gray-100 group-hover:border-blue-100 transition-colors space-y-1">
                                            <div className="flex justify-between text-xs text-gray-600">
                                                <span>Contados:</span>
                                                <span className="font-medium">{sStats.items_counted}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-gray-600">
                                                <span>Unidades:</span>
                                                <span className="font-medium">{sStats.total_units_counted}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-red-600 bg-red-50 px-1 rounded">
                                                <span>Diferencias:</span>
                                                <span className="font-bold">{sStats.items_with_discrepancy}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-green-700 bg-green-50 px-1 rounded mt-1">
                                                <span>Precisión:</span>
                                                <span className="font-bold">{sStats.accuracy}</span>
                                            </div>

                                            {sStats.items_in_recount_list !== undefined && sStats.items_in_recount_list > 0 && (
                                                <div className="flex justify-between text-xs font-bold text-orange-600 mt-2 border-t pt-1 border-gray-100">
                                                    <span>Para Reconteo:</span>
                                                    <span>{sStats.items_in_recount_list}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminInventory;
