import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Register = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: ''
    });
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);
        setError(null);

        if (formData.password !== formData.confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }

        try {
            const body = new FormData();
            body.append('username', formData.username);
            body.append('password', formData.password);

            const res = await fetch('/api/register', {
                method: 'POST',
                body: body
            });
            const data = await res.json();

            if (res.ok) {
                setMessage(data.message);
                // Redirect to login after a delay? Or just show message.
                setTimeout(() => navigate('/login'), 3000);
            } else {
                setError(data.error || "Error en el registro.");
            }
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="register-page flex items-center justify-center min-h-screen bg-[#f3f3f3] py-12">
            <div className="logix-login-card">
                <h3 className="text-xl font-normal text-center text-[#201f1e]">Registro de Cuenta</h3>
                <p className="mt-1 text-xs text-center text-[#605e5c]">Acceso al sistema Logix</p>

                {message && <div className="mt-4 p-3 bg-green-50 text-green-700 border border-green-200 rounded text-xs">{message}</div>}
                {error && <div className="mt-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded text-xs">{error}</div>}

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label className="block text-xs uppercase text-[#605e5c]">Usuario</label>
                        <input
                            type="text"
                            name="username"
                            required
                            className="w-full px-3 py-2 mt-1 border border-zinc-300 rounded focus:outline-none focus:border-[#0078d4] text-sm"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-[#605e5c]">Contraseña</label>
                        <input
                            type="password"
                            name="password"
                            required
                            className="w-full px-3 py-2 mt-1 border border-zinc-300 rounded focus:outline-none focus:border-[#0078d4] text-sm"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-[#605e5c]">Confirmar Contraseña</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            required
                            className="w-full px-3 py-2 mt-1 border border-zinc-300 rounded focus:outline-none focus:border-[#0078d4] text-sm"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        />
                    </div>
                    <div className="pt-2">
                        <button type="submit" className="w-full py-2 text-white bg-[#0078d4] rounded hover:bg-[#106ebe] transition font-normal text-sm">
                            Registrarse
                        </button>
                    </div>
                </form>
                <div className="mt-6 text-center text-xs">
                    <a href="/login" className="text-[#0078d4] hover:underline">¿Ya tienes cuenta? Inicia sesión</a>
                </div>
            </div>
        </div>
    );
};

export default Register;
