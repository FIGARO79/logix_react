import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/Global.css'

// Polyfill para crypto.randomUUID en entornos no seguros (HTTP)
if (typeof window !== 'undefined' && !window.crypto.randomUUID) {
    window.crypto.randomUUID = function () {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    };
}

// Interceptor global de fetch para manejar sesiones expiradas (Errores 401)
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    try {
        const response = await originalFetch(...args);
        if (response.status === 401) {
            if (!window.location.pathname.includes('/login')) {
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
        return response;
    } catch (error) {
        console.error("Fetch error interceptor:", error);
        throw error;
    }
};

// Captura de errores globales para prevenir páginas en blanco permanentes
window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global error caught:", message, error);
    // Si el error ocurre al inicio, podría ser por localStorage corrupto
    if (message.includes("JSON.parse") || message.includes("localStorage")) {
        console.warn("Posible corrupción de datos locales detectada. Limpiando...");
        localStorage.clear();
        setTimeout(() => window.location.reload(), 1000);
    }
};

try {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    )
} catch (error) {
    console.error("Root render error:", error);
    localStorage.clear();
    window.location.reload();
}
