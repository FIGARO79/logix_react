import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const menuCategories = [
    {
        id: 'recepcion',
        title: 'Gestión de Recepción',
        accent: 'bg-blue-600',
        items: [
            { href: '/inbound', text: 'REGISTRO INBOUND', desc: 'Entrada de mercancía y referencias' },
            { href: '/reconciliation', text: 'CONCILIACIÓN', desc: 'Cruce de documentos y discrepancias' },
            { href: '/view_logs', text: 'HISTORIAL', desc: 'Consulta de registros históricos' },
            { href: '/stock', text: 'CONSULTAR STOCK', desc: 'Búsqueda global de inventario y saldos' }
        ]
    },
    {
        id: 'despacho',
        title: 'Operaciones de Despacho',
        accent: 'bg-emerald-600',
        items: [
            { href: '/picking', text: 'AUDITORÍA PICKING', desc: 'Verificación de pedidos y empaque' },
            { href: '/view_picking_audits', text: 'REPORTES EMPAQUE', desc: 'Listas de empaque y auditorías' },
            { href: '/shipments', text: 'CONSOLIDACIÓN', desc: 'Gestión de despachos y embarques' },
            { href: '/label', text: 'ETIQUETADO', desc: 'Impresión de etiquetas operativas' }
        ]
    },
    {
        id: 'inventario',
        title: 'Control de Inventario',
        accent: 'bg-amber-600',
        items: [
            { href: '/planner', text: 'PLANIFICACIÓN', desc: 'Programación de conteos cíclicos' },
            { href: '/inventory-dashboard', text: 'MÉTRICAS ERI', desc: 'Indicadores de exactitud' },
            { href: '/planner/manage_differences', text: 'DIFERENCIAS', desc: 'Gestión de ajustes y discrepancias' },
            { href: '/counts', text: 'CONTEO FÍSICO', desc: 'Inventario general wall-to-wall' },
            { href: '/express-audit', text: 'CICLO MANUAL', desc: 'Conteo ciego y auditoría rápida' }
        ]
    },
    {
        id: 'admin',
        title: 'Administración del Sistema',
        accent: 'bg-slate-700',
        items: [
            { href: '/admin/inventory', text: 'ADMINISTRACIÓN INVENTARIO', desc: 'Control de ciclos de conteo' },
            { href: '/admin/slotting', text: 'REGLAS SLOTTING', desc: 'Parámetros de ubicaciones' },
            { href: '/update', text: 'CARGA DE DATOS', desc: 'Actualización masiva vía ficheros' }
        ]
    }
];

const Dashboard = () => {
    const { setTitle } = useOutletContext();

    useEffect(() => {
        setTitle("Dashboard");
    }, [setTitle]);

    return (
        <div className="min-h-[calc(100vh-80px)] bg-[#f8fafc] px-6 pt-4 pb-12 lg:px-12 lg:pt-6 lg:pb-12">
            <div className="max-w-7xl mx-auto">
                {/* Header Profesional */}
                <header className="mb-12 border-b border-slate-200 pb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-2xl font-light text-slate-900 tracking-tight">Panel de Control</h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Logix WMS</p>
                    </div>
                </header>

                {/* Grid de Categorías */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {menuCategories.map((category) => (
                        <div key={category.id} className="flex flex-col">
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`h-4 w-1 ${category.accent} rounded-full`}></div>
                                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{category.title}</h2>
                            </div>

                            <div className="space-y-3">
                                {category.items.map((item, idx) => (
                                    <Link
                                        key={idx}
                                        to={item.href}
                                        className="group block bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-400 hover:shadow-md transition-all duration-200"
                                    >
                                        <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight">
                                            {item.text}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-tighter">
                                            {item.desc}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
