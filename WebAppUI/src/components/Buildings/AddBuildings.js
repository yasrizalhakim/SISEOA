// src/components/Buildings/AddBuilding.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdArrowBack, MdAdd, MdClose } from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { doc, setDoc, collection, getDocs, query, where, serverTimestamp, getDoc } from 'firebase/firestore';
import './AddBuildings.css';

const AddBuilding = () => {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    deviceId: '', // Required for all users
    buildingId: '',
    buildingName: '',
    buildingAddress: '',
    buildingDescription: ''
  });
  
  const [locations, setLocations] = useState([
    { id: '', name: '' } // Start with one empty location
  ]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [buildingExists, setBuildingExists] = useState(false);
  const [deviceExists, setDeviceExists] = useState(false);
  const [deviceAvailable, setDeviceAvailable] = useState(false);
  const [isCheckingDevice, setIsCheckingDevice] = useState(false);
  
  // User role and details
  const [userEmail, setUserEmail] = useState(localStorage.getItem('userEmail') || '');
  
  // Check if the user can add a building (any user can now add buildings if they have a device ID)
  useEffect(() => {
    if (!userEmail) {
      setError('You must be logged in to add buildings');
      navigate('/login');
    }
  }, [userEmail, navigate]);
  
  // Handle form input changes
  const handleChange = async (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Check if building ID already exists when changed
    if (name === 'buildingId' && value) {
      await checkBuildingExists(value);
    }
    
    // Check if device ID exists and is available when changed
    if (name === 'deviceId' && value) {
      await checkDeviceAvailability(value);
    }
  };
  
  // Handle location input changes
  const handleLocationChange = (index, value) => {
    const updatedLocations = [...locations];
    updatedLocations[index].name = value;
    
    // Generate location ID based on building ID and location name
    if (formData.buildingId && value) {
      updatedLocations[index].id = `${formData.buildingId}${value.replace(/\s+/g, '')}`;
    }
    
    setLocations(updatedLocations);
  };
  
  // Add new location field
  const addLocationField = () => {
    setLocations([...locations, { id: '', name: '' }]);
  };
  
  // Remove location field
  const removeLocationField = (index) => {
    if (locations.length <= 1) {
      setError('At least one location is required');
      return;
    }
    
    const updatedLocations = [...locations];
    updatedLocations.splice(index, 1);
    setLocations(updatedLocations);
  };
  
  // Check if building exists in Firestore
  const checkBuildingExists = async (buildingId) => {
    try {
      const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
      setBuildingExists(buildingDoc.exists());
      
      if (buildingDoc.exists()) {
        setError('Building ID already exists. Please use a different ID.');
      } else {
        // Clear error if it was about building ID
        if (error && error.includes('Building ID already exists')) {
          setError(null);
        }
      }
    } catch (error) {
      console.error('Error checking building ID:', error);
    }
  };
  
  // Check if device exists and is available
  const checkDeviceAvailability = async (deviceId) => {
    setIsCheckingDevice(true);
    setDeviceExists(false);
    setDeviceAvailable(false);
    
    try {
      // Check if device exists in Firestore
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
      
      if (!deviceDoc.exists()) {
        setDeviceExists(false);
        setDeviceAvailable(false);
        setError('Device Unavailable');
        setIsCheckingDevice(false);
        return;
      }
      
      setDeviceExists(true);
      const deviceData = deviceDoc.data();
      
      // Check if device is already assigned to a location
      if (deviceData.Location) {
        // Get the location's building
        const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
        
        if (locationDoc.exists()) {
          const locationData = locationDoc.data();
          const deviceBuildingId = locationData.Building;
          
          // Check if this building has any parent users
          const parentQuery = query(
            collection(firestore, 'USERBUILDING'),
            where('Building', '==', deviceBuildingId),
            where('Role', '==', 'parent')
          );
          
          const parentSnapshot = await getDocs(parentQuery);
          
          if (!parentSnapshot.empty) {
            setDeviceAvailable(false);
            setError('Device Unavailable');
          } else {
            // Device is in a building but no parent is assigned - can be used
            setDeviceAvailable(true);
            setError(null);
          }
        } else {
          // Location doesn't exist anymore - device can be used
          setDeviceAvailable(true);
          setError(null);
        }
      } else {
        // Device has no location - available
        setDeviceAvailable(true);
        setError(null);
      }
    } catch (error) {
      console.error('Error checking device availability:', error);
      setDeviceExists(false);
      setDeviceAvailable(false);
      setError('Error checking device availability');
    } finally {
      setIsCheckingDevice(false);
    }
  };
  
  // Save new building
  const handleSave = async () => {
    // Validate form data
    if (!formData.deviceId) {
      setError('Device ID is required to create a building');
      return;
    }
    
    if (!formData.buildingId) {
      setError('Building ID is required');
      return;
    }
    
    if (!formData.buildingName) {
      setError('Building name is required');
      return;
    }
    
    if (buildingExists) {
      setError('Building ID unavailable. Please use a different ID.');
      return;
    }
    
    if (!deviceExists) {
      setError('Device Unavailable.');
      return;
    }
    
    if (!deviceAvailable) {
      setError('Device Unavailable.');
      return;
    }
    
    // Validate locations
    const validLocations = locations.filter(loc => loc.name.trim() !== '');
    if (validLocations.length === 0) {
      setError('At least one location is required');
      return;
    }
    
    // Make sure all locations have names
    if (locations.some(loc => loc.name.trim() === '')) {
      setError('All location fields must be filled or removed');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Create timestamp for creation date
      const timestamp = serverTimestamp();
      const now = new Date();
      const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
      
      // 1. Create building in BUILDING collection
      await setDoc(doc(firestore, 'BUILDING', formData.buildingId), {
        BuildingName: formData.buildingName,
        Address: formData.buildingAddress || '',
        Description: formData.buildingDescription || '',
        CreatedAt: timestamp,
        DateCreated: dateCreated,
        CreatedBy: userEmail
      });
      
      // 2. Create USERBUILDING record to associate user with building as parent
      const userBuildingId = `${userEmail.replace(/\./g, '_')}_${formData.buildingId}`;
      
      await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
        User: userEmail,
        Building: formData.buildingId,
        Role: 'parent', // User becomes parent of the building they create
        CreatedAt: timestamp
      });
      
      // 3. Create locations for this building
      for (const location of validLocations) {
        // Generate location ID if not already set
        const locationId = location.id || `${formData.buildingId}${location.name.replace(/\s+/g, '')}`;
        
        await setDoc(doc(firestore, 'LOCATION', locationId), {
          Building: formData.buildingId,
          LocationName: location.name,
          DateCreated: dateCreated
        });
      }
      
      // 4. Assign the device to the first location
      const firstLocationId = validLocations[0].id || `${formData.buildingId}${validLocations[0].name.replace(/\s+/g, '')}`;
      
      // Get current device data and update location
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', formData.deviceId));
      const currentDeviceData = deviceDoc.data();
      
      await setDoc(doc(firestore, 'DEVICE', formData.deviceId), {
        ...currentDeviceData,
        Location: firstLocationId
      });
      
      setSuccess(true);
      
      // Redirect to buildings page after a short delay
      setTimeout(() => {
        navigate('/buildings');
      }, 1500);
      
    } catch (error) {
      console.error('Error adding building:', error);
      setError('Failed to add building: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle back navigation
  const handleBack = () => {
    navigate('/buildings');
  };
  
  // Check if form is valid for submission
  const isFormValid = () => {
    return formData.deviceId && 
           formData.buildingId && 
           formData.buildingName && 
           !buildingExists &&
           deviceExists &&
           deviceAvailable &&
           locations.length > 0 &&
           locations.every(loc => loc.name.trim() !== '');
  };
  
  return (
    <div className="add-building">
      <div className="building-header">
        <button className="back-button" onClick={handleBack}>
          <MdArrowBack /> Back
        </button>
        <h2>Add New Building</h2>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Building added successfully</div>}
      
      <div className="building-form">
        <div className="device-requirement-banner">
          <h4>📱 Device ID Required</h4>
          <p>A valid device ID is required to create a building. This device will be assigned to your new building. By creating a building, you become a parent/owner of that building.</p>
        </div>
        
        <div className="form-group">
          <label>Device ID *</label>
          <div className="device-input-container">
            <input 
              type="text" 
              name="deviceId" 
              value={formData.deviceId} 
              onChange={handleChange}
              placeholder="Enter device ID"
              disabled={loading}
              className={deviceExists && deviceAvailable ? 'input-valid' : ''}
            />
            {isCheckingDevice && <span className="checking-message">Checking...</span>}
            {formData.deviceId && !isCheckingDevice && (
              <>
                {!deviceExists && (
                  <span className="device-invalid">Device unavailable</span>
                )}
                {deviceExists && deviceAvailable && (
                  <span className="device-valid">Device available</span>
                )}
                {deviceExists && !deviceAvailable && (
                  <span className="device-invalid">Device unavailable</span>
                )}
              </>
            )}
          </div>
          <small>This device will be assigned to the first location in your building</small>
        </div>
        
        <div className="form-group">
          <label>Building ID *</label>
          <input 
            type="text" 
            name="buildingId" 
            value={formData.buildingId} 
            onChange={handleChange}
            placeholder="Enter building ID"
            disabled={loading}
            className={formData.buildingId && !buildingExists ? 'input-valid' : ''}
          />
          <small>Building ID must be unique and cannot be changed later</small>
        </div>
        
        <div className="form-group">
          <label>Building Name *</label>
          <input 
            type="text" 
            name="buildingName" 
            value={formData.buildingName} 
            onChange={handleChange}
            placeholder="Enter building name"
            disabled={loading}
            className={formData.buildingName ? 'input-valid' : ''}
          />
        </div>
        
        <div className="form-group">
          <label>Address</label>
          <input 
            type="text" 
            name="buildingAddress" 
            value={formData.buildingAddress} 
            onChange={handleChange}
            placeholder="Enter building address (optional)"
            disabled={loading}
          />
        </div>
        
        <div className="form-group">
          <label>Description</label>
          <textarea 
            name="buildingDescription" 
            value={formData.buildingDescription} 
            onChange={handleChange}
            placeholder="Enter building description (optional)"
            disabled={loading}
            rows="3"
          ></textarea>
        </div>
        
        {/* Location inputs */}
        <div className="locations-section">
          <div className="section-header">
            <h3>Locations *</h3>
            <small>At least one location is required. Your device will be assigned to the first location.</small>
          </div>
          
          {locations.map((location, index) => (
            <div key={index} className="location-input-row">
              <input
                type="text"
                value={location.name}
                onChange={(e) => handleLocationChange(index, e.target.value)}
                placeholder="Enter location name"
                disabled={loading}
                className={location.name ? 'input-valid' : ''}
              />
              <button 
                type="button"
                className="remove-location-btn"
                onClick={() => removeLocationField(index)}
                disabled={locations.length <= 1}
              >
                <MdClose />
              </button>
            </div>
          ))}
          
          <button 
            type="button"
            className="add-location-btn"
            onClick={addLocationField}
            disabled={loading}
          >
            <MdAdd /> Add Another Location
          </button>
        </div>
        
        <div className="user-access-section">
          <h3>Building Access</h3>
          <div className="user-access-info">
            <p>You will automatically become the parent/owner of this building.</p>
            <p>As a parent, you can add children users to access this building and its devices.</p>
          </div>
        </div>
        
        <button 
          className="save-button"
          onClick={handleSave}
          disabled={loading || !isFormValid()}
        >
          <MdAdd /> {loading ? 'Adding...' : 'Add Building'}
        </button>
      </div>
    </div>
  );
};

export default AddBuilding;