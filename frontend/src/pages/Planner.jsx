import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';
import '../styles/FluentPages.css';

const parseFreq = (val, defaultVal) => {
    if (val === 0 || val === '0') return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultVal : Math.max(0, parsed);
};

const Planner = () => {
    const { setTitle } = useOutletContext();
    // Estado de configuración y datos crudos
    const [config, setConfig] = useState({
        start_date: '',
        end_date: '',
        holidays: [],
        frequencies: { A: 3, B: 2, C: 1 }
    });
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [editConfig, setEditConfig] = useState({
        start_date: '',
        end_date: '',
        frequencies: { A: 3, B: 2, C: 1 }
    });
    const [planDetails, setPlanDetails] = useState([]); // Lista plana de items
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ executed: {}, delta: {} }); // Placeholder para stats reales
    const [holidaysText, setHolidaysText] = useState('');

    const calculateDashboard = useCallback(() => {
        if (!planDetails.length) return;

        // 1. Conteos Únicos por Categoría (A, B, C)
        const uniqueItems = { A: new Set(), B: new Set(), C: new Set() };
        const monthly = {
            A: Array(12).fill(0),
            B: Array(12).fill(0),
            C: Array(12).fill(0)
        };

        planDetails.forEach(item => {
            // FIX: Access property with keys from JSON (with spaces)
            const cat = item["ABC Code"] || 'C';
            const code = item["Item Code"];
            const dateStr = item["Planned Date"];

            if (!dateStr) return;

            const date = new Date(dateStr);
            const month = date.getMonth(); // 0-11

            if (uniqueItems[cat]) uniqueItems[cat].add(code);
            if (monthly[cat]) monthly[cat][month]++;
        });

        const counts = {
            A: uniqueItems.A.size,
            B: uniqueItems.B.size,
            C: uniqueItems.C.size
        };

        // 2. Requeridos (Regla de negocio: frecuencias configuradas por operador, por defecto A=3, B=2, C=1)
        const freqA = parseFreq(config.frequencies?.A, 3);
        const freqB = parseFreq(config.frequencies?.B, 2);
        const freqC = parseFreq(config.frequencies?.C, 1);

        const req = {
            A: counts.A * freqA,
            B: counts.B * freqB,
            C: counts.C * freqC
        };

        // 3. Días Hábiles
        let workingDays = 0;
        if (config.start_date && config.end_date) {
            const start = new Date(config.start_date);
            const end = new Date(config.end_date);
            const holidayFechas = holidaysText.split('\n').filter(d => d.trim()).map(d => new Date(d).toDateString());

            let cur = new Date(start);
            while (cur <= end) {
                const day = cur.getDay();
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
    }, [planDetails, config, holidaysText]);

    useEffect(() => {
        setTitle("Plan Cíclicos");
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
                const resConfig = await fetch('/api/planner/config');
                if (resConfig.ok) {
                    const data = await resConfig.json();
                    const frequencies = {
                        A: parseFreq(data.frequencies?.A, 3),
                        B: parseFreq(data.frequencies?.B, 2),
                        C: parseFreq(data.frequencies?.C, 1),
                    };
                    const fullConfig = { ...data, frequencies };
                    setConfig(fullConfig);
                    setEditConfig({
                        start_date: fullConfig.start_date || '',
                        end_date: fullConfig.end_date || '',
                        frequencies: { ...frequencies }
                    });
                    setHolidaysText(data.holidays ? data.holidays.join('\n') : '');
                }

                // 2. Plan Actual (Items planos)
                const resPlan = await fetch('/api/planner/current_plan');
                if (resPlan.ok) {
                    const data = await resPlan.json();
                    // El endpoint devuelve objeto {details: []} usualmente si se guardó
                    const items = Array.isArray(data) ? data : (data.details || []);
                    setPlanDetails(items);
                }

                // 3. Ejecución (Stats)
                const resStats = await fetch('/api/planner/execution/stats');
                if (resStats.ok) {
                    const data = await resStats.json();
                    setStats(data);
                }

            } catch (error) {
                console.error("Error cargando datos planner:", error);
            }
        };
        loadInitialData();
    }, []);


    // Recalcular métricas cada vez que cambian los detalles del plan o las fechas
    useEffect(() => {
        calculateDashboard();
    }, [calculateDashboard]);

    const handleUpdatePlan = async () => {
        setLoading(true);
        try {
            const holidaysArray = holidaysText.split('\n').map(l => l.trim()).filter(l => l);
            const currentConfig = {
                ...config,
                holidays: holidaysArray,
                frequencies: {
                    A: parseFreq(config.frequencies?.A, 3),
                    B: parseFreq(config.frequencies?.B, 2),
                    C: parseFreq(config.frequencies?.C, 1),
                }
            };
            await fetch('/api/planner/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentConfig)
            });
            setConfig(currentConfig);

            const query = new URLSearchParams({ start_date: config.start_date, end_date: config.end_date }).toString();
            const res = await fetch(`/api/planner/update_plan?${query}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setPlanDetails(data.details || []); // FIX: data.details
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

    const handleResetPlan = async () => {
        if (!config.start_date || !config.end_date) {
            alert("Por favor seleccione fecha inicial y fecha final antes de reiniciar.");
            return;
        }

        const confirmReset = window.confirm(
            `¿Estás seguro de REINICIAR TODA LA PLANIFICACIÓN desde cero para el rango ${config.start_date} a ${config.end_date}?\n\n` +
            `Esta acción descartará la planificación persistente de los meses o años anteriores (se creará un respaldo de seguridad) y generará un cronograma limpio e independiente para el nuevo año o período seleccionado con los ciclos ABC configurados.`
        );
        if (!confirmReset) return;

        setLoading(true);
        try {
            const holidaysArray = holidaysText.split('\n').map(l => l.trim()).filter(l => l);
            const currentConfig = {
                ...config,
                holidays: holidaysArray,
                frequencies: {
                    A: parseFreq(config.frequencies?.A, 3),
                    B: parseFreq(config.frequencies?.B, 2),
                    C: parseFreq(config.frequencies?.C, 1),
                }
            };
            await fetch('/api/planner/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentConfig)
            });
            setConfig(currentConfig);

            const query = new URLSearchParams({ start_date: config.start_date, end_date: config.end_date }).toString();
            const res = await fetch(`/api/planner/reset_plan?${query}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setPlanDetails(data.details || []);
                alert("Planificación anual reiniciada y generada desde cero con éxito.");
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Error al reiniciar planificación: ${err.detail || 'Error en el servidor'}`);
            }
        } catch (e) {
            alert("Error de conexión al reiniciar la planificación.");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleConfig = () => {
        if (!isConfigOpen) {
            setEditConfig({
                start_date: config.start_date || '',
                end_date: config.end_date || '',
                frequencies: {
                    A: parseFreq(config.frequencies?.A, 3),
                    B: parseFreq(config.frequencies?.B, 2),
                    C: parseFreq(config.frequencies?.C, 1),
                }
            });
        }
        setIsConfigOpen(prev => !prev);
    };

    const handleSaveConfig = async () => {
        const holidaysArray = holidaysText.split('\n').map(l => l.trim()).filter(l => l);
        const newConfig = {
            ...config,
            start_date: editConfig.start_date || config.start_date,
            end_date: editConfig.end_date || config.end_date,
            holidays: holidaysArray,
            frequencies: {
                A: parseFreq(editConfig.frequencies?.A, 3),
                B: parseFreq(editConfig.frequencies?.B, 2),
                C: parseFreq(editConfig.frequencies?.C, 1),
            }
        };

        try {
            const res = await fetch('/api/planner/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });
            if (res.ok) {
                setConfig(newConfig);
                setEditConfig({
                    start_date: newConfig.start_date,
                    end_date: newConfig.end_date,
                    frequencies: { ...newConfig.frequencies }
                });
                setIsConfigOpen(false);
                alert("Configuración y ciclos guardados correctamente.");
            } else {
                alert("Error al guardar la configuración.");
            }
        } catch (e) {
            alert("Error guardando configuración.");
        }
    };

    // Helper para renderizar filas de tabla operacionales sobrias
    const RenderRow = ({ label, data, isTotal = false, isDelta = false }) => (
        <tr className={isTotal ? 'bg-[#f9f9f9] border-t border-[#d2d0ce]' : 'hover:bg-[#f3f9fd]'}>
            <td className={`border-b border-r border-[#d2d0ce] px-2 py-1 text-left font-normal ${isTotal ? 'bg-[#f3f3f3] text-[#201f1e]' : 'text-[#201f1e]'}`}>
                {label}
            </td>
            {data && data.map((val, i) => {
                let cellColor = "text-[#201f1e]";
                if (isDelta) {
                    if (val < 0) cellColor = "text-[#a4262c]";
                    else if (val > 0) cellColor = "text-[#107c10]";
                    else cellColor = "text-[#605e5c]";
                }
                return (
                    <td key={i} className={`border-b border-r border-[#e1dfdd] px-1 py-1 text-center tabular-nums font-mono text-xs font-normal ${cellColor}`}>
                        {val}
                    </td>
                );
            })}
            <td className={`border-b border-[#d2d0ce] px-1 py-1 text-center tabular-nums font-mono text-xs font-normal ${isTotal ? 'bg-[#f3f3f3] text-[#201f1e]' : 'bg-[#f9f9f9] text-[#201f1e]'}`}>
                {data ? data.reduce((a, b) => a + b, 0) : 0}
            </td>
        </tr>
    );

    return (
        <div className="planner-page max-w-[1440px] mx-auto px-4 py-3 bg-[#f3f3f3] min-h-screen text-[#201f1e] leading-normal font-segoe-ui">

            {/* 1. Panel de Parámetros */}
            <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs mb-3">
                <div className="flex justify-between items-center pb-2 mb-3 border-b border-[#edebe9]">
                    <h2 className="text-xs font-normal text-[#201f1e] uppercase m-0">
                        Parámetros de Ciclos
                    </h2>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">Fecha Inicial</label>
                        <div
                            className="h-8 min-w-[110px] px-2.5 flex items-center bg-white border border-[#d2d0ce] rounded text-xs font-mono tabular-nums text-[#201f1e] select-all"
                            style={{ backgroundColor: '#ffffff' }}
                        >
                            {config.start_date || '—'}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">Fecha Final</label>
                        <div
                            className="h-8 min-w-[110px] px-2.5 flex items-center bg-white border border-[#d2d0ce] rounded text-xs font-mono tabular-nums text-[#201f1e] select-all"
                            style={{ backgroundColor: '#ffffff' }}
                        >
                            {config.end_date || '—'}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">Festivos</label>
                        <div
                            className="h-8 px-3 flex items-center justify-center bg-white border border-[#d2d0ce] rounded text-xs font-mono tabular-nums text-[#201f1e]"
                            style={{ backgroundColor: '#ffffff' }}
                        >
                            {config.holidays ? config.holidays.length : 0}
                        </div>
                    </div>

                    <div className="ml-auto flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleToggleConfig}
                            className={`h-8 px-3 text-xs font-normal rounded transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 ${isConfigOpen
                                    ? 'bg-[#edebe9] text-[#201f1e] border border-[#a19f9d]'
                                    : 'bg-white text-[#201f1e] border border-[#d2d0ce] hover:bg-[#f3f3f3]'
                                }`}
                        >
                            <span>Configurar Parámetros</span>
                            <svg
                                className={`w-3 h-3 text-[#605e5c] transition-transform ${isConfigOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const params = new URLSearchParams({
                                    start_date: config.start_date,
                                    end_date: config.end_date
                                });
                                window.location.href = `/api/planner/generate_plan?${params.toString()}`;
                            }}
                            className="h-8 px-4 text-xs font-normal text-white bg-[#107c41] hover:bg-[#0e6c38] rounded transition-colors shadow-xs cursor-pointer"
                        >
                            Generar Excel
                        </button>
                    </div>
                </div>

                {/* Contenedor Desplegable de Configuración */}
                {isConfigOpen && (
                    <div className="w-full mt-3 pt-3 border-t border-[#edebe9] bg-white -mx-3.5 -mb-3.5 p-3.5 rounded-b">
                        <div className="flex items-center justify-between mb-2.5">
                            <h3 className="text-xs font-normal text-[#201f1e] uppercase m-0">
                                Ajuste de Fechas y Frecuencias de Conteo
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsConfigOpen(false)}
                                className="text-xs text-[#605e5c] hover:text-[#201f1e] cursor-pointer"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                            <div>
                                <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">
                                    Fecha Inicial
                                </label>
                                <input
                                    type="date"
                                    value={editConfig.start_date}
                                    onChange={e => setEditConfig(prev => ({ ...prev, start_date: e.target.value }))}
                                    className="w-full h-8 border border-[#d2d0ce] rounded px-2 text-xs outline-none bg-white text-[#201f1e] focus:border-[#0078d4]"
                                    style={{ backgroundColor: '#ffffff' }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">
                                    Fecha Final
                                </label>
                                <input
                                    type="date"
                                    value={editConfig.end_date}
                                    onChange={e => setEditConfig(prev => ({ ...prev, end_date: e.target.value }))}
                                    className="w-full h-8 border border-[#d2d0ce] rounded px-2 text-xs outline-none bg-white text-[#201f1e] focus:border-[#0078d4]"
                                    style={{ backgroundColor: '#ffffff' }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">
                                    Ciclos Cat. A
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="52"
                                    value={editConfig.frequencies?.A ?? 3}
                                    onChange={e => {
                                        const raw = e.target.value;
                                        const val = raw === '' ? '' : Math.max(0, parseInt(raw, 10) || 0);
                                        setEditConfig(prev => ({
                                            ...prev,
                                            frequencies: { ...prev.frequencies, A: val }
                                        }));
                                    }}
                                    className="w-full h-8 border border-[#d2d0ce] rounded px-2 text-xs font-mono tabular-nums outline-none bg-white text-[#201f1e] focus:border-[#0078d4]"
                                    style={{ backgroundColor: '#ffffff' }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">
                                    Ciclos Cat. B
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="52"
                                    value={editConfig.frequencies?.B ?? 2}
                                    onChange={e => {
                                        const raw = e.target.value;
                                        const val = raw === '' ? '' : Math.max(0, parseInt(raw, 10) || 0);
                                        setEditConfig(prev => ({
                                            ...prev,
                                            frequencies: { ...prev.frequencies, B: val }
                                        }));
                                    }}
                                    className="w-full h-8 border border-[#d2d0ce] rounded px-2 text-xs font-mono tabular-nums outline-none bg-white text-[#201f1e] focus:border-[#0078d4]"
                                    style={{ backgroundColor: '#ffffff' }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-normal text-[#605e5c] uppercase mb-1">
                                    Ciclos Cat. C
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="52"
                                    value={editConfig.frequencies?.C ?? 1}
                                    onChange={e => {
                                        const raw = e.target.value;
                                        const val = raw === '' ? '' : Math.max(0, parseInt(raw, 10) || 0);
                                        setEditConfig(prev => ({
                                            ...prev,
                                            frequencies: { ...prev.frequencies, C: val }
                                        }));
                                    }}
                                    className="w-full h-8 border border-[#d2d0ce] rounded px-2 text-xs font-mono tabular-nums outline-none bg-white text-[#201f1e] focus:border-[#0078d4]"
                                    style={{ backgroundColor: '#ffffff' }}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 mt-3 pt-2.5 border-t border-[#edebe9]">
                            <button
                                type="button"
                                onClick={handleResetPlan}
                                disabled={loading}
                                className="h-8 px-3.5 text-xs font-normal text-[#a4262c] bg-white border border-[#a4262c] hover:bg-red-50 disabled:opacity-50 rounded transition-colors shadow-xs cursor-pointer"
                            >
                                {loading ? 'Reiniciando...' : 'Reiniciar Plan Anual'}
                            </button>
                            <button
                                type="button"
                                onClick={handleUpdatePlan}
                                disabled={loading}
                                className="h-8 px-4 text-xs font-normal text-white bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 rounded transition-colors shadow-xs cursor-pointer"
                            >
                                {loading ? 'Calculando...' : 'Actualizar Plan'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsConfigOpen(false)}
                                className="h-8 px-3.5 text-xs font-normal text-[#201f1e] bg-white border border-[#d2d0ce] hover:bg-[#f3f3f3] rounded transition-colors shadow-xs cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveConfig}
                                className="h-8 px-4 text-xs font-normal text-white bg-[#0078d4] hover:bg-[#106ebe] rounded transition-colors shadow-xs cursor-pointer"
                            >
                                Guardar Parámetros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Banner de Ejecución Diaria */}
            <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 className="text-xs font-normal text-[#201f1e] uppercase mb-0.5 m-0">Ejecución Diaria</h2>
                    <p className="text-xs text-[#605e5c] font-normal mb-0">Interfaz de conteo ciego en piso con registro de inventario físico.</p>
                </div>
                <Link
                    to="/planner/execution"
                    className="h-8 px-4 text-xs font-normal text-white bg-[#0078d4] hover:bg-[#106ebe] rounded transition-colors shadow-xs flex items-center no-underline cursor-pointer shrink-0"
                >
                    Ir a Pantalla de Conteo
                </Link>
            </div>

            {/* 3. Grid: Resumen ABC y Criterios / Festivos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                {/* Tabla Resumen ABC */}
                <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                    <h3 className="text-xs font-normal text-[#201f1e] uppercase border-b border-[#edebe9] pb-2 mb-2 m-0">
                        Resumen de Categorías (ABC)
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce]">
                                    <th className="border-b border-r border-[#d2d0ce] px-2 py-1.5 text-center font-normal">Categoría</th>
                                    <th className="border-b border-r border-[#d2d0ce] px-2 py-1.5 text-center font-normal">N° Items</th>
                                    <th className="border-b border-r border-[#d2d0ce] px-2 py-1.5 text-center font-normal">Ciclos/Año</th>
                                    <th className="border-b border-r border-[#d2d0ce] px-2 py-1.5 text-center font-normal">Total Req.</th>
                                    <th className="border-b border-[#d2d0ce] px-2 py-1.5 text-center font-normal">Items / Día</th>
                                </tr>
                            </thead>
                            <tbody>
                                {['A', 'B', 'C'].map(cat => (
                                    <tr key={cat} className="hover:bg-[#f3f9fd]">
                                        <td className="border-b border-r border-[#e1dfdd] px-2 py-1 text-center font-normal text-[#201f1e]">{cat}</td>
                                        <td className="border-b border-r border-[#e1dfdd] px-2 py-1 text-center tabular-nums font-mono text-[#201f1e]">{dashboardMetrics.counts[cat]}</td>
                                        <td className="border-b border-r border-[#e1dfdd] px-2 py-1 text-center tabular-nums font-mono text-[#201f1e]">
                                            {parseFreq(config.frequencies?.[cat], cat === 'A' ? 3 : cat === 'B' ? 2 : 1)}
                                        </td>
                                        <td className="border-b border-r border-[#e1dfdd] px-2 py-1 text-center tabular-nums font-mono text-[#201f1e]">{dashboardMetrics.req[cat]}</td>
                                        <td className="border-b border-[#e1dfdd] px-2 py-1 text-center tabular-nums font-mono text-[#201f1e]">{dashboardMetrics.daily[cat]}</td>
                                    </tr>
                                ))}
                                <tr className="bg-[#f9f9f9] border-t border-[#d2d0ce]">
                                    <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-right font-normal text-[#201f1e]">Días Hábiles:</td>
                                    <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-right font-normal text-[#201f1e] tabular-nums font-mono">{dashboardMetrics.workingDays}</td>
                                    <td colSpan="3" className="border-b border-[#d2d0ce] px-2 py-1"></td>
                                </tr>
                                <tr className="bg-[#f9f9f9]">
                                    <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-right font-normal text-[#201f1e]">Total Requerido:</td>
                                    <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-right font-normal text-[#201f1e] tabular-nums font-mono">{dashboardMetrics.totalReq}</td>
                                    <td colSpan="3" className="border-b border-[#d2d0ce] px-2 py-1"></td>
                                </tr>
                                <tr className="bg-[#f9f9f9]">
                                    <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-right font-normal text-[#201f1e]">Total items dia:</td>
                                    <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-right font-normal text-[#201f1e] tabular-nums font-mono">{dashboardMetrics.totalDaily}</td>
                                    <td colSpan="3" className="border-b border-[#d2d0ce] px-2 py-1"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Criterios de Rotación y Festivos */}
                <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                    <h3 className="text-xs font-normal text-[#201f1e] uppercase border-b border-[#edebe9] pb-2 mb-2 m-0">
                        Criterios de Rotación y Festivos
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="border border-[#d2d0ce] rounded sm:w-1/2 overflow-hidden">
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce]">
                                        <th className="border-r border-[#d2d0ce] px-2 py-1 text-center font-normal text-[11px]">Código</th>
                                        <th className="px-2 py-1 text-left font-normal text-[11px]">Criterio (Hits)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { c: 'W', h: 'More than 30 hits' }, { c: 'X', h: '11-30 hits' },
                                        { c: 'Y', h: '7-10 hits' }, { c: 'K', h: '5-6 hits' },
                                        { c: 'L', h: '3-4 hits' }, { c: 'Z', h: '1-2 hits' }, { c: '0', h: 'Non moving item' }
                                    ].map(r => (
                                        <tr key={r.c} className="border-b border-[#e1dfdd] last:border-b-0 hover:bg-[#f3f9fd]">
                                            <td className="border-r border-[#d2d0ce] px-2 py-0.5 text-center font-normal text-[#201f1e] bg-[#f9f9f9]">{r.c}</td>
                                            <td className="px-2 py-0.5 text-left text-[#201f1e] whitespace-nowrap">{r.h}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="border border-[#d2d0ce] rounded sm:w-1/2 flex flex-col bg-white overflow-hidden">
                            <div className="bg-[#f3f3f3] px-2.5 py-1 text-[11px] font-normal text-[#201f1e] border-b border-[#d2d0ce] flex justify-between">
                                <span>Festivos</span>
                                <span className="text-[#605e5c]">YYYY-MM-DD</span>
                            </div>
                            <textarea
                                className="w-full p-2 text-xs bg-transparent outline-none resize-none font-mono flex-grow border-0 text-[#201f1e] leading-relaxed"
                                value={holidaysText}
                                onChange={e => setHolidaysText(e.target.value)}
                                placeholder="2026-01-01&#10;2026-05-01&#10;2026-12-25"
                                rows={7}
                            ></textarea>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Grids Mensuales */}
            <div className="space-y-3">
                {/* PLANEADO */}
                <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                    <h3 className="text-xs font-normal text-[#0078d4] uppercase mb-2 m-0">Planeado (Conteos Programados)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce]">
                                    <th className="border-b border-r border-[#d2d0ce] px-2 py-1 text-left font-normal min-w-[90px]">Categoría</th>
                                    {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map(m => (
                                        <th key={m} className="border-b border-r border-[#d2d0ce] px-2 py-1 text-center font-normal">{m}</th>
                                    ))}
                                    <th className="border-b border-[#d2d0ce] px-2 py-1 text-center font-normal bg-[#f3f3f3]">TOTAL</th>
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

                {/* EJECUTADO REAL */}
                <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                    <h3 className="text-xs font-normal text-[#107c10] uppercase mb-2 m-0">Ejecutado (Real)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce]">
                                    <th className="border-b border-r border-[#d2d0ce] px-2 py-1 text-left font-normal min-w-[90px]">Categoría</th>
                                    {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map(m => (
                                        <th key={m} className="border-b border-r border-[#d2d0ce] px-2 py-1 text-center font-normal">{m}</th>
                                    ))}
                                    <th className="border-b border-[#d2d0ce] px-2 py-1 text-center font-normal bg-[#f3f3f3]">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.executed ? (
                                    <>
                                        <RenderRow label="A" data={stats.executed.A || Array(12).fill(0)} />
                                        <RenderRow label="B" data={stats.executed.B || Array(12).fill(0)} />
                                        <RenderRow label="C" data={stats.executed.C || Array(12).fill(0)} />
                                        <tr className="bg-[#f9f9f9] border-t border-[#d2d0ce]">
                                            <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-left font-normal bg-[#f3f3f3]">TOTAL</td>
                                            {Array(12).fill(0).map((_, i) => {
                                                const sum = (stats.executed.A?.[i] || 0) + (stats.executed.B?.[i] || 0) + (stats.executed.C?.[i] || 0);
                                                return <td key={i} className="border-b border-r border-[#e1dfdd] px-1 py-1 text-center tabular-nums font-mono text-xs font-normal text-[#201f1e]">{sum}</td>;
                                            })}
                                            <td className="border-b border-[#d2d0ce] px-1 py-1 text-center tabular-nums font-mono text-xs font-normal bg-[#f3f3f3] text-[#107c10]">
                                                {['A', 'B', 'C'].reduce((acc, cat) => acc + (stats.executed[cat] || []).reduce((a, b) => a + b, 0), 0)}
                                            </td>
                                        </tr>
                                    </>
                                ) : (
                                    <tr>
                                        <td colSpan="14" className="text-center py-4 text-xs text-[#605e5c] italic bg-[#f9f9f9]">
                                            Cargando datos de ejecución...
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* DELTA (DIFERENCIA) */}
                <div className="bg-white p-3.5 rounded border border-[#d2d0ce] shadow-xs">
                    <h3 className="text-xs font-normal text-[#201f1e] uppercase mb-2 m-0">Delta (Diferencia)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#f3f3f3] text-[#201f1e] border-b border-[#d2d0ce]">
                                    <th className="border-b border-r border-[#d2d0ce] px-2 py-1 text-left font-normal min-w-[90px]">Categoría</th>
                                    {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map(m => (
                                        <th key={m} className="border-b border-r border-[#d2d0ce] px-2 py-1 text-center font-normal">{m}</th>
                                    ))}
                                    <th className="border-b border-[#d2d0ce] px-2 py-1 text-center font-normal bg-[#f3f3f3]">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.delta ? (
                                    <>
                                        <RenderRow label="A" data={stats.delta.A || Array(12).fill(0)} isDelta={true} />
                                        <RenderRow label="B" data={stats.delta.B || Array(12).fill(0)} isDelta={true} />
                                        <RenderRow label="C" data={stats.delta.C || Array(12).fill(0)} isDelta={true} />
                                        <tr className="bg-[#f9f9f9] border-t border-[#d2d0ce]">
                                            <td className="border-b border-r border-[#d2d0ce] px-2 py-1 text-left font-normal bg-[#f3f3f3]">TOTAL</td>
                                            {Array(12).fill(0).map((_, i) => {
                                                const sum = (stats.delta.A?.[i] || 0) + (stats.delta.B?.[i] || 0) + (stats.delta.C?.[i] || 0);
                                                let sumColor = "text-[#201f1e]";
                                                if (sum < 0) sumColor = "text-[#a4262c]";
                                                else if (sum > 0) sumColor = "text-[#107c10]";
                                                return <td key={i} className={`border-b border-r border-[#e1dfdd] px-1 py-1 text-center tabular-nums font-mono text-xs font-normal ${sumColor}`}>{sum}</td>;
                                            })}
                                            <td className="border-b border-[#d2d0ce] px-1 py-1 text-center tabular-nums font-mono text-xs font-normal bg-[#f3f3f3] text-[#201f1e]">
                                                {['A', 'B', 'C'].reduce((acc, cat) => acc + (stats.delta[cat] || []).reduce((a, b) => a + b, 0), 0)}
                                            </td>
                                        </tr>
                                    </>
                                ) : (
                                    <tr>
                                        <td colSpan="14" className="text-center py-4 text-xs text-[#605e5c] italic bg-[#f9f9f9]">
                                            Cargando datos de diferencia...
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Planner;