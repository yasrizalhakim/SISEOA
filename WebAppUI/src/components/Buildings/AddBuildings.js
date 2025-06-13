// src/components/Buildings/AddBuilding.js - Refactored with component consolidation

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdArrowBack, MdAdd, MdClose } from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { notifyParentBuildingCreated } from '../../services/notificationService';
import { 
  doc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  getDoc 
} from 'firebase/firestore';
import './AddBuildings.css';

const AddBuilding = () => {
  const navigate = useNavigate();
  
  // Form State
  const [formData, setFormData] = useState({
    deviceId: '',
    buildingId: '',
    buildingName: '',
    buildingAddress: '',
    buildingDescription: ''
  });
  
  const [locations, setLocations] = useState([
    { id: '', name: '' }
  ]);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Validation State
  const [buildingExists, setBuildingExists] = useState(false);
  const [deviceExists, setDeviceExists] = useState(false);
  const [deviceAvailable, setDeviceAvailable] = useState(false);
  const [isCheckingDevice, setIsCheckingDevice] = useState(false);
  
  // User Context
  const userEmail = useMemo(() => 
    localStorage.getItem('userEmail') || '', 
    []
  );
  
  // Authentication Check
  useEffect(() => {
    if (!userEmail) {
      setError('You must be logged in to add buildings');
      navigate('/login');
    }
  }, [userEmail, navigate]);
  
  // Building ID Validation
  const checkBuildingExists = useCallback(async (buildingId) => {
    if (!buildingId) return;
    
    try {
      const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
      const exists = buildingDoc.exists();
      setBuildingExists(exists);
      
      if (exists) {
        setError('Building ID already exists. Please use a different ID.');
      } else if (error && error.includes('Building ID already exists')) {
        setError(null);
      }
    } catch (err) {
      console.error('Error checking building ID:', err);
    }
  }, [error]);
  
  // Device Availability Validation
  const checkDeviceAvailability = useCallback(async (deviceId) => {
    if (!deviceId) return;
    
    setIsCheckingDevice(true);
    setDeviceExists(false);
    setDeviceAvailable(false);
    
    try {
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
      
      if (!deviceDoc.exists()) {
        setDeviceExists(false);
        setDeviceAvailable(false);
        setError('Device Unavailable');
        return;
      }
      
      setDeviceExists(true);
      const deviceData = deviceDoc.data();
      
      if (deviceData.Location) {
        const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
        
        if (locationDoc.exists()) {
          const locationData = locationDoc.data();
          const deviceBuildingId = locationData.Building;
          
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
            setDeviceAvailable(true);
            setError(null);
          }
        } else {
          setDeviceAvailable(true);
          setError(null);
        }
      } else {
        setDeviceAvailable(true);
        setError(null);
      }
    } catch (err) {
      console.error('Error checking device availability:', err);
      setDeviceExists(false);
      setDeviceAvailable(false);
      setError('Error checking device availability');
    } finally {
      setIsCheckingDevice(false);
    }
  }, []);
  
  // Form Input Handler
  const handleChange = useCallback(async (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (name === 'buildingId' && value) {
      await checkBuildingExists(value);
    }
    
    if (name === 'deviceId' && value) {
      await checkDeviceAvailability(value);
    }
  }, [checkBuildingExists, checkDeviceAvailability]);
  
  // Location Management
  const handleLocationChange = useCallback((index, value) => {
    setLocations(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        name: value,
        id: formData.buildingId && value 
          ? `${formData.buildingId}${value.replace(/\s+/g, '')}` 
          : ''
      };
      return updated;
    });
  }, [formData.buildingId]);
  
  const addLocationField = useCallback(() => {
    setLocations(prev => [...prev, { id: '', name: '' }]);
  }, []);
  
  const removeLocationField = useCallback((index) => {
    if (locations.length <= 1) {
      setError('At least one location is required');
      return;
    }
    
    setLocations(prev => prev.filter((_, i) => i !== index));
  }, [locations.length]);
  
  // Form Validation
  const isFormValid = useMemo(() => {
    return formData.deviceId && 
           formData.buildingId && 
           formData.buildingName && 
           !buildingExists &&
           deviceExists &&
           deviceAvailable &&
           locations.length > 0 &&
           locations.every(loc => loc.name.trim() !== '');
  }, [
    formData.deviceId,
    formData.buildingId,
    formData.buildingName,
    buildingExists,
    deviceExists,
    deviceAvailable,
    locations
  ]);
  
  // Save Handler
  const handleSave = useCallback(async () => {
    // Validation
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
    
    if (!deviceExists || !deviceAvailable) {
      setError('Device Unavailable.');
      return;
    }
    
    const validLocations = locations.filter(loc => loc.name.trim() !== '');
    if (validLocations.length === 0) {
      setError('At least one location is required');
      return;
    }
    
    if (locations.some(loc => loc.name.trim() === '')) {
      setError('All location fields must be filled or removed');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const timestamp = serverTimestamp();
      const now = new Date();
      const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
      
      // Create building
      await setDoc(doc(firestore, 'BUILDING', formData.buildingId), {
        BuildingName: formData.buildingName,
        Address: formData.buildingAddress || '',
        Description: formData.buildingDescription || '',
        CreatedAt: timestamp,
        DateCreated: dateCreated,
        CreatedBy: userEmail
      });
      
      // Create user-building relationship
      const userBuildingId = `${userEmail.replace(/\./g, '_')}_${formData.buildingId}`;
      await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
        User: userEmail,
        Building: formData.buildingId,
        Role: 'parent',
        CreatedAt: timestamp
      });
      
      // Create locations
      for (const location of validLocations) {
        const locationId = location.id || `${formData.buildingId}${location.name.replace(/\s+/g, '')}`;
        
        await setDoc(doc(firestore, 'LOCATION', locationId), {
          Building: formData.buildingId,
          LocationName: location.name,
          DateCreated: dateCreated
        });
      }
      
      // Assign device to first location
      const firstLocationId = validLocations[0].id || 
        `${formData.buildingId}${validLocations[0].name.replace(/\s+/g, '')}`;
      
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', formData.deviceId));
      const currentDeviceData = deviceDoc.data();
      
      await setDoc(doc(firestore, 'DEVICE', formData.deviceId), {
        ...currentDeviceData,
        Location: firstLocationId
      });
      
      setSuccess(true);

      try {
        await notifyParentBuildingCreated(
          userEmail,
          formData.buildingName,
          formData.buildingId
        );
        console.log('📢 Building creation notification sent to parent');
      } catch (notificationError) {
        console.error('❌ Failed to send building creation notification:', notificationError);
      }
      
      setTimeout(() => {
        navigate('/buildings');
      }, 1500);
      
    } catch (err) {
      console.error('Error adding building:', err);
      setError('Failed to add building: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    formData,
    buildingExists,
    deviceExists,
    deviceAvailable,
    locations,
    userEmail,
    navigate
  ]);
  
  // Navigation Handler
  const handleBack = useCallback(() => {
    navigate('/buildings');
  }, [navigate]);
  
  return (
    <div className="add-building">
      <BuildingHeader onBack={handleBack} />
      
      <MessageSection error={error} success={success} />
      
      <BuildingForm
        formData={formData}
        locations={locations}
        deviceExists={deviceExists}
        deviceAvailable={deviceAvailable}
        isCheckingDevice={isCheckingDevice}
        buildingExists={buildingExists}
        loading={loading}
        isFormValid={isFormValid}
        onChange={handleChange}
        onLocationChange={handleLocationChange}
        onAddLocation={addLocationField}
        onRemoveLocation={removeLocationField}
        onSave={handleSave}
      />
    </div>
  );
};

// Header Component
const BuildingHeader = ({ onBack }) => (
  <div className="building-header">
    <button className="back-button" onClick={onBack} type="button">
      <MdArrowBack /> Back
    </button>
    <h2>Add New Building</h2>
  </div>
);

// Message Section Component
const MessageSection = ({ error, success }) => (
  <>
    {error && <div className="error-message">{error}</div>}
    {success && <div className="success-message">Building added successfully</div>}
  </>
);

// Main Form Component
const BuildingForm = ({
  formData,
  locations,
  deviceExists,
  deviceAvailable,
  isCheckingDevice,
  buildingExists,
  loading,
  isFormValid,
  onChange,
  onLocationChange,
  onAddLocation,
  onRemoveLocation,
  onSave
}) => (
  <form className="building-form" onSubmit={(e) => e.preventDefault()}>
    <DeviceRequirementBanner />
    
    <DeviceIdInput
      value={formData.deviceId}
      deviceExists={deviceExists}
      deviceAvailable={deviceAvailable}
      isCheckingDevice={isCheckingDevice}
      loading={loading}
      onChange={onChange}
    />
    
    <BuildingIdInput
      value={formData.buildingId}
      buildingExists={buildingExists}
      loading={loading}
      onChange={onChange}
    />
    
    <FormField
      id="buildingName"
      name="buildingName"
      label="Building Name *"
      value={formData.buildingName}
      placeholder="Enter building name"
      disabled={loading}
      onChange={onChange}
      isValid={!!formData.buildingName}
    />
    
    <FormField
      id="buildingAddress"
      name="buildingAddress"
      label="Address"
      value={formData.buildingAddress}
      placeholder="Enter building address (optional)"
      disabled={loading}
      onChange={onChange}
      autoComplete="street-address"
    />
    
    <FormField
      id="buildingDescription"
      name="buildingDescription"
      label="Description"
      type="textarea"
      value={formData.buildingDescription}
      placeholder="Enter building description (optional)"
      disabled={loading}
      onChange={onChange}
      rows={3}
    />
    
    <LocationsSection
      locations={locations}
      loading={loading}
      onChange={onLocationChange}
      onAdd={onAddLocation}
      onRemove={onRemoveLocation}
    />
    
    <UserAccessSection />
    
    <SubmitButton
      loading={loading}
      isFormValid={isFormValid}
      onSave={onSave}
    />
  </form>
);

// Device Requirement Banner
const DeviceRequirementBanner = () => (
  <div className="device-requirement-banner">
    <h4>📱 Device ID Required</h4>
    <p>
      A valid device ID is required to create a building. This device will be assigned to your new building. 
      By creating a building, you become a parent/owner of that building.
    </p>
  </div>
);

// Device ID Input Component
const DeviceIdInput = ({ 
  value, 
  deviceExists, 
  deviceAvailable, 
  isCheckingDevice, 
  loading, 
  onChange 
}) => (
  <div className="form-group">
    <label htmlFor="deviceId">Device ID *</label>
    <div className="device-input-container">
      <input 
        id="deviceId"
        type="text" 
        name="deviceId" 
        value={value} 
        onChange={onChange}
        placeholder="Enter device ID"
        disabled={loading}
        className={deviceExists && deviceAvailable ? 'input-valid' : ''}
        autoComplete="off"
      />
      <DeviceStatusIndicator
        deviceId={value}
        isChecking={isCheckingDevice}
        exists={deviceExists}
        available={deviceAvailable}
      />
    </div>
    <small>This device will be assigned to the first location in your building</small>
  </div>
);

// Device Status Indicator
const DeviceStatusIndicator = ({ deviceId, isChecking, exists, available }) => {
  if (isChecking) {
    return <span className="checking-message">Checking...</span>;
  }
  
  if (!deviceId) return null;
  
  if (!exists) {
    return <span className="device-invalid">Device unavailable</span>;
  }
  
  if (exists && available) {
    return <span className="device-valid">Device available</span>;
  }
  
  if (exists && !available) {
    return <span className="device-invalid">Device unavailable</span>;
  }
  
  return null;
};

// Building ID Input Component
const BuildingIdInput = ({ value, buildingExists, loading, onChange }) => (
  <div className="form-group">
    <label htmlFor="buildingId">Building ID *</label>
    <input 
      id="buildingId"
      type="text" 
      name="buildingId" 
      value={value} 
      onChange={onChange}
      placeholder="Enter building ID"
      disabled={loading}
      className={value && !buildingExists ? 'input-valid' : ''}
      autoComplete="off"
    />
    <small>Building ID must be unique and cannot be changed later</small>
  </div>
);

// Generic Form Field Component
const FormField = ({ 
  id, 
  name, 
  label, 
  type = "text", 
  value, 
  placeholder, 
  disabled, 
  onChange, 
  isValid, 
  rows, 
  autoComplete 
}) => (
  <div className="form-group">
    <label htmlFor={id}>{label}</label>
    {type === 'textarea' ? (
      <textarea 
        id={id}
        name={name} 
        value={value} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
      />
    ) : (
      <input 
        id={id}
        type={type} 
        name={name} 
        value={value} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={isValid ? 'input-valid' : ''}
        autoComplete={autoComplete}
      />
    )}
  </div>
);

// Locations Section Component
const LocationsSection = ({ locations, loading, onChange, onAdd, onRemove }) => (
  <div className="locations-section">
    <div className="section-header">
      <h3>Locations *</h3>
      <small>At least one location is required. Your device will be assigned to the first location.</small>
    </div>
    
    {locations.map((location, index) => (
      <LocationInputRow
        key={index}
        location={location}
        index={index}
        disabled={loading}
        canRemove={locations.length > 1}
        onChange={onChange}
        onRemove={onRemove}
      />
    ))}
    
    <button 
      type="button"
      className="add-location-btn"
      onClick={onAdd}
      disabled={loading}
    >
      <MdAdd /> Add Another Location
    </button>
  </div>
);

// Location Input Row Component
const LocationInputRow = ({ location, index, disabled, canRemove, onChange, onRemove }) => (
  <div className="location-input-row">
    <input
      type="text"
      value={location.name}
      onChange={(e) => onChange(index, e.target.value)}
      placeholder="Enter location name"
      disabled={disabled}
      className={location.name ? 'input-valid' : ''}
    />
    <button 
      type="button"
      className="remove-location-btn"
      onClick={() => onRemove(index)}
      disabled={!canRemove}
      aria-label="Remove location"
    >
      <MdClose />
    </button>
  </div>
);

// User Access Section Component
const UserAccessSection = () => (
  <div className="user-access-section">
    <h3>Building Access</h3>
    <div className="user-access-info">
      <p>You will automatically become the parent/owner of this building.</p>
      <p>As a parent, you can add children users to access this building and its devices.</p>
    </div>
  </div>
);

// Submit Button Component
const SubmitButton = ({ loading, isFormValid, onSave }) => (
  <button 
    type="button"
    className="save-button"
    onClick={onSave}
    disabled={loading || !isFormValid}
  >
    <MdAdd /> {loading ? 'Adding...' : 'Add Building'}
  </button>
);

export default AddBuilding;