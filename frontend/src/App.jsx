import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
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
import ManageCounts from './pages/ManageCounts';
import EditCount from './pages/EditCount';
import InboundHistory from './pages/InboundHistory';
import Update from './pages/Update';
import Register from './pages/Register';
import SetPassword from './pages/SetPassword';
import PackingListPrint from './pages/PackingListPrint';
import CycleCountHistory from './pages/CycleCountHistory';
import ManageCountDifferences from './pages/ManageCountDifferences';
import ManageCycleCountDifferences from './pages/ManageCycleCountDifferences';
import ErrorPage from './pages/Error';

// Mock Protected Route (Actual implementation should check token/session)
const ProtectedRoute = ({ children }) => {
    const isAuthenticated = true; // Replace with actual auth logic (context or prop)
    return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/set_password" element={<SetPassword />} />

                {/* Protected Routes wrapped in Layout */}
                <Route path="/" element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }>
                    <Route index element={<Dashboard />} />
                    <Route path="inbound" element={<Inbound />} />
                    <Route path="label" element={<LabelPrinting />} />
                    <Route path="stock" element={<StockSearch />} />
                    <Route path="update" element={<Update />} />
                    <Route path="reconciliation" element={<Reconciliation />} />
                    <Route path="view_picking_audits" element={<PickingAuditHistory />} />
                    <Route path="counts" element={<CycleCounts />} />
                    <Route path="counts/manage" element={<ManageCounts />} />
                    <Route path="counts/manage_differences" element={<ManageCountDifferences />} />
                    <Route path="counts/edit/:id" element={<EditCount />} />
                    <Route path="counts/history" element={<CycleCountHistory />} />
                    <Route path="planner" element={<Planner />} />
                    <Route path="planner/execution" element={<PlannerExecution />} />
                    <Route path="planner/manage_differences" element={<ManageCycleCountDifferences />} />
                    <Route path="picking" element={<PickingAudit />} />
                    <Route path="view_logs" element={<InboundHistory />} />
                    <Route path="packing_list/print/:id" element={<PackingListPrint />} />

                    {/* Admin Routes */}
                    <Route path="admin/login" element={<AdminLogin />} />
                    <Route path="admin/users" element={<AdminUsers />} />
                    <Route path="admin/inventory" element={<AdminInventory />} />
                    {/* Maps to "Auditoria Picking" but usually user clicks card to go there. 
                        If the card href is /picking, create that page. 
                        If the card href is /view_picking_audits, it matches above.
                    */}
                </Route>

                {/* Catch-all for 404 */}
                <Route path="*" element={<ErrorPage />} />
            </Routes>
        </Router>
    );
}

export default App;
