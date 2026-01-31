import React, { useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
    DownloadIcon, SearchIcon, TagIcon, CartIcon,
    HomeIcon, ChecklistIcon, CalculatorIcon,
    ChartIcon, ArrowPathIcon, DocumentIcon
} from '../components/Icons';

const menuItems = [
    {
        id: 'inbound',
        href: '/inbound',
        text: 'Inbound',
        description: 'Registro de entradas',
        icon: <DownloadIcon className="w-6 h-6" />
    },
    {
        id: 'stock',
        href: '/stock',
        text: 'Consultar Stock',
        description: 'Búsqueda de inventario',
        icon: <SearchIcon className="w-6 h-6" />
    },
    {
        id: 'label',
        href: '/label',
        text: 'Etiquetado',
        description: 'Impresión de etiquetas',
        icon: <TagIcon className="w-6 h-6" />
    },
    {
        id: 'picking',
        href: '/picking',
        text: 'Auditoría Picking',
        description: 'Verificación de pedidos',
        icon: <CartIcon className="w-6 h-6" />
    },
    {
        id: 'ciclicos',
        href: '/planner',
        text: 'Cíclicos',
        description: 'Planificador de conteos',
        icon: <HomeIcon className="w-6 h-6" />
    },
    {
        id: 'diff_cycles',
        href: '/planner/manage_differences',
        text: 'Diferencias Cíclicos',
        description: 'Gestión de diferencias',
        icon: <CalculatorIcon className="w-6 h-6" />
    },
    {
        id: 'view_counts',
        href: '/view_counts',
        text: 'Validar Conteos',
        description: 'Revisión y aprobación',
        icon: <ChecklistIcon className="w-6 h-6" />
    },
    {
        id: 'view_picking_audits',
        href: '/view_picking_audits',
        text: 'Ver Auditorías',
        description: 'Historial de picking',
        icon: <ChartIcon className="w-6 h-6" />
    },
    {
        id: 'update',
        href: '/update',
        text: 'Actualizar Ficheros',
        description: 'Carga de datos maestros',
        icon: <ArrowPathIcon className="w-6 h-6" />
    },
    {
        id: 'counts',
        href: '/counts',
        text: 'Conteos',
        description: 'Conteo de inventario',
        icon: <DocumentIcon className="w-6 h-6" />
    }
];

const Dashboard = () => {
    const { setTitle } = useOutletContext();

    useEffect(() => {
        setTitle("Dashboard");
    }, [setTitle]);

    return (
        <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header Section */}
            <div className="px-4 py-8 sm:py-12">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-8 sm:mb-12">
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-800 mb-2">
                            Panel de Control
                        </h1>
                        <p className="text-sm sm:text-base text-slate-500">
                            Seleccione un módulo para comenzar
                        </p>
                    </div>

                    {/* Menu Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                        {menuItems.map((item) => (
                            <Link
                                key={item.id}
                                to={item.href}
                                className="group bg-white rounded-xl shadow-sm border border-slate-200/60 hover:shadow-lg hover:border-slate-300 transition-all duration-300 overflow-hidden"
                            >
                                {/* Icon Header */}
                                <div className="bg-[#0070d2] p-3 sm:p-4 flex items-center justify-center">
                                    <div className="text-white group-hover:scale-110 transition-transform duration-300">
                                        {item.icon}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-3 sm:p-4">
                                    <h3 className="font-semibold text-xs sm:text-sm text-slate-800 mb-0.5 leading-tight">
                                        {item.text}
                                    </h3>
                                    <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">
                                        {item.description}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
