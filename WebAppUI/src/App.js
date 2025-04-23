// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './components/Dashboard/Dashboard';
// Import other pages as needed
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          {/* Add more routes for other pages */}
          <Route path="devices" element={<p>Devices page (to be implemented)</p>} />
          <Route path="automation" element={<p>Automation page (to be implemented)</p>} />
          <Route path="users" element={<p>Users page (to be implemented)</p>} />
          <Route path="reports" element={<p>Reports page (to be implemented)</p>} />
          <Route path="notifications" element={<p>Notifications page (to be implemented)</p>} />
          <Route path="settings" element={<p>Settings page (to be implemented)</p>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;