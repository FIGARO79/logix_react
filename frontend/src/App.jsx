import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

// Lazy load de páginas principales
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Reconciliation = lazy(() => import('./pages/Reconciliation'));
const StockSearch = lazy(() => import('./pages/StockSearch'));
const PickingAuditHistory = lazy(() => import('./pages/PickingAuditHistory'));
const Inbound = lazy(() => import('./pages/Inbound'));
const CycleCounts = lazy(() => import('./pages/CycleCounts'));
const LabelPrinting = lazy(() => import('./pages/LabelPrinting'));
const Planner = lazy(() => import('./pages/Planner'));
const PlannerExecution = lazy(() => import('./pages/PlannerExecution'));
const PickingAudit = lazy(() => import('./pages/PickingAudit'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminInventory = lazy(() => import('./pages/AdminInventory'));
const ManageCounts = lazy(() => import('./pages/ManageCounts'));
const ViewCounts = lazy(() => import('./pages/ViewCounts'));
const EditCount = lazy(() => import('./pages/EditCount'));
const InboundHistory = lazy(() => import('./pages/InboundHistory'));
const Update = lazy(() => import('./pages/Update'));
const Register = lazy(() => import('./pages/Register'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const PackingListPrint = lazy(() => import('./pages/PackingListPrint'));
const CycleCountHistory = lazy(() => import('./pages/CycleCountHistory'));
const ManageCountDifferences = lazy(() => import('./pages/ManageCountDifferences'));
const ManageCycleCountDifferences = lazy(() => import('./pages/ManageCycleCountDifferences'));
const ErrorPage = lazy(() => import('./pages/Error'));

// Componente de carga
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

// Mock Protected Route (Actual implementation should check token/session)
const ProtectedRoute = ({ children }) => {
    const isAuthenticated = true; // Replace with actual auth logic (context or prop)
    return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<LoadingFallback />}>
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
                        <Route path="/inbound" element={<Inbound />} />
                        <Route path="/label" element={<LabelPrinting />} />
                        <Route path="/stock" element={<StockSearch />} />
                        <Route path="/update" element={<Update />} />
                        <Route path="/reconciliation" element={<Reconciliation />} />
                        <Route path="/view_picking_audits" element={<PickingAuditHistory />} />
                        <Route path="/counts" element={<CycleCounts />} />
                        <Route path="/counts/manage" element={<ManageCounts />} />
                        <Route path="/view_counts" element={<ViewCounts />} />
                        <Route path="/counts/manage_differences" element={<ManageCountDifferences />} />
                        <Route path="/counts/edit/:id" element={<EditCount />} />
                        <Route path="/view_counts/recordings" element={<CycleCountHistory />} />
                        <Route path="/planner" element={<Planner />} />
                        <Route path="/planner/execution" element={<PlannerExecution />} />
                        <Route path="/planner/manage_differences" element={<ManageCycleCountDifferences />} />
                        <Route path="/picking" element={<PickingAudit />} />
                        <Route path="/view_logs" element={<InboundHistory />} />


                        {/* Admin Routes */}
                        <Route path="/admin/login" element={<AdminLogin />} />
                        <Route path="/admin/users" element={<AdminUsers />} />
                        <Route path="/admin/inventory" element={<AdminInventory />} />
                    </Route>

                    {/* Standalone Protected Routes (No Layout) */}
                    <Route path="/packing_list/print/:id" element={
                        <ProtectedRoute>
                            <PackingListPrint />
                        </ProtectedRoute>
                    } />

                    {/* Catch-all for 404 */}
                    <Route path="*" element={<ErrorPage />} />
                </Routes>
            </Suspense>
        </Router>
    );
}

export default App;
