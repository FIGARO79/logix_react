import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';

const Planner = () => {
    const { setTitle } = useOutletContext();
    // Estado de configuración y datos crudos
    const [config, setConfig] = useState({ start_date: '', end_date: '', holidays: [] });
    const [planDetails, setPlanDetails] = useState([]); // Lista plana de items
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ executed: {}, delta: {} }); // Placeholder para stats reales
    const [holidaysText, setHolidaysText] = useState('');

    useEffect(() => {
        setTitle("Logix - Planeación de Conteos");
    }, [setTitle]);

    // Estado calculado para el Dashboard
    const [dashboardMetrics, setDashboardMetrics] = useState({
        counts: { A: 0, B: 0, C: 0 },
        req: { A: 0, B: 0, C: 0 },
        daily: { A: 0, B: 0, C: 0 },
        workingDays: 0,
        totalReq: 0,
        totalDaily: 0,
        monthlyPlanned: {
            A: Array(12).fill(0),
            B: Array(12).fill(0),
            C: Array(12).fill(0),
            Total: Array(12).fill(0)
        }
    });

    // Carga inicial
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // 1. Configuración
                const resConfig = await fetch('http://localhost:8000/api/planner/config');
                if (resConfig.ok) {
                    const data = await resConfig.json();
                    setConfig(data);
                    setHolidaysText(data.holidays ? data.holidays.join('\n') : '');
                }

                // 2. Plan Actual (Items planos)
                const resPlan = await fetch('http://localhost:8000/api/planner/current_plan');
                if (resPlan.ok) {
                    const data = await resPlan.json();
                    // El endpoint devuelve lista plana o objeto {details: []}, ajustamos según respuesta
                    const items = Array.isArray(data) ? data : (data.details || []);
                    setPlanDetails(items);
                }

                // 3. Ejecución (Stats) - Simulación o llamada real
                // Aquí deberías llamar a un endpoint de stats si existe, o calcularlo.
                // Por ahora lo dejamos vacío como en el template original que tenía placeholder.

            } catch (error) {
                console.error("Error cargando datos planner:", error);
            }
        };
        loadInitialData();
    }, []);

    // Recalcular métricas cada vez que cambian los detalles del plan o las fechas
    useEffect(() => {
        calculateDashboard();
    }, [planDetails, config]);

    const calculateDashboard = () => {
        if (!planDetails.length) return;

        // 1. Conteos Únicos por Categoría (A, B, C)
        const uniqueItems = { A: new Set(), B: new Set(), C: new Set() };
        const monthly = {
            A: Array(12).fill(0),
            B: Array(12).fill(0),
            C: Array(12).fill(0)
        };

        planDetails.forEach(item => {
            const cat = item.ABC_Code || 'C'; // Ajustar key según respuesta API
            const code = item.Item_Code;
            const date = new Date(item.Planned_Date);
            const month = date.getMonth(); // 0-11

            if (uniqueItems[cat]) uniqueItems[cat].add(code);
            if (monthly[cat]) monthly[cat][month]++;
        });

        const counts = {
            A: uniqueItems.A.size,
            B: uniqueItems.B.size,
            C: uniqueItems.C.size
        };

        // 2. Requeridos (Regla de negocio: A=3, B=2, C=1 ciclos al año)
        // Nota: Si el plan es generado dinámicamente, esto debería coincidir con el total de items en el plan
        const req = {
            A: counts.A * 3,
            B: counts.B * 2,
            C: counts.C * 1
        };

        // 3. Días Hábiles
        let workingDays = 0;
        if (config.start_date && config.end_date) {
            const start = new Date(config.start_date);
            const end = new Date(config.end_date);
            // Copia simple de festivos string a array fecha
            const holidayFechas = holidaysText.split('\n').filter(d => d.trim()).map(d => new Date(d).toDateString());

            let cur = new Date(start);
            while (cur <= end) {
                const day = cur.getDay();
                // Excluir fin de semana (0=Dom, 6=Sab) y festivos
                if (day !== 0 && day !== 6 && !holidayFechas.includes(cur.toDateString())) {
                    workingDays++;
                }
                cur.setDate(cur.getDate() + 1);
            }
        }

        // 4. Totales Mensuales
        const monthlyTotal = Array(12).fill(0).map((_, i) => monthly.A[i] + monthly.B[i] + monthly.C[i]);

        setDashboardMetrics({
            counts,
            req,
            daily: {
                A: workingDays ? (req.A / workingDays).toFixed(1) : 0,
                B: workingDays ? (req.B / workingDays).toFixed(1) : 0,
                C: workingDays ? (req.C / workingDays).toFixed(1) : 0
            },
            workingDays,
            totalReq: req.A + req.B + req.C,
            totalDaily: workingDays ? ((req.A + req.B + req.C) / workingDays).toFixed(1) : 0,
            monthlyPlanned: { ...monthly, Total: monthlyTotal }
        });
    };

    const handleUpdatePlan = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({ start_date: config.start_date, end_date: config.end_date }).toString();
            const res = await fetch(`http://localhost:8000/api/planner/update_plan?${query}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setPlanDetails(data); // Asumiendo que retorna la nueva lista
                alert("Planificación actualizada correctamente.");
            } else {
                alert("Error al actualizar planificación.");
            }
        } catch (e) {
            alert("Error de conexión.");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        const holidaysArray = holidaysText.split('\n').map(l => l.trim()).filter(l => l);
        const newConfig = { ...config, holidays: holidaysArray };

        try {
            const res = await fetch('http://localhost:8000/api/planner/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });
            if (res.ok) {
                setConfig(newConfig);
                alert("Configuración guardada.");
                calculateDashboard(); // Recalcular días hábiles
            }
        } catch (e) {
            alert("Error guardando configuración.");
        }
    };

    // Helper para renderizar filas de tabla Excel
    const RenderRow = ({ label, data, isTotal = false }) => (
        <tr>
            <td className={`border border-gray-400 px-2 py-1 text-left ${isTotal ? 'font-bold bg-gray-50' : 'font-bold'}`}>{label}</td>
            {data.map((val, i) => (
                <td key={i} className="border border-gray-400 px-2 py-1 text-center">{val}</td>
            ))}
            <td className={`border border-gray-400 px-2 py-1 text-center ${isTotal ? '' : 'font-bold bg-gray-100'}`}>
                {data.reduce((a, b) => a + b, 0)}
            </td>
        </tr>
    );

    return (
        <div className="container-wrapper max-w-[1600px] mx-auto p-4 font-sans text-sm text-[#32383e]">

            {/* 1. Parámetros Generales */}
            <div className="bg-white p-4 rounded shadow-sm border border-gray-200 mb-6">
                <h2 className="text-base font-bold text-gray-800 mb-2 border-l-4 border-[#0070d2] pl-2">Parámetros Generales</h2>
                <div className="flex flex-wrap items-end gap-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Fecha Inicial</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                            value={config.start_date}
                            onChange={e => setConfig({ ...config, start_date: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Fecha Final</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                            value={config.end_date}
                            onChange={e => setConfig({ ...config, end_date: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Festivos (Calc)</label>
                        <input readOnly className="border border-gray-300 rounded px-2 py-1 text-sm bg-gray-100 w-20 text-center"
                            value={config.holidays ? config.holidays.length : 0} />
                    </div>
                    <div className="ml-auto flex gap-2">
                        <button onClick={handleSaveConfig} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">Guardar Fechas</button>
                        <button onClick={handleUpdatePlan} disabled={loading} className="bg-blue-800 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-900 border border-blue-900">
                            {loading ? 'Calculando...' : 'Actualizar Planificación'}
                        </button>
                        <button onClick={() => window.location.href = `http://localhost:8000/api/planner/generate_plan?start_date=${config.start_date}&end_date=${config.end_date}`}
                            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
                            Generar Excel
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Link Ejecución */}
            <div className="bg-white p-4 rounded shadow-sm border border-gray-200 mb-6 flex justify-between items-center">
                <div>
                    <h2 className="text-base font-bold text-purple-800 mb-0 border-l-4 border-purple-800 pl-2">Ejecución Diaria</h2>
                    <p className="text-xs text-gray-500 mt-1 pl-3">Accede a la interfaz de conteo ciego.</p>
                </div>
                <Link to="/planner/execution" target="_blank" className="bg-purple-700 text-white px-6 py-2.5 rounded shadow hover:bg-purple-800 flex items-center gap-2 font-bold no-underline">
                    Ir a Pantalla de Conteo
                </Link>
            </div>

            {/* 3. Grid Layout: Resumen y Leyenda */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Tabla Resumen ABC */}
                <div>
                    <h3 className="text-base font-bold text-gray-800 mb-2 border-l-4 border-[#0070d2] pl-2">Resumen Categorías (ABC)</h3>
                    <table className="w-full border-collapse text-xs">
                        <thead>
                            <tr className="bg-gray-200">
                                <th className="border border-gray-400 px-2 py-1">Categoría</th>
                                <th className="border border-gray-400 px-2 py-1">N° Items</th>
                                <th className="border border-gray-400 px-2 py-1">Ciclos</th>
                                <th className="border border-gray-400 px-2 py-1">Total Req</th>
                                <th className="border border-gray-400 px-2 py-1">Items/Día</th>
                            </tr>
                        </thead>
                        <tbody>
                            {['A', 'B', 'C'].map(cat => (
                                <tr key={cat}>
                                    <td className="border border-gray-400 px-2 py-1 font-bold text-center">{cat}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center bg-gray-50">{dashboardMetrics.counts[cat]}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">{cat === 'A' ? 3 : cat === 'B' ? 2 : 1}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center bg-gray-50">{dashboardMetrics.req[cat]}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center bg-gray-50">{dashboardMetrics.daily[cat]}</td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-gray-400">
                                <td colSpan="2" className="border border-gray-400 px-2 py-1 font-bold text-right">Días Útiles:</td>
                                <td colSpan="3" className="border border-gray-400 px-2 py-1 font-bold bg-yellow-50 text-center">{dashboardMetrics.workingDays}</td>
                            </tr>
                            <tr>
                                <td colSpan="2" className="border border-gray-400 px-2 py-1 font-bold text-right">Total Requerido:</td>
                                <td colSpan="3" className="border border-gray-400 px-2 py-1 font-bold bg-yellow-50 text-center">{dashboardMetrics.totalReq}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Leyenda y Festivos */}
                <div>
                    <h3 className="text-base font-bold text-gray-800 mb-2 border-l-4 border-[#0070d2] pl-2">Leyenda / Festivos</h3>
                    <div className="flex gap-4">
                        <table className="w-auto border-collapse text-xs h-fit">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-gray-400 px-2 py-1">Cód</th>
                                    <th className="border border-gray-400 px-2 py-1">Hits</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { c: 'W', h: '>30' }, { c: 'X', h: '11-30' },
                                    { c: 'Y', h: '7-10' }, { c: 'K', h: '5-6' },
                                    { c: 'L', h: '3-4' }, { c: 'Z', h: '1-2' }, { c: '0', h: '0' }
                                ].map(r => (
                                    <tr key={r.c}>
                                        <td className="border border-gray-400 px-2 py-1 font-bold text-center">{r.c}</td>
                                        <td className="border border-gray-400 px-2 py-1 text-left">{r.h} hits</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="flex-grow border border-gray-400 rounded bg-gray-50">
                            <div className="bg-gray-200 px-2 py-1 text-xs font-bold border-b border-gray-400">Festivos (YYYY-MM-DD)</div>
                            <textarea
                                className="w-full h-32 p-2 text-xs bg-transparent outline-none resize-none font-mono"
                                value={holidaysText}
                                onChange={e => setHolidaysText(e.target.value)}
                                placeholder="2024-01-01&#10;2024-05-01"
                            ></textarea>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Grids Mensuales */}
            <div className="space-y-8">
                {/* PLANEADO */}
                <div>
                    <h3 className="text-base font-bold text-blue-800 mb-2 border-l-4 border-blue-800 pl-2">Planeado (Conteos Programados)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-blue-100">
                                    <th className="border border-gray-400 px-2 py-1 text-left min-w-[100px]">Cat / Mes</th>
                                    {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map(m => (
                                        <th key={m} className="border border-gray-400 px-2 py-1">{m}</th>
                                    ))}
                                    <th className="border border-gray-400 px-2 py-1 bg-gray-300">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                <RenderRow label="A" data={dashboardMetrics.monthlyPlanned.A} />
                                <RenderRow label="B" data={dashboardMetrics.monthlyPlanned.B} />
                                <RenderRow label="C" data={dashboardMetrics.monthlyPlanned.C} />
                                <RenderRow label="TOTAL" data={dashboardMetrics.monthlyPlanned.Total} isTotal={true} />
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* EJECUTADO (Placeholder visual para paridad) */}
                <div>
                    <h3 className="text-base font-bold text-green-800 mb-2 border-l-4 border-green-800 pl-2">Ejecutado (Real)</h3>
                    <div className="overflow-x-auto opacity-70">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-green-100">
                                    <th className="border border-gray-400 px-2 py-1 text-left min-w-[100px]">Cat / Mes</th>
                                    <th colSpan="12" className="border border-gray-400 px-2 py-1 text-center">Datos Históricos</th>
                                    <th className="border border-gray-400 px-2 py-1 bg-gray-300">W2W</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-gray-400 px-2 py-1 font-bold">Total</td>
                                    <td colSpan="12" className="border border-gray-400 px-2 py-1 text-center italic text-gray-500">
                                        Sin datos de ejecución cargados (Placeholder)
                                    </td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">0</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Planner;