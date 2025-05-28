// src/components/Profile/Profile.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { firestore } from '../../services/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { MdSave, MdAccountCircle, MdLock } from 'react-icons/md';
import './Profile.css';

const Profile = () => {
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    contactNo: '',
    role: '',
    password: '',
    confirmPassword: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();
  
  // Get user details from localStorage
  const userEmail = localStorage.getItem('userEmail');
  const userRole = localStorage.getItem('userRole');
  
  // Fetch user data from Firestore
  useEffect(() => {
    const fetchUserData = async () => {
      if (!userEmail) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(firestore, 'USER', userEmail));
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData({
            name: data.Name || '',
            email: userEmail,
            contactNo: data.ContactNo || '',
            role: userRole || 'user',
            password: '',
            confirmPassword: ''
          });
        } else {
          setError('User data not found');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to load user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, [userEmail, userRole]);
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Save user profile
  const handleSave = async () => {
    if (!userData.name) {
      setError('Name is required');
      return;
    }
    
    // Check if changing password
    if (userData.password || userData.confirmPassword) {
      if (userData.password !== userData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      
      if (userData.password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
    }
    
    try {
      setSaving(true);
      setError(null);
      
      // Build update data
      const updateData = {
        Name: userData.name,
        ContactNo: userData.contactNo || ''
      };
      
      // Add password if it's being updated
      if (userData.password) {
        updateData.Password = userData.password;
      }
      
      // Update user in Firestore USER collection
      await updateDoc(doc(firestore, 'USER', userEmail), updateData);
      
      // Update localStorage
      localStorage.setItem('userName', userData.name);
      
      // Reset password fields
      setUserData(prev => ({
        ...prev,
        password: '',
        confirmPassword: ''
      }));
      
      setSuccess('Profile updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return <div className="profile-loading">Loading profile data...</div>;
  }
  
  return (
    <div className="profile-container">
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-avatar">
            <MdAccountCircle className="avatar-icon" />
          </div>
          {/* <h2>User Profile</h2> */}
        </div>
        
        {error && <div className="profile-error">{error}</div>}
        {success && <div className="profile-success">{success}</div>}
        
        <div className="profile-form">
          <div className="form-group">
            <label>Name *</label>
            <input 
              type="text" 
              name="name" 
              value={userData.name} 
              onChange={handleChange}
              placeholder="Enter your name"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              value={userData.email}
              disabled
              className="disabled-input"
            />
            <small>Email cannot be changed</small>
          </div>
          
          <div className="form-group">
            <label>Contact Number</label>
            <input 
              type="tel" 
              name="contactNo" 
              value={userData.contactNo} 
              onChange={handleChange}
              placeholder="Enter your contact number"
            />
          </div>
          
          {/* <div className="form-group">
            <label>Role</label>
            <input 
              type="text" 
              value={userData.role}
              disabled
              className="disabled-input"
            />
            <small>Role is assigned by system administrators</small>
          </div> */}
          
          <div className="password-section">
            <h3><MdLock /> Update Password</h3>
            <div className="form-group">
              <label>New Password</label>
              <input 
                type="password" 
                name="password" 
                value={userData.password} 
                onChange={handleChange}
                placeholder="Enter new password"
              />
              <small>Leave blank to keep your current password</small>
            </div>
            
            <div className="form-group">
              <label>Confirm New Password</label>
              <input 
                type="password" 
                name="confirmPassword" 
                value={userData.confirmPassword} 
                onChange={handleChange}
                placeholder="Confirm new password"
              />
            </div>
          </div>
          
          <button 
            className="save-button"
            onClick={handleSave}
            disabled={saving}
          >
            <MdSave /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;