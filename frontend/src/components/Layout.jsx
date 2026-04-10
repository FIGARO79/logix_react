import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import AdminInventory from '../pages/AdminInventory';
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
    { path: '/counts/edit/:id', component: EditCount },
];

// Check if user is on specific path for active styling
const MenuItem = ({ to, icon, label, onClick }) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

    return (
        <Link
            to={to}
            className={`flex items-center px-4 py-1 text-white transition-colors border-l-[4px] 
            ${isActive ? 'bg-white/10 border-[var(--sap-primary)]' : 'hover:bg-white/10 border-transparent hover:border-[var(--sap-primary)]'}`}
            onClick={onClick}
        >
            <div className="w-8 flex justify-center opacity-80">
                {icon}
            </div>
            <span className="text-sm font-medium tracking-wide ml-2">{label}</span>
        </Link>
    );
};

// Icons as components for reusable clean code
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
const TagIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>;
const DocumentIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>;
const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>;
const CartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>;
const ChecklistIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>;
const CalculatorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" /></svg>;
const CheckSquareIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12" /></svg>;
const ArrowRepeatIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>;
const CubeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
const MapIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" /></svg>;
const QueueIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>;
const BoxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>;
const GearIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1115 0 7.5 7.5 0 01-15 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const TruckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>;
const WrenchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4.867 19.125h.008v.008h-.008v-.008Z" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;

const MAX_TABS = 5;


const Layout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [title, setTitle] = useState('Inicio');
    const { isOnline, pendingCount, syncPendingData } = useOffline();

    // Gestión de pestañas
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

    // Sincronizar con localStorage
    useEffect(() => {
        localStorage.setItem('logix_tabs', JSON.stringify(tabs));
    }, [tabs]);

    useEffect(() => {
        if (activeTabId) {
            localStorage.setItem('logix_active_tab', activeTabId);
        }
    }, [activeTabId]);

    // Actualizar etiqueta de pestaña activa cuando el título cambia
    useEffect(() => {
        if (activeTabId) {
            setTabs(prev => prev.map(tab => 
                tab.id === activeTabId ? { ...tab, label: title } : tab
            ));
        }
    }, [title, activeTabId]);

    // Asegurar que la ruta coincide con la pestaña activa
    useEffect(() => {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.path !== location.pathname) {
            // No navegamos automáticamente aquí para evitar bucles, 
            // pero actualizamos el path de la pestaña si el usuario navegó por otros medios
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
        if (tabs.length === 1) return; // No cerrar la última pestaña

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

    // Resolver componente para una ruta
    const resolveComponent = (path) => {
        for (const route of ROUTE_MAP) {
            const match = matchPath(route.path, path);
            if (match) {
                return { Component: route.component, params: match.params };
            }
        }
        return null;
    };

    // Componente de contenido de pestaña que simula el contexto de Outlet
    const TabContentWrapper = useMemo(() => {
        return ({ tab, isActive }) => {
            const resolved = resolveComponent(tab.path);
            if (!resolved) return <div className="p-4">Módulo no encontrado: {tab.path}</div>;
            
            const { Component } = resolved;
            
            // Renderizamos independientemente de isActive para mantener el estado, 
            // pero lo ocultamos con CSS si no es la activa.
            return (
                <div 
                    className={`tab-content-container ${isActive ? 'block' : 'hidden'}`}
                    style={{ height: '100%', width: '100%' }}
                >
                    {/* 
                        IMPORTANTE: Envolvemos en TabProvider para sustituir useOutletContext()
                        y mantener la compatibilidad con el sistema de pestañas Keep-Alive.
                    */}
                    <TabProvider value={{ setTitle }}>
                        <Component setTitle={setTitle} />
                    </TabProvider>
                </div>
            );
        };
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-[var(--sap-bg)] text-[var(--sap-text)] font-sans print:block print:h-auto print:overflow-visible">
            {/* Rotate Overlay (Mobile) */}
            <div id="rotate-overlay" className="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 text-white p-4">
                <div className="max-w-sm text-center">
                    <h2 className="text-xl font-semibold">Gira el dispositivo</h2>
                </div>
            </div>

            {/* Top Header */}
            <header className="top-header bg-[var(--sap-shell-bg)] text-white h-[48px] px-4 flex items-center gap-4 shadow-md sticky top-0 z-50 print:hidden">
                <button
                    className="menu-toggle p-2 rounded hover:bg-white/10 active:bg-white/20 transition-all cursor-pointer z-[1001]"
                    onClick={toggleMenu}
                    aria-label="Abrir menú"
                    type="button"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>
                
                <div className="flex items-center gap-2 overflow-x-hidden flex-grow mr-4">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth">
                        {tabs.map(tab => (
                            <div 
                                key={tab.id}
                                onClick={() => switchTab(tab.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-md cursor-pointer transition-all min-w-[100px] max-w-[180px] border-b-2
                                    ${activeTabId === tab.id ? 'bg-white/10 border-[var(--sap-primary)] text-white' : 'bg-transparent border-transparent text-white/60 hover:bg-white/5 hover:text-white/80'}`}
                            >
                                <span className="text-xs font-medium truncate flex-grow text-center">{tab.label}</span>
                                {tabs.length > 1 && (
                                    <button 
                                        onClick={(e) => closeTab(e, tab.id)}
                                        className="p-0.5 rounded-full hover:bg-white/20 transition-colors"
                                    >
                                        <CloseIcon />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={addTab}
                        className="p-1 rounded-full hover:bg-white/10 active:bg-white/20 transition-all text-white/80 hover:text-white"
                        title="Añadir pestaña"
                    >
                        <PlusIcon />
                    </button>
                </div>

                <div className="header-actions flex items-center gap-3">
                    {pendingCount > 0 && (
                        <div 
                            className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded text-[10px] font-bold cursor-pointer hover:bg-amber-500/30 transition-all"
                            onClick={syncPendingData}
                            title="Sincronizar datos pendientes"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            {pendingCount}
                        </div>
                    )}
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase border border-solid transition-all ${!isOnline ? 'bg-red-500/20 text-red-200 border-red-500/30' : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'}`}>
                        <span className={`w-1 h-1 rounded-full ${!isOnline ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                        {!isOnline ? 'Offline' : 'Online'}
                    </div>
                    <Link to="/admin/login" className="text-sm font-medium px-3 py-1 hover:bg-white/15 rounded transition-all">Admin</Link>
                </div>
            </header>

            {/* Sidebar Menu (SAP Fiori Style) */}
            <div
                className={`dropdown-menu ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} fixed left-0 w-64 bg-[var(--sap-shell-bg)] shadow-xl z-[999] overflow-y-auto transform transition-transform duration-200 ease-in-out`}
                style={{ top: '48px', height: 'calc(100vh - 48px)' }}
            >
                <nav className="py-1">
                    {/* GENERAL */}
                    <MenuItem to="/dashboard" icon={<HomeIcon />} label="Inicio" onClick={toggleMenu} />
                    <MenuItem to="/stock" icon={<SearchIcon />} label="Consultar Stock" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* INBOUND (RECEPCIÓN) */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Recepción</div>
                    <MenuItem to="/inbound" icon={<DownloadIcon />} label="Inbound" onClick={toggleMenu} />
                    <MenuItem to="/reconciliation" icon={<CheckIcon />} label="Conciliación" onClick={toggleMenu} />
                    <MenuItem to="/view_logs" icon={<DocumentIcon />} label="Registros" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* OUTBOUND (DESPACHO) */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Despacho</div>
                    <MenuItem to="/picking" icon={<BoxIcon />} label="Verificación" onClick={toggleMenu} />
                    <MenuItem to="/view_picking_audits" icon={<TruckIcon />} label="Empaque" onClick={toggleMenu} />
                    <MenuItem to="/shipments" icon={<CubeIcon />} label="Consolidación" onClick={toggleMenu} />
                    <MenuItem to="/label" icon={<TagIcon />} label="Etiquetado" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* INVENTARIO (CONTEOS) */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Inventario</div>
                    <MenuItem to="/planner" icon={<QueueIcon />} label="Plan Cíclico" onClick={toggleMenu} />
                    <MenuItem to="/inventory-dashboard" icon={<ChartIcon />} label="Métricas Cíclicos" onClick={toggleMenu} />
                    <MenuItem to="/view_counts/recordings" icon={<CheckSquareIcon />} label="Reporte Cíclicos" onClick={toggleMenu} />
                    <MenuItem to="/planner/manage_differences" icon={<ChecklistIcon />} label="Diferencias Cíclicos" onClick={toggleMenu} />
                    <MenuItem to="/counts" icon={<ChecklistIcon />} label="Conteo W2W" onClick={toggleMenu} />
                    <MenuItem to="/view_counts" icon={<CalculatorIcon />} label="Conteo General" onClick={toggleMenu} />
                    <MenuItem to="/occupancy" icon={<MapIcon />} label="Mapa de Slotting" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* ADMINISTRACIÓN */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Administración</div>
                    <MenuItem to="/admin/inventory" icon={<GearIcon />} label="Admin Inventario" onClick={toggleMenu} />
                    <MenuItem to="/admin/slotting" icon={<WrenchIcon />} label="Config. Slotting" onClick={toggleMenu} />
                    <MenuItem to="/counts/manage" icon={<ChecklistIcon />} label="Gestionar Conteos" onClick={toggleMenu} />
                    <MenuItem to="/update" icon={<ArrowRepeatIcon />} label="Actualizar Ficheros" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    <Link
                        to="#"
                        className="flex items-center px-4 py-1 text-white hover:bg-white/10 border-l-[4px] border-transparent hover:border-[var(--sap-error)] transition-colors"
                        onClick={async (e) => {
                            e.preventDefault();
                            try {
                                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                            } catch (err) {
                                console.error('Logout failed', err);
                            } finally {
                                window.location.href = '/login';
                            }
                        }}
                    >
                        <div className="w-8 flex justify-center opacity-80">
                            <LogoutIcon />
                        </div>
                        <span className="text-sm font-medium tracking-wide ml-2">Cerrar Sesión</span>
                    </Link>
                </nav>
            </div>

            {/* Overlay */}
            <div
                className={`menu-overlay fixed top-[48px] left-0 w-full h-[calc(100vh-48px)] bg-black/40 transition-opacity z-[998] print:hidden ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                onClick={toggleMenu}
            ></div>

            {/* Main Content con Keep-Alive */}
            <main className="main-content flex-grow overflow-y-auto overflow-x-hidden print:overflow-visible print:h-auto">
                <div className="w-full px-4 py-6 sm:px-6 lg:px-8 h-full">
                    {tabs.map(tab => (
                        <TabContentWrapper 
                            key={tab.id} 
                            tab={tab} 
                            isActive={activeTabId === tab.id} 
                        />
                    ))}
                    {/* Fallback para rutas que no están en pestañas (ej. login, etc) */}
                    {tabs.length === 0 && <Outlet context={{ setTitle }} />}
                </div>
            </main>
        </div>
    );
};

export default Layout;
