// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './components/Dashboard/Dashboard';
import Login from './components/Login/Login';
import Signup from './components/Signup/Signup';
import './App.css';
import Devices from './components/Devices/Devices';

function App() {
  // Use state to track authentication instead of localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Protected route component that checks authentication
  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated) {
      // Redirect to login if not authenticated
      return <Navigate to="/login" />;
    }
    return children;
  };

  return (
    <Router>
      <div className="app-container">
        <Routes>
          {/* Default route redirects to login */}
          <Route path="/" element={<Navigate to="/login" />} />
          
          {/* Authentication routes with auth state passed down */}
          <Route 
            path="/login" 
            element={<Login setIsAuthenticated={setIsAuthenticated} />} 
          />
          <Route 
            path="/signup" 
            element={<Signup setIsAuthenticated={setIsAuthenticated} />} 
          />
          
          {/* All protected routes inside MainLayout */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <MainLayout setIsAuthenticated={setIsAuthenticated} />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="devices" element={<Devices />} />
            <Route path="automation" element={<p>Automation page (to be implemented)</p>} />
            <Route path="users" element={<p>Users page (to be implemented)</p>} />
            <Route path="reports" element={<p>Reports page (to be implemented)</p>} />
            <Route path="notifications" element={<p>Notifications page (to be implemented)</p>} />
            {/* <Route path="settings" element={<p>Settings page (to be implemented)</p>} /> */}
          </Route>
          
          {/* Catch any other routes and redirect to login */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;