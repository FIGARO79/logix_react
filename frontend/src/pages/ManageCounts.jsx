import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';

const ManageCounts = () => {
    const navigate = useNavigate();
    const [counts, setCounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    // Filter states
    const [groupBySession, setGroupBySession] = useState(false);

    // Reopen Location Form
    const [reopenSessionId, setReopenSessionId] = useState('');
    const [reopenLocationCode, setReopenLocationCode] = useState('');

    const fetchCounts = async () => {
        try {
            const res = await fetch('/api/counts/all');
            if (!res.ok) throw new Error("Error loading counts");
            const data = await res.json();
            setCounts(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCounts();
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este conteo permanentemente?")) return;
        try {
            const res = await fetch(`/api/counts/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error deleting");
            }
            setMessage("Conteo eliminado");
            fetchCounts();
        } catch (e) { setError(e.message); }
    };

    const handleReopenLocation = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/locations/reopen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: parseInt(reopenSessionId),
                    location_code: reopenLocationCode
                })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error reopening location");
            }
            setMessage(`Ubicación ${reopenLocationCode} reabierta en sesión ${reopenSessionId}`);
            setReopenSessionId('');
            setReopenLocationCode('');
        } catch (e) { setError(e.message); }
    };

    return (
        <Layout title="Gestionar Conteos">
            <div className="max-w-7xl mx-auto px-4 py-8">

                {/* Admin Tools: Reopen Location */}
                <div className="mb-8 p-4 bg-orange-50 border-l-4 border-orange-500 rounded shadow-sm max-w-lg">
                    <h2 className="text-lg font-bold text-orange-800 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Reabrir Ubicación
                    </h2>
                    <form onSubmit={handleReopenLocation} className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700">ID Sesión</label>
                                <input
                                    type="number"
                                    value={reopenSessionId}
                                    onChange={(e) => setReopenSessionId(e.target.value)}
                                    className="w-full border p-1 rounded"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700">Cód. Ubicación</label>
                                <input
                                    type="text"
                                    value={reopenLocationCode}
                                    onChange={(e) => setReopenLocationCode(e.target.value.toUpperCase())}
                                    className="w-full border p-1 rounded"
                                    required
                                />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-orange-600 text-white py-1 rounded hover:bg-orange-700 text-sm font-bold">
                            Reabrir
                        </button>
                    </form>
                </div>

                {message && <div className="bg-green-100 text-green-800 p-3 mb-4 rounded">{message}</div>}
                {error && <div className="bg-red-100 text-red-800 p-3 mb-4 rounded">{error}</div>}

                {/* Toolbar */}
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-800">Historial de Conteos</h1>
                    <button
                        onClick={() => navigate('/counts')} // Back to cycle counts dashboard
                        className="bg-gray-100 text-blue-600 px-4 py-2 rounded border hover:bg-gray-200"
                    >
                        Volver a Tablero
                    </button>
                </div>

                {/* Table */}
                <div className="bg-white shadow rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sesión</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Desc</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cant</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {counts.length === 0 && !loading && (
                                <tr><td colSpan="8" className="p-8 text-center text-gray-500">No hay conteos registrados.</td></tr>
                            )}
                            {counts.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900 font-bold">#{c.id}</td>
                                    <td className="px-3 py-3 text-sm text-gray-600">{c.session_id}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{c.username}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.item_code}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-xs" title={c.item_description}>{c.item_description}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{c.counted_location}</td>
                                    <td className="px-4 py-3 text-sm font-bold text-gray-900">{c.counted_qty}</td>
                                    <td className="px-4 py-3 text-center flex justify-center gap-2">
                                        <button
                                            onClick={() => navigate(`/counts/edit/${c.id}`)}
                                            className="text-indigo-600 hover:text-indigo-900 p-1 border border-transparent hover:border-indigo-200 rounded"
                                            title="Editar"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(c.id)}
                                            className="text-red-600 hover:text-red-900 p-1 border border-transparent hover:border-red-200 rounded"
                                            title="Eliminar"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
};

export default ManageCounts;
