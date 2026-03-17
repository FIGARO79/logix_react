import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const AdminLogin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Get the return path from location state, or default to /admin/users
    const from = location.state?.from?.pathname || "/admin/users";

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password })
            });

            if (res.ok) {
                navigate(from, { replace: true });
            } else {
                setError('Contraseña incorrecta');
            }
        } catch (err) {
            setError('Error de conexión con el servidor');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="fiori-login-card">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">Admin Login</h1>
                    <p className="text-gray-500">Acceso restringido</p>
                </div>
                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">Contraseña Admin</label>
                        <input
                            type="password"
                            className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#285f94]"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                            required
                        />
                    </div>
                    <button 
                        disabled={isLoading}
                        type="submit" 
                        className="w-full bg-[#285f94] text-white font-bold py-2 rounded hover:bg-[#1e4a74] disabled:opacity-50"
                    >
                        {isLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>
                <div className="mt-4 text-center">
                    <button onClick={() => navigate('/update')} className="text-sm text-gray-500 hover:text-gray-700">Cancelar y Volver</button>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
