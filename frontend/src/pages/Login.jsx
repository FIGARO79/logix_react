import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/FluentPages.css';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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

                // Save user data to localStorage for frontend permission checks
                if (data.user) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                }

                // Force full reload to ensure session cookies are picked up and App component re-mounts
                window.location.href = '/dashboard';
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
        <div className="login-page min-h-screen flex items-center justify-center bg-[#f9f9f9]">
            <div className="logix-login-card bg-white p-6 rounded border border-[#d2d0ce] shadow-xs">
                <h1 className="text-xl font-normal text-[#201f1e] mb-6 text-center">Iniciar Sesión</h1>

                {error && (
                    <div className="bg-[#fde7e9] border border-[#f8b8bc] text-[#a4262c] px-3 py-2 rounded text-xs font-normal mb-4" role="alert">
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-normal text-[#201f1e] mb-1">Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="w-full rounded border border-[#8a8886] p-2 text-xs font-normal text-[#201f1e] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-normal text-[#201f1e] mb-1">Contraseña</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full rounded border border-[#8a8886] p-2 pr-10 text-xs font-normal text-[#201f1e] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#605e5c] hover:text-[#201f1e] focus:outline-none cursor-pointer"
                            >
                                {showPassword ? (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                ) : (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full bg-[#0078d4] text-white py-2 rounded text-xs font-normal hover:bg-[#106ebe] transition-colors cursor-pointer ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Cargando...' : 'Entrar'}
                    </button>

                    <div className="mt-4 text-center text-xs font-normal">
                        <Link to="/register" className="text-[#0078d4] hover:underline">Registrarse</Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
