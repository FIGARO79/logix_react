import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import '../styles/Layout.css';
// Icons imported from shared component
import {
    InboundIcon, StockIcon, LabelIcon, PickingIcon,
    CycleIcon, CalculatorIcon, ViewCountsIcon, ViewPickingIcon,
    UpdateIcon, CountsIcon, LogoutIcon, HomeIcon, DocumentIcon, EyeIcon, ReportIcon
} from './Icons';

// Check if user is on specific path for active styling
const MenuItem = ({ to, icon, label, onClick }) => {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link
            to={to}
            className={`flex items-center px-4 py-3 text-white transition-colors border-l-[4px] 
            ${isActive ? 'bg-white/10 border-[var(--sap-primary)]' : 'hover:bg-white/10 border-transparent hover:border-[var(--sap-primary)]'}`}
            onClick={onClick}
        >
            <div className="w-8 flex justify-center opacity-80">
                {icon}
            </div>
            <span className="text-sm font-medium tracking-wide ml-2">{label}</span>
        </Link>
    );
};

const menuItems = [
    {
        id: 'home',
        href: '/',
        text: 'Inicio',
        icon: <HomeIcon className="w-5 h-5" />
    },
    {
        id: 'inbound',
        href: '/inbound',
        text: 'Inbound',
        icon: <InboundIcon className="w-5 h-5" />
    },
    {
        id: 'stock',
        href: '/stock',
        text: 'Consultar Stock',
        icon: <StockIcon className="w-5 h-5" />
    },
    {
        id: 'label',
        href: '/label',
        text: 'Etiquetado',
        icon: <LabelIcon className="w-5 h-5" />
    },
    {
        id: 'picking',
        href: '/picking',
        text: 'Auditoría Picking',
        icon: <PickingIcon className="w-5 h-5" />
    },
    {
        id: 'ciclicos',
        href: '/planner',
        text: 'Cíclicos',
        icon: <CycleIcon className="w-5 h-5" />
    },
    {
        id: 'diff_cycles',
        href: '/planner/manage_differences',
        text: 'Diferencias en Cíclicos',
        icon: <CalculatorIcon className="w-5 h-5" />
    },
    {
        id: 'view_counts',
        href: '/view_counts',
        text: 'Validar Conteos',
        icon: <ViewCountsIcon className="w-5 h-5" />
    },
    {
        id: 'view_picking_audits',
        href: '/view_picking_audits',
        text: 'Ver Auditorías Picking',
        icon: <ViewPickingIcon className="w-5 h-5" />
    },
    {
        id: 'update',
        href: '/update',
        text: 'Actualizar Ficheros',
        icon: <UpdateIcon className="w-5 h-5" />
    },
    {
        id: 'counts',
        href: '/counts',
        text: 'Conteos',
        icon: <CountsIcon className="w-5 h-5" />
    },
    {
        id: 'view_logs',
        href: '/view_logs',
        text: 'Visualizar Logs',
        icon: <DocumentIcon className="w-5 h-5" />
    },
    {
        id: 'reconciliation',
        href: '/reconciliation',
        text: 'Ver conciliación',
        icon: <EyeIcon className="w-5 h-5" />
    },
    {
        id: 'report_counts',
        href: '/view_counts/recordings',
        text: 'Reporte Conteos',
        icon: <ReportIcon className="w-5 h-5" />
    }
];

const Layout = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    return (
        <div className="layout-container font-[72]"> {/* Setting default font here as well */}
            {/* Overlay for mobile */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
                    onClick={toggleMenu}
                ></div>
            )}

            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-12 bg-[var(--sap-shell-bg)] text-white shadow-md z-30 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleMenu}
                        className="p-1 hover:bg-white/10 rounded focus:outline-none"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                    <span className="font-bold text-lg tracking-tight">Logix - Inicio</span>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium opacity-90 hidden sm:block">Admin</span>
                </div>
            </header>

            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 bottom-0 w-64 bg-[var(--sap-footer-bg)] text-white shadow-lg z-30 transform transition-transform duration-300 ease-in-out overflow-y-auto custom-scrollbar
                ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
                style={{ top: '48px', height: 'calc(100vh - 48px)' }}
            >
                <nav className="py-2 space-y-0.5">
                    {menuItems.map(item => (
                        <MenuItem key={item.id} to={item.href} icon={item.icon} label={item.text} onClick={toggleMenu} />
                    ))}

                    <Link
                        to="#"
                        className="flex items-center px-4 py-3 text-white hover:bg-white/10 transition-colors mt-4 border-t border-white/10"
                        onClick={() => {
                            // Implement logout logic here later if needed
                            toggleMenu();
                        }}
                    >
                        <div className="w-8 flex justify-center opacity-80">
                            <LogoutIcon className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-medium tracking-wide ml-2">Cerrar Sesión</span>
                    </Link>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="pt-12 min-h-screen bg-[var(--sap-bg)]">
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
