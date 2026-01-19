import React, { useState } from 'react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        console.log('Login attempt', { username, password });
        // TODO: Implement actual login logic hitting /login endpoint
        window.location.href = '/';
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
                <h2 className="text-2xl font-bold mb-6 text-center text-[#2c3e50]">Iniciar Sesión</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50 p-2 border"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50 p-2 border"
                        />
                    </div>
                    <button type="submit" className="w-full bg-[#0070d2] text-white py-2 rounded hover:bg-[#005fb2] transition">
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
