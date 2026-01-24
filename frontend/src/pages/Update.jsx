import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const Update = () => {
    const { setTitle } = useOutletContext();
    const [messages, setMessages] = useState({ success: '', error: '' });
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => { setTitle("Actualizar Ficheros"); }, [setTitle]);

    // Form refs
    const itemMasterRef = React.useRef(null);
    const grnFileRef = React.useRef(null);
    const pickingFileRef = React.useRef(null);

    // States for update options
    const [updateOption, setUpdateOption] = useState('combine');

    // Password states
    const [clearPassword, setClearPassword] = useState('');
    const [backupPassword, setBackupPassword] = useState('');

    const handleFileUpdate = async (e) => {
        e.preventDefault();
        setMessages({ success: '', error: '' });
        setIsLoading(true);

        const formData = new FormData();
        if (itemMasterRef.current.files[0]) formData.append('item_master', itemMasterRef.current.files[0]);
        if (grnFileRef.current.files[0]) formData.append('grn_file', grnFileRef.current.files[0]);
        if (pickingFileRef.current.files[0]) formData.append('picking_file', pickingFileRef.current.files[0]);

        formData.append('update_option_280', updateOption);

        try {
            const res = await fetch('/update', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                setMessages({ success: data.message, error: '' });
                // Reset file inputs
                if (itemMasterRef.current) itemMasterRef.current.value = "";
                if (grnFileRef.current) grnFileRef.current.value = "";
                if (pickingFileRef.current) pickingFileRef.current.value = "";
            } else {
                setMessages({ success: '', error: data.error || "Error uploading files" });
            }
        } catch (err) {
            setMessages({ success: '', error: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearDB = async (e) => {
        e.preventDefault();
        if (!window.confirm("¡PELIGRO! ¿Estás seguro de que quieres borrar TODOS los logs? Esta acción no se puede deshacer.")) return;

        setMessages({ success: '', error: '' });
        setIsLoading(true);

        const formData = new FormData();
        formData.append('password', clearPassword);

        try {
            const res = await fetch('/api/clear_database', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                setMessages({ success: data.message, error: '' });
                setClearPassword('');
            } else {
                setMessages({ success: '', error: data.error || "Error clearing database" });
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
            const res = await fetch('/api/export_all_log', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setMessages({ success: "Backup generado correctamente", error: '' });
            } else {
                const data = await res.json();
                setMessages({ success: '', error: data.error || "Error generating backup" });
            }
        } catch (err) {
            setMessages({ success: '', error: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container-wrapper max-w-4xl mx-auto px-4 py-8">

            {messages.error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{messages.error}</div>}
            {messages.success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{messages.success}</div>}

            {/* File Upload Section */}
            <div className="bg-white shadow rounded-lg p-6 mb-8">
                <h2 className="text-xl font-bold mb-4 text-blue-800">Cargar Archivos CSV</h2>
                <form onSubmit={handleFileUpdate} className="space-y-6">

                    {/* Item Master */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Maestro de Items (Item_Master.csv)</label>
                        <input ref={itemMasterRef} type="file" accept=".csv" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200" />
                    </div>

                    {/* GRN File */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Pedidos de Compra (280 - Reporte_De_Cantidades_De_Pedidos.csv)</label>
                        <input ref={grnFileRef} type="file" accept=".csv" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200" />

                        <div className="mt-3 flex gap-4">
                            <label className="inline-flex items-center">
                                <input type="radio" value="combine" checked={updateOption === 'combine'} onChange={(e) => setUpdateOption(e.target.value)} className="form-radio text-blue-600" />
                                <span className="ml-2 text-sm text-gray-700">Combinar (Agregar nuevas)</span>
                            </label>
                            <label className="inline-flex items-center">
                                <input type="radio" value="replace" checked={updateOption === 'replace'} onChange={(e) => setUpdateOption(e.target.value)} className="form-radio text-blue-600" />
                                <span className="ml-2 text-sm text-gray-700">Reemplazar Todo</span>
                            </label>
                        </div>
                    </div>

                    {/* Picking File */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Ordenes de Venta (240 - Picking.csv)</label>
                        <input ref={pickingFileRef} type="file" accept=".csv" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200" />
                    </div>

                    <button disabled={isLoading} type="submit" className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 font-bold shadow-md transition-all">
                        {isLoading ? 'Procesando...' : 'Subir Archivos'}
                    </button>
                </form>
            </div>

            {/* Database Maintenance Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Clear DB */}
                <div className="bg-red-50 shadow rounded-lg p-6 border border-red-200">
                    <h2 className="text-xl font-bold mb-4 text-red-800 flex items-center">
                        <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Zona de Peligro
                    </h2>
                    <form onSubmit={handleClearDB}>
                        <p className="text-sm text-gray-600 mb-4">Ingrese la contraseña administrativa para borrar TODO el historial.</p>
                        <input
                            type="password"
                            placeholder="Contraseña Admin"
                            value={clearPassword}
                            onChange={(e) => setClearPassword(e.target.value)}
                            className="w-full border p-2 rounded mb-4"
                            required
                        />
                        <button disabled={isLoading} type="submit" className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 font-bold">
                            Limpiar Base de Datos
                        </button>
                    </form>
                </div>

                {/* Backup */}
                <div className="bg-green-50 shadow rounded-lg p-6 border border-green-200">
                    <h2 className="text-xl font-bold mb-4 text-green-800 flex items-center">
                        <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Backup Completo
                    </h2>
                    <form onSubmit={handleBackup}>
                        <p className="text-sm text-gray-600 mb-4">Exportar todo el historial de logs (activo + archivado).</p>
                        <input
                            type="password"
                            placeholder="Contraseña Admin"
                            value={backupPassword}
                            onChange={(e) => setBackupPassword(e.target.value)}
                            className="w-full border p-2 rounded mb-4"
                            required
                        />
                        <button disabled={isLoading} type="submit" className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 font-bold">
                            Descargar Backup
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
};

export default Update;
