// src/components/Signup/Signup.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { firestore } from '../../services/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import './Signup.css';

const Signup = ({ setIsAuthenticated }) => {
  const [formData, setFormData] = useState({
    userName: '',
    email: '',
    password: '',
    confirmPassword: '',
    contactNo: ''
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  const validateForm = () => {
    if (!formData.userName || !formData.email || !formData.password || !formData.confirmPassword || !formData.contactNo) {
      setError('Please fill out all required fields');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    
    if (!formData.email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    
    return true;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      await registerUser();
    } catch (error) {
    
      setError(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };
  
  const registerUser = async () => {
  
    
    // Check if email already exists
    const existingUser = await getDoc(doc(firestore, 'USER', formData.email));
    if (existingUser.exists()) {
      throw new Error('This email is already registered');
    }
    
    // Create timestamp
    const timestamp = serverTimestamp();
    
  
    
    // Create user in USER collection
    await setDoc(doc(firestore, 'USER', formData.email), {
      Name: formData.userName,
      Email: formData.email,
      Password: formData.password, // In production, use proper password hashing
      ContactNo: formData.contactNo,
      CreatedAt: timestamp
    });
    
    // Set authentication state
    localStorage.setItem('userEmail', formData.email);
    localStorage.setItem('userName', formData.userName);
    
    setSuccess('Account created successfully! Redirecting to dashboard...');
    setIsAuthenticated(true);
    
    setTimeout(() => {
      navigate('/dashboard');
    }, 1500);
  };
  
  return (
    <div className="signup-container">
      <div className="signup-card">
        <div className="signup-header">
          <h2>Create an Account</h2>
          <p>Set up your profile to get started</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="userName">Name *</label>
            <input
              type="text"
              id="userName"
              name="userName"
              value={formData.userName}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Enter your name"
            />
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
              disabled={loading}
              placeholder="Enter your email"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="contactNo">Contact Number *</label>
            <input
              type="tel"
              id="contactNo"
              name="contactNo"
              value={formData.contactNo}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Enter your contact number"
            />
          </div>
          
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
                disabled={loading}
                placeholder="Enter password (min 6 characters)"
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
                disabled={loading}
                placeholder="Confirm your password"
              />
            </div>
          </div>
          
          <button 
            type="submit" 
            className="signup-button"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
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