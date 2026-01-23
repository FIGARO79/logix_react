import React, { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import '../styles/Layout.css';

const Layout = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [title, setTitle] = useState('Logix - Inicio');

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7fa] text-[#1f2937] font-inter">
            {/* Rotate Overlay (Mobile) */}
            <div id="rotate-overlay" className="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 text-white p-4">
                <div className="max-w-sm text-center">
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
                <h1 className="header-title text-lg font-semibold flex-grow">{title}</h1>
                <div className="header-actions flex gap-2">
                    <Link to="/admin" className="text-sm font-medium px-4 py-2 hover:bg-white/15 rounded-lg transition-all">Admin</Link>
                </div>
            </header>

            {/* Sidebar Menu (SAP Fiori Style) */}
            <div className={`dropdown-menu fixed top-[56px] left-0 w-60 h-[calc(100vh-56px)] bg-[#354a5f] shadow-lg transform transition-transform duration-200 z-[999] overflow-y-auto ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <nav className="py-2">
                    <Link to="/" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                        </svg>
                        <span>Inicio</span>
                    </Link>
                    <Link to="/stock" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <span>Consultar Stock</span>
                    </Link>
                    <Link to="/inbound" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
                        </svg>
                        <span>Inbound</span>
                    </Link>
                    <Link to="/label" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                        </svg>
                        <span>Etiquetado</span>
                    </Link>
                    <Link to="/view_logs" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path d="M5 4a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1zm-.5 2.5A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5M5 8a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1zm0 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1z" />
                            <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1" />
                        </svg>
                        <span>Visualizar Logs</span>
                    </Link>
                    <Link to="/reconciliation" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z" />
                            <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0" />
                        </svg>
                        <span>Ver conciliación</span>
                    </Link>
                    <Link to="/update" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path d="M8 11a.5.5 0 0 0 .5-.5V6.707l1.146 1.147a.5.5 0 0 0 .708-.708l-2-2a.5.5 0 0 0-.708 0l-2 2a.5.5 0 1 0 .708.708L7.5 6.707V10.5a.5.5 0 0 0 .5.5" />
                            <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1" />
                        </svg>
                        <span>Actualizar Ficheros</span>
                    </Link>
                    <Link to="/counts" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-card-checklist w-5 h-5" viewBox="0 0 16 16">
                            <path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2z" />
                            <path d="M7 5.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-1.496-.854a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0l-.5-.5a.5.5 0 1 1 .708-.708l.146.147 1.146-1.147a.5.5 0 0 1 .708 0M7 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-1.496-.854a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708 0l-.5-.5a.5.5 0 0 1 .708-.708l.146.147 1.146-1.147a.5.5 0 0 1 .708 0" />
                        </svg>
                        <span>Conteo de Items</span>
                    </Link>
                    <Link to="/view_counts" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v4h10V2a1 1 0 0 0-1-1zm9 6h-3v2h3zm0 3h-3v2h3zm0 3h-3v2h2a1 1 0 0 0 1-1zm-4 2v-2H6v2zm-4 0v-2H3v1a1 1 0 0 0 1 1zm-2-3h2v-2H3zm0-3h2V7H3zm3-2v2h3V7zm3 3H6v2h3z" />
                        </svg>
                        <span>Validar conteos</span>
                    </Link>
                    <Link to="/picking" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-cart w-5 h-5" viewBox="0 0 16 16">
                            <path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5M3.102 4l1.313 7h8.17l1.313-7zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4m-7 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2m7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2" />
                        </svg>
                        <span>Chequeo de Picking</span>
                    </Link>
                    <Link to="/view_picking_audits" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path fillRule="evenodd" d="M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0z" />
                            <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z" />
                            <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z" />
                        </svg>
                        <span>Picking por confirmar</span>
                    </Link>
                    <Link to="/planner" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path fillRule="evenodd" d="M6 2a.5.5 0 0 1 .47.33L10 12.036l1.53-4.208A.5.5 0 0 1 12 7.5h3.5a.5.5 0 0 1 0 1h-3.15l-1.88 5.17a.5.5 0 0 1-.94 0L6 3.964 4.47 8.171A.5.5 0 0 1 4 8.5H.5a.5.5 0 0 1 0-1h3.15l1.88-5.17A.5.5 0 0 1 6 2Z" />
                        </svg>
                        <span>Planificador</span>
                    </Link>
                    <Link to="/view_counts/recordings" className="flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#0070d2]" onClick={toggleMenu}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z" />
                        </svg>
                        <span>Reporte Conteos</span>
                    </Link>
                    <button className="logout-btn w-full text-left flex items-center gap-3 px-4 py-2 text-white hover:bg-white/10 border-l-[3px] border-transparent hover:border-[#f5576c]" onClick={() => window.location.href = '/'}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" className="w-5 h-5">
                            <path d="M7.5 1v7h1V1z" />
                            <path d="M3 8.812a5 5 0 0 1 2.578-4.375l-.485-.874A6 6 0 1 0 11 3.616l-.501.865A5 5 0 1 1 3 8.812" />
                        </svg>
                        <span>Cerrar Sesión</span>
                    </button>
                </nav>
            </div>

            {/* Overlay */}
            <div
                className={`menu-overlay fixed top-[56px] left-0 w-full h-[calc(100vh-56px)] bg-black/40 transition-opacity z-[998] ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                onClick={toggleMenu}
            ></div>

            {/* Main Content */}
            <main className="main-content flex-grow overflow-y-auto overflow-x-hidden">
                <div className="container mx-auto px-4 py-8 sm:px-6 md:px-8 lg:px-10">
                    <Outlet context={{ setTitle }} /> {/* Renders the child route (e.g. Dashboard) */}
                </div>
            </main>
        </div>
    );
};

export default Layout;
