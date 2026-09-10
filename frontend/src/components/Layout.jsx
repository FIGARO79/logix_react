import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, matchPath } from 'react-router-dom';
import { useOffline } from '../hooks/useOffline';
import { checkAndSyncIfNeeded } from '../utils/syncManager';
import '../styles/Layout.css';
import { TabProvider } from '../hooks/useTabContext';

// Importación de componentes para Keep-Alive
import Dashboard from '../pages/Dashboard';
import Reconciliation from '../pages/Reconciliation';
import StockSearch from '../pages/StockSearch';
import PickingAuditHistory from '../pages/PickingAuditHistory';
import Inbound from '../pages/Inbound';
import CycleCounts from '../pages/CycleCounts';
import ExpressAudit from '../pages/ExpressAudit';
import SpotCheck from '../pages/SpotCheck';
import LabelPrinting from '../pages/LabelPrinting';
import Planner from '../pages/Planner';
import PlannerExecution from '../pages/PlannerExecution';
import PickingAudit from '../pages/PickingAudit';
import AdminLogin from '../pages/AdminLogin';
import AdminInventory from '../pages/AdminInventory';
import AdminUsers from '../pages/AdminUsers';
import SlottingConfig from '../pages/SlottingConfig';
import ManageCounts from '../pages/ManageCounts';
import ViewCounts from '../pages/ViewCounts';
import EditCount from '../pages/EditCount';
import InboundHistory from '../pages/InboundHistory';
import Update from '../pages/Update';
import CycleCountHistory from '../pages/CycleCountHistory';
import DashboardInventario from './../pages/DashboardInventario';
import OccupancyDashboard from '../pages/OccupancyDashboard';
import ManageCountDifferences from '../pages/ManageCountDifferences';
import ManageCycleCountDifferences from '../pages/ManageCycleCountDifferences';
import Shipments from '../pages/Shipments';
import PackingListPrint from '../pages/PackingListPrint';
import InboundAudit from '../pages/InboundAudit';
import IRReconciliation from '../pages/IRReconciliation';

// Mapeo de rutas a componentes
const ROUTE_MAP = [
    { path: '/dashboard', component: Dashboard },
    { path: '/inbound', component: Inbound },
    { path: '/reconciliation', component: Reconciliation },
    { path: '/ir-reconciliation', component: IRReconciliation },
    { path: '/stock', component: StockSearch },
    { path: '/spot-check', component: SpotCheck },
    { path: '/view_picking_audits', component: PickingAuditHistory },
    { path: '/label', component: LabelPrinting },
    { path: '/planner', component: Planner },
    { path: '/planner/execution', component: PlannerExecution },
    { path: '/planner/manage_differences', component: ManageCycleCountDifferences },
    { path: '/picking', component: PickingAudit },
    { path: '/view_logs', component: InboundHistory },
    { path: '/counts', component: CycleCounts },
    { path: '/express-audit', component: ExpressAudit },
    { path: '/counts/manage', component: ManageCounts },
    { path: '/view_counts', component: ViewCounts },
    { path: '/counts/manage_differences', component: ManageCountDifferences },
    { path: '/view_counts/recordings', component: CycleCountHistory },
    { path: '/inventory-dashboard', component: DashboardInventario },
    { path: '/occupancy', component: OccupancyDashboard },
    { path: '/admin/inventory', component: AdminInventory },
    { path: '/admin/slotting', component: SlottingConfig },
    { path: '/shipments', component: Shipments },
    { path: '/update', component: Update },
    { path: '/admin/users', component: AdminUsers },
    { path: '/admin/login', component: AdminLogin },
    { path: '/counts/edit/:id', component: EditCount },
    { path: '/packing_list/print/:id', component: PackingListPrint },
    { path: '/inbound/audit', component: InboundAudit },
];

const MenuItem = ({ to, label, desc, categoryId, onClick }) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

    const itemData = {
        href: to,
        text: label.toUpperCase(),
        desc: desc || `Módulo de ${label}`,
        categoryId: categoryId || 'recepcion'
    };

    const handleDragStart = (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(itemData));
        e.dataTransfer.effectAllowed = 'copyMove';
    };

    const handleQuickPin = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('logix_dashboard_pin_item', { detail: itemData }));
    };

    return (
        <div className="group/item flex items-center justify-between pr-2 transition-all hover:bg-[#f0f0f0]">
            <Link
                to={to}
                draggable
                onDragStart={handleDragStart}
                className={`flex-grow flex cursor-default items-center border-l-[4px] px-4 py-1 leading-tight transition-all
                ${isActive ? 'border-[#0078d4] bg-[#eaeaea] font-semibold text-[#0078d4]' : 'border-transparent text-[#323130] hover:border-[#0078d4]/40'}`}
                onClick={onClick}
                title="Arrastra esta opción al Dashboard para fijarla"
            >
                <span className="text-[12px] uppercase select-none">{label}</span>
            </Link>

            <button
                type="button"
                onClick={handleQuickPin}
                className="inline-flex h-[22px] w-[22px] min-w-[22px] cursor-pointer items-center justify-center rounded text-[#8a8886] opacity-0 transition-all hover:bg-[#eaeaea] hover:text-[#0078d4] group-hover/item:opacity-100 !p-0"
                style={{ width: '22px', height: '22px', minWidth: '22px', padding: 0 }}
                title="Fijar en Dashboard"
                aria-label="Fijar en Dashboard"
            >
                <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px', minWidth: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
            </button>
        </div>
    );
};

const MAX_TABS = 10;

const resolveComponent = (path) => {
    for (const route of ROUTE_MAP) {
        const match = matchPath(route.path, path);
        if (match) {
            return { Component: route.component, params: match.params };
        }
    }
    return null;
};

const TabContentWrapper = React.memo(({ tab, isActive, onTitleChange }) => {
    const [initialized, setInitialized] = useState(isActive);
    const lastRefreshKey = useRef(tab.refreshKey || 0);
    const resolved = useMemo(() => resolveComponent(tab.path), [tab.path]);

    // Activar inicialización si la pestaña se vuelve activa y no lo estaba
    useEffect(() => {
        if (isActive && !initialized) {
            setInitialized(true);
        }
    }, [isActive, initialized]);

    // Manejar el refresco forzado solo si el refreshKey aumenta (evita disparos en el mount si ya era > 0)
    useEffect(() => {
        if (tab.refreshKey > lastRefreshKey.current) {
            setInitialized(false);
            // El useEffect de arriba se encargará de volver a ponerlo en true si isActive es true
            lastRefreshKey.current = tab.refreshKey;
        }
    }, [tab.refreshKey]);

    const tabSetTitle = useCallback((newTitle) => {
        onTitleChange(tab.id, newTitle);
    }, [tab.id, onTitleChange]);

    const contextValue = useMemo(() => ({ setTitle: tabSetTitle }), [tabSetTitle]);

    // Retorno anticipado DESPUÉS de que todos los hooks han sido declarados
    if (!resolved) {
        return <div className="p-4 text-white">Módulo no encontrado: {tab.path}</div>;
    }

    const { Component } = resolved;

    return (
        <div
            className={`tab-content-container ${isActive ? 'block' : 'hidden'}`}
            style={{ height: '100%', width: '100%' }}
        >
            <TabProvider value={contextValue}>
                {/* Solo renderizar el componente si ha sido inicializado (Lazy Load) */}
                {initialized ? (
                    <Component setTitle={tabSetTitle} {...resolved.params} />
                ) : (
                    <div className="flex items-center justify-center h-full font-segoe-ui text-normal uppercase tracking-tight bg-[#fafafa]">
                        <span>Cargando módulo...</span>
                    </div>
                )}
            </TabProvider>
        </div>
    );
});

const Layout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [title, setTitle] = useState('Inicio');
    const { isOnline, pendingCount, syncPendingData } = useOffline();

    const [tabs, setTabs] = useState(() => {
        const saved = localStorage.getItem('logix_tabs');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Error parsing tabs from localStorage", e);
            }
        }
        return [{ id: 'dashboard-' + Date.now(), path: '/dashboard', label: 'Inicio' }];
    });

    const [draggedTabIndex, setDraggedTabIndex] = useState(null);
    const [dragOverTabIndex, setDragOverTabIndex] = useState(null);

    const [activeTabId, setActiveTabId] = useState(() => {
        const savedActive = localStorage.getItem('logix_active_tab');
        // Validar que el ID guardado realmente exista en la lista de pestañas cargada
        if (savedActive && tabs.some(t => t.id === savedActive)) {
            return savedActive;
        }
        return tabs.length > 0 ? tabs[0].id : null;
    });

    useEffect(() => {
        localStorage.setItem('logix_tabs', JSON.stringify(tabs));
    }, [tabs]);

    useEffect(() => {
        if (activeTabId) {
            localStorage.setItem('logix_active_tab', activeTabId);
        }
    }, [activeTabId]);

    useEffect(() => {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab) {
            setTitle(activeTab.label);
        }
    }, [activeTabId, tabs]);

    const activeTabIdRef = useRef(activeTabId);
    useEffect(() => {
        activeTabIdRef.current = activeTabId;
    }, [activeTabId]);

    const updateTabLabel = useCallback((tabId, newLabel) => {
        setTabs(prev => {
            const existingTab = prev.find(tab => tab.id === tabId);
            if (existingTab && existingTab.label === newLabel) {
                return prev;
            }
            return prev.map(tab =>
                tab.id === tabId ? { ...tab, label: newLabel } : tab
            );
        });
        if (tabId === activeTabIdRef.current) {
            setTitle(prevTitle => prevTitle !== newLabel ? newLabel : prevTitle);
        }
    }, []);

    const lastActiveTabId = useRef(activeTabId);
    const targetTabIdRef = useRef(null);

    useEffect(() => {
        // Si estamos cambiando de pestaña, esperar a que activeTabId se sincronice
        // con la pestaña de destino (targetTabIdRef) para evitar sobrescribir el path
        // de la pestaña inactiva en renders intermedios desalineados.
        if (targetTabIdRef.current !== null) {
            const targetTab = tabs.find(t => t.id === targetTabIdRef.current);
            if (activeTabId !== targetTabIdRef.current || (targetTab && location.pathname !== targetTab.path)) {
                return;
            }
            targetTabIdRef.current = null; // Sincronización completada, limpiar
        }

        if (lastActiveTabId.current !== activeTabId) {
            lastActiveTabId.current = activeTabId;
            return;
        }
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.path !== location.pathname) {
            setTabs(prev => prev.map(tab =>
                tab.id === activeTabId ? { ...tab, path: location.pathname } : tab
            ));
        }
    }, [location.pathname, activeTabId, tabs]);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    const addTab = () => {
        if (tabs.length >= MAX_TABS) {
            alert(`Límite de ${MAX_TABS} pestañas alcanzado.`);
            return;
        }
        const newId = 'tab-' + Date.now();
        const newTab = { id: newId, path: '/dashboard', label: 'Inicio' };
        setTabs([...tabs, newTab]);
        targetTabIdRef.current = newId;
        setActiveTabId(newId);
        navigate('/dashboard');
    };

    const closeTab = (e, id) => {
        e.stopPropagation();
        if (tabs.length === 1) {
            const newId = 'tab-' + Date.now();
            setTabs([{ id: newId, path: '/dashboard', label: 'Inicio' }]);
            targetTabIdRef.current = newId;
            setActiveTabId(newId);
            navigate('/dashboard');
            return;
        }
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
            const lastTab = newTabs[newTabs.length - 1];
            targetTabIdRef.current = lastTab.id;
            setActiveTabId(lastTab.id);
            navigate(lastTab.path);
        }
    };

    const switchTab = (id) => {
        const tab = tabs.find(t => t.id === id);
        if (tab) {
            targetTabIdRef.current = id;
            setActiveTabId(id);
            navigate(tab.path);
        }
    };

    const refreshTab = (e, id) => {
        e.stopPropagation();
        setTabs(prev => prev.map(tab =>
            tab.id === id ? { ...tab, refreshKey: (tab.refreshKey || 0) + 1 } : tab
        ));
    };

    const handleDragStart = (e, index) => {
        setDraggedTabIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverTabIndex !== index) {
            setDragOverTabIndex(index);
        }
    };

    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        if (draggedTabIndex !== null && draggedTabIndex !== targetIndex) {
            setTabs(prev => {
                const newTabs = [...prev];
                const [movedTab] = newTabs.splice(draggedTabIndex, 1);
                newTabs.splice(targetIndex, 0, movedTab);
                return newTabs;
            });
        }
        setDraggedTabIndex(null);
        setDragOverTabIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedTabIndex(null);
        setDragOverTabIndex(null);
    };

    useEffect(() => {
        document.title = title;
        checkAndSyncIfNeeded();
    }, [title]);

    const userJson = localStorage.getItem('user');
    let hasAdminPerm = false;
    if (userJson) {
        try {
            const u = JSON.parse(userJson);
            const perms = u.permissions ? u.permissions.split(',').map(p => p.trim()) : [];
            if (u.username === 'admin' || perms.includes('admin')) {
                hasAdminPerm = true;
            }
        } catch (e) { console.warn('No se pudo leer el usuario local:', e); }
    }

    return (
        <div className="flex min-h-screen flex-col bg-[#f3f3f3] font-sans text-[#201f1e] print:block print:h-auto print:overflow-visible">
            {/* Header / Shell Bar */}
            <header className="top-header sticky top-0 z-50 flex h-[48px] items-center gap-4 border-b border-[#e1dfdd] bg-white px-4 text-[#201f1e] shadow-none print:hidden no-print">
                <button
                    className="z-[1001] cursor-pointer rounded p-2 text-[#605e5c] transition-all hover:bg-[#f3f3f3] hover:text-[#201f1e]"
                    onClick={toggleMenu}
                    aria-label="Menú"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>

                <div className="tabs-wrapper flex-grow mr-4 min-w-0">
                    <div className="tabs-scroll-container overflow-x-auto no-scrollbar scroll-smooth">
                        {tabs.map((tab, index) => {
                            let dropPositionClass = '';
                            if (dragOverTabIndex === index && draggedTabIndex !== null && draggedTabIndex !== index) {
                                dropPositionClass = index < draggedTabIndex ? 'drag-over-left' : 'drag-over-right';
                            }
                            const isDragging = draggedTabIndex === index;

                            return (
                                <div
                                    key={tab.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => switchTab(tab.id)}
                                    className={`tab-item ${activeTabId === tab.id ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${dropPositionClass}`}
                                >
                                    <span className="tab-label">{tab.label}</span>
                                    <div className="tab-actions">
                                        <button
                                            onClick={(e) => refreshTab(e, tab.id)}
                                            className={`tab-refresh-btn ${activeTabId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                            title="Refrescar datos"
                                            aria-label="Refrescar datos"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                            </svg>
                                        </button>
                                        {tabs.length > 1 && (
                                            <button onClick={(e) => closeTab(e, tab.id)} className="tab-close-btn" title="Cerrar pestaña" aria-label="Cerrar pestaña">
                                                <span>&#215;</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button onClick={addTab} className="add-tab-btn" title="Nueva pestaña" aria-label="Nueva pestaña">+</button>
                </div>

                <div className="header-actions flex items-center gap-3">
                    {pendingCount > 0 && (
                        <div className="hidden cursor-pointer items-center gap-1.5 rounded border border-[#f7c948] bg-[#fff4ce] px-2 py-1 text-[10px] font-medium text-[#323130] sm:flex" onClick={syncPendingData}>
                            {pendingCount} PENDIENTES
                        </div>
                    )}
                    <div className={`flex items-center gap-1.5 rounded-full border border-solid px-3 py-1 text-[9px] font-medium uppercase tracking-tight transition-all ${!isOnline ? 'border-[#d13438] bg-[#fde7e9] text-[#a4262c]' : 'border-[#107c41] bg-[#dff6dd] text-[#107c41]'}`}>
                        {!isOnline ? 'OFFLINE' : 'ONLINE'}
                    </div>
                    <Link to="/admin/login" className="rounded border border-[#d2d0ce] px-3 py-1 text-[11px] font-medium uppercase tracking-tight text-[#605e5c] opacity-0 transition-all duration-200 hover:bg-[#f3f3f3] hover:text-[#201f1e] hover:opacity-100">Admin</Link>
                </div>
            </header>

            {/* Sidebar Menu Sincronizado a 48px */}
            <div
                className={`fixed left-0 z-[999] w-64 overflow-y-auto border-r border-[#e1dfdd] bg-[#f9f9f9] shadow-xl transition-transform duration-300 ease-in-out print:hidden no-print ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
                style={{ top: '48px', height: 'calc(100vh - 48px)' }}
            >
                <nav className="py-2">
                    <div className="px-4 mb-2">
                        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#605e5c]">Principal</div>
                        <MenuItem to="/dashboard" label="Inicio" desc="Panel principal y accesos rápidos" categoryId="recepcion" onClick={toggleMenu} />
                        <MenuItem to="/stock" label="Consultar Stock" desc="Búsqueda global de inventario y saldos" categoryId="recepcion" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-2">
                        <div className="mb-1 border-t border-[#e1dfdd] px-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#605e5c]">Operaciones Inbound</div>
                        <MenuItem to="/inbound" label="Recepción" desc="Entrada de mercancía y referencias" categoryId="recepcion" onClick={toggleMenu} />
                        <MenuItem to="/reconciliation" label="Conciliación" desc="Cruce de documentos y discrepancias" categoryId="recepcion" onClick={toggleMenu} />
                        <MenuItem to="/inbound/audit" label="Auditoría Agente" desc="Control de calidad y recepción física" categoryId="recepcion" onClick={toggleMenu} />
                        <MenuItem to="/view_logs" label="Registros" desc="Consulta de registros históricos" categoryId="recepcion" onClick={toggleMenu} />
                        <MenuItem to="/ir-reconciliation" label="Dashboard IR" desc="Estado general de Import References" categoryId="recepcion" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-2">
                        <div className="mb-1 border-t border-[#e1dfdd] px-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#605e5c]">Operaciones Outbound</div>
                        <MenuItem to="/picking" label="Picking" desc="Verificación de pedidos y empaque" categoryId="despacho" onClick={toggleMenu} />
                        <MenuItem to="/view_picking_audits" label="Empaque" desc="Listas de empaque y auditorías" categoryId="despacho" onClick={toggleMenu} />
                        <MenuItem to="/shipments" label="Despacho" desc="Gestión de despachos y embarques" categoryId="despacho" onClick={toggleMenu} />
                        <MenuItem to="/label" label="Etiquetado" desc="Impresión de etiquetas operativas" categoryId="despacho" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-2">
                        <div className="mb-1 border-t border-[#e1dfdd] px-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#605e5c]">Control Inventario</div>
                        <MenuItem to="/planner" label="Plan Cíclico" desc="Programación de conteos cíclicos" categoryId="inventario" onClick={toggleMenu} />
                        <MenuItem to="/inventory-dashboard" label="Métricas" desc="Indicadores de exactitud" categoryId="inventario" onClick={toggleMenu} />
                        <MenuItem to="/view_counts/recordings" label="Históricos" desc="Grabaciones y trazabilidad" categoryId="inventario" onClick={toggleMenu} />
                        <MenuItem to="/planner/manage_differences" label="Diferencias" desc="Gestión de ajustes y discrepancias" categoryId="inventario" onClick={toggleMenu} />
                        <MenuItem to="/counts" label="Inventario W2W" desc="Conteo masivo wall-to-wall" categoryId="inventario" onClick={toggleMenu} />
                        {hasAdminPerm && <MenuItem to="/counts/manage" label="Edición Conteos" desc="Gestión de registros de conteo" categoryId="inventario" onClick={toggleMenu} />}
                        {hasAdminPerm && <MenuItem to="/view_counts" label="Conteo General" desc="Consolidado de conteos" categoryId="inventario" onClick={toggleMenu} />}
                        <MenuItem to="/express-audit" label="Ciclo Manual" desc="Conteo ciego y auditoría rápida" categoryId="inventario" onClick={toggleMenu} />  
                        <MenuItem to="/spot-check" label="Spot Check" desc="Auditorías rápidas en piso" categoryId="inventario" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-2">
                        <div className="mb-1 border-t border-[#e1dfdd] px-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#605e5c]">Sistema</div>
                        <MenuItem to="/admin/inventory" label="Adm. Inventario" desc="Control de ciclos de conteo" categoryId="admin" onClick={toggleMenu} />
                        <MenuItem to="/admin/slotting" label="Config. Slotting" desc="Parámetros de ubicaciones" categoryId="admin" onClick={toggleMenu} />
                        <MenuItem to="/occupancy" label="Ocupación Bodega" desc="Análisis de espacio y ubicaciones" categoryId="admin" onClick={toggleMenu} />
                        <MenuItem to="/update" label="Carga de Datos" desc="Actualización masiva vía ficheros" categoryId="admin" onClick={toggleMenu} />
                        <button
                            className="mt-2 flex w-full cursor-pointer items-center justify-start !justify-start border-l-[4px] border-transparent px-4 py-1 text-left text-[12px] font-semibold uppercase tracking-tight text-[#a4262c] transition-all hover:bg-[#fde7e9]"
                            style={{ justifyContent: 'flex-start' }}
                            onClick={async () => {
                                try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); }
                                finally { window.location.href = '/login'; }
                            }}
                        >
                            Cerrar Sesión
                        </button>
                    </div>
                </nav>
            </div>

            {/* Overlay Sincronizado a 48px */}
            <div
                className={`fixed inset-0 z-[998] bg-black/20 backdrop-blur-sm transition-opacity print:hidden no-print ${isMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}
                style={{ top: '48px' }}
                onClick={toggleMenu}
            ></div>

            {/* Main Content */}
            <main className="main-content flex-grow overflow-y-auto overflow-x-hidden bg-[#f3f3f3] print:h-auto print:overflow-visible">
                <div className="w-full h-full">
                    {tabs.map(tab => (
                        <TabContentWrapper
                            key={tab.id}
                            tab={tab}
                            isActive={activeTabId === tab.id}
                            onTitleChange={updateTabLabel}
                        />
                    ))}
                </div>
            </main>
        </div>
    );
};

export default Layout;
