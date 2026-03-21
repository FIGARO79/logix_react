import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/Global.css'

// Interceptor global de fetch para manejar sesiones expiradas (Errores 401)
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) {
        if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
        }
    }
    return response;
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
