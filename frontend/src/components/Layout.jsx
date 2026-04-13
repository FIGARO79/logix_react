import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate, matchPath } from 'react-router-dom';
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
import DashboardInventario from '../pages/DashboardInventario';
import OccupancyDashboard from '../pages/OccupancyDashboard';
import ManageCountDifferences from '../pages/ManageCountDifferences';
import ManageCycleCountDifferences from '../pages/ManageCycleCountDifferences';
import Shipments from '../pages/Shipments';

// Mapeo de rutas a componentes
const ROUTE_MAP = [
    { path: '/dashboard', component: Dashboard },
    { path: '/inbound', component: Inbound },
    { path: '/reconciliation', component: Reconciliation },
    { path: '/stock', component: StockSearch },
    { path: '/view_picking_audits', component: PickingAuditHistory },
    { path: '/label', component: LabelPrinting },
    { path: '/planner', component: Planner },
    { path: '/planner/execution', component: PlannerExecution },
    { path: '/planner/manage_differences', component: ManageCycleCountDifferences },
    { path: '/picking', component: PickingAudit },
    { path: '/view_logs', component: InboundHistory },
    { path: '/counts', component: CycleCounts },
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
];

const MenuItem = ({ to, label, onClick }) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

    return (
        <Link
            to={to}
            className={`flex items-center px-4 py-1.5 text-white transition-all border-l-[4px] 
            ${isActive ? 'bg-white/10 border-blue-400 font-bold' : 'hover:bg-white/5 border-transparent hover:border-blue-400/40'}`}
            onClick={onClick}
        >
            <span className="text-[12px] uppercase tracking-wider">{label}</span>
        </Link>
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
    const resolved = resolveComponent(tab.path);
    if (!resolved) return <div className="p-4 text-white">Módulo no encontrado: {tab.path}</div>;

    const { Component } = resolved;

    const tabSetTitle = useCallback((newTitle) => {
        onTitleChange(tab.id, newTitle);
    }, [tab.id, onTitleChange]);

    const contextValue = useMemo(() => ({ setTitle: tabSetTitle }), [tabSetTitle]);

    return (
        <div
            className={`tab-content-container ${isActive ? 'block' : 'hidden'}`}
            style={{ height: '100%', width: '100%' }}
        >
            <TabProvider value={contextValue}>
                <Component setTitle={tabSetTitle} />
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

    const [activeTabId, setActiveTabId] = useState(() => {
        const savedActive = localStorage.getItem('logix_active_tab');
        return savedActive || (tabs.length > 0 ? tabs[0].id : null);
    });

    useEffect(() => {
        localStorage.setItem('logix_tabs', JSON.stringify(tabs));
    }, [tabs]);

    useEffect(() => {
        if (activeTabId) {
            localStorage.setItem('logix_active_tab', activeTabId);
        }
    }, [activeTabId]);

    const updateTabLabel = useCallback((tabId, newLabel) => {
        setTabs(prev => prev.map(tab =>
            tab.id === tabId ? { ...tab, label: newLabel } : tab
        ));
        if (tabId === activeTabId) setTitle(newLabel);
    }, [activeTabId]);

    const lastActiveTabId = useRef(activeTabId);

    useEffect(() => {
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
    }, [location.pathname, activeTabId]);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    const addTab = () => {
        if (tabs.length >= MAX_TABS) {
            alert(`Límite de ${MAX_TABS} pestañas alcanzado.`);
            return;
        }
        const newId = 'tab-' + Date.now();
        const newTab = { id: newId, path: '/dashboard', label: 'Inicio' };
        setTabs([...tabs, newTab]);
        setActiveTabId(newId);
        navigate('/dashboard');
    };

    const closeTab = (e, id) => {
        e.stopPropagation();
        if (tabs.length === 1) {
            setTabs([{ id: 'tab-' + Date.now(), path: '/dashboard', label: 'Inicio' }]);
            setActiveTabId(tabs[0].id);
            navigate('/dashboard');
            return;
        }
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
            const lastTab = newTabs[newTabs.length - 1];
            setActiveTabId(lastTab.id);
            navigate(lastTab.path);
        }
    };

    const switchTab = (id) => {
        const tab = tabs.find(t => t.id === id);
        if (tab) {
            setActiveTabId(id);
            navigate(tab.path);
        }
    };

    useEffect(() => {
        document.title = title;
        checkAndSyncIfNeeded();
    }, [title]);

    return (
        <div className="flex flex-col min-h-screen bg-[var(--sap-bg)] text-[var(--sap-text)] font-sans print:block print:h-auto print:overflow-visible">
            {/* Header Sincronizado a 48px */}
            <header className="top-header bg-[var(--sap-shell-bg)] text-white h-[48px] px-4 flex items-center gap-4 shadow-lg sticky top-0 z-50 print:hidden border-none">
                <button
                    className="p-2 rounded hover:bg-white/10 transition-all cursor-pointer z-[1001]"
                    onClick={toggleMenu}
                    aria-label="Menú"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>

                <div className="tabs-wrapper flex-grow mr-4 min-w-0">
                    <div className="tabs-scroll-container overflow-x-auto no-scrollbar scroll-smooth">
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                onClick={() => switchTab(tab.id)}
                                className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
                            >
                                <span className="tab-label">{tab.label}</span>
                                {tabs.length > 1 && (
                                    <button onClick={(e) => closeTab(e, tab.id)} className="tab-close-btn">
                                        <span>&#215;</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <button onClick={addTab} className="add-tab-btn">+</button>
                </div>

                <div className="header-actions flex items-center gap-3">
                    {pendingCount > 0 && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded text-[10px] font-bold cursor-pointer" onClick={syncPendingData}>
                            {pendingCount} PENDIENTES
                        </div>
                    )}
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase border border-solid transition-all ${!isOnline ? 'bg-red-500/20 text-red-200 border-red-500/30' : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'}`}>
                        {!isOnline ? 'OFFLINE' : 'ONLINE'}
                    </div>
                    <Link to="/admin/login" className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 border border-white/20 rounded hover:bg-white/10 transition-all">Admin</Link>
                </div>
            </header>

            {/* Sidebar Menu Sincronizado a 48px */}
            <div
                className={`fixed left-0 w-64 bg-[var(--sap-shell-bg)] shadow-2xl z-[999] overflow-y-auto transform transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
                style={{ top: '48px', height: 'calc(100vh - 48px)' }}
            >
                <nav className="py-4">
                    <div className="px-4 mb-4">
                        <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">Principal</div>
                        <MenuItem to="/dashboard" label="Inicio" onClick={toggleMenu} />
                        <MenuItem to="/stock" label="Consultar Stock" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-4">
                        <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 border-t border-white/5 pt-4">Operaciones Inbound</div>
                        <MenuItem to="/inbound" label="Recepción" onClick={toggleMenu} />
                        <MenuItem to="/reconciliation" label="Conciliación" onClick={toggleMenu} />
                        <MenuItem to="/view_logs" label="Registros" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-4">
                        <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 border-t border-white/5 pt-4">Operaciones Outbound</div>
                        <MenuItem to="/picking" label="Auditoría" onClick={toggleMenu} />
                        <MenuItem to="/view_picking_audits" label="Empaque" onClick={toggleMenu} />
                        <MenuItem to="/shipments" label="Despacho" onClick={toggleMenu} />
                        <MenuItem to="/label" label="Etiquetado" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-4">
                        <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 border-t border-white/5 pt-4">Control Inventario</div>
                        <MenuItem to="/planner" label="Plan Cíclico" onClick={toggleMenu} />
                        <MenuItem to="/inventory-dashboard" label="Métricas" onClick={toggleMenu} />
                        <MenuItem to="/view_counts/recordings" label="Históricos" onClick={toggleMenu} />
                        <MenuItem to="/planner/manage_differences" label="Diferencias" onClick={toggleMenu} />
                        <MenuItem to="/counts" label="Conteo W2W" onClick={toggleMenu} />
                        <MenuItem to="/view_counts" label="Conteo General" onClick={toggleMenu} />
                        <MenuItem to="/occupancy" label="Slotting" onClick={toggleMenu} />
                    </div>
                    <div className="px-4 mb-8">
                        <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 border-t border-white/5 pt-4">Sistema</div>
                        <MenuItem to="/admin/inventory" label="Adm. Inventario" onClick={toggleMenu} />
                        <MenuItem to="/admin/slotting" label="Config. Slotting" onClick={toggleMenu} />
                        <MenuItem to="/update" label="Carga de Datos" onClick={toggleMenu} />
                        <button
                            className="w-full flex items-center px-4 py-1.5 mt-4 text-red-400 hover:bg-red-500/10 transition-all border-l-[4px] border-transparent uppercase text-[11px] font-bold tracking-widest text-left"
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
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[998] ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                style={{ top: '48px' }}
                onClick={toggleMenu}
            ></div>

            {/* Main Content */}
            <main className="main-content flex-grow overflow-y-auto overflow-x-hidden print:overflow-visible print:h-auto bg-[#fafafa]">
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
