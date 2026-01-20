import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useNavigate, useParams } from 'react-router-dom';

const EditCount = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [count, setCount] = useState(null);
    const [countedQty, setCountedQty] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCount = async () => {
            try {
                const res = await fetch(`/api/counts/${id}`);
                if (!res.ok) throw new Error("Count not found");
                const data = await res.json();
                setCount(data);
                setCountedQty(data.counted_qty);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchCount();
    }, [id]);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/counts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ counted_qty: countedQty })
            });
            if (!res.ok) throw new Error("Error updating count");

            navigate('/counts/manage');
        } catch (err) {
            setError(err.message);
        }
    };

    if (loading) return <Layout><div className="p-8">Cargando...</div></Layout>;
    if (error) return <Layout><div className="p-8 text-red-600">{error}</div></Layout>;
    if (!count) return <Layout><div className="p-8">No encontrado</div></Layout>;

    return (
        <Layout title={`Editar Conteo #${id}`}>
            <div className="max-w-2xl mx-auto px-4 py-8">
                <div className="bg-white shadow rounded-lg p-6">
                    <h1 className="text-2xl font-bold mb-6">Editar Conteo #{id}</h1>

                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm text-gray-600">
                        <div>
                            <span className="font-bold">Item:</span> {count.item_code}
                        </div>
                        <div>
                            <span className="font-bold">Sesión:</span> {count.session_id}
                        </div>
                        <div className="col-span-2">
                            <span className="font-bold">Descripción:</span> {count.item_description}
                        </div>
                        <div>
                            <span className="font-bold">Ubicación:</span> {count.counted_location}
                        </div>
                    </div>

                    <form onSubmit={handleSave}>
                        <div className="mb-6">
                            <label className="block text-gray-700 font-bold mb-2">Cantidad Contada</label>
                            <input
                                type="number"
                                value={countedQty}
                                onChange={(e) => setCountedQty(e.target.value)}
                                className="w-full border p-2 rounded text-lg"
                                required
                            />
                        </div>

                        <div className="flex justify-end gap-4">
                            <button
                                type="button"
                                onClick={() => navigate('/counts/manage')} // Go back to manage list
                                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-bold"
                            >
                                Guardar Cambios
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Layout>
    );
};

export default EditCount;
