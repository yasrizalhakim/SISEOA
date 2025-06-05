// src/components/Signup/Signup.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { firestore } from '../../services/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import './Signup.css';
import { 
  notifyNewUserRequest, 
  notifyDeviceClaimed 
} from '../../services/notificationService';

const Signup = ({ setIsAuthenticated }) => {
  const [activeTab, setActiveTab] = useState('parent'); // 'parent' or 'children'
  const [formData, setFormData] = useState({
    userName: '',
    email: '',
    password: '',
    confirmPassword: '',
    contactNo: '',
    deviceId: '', // For parent registration
    parentEmail: '', // For children registration
    buildingName: '' // For parent registration
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState({
    checking: false,
    exists: false,
    available: false,
    message: ''
  });
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Check device availability when device ID changes
    if (name === 'deviceId' && value.trim()) {
      checkDeviceAvailability(value.trim());
    } else if (name === 'deviceId' && !value.trim()) {
      setDeviceStatus({
        checking: false,
        exists: false,
        available: false,
        message: ''
      });
    }
  };
  
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
    setDeviceStatus({
      checking: false,
      exists: false,
      available: false,
      message: ''
    });
    // Reset form data when switching tabs
    setFormData({
      userName: formData.userName,
      email: formData.email,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      contactNo: formData.contactNo,
      deviceId: '',
      parentEmail: '',
      buildingName: ''
    });
  };
  
  // Check if device exists and is available for claiming
  const checkDeviceAvailability = async (deviceId) => {
    setDeviceStatus(prev => ({ ...prev, checking: true, message: 'Checking device...' }));
    
    try {
      // Check if device exists in Firestore
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
      
      if (!deviceDoc.exists()) {
        setDeviceStatus({
          checking: false,
          exists: false,
          available: false,
          message: 'Device Unavailable'
        });
        return;
      }
      
      const deviceData = deviceDoc.data();
      
      // Check if device already has an owner
      if (deviceData.Owner) {
        setDeviceStatus({
          checking: false,
          exists: true,
          available: false,
          message: `Device Unavailable`
        });
        return;
      }
      
      // Check if device is already assigned to a location with a parent
      if (deviceData.Location) {
        const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
        
        if (locationDoc.exists()) {
          const locationData = locationDoc.data();
          const buildingId = locationData.Building;
          
          // Check if this building has any parent users
          const parentQuery = query(
            collection(firestore, 'USERBUILDING'),
            where('Building', '==', buildingId),
            where('Role', '==', 'parent')
          );
          
          const parentSnapshot = await getDocs(parentQuery);
          
          if (!parentSnapshot.empty) {
            setDeviceStatus({
              checking: false,
              exists: true,
              available: false,
              message: 'Device Unavailable'
            });
            return;
          }
        }
      }
      
      // Device exists and is available
      setDeviceStatus({
        checking: false,
        exists: true,
        available: true,
        message: 'Device available for claiming!'
      });
      
    } catch (error) {
      console.error('Error checking device availability:', error);
      setDeviceStatus({
        checking: false,
        exists: false,
        available: false,
        message: 'Error checking device. Please try again.'
      });
    }
  };
  
  const validateForm = () => {
    if (!formData.userName || !formData.email || !formData.password) {
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
    
    if (activeTab === 'parent') {
      if (!formData.deviceId) {
        setError('Device ID is required for parent registration');
        return false;
      }
      if (!deviceStatus.exists || !deviceStatus.available) {
        setError('Please enter a valid and available device ID');
        return false;
      }
      if (!formData.buildingName) {
        setError('Building name is required for parent registration');
        return false;
      }
    } else {
      if (!formData.parentEmail) {
        setError('Parent email is required for children registration');
        return false;
      }
      if (!formData.parentEmail.includes('@')) {
        setError('Please enter a valid parent email address');
        return false;
      }
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
      if (activeTab === 'parent') {
        await registerParent();
      } else {
        await registerChildren();
      }
    } catch (error) {
      console.error('Signup error:', error);
      setError(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };
  
  const registerParent = async () => {
    console.log('Registering parent with device ID:', formData.deviceId);
    
    // Check if email already exists
    const existingUser = await getDoc(doc(firestore, 'USER', formData.email));
    if (existingUser.exists()) {
      throw new Error('This email is already registered');
    }
    
    // Final check of device availability
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', formData.deviceId));
    if (!deviceDoc.exists()) {
      throw new Error('Device Unavailable.');
    }
    
    const deviceData = deviceDoc.data();
    
    // Ensure device is still available
    if (deviceData.Owner) {
      throw new Error('Device Unavailable.');
    }
    
    // Generate unique building ID
    const buildingId = `Building_${formData.userName.replace(/\s+/g, '_')}_${Date.now()}`;
    
    // Create timestamp
    const timestamp = serverTimestamp();
    const now = new Date();
    const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    
    console.log('Creating parent account with building:', buildingId);
    
    // 1. Create user in USER collection
    await setDoc(doc(firestore, 'USER', formData.email), {
      Name: formData.userName,
      Email: formData.email,
      Password: formData.password, // In production, use proper password hashing
      ContactNo: formData.contactNo || '',
      CreatedAt: timestamp
    });
    
    // 2. Create building in BUILDING collection
    await setDoc(doc(firestore, 'BUILDING', buildingId), {
      BuildingName: formData.buildingName,
      Address: '',
      Description: `Building created by ${formData.userName}`,
      CreatedAt: timestamp,
      DateCreated: dateCreated,
      CreatedBy: formData.email
    });
    
    // 3. Create USERBUILDING record to associate user with building as parent
    const userBuildingId = `${formData.email.replace(/\./g, '_')}_${buildingId}`;
    await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
      User: formData.email,
      Building: buildingId,
      Role: 'parent',
      CreatedAt: timestamp
    });
    
    // 4. Create a default location in the building
    const locationId = `${buildingId}_Room1`;
    await setDoc(doc(firestore, 'LOCATION', locationId), {
      Building: buildingId,
      LocationName: 'Room 1',
      DateCreated: dateCreated
    });
    
    // 5. ASSIGN DEVICE OWNERSHIP AND LOCATION
    await updateDoc(doc(firestore, 'DEVICE', formData.deviceId), {
      Owner: formData.email, // SET THE USER AS OWNER
      Location: locationId,   // ASSIGN TO DEFAULT LOCATION
      LastModified: timestamp,
      LastModifiedBy: formData.email,
      ClaimedAt: timestamp,    // Track when device was claimed
      AvailableForClaiming: false // No longer available for claiming
    });
    
    console.log('✅ Device ownership assigned to:', formData.email);
    
    // Set authentication state
    localStorage.setItem('userEmail', formData.email);
    localStorage.setItem('userName', formData.userName);
    
    setSuccess('Parent account created successfully! You now own the device and can manage your building.');
    setIsAuthenticated(true);
    
    setTimeout(() => {
      navigate('/dashboard');
    }, 1500);

    // **NEW: Create notification for parent about device claiming and building creation**
    try {
      await notifyDeviceClaimed(
        formData.email,
        deviceData.DeviceName || formData.deviceId,
        formData.buildingName
      );
      console.log('📢 Parent notification sent for device claiming');
    } catch (notificationError) {
      console.error('❌ Failed to send notification:', notificationError);
      // Don't fail the registration if notification fails
    }
  };
  
  const registerChildren = async () => {
    console.log('Registering children with parent email:', formData.parentEmail);
    
    // Check if email already exists
    const existingUser = await getDoc(doc(firestore, 'USER', formData.email));
    if (existingUser.exists()) {
      throw new Error('This email is already registered');
    }
    
    // Verify parent email exists
    const parentDoc = await getDoc(doc(firestore, 'USER', formData.parentEmail));
    if (!parentDoc.exists()) {
      throw new Error('Parent email not found. Please check the email and try again.');
    }
    
    // Get parent's buildings
    const parentBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', formData.parentEmail),
      where('Role', '==', 'parent')
    );
    
    const parentBuildingsSnapshot = await getDocs(parentBuildingsQuery);
    
    if (parentBuildingsSnapshot.empty) {
      throw new Error('Parent does not have any buildings. Parent must have at least one building to add children.');
    }
    
    const timestamp = serverTimestamp();
    
    // 1. Create user in USER collection
    await setDoc(doc(firestore, 'USER', formData.email), {
      Name: formData.userName,
      Email: formData.email,
      Password: formData.password, // In production, use proper password hashing
      ContactNo: formData.contactNo || '',
      ParentEmail: formData.parentEmail,
      CreatedAt: timestamp
    });
    
    // 2. Add child to all parent's buildings with 'children' role
    for (const buildingDoc of parentBuildingsSnapshot.docs) {
      const buildingData = buildingDoc.data();
      const userBuildingId = `${formData.email.replace(/\./g, '_')}_${buildingData.Building}`;
      
      await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
        User: formData.email,
        Building: buildingData.Building,
        Role: 'children',
        CreatedAt: timestamp
      });
    }
    
    // Set authentication state
    localStorage.setItem('userEmail', formData.email);
    localStorage.setItem('userName', formData.userName);
    
    setSuccess('Children account created successfully! You now have access to your parent\'s buildings.');
    setIsAuthenticated(true);
    
    setTimeout(() => {
      navigate('/dashboard');
    }, 1500);

    // **NEW: Create notification for parent about new user request**
    try {
      const parentData = parentDoc.data();
      await notifyNewUserRequest(
        formData.parentEmail,
        formData.userName,
        formData.email
      );
      console.log('📢 Parent notification sent for new user request');
    } catch (notificationError) {
      console.error('❌ Failed to send notification:', notificationError);
      // Don't fail the registration if notification fails
    }
  };
  
  return (
    <div className="signup-container">
      <div className="signup-card">
        <div className="signup-header">
          <h2>Create an Account</h2>
          <p>Choose your account type and set up your profile</p>
        </div>
        
        {/* Tab Selection */}
        <div className="tab-selection">
          <button 
            type="button"
            className={`tab-button ${activeTab === 'parent' ? 'active' : ''}`}
            onClick={() => handleTabChange('parent')}
            disabled={loading}
          >
            Parent Account
          </button>
          <button 
            type="button"
            className={`tab-button ${activeTab === 'children' ? 'active' : ''}`}
            onClick={() => handleTabChange('children')}
            disabled={loading}
          >
            Children Account
          </button>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        
        <form onSubmit={handleSubmit}>
          {/* Common Fields */}
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
            <label htmlFor="contactNo">Contact Number</label>
            <input
              type="tel"
              id="contactNo"
              name="contactNo"
              value={formData.contactNo}
              onChange={handleChange}
              disabled={loading}
              placeholder="Enter your contact number (optional)"
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
          
          {/* Parent-specific fields */}
          {activeTab === 'parent' && (
            <>
              <div className="account-type-info">
                <h4>Parent Account Setup</h4>
                <p>As a parent, you'll claim ownership of a device and create your first building. The device must be pre-registered by an administrator.</p>
              </div>
              
              <div className="form-group">
                <label htmlFor="deviceId">Device ID *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    id="deviceId"
                    name="deviceId"
                    value={formData.deviceId}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    placeholder="Enter device ID provided by admin"
                    style={{ 
                      paddingRight: '120px',
                      borderColor: deviceStatus.exists && deviceStatus.available ? '#22c55e' : 
                                  deviceStatus.exists && !deviceStatus.available ? '#ef4444' : '#e2e8f0'
                    }}
                  />
                  {deviceStatus.checking && (
                    <span style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      Checking...
                    </span>
                  )}
                  {!deviceStatus.checking && deviceStatus.message && (
                    <span style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '12px',
                      color: deviceStatus.available ? '#16a34a' : '#dc2626',
                      fontWeight: '500'
                    }}>
                      {deviceStatus.available ? '✓' : '✗'}
                    </span>
                  )}
                </div>
                {deviceStatus.message && (
                  <small style={{ 
                    color: deviceStatus.available ? '#16a34a' : '#dc2626',
                    fontWeight: '500'
                  }}>
                    {deviceStatus.message}
                  </small>
                )}
                <small>You will become the owner of this device upon successful registration</small>
              </div>
              
              <div className="form-group">
                <label htmlFor="buildingName">Building Name *</label>
                <input
                  type="text"
                  id="buildingName"
                  name="buildingName"
                  value={formData.buildingName}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  placeholder="Enter your building name"
                />
                <small>This will be your first building where the device will be located</small>
              </div>
            </>
          )}
          
          {/* Children-specific fields */}
          {activeTab === 'children' && (
            <>
              <div className="account-type-info">
                <h4>Children Account Setup</h4>
                <p>As a child user, you'll be connected to your parent's buildings and can access assigned devices.</p>
              </div>
              
              <div className="form-group">
                <label htmlFor="parentEmail">Parent Email *</label>
                <input
                  type="email"
                  id="parentEmail"
                  name="parentEmail"
                  value={formData.parentEmail}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  placeholder="Enter your parent's registered email"
                />
                <small>This must be an email of an existing parent account</small>
              </div>
            </>
          )}
          
          <button 
            type="submit" 
            className="signup-button"
            disabled={loading || (activeTab === 'parent' && (!deviceStatus.exists || !deviceStatus.available))}
          >
            {loading ? 'Creating Account...' : `Create ${activeTab === 'parent' ? 'Parent' : 'Children'} Account`}
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