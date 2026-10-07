import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const SetPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [formData, setFormData] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!token) {
            setError("Token de seguridad no proporcionado o inválido.");
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);
        setError(null);

        if (formData.newPassword !== formData.confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }

        try {
            const body = new FormData();
            body.append('token', token);
            body.append('new_password', formData.newPassword);
            body.append('confirm_password', formData.confirmPassword);

            const res = await fetch('/api/set_password', {
                method: 'POST',
                body: body
            });
            const data = await res.json();

            if (res.ok) {
                setMessage(data.message);
                setTimeout(() => navigate('/login'), 3000);
            } else {
                setError(data.error || "Error al restablecer la contraseña.");
            }
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="set-password-page flex items-center justify-center min-h-screen bg-[#f3f3f3] py-12">
            <div className="logix-login-card">
                <h3 className="text-xl font-normal text-center text-[#201f1e]">Restablecer Contraseña</h3>
                <p className="mt-1 text-xs text-center text-[#605e5c]">Establece tu nueva contraseña de acceso</p>

                {message && <div className="mt-4 p-3 bg-green-50 text-green-700 border border-green-200 rounded text-xs">{message}</div>}
                {error && <div className="mt-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded text-xs">{error}</div>}

                {token && !message && (
                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        <div>
                            <label className="block text-xs uppercase text-[#605e5c]">Nueva Contraseña</label>
                            <input
                                type="password"
                                name="newPassword"
                                required
                                className="w-full px-3 py-2 mt-1 border border-zinc-300 rounded focus:outline-none focus:border-[#0078d4] text-sm"
                                value={formData.newPassword}
                                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
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
                                Guardar Contraseña
                            </button>
                        </div>
                    </form>
                )}

                <div className="mt-6 text-center text-xs">
                    <a href="/login" className="text-[#0078d4] hover:underline">Volver a Inicio de Sesión</a>
                </div>
            </div>
        </div>
    );
};

export default SetPassword;
