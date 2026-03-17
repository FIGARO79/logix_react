import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';

const AdminMaintenance = () => {
    const navigate = useNavigate();
    const { setTitle } = useOutletContext ? useOutletContext() : { setTitle: () => {} };
    const [messages, setMessages] = useState({ success: '', error: '', info: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [backupPassword, setBackupPassword] = useState('');

    useEffect(() => {
        if (setTitle) setTitle("Mantenimiento de Sistema");
    }, [setTitle]);

    const handleClearDB = async (e) => {
        e.preventDefault();
        if (!window.confirm("¿ESTÁS SEGURO? Esta acción borrará TODO el historial de logs de la base de datos y no se puede deshacer.")) return;
        
        setMessages({ success: '', error: '' });
        setIsLoading(true);

        const formData = new FormData();
        formData.append('password', clearPassword);

        try {
            const res = await fetch('/api/admin/maintenance/clear_database', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                setMessages({ success: data.message, error: '' });
                setClearPassword('');
            } else {
                setMessages({ success: '', error: data.error || "Error al limpiar la base de datos" });
            }
        } catch (err) {
            setMessages({ success: '', error: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackup = async (e) => {
        e.preventDefault();
        setMessages({ success: '', error: '' });
        setIsLoading(true);

        const formData = new FormData();
        formData.append('password', backupPassword);

        try {
            const res = await fetch('/api/admin/maintenance/export_all_log', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Backup_Full_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setMessages({ success: "Backup generado y descargado correctamente", error: '', info: '' });
                setBackupPassword('');
            } else {
                const data = await res.json();
                setMessages({ success: '', error: data.error || "Error al generar el backup", info: '' });
            }
        } catch (err) {
            setMessages({ success: '', error: err.message, info: '' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6">
                <button
                    onClick={() => navigate('/update')}
                    className="flex items-center gap-2 text-[#1e73be] hover:text-[#1a62a3] font-medium transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Volver a Actualización
                </button>
            </div>
            {messages.error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 shadow-sm flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {messages.error}
                </div>
            )}
            {messages.success && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 shadow-sm flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    {messages.success}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                {/* Clear DB - Danger Zone */}
                <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-red-100">
                    <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <h2 className="text-xl font-bold text-white">Zona de Peligro</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-gray-600 mb-6 antialiased">
                            Esta acción eliminará de forma permanente todos los registros de la tabla de logs (historial de movimientos). 
                            <strong> Esta acción no se puede deshacer.</strong>
                        </p>
                        <form onSubmit={handleClearDB} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Contraseña de Administrador</label>
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={clearPassword}
                                    onChange={(e) => setClearPassword(e.target.value)}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                                    required
                                />
                            </div>
                            <button 
                                disabled={isLoading || !clearPassword} 
                                type="submit" 
                                className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 font-bold shadow-md transition-all active:transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'Procesando...' : 'Limpiar Base de Datos'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Backup Full - Secure Zone */}
                <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-green-100">
                    <div className="bg-[#28a745] px-6 py-4 flex items-center gap-3">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                        </svg>
                        <h2 className="text-xl font-bold text-white">Backup Completo</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-gray-600 mb-6 antialiased">
                            Genera un archivo Excel (.xlsx) con todos los movimientos registrados en el sistema, incluyendo los datos archivados.
                        </p>
                        <form onSubmit={handleBackup} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Contraseña de Administrador</label>
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={backupPassword}
                                    onChange={(e) => setBackupPassword(e.target.value)}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    required
                                />
                            </div>
                            <button 
                                disabled={isLoading || !backupPassword} 
                                type="submit" 
                                className="w-full bg-[#28a745] text-white py-3 px-4 rounded-lg hover:bg-[#218838] font-bold shadow-md transition-all active:transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'Generando...' : 'Descargar Backup'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
            
            <div className="mt-8 bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-800">
                    <strong>Nota:</strong> Estas funciones requieren la contraseña administrativa maestra. Los cambios realizados aquí afectan a todo el sistema y a todos los usuarios.
                </p>
            </div>
        </div>
    );
};

export default AdminMaintenance;
