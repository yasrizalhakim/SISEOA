// src/components/Login/Login.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { firestore } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import './Login.css';

const Login = ({ setIsAuthenticated }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      setError('Please enter both email and password');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Get user document from Firestore
      const userDoc = await getDoc(doc(firestore, 'USER', formData.email));
      
      if (!userDoc.exists()) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }
      
      const userData = userDoc.data();
      
      // Simple password check (in production, use proper authentication)
      if (userData.Password !== formData.password) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }
      
      // Store user information in localStorage
      localStorage.setItem('userEmail', formData.email);
      localStorage.setItem('userName', userData.Name || '');
      
      setIsAuthenticated(true);
      navigate('/dashboard');
      
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Welcome Back</h2>
          <p>Sign in to your energy monitoring account</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Enter your email"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Enter your password"
            />
          </div>
          
          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
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