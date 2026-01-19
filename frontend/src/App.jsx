import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Reconciliation from './pages/Reconciliation';
import InventoryStock from './pages/InventoryStock';
import PickingAuditHistory from './pages/PickingAuditHistory';
import Inbound from './pages/Inbound';
import CycleCounts from './pages/CycleCounts';
import LabelPrinting from './pages/LabelPrinting';
import Planner from './pages/Planner';
import PlannerExecution from './pages/PlannerExecution';
import PickingAudit from './pages/PickingAudit';

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

                {/* Protected Routes wrapped in Layout */}
                <Route path="/" element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }>
                    <Route index element={<Dashboard />} />
                    <Route path="inbound" element={<Inbound />} />
                    <Route path="label" element={<LabelPrinting />} />
                    <Route path="stock" element={<InventoryStock />} />
                    <Route path="reconciliation" element={<Reconciliation />} />
                    <Route path="view_picking_audits" element={<PickingAuditHistory />} />
                    <Route path="counts" element={<CycleCounts />} />
                    <Route path="planner" element={<Planner />} />
                    <Route path="planner/execution" element={<PlannerExecution />} />
                    <Route path="picking" element={<PickingAudit />} />
                    {/* Maps to "Auditoria Picking" but usually user clicks card to go there. 
                        If the card href is /picking, create that page. 
                        If the card href is /view_picking_audits, it matches above.
                    */}
                    <Route path="picking" element={<div>Picking Scan Page (To be implemented)</div>} />
                </Route>
            </Routes>
        </Router>
    );
}

export default App;
