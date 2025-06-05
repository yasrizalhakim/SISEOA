// src/components/Login/Login.js - Fixed
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { firestore } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { loginUser } from '../../services/authService'; // Import loginUser function
import { checkUserPendingApproval } from '../../services/notificationService';
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
    
    // Use formData properties instead of undefined variables
    const { email, password } = formData;
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Check if user is pending approval first
      const isPending = await checkUserPendingApproval(email);
      if (isPending) {
        setError('Your account is pending approval. Please wait for parent approval.');
        setLoading(false);
        return;
      }

      const user = await loginUser(email, password);
      
      // Store user data
      localStorage.setItem('userEmail', user.email);
      localStorage.setItem('userName', user.name);
      localStorage.setItem('userRole', user.role);
      
      setIsAuthenticated(true);
      navigate('/dashboard');
      
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message || 'Login failed');
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