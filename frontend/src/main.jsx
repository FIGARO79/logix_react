import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/Global.css'

// Interceptor global de fetch para manejar sesiones y credenciales
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    
    // Si es una petición a nuestra API, asegurar que enviamos cookies
    if (typeof resource === 'string' && resource.startsWith('/api/')) {
        config = config || {};
        config.credentials = 'include';
    }
    
    const response = await originalFetch(resource, config);
    
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
