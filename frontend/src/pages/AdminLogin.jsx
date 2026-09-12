import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/FluentPages.css';

const AdminLogin = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password })
            });

            if (res.ok) {
                navigate('/admin/users');
            } else {
                setError('Contraseña incorrecta');
            }
        } catch (err) {
            setError('Error de conexión');
        }
    };

    return (
        <div className="admin-login-page min-h-full flex items-center justify-center bg-transparent py-12">
            <div className="logix-login-card bg-white">
                <div className="text-center mb-6">
                    <h1 className="text-xl font-normal text-gray-800">Admin Login</h1>
                    <p className="text-sm text-gray-500 font-normal">Acceso restringido</p>
                </div>
                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-xs font-normal">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-xs font-normal mb-2">Contraseña Admin</label>
                        <input
                            type="password"
                            className="w-full p-2 border border-zinc-300 rounded text-xs outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <button type="submit" className="w-full bg-[#0078d4] text-white text-xs font-normal py-2 rounded hover:bg-[#106ebe] transition-colors cursor-pointer">
                        Entrar
                    </button>
                </form>
                <div className="mt-4 text-center">
                    <button onClick={() => navigate('/dashboard')} className="text-xs text-gray-500 hover:text-gray-700 font-normal cursor-pointer">Volver a Inicio</button>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
