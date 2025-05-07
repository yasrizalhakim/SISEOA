// src/components/Login/Login.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';

const Login = ({ setIsAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Dummy data for demonstration
  const validUsers = [
    { email: 'parent@example.com', deviceId: '' },
    { email: '', deviceId: 'DEVICE123' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate that at least one field is filled
    if (!email && !deviceId) {
      setError('Please enter either your email or device ID');
      return;
    }
    
    // Check if the entered credentials match any dummy data
    const isValid = validUsers.some(user => 
      (email && user.email === email) || (deviceId && user.deviceId === deviceId)
    );
    
    if (isValid) {
      // Set authentication state using the prop function
      setIsAuthenticated(true);
      // Successful login - redirect to dashboard
      navigate('/dashboard');
    } else {
      setError('Invalid email or device ID');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Energy Management System</h2>
          <p>Login to monitor and control your devices</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Parent Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
            />
          </div>
          
          <div className="login-divider">
            <span>OR</span>
          </div>
          
          <div className="form-group">
            <label htmlFor="deviceId">Device ID</label>
            <input
              type="text"
              id="deviceId"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="Enter device ID"
            />
          </div>
          
          <button type="submit" className="login-button">
            Enter
          </button>
        </form>
        
        <div className="signup-section">
          <p>Don't have an account?</p>
          <Link to="/signup" className="signup-link">Sign Up</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;