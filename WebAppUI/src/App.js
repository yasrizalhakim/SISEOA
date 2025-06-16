// src/App.js - Updated with UserDetail Route
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login/Login';
import Signup from './components/Signup/Signup';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './components/Dashboard/Dashboard';
import Buildings from './components/Buildings/Buildings';
import AddBuilding from './components/Buildings/AddBuildings';
import BuildingDetail from './components/Buildings/BuildingDetail';
import Devices from './components/Devices/Devices';
import AddDevice from './components/Devices/AddDevice';
import DeviceDetail from './components/Devices/DeviceDetail';
import Users from './components/Users/Users';
import UserDetail from './components/Users/UserDetail';
import Profile from './components/Profile/Profile';
import Notification from './components/Notifications/Notification';
import Reports from './components/Reports/Reports';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    setIsAuthenticated(false);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Public Routes */}
          <Route 
            path="/login" 
            element={
              !isAuthenticated ? 
                <Login setIsAuthenticated={setIsAuthenticated} /> : 
                <Navigate to="/dashboard" replace />
            } 
          />
          <Route 
            path="/signup" 
            element={
              !isAuthenticated ? 
                <Signup setIsAuthenticated={setIsAuthenticated} /> : 
                <Navigate to="/dashboard" replace />
            } 
          />

          {/* Protected Routes */}
          <Route 
            path="/" 
            element={
              isAuthenticated ? 
                <MainLayout handleLogout={handleLogout} /> : 
                <Navigate to="/login" replace />
            }
          >
            {/* Dashboard */}
            <Route path="dashboard" element={<Dashboard />} />
            
            {/* Buildings - Edit functionality merged into BuildingDetail */}
            <Route path="buildings" element={<Buildings />} />
            <Route path="buildings/add" element={<AddBuilding />} />
            <Route path="buildings/detail/:buildingId" element={<BuildingDetail />} />
            
            {/* Devices - Admin Registration merged into AddDevice */}
            <Route path="devices" element={<Devices />} />
            <Route path="devices/add" element={<AddDevice />} />
            <Route path="devices/detail/:deviceId" element={<DeviceDetail />} />
            
            {/* Users - Added UserDetail route */}
            <Route path="users" element={<Users />} />
            <Route path="users/detail/:userId" element={<UserDetail />} />
            
            {/* Profile */}
            <Route path="profile" element={<Profile />} />
            
            {/* Placeholder routes for other features
            <Route path="automation" element={<div>Automation - Coming Soon</div>} /> */}
            <Route path="reports" element={<Reports />} />
            <Route path="notifications" element={<Notification />} />
            
            {/* Default redirect */}
            <Route index element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;