import React from 'react';
import { Link } from 'react-router-dom';

const menuItems = [
    { id: 'inbound', href: '/inbound', text: 'Inbound', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M9 12l3 3m0 0 3-3m-3 3V2.25" /></svg> },
    { id: 'stock', href: '/stock', text: 'Consultar Stock', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg> },
    { id: 'label', href: '/label', text: 'Etiquetado', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg> },
    { id: 'picking', href: '/picking', text: 'Auditoría Picking', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-cart" viewBox="0 0 16 16"><path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5M3.102 4l1.313 7h8.17l1.313-7zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4m-7 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2m7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2" /></svg> },
    // ... (Other items from inicio.html can be added here)
];

const Dashboard = () => {
    return (
        <>
            <header className="mb-10 md:mb-12 text-center">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-[#0070d2] leading-tight">
                    Bienvenido a Logix
                </h1>
                <p className="text-base sm:text-lg md:text-xl text-gray-600 font-medium">
                    Seleccione un proceso para comenzar
                </p>
            </header>

            <div id="main-menu-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6 max-w-7xl mx-auto">
                {menuItems.map((item) => (
                    <Link
                        key={item.id}
                        to={item.href}
                        className="grid-card bg-white rounded-md border border-gray-200 border-t-transparent hover:border-gray-300 hover:border-t-[#0070d2] hover:-translate-y-1 shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col items-center justify-center p-8 min-h-[180px] text-center text-[#1f2937] group"
                    >
                        <div className="text-[#0070d2] w-12 h-12 mb-5 transition-transform duration-300 group-hover:scale-110">
                            {/* Clone icon with distinct classes if needed, or stick to simple svg usage */}
                            {React.cloneElement(item.icon, { width: '100%', height: '100%' })}
                        </div>
                        <span className="font-medium text-lg text-gray-700 group-hover:text-[#005fb2] transition-colors">{item.text}</span>
                    </Link>
                ))}
            </div>
        </>
    );
};

export default Dashboard;
