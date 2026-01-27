import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const res = await fetch('/api/login', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                // Login successful
                console.log("Login successful", data);
                // Force full reload to ensure session cookies are picked up and App component re-mounts
                window.location.href = '/';
            } else {
                setError(data.error || "Error al iniciar sesión");
            }
        } catch (err) {
            console.error("Login failed", err);
            setError("Error de conexión con el servidor");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="fiori-login-card">
                <h2 className="text-2xl font-bold mb-6 text-center text-[#2c3e50]">Iniciar Sesión</h2>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50 p-2 border"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-[#0070d2] focus:ring focus:ring-[#0070d2] focus:ring-opacity-50 p-2 border"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full bg-[#0070d2] text-white py-2 rounded hover:bg-[#005fb2] transition ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Cargando...' : 'Entrar'}
                    </button>

                    <div className="mt-4 text-center text-sm">
                        <Link to="/register" className="text-blue-600 hover:underline">Registrarse</Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
