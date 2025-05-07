// src/components/Signup/Signup.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Signup.css';

const Signup = ({ setIsAuthenticated }) => {
  const [formData, setFormData] = useState({
    deviceID: '',
    userName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: ''
  });
  
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.deviceID || !formData.userName || !formData.email || !formData.password) {
      setError('Please fill out all required fields');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // Submit form
    console.log('Form submitted:', formData);

    setIsAuthenticated(true);

    navigate('/dashboard');
  };
  
  return (
    <div className="signup-container">
      <div className="signup-card">
        <div className="signup-header">
          <h2>Create an Account</h2>
          <p>Set up your profile to start monitoring your energy usage</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-row">
                <div className="form-group">
                <label htmlFor="deviceID">Device ID *</label>
                <input
                    type="text"
                    id="deviceID"
                    name="deviceID"
                    value={formData.deviceID}
                    onChange={handleChange}
                    required
                />
                </div>
            </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">Username *</label>
              <input
                type="text"
                id="userName"
                name="userName"
                value={formData.userName}
                onChange={handleChange}
                required
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>
          
          {/* <div className="form-group">
            <label htmlFor="address">Address</label>
            <input
              type="text"
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
            />
          </div> */}
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          </div>
          
          <button type="submit" className="signup-button">
            Create Account
          </button>
        </form>
        
        <div className="login-section">
          <p>Already have an account?</p>
          <Link to="/login" className="login-link">Log In</Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;