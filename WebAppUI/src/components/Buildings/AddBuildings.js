// src/components/Buildings/AddBuilding.js - Refactored without custom hooks

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdArrowBack, MdAdd, MdClose } from 'react-icons/md';
import buildingService from '../../services/buildingService';
import './AddBuildings.css';

// ==============================================================================
// MAIN ADD BUILDING COMPONENT
// ==============================================================================

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
  const [deviceValidation, setDeviceValidation] = useState({
    checking: false,
    exists: false,
    available: false
  });
  
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
      const exists = await buildingService.buildingExists(buildingId);
      setBuildingExists(exists);
      
      if (exists) {
        setError('Building ID already exists. Please use a different ID.');
      } else if (error && error.includes('Building ID already exists')) {
        setError(null);
      }
    } catch (err) {
    }
  }, [error]);
  
  // Device Availability Validation
  const checkDeviceAvailability = useCallback(async (deviceId) => {
    if (!deviceId) return;
    
    setDeviceValidation({ checking: true, exists: false, available: false });
    setError(null);
    
    try {
      const validation = await buildingService.validateDeviceForBuilding(deviceId);
      
      setDeviceValidation({
        checking: false,
        exists: validation.exists,
        available: validation.available
      });
      
      if (!validation.available) {
        setError(validation.reason);
      }
    } catch (err) {
      setDeviceValidation({ checking: false, exists: false, available: false });
      setError('Error checking device availability');
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
           deviceValidation.exists &&
           deviceValidation.available &&
           locations.length > 0 &&
           locations.every(loc => loc.name.trim() !== '');
  }, [
    formData.deviceId,
    formData.buildingId,
    formData.buildingName,
    buildingExists,
    deviceValidation.exists,
    deviceValidation.available,
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
    
    if (!deviceValidation.exists || !deviceValidation.available) {
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
      
      const buildingData = {
        deviceId: formData.deviceId,
        buildingId: formData.buildingId,
        buildingName: formData.buildingName,
        buildingAddress: formData.buildingAddress,
        buildingDescription: formData.buildingDescription,
        locations: validLocations,
        userEmail: userEmail
      };
      
      await buildingService.createBuilding(buildingData);
      
      setSuccess(true);
      
      setTimeout(() => {
        navigate('/buildings');
      }, 1500);
      
    } catch (err) {
      setError('Failed to add building: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    formData,
    buildingExists,
    deviceValidation,
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
        deviceValidation={deviceValidation}
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

// ==============================================================================
// HEADER COMPONENT
// ==============================================================================

const BuildingHeader = ({ onBack }) => (
  <div className="building-header">
    <button className="back-button" onClick={onBack} type="button">
      <MdArrowBack /> Back
    </button>
    <h2>Add New Building</h2>
  </div>
);

// ==============================================================================
// MESSAGE SECTION COMPONENT
// ==============================================================================

const MessageSection = ({ error, success }) => (
  <>
    {error && <div className="error-message">{error}</div>}
    {success && <div className="success-message">Building added successfully</div>}
  </>
);

// ==============================================================================
// MAIN FORM COMPONENT
// ==============================================================================

const BuildingForm = ({
  formData,
  locations,
  deviceValidation,
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
      deviceValidation={deviceValidation}
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

// ==============================================================================
// DEVICE REQUIREMENT BANNER
// ==============================================================================

const DeviceRequirementBanner = () => (
  <div className="device-requirement-banner">
    <h4>📱 Device ID Required</h4>
    <p>
      A valid device ID is required to create a building. This device will be assigned to your new building. 
      By creating a building, you become a parent/owner of that building.
    </p>
  </div>
);

// ==============================================================================
// DEVICE ID INPUT COMPONENT
// ==============================================================================

const DeviceIdInput = ({ value, deviceValidation, loading, onChange }) => (
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
        className={deviceValidation.exists && deviceValidation.available ? 'input-valid' : ''}
        autoComplete="off"
      />
      <DeviceStatusIndicator
        deviceId={value}
        deviceValidation={deviceValidation}
      />
    </div>
    <small>This device will be assigned to the first location in your building</small>
  </div>
);

// ==============================================================================
// DEVICE STATUS INDICATOR
// ==============================================================================

const DeviceStatusIndicator = ({ deviceId, deviceValidation }) => {
  if (deviceValidation.checking) {
    return <span className="checking-message">Checking...</span>;
  }
  
  if (!deviceId) return null;
  
  if (!deviceValidation.exists) {
    return <span className="device-invalid">Device unavailable</span>;
  }
  
  if (deviceValidation.exists && deviceValidation.available) {
    return <span className="device-valid">Device available</span>;
  }
  
  if (deviceValidation.exists && !deviceValidation.available) {
    return <span className="device-invalid">Device unavailable</span>;
  }
  
  return null;
};

// ==============================================================================
// BUILDING ID INPUT COMPONENT
// ==============================================================================

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
    {buildingExists && <span className="validation-error">Building ID already exists</span>}
  </div>
);

// ==============================================================================
// GENERIC FORM FIELD COMPONENT
// ==============================================================================

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

// ==============================================================================
// LOCATIONS SECTION COMPONENT
// ==============================================================================

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

// ==============================================================================
// LOCATION INPUT ROW COMPONENT
// ==============================================================================

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

// ==============================================================================
// USER ACCESS SECTION COMPONENT
// ==============================================================================

const UserAccessSection = () => (
  <div className="user-access-section">
    <h3>Building Access</h3>
    <div className="user-access-info">
      <p>You will automatically become the parent/owner of this building.</p>
      <p>As a parent, you can add children users to access this building and its devices.</p>
    </div>
  </div>
);

// ==============================================================================
// SUBMIT BUTTON COMPONENT
// ==============================================================================

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