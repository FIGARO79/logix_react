import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const Update = () => {
    const { setTitle } = useOutletContext();
    const [messages, setMessages] = useState({ success: '', error: '' });
    const [isLoading, setIsLoading] = useState(false);

    // Drag and Drop State
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState([]);

    useEffect(() => { setTitle("Actualizar Ficheros"); }, [setTitle]);

    // States for update options
    const [updateOption, setUpdateOption] = useState('combine');

    // Password states
    const [clearPassword, setClearPassword] = useState('');
    const [backupPassword, setBackupPassword] = useState('');

    // GRN Selection State
    const [availableGrns, setAvailableGrns] = useState([]);
    const [selectedGrns, setSelectedGrns] = useState([]);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewedFile, setPreviewedFile] = useState(null);

    // Effect to preview GRNs when files change
    useEffect(() => {
        const grnFile = files.find(f => {
            const name = f.name.toLowerCase();
            return name.includes('280') || name.includes('pedido') || name.includes('reporte');
        });

        if (grnFile) {
            if (grnFile !== previewedFile && !isPreviewing) {
                fetchPreviewGrns(grnFile);
            }
        } else {
            // Reset if no GRN file
            setAvailableGrns([]);
            setSelectedGrns([]);
            setPreviewedFile(null);
        }
    }, [files, previewedFile, isPreviewing]);

    const fetchPreviewGrns = async (file) => {
        setIsPreviewing(true);
        setPreviewedFile(file);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/preview_grn_file', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok && data.grns) {
                setAvailableGrns(data.grns);
                setSelectedGrns(data.grns); // Default select all
            }
        } catch (err) {
            console.error("Error previewing GRNs:", err);
            setMessages({ success: '', error: "Error al leer las GRNs del archivo." });
            setPreviewedFile(null);
        } finally {
            setIsPreviewing(false);
        }
    };

    // Drag Handlers
    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFiles(e.dataTransfer.files);
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFiles(e.target.files);
        }
    };

    const handleFiles = (newFiles) => {
        setFiles(prev => [...prev, ...Array.from(newFiles)]);
    };

    const removeFile = (idx) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleFileUpdate = async (e) => {
        e.preventDefault();
        setMessages({ success: '', error: '' });
        setIsLoading(true);

        const formData = new FormData();

        // Auto-detect file types based on keywords
        files.forEach(file => {
            const name = file.name.toLowerCase();
            if (name.includes('master') || name.includes('item')) {
                formData.append('item_master', file);
            } else if (name.includes('280') || name.includes('pedido') || name.includes('reporte')) {
                formData.append('grn_file', file);
            } else if (name.includes('240') || name.includes('picking')) {
                formData.append('picking_file', file);
            }
        });

        formData.append('update_option_280', updateOption);

        // Append selected GRNs if applicable
        if (availableGrns.length > 0) {
            formData.append('selected_grns_280', JSON.stringify(selectedGrns));
        }

        try {
            const res = await fetch('/api/update', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                setMessages({ success: data.message, error: '' });
                setFiles([]);
                setAvailableGrns([]);
                setSelectedGrns([]);
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
            <div className="bg-white shadow rounded-lg overflow-hidden mb-8 border border-gray-200">
                <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800">Actualización de Archivos</h2>
                </div>

                <div className="p-6">
                    <p className="text-gray-600 mb-6 text-sm">Suba los ficheros para actualizar la base de datos maestra y de GRN.</p>

                    <form onSubmit={handleFileUpdate}>

                        {/* Drag and Drop Zone */}
                        <div
                            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer mb-6 ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('file-upload').click()}
                        >
                            <input
                                id="file-upload"
                                type="file"
                                multiple
                                accept=".csv"
                                className="hidden"
                                onChange={handleChange}
                            />

                            <div className="flex flex-col items-center justify-center">
                                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="text-gray-600 font-medium mb-1">
                                    <span className="font-bold text-gray-700">Click to upload</span> or drag and drop
                                </p>
                                <p className="text-gray-400 text-sm">CSV files (250, 280, 240)</p>
                            </div>
                        </div>

                        {/* Selected Files List */}
                        {files.length > 0 && (
                            <div className="mb-6 space-y-2">
                                <h4 className="text-sm font-bold text-gray-700">Archivos seleccionados:</h4>
                                {files.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded border border-gray-200">
                                        <span className="flex items-center gap-2 text-gray-700">
                                            <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                                            {file.name}
                                        </span>
                                        <button type="button" onClick={() => removeFile(index)} className="text-red-500 hover:text-red-700">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Update Options (Only visible if GRN file present) */}
                        {availableGrns.length > 0 && (
                            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                                <p className="font-medium text-gray-700 mb-3">Opción de actualización para el archivo 280:</p>
                                <div className="flex items-center gap-6 mb-4">
                                    <label className="inline-flex items-center cursor-pointer">
                                        <input type="radio" value="combine" checked={updateOption === 'combine'} onChange={(e) => setUpdateOption(e.target.value)} className="form-radio text-blue-600 h-4 w-4" />
                                        <span className="ml-2 text-sm text-gray-700">Combinar (Agregar nuevas)</span>
                                    </label>
                                    <label className="inline-flex items-center cursor-pointer">
                                        <input type="radio" value="replace" checked={updateOption === 'replace'} onChange={(e) => setUpdateOption(e.target.value)} className="form-radio text-blue-600 h-4 w-4" />
                                        <span className="ml-2 text-sm text-gray-700">Reemplazar Todo</span>
                                    </label>
                                </div>

                                <div className="border-t border-gray-200 pt-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="font-medium text-gray-700 text-sm">Seleccionar GRNs a importar:</p>
                                        <div className="text-xs">
                                            <button type="button" onClick={() => setSelectedGrns([...availableGrns])} className="text-blue-600 hover:underline mr-2">Seleccionar Todas</button>
                                            <span className="text-gray-300">|</span>
                                            <button type="button" onClick={() => setSelectedGrns([])} className="text-blue-600 hover:underline ml-2">Deseleccionar Todas</button>
                                        </div>
                                    </div>

                                    <div className="max-h-48 overflow-y-auto bg-white p-3 rounded border border-gray-200 grid grid-cols-2 gap-2">
                                        {availableGrns.map(grn => (
                                            <div key={grn} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id={`grn-${grn}`}
                                                    checked={selectedGrns.includes(grn)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedGrns(prev => [...prev, grn]);
                                                        else setSelectedGrns(prev => prev.filter(g => g !== grn));
                                                    }}
                                                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                />
                                                <label htmlFor={`grn-${grn}`} className="ml-2 text-xs text-gray-700 truncate cursor-pointer" title={grn}>
                                                    {grn}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">Solo se importarán las filas correspondientes a las GRNs marcadas.</p>
                                </div>
                            </div>
                        )}

                        <button disabled={isLoading || files.length === 0} type="submit" className="w-full bg-[#1e73be] hover:bg-blue-700 text-white font-medium py-3 px-4 rounded transition-colors flex items-center justify-center gap-2 shadow-sm">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            {isLoading ? 'Procesando...' : 'Subir y Actualizar Archivos'}
                        </button>
                    </form>
                </div>
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
