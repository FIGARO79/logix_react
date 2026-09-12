import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTabContext } from '../hooks/useTabContext';
import '../styles/FluentPages.css';

const EditCount = ({ id: propId }) => {
    const { id: paramId } = useParams();
    const navigate = useNavigate();
    const id = propId || paramId;
    const { setTitle } = useTabContext() || {};

    const [count, setCount] = useState(null);
    const [countedQty, setCountedQty] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id || id === 'undefined') return;
        const fetchCount = async () => {
            try {
                const res = await fetch(`/api/counts/${id}`);
                if (!res.ok) throw new Error("Conteo no encontrado");
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
        if (setTitle) setTitle(`Editar Conteo #${id}`);
    }, [id, setTitle]);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/counts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ counted_qty: parseFloat(countedQty) })
            });
            if (!res.ok) throw new Error("Error al actualizar el conteo");

            navigate('/counts/manage');
        } catch (err) {
            setError(err.message);
        }
    };

    if (loading) return <div className="p-8 text-[#605e5c] font-normal text-sm">Cargando datos del conteo...</div>;
    if (error) return <div className="p-8 text-[#a4262c] font-normal text-sm">Error: {error}</div>;
    if (!count) return <div className="p-8 text-[#605e5c] font-normal text-sm">Registro de conteo no encontrado.</div>;

    return (
        <div className="edit-count-page max-w-2xl mx-auto px-4 py-8">
            <div className="bg-white shadow-sm rounded p-6 border border-[#d2d0ce]">
                <h1 className="text-xl font-normal text-[#201f1e] mb-6">Editar Conteo #{id}</h1>

                <div className="grid grid-cols-2 gap-4 mb-6 text-xs text-[#605e5c] bg-[#f9f9f9] p-4 rounded border border-[#e1dfdd]">
                    <div>
                        <span className="font-normal text-[#201f1e]">Item:</span> {count.item_code}
                    </div>
                    <div>
                        <span className="font-normal text-[#201f1e]">Sesión:</span> {count.session_id}
                    </div>
                    <div className="col-span-2">
                        <span className="font-normal text-[#201f1e]">Descripción:</span> {count.item_description || 'N/A'}
                    </div>
                    <div>
                        <span className="font-normal text-[#201f1e]">Ubicación:</span> {count.counted_location}
                    </div>
                </div>

                <form onSubmit={handleSave}>
                    <div className="mb-6">
                        <label className="block text-[#201f1e] text-xs font-normal mb-1.5">Cantidad Contada</label>
                        <input
                            type="number"
                            step="any"
                            value={countedQty}
                            onChange={(e) => setCountedQty(e.target.value)}
                            className="w-full border border-[#8a8886] p-2 rounded text-sm focus:border-[#0078d4] focus:outline-none text-[#201f1e]"
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/counts/manage')}
                            className="bg-[#f3f3f3] text-[#201f1e] border border-[#d2d0ce] px-4 py-1.5 rounded hover:bg-[#edebe9] text-xs font-normal transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="bg-[#0078d4] text-white px-5 py-1.5 rounded hover:bg-[#106ebe] text-xs font-normal transition-colors"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditCount;
