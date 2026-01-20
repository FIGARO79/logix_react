import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';

const AdminUsers = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/admin/users');
            if (res.status === 401) {
                navigate('/admin/login');
                return;
            }
            if (!res.ok) throw new Error("Error loading users");
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleApprove = async (id) => {
        if (!window.confirm("¿Aprobar este usuario?")) return;
        try {
            const res = await fetch(`/admin/approve/${id}`, { method: 'POST' });
            if (!res.ok) throw new Error("Failed to approve");
            setMessage(`Usuario ${id} aprobado`);
            fetchUsers();
        } catch (e) { setError(e.message); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿ELIMINAR este usuario permanentemente?")) return;
        try {
            const res = await fetch(`/admin/delete/${id}`, { method: 'POST' });
            if (!res.ok) throw new Error("Failed to delete");
            setMessage(`Usuario ${id} eliminado`);
            fetchUsers();
        } catch (e) { setError(e.message); }
    };

    const handleResetPassword = async (id) => {
        const newPass = prompt("Ingrese nueva contraseña:");
        if (!newPass) return;

        try {
            const formData = new FormData();
            formData.append('new_password', newPass);
            const res = await fetch(`/admin/reset_password/${id}`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error("Failed to reset password");
            setMessage(`Contraseña restablecida para usuario ${id}`);
        } catch (e) { setError(e.message); }
    };

    const handleReloadCSV = async () => {
        try {
            const res = await fetch(`/admin/system/reload-data`, { method: 'POST' });
            if (!res.ok) throw new Error("Failed to reload data");
            setMessage("Datos CSV recargados en memoria.");
        } catch (e) { setError(e.message); }
    };

    return (
        <Layout title="Gestión de Usuarios">
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Usuarios Registrados</h1>
                    <div className="flex gap-2">
                        <button onClick={handleReloadCSV} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
                            Recargar CSVs (Hot Reload)
                        </button>
                        <button onClick={() => navigate('/admin/inventory')} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                            Inventario
                        </button>
                    </div>
                </div>

                {message && <div className="bg-green-100 text-green-800 p-3 mb-4 rounded">{message}</div>}
                {error && <div className="bg-red-100 text-red-800 p-3 mb-4 rounded">{error}</div>}

                <div className="bg-white shadow rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.username}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {u.is_approved ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Aprobado</span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Pendiente</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium space-x-2">
                                        {!u.is_approved && (
                                            <button onClick={() => handleApprove(u.id)} className="text-green-600 hover:text-green-900 border border-green-600 rounded px-2 py-1">Aprobar</button>
                                        )}
                                        <button onClick={() => handleResetPassword(u.id)} className="text-blue-600 hover:text-blue-900">Reset Pass</button>
                                        <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-900 ml-2">Eliminar</button>
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

export default AdminUsers;
