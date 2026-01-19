import React, { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';

const Layout = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7fa] text-[#1f2937] font-inter">
            {/* Rotate Overlay (Mobile) */}
            <div id="rotate-overlay" className="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 text-white p-4">
                <div className="max-w-sm text-center">
                    {/* ... SVG Icon ... */}
                    <h2 className="text-xl font-semibold">Gira el dispositivo</h2>
                </div>
            </div>

            {/* Top Header */}
            <header className="top-header bg-[#2c3e50] text-white h-[56px] px-4 flex items-center gap-4 shadow-md sticky top-0 z-50">
                <button
                    className="menu-toggle p-2.5 rounded-lg hover:bg-white/15 active:bg-white/25 transition-all"
                    onClick={toggleMenu}
                    aria-label="Abrir menú"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>
                <h1 className="header-title text-lg font-semibold flex-grow">Logix - Inicio</h1>
                <div className="header-actions flex gap-2">
                    <Link to="/admin" className="text-sm font-medium px-4 py-2 hover:bg-white/15 rounded-lg transition-all">Admin</Link>
                </div>
            </header>

            {/* Sidebar Menu (SAP Fiori Style) */}
            <div className={`dropdown-menu fixed top-[44px] left-0 w-60 max-h-[calc(100vh-44px)] bg-[#354a5f] shadow-lg transform transition-transform duration-200 z-[999] overflow-y-auto ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <nav className="py-2">
                    <Link to="/" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        Inicio
                    </Link>
                    <Link to="/inbound" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        Inbound
                    </Link>
                    <button className="logout-btn w-full text-left flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#f5576c]" onClick={() => console.log('Logout')}>
                        Cerrar Sesión
                    </button>
                </nav>
            </div>

            {/* Overlay */}
            <div
                className={`menu-overlay fixed top-[44px] left-0 w-full h-[calc(100vh-44px)] bg-black/40 transition-opacity z-[998] ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                onClick={toggleMenu}
            ></div>

            {/* Main Content */}
            <main className="main-content flex-grow overflow-y-auto overflow-x-hidden">
                <div className="container mx-auto px-4 py-8 sm:px-6 md:px-8 lg:px-10">
                    <Outlet /> {/* Renders the child route (e.g. Dashboard) */}
                </div>
            </main>
        </div>
    );
};

export default Layout;
