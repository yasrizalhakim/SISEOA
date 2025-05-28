// src/components/Devices/AddDevice.js - Simplified Device Management without Owner
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdArrowBack, MdAdd, MdDevices, MdLocationOn, MdPerson, MdWarning, MdDelete } from 'react-icons/md';
import { firestore, database } from '../../services/firebase';
import { 
  doc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  getDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc 
} from 'firebase/firestore';
import { ref, set, update, remove } from 'firebase/database';
import { 
  isSystemAdmin, 
  getUserBuildingRoles 
} from '../../utils/helpers';
import './AddDevice.css';

const AddDevice = () => {
  const navigate = useNavigate();
  
  // Main form mode: 'claim' for claiming devices, 'register' for admin creating new devices
  const [mode, setMode] = useState('claim'); // 'claim' or 'register'
  
  const [formData, setFormData] = useState({
    deviceId: '',
    deviceName: '',
    deviceDescription: '',
    deviceType: '',
    location: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState({
    checking: false,
    exists: false,
    available: false,
    message: ''
  });
  
  // Admin registration state
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [showRegisteredDevices, setShowRegisteredDevices] = useState(false);
  
  // User data and permissions
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [userBuildings, setUserBuildings] = useState([]);
  const [userLocations, setUserLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  
  const userEmail = localStorage.getItem('userEmail') || '';
  
  // Initialize data
  useEffect(() => {
    const initializeData = async () => {
      try {
        setLoadingLocations(true);
        
        // Check if user is SystemAdmin
        const isAdmin = await isSystemAdmin(userEmail);
        setIsUserSystemAdmin(isAdmin);
        
        console.log('🔍 Initializing add device for user:', userEmail, { isSystemAdmin: isAdmin });
        
        await fetchUserBuildingsAndLocations(isAdmin);
        
        // If admin, also fetch registered devices
        if (isAdmin) {
          await fetchRegisteredDevices();
        }
        
      } catch (error) {
        console.error('Error initializing add device:', error);
        setError('Failed to load user data');
      } finally {
        setLoadingLocations(false);
      }
    };
    
    if (userEmail) {
      initializeData();
    } else {
      setError('User not authenticated');
      navigate('/login');
    }
  }, [userEmail]);

  // Fetch user's accessible buildings and locations
  const fetchUserBuildingsAndLocations = async (isAdmin) => {
    try {
      let buildings = [];
      let locations = [];
      
      if (isAdmin) {
        // SystemAdmin can access all buildings and locations
        console.log('🔧 SystemAdmin - fetching all buildings and locations');
        
        const buildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
        buildings = buildingsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          buildingName: doc.data().BuildingName || doc.id
        }));
        
        const locationsSnapshot = await getDocs(collection(firestore, 'LOCATION'));
        locations = locationsSnapshot.docs.map(doc => {
          const locationData = doc.data();
          const building = buildings.find(b => b.id === locationData.Building);
          return {
            id: doc.id,
            ...locationData,
            locationName: locationData.LocationName || doc.id,
            buildingId: locationData.Building,
            buildingName: building ? building.buildingName : 'Unknown Building'
          };
        });
        
      } else {
        // Regular users can only access their buildings where they are parents
        console.log('👤 Regular user - fetching accessible buildings and locations');
        
        const buildingRoles = await getUserBuildingRoles(userEmail);
        
        for (const [buildingId, role] of buildingRoles) {
          if (buildingId === 'SystemAdmin') continue;
          
          // Only users with parent role can claim devices
          if (role === 'parent') {
            try {
              // Get building details
              const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
              if (buildingDoc.exists()) {
                const buildingData = buildingDoc.data();
                buildings.push({
                  id: buildingId,
                  ...buildingData,
                  userRole: role,
                  buildingName: buildingData.BuildingName || buildingId
                });
              }
              
              // Get locations in this building
              const locationsQuery = query(
                collection(firestore, 'LOCATION'),
                where('Building', '==', buildingId)
              );
              const locationsSnapshot = await getDocs(locationsQuery);
              const buildingLocations = locationsSnapshot.docs.map(doc => {
                const locationData = doc.data();
                return {
                  id: doc.id,
                  ...locationData,
                  locationName: locationData.LocationName || doc.id,
                  buildingId: locationData.Building,
                  buildingName: buildingDoc.exists() ? 
                    (buildingDoc.data().BuildingName || buildingId) : buildingId
                };
              });
              
              locations.push(...buildingLocations);
              
            } catch (buildingError) {
              console.error(`Error fetching building ${buildingId}:`, buildingError);
            }
          }
        }
      }
      
      // Sort buildings and locations alphabetically
      buildings.sort((a, b) => (a.buildingName || a.id).localeCompare(b.buildingName || b.id));
      locations.sort((a, b) => (a.locationName || a.id).localeCompare(b.locationName || b.id));
      
      setUserBuildings(buildings);
      setUserLocations(locations);
      
      console.log('🏢 Available buildings:', buildings.length);
      console.log('📍 Available locations:', locations.length);
      
      // Check if user has any accessible locations
      if (locations.length === 0) {
        setError(
          isAdmin 
            ? 'No locations available in the system. Create buildings and locations first.'
            : 'You do not have access to any buildings with locations. Contact an administrator or create a building first.'
        );
      }
      
    } catch (error) {
      console.error('Error fetching buildings and locations:', error);
      setError('Failed to load buildings and locations');
    }
  };

  // Fetch registered devices for admin
  const fetchRegisteredDevices = async () => {
    try {
      const devicesSnapshot = await getDocs(collection(firestore, 'DEVICE'));
      const devicesList = [];
      
      for (const deviceDoc of devicesSnapshot.docs) {
        const deviceData = deviceDoc.data();
        const device = {
          id: deviceDoc.id,
          ...deviceData,
          status: deviceData.Location ? 'claimed' : 'available'
        };
        
        devicesList.push(device);
      }
      
      // Sort devices: available first, then claimed
      devicesList.sort((a, b) => {
        if (a.status === 'available' && b.status !== 'available') return -1;
        if (a.status !== 'available' && b.status === 'available') return 1;
        return a.id.localeCompare(b.id);
      });
      
      setRegisteredDevices(devicesList);
    } catch (error) {
      console.error('Error fetching registered devices:', error);
    }
  };

  // Handle form input changes
  const handleChange = async (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Check device status when device ID changes (only in claim mode)
    if (name === 'deviceId' && value.trim() && mode === 'claim') {
      await checkDeviceStatus(value.trim());
    } else if (name === 'deviceId' && (!value.trim() || mode === 'register')) {
      setDeviceStatus({
        checking: false,
        exists: false,
        available: false,
        message: ''
      });
    }
  };

  // Check device availability for claiming
  const checkDeviceStatus = async (deviceId) => {
    setDeviceStatus(prev => ({ ...prev, checking: true, message: 'Checking device...' }));
    
    try {
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
      
      if (!deviceDoc.exists()) {
        setDeviceStatus({
          checking: false,
          exists: false,
          available: false,
          message: 'Device Unavailable.'
        });
        return;
      }
      
      const deviceData = deviceDoc.data();
      
      // Device exists - check if it's available for claiming (no location assigned)
      if (deviceData.Location) {
        setDeviceStatus({
          checking: false,
          exists: true,
          available: false,
          message: 'Device Unavailable.'
        });
        return;
      }
      
      // Device exists and has no location - available for claiming
      setDeviceStatus({
        checking: false,
        exists: true,
        available: true,
        message: 'Device available for claiming!'
      });
      
      // Auto-fill device details from existing data
      setFormData(prev => ({
        ...prev,
        deviceName: deviceData.DeviceName || prev.deviceName,
        deviceDescription: deviceData.DeviceDescription || prev.deviceDescription,
        deviceType: deviceData.DeviceType || prev.deviceType
      }));
      
    } catch (error) {
      console.error('Error checking device status:', error);
      setDeviceStatus({
        checking: false,
        exists: false,
        available: false,
        message: 'Error checking device. Please try again.'
      });
    }
  };

  // Handle mode switch (admin only)
  const handleModeSwitch = (newMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(false);
    setFormData({
      deviceId: '',
      deviceName: '',
      deviceDescription: '',
      deviceType: '',
      location: ''
    });
    setDeviceStatus({
      checking: false,
      exists: false,
      available: false,
      message: ''
    });
  };

  // Handle form submission
  const handleSave = async () => {
    // Validate form data
    if (!formData.deviceId.trim()) {
      setError('Device ID is required');
      return;
    }
    
    if (!formData.deviceName.trim()) {
      setError('Device name is required');
      return;
    }

    if (mode === 'claim') {
      if (!formData.location) {
        setError('Location is required');
        return;
      }
      
      if (!deviceStatus.available) {
        setError('Device is not available for claiming. Please check device status.');
        return;
      }
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('💾 Processing device...');
      
      const deviceId = formData.deviceId.trim();
      
      if (mode === 'claim') {
        // Claim existing device by assigning location
        console.log('📱 Claiming device...');
        
        await updateDoc(doc(firestore, 'DEVICE', deviceId), {
          Location: formData.location,
          DeviceName: formData.deviceName.trim(),
          DeviceDescription: formData.deviceDescription.trim() || '',
          DeviceType: formData.deviceType || 'Other'
        });
        
        // Update RTDB
        const rtdbRef = ref(database, `Devices/${deviceId}`);
        await update(rtdbRef, {
          locationId: formData.location,
          lastSeen: new Date().toISOString()
        });
        
        console.log('✅ Device claimed successfully');
        setSuccess(true);
        
        setTimeout(() => {
          navigate(`/devices/detail/${deviceId}`, {
            state: {
              message: `Device "${formData.deviceName}" has been claimed successfully.`
            }
          });
        }, 1500);
        
      } else {
        // Register new device (admin only)
        console.log('📱 Registering new device...');
        
        // Check if device already exists
        const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
        if (deviceDoc.exists()) {
          setError('Device ID already exists.');
          setLoading(false);
          return;
        }
        
        // Create device in Firestore with only the 6 required fields
        const deviceData = {
          AssignedTo: [],
          DeviceDescription: formData.deviceDescription.trim() || '',
          DeviceName: formData.deviceName.trim(),
          DeviceType: formData.deviceType || 'Other',
          Location: formData.location || null
        };
        
        await setDoc(doc(firestore, 'DEVICE', deviceId), deviceData);
        
        // Create device in RTDB with initial state
        const rtdbRef = ref(database, `Devices/${deviceId}`);
        await set(rtdbRef, {
          status: 'OFF',
          lastSeen: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          locationId: formData.location || ''
        });
        
        setSuccess(true);
        
        // Refresh devices list for admin
        await fetchRegisteredDevices();
        
        // Reset form
        setFormData({
          deviceId: '',
          deviceName: '',
          deviceDescription: '',
          deviceType: '',
          location: ''
        });
        
        setTimeout(() => setSuccess(null), 3000);
        
        console.log('✅ New device registered successfully');
      }
      
    } catch (error) {
      console.error('❌ Error processing device:', error);
      setError('Failed to process device: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle device deletion (admin only)
  const handleDeleteDevice = async (deviceId, deviceName, isClaimed) => {
    if (isClaimed) {
      setError('Cannot delete claimed devices. Device must be unclaimed first.');
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to delete device "${deviceName}" (${deviceId})?\n\n` +
      `This action cannot be undone and will permanently remove the device from the system.`
    );
    
    if (!confirmed) return;
    
    try {
      // Delete from Firestore
      await deleteDoc(doc(firestore, 'DEVICE', deviceId));
      
      // Delete from RTDB
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      await remove(rtdbRef);
      
      setSuccess(`Device "${deviceName}" deleted successfully`);
      
      // Refresh devices list
      await fetchRegisteredDevices();
      
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (error) {
      console.error('Error deleting device:', error);
      setError('Failed to delete device: ' + error.message);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    navigate('/devices');
  };

  // Get building name for a location
  const getBuildingName = (locationId) => {
    const location = userLocations.find(loc => loc.id === locationId);
    if (!location) return 'Unknown Building';
    
    return location.buildingName || 'Unknown Building';
  };

  // Check if form is valid for submission
  const isFormValid = () => {
    if (mode === 'claim') {
      return formData.deviceId.trim() && 
             formData.deviceName.trim() && 
             formData.location &&
             deviceStatus.available &&
             !deviceStatus.checking;
    } else {
      return formData.deviceId.trim() && 
             formData.deviceName.trim();
    }
  };

  if (loadingLocations) {
    return <div className="loading">Loading available locations...</div>;
  }

  return (
    <div className="add-device">
      <div className="device-header">
        <button className="back-button" onClick={handleBack}>
          <MdArrowBack /> Back
        </button>
        <h2>
          <MdAdd /> {isUserSystemAdmin ? 'Device Management' : 'Claim Device'}
        </h2>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">
        {mode === 'claim' 
          ? 'Device claimed successfully!' 
          : typeof success === 'string' ? success : 'Device registered successfully!'
        }
      </div>}
      
      {/* Admin Mode Selector */}
      {isUserSystemAdmin && (
        <div className="admin-mode-selector">
          <div className="mode-tabs">
            <button
              className={`mode-tab ${mode === 'claim' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('claim')}
            >
              Claim Device
            </button>
            <button
              className={`mode-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('register')}
            >
              Register New Device
            </button>
            <button
              className={`mode-tab ${showRegisteredDevices ? 'active' : ''}`}
              onClick={() => setShowRegisteredDevices(!showRegisteredDevices)}
            >
              View Registered Devices ({registeredDevices.length})
            </button>
          </div>
        </div>
      )}
      
      {/* Show registered devices list for admin */}
      {isUserSystemAdmin && showRegisteredDevices && (
        <RegisteredDevicesList 
          devices={registeredDevices}
          onDelete={handleDeleteDevice}
        />
      )}
      
      {/* Main form */}
      {!showRegisteredDevices && (
        <div className="device-form">
          {/* Mode-specific info banners */}
          {mode === 'claim' && !isUserSystemAdmin && (
            <div className="owner-info-banner">
              <h4>
                <MdPerson /> Device Claiming Process
              </h4>
              <p>
                Enter the device ID to claim ownership. 
                Once you assign it to a location in your building, you will have control over the device.
              </p>
            </div>
          )}
          
          {mode === 'claim' && isUserSystemAdmin && (
            <div className="owner-info-banner">
              <h4>
                <MdPerson /> Claim Device (SystemAdmin)
              </h4>
              <p>
                Claim devices by assigning them to locations in buildings.
              </p>
            </div>
          )}
          
          {mode === 'register' && isUserSystemAdmin && (
            <div className="owner-info-banner">
              <h4>
                <MdPerson /> Register New Device (SystemAdmin)
              </h4>
              <p>
                Register new devices in the system. These devices will be available for parents to claim.
              </p>
            </div>
          )}
          
          <div className="form-group">
            <label>Device ID *</label>
            <div className="device-input-container">
              <input 
                type="text" 
                name="deviceId" 
                value={formData.deviceId} 
                onChange={handleChange}
                placeholder={mode === 'register' ? "Enter new device ID" : "Enter device ID"}
                disabled={loading}
                className={mode === 'claim' && deviceStatus.available ? 'input-valid' : ''}
              />
              {mode === 'claim' && deviceStatus.checking && <span className="checking-message">Checking...</span>}
              {mode === 'claim' && formData.deviceId && !deviceStatus.checking && (
                <>
                  {!deviceStatus.available && (
                    <span className="device-invalid">Not available</span>
                  )}
                  {deviceStatus.available && (
                    <span className="device-valid">Available to claim</span>
                  )}
                </>
              )}
            </div>
            {mode === 'claim' && deviceStatus.message && (
              <small style={{ 
                color: deviceStatus.available ? '#16a34a' : '#dc2626',
                fontWeight: '500'
              }}>
                {deviceStatus.message}
              </small>
            )}
          </div>
          
          <div className="form-group">
            <label>Device Name *</label>
            <input 
              type="text" 
              name="deviceName" 
              value={formData.deviceName} 
              onChange={handleChange}
              placeholder="Enter descriptive device name"
              disabled={loading}
              className={formData.deviceName ? 'input-valid' : ''}
            />
          </div>
          
          <div className="form-group">
            <label>Device Type</label>
            <select 
              name="deviceType" 
              value={formData.deviceType} 
              onChange={handleChange}
              disabled={loading}
            >
              <option value="">Select device type</option>
              <option value="Light">Light</option>
              <option value="Fan">Fan</option>
              <option value="AC">Air Conditioner</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="deviceDescription" 
              value={formData.deviceDescription} 
              onChange={handleChange}
              placeholder="Enter device description (optional)"
              disabled={loading}
              rows="3"
            />
          </div>
          
          {mode === 'claim' && (
            <div className="form-group">
              <label>
                <MdLocationOn /> Location *
              </label>
              <select 
                name="location" 
                value={formData.location} 
                onChange={handleChange}
                disabled={loading}
                className={formData.location ? 'input-valid' : ''}
              >
                <option value="">Select location</option>
                {userBuildings.map(building => (
                  <optgroup key={building.id} label={building.buildingName || building.id}>
                    {userLocations
                      .filter(loc => loc.buildingId === building.id)
                      .map(location => (
                        <option key={location.id} value={location.id}>
                          {location.locationName || location.id}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {formData.location && (
                <small className="location-info">
                  Building: {getBuildingName(formData.location)}
                </small>
              )}
            </div>
          )}
          
          {mode === 'register' && userLocations.length > 0 && (
            <div className="form-group">
              <label>
                <MdLocationOn /> Location (Optional)
              </label>
              <select 
                name="location" 
                value={formData.location} 
                onChange={handleChange}
                disabled={loading}
              >
                <option value="">No location (available for claiming)</option>
                {userBuildings.map(building => (
                  <optgroup key={building.id} label={building.buildingName || building.id}>
                    {userLocations
                      .filter(loc => loc.buildingId === building.id)
                      .map(location => (
                        <option key={location.id} value={location.id}>
                          {location.locationName || location.id}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          
          <button 
            className="save-button"
            onClick={handleSave}
            disabled={loading || !isFormValid()}
          >
            <MdDevices /> {loading ? 
              (mode === 'claim' ? 'Claiming Device...' : 'Registering Device...') : 
              (mode === 'claim' ? 'Claim Device' : 'Register Device')
            }
          </button>
        </div>
      )}
    </div>
  );
};

// Registered Devices List Component
const RegisteredDevicesList = ({ devices, onDelete }) => (
  <div className="registered-devices-section">
    <h3>Registered Devices ({devices.length})</h3>
    
    {devices.length === 0 ? (
      <div className="no-devices">
        <p>No devices registered yet.</p>
      </div>
    ) : (
      <div className="devices-grid">
        {devices.map(device => (
          <div key={device.id} className={`device-card ${device.status}`}>
            <div className="device-header">
              <h4>{device.DeviceName || device.id}</h4>
              <span className={`status-badge ${device.status}`}>
                {device.status === 'available' ? 'Available' : 'Claimed'}
              </span>
            </div>
            
            <div className="device-details">
              <div className="detail-item">
                <span className="label">ID:</span>
                <span className="value">{device.id}</span>
              </div>
              <div className="detail-item">
                <span className="label">Type:</span>
                <span className="value">{device.DeviceType || 'N/A'}</span>
              </div>
              
              {device.Location && (
                <div className="detail-item">
                  <span className="label">Location:</span>
                  <span className="value">{device.Location}</span>
                </div>
              )}
              
              {device.DeviceDescription && (
                <div className="detail-item">
                  <span className="label">Description:</span>
                  <span className="value">{device.DeviceDescription}</span>
                </div>
              )}
            </div>
            
            {device.status === 'available' && (
              <div className="device-actions">
                <button
                  className="delete-btn"
                  onClick={() => onDelete(device.id, device.DeviceName || device.id, false)}
                >
                  <MdDelete /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default AddDevice;