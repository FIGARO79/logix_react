import React from 'react';
import { Link } from 'react-router-dom';
import {
    InboundIcon, StockIcon, LabelIcon, PickingIcon,
    CycleIcon, CalculatorIcon, ViewCountsIcon, ViewPickingIcon,
    UpdateIcon, CountsIcon
} from '../components/Icons';

const menuItems = [
    {
        id: 'inbound',
        href: '/inbound',
        text: 'Inbound',
        icon: <InboundIcon className="w-12 h-12" />
    },
    {
        id: 'stock',
        href: '/stock',
        text: 'Consultar Stock',
        icon: <StockIcon className="w-12 h-12" />
    },
    {
        id: 'label',
        href: '/label',
        text: 'Etiquetado',
        icon: <LabelIcon className="w-12 h-12" />
    },
    {
        id: 'picking',
        href: '/picking',
        text: 'Auditoria Picking',
        icon: <PickingIcon className="w-12 h-12" />
    },
    {
        id: 'ciclicos',
        href: '/planner',
        text: 'Cíclicos',
        icon: <CycleIcon className="w-12 h-12" />
    },
    {
        id: 'diff_cycles',
        href: '/planner/manage_differences',
        text: 'Diferencias en Cíclicos',
        icon: <CalculatorIcon className="w-12 h-12" />
    },
    {
        id: 'view_counts',
        href: '/view_counts',
        text: 'Validar Conteos',
        icon: <ViewCountsIcon className="w-12 h-12" />
    },
    {
        id: 'view_picking_audits',
        href: '/view_picking_audits',
        text: 'Ver Auditorías Picking',
        icon: <ViewPickingIcon className="w-12 h-12 text-[#0070d2]" />
    },
    {
        id: 'update',
        href: '/update',
        text: 'Actualizar Ficheros',
        icon: <UpdateIcon className="w-12 h-12" />
    },
    {
        id: 'counts',
        href: '/counts',
        text: 'Conteos',
        icon: <CountsIcon className="w-12 h-12" />
    }
];

const Dashboard = () => {
    return (
        <div className="flex flex-col items-center justify-start min-h-[calc(100vh-100px)] pt-16 px-4">
            <header className="mb-16 text-center">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 text-[#0070d2]">
                    Bienvenido a Logix
                </h1>
                <p className="text-lg md:text-xl text-gray-500 font-normal">
                    Seleccione un proceso para comenzar
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full">
                {menuItems.map((item) => (
                    <Link
                        key={item.id}
                        to={item.href}
                        className="bg-white rounded-lg shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col items-center justify-center py-12 px-8 text-center group h-64"
                    >
                        <div className="text-[#0070d2] mb-6 transition-transform duration-300 group-hover:scale-110">
                            {item.icon}
                        </div>
                        <span className="font-medium text-lg text-gray-700 group-hover:text-[#005fb2] transition-colors">
                            {item.text}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
