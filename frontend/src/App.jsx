import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

// Importación estática de páginas para soporte offline total (Desktop & Mobile)
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Reconciliation from './pages/Reconciliation';
import StockSearch from './pages/StockSearch';
import PickingAuditHistory from './pages/PickingAuditHistory';
import Inbound from './pages/Inbound';
import CycleCounts from './pages/CycleCounts';
import LabelPrinting from './pages/LabelPrinting';
import Planner from './pages/Planner';
import PlannerExecution from './pages/PlannerExecution';
import PickingAudit from './pages/PickingAudit';
import AdminLogin from './pages/AdminLogin';
import AdminUsers from './pages/AdminUsers';
import AdminInventory from './pages/AdminInventory';
import SlottingConfig from './pages/SlottingConfig';
import ManageCounts from './pages/ManageCounts';
import ViewCounts from './pages/ViewCounts';
import EditCount from './pages/EditCount';
import InboundHistory from './pages/InboundHistory';
import Update from './pages/Update';
import Register from './pages/Register';
import SetPassword from './pages/SetPassword';
import PackingListPrint from './pages/PackingListPrint';
import CycleCountHistory from './pages/CycleCountHistory';
import DashboardInventario from './pages/DashboardInventario';
import OccupancyDashboard from './pages/OccupancyDashboard';
import ManageCountDifferences from './pages/ManageCountDifferences';
import ManageCycleCountDifferences from './pages/ManageCycleCountDifferences';
import Shipments from './pages/Shipments';
import ConsolidatedPackingList from './pages/ConsolidatedPackingList';
import ErrorPage from './pages/Error';

// Componente de carga (para procesos internos)
const LoadingFallback = () => (
    <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '1.2rem',
        color: '#0070f3'
    }}>
        Cargando...
    </div>
);

// Protected Route Component
const ProtectedRoute = ({ children, requiredPermission }) => {
    // Basic auth check
    const userJson = localStorage.getItem('user');
    const isAuthenticated = !!userJson;

    if (!isAuthenticated) return <Navigate to="/login" replace />;

    // Permission check
    if (requiredPermission) {
        try {
            const user = JSON.parse(userJson);
            // If admin, allow everything
            if (user.username === 'admin') return children;

            const perms = user.permissions ? user.permissions.split(',') : [];
            const hasPermission = Array.isArray(requiredPermission)
                ? requiredPermission.some(p => perms.includes(p))
                : perms.includes(requiredPermission);

            if (!hasPermission) {
                // Determine where to redirect if unauthorized
                return <Navigate to="/dashboard" replace />; // Or an Unauthorized page
            }
        } catch (e) {
            console.error("Error parsing user data", e);
            return <Navigate to="/login" replace />;
        }
    }

    return children;
};

// Admin Protected Route Component
const AdminProtectedRoute = ({ children }) => {
    const [isVerified, setIsVerified] = React.useState(null);

    React.useEffect(() => {
        fetch('/api/admin/verify', { credentials: 'include' })
            .then(res => {
                if (res.ok) setIsVerified(true);
                else setIsVerified(false);
            })
            .catch(() => setIsVerified(false));
    }, []);

    if (isVerified === null) return <LoadingFallback />;
    if (isVerified === false) return <Navigate to="/admin/login" replace />;
    return children;
};

import { getDB } from './utils/offlineDb';
import { syncPendingInbound } from './utils/syncManager';
import ReloadPrompt from './components/ReloadPrompt';

// Componente de indicador de sincronización
const SyncStatus = () => {
    const [pendingCount, setPendingCount] = React.useState(0);
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState(navigator.onLine);

    const updateCount = React.useCallback(async () => {
        try {
            const db = await getDB();
            const pending = await db.getAll('pending_sync');
            setPendingCount(pending.length);
        } catch (e) { console.error(e); }
    }, []);

    const runSync = React.useCallback(async () => {
        if (!navigator.onLine || isSyncing) return;
        setIsSyncing(true);
        await syncPendingInbound();
        await updateCount();
        setIsSyncing(false);
    }, [isSyncing, updateCount]);

    React.useEffect(() => {
        updateCount();
        const interval = setInterval(updateCount, 5000);
        
        const handleOnline = () => {
            setIsOnline(true);
            runSync();
            // Recargar la página automáticamente para asegurar datos frescos
            setTimeout(() => {
                window.location.reload();
            }, 500);
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            clearInterval(interval);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [runSync, updateCount]);

    if (pendingCount === 0 && isOnline) return null;

    return (
        <div 
            style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: 9999,
                padding: '8px 16px',
                borderRadius: '12px',
                backgroundColor: isOnline ? 'rgba(40, 95, 148, 0.95)' : 'rgba(153, 27, 27, 0.95)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem',
                fontWeight: '500',
                letterSpacing: '0.025em',
                cursor: isOnline && pendingCount > 0 ? 'pointer' : 'default',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }} 
            onClick={() => isOnline && pendingCount > 0 && runSync()}
        >
            {!isOnline && (
                <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.828-2.828.002-.002M9.172 9.172L3 3m5.657 5.657l-2.828-2.828m2.828 2.828A4 4 0 1111 11.314L9.172 9.172z" />
                    </svg>
                    <span>OFFLINE</span>
                </>
            )}
            {isOnline && pendingCount > 0 && (
                <>
                    <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{isSyncing ? 'SINC...' : `${pendingCount} PENDIENTES`}</span>
                </>
            )}
        </div>
    );
};

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ReloadPrompt />
            <SyncStatus />
            <Routes>
                {/* Redirigir raíz a login */}
                    <Route path="/" element={<Navigate to="/login" replace />} />

                    {/* Rutas públicas */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/set_password" element={<SetPassword />} />

                    {/* Protected Routes wrapped in Layout */}
                    {/* Protected Routes wrapped in Layout */}
                    <Route element={
                        <ProtectedRoute>
                            <Layout />
                        </ProtectedRoute>
                    }>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/inbound" element={
                            <ProtectedRoute requiredPermission="inbound">
                                <Inbound />
                            </ProtectedRoute>
                        } />
                        <Route path="/label" element={<LabelPrinting />} />
                        <Route path="/stock" element={
                            <ProtectedRoute requiredPermission={['stock', 'inbound']}>
                                <StockSearch />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_picking_audits" element={
                            <ProtectedRoute requiredPermission="picking">
                                <PickingAuditHistory />
                            </ProtectedRoute>
                        } />

                        <Route path="/reconciliation" element={
                            <ProtectedRoute requiredPermission="inbound">
                                <Reconciliation />
                            </ProtectedRoute>
                        } />
                        <Route path="/update" element={
                            <ProtectedRoute>
                                <Update />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <CycleCounts />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts/manage" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <ManageCounts />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_counts" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <ViewCounts />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts/manage_differences" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <ManageCountDifferences />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts/edit/:id" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <EditCount />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_counts/recordings" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <CycleCountHistory />
                            </ProtectedRoute>
                        } />
                        <Route path="/inventory-dashboard" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <DashboardInventario />
                            </ProtectedRoute>
                        } />
                        <Route path="/occupancy" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <OccupancyDashboard />
                            </ProtectedRoute>
                        } />
                        <Route path="/planner" element={
                            <ProtectedRoute requiredPermission="planner">
                                <Planner />
                            </ProtectedRoute>
                        } />
                        <Route path="/planner/execution" element={
                            <ProtectedRoute requiredPermission="planner">
                                <PlannerExecution />
                            </ProtectedRoute>
                        } />
                        <Route path="/planner/manage_differences" element={
                            <ProtectedRoute requiredPermission="planner">
                                <ManageCycleCountDifferences />
                            </ProtectedRoute>
                        } />
                        <Route path="/picking" element={
                            <ProtectedRoute requiredPermission="picking">
                                <PickingAudit />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_logs" element={
                            <ProtectedRoute requiredPermission="inbound">
                                <InboundHistory />
                            </ProtectedRoute>
                        } />


                        {/* Admin Routes */}
                        <Route path="/admin/login" element={<AdminLogin />} />
                        <Route path="/admin/users" element={
                            <AdminProtectedRoute>
                                <AdminUsers />
                            </AdminProtectedRoute>
                        } />
                        <Route path="/admin/inventory" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <AdminInventory />
                            </ProtectedRoute>
                        } />
                        <Route path="/admin/slotting" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <SlottingConfig />
                            </ProtectedRoute>
                        } />
                        <Route path="/shipments" element={
                            <ProtectedRoute requiredPermission="picking">
                                <Shipments />
                            </ProtectedRoute>
                        } />
                    </Route>

                    {/* Standalone Protected Routes (No Layout) */}
                    <Route path="/packing_list/print/:id" element={
                        <ProtectedRoute>
                            <PackingListPrint />
                        </ProtectedRoute>
                    } />
                    <Route path="/shipments/print/:id" element={
                        <ProtectedRoute>
                            <ConsolidatedPackingList />
                        </ProtectedRoute>
                    } />

                    {/* Catch-all for 404 */}
                    <Route path="*" element={<ErrorPage />} />
                </Routes>
        </Router>
    );
}

export default App;
