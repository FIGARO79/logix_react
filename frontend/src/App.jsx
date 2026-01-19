import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Reconciliation from './pages/Reconciliation';

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
                    <Route path="inbound" element={<div>Inbound Page Check (To be implemented)</div>} />
                    <Route path="stock" element={<div>Stock Page Check (To be implemented)</div>} />
                    <Route path="reconciliation" element={<Reconciliation />} />
                    {/* Add other routes here: picking, counts, etc. */}
                </Route>
            </Routes>
        </Router>
    );
}

export default App;
