import React from 'react';
import { Link } from "react-router-dom";
import '../styles/FluentPages.css';

const ErrorPage = () => {
    return (
        <div className="error-page min-h-screen flex items-center justify-center bg-[#f9f9f9] py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded border border-[#d2d0ce] shadow-xs">
                <div className="text-[#a4262c] flex justify-center">
                    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-normal text-[#201f1e]">
                        Página no encontrada
                    </h2>
                    <p className="mt-2 text-xs text-[#605e5c] font-normal">
                        La ruta que buscas no existe o ha sido movida.
                    </p>
                </div>
                <div className="mt-6">
                    <Link
                        to="/dashboard"
                        className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-xs font-normal rounded text-white bg-[#0078d4] hover:bg-[#106ebe] transition-colors cursor-pointer"
                    >
                        Volver al Inicio
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ErrorPage;
