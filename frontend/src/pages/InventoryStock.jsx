import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import ScannerModal from '../components/ScannerModal';
import { useOffline } from '../hooks/useOffline';
import { getDB } from '../utils/offlineDb';

// Sonidos sintetizados (para no depender de archivos externos)
const playSound = (type) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } else {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
};

const InventoryStock = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const { isOnline } = useOffline();

    // Campos mapeados exactamente como en stock.html
    const fields = [
        { id: "Item_Code", label: "Item Code" },
        { id: "Item_Description", label: "Descripción" },
        { id: "Physical_Qty", label: "Cantidad Física" },
        { id: "Frozen_Qty", label: "Cantidad Congelada" },
        { id: "Bin_1", label: "Ubicación Principal" },
        { id: "Aditional_Bin_Location", label: "Ubicaciones Adicionales" },
        { id: "ABC_Code_stockroom", label: "Código ABC" },
        { id: "Weight_per_Unit", label: "Peso por Unidad" },
        { id: "SupersededBy", label: "Reemplazado Por" }
    ];

    const handleSearch = async (e, term = null) => {
        if (e?.preventDefault) e.preventDefault();
        const searchValue = (term || searchTerm).trim().toUpperCase();
        if (!searchValue) return;

        setLoading(true);
        setError(null);
        setItemData(null);

        let onlineFound = false;
        if (isOnline) {
            try {
                const response = await fetch(`/api/stock_item/${encodeURIComponent(searchValue)}`);
                const data = await response.json();

                if (response.ok && !data.error) {
                    setItemData(data);
                    playSound('success');
                    onlineFound = true;
                }
            } catch (err) {
                console.error("Error searching online, falling back to offline", err);
            }
        }

        if (!onlineFound) {
            try {
                const db = await getDB();
                const localItem = await db.get('master_items', searchValue);
                if (localItem) {
                    setItemData({
                        Item_Code: localItem.Item_Code,
                        Item_Description: localItem.Item_Description,
                        Physical_Qty: localItem.Physical_Qty || '-',
                        Frozen_Qty: localItem.Frozen_Qty || '-',
                        Bin_1: localItem.Bin_1,
                        Aditional_Bin_Location: localItem.Aditional_Bin_Location || '-',
                        ABC_Code_stockroom: localItem.ABC_Code_stockroom,
                        Weight_per_Unit: localItem.Weight_per_Unit,
                        SupersededBy: localItem.SupersededBy || '-',
                        is_offline: true
                    });
                    playSound('success');
                } else {
                    setError("Artículo no encontrado en el maestro local (Modo Offline)");
                    playSound('error');
                }
            } catch (err) {
                setError("Error al buscar en la base de datos local");
                playSound('error');
            }
        }
        setLoading(false);
    };

    // Función para ejecutar búsqueda directamente (usada por el scanner)
    const executeSearch = async (term) => {
        if (!term.trim()) return;

        setLoading(true);
        setError(null);
        setItemData(null);

        try {
            const response = await fetch(`/api/stock_item/${encodeURIComponent(term.toUpperCase())}`);
            const data = await response.json();

            if (response.ok && !data.error) {
                setItemData(data);
                playSound('success');
            } else {
                setError(data.error || "Artículo no encontrado");
                playSound('error');
            }
        } catch (err) {
            setError("Error de conexión al buscar el artículo");
            playSound('error');
        } finally {
            setLoading(false);
        }
    };

    // Lógica del Escáner
    const handleScan = (code) => {
        setScannerOpen(false);
        setSearchTerm(code);
        executeSearch(code);
    };

    return (
        <Layout title="Consultar Inventario">
            <div className="max-w-[800px] mx-auto px-4 py-3">
                <div className="bg-white p-6 rounded-md shadow-md border border-[#d9d9d9]">
                    {/* Header estilo SAP */}
                    <div className="bg-[#f2f2f2] text-[#32363a] px-4 py-3 -mx-6 -mt-6 mb-4 rounded-t-md border-b border-[#d9d9d9]">
                        <h1 className="text-base font-semibold m-0 font-sans">Consulta de Inventario</h1>
                    </div>

                    {/* Controles de Búsqueda */}
                    <form onSubmit={handleSearch} className="flex flex-col gap-3 mb-6">
                        <div className="flex items-center justify-between mb-1">
                            <label className="block font-semibold text-xs text-[#32363a] uppercase tracking-wide">
                                Ingrese el código del artículo
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <div className="relative flex-grow">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                                    placeholder="Buscar por Item Code..."
                                    className="w-full border border-[#89919a] p-2.5 rounded-[3px] text-[14px] bg-white focus:outline-none focus:border-[#285f94] focus:ring-2 focus:ring-[#285f94]/10 transition-all font-mono"
                                    autoFocus
                                />
                                {loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-[#285f94] border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setScannerOpen(true)}
                                className="h-[42px] px-4 bg-[#f2f2f2] hover:bg-[#e6e6e6] text-[#32363a] border border-[#d9d9d9] rounded-[3px] shadow-sm flex items-center justify-center transition-all"
                                title="Escanear código"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" />
                                    <path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" />
                                    <path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" />
                                    <path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" />
                                    <path d="M12 9h2V8h-2z" />
                                </svg>
                            </button>
                            <button
                                type="submit"
                                className="h-[42px] px-6 bg-[#285f94] hover:bg-[#1e4a74] text-white rounded-[3px] shadow-sm flex items-center justify-center transition-all font-semibold"
                                disabled={loading}
                            >
                                BUSCAR
                            </button>
                        </div>
                    </form>

                    {/* Mensaje de Error */}
                    {error && (
                        <div className="mb-4 bg-[#fef6f6] border-l-4 border-[#b00] text-[#b00] p-3 text-sm flex items-center">
                            <span className="font-bold mr-2">Error:</span> {error}
                        </div>
                    )}

                    {/* Formulario de Resultados (Card View) */}
                    <div className="space-y-1 mt-6 grid grid-cols-1 gap-0">
                        {fields.map((field) => (
                            <div key={field.id}>
                                <label className="block font-semibold mb-1 text-xs text-[#32363a] uppercase tracking-wide">
                                    {field.label}
                                </label>
                                <div className="bg-[#f8f9fa] px-3 py-2 rounded-[3px] min-h-[38px] border border-[#d9d9d9] text-[#32363a] text-[13px] leading-relaxed flex items-center break-words">
                                    {itemData ? (itemData[field.id] !== null && itemData[field.id] !== undefined ? itemData[field.id] : '') : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal Scanner */}
            {scannerOpen && (
                <ScannerModal
                    title="Escanear Código de Barras"
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />
            )}
        </Layout>
    );
};

export default InventoryStock;