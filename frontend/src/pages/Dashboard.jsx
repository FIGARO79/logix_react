import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTabContext as useOutletContext } from '../hooks/useTabContext';

const CATEGORIES_CONFIG = [
    { id: 'recepcion', title: 'Gestión de Recepción', accent: 'bg-blue-600', dropBg: 'bg-blue-50/60' },
    { id: 'despacho', title: 'Operaciones de Despacho', accent: 'bg-emerald-600', dropBg: 'bg-emerald-50/60' },
    { id: 'inventario', title: 'Control de Inventario', accent: 'bg-amber-600', dropBg: 'bg-amber-50/60' },
    { id: 'admin', title: 'Administración del Sistema', accent: 'bg-slate-700', dropBg: 'bg-slate-50/60' }
];

const DEFAULT_CATEGORIES = [
    {
        id: 'recepcion',
        title: 'Gestión de Recepción',
        accent: 'bg-blue-600',
        items: [
            { href: '/inbound', text: 'REGISTRO INBOUND', desc: 'Entrada de mercancía y referencias', categoryId: 'recepcion' },
            { href: '/reconciliation', text: 'CONCILIACIÓN GRN', desc: 'Cruce de documentos y discrepancias', categoryId: 'recepcion' },
            { href: '/view_logs', text: 'CONSULTAR INBOUND', desc: 'Consulta de registros inbound', categoryId: 'recepcion' },
            { href: '/stock', text: 'CONSULTAR STOCK', desc: 'Búsqueda global de inventario y saldos', categoryId: 'recepcion' }
        ]
    },
    {
        id: 'despacho',
        title: 'Operaciones de Despacho',
        accent: 'bg-emerald-600',
        items: [
            { href: '/picking', text: 'EMPACAR PICKING', desc: 'Verificación de pedidos y empaque', categoryId: 'despacho' },
            { href: '/view_picking_audits', text: 'PICKINGS EMPACADOS', desc: 'Listas de empaque y auditorías', categoryId: 'despacho' },
            { href: '/shipments', text: 'CONSOLIDAR DESPACHOS', desc: 'Gestión de despachos y embarques', categoryId: 'despacho' },
            { href: '/label', text: 'ETIQUETADO', desc: 'Impresión de etiquetas operativas', categoryId: 'despacho' }
        ]
    },
    {
        id: 'inventario',
        title: 'Control de Inventario',
        accent: 'bg-amber-600',
        items: [
            { href: '/planner', text: 'PLANIFICACIÓN', desc: 'Programación de conteos cíclicos', categoryId: 'inventario' },
            { href: '/inventory-dashboard', text: 'MÉTRICAS ERI', desc: 'Indicadores de exactitud', categoryId: 'inventario' },
            { href: '/planner/manage_differences', text: 'DIFERENCIAS CICLICOS', desc: 'Gestión de ajustes y discrepancias', categoryId: 'inventario' },
            { href: '/counts', text: 'INVENTARIO W2W', desc: 'Conteo masivo wall-to-wall', categoryId: 'inventario' },
            { href: '/express-audit', text: 'CICLO MANUAL', desc: 'Conteo ciego y auditoría rápida', categoryId: 'inventario' }
        ]
    },
    {
        id: 'admin',
        title: 'Administración del Sistema',
        accent: 'bg-slate-700',
        items: [
            { href: '/admin/inventory', text: 'ADMINISTRACIÓN INVENTARIO', desc: 'Control de ciclos de conteo', categoryId: 'admin' },
            { href: '/admin/slotting', text: 'REGLAS SLOTTING', desc: 'Parámetros de ubicaciones', categoryId: 'admin' },
            { href: '/occupancy', text: 'OCUPACIÓN BODEGA', desc: 'Análisis de espacio y ubicaciones', categoryId: 'admin' },
            { href: '/update', text: 'CARGA DE DATOS', desc: 'Actualización masiva vía ficheros', categoryId: 'admin' }
        ]
    }
];

const STORAGE_KEY = 'logix_dashboard_layout_v2';

const Dashboard = () => {
    const { setTitle } = useOutletContext();
    const [categories, setCategories] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Lookup de metadata fresca desde el código fuente
                    const freshItems = {};
                    DEFAULT_CATEGORIES.forEach(cat => {
                        cat.items.forEach(item => { freshItems[item.href] = item; });
                    });

                    // Mantener layout del usuario, pero usar títulos/descripciones actualizados
                    return parsed.map(cat => {
                        const config = CATEGORIES_CONFIG.find(c => c.id === cat.id);
                        return {
                            ...cat,
                            title: config?.title || cat.title,
                            accent: config?.accent || cat.accent,
                            items: cat.items.map(item => ({
                                ...item,
                                text: freshItems[item.href]?.text || item.text,
                                desc: freshItems[item.href]?.desc || item.desc,
                            }))
                        };
                    });
                }
            }
        } catch (e) {
            console.error("Error cargando configuración de dashboard:", e);
        }
        return DEFAULT_CATEGORIES;
    });

    const [activeDropCategory, setActiveDropCategory] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [feedbackMessage, setFeedbackMessage] = useState(null);
    const [dropTargetInfo, setDropTargetInfo] = useState(null);

    useEffect(() => {
        setTitle("Dashboard");
    }, [setTitle]);

    // Guardar en localStorage
    const saveCategories = useCallback((newCats) => {
        setCategories(newCats);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newCats));
        } catch (e) {
            console.error("Error guardando dashboard:", e);
        }
    }, []);

    const showFeedback = useCallback((msg) => {
        setFeedbackMessage(msg);
        setTimeout(() => setFeedbackMessage(null), 3000);
    }, []);

    // Fijar / Añadir un ítem a una categoría
    // IMPORTANTE: Debe declararse ANTES del useEffect que lo referencia
    // para evitar TDZ (Temporal Dead Zone) en el bundle minificado de producción.
    const pinItem = useCallback((moduleItem, targetCategoryId = null) => {
        const catId = targetCategoryId || moduleItem.categoryId || 'recepcion';
        let alreadyExists = false;

        const updated = categories.map(cat => {
            const existsInCat = cat.items.some(i => i.href === moduleItem.href);
            if (existsInCat) alreadyExists = true;

            if (cat.id === catId && !existsInCat) {
                return {
                    ...cat,
                    items: [...cat.items, { ...moduleItem, categoryId: cat.id }]
                };
            }
            return cat;
        });

        if (alreadyExists) {
            showFeedback(`"${moduleItem.text}" ya se encuentra en el Dashboard.`);
            return;
        }

        saveCategories(updated);
        showFeedback(`"${moduleItem.text}" fijado en el Dashboard.`);
    }, [categories, saveCategories, showFeedback]);

    // Escuchar eventos de fijación desde el menú lateral
    useEffect(() => {
        const handleGlobalPin = (e) => {
            if (e.detail) {
                pinItem(e.detail);
            }
        };
        window.addEventListener('logix_dashboard_pin_item', handleGlobalPin);
        return () => window.removeEventListener('logix_dashboard_pin_item', handleGlobalPin);
    }, [categories, pinItem]);

    // Desfijar / Retirar un ítem del Dashboard
    const unpinItem = (e, href) => {
        e.preventDefault();
        e.stopPropagation();
        const updated = categories.map(cat => ({
            ...cat,
            items: cat.items.filter(i => i.href !== href)
        }));
        saveCategories(updated);
        showFeedback("Opción retirada del Dashboard.");
    };

    // Restaurar opciones por defecto
    const handleResetLayout = () => {
        if (confirm("¿Deseas restaurar la distribución original del Dashboard?")) {
            saveCategories(DEFAULT_CATEGORIES);
            showFeedback("Distribución original restaurada.");
        }
    };

    // Drag & Drop Handlers
    const handleDragStartCard = (e, item, fromCatId, index) => {
        setDraggedItem({ item, fromCatId, index });
        e.dataTransfer.setData('application/json', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOverItem = (e, categoryId, index) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertIndex = e.clientY < midY ? index : index + 1;

        if (!dropTargetInfo || dropTargetInfo.categoryId !== categoryId || dropTargetInfo.index !== insertIndex) {
            setDropTargetInfo({ categoryId, index: insertIndex });
        }
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setActiveDropCategory(null);
        setDropTargetInfo(null);
    };

    const handleDragOverCategory = (e, categoryId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copyMove';
        if (activeDropCategory !== categoryId) {
            setActiveDropCategory(categoryId);
        }
    };

    const handleDragLeaveCategory = (e, categoryId) => {
        if (activeDropCategory === categoryId) {
            setActiveDropCategory(null);
        }
    };

    const handleDropOnCategory = (e, categoryId) => {
        e.preventDefault();
        setActiveDropCategory(null);
        const insertIndex = dropTargetInfo?.categoryId === categoryId ? dropTargetInfo.index : null;
        setDropTargetInfo(null);

        let data = null;
        try {
            const raw = e.dataTransfer.getData('application/json');
            if (raw) data = JSON.parse(raw);
        } catch (err) {
            console.warn("Error leyendo drop data:", err);
        }

        if (!data && draggedItem) {
            data = draggedItem.item;
        }

        if (!data || !data.href) return;

        // Si viene de arrastre interno de una categoría
        if (draggedItem && draggedItem.fromCatId) {
            const fromCatId = draggedItem.fromCatId;

            // Reordenar dentro de la misma categoría
            if (fromCatId === categoryId) {
                const cat = categories.find(c => c.id === categoryId);
                if (!cat) return;
                const oldIndex = cat.items.findIndex(i => i.href === data.href);
                if (oldIndex === -1 || insertIndex === null || oldIndex === insertIndex || oldIndex + 1 === insertIndex) {
                    setDraggedItem(null);
                    return;
                }
                const newItems = [...cat.items];
                const [moved] = newItems.splice(oldIndex, 1);
                const adjustedIndex = insertIndex > oldIndex ? insertIndex - 1 : insertIndex;
                newItems.splice(adjustedIndex, 0, moved);

                const updated = categories.map(c =>
                    c.id === categoryId ? { ...c, items: newItems } : c
                );
                saveCategories(updated);
                setDraggedItem(null);
                return;
            }

            // Mover entre categorías diferentes
            const updated = categories.map(cat => {
                if (cat.id === fromCatId) {
                    return {
                        ...cat,
                        items: cat.items.filter(i => i.href !== data.href)
                    };
                }
                if (cat.id === categoryId) {
                    const alreadyIn = cat.items.some(i => i.href === data.href);
                    if (!alreadyIn) {
                        const newItem = { ...data, categoryId };
                        if (insertIndex !== null) {
                            const newItems = [...cat.items];
                            newItems.splice(insertIndex, 0, newItem);
                            return { ...cat, items: newItems };
                        }
                        return { ...cat, items: [...cat.items, newItem] };
                    }
                }
                return cat;
            });
            saveCategories(updated);
            setDraggedItem(null);
            showFeedback(`"${data.text}" reubicado en ${categories.find(c => c.id === categoryId)?.title || 'categoría'}.`);
            return;
        }

        // Si se arrastra desde el menú lateral
        pinItem(data, categoryId);
        setDraggedItem(null);
    };

    return (
        <div className="min-h-[calc(100vh-80px)] bg-[#f5f5f5] px-5 pt-5 pb-12 lg:px-10 lg:pt-7 lg:pb-12">
            <div className="max-w-7xl mx-auto">
                {/* Feedback Toast */}
                {feedbackMessage && (
                    <div className="mb-5 flex items-center justify-between border-l-4 border-[#0078d4] bg-white px-4 py-3 text-xs font-medium text-[#323130] shadow-sm transition-all">
                        <span>{feedbackMessage}</span>
                        <button
                            type="button"
                            onClick={() => setFeedbackMessage(null)}
                            className="text-blue-500 hover:text-blue-700 font-bold ml-4 !p-0"
                            style={{ width: '16px', height: '16px' }}
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* Grid de Categorías con Drop Zones */}
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                    {categories.map((category) => {
                        const isHovered = activeDropCategory === category.id;
                        const config = CATEGORIES_CONFIG.find(c => c.id === category.id) || CATEGORIES_CONFIG[0];

                        return (
                            <div
                                key={category.id}
                                onDragOver={(e) => handleDragOverCategory(e, category.id)}
                                onDragLeave={(e) => handleDragLeaveCategory(e, category.id)}
                                onDrop={(e) => handleDropOnCategory(e, category.id)}
                                className={`flex flex-col rounded-sm border p-3 transition-all duration-200 ${
                                    isHovered ? `border-dashed border-[#0078d4] ${config.dropBg} shadow-md` : 'border-transparent bg-transparent'
                                }`}
                            >
                                <div className="mb-4 flex items-center gap-3 border-b border-[#e1dfdd] pb-3">
                                    <div className={`h-5 w-1 ${category.accent || config.accent}`}></div>
                                    <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#323130]">{category.title}</h2>
                                </div>

                                <div className="space-y-3 min-h-[140px] flex flex-col">
                                    {category.items.length === 0 ? (
                                        <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center border border-dashed border-[#c8c6c4] bg-white p-6 text-center">
                                            <p className="text-[11px] font-normal text-[#797775]">Arrastra opciones aquí para fijarlas</p>
                                        </div>
                                    ) : (
                                        <>
                                            {category.items.map((item, idx) => (
                                                <React.Fragment key={item.href || idx}>
                                                    {/* Indicador de posición de inserción */}
                                                    {dropTargetInfo?.categoryId === category.id && dropTargetInfo.index === idx && draggedItem && (
                                                        <div className="mx-1 h-0.5 bg-[#0078d4]" />
                                                    )}
                                                    <div
                                                        draggable
                                                        onDragStart={(e) => handleDragStartCard(e, item, category.id, idx)}
                                                        onDragOver={(e) => handleDragOverItem(e, category.id, idx)}
                                                        onDragEnd={handleDragEnd}
                                                        className={`group relative block cursor-grab select-none rounded-sm border border-[#e1dfdd] bg-white p-4 transition-all duration-200 active:cursor-grabbing hover:border-[#8a8886] hover:shadow-md ${
                                                            draggedItem?.item?.href === item.href ? 'scale-[0.98] opacity-30' : ''
                                                        }`}
                                                    >
                                                        <Link to={item.href} className="block pr-5">
                                                            <div className="text-xs font-semibold tracking-normal text-[#323130] transition-colors group-hover:text-[#0078d4]">
                                                                {item.text}
                                                            </div>
                                                            <div className="mt-1 text-[11px] font-normal uppercase tracking-normal text-[#605e5c]">
                                                                {item.desc}
                                                            </div>
                                                        </Link>

                                                        {/* Botón de Desfijar / Retirar */}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => unpinItem(e, item.href)}
                                                            className="absolute right-2 top-2 flex h-6 w-6 !p-0 cursor-pointer items-center justify-center rounded-sm text-[#a19f9d] opacity-0 transition-all duration-150 hover:bg-[#fde7e9] hover:text-[#a4262c] group-hover:opacity-100"
                                                            style={{ padding: 0, width: '24px', height: '24px', minWidth: '24px' }}
                                                            title="Retirar del Dashboard"
                                                            aria-label="Retirar del Dashboard"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </React.Fragment>
                                            ))}
                                            {/* Indicador al final de la lista */}
                                            {dropTargetInfo?.categoryId === category.id && dropTargetInfo.index === category.items.length && draggedItem && (
                                                        <div className="mx-1 h-0.5 bg-[#0078d4]" />
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer con botón de Restaurar Distribución */}
                <div className="mt-10 flex items-center justify-end border-t border-[#e1dfdd] pt-5">
                    <button
                        type="button"
                        onClick={handleResetLayout}
                        className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-[#8a8886] bg-white px-3 py-1.5 text-[11px] text-[#323130] shadow-sm transition-all hover:bg-[#f3f3f3] hover:text-[#201f1e] active:scale-95"
                        title="Restaurar todas las tarjetas por defecto"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px', minWidth: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Restaurar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
