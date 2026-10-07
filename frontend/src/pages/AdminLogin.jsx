import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
        <div className="admin-login-page min-h-screen flex items-center justify-center bg-[#f3f3f3] py-12">
            <div className="logix-login-card">
                <div className="text-center mb-6">
                    <h1 className="text-xl font-normal text-[#201f1e]">Admin Login</h1>
                    <p className="text-sm text-[#605e5c] mt-1">Acceso restringido</p>
                </div>
                {error && <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded mb-4 text-xs">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-[#605e5c] text-xs uppercase mb-1">Contraseña Admin</label>
                        <input
                            type="password"
                            className="w-full p-2 border border-zinc-300 rounded focus:outline-none focus:border-[#0078d4]"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <button type="submit" className="w-full bg-[#0078d4] text-white font-normal py-2 rounded hover:bg-[#106ebe] transition-colors">
                        Entrar
                    </button>
                </form>
                <div className="mt-4 text-center">
                    <button onClick={() => navigate('/dashboard')} className="text-xs text-[#605e5c] hover:text-[#201f1e]">Volver a Inicio</button>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
