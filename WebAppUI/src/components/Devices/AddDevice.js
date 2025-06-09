// src/components/Devices/AddDevice.js - Enhanced with Building Association
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdArrowBack, MdAdd, MdDevices, MdLocationOn, MdPerson, MdDelete } from 'react-icons/md';
import { firestore, database } from '../../services/firebase';
import { notifyDeviceRegistered } from '../../services/notificationService';
import { 
  notifyParentDeviceClaimed, 
  notifyAdminDeviceAdded 
} from '../../services/notificationService';
import { 
  doc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  getDoc,
  updateDoc,
  deleteDoc 
} from 'firebase/firestore';
import { ref, set, update, remove } from 'firebase/database';
import { 
  isSystemAdmin, 
  getUserBuildingRoles 
} from '../../utils/helpers';
import './AddDevice.css';


// Initial form state
const INITIAL_FORM_DATA = {
  deviceId: '',
  deviceName: '',
  deviceDescription: '',
  deviceType: '',
  location: ''
};

// Initial device status state
const INITIAL_DEVICE_STATUS = {
  checking: false,
  exists: false,
  available: false,
  message: ''
};

// Device types options
const DEVICE_TYPES = [
  { value: '', label: 'Select device type' },
  { value: 'Light', label: 'Light' },
  { value: 'Fan', label: 'Fan' },
  { value: 'AC', label: 'Air Conditioner' },
  { value: 'Other', label: 'Other' }
];

// Mode tabs configuration
const MODE_TABS = {
  CLAIM: 'claim',
  REGISTER: 'register'
};

const AddDevice = () => {
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail') || '';
  
  // Core state
  const [mode, setMode] = useState(MODE_TABS.CLAIM);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [deviceStatus, setDeviceStatus] = useState(INITIAL_DEVICE_STATUS);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);
  
  // Admin state
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [showRegisteredDevices, setShowRegisteredDevices] = useState(false);
  
  // User permissions and data
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [userBuildings, setUserBuildings] = useState([]);
  const [userLocations, setUserLocations] = useState([]);

  // Custom hooks and memoized values
  const isFormValid = useMemo(() => {
    if (mode === MODE_TABS.CLAIM) {
      return formData.deviceId.trim() && 
             formData.deviceName.trim() && 
             formData.location &&
             deviceStatus.available &&
             !deviceStatus.checking;
    }
    return formData.deviceId.trim() && formData.deviceName.trim();
  }, [mode, formData, deviceStatus]);

  const getBuildingName = useCallback((locationId) => {
    const location = userLocations.find(loc => loc.id === locationId);
    return location?.buildingName || 'Unknown Building';
  }, [userLocations]);

  const getBuildingIdFromLocation = useCallback((locationId) => {
    const location = userLocations.find(loc => loc.id === locationId);
    return location?.buildingId || null;
  }, [userLocations]);

  // Initialize component data
  const initializeData = useCallback(async () => {
    try {
      setLoadingLocations(true);
      
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);
      
      console.log('🔍 Initializing add device for user:', userEmail, { isSystemAdmin: isAdmin });
      
      await fetchUserBuildingsAndLocations(isAdmin);
      
      if (isAdmin) {
        await fetchRegisteredDevices();
      }
      
    } catch (error) {
      console.error('Error initializing add device:', error);
      setError('Failed to load user data');
    } finally {
      setLoadingLocations(false);
    }
  }, [userEmail]);

  // Fetch user's accessible buildings and locations
  const fetchUserBuildingsAndLocations = useCallback(async (isAdmin) => {
    try {
      let buildings = [];
      let locations = [];
      
      if (isAdmin) {
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
        console.log('👤 Regular user - fetching accessible buildings and locations');
        
        const buildingRoles = await getUserBuildingRoles(userEmail);
        
        for (const [buildingId, role] of buildingRoles) {
          if (buildingId === 'SystemAdmin') continue;
          
          if (role === 'parent') {
            try {
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
      
      buildings.sort((a, b) => (a.buildingName || a.id).localeCompare(b.buildingName || b.id));
      locations.sort((a, b) => (a.locationName || a.id).localeCompare(b.locationName || b.id));
      
      setUserBuildings(buildings);
      setUserLocations(locations);
      
      console.log('🏢 Available buildings:', buildings.length);
      console.log('📍 Available locations:', locations.length);
      
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
  }, [userEmail]);

  // Fetch registered devices for admin
  const fetchRegisteredDevices = useCallback(async () => {
    try {
      const devicesSnapshot = await getDocs(collection(firestore, 'DEVICE'));
      const devicesList = devicesSnapshot.docs.map(deviceDoc => {
        const deviceData = deviceDoc.data();
        return {
          id: deviceDoc.id,
          ...deviceData,
          status: deviceData.Location ? 'claimed' : 'available'
        };
      });
      
      devicesList.sort((a, b) => {
        if (a.status === 'available' && b.status !== 'available') return -1;
        if (a.status !== 'available' && b.status === 'available') return 1;
        return a.id.localeCompare(b.id);
      });
      
      setRegisteredDevices(devicesList);
    } catch (error) {
      console.error('Error fetching registered devices:', error);
    }
  }, []);

  // Check device availability for claiming
  const checkDeviceStatus = useCallback(async (deviceId) => {
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
      
      if (deviceData.Location) {
        setDeviceStatus({
          checking: false,
          exists: true,
          available: false,
          message: 'Device Unavailable.'
        });
        return;
      }
      
      setDeviceStatus({
        checking: false,
        exists: true,
        available: true,
        message: 'Device available for claiming!'
      });
      
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
  }, []);

  // Handle form input changes
  const handleInputChange = useCallback(async (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (name === 'deviceId' && value.trim() && mode === MODE_TABS.CLAIM) {
      await checkDeviceStatus(value.trim());
    } else if (name === 'deviceId' && (!value.trim() || mode === MODE_TABS.REGISTER)) {
      setDeviceStatus(INITIAL_DEVICE_STATUS);
    }
  }, [mode, checkDeviceStatus]);

  // Handle mode switch (admin only)
  const handleModeSwitch = useCallback((newMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(false);
    setFormData(INITIAL_FORM_DATA);
    setDeviceStatus(INITIAL_DEVICE_STATUS);
  }, []);

  // Handle form submission
  const handleFormSubmit = useCallback(async () => {
    if (!formData.deviceId.trim()) {
      setError('Device ID is required');
      return;
    }
    
    if (!formData.deviceName.trim()) {
      setError('Device name is required');
      return;
    }

    if (mode === MODE_TABS.CLAIM) {
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
      
      if (mode === MODE_TABS.CLAIM) {
        await claimDevice(deviceId);
      } else {
        await registerDevice(deviceId);
      }
      
    } catch (error) {
      console.error('❌ Error processing device:', error);
      setError('Failed to process device: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [formData, mode, deviceStatus]);

  // Claim existing device
  const claimDevice = useCallback(async (deviceId) => {
    console.log('📱 Claiming device...');
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      Location: formData.location,
      DeviceName: formData.deviceName.trim(),
      DeviceDescription: formData.deviceDescription.trim() || '',
      DeviceType: formData.deviceType || 'Other'
    });
    
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await update(rtdbRef, {
      locationId: formData.location,
      lastSeen: new Date().toISOString()
    });
    
    console.log('✅ Device claimed successfully');
    setSuccess(true);

    try {
    // Get location and building names for notification
    const location = userLocations.find(loc => loc.id === formData.location);
    const locationName = location ? location.locationName : formData.location;
    const buildingName = location ? location.buildingName : 'Unknown Building';
    
    await notifyParentDeviceClaimed(
      userEmail,
      formData.deviceName.trim(),
      deviceId,
      locationName,
      buildingName
    );
    console.log('📢 Device claim notification sent to parent');
  } catch (notificationError) {
    console.error('❌ Failed to send device claim notification:', notificationError);
    // Don't fail the device claim if notification fails
  }
  
  setTimeout(() => {
    navigate(`/devices/detail/${deviceId}`, {
      state: {
        message: `Device "${formData.deviceName}" has been claimed successfully.`
      }
    });
  }, 1500);
}, [formData, navigate, userEmail, userLocations]);

  // Register new device with energy usage document
  // Register new device with notification
const registerDevice = useCallback(async (deviceId) => {
  console.log('📱 Registering new device...');
  
  const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
  if (deviceDoc.exists()) {
    setError('Device ID already exists.');
    setLoading(false);
    return;
  }
  
  const deviceData = {
    AssignedTo: [],
    DeviceDescription: formData.deviceDescription.trim() || '',
    DeviceName: formData.deviceName.trim(),
    DeviceType: formData.deviceType || 'Other',
    Location: formData.location || null
  };
  
  await setDoc(doc(firestore, 'DEVICE', deviceId), deviceData);
  
  const rtdbRef = ref(database, `Devices/${deviceId}`);
  await set(rtdbRef, {
    status: 'OFF',
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    locationId: formData.location || ''
  });

  // Create empty energy usage document for the device
  await createEnergyUsageDocument(deviceId);

  // Create empty energy usage document for the device
  await createEnergyUsageDocument(deviceId);
  
  // **NEW: Create notification for SystemAdmin**
  try {
    await notifyDeviceRegistered(
      formData.deviceName.trim(),
      deviceId,
      userEmail
    );
    console.log('📢 SystemAdmin notification sent for device registration');
  } catch (notificationError) {
    console.error('❌ Failed to send notification:', notificationError);
    // Don't fail the device registration if notification fails
  }

  if (isUserSystemAdmin) {
    try {
      await notifyAdminDeviceAdded(
        formData.deviceName.trim(),
        deviceId,
        userEmail
      );
      console.log('📢 Admin device addition notification sent');
    } catch (notificationError) {
      console.error('❌ Failed to send admin device addition notification:', notificationError);
      // Don't fail the device registration if notification fails
    }
  }
  
  setSuccess(true);
  await fetchRegisteredDevices();
  setFormData(INITIAL_FORM_DATA);
  
  setTimeout(() => setSuccess(null), 3000);
  console.log('✅ New device registered successfully');
}, [formData, fetchRegisteredDevices, userEmail, isUserSystemAdmin]);

  // NEW: Create empty energy usage document for new device
  const createEnergyUsageDocument = useCallback(async (deviceId) => {
    try {
      console.log(`📊 Creating energy usage structure for device ${deviceId}`);
      
      // Create today's date document in the new structure
      const today = new Date();
      const dateStr = formatDateForFirestore(today);
      
      // Create empty energy usage document at ENERGYUSAGE/{deviceId}/DailyUsage/{yyyy-mm-dd}
      await setDoc(doc(firestore, 'ENERGYUSAGE', deviceId, 'DailyUsage', dateStr), {
        usage: 0,
        //timestamp: new Date().toISOString()
      });
      
      console.log(`✅ Energy usage structure created for device ${deviceId} at DailyUsage/${dateStr}`);
    } catch (error) {
      console.error(`❌ Error creating energy usage structure:`, error);
      // Don't throw error as device registration was successful
    }
  }, []);

  // Format date for Firestore document ID (yyyy-mm-dd format)
  const formatDateForFirestore = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle device deletion (admin only)
  const handleDeleteDevice = useCallback(async (deviceId, deviceName, isClaimed) => {
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
      await deleteDoc(doc(firestore, 'DEVICE', deviceId));
      
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      await remove(rtdbRef);

      // NEW: Remove energy usage documents for the device
      await removeEnergyUsageDocuments(deviceId);
      
      setSuccess(`Device "${deviceName}" deleted successfully`);
      await fetchRegisteredDevices();
      
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (error) {
      console.error('Error deleting device:', error);
      setError('Failed to delete device: ' + error.message);
    }
  }, [fetchRegisteredDevices]);

  // NEW: Remove all energy usage documents for a device
  const removeEnergyUsageDocuments = useCallback(async (deviceId) => {
    try {
      console.log(`📊 Removing energy usage structure for device ${deviceId}`);
      
      // Get all daily usage documents for this device
      const dailyUsageSnapshot = await getDocs(collection(firestore, 'ENERGYUSAGE', deviceId, 'DailyUsage'));
      
      // Delete all daily usage documents
      const deletePromises = dailyUsageSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      console.log(`✅ Energy usage structure removed for device ${deviceId}`);
    } catch (error) {
      console.error(`❌ Error removing energy usage structure:`, error);
    }
  }, []);

  // Handle back navigation
  const handleBack = useCallback(() => {
    navigate('/devices');
  }, [navigate]);

  // Initialize on mount
  useEffect(() => {
    if (userEmail) {
      initializeData();
    } else {
      setError('User not authenticated');
      navigate('/login');
    }
  }, [userEmail, initializeData, navigate]);

  if (loadingLocations) {
    return <div className="loading">Loading available locations...</div>;
  }

  return (
    <div className="add-device">
      <DeviceHeader onBack={handleBack} isSystemAdmin={isUserSystemAdmin} />
      
      <ErrorSuccessMessages error={error} success={success} mode={mode} />
      
      {isUserSystemAdmin && (
        <AdminModeSelector 
          mode={mode}
          onModeSwitch={handleModeSwitch}
          onToggleDevicesList={() => setShowRegisteredDevices(!showRegisteredDevices)}
          showRegisteredDevices={showRegisteredDevices}
          devicesCount={registeredDevices.length}
        />
      )}
      
      {isUserSystemAdmin && showRegisteredDevices && (
        <RegisteredDevicesList 
          devices={registeredDevices}
          onDelete={handleDeleteDevice}
        />
      )}
      
      {!showRegisteredDevices && (
        <DeviceForm
          mode={mode}
          formData={formData}
          deviceStatus={deviceStatus}
          userBuildings={userBuildings}
          userLocations={userLocations}
          isUserSystemAdmin={isUserSystemAdmin}
          loading={loading}
          isFormValid={isFormValid}
          onInputChange={handleInputChange}
          onSubmit={handleFormSubmit}
          getBuildingName={getBuildingName}
        />
      )}
    </div>
  );
};

// Header component
const DeviceHeader = ({ onBack, isSystemAdmin }) => (
  <div className="device-header">
    <button className="back-button" onClick={onBack}>
      <MdArrowBack /> Back
    </button>
    <h2>
      <MdAdd /> {isSystemAdmin ? 'Device Management' : 'Claim Device'}
    </h2>
  </div>
);

// Error and success messages component
const ErrorSuccessMessages = ({ error, success, mode }) => (
  <>
    {error && <div className="error-message">{error}</div>}
    {success && (
      <div className="success-message">
        {mode === MODE_TABS.CLAIM 
          ? 'Device claimed successfully!' 
          : typeof success === 'string' ? success : 'Device registered successfully!'
        }
      </div>
    )}
  </>
);

// Admin mode selector component
const AdminModeSelector = ({ 
  mode, 
  onModeSwitch, 
  onToggleDevicesList, 
  showRegisteredDevices, 
  devicesCount 
}) => (
  <div className="admin-mode-selector">
    <div className="mode-tabs">
      <button
        className={`mode-tab ${mode === MODE_TABS.CLAIM ? 'active' : ''}`}
        onClick={() => onModeSwitch(MODE_TABS.CLAIM)}
      >
        Claim Device
      </button>
      <button
        className={`mode-tab ${mode === MODE_TABS.REGISTER ? 'active' : ''}`}
        onClick={() => onModeSwitch(MODE_TABS.REGISTER)}
      >
        Register New Device
      </button>
      <button
        className={`mode-tab ${showRegisteredDevices ? 'active' : ''}`}
        onClick={onToggleDevicesList}
      >
        View Registered Devices ({devicesCount})
      </button>
    </div>
  </div>
);

// Device form component
const DeviceForm = ({
  mode,
  formData,
  deviceStatus,
  userBuildings,
  userLocations,
  isUserSystemAdmin,
  loading,
  isFormValid,
  onInputChange,
  onSubmit,
  getBuildingName
}) => (
  <div className="device-form">
    <InfoBanner mode={mode} isUserSystemAdmin={isUserSystemAdmin} />
    
    <DeviceIdInput 
      mode={mode}
      value={formData.deviceId}
      deviceStatus={deviceStatus}
      loading={loading}
      onChange={onInputChange}
    />
    
    <FormField
      label="Device Name *"
      name="deviceName"
      type="input"
      value={formData.deviceName}
      placeholder="Enter descriptive device name"
      loading={loading}
      onChange={onInputChange}
      isValid={!!formData.deviceName}
    />
    
    <FormField
      label="Device Type"
      name="deviceType"
      type="select"
      value={formData.deviceType}
      options={DEVICE_TYPES}
      loading={loading}
      onChange={onInputChange}
    />
    
    <FormField
      label="Description"
      name="deviceDescription"
      type="textarea"
      value={formData.deviceDescription}
      placeholder="Enter device description (optional)"
      loading={loading}
      onChange={onInputChange}
      rows={3}
    />
    
    {mode === MODE_TABS.CLAIM && (
      <LocationSelector
        formData={formData}
        userBuildings={userBuildings}
        userLocations={userLocations}
        loading={loading}
        onChange={onInputChange}
        getBuildingName={getBuildingName}
        required
      />
    )}
    
    {mode === MODE_TABS.REGISTER && userLocations.length > 0 && (
      <LocationSelector
        formData={formData}
        userBuildings={userBuildings}
        userLocations={userLocations}
        loading={loading}
        onChange={onInputChange}
        getBuildingName={getBuildingName}
        required={false}
      />
    )}
    
    <SubmitButton
      mode={mode}
      loading={loading}
      isFormValid={isFormValid}
      onSubmit={onSubmit}
    />
  </div>
);



// Info banner component
const InfoBanner = ({ mode, isUserSystemAdmin }) => {
  const getBannerContent = () => {
    if (mode === MODE_TABS.CLAIM && !isUserSystemAdmin) {
      return {
        title: 'Device Claiming Process',
        description: 'Enter the device ID to claim ownership. Once you assign it to a location in your building, you will have control over the device.'
      };
    }
    
    if (mode === MODE_TABS.CLAIM && isUserSystemAdmin) {
      return {
        title: 'Claim Device (SystemAdmin)',
        description: 'Claim devices by assigning them to locations in buildings.'
      };
    }
    
    if (mode === MODE_TABS.REGISTER && isUserSystemAdmin) {
      return {
        title: 'Register New Device (SystemAdmin)',
        description: 'Register new devices in the system. An energy usage tracking document will be automatically created for the device.'
      };
    }
    
    return null;
  };

  const content = getBannerContent();
  
  if (!content) return null;

  return (
    <div className="owner-info-banner">
      <h4>
        <MdPerson /> {content.title}
      </h4>
      <p>{content.description}</p>
    </div>
  );
};

// Device ID input component
const DeviceIdInput = ({ mode, value, deviceStatus, loading, onChange }) => (
  <div className="form-group">
    <label>Device ID *</label>
    <div className="device-input-container">
      <input 
        type="text" 
        name="deviceId" 
        value={value} 
        onChange={onChange}
        placeholder={mode === MODE_TABS.REGISTER ? "Enter new device ID" : "Enter device ID"}
        disabled={loading}
        className={mode === MODE_TABS.CLAIM && deviceStatus.available ? 'input-valid' : ''}
      />
      {mode === MODE_TABS.CLAIM && deviceStatus.checking && (
        <span className="checking-message">Checking...</span>
      )}
      {mode === MODE_TABS.CLAIM && value && !deviceStatus.checking && (
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
    {mode === MODE_TABS.CLAIM && deviceStatus.message && (
      <small style={{ 
        color: deviceStatus.available ? '#16a34a' : '#dc2626',
        fontWeight: '500'
      }}>
        {deviceStatus.message}
      </small>
    )}
  </div>
);

// Generic form field component
const FormField = ({ 
  label, 
  name, 
  type, 
  value, 
  placeholder, 
  loading, 
  onChange, 
  isValid, 
  options, 
  rows 
}) => (
  <div className="form-group">
    <label>{label}</label>
    {type === 'select' ? (
      <select 
        name={name} 
        value={value} 
        onChange={onChange}
        disabled={loading}
      >
        {options?.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ) : type === 'textarea' ? (
      <textarea 
        name={name} 
        value={value} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={loading}
        rows={rows}
      />
    ) : (
      <input 
        type="text" 
        name={name} 
        value={value} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={loading}
        className={isValid ? 'input-valid' : ''}
      />
    )}
  </div>
);

// Location selector component
const LocationSelector = ({ 
  formData, 
  userBuildings, 
  userLocations, 
  loading, 
  onChange, 
  getBuildingName, 
  required 
}) => (
  <div className="form-group">
    <label>
      <MdLocationOn /> Location {required ? '*' : '(Optional)'}
    </label>
    <select 
      name="location" 
      value={formData.location} 
      onChange={onChange}
      disabled={loading}
      className={formData.location ? 'input-valid' : ''}
    >
      <option value="">
        {required ? 'Select location' : 'No location (available for claiming)'}
      </option>
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
);

// Submit button component
const SubmitButton = ({ mode, loading, isFormValid, onSubmit }) => (
  <button 
    className="save-button"
    onClick={onSubmit}
    disabled={loading || !isFormValid}
  >
    <MdDevices /> 
    {loading ? 
      (mode === MODE_TABS.CLAIM ? 'Claiming Device...' : 'Registering Device...') : 
      (mode === MODE_TABS.CLAIM ? 'Claim Device' : 'Register Device')
    }
  </button>
);

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
          <DeviceCard 
            key={device.id} 
            device={device} 
            onDelete={onDelete} 
          />
        ))}
      </div>
    )}
  </div>
);

// Device card component for registered devices list
const DeviceCard = ({ device, onDelete }) => (
  <div className={`device-card ${device.status}`}>
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
);

export default AddDevice;