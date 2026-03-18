import React, { useEffect } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';

const AdminLayout = ({ children, title }) => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext() || {};

    // Sincronizar el título con el encabezado global (Layout.jsx)
    useEffect(() => {
        if (setTitle) {
            setTitle(title || 'Administración');
        }
    }, [setTitle, title]);

    const handleLogout = async () => {
        // En este contexto (dentro de Layout), el logout usualmente se maneja en el sidebar.
        // Pero mantenemos la lógica por si se usa individualmente.
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#f7f7f7] font-sans text-[#32363a] -mt-6">
            {/* Toolbar secundaria integrada (No es un fixed header) */}
            <div className="bg-white border-b border-gray-200 py-3 mb-6 shadow-sm sticky top-[48px] z-10 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <img src="/static/images/gear-wide-connected.svg" alt="Admin" className="h-5 w-5 opacity-60" />
                        <span className="text-sm font-semibold text-gray-700 hidden sm:inline">Herramientas Administrativas</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={(e) => { e.preventDefault(); window.location.reload(); }}
                            className="bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium px-4 py-1.5 rounded border border-gray-300 transition-colors flex items-center gap-2 text-xs"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[#354a5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Recargar CSVs
                        </button>

                        <div className="h-6 w-px bg-gray-300 mx-1 hidden md:block"></div>

                        <Link to="/admin/inventory" className="text-gray-600 hover:text-[#354a5f] hover:bg-gray-50 px-3 py-1.5 rounded transition-colors text-xs font-semibold">
                            Inventario
                        </Link>

                        <Link to="/admin/slotting" className="text-gray-600 hover:text-[#354a5f] hover:bg-gray-50 px-3 py-1.5 rounded transition-colors text-xs font-semibold">
                            Slotting
                        </Link>

                        <Link to="/admin/users" className="text-gray-600 hover:text-[#354a5f] hover:bg-gray-50 px-3 py-1.5 rounded transition-colors text-xs font-semibold">
                            Usuarios
                        </Link>
                    </div>
                </div>
            </div>

            {/* Contenido principal de la página admin */}
            <div className="max-w-[1400px] mx-auto">
                {children}
            </div>
        </div>
    );
};

export default AdminLayout;
