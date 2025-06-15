// src/components/Devices/DeviceDetail.js - Clean Fixed Version

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { firestore, database } from '../../services/firebase';
import automationService from '../../services/automationService';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { ref, get, update, remove } from 'firebase/database';
import { 
  MdArrowBack, 
  MdEdit, 
  MdDelete, 
  MdSave, 
  MdCancel, 
  MdLocationOn,
  MdDevices,
  MdBusiness,
  MdPeople,
  MdPersonAdd,
  MdAdd,
  MdBolt
} from 'react-icons/md';
import TabPanel from '../common/TabPanel';
import EnergyChart from '../common/EnergyChart';
import { 
  isSystemAdmin, 
  getUserRoleInBuilding, 
  getUserBuildingRoles 
} from '../../utils/helpers';
import './DeviceDetail.css';
import DeviceAutomationTab from './DeviceAutomationTab';
import { notifyDeviceDeleted, notifySystemAdminDeviceDeleted } from '../../services/notificationService';

// Device types options
const DEVICE_TYPES = [
  { value: '', label: 'Select device type' },
  { value: 'Light', label: 'Light' },
  { value: 'Fan', label: 'Fan' },
  { value: 'AC', label: 'Air Conditioner' },
  { value: 'Other', label: 'Other' }
];

const DeviceDetail = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail') || '';
  
  // Core state
  const [device, setDevice] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // User permissions
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [userRoleInBuilding, setUserRoleInBuilding] = useState('user');
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canAssignUsers, setCanAssignUsers] = useState(false);
  const [canViewSensitiveInfo, setCanViewSensitiveInfo] = useState(true);
  
  // Assignment state
  const [buildingChildren, setBuildingChildren] = useState([]);
  const [assignedChildren, setAssignedChildren] = useState([]);
  const [availableChildren, setAvailableChildren] = useState([]);
  
  // Location data for moving devices
  const [allUserBuildings, setAllUserBuildings] = useState([]);
  const [allUserLocations, setAllUserLocations] = useState([]);
  
  // Edit form data
  const [editData, setEditData] = useState({
    DeviceName: '',
    DeviceDescription: '',
    DeviceType: '',
    Location: ''
  });

  // Memoized values
  const locationName = useMemo(() => {
    if (!device?.Location) return 'No Location';
    return device?.locationDetails?.locationName || device.Location;
  }, [device]);

  const buildingName = useMemo(() => {
    if (!device?.Location) return 'No Building';
    return device?.locationDetails?.buildingName || 'Unknown Building';
  }, [device]);

  // Helper function to format Firestore timestamps
  const formatTimestamp = useCallback((timestamp) => {
    if (!timestamp) return 'Unknown';
    
    try {
      let date;
      if (timestamp && typeof timestamp.toDate === 'function') {
        // Firestore Timestamp object
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        // JavaScript Date object
        date = timestamp;
      } else if (typeof timestamp === 'string') {
        // ISO string (fallback for compatibility)
        date = new Date(timestamp);
      } else {
        return 'Unknown';
      }
      
      return date.toLocaleString();
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Unknown';
    }
  }, []);

  // Check if user has access to this device
  const checkDeviceAccess = useCallback(async (deviceData) => {
    try {
      console.log('🔐 Checking device access for user:', userEmail);
      
      const isAdmin = await isSystemAdmin(userEmail);
      if (isAdmin) {
        console.log('✅ SystemAdmin access granted');
        return true;
      }
      
      // If device has no location (unclaimed), only SystemAdmin can access
      if (!deviceData.Location) {
        console.log('❌ Device unclaimed - only SystemAdmin access allowed');
        return false;
      }
      
      // Get the building from device location
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
      if (!locationDoc.exists()) {
        console.log('❌ Device location not found');
        return false;
      }
      
      const locationData = locationDoc.data();
      const buildingId = locationData.Building;
      
      // Check if user has role in the building
      const roleInBuilding = await getUserRoleInBuilding(userEmail, buildingId);
      
      if (roleInBuilding === 'parent') {
        console.log('✅ Parent access granted to building device');
        return true;
      }
      
      if (roleInBuilding === 'children') {
        // Check if child is assigned to this device
        const assignedTo = deviceData.AssignedTo || [];
        const hasAccess = assignedTo.includes(userEmail);
        console.log(`${hasAccess ? '✅' : '❌'} Child access ${hasAccess ? 'granted' : 'denied'} - device assignment check`);
        return hasAccess;
      }
      
      console.log('❌ No access - user has no role in device building');
      return false;
      
    } catch (error) {
      console.error('Error checking device access:', error);
      return false;
    }
  }, [userEmail]);

  // Enrich device data with location and status information
  const enrichDeviceData = useCallback(async (currentDeviceId, deviceData) => {
    const enrichedDevice = { id: currentDeviceId, ...deviceData };
    
    // Fetch location details if device has location
    if (deviceData.Location) {
      try {
        const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
        if (locationDoc.exists()) {
          const locationData = locationDoc.data();
          
          // Fetch building name for display
          let buildingName = 'Unknown Building';
          if (locationData.Building) {
            try {
              const buildingDoc = await getDoc(doc(firestore, 'BUILDING', locationData.Building));
              if (buildingDoc.exists()) {
                const buildingData = buildingDoc.data();
                buildingName = buildingData.BuildingName || locationData.Building;
              }
            } catch (buildingError) {
              console.error('Error fetching building details:', buildingError);
            }
          }
          
          enrichedDevice.locationDetails = {
            id: deviceData.Location,
            locationName: locationData.LocationName || deviceData.Location,
            building: locationData.Building || 'Unknown Building',
            buildingName: buildingName
          };
        }
      } catch (locationError) {
        console.error('Error fetching location details:', locationError);
      }
    }
    
    // Get device status from RTDB
    try {
      const rtdbRef = ref(database, `Devices/${currentDeviceId}`);
      const rtdbSnapshot = await get(rtdbRef);
      
      if (rtdbSnapshot.exists()) {
        enrichedDevice.status = rtdbSnapshot.val().status || 'OFF';
        enrichedDevice.locationId = rtdbSnapshot.val().locationId || '';
      } else {
        enrichedDevice.status = 'OFF';
        enrichedDevice.locationId = '';
      }
    } catch (rtdbError) {
      console.error('Error getting RTDB status:', rtdbError);
      enrichedDevice.status = 'OFF';
      enrichedDevice.locationId = '';
    }
    
    return enrichedDevice;
  }, []);

  // Calculate user permissions for the device
  const calculatePermissions = useCallback(async (isAdmin, deviceData) => {
    let canEditDevice = isAdmin;
    let canDeleteDevice = isAdmin;
    let canAssignDevice = false;
    let canViewSensitiveInfo = isAdmin;
    let roleInDeviceBuilding = 'user';
    
    if (deviceData?.Location && deviceData?.locationDetails) {
      const buildingId = deviceData.locationDetails.building;
      roleInDeviceBuilding = await getUserRoleInBuilding(userEmail, buildingId);
      
      if (roleInDeviceBuilding === 'parent') {
        canEditDevice = true;
        canDeleteDevice = true;
        canAssignDevice = true;
        canViewSensitiveInfo = true;
      } else if (roleInDeviceBuilding === 'children') {
        // Children can't see sensitive info like device ID and assigned users
        canViewSensitiveInfo = false;
      }
    }
    
    return {
      canEditDevice,
      canDeleteDevice,
      canAssignDevice,
      canViewSensitiveInfo,
      roleInDeviceBuilding,
      isSystemAdmin: isAdmin
    };
  }, [userEmail]);

  // Fetch user's buildings and locations for device relocation
  const fetchUserBuildingsAndLocations = useCallback(async () => {
    try {
      console.log('🏢 Fetching user buildings and locations...');
      
      let userBuildings = [];
      let userLocations = [];
      
      if (isUserSystemAdmin) {
        const buildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
        userBuildings = buildingsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          buildingName: doc.data().BuildingName || doc.id
        }));
        
        const locationsSnapshot = await getDocs(collection(firestore, 'LOCATION'));
        userLocations = locationsSnapshot.docs.map(doc => {
          const locationData = doc.data();
          const building = userBuildings.find(b => b.id === locationData.Building);
          return {
            id: doc.id,
            ...locationData,
            locationName: locationData.LocationName || doc.id,
            buildingId: locationData.Building,
            buildingName: building ? building.buildingName : 'Unknown Building'
          };
        });
      } else {
        const buildingRoles = await getUserBuildingRoles(userEmail);
        
        for (const [buildingId, role] of buildingRoles) {
          if (buildingId === 'SystemAdmin') continue;
          
          if (role === 'parent') {
            const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
            if (buildingDoc.exists()) {
              const buildingData = buildingDoc.data();
              userBuildings.push({
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
            
            userLocations.push(...buildingLocations);
          }
        }
      }
      
      setAllUserBuildings(userBuildings);
      setAllUserLocations(userLocations);
      
      console.log('🏢 User buildings:', userBuildings.length);
      console.log('📍 User locations:', userLocations.length);
      
    } catch (error) {
      console.error('Error fetching user buildings and locations:', error);
    }
  }, [isUserSystemAdmin, userEmail]);

  // Fetch children users from the device's building
  const fetchBuildingChildren = useCallback(async (buildingId, currentAssignedTo = []) => {
    try {
      console.log('👶 Fetching children from building:', buildingId);
      
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId),
        where('Role', '==', 'children')
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      const allChildren = [];
      for (const userBuilding of userBuildingSnapshot.docs) {
        const userData = userBuilding.data();
        const userDoc = await getDoc(doc(firestore, 'USER', userData.User));
        
        if (userDoc.exists()) {
          allChildren.push({
            id: userData.User,
            ...userDoc.data()
          });
        }
      }
      
      const assigned = allChildren.filter(child => currentAssignedTo.includes(child.id));
      const available = allChildren.filter(child => !currentAssignedTo.includes(child.id));
      
      setBuildingChildren(allChildren);
      setAssignedChildren(assigned);
      setAvailableChildren(available);
      
      console.log('👶 Building children loaded:', {
        total: allChildren.length,
        assigned: assigned.length,
        available: available.length
      });
      
    } catch (error) {
      console.error('Error fetching building children:', error);
    }
  }, []);

  // Device automation handler
  const handleDeviceAutomation = useCallback(async (automationConfig) => {
    try {
      console.log('📱 Device automation applied:', automationConfig);
      
      // Apply automation to device in RTDB
      await automationService.applyDeviceAutomation(deviceId, automationConfig);
      
      // Update device in Firestore with automation settings
      const deviceRef = doc(firestore, 'DEVICE', deviceId);
      await updateDoc(deviceRef, {
        automationConfig: automationConfig,
        lastSeen: serverTimestamp()
      });
      
      // Show success message
      if (automationConfig.automationType === 'custom-schedule') {
        setSuccess(`Device schedule "${automationConfig.automationTitle}" applied successfully`);
      } else {
        setSuccess(`Device automation "${automationConfig.automationTitle}" applied successfully`);
      }
      
      setTimeout(() => setSuccess(null), 5000);
      
      console.log('✅ Device automation state saved');
      
    } catch (error) {
      console.error('❌ Error applying device automation:', error);
      setError('Failed to apply device automation: ' + error.message);
      setTimeout(() => setError(null), 5000);
    }
  }, [deviceId]);

  // Fetch device and permission data
  const fetchDeviceData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching device details for:', deviceId);
      
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);
      
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
      if (!deviceDoc.exists()) {
        setError('Device not found');
        setLoading(false);
        return;
      }
      
      const deviceData = deviceDoc.data();
      
      // Check device access before proceeding
      const hasAccess = await checkDeviceAccess(deviceData);
      if (!hasAccess) {
        setError('You do not have access to this device');
        setLoading(false);
        return;
      }
      
      const enrichedDevice = await enrichDeviceData(deviceId, deviceData);
      setDevice(enrichedDevice);
      setEditData({
        DeviceName: enrichedDevice.DeviceName || '',
        DeviceDescription: enrichedDevice.DeviceDescription || '',
        DeviceType: enrichedDevice.DeviceType || '',
        Location: enrichedDevice.Location || ''
      });
      
      console.log('📱 Device data loaded:', enrichedDevice);
      
      const permissions = await calculatePermissions(isAdmin, enrichedDevice);
      setUserRoleInBuilding(permissions.roleInDeviceBuilding);
      setCanEdit(permissions.canEditDevice);
      setCanDelete(permissions.canDeleteDevice);
      setCanAssignUsers(permissions.canAssignDevice);
      setCanViewSensitiveInfo(permissions.canViewSensitiveInfo);
      
      console.log('🔐 Permissions:', permissions);
      
      if (permissions.canEditDevice) {
        await fetchUserBuildingsAndLocations();
      }
      
      if (permissions.canAssignDevice && enrichedDevice.Location && enrichedDevice.locationDetails) {
        await fetchBuildingChildren(enrichedDevice.locationDetails.building, enrichedDevice.AssignedTo || []);
      }
      
    } catch (error) {
      console.error('❌ Error fetching device data:', error);
      setError('Failed to load device data');
    } finally {
      setLoading(false);
    }
  }, [deviceId, userEmail, checkDeviceAccess, enrichDeviceData, calculatePermissions, fetchUserBuildingsAndLocations, fetchBuildingChildren]);

  // Handle user assignment
  const handleAssignUser = useCallback(async (userId) => {
    try {
      setError(null);
      
      console.log('➕ Assigning user to device:', userId);
      
      const currentAssignedTo = device?.AssignedTo || [];
      if (currentAssignedTo.includes(userId)) {
        setError('User is already assigned to this device');
        return;
      }
      
      const updatedAssignedTo = [...currentAssignedTo, userId];
      
      await updateDoc(doc(firestore, 'DEVICE', deviceId), {
        AssignedTo: updatedAssignedTo,
        lastSeen: serverTimestamp()
      });
      
      setDevice(prev => ({
        ...prev,
        AssignedTo: updatedAssignedTo
      }));
      
      const userToMove = availableChildren.find(child => child.id === userId);
      if (userToMove) {
        setAssignedChildren(prev => [...prev, userToMove]);
        setAvailableChildren(prev => prev.filter(child => child.id !== userId));
      }
      
      setSuccess('User assigned successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      console.log('✅ User assigned successfully');
      
    } catch (error) {
      console.error('❌ Error assigning user:', error);
      setError('Failed to assign user to device');
    }
  }, [device?.AssignedTo, deviceId, availableChildren]);

  // Handle user unassignment
  const handleUnassignUser = useCallback(async (userId) => {
    try {
      setError(null);
      
      console.log('➖ Unassigning user from device:', userId);
      
      const currentAssignedTo = device?.AssignedTo || [];
      const updatedAssignedTo = currentAssignedTo.filter(id => id !== userId);
      
      await updateDoc(doc(firestore, 'DEVICE', deviceId), {
        AssignedTo: updatedAssignedTo,
        lastSeen: serverTimestamp()
      });
      
      setDevice(prev => ({
        ...prev,
        AssignedTo: updatedAssignedTo
      }));
      
      const userToMove = assignedChildren.find(child => child.id === userId);
      if (userToMove) {
        setAvailableChildren(prev => [...prev, userToMove]);
        setAssignedChildren(prev => prev.filter(child => child.id !== userId));
      }
      
      setSuccess('User unassigned successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      console.log('✅ User unassigned successfully');
      
    } catch (error) {
      console.error('❌ Error unassigning user:', error);
      setError('Failed to unassign user from device');
    }
  }, [device?.AssignedTo, deviceId, assignedChildren]);

  // Handle edit mode toggle
  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      setEditData({
        DeviceName: device?.DeviceName || '',
        DeviceDescription: device?.DeviceDescription || '',
        DeviceType: device?.DeviceType || '',
        Location: device?.Location || ''
      });
      setIsEditing(false);
      setError(null);
    } else {
      setIsEditing(true);
    }
  }, [isEditing, device]);

  // Handle form input changes
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setEditData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  // Handle save changes
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      
      console.log('💾 Saving device changes...');
      
      if (!editData.DeviceName.trim()) {
        setError('Device name is required');
        setSaving(false);
        return;
      }
      
      const updateData = {
        AssignedTo: device.AssignedTo || [],
        DeviceDescription: editData.DeviceDescription.trim(),
        DeviceName: editData.DeviceName.trim(),
        DeviceType: editData.DeviceType.trim(),
        Location: editData.Location || null,
        lastSeen: serverTimestamp()
      };
      
      await updateDoc(doc(firestore, 'DEVICE', deviceId), updateData);
      
      // Update RTDB if location changed
      if (updateData.Location !== device?.Location) {
        const rtdbRef = ref(database, `Devices/${deviceId}`);
        await update(rtdbRef, {
          locationId: updateData.Location || ''
        });
      }
      
      setDevice(prev => ({
        ...prev,
        ...updateData
      }));
      
      setIsEditing(false);
      setSuccess('Device updated successfully');
      
      setTimeout(() => setSuccess(null), 3000);
      
      console.log('✅ Device updated successfully');
      
    } catch (error) {
      console.error('❌ Error saving device:', error);
      setError('Failed to save device changes');
    } finally {
      setSaving(false);
    }
  }, [editData, device, deviceId]);

  // Handle device deletion
  const handleDelete = useCallback(async () => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete device "${device?.DeviceName || device?.id}"?\n\n` +
      `This action cannot be undone and will:\n` +
      `• Remove the device from Firestore\n` +
      `• Remove the device from Real-time Database\n` +
      `• Remove all user assignments\n\n` +
      `Type "DELETE" to confirm:`
    );
    
    if (!confirmDelete) return;
    
    const confirmation = window.prompt('Type "DELETE" to confirm device deletion:');
    if (confirmation !== 'DELETE') {
      alert('Deletion cancelled - confirmation text did not match');
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      
      console.log('🗑️ Deleting device...');
      
      // Send notifications before deleting the device
      if (device?.Location && device?.locationDetails) {
        const buildingId = device.locationDetails.building;
        const buildingName = device.locationDetails.buildingName;
        
        try {
          await notifySystemAdminDeviceDeleted(
            device.DeviceName || device.id,
            device.id,
            buildingId,
            buildingName,
            userEmail
          );
          console.log('📢 SystemAdmin device deletion notifications sent to building parents');
        } catch (notificationError) {
          console.error('❌ Failed to send SystemAdmin device deletion notifications:', notificationError);
        }
      }
      
      // Notify SystemAdmin about the deletion
      try {
        await notifyDeviceDeleted(
          device?.DeviceName || device?.id,
          device?.id,
          userEmail
        );
        console.log('📢 SystemAdmin notification sent about device deletion');
      } catch (notificationError) {
        console.error('❌ Failed to send SystemAdmin notification:', notificationError);
      }
      
      // Delete from Firestore
      await deleteDoc(doc(firestore, 'DEVICE', deviceId));
      
      // Delete from Real-time Database
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      await remove(rtdbRef);
      
      console.log('✅ Device deleted successfully');
      
      navigate('/devices', { 
        state: { 
          message: `Device "${device?.DeviceName || device?.id}" has been deleted successfully` 
        }
      });
      
    } catch (error) {
      console.error('❌ Error deleting device:', error);
      setError('Failed to delete device: ' + error.message);
    } finally {
      setDeleting(false);
    }
  }, [device, deviceId, navigate, userEmail]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    navigate('/devices');
  }, [navigate]);

  // Initialize on mount
  useEffect(() => {
    if (deviceId && userEmail) {
      fetchDeviceData();
    }
  }, [deviceId, userEmail, fetchDeviceData]);

  if (loading) {
    return <div className="loading">Loading device details...</div>;
  }

  if (error && !device) {
    return (
      <div className="device-detail">
        <DeviceHeader 
          onBack={handleBack} 
          deviceName="Device Detail" 
        />
        <div className="error-message">{error}</div>
      </div>
    );
  }

  const tabs = [
    {
      label: 'Device Info',
      content: (
        <DeviceInfoTab
          device={device}
          editData={editData}
          isEditing={isEditing}
          saving={saving}
          deleting={deleting}
          canEdit={canEdit}
          canDelete={canDelete}
          canViewSensitiveInfo={canViewSensitiveInfo}
          allUserBuildings={allUserBuildings}
          allUserLocations={allUserLocations}
          error={error}
          success={success}
          locationName={locationName}
          buildingName={buildingName}
          formatTimestamp={formatTimestamp}
          onEditToggle={handleEditToggle}
          onInputChange={handleInputChange}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )
    }
  ];

  if (canAssignUsers && device.Location) {
    tabs.push({
      label: 'Assign Device',
      content: (
        <AssignmentTab
          assignedChildren={assignedChildren}
          availableChildren={availableChildren}
          buildingChildren={buildingChildren}
          error={error}
          success={success}
          onAssignUser={handleAssignUser}
          onUnassignUser={handleUnassignUser}
        />
      )
    });
  }

  // Add Energy Usage tab if device has location (claimed)
  if (device.Location) {
    tabs.push({
      label: 'Energy Usage',
      content: (
        <EnergyUsageTab
          deviceId={deviceId}
          deviceName={device?.DeviceName || device?.id}
          locationName={locationName}
          buildingName={buildingName}
        />
      )
    });
  }

  if (device.Location) {
    tabs.push({
      label: 'Automation',
      content: (
        <DeviceAutomationTab
          device={device}
          userEmail={userEmail}
          onAutomationApply={handleDeviceAutomation}
        />
      )
    });
  }

  return (
    <div className="device-detail">
      <DeviceHeader 
        onBack={handleBack} 
        deviceName={device?.DeviceName || device?.id || 'Device Detail'} 
      />
      <TabPanel tabs={tabs} />
    </div>
  );
};

// Component definitions
const DeviceHeader = ({ onBack, deviceName }) => (
  <div className="detail-header">
    <button className="back-button" onClick={onBack}>
      <MdArrowBack /> Back
    </button>
    <h2>
      <MdDevices className="header-icon" />
      {deviceName}
    </h2>
  </div>
);

const DeviceInfoTab = ({
  device,
  editData,
  isEditing,
  saving,
  deleting,
  canEdit,
  canDelete,
  canViewSensitiveInfo,
  allUserBuildings,
  allUserLocations,
  error,
  success,
  locationName,
  buildingName,
  formatTimestamp,
  onEditToggle,
  onInputChange,
  onSave,
  onDelete
}) => (
  <div className="device-info-tab">
    {error && <div className="error-message">{error}</div>}
    {success && <div className="success-message">{success}</div>}
    
    {(canEdit || canDelete) && (
      <DeviceActions
        canEdit={canEdit}
        canDelete={canDelete}
        isEditing={isEditing}
        saving={saving}
        deleting={deleting}
        onEditToggle={onEditToggle}
        onSave={onSave}
        onDelete={onDelete}
      />
    )}
    
    <DeviceInfoForm
      device={device}
      editData={editData}
      isEditing={isEditing}
      saving={saving}
      canEdit={canEdit}
      canViewSensitiveInfo={canViewSensitiveInfo}
      allUserBuildings={allUserBuildings}
      allUserLocations={allUserLocations}
      locationName={locationName}
      buildingName={buildingName}
      formatTimestamp={formatTimestamp}
      onInputChange={onInputChange}
    />
  </div>
);

const DeviceActions = ({
  canEdit,
  canDelete,
  isEditing,
  saving,
  deleting,
  onEditToggle,
  onSave,
  onDelete
}) => (
  <div className="device-actions">
    {canEdit && (
      <>
        {!isEditing ? (
          <button className="edit-button" onClick={onEditToggle}>
            <MdEdit /> Edit Device
          </button>
        ) : (
          <div className="edit-actions">
            <button 
              className="save-button" 
              onClick={onSave}
              disabled={saving}
            >
              <MdSave /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button 
              className="cancel-button" 
              onClick={onEditToggle}
              disabled={saving}
            >
              <MdCancel /> Cancel
            </button>
          </div>
        )}
      </>
    )}
    
    {canDelete && !isEditing && (
      <button 
        className="delete-button" 
        onClick={onDelete}
        disabled={deleting}
      >
        <MdDelete /> {deleting ? 'Deleting...' : 'Delete Device'}
      </button>
    )}
  </div>
);

const DeviceInfoForm = ({
  device,
  editData,
  isEditing,
  saving,
  canEdit,
  canViewSensitiveInfo,
  allUserBuildings,
  allUserLocations,
  locationName,
  buildingName,
  formatTimestamp,
  onInputChange
}) => (
  <div className="device-info-form">
    {/* Only show Device ID to users who can view sensitive info */}
    {canViewSensitiveInfo && (
      <InfoField label="Device ID" value={device?.id || ''} className="device-id" />
    )}
    
    <EditableField
      label="Device Name *"
      name="DeviceName"
      type="input"
      value={isEditing ? editData.DeviceName : (device?.DeviceName || 'Unnamed Device')}
      placeholder="Enter device name"
      isEditing={isEditing}
      disabled={saving}
      isValid={!!editData.DeviceName?.trim()}
      onChange={onInputChange}
    />
    
    <EditableField
      label="Description"
      name="DeviceDescription"
      type="textarea"
      value={isEditing ? editData.DeviceDescription : (device?.DeviceDescription || 'No description')}
      placeholder="Enter device description (optional)"
      isEditing={isEditing}
      disabled={saving}
      rows={3}
      onChange={onInputChange}
    />
    
    <EditableField
      label="Device Type"
      name="DeviceType"
      type="select"
      value={isEditing ? editData.DeviceType : (device?.DeviceType || 'Unknown')}
      options={DEVICE_TYPES}
      isEditing={isEditing}
      disabled={saving}
      onChange={onInputChange}
    />
    
    <LocationField
      device={device}
      editData={editData}
      isEditing={isEditing}
      canEdit={canEdit}
      saving={saving}
      allUserBuildings={allUserBuildings}
      allUserLocations={allUserLocations}
      locationName={locationName}
      buildingName={buildingName}
      onChange={onInputChange}
    />
    
    <InfoField 
      label="Status" 
      value={device?.status || 'OFF'}
      className={`device-status ${device?.status === 'ON' ? 'status-on' : 'status-off'}`}
    />
    
    {device?.lastSeen && (
      <InfoField 
        label="Last Seen" 
        value={formatTimestamp(device.lastSeen)} 
      />
    )}
    
    {device?.createdAt && canViewSensitiveInfo && (
      <InfoField 
        label="Created At" 
        value={formatTimestamp(device.createdAt)} 
      />
    )}
    
    {device?.onSince && device?.status === 'ON' && (
      <InfoField 
        label="On Since" 
        value={formatTimestamp(device.onSince)}
        className="runtime-info"
      />
    )}
    
    {device?.warningCount > 0 && canViewSensitiveInfo && (
      <InfoField 
        label="Runtime Warnings" 
        value={`${device.warningCount} warning(s) sent`}
        className="warning-info"
      />
    )}
    
    {/* Only show Assigned To info to users who can view sensitive info */}
    {canViewSensitiveInfo && device?.AssignedTo && device.AssignedTo.length > 0 && (
      <div className="info-group">
        <label>Assigned To</label>
        <div className="assigned-users">
          {device.AssignedTo.map((userEmail, index) => (
            <span key={index} className="assigned-user">
              {userEmail}
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
);

// Helper components
const InfoField = ({ label, value, className = '' }) => (
  <div className="info-group">
    <label>{label}</label>
    <p className={className}>{value}</p>
  </div>
);

const EditableField = ({
  label,
  name,
  type,
  value,
  placeholder,
  isEditing,
  disabled,
  isValid,
  options,
  rows,
  onChange
}) => (
  <div className="info-group">
    <label>{label}</label>
    {isEditing ? (
      type === 'select' ? (
        <select
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
        >
          {options.map(option => (
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
          disabled={disabled}
          rows={rows}
        />
      ) : (
        <input
          type="text"
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={isValid ? 'input-valid' : ''}
        />
      )
    ) : (
      <p>{value}</p>
    )}
  </div>
);

const LocationField = ({
  device,
  editData,
  isEditing,
  canEdit,
  saving,
  allUserBuildings,
  allUserLocations,
  locationName,
  buildingName,
  onChange
}) => (
  <div className="info-group">
    <label>
      Location 
      {canEdit && isEditing && (
        <span className="ownership-note">
          (You can move this device to any location in your buildings)
        </span>
      )}
    </label>
    {isEditing ? (
      <select
        name="Location"
        value={editData.Location}
        onChange={onChange}
        disabled={saving}
      >
        <option value="">No Location (unclaimed)</option>
        {allUserBuildings.map(building => (
          <optgroup key={building.id} label={building.buildingName || building.id}>
            {allUserLocations
              .filter(loc => loc.buildingId === building.id)
              .map(location => (
                <option key={location.id} value={location.id}>
                  {location.locationName || location.id}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    ) : (
      <div className="location-display">
        <p>
          <MdLocationOn className="location-icon" />
          {locationName}
        </p>
        <p className="building-info">
          <MdBusiness className="building-icon" />
          {buildingName}
        </p>
      </div>
    )}
  </div>
);

const AssignmentTab = ({
  assignedChildren,
  availableChildren,
  buildingChildren,
  error,
  success,
  onAssignUser,
  onUnassignUser
}) => (
  <div className="device-assignment-tab">
    {error && <div className="error-message">{error}</div>}
    {success && <div className="success-message">{success}</div>}
    
    <div className="assignment-info-banner">
      <h4>
        <MdPeople /> Device Assignment
      </h4>
      <p>
        Assign this device to children in the building. Only assigned children will be able to see and control this device.
      </p>
    </div>
    
    <AssignmentSection
      title="Assigned Children"
      icon={<MdPeople />}
      children={assignedChildren}
      count={assignedChildren.length}
      buttonIcon={<MdDelete />}
      buttonClass="unassign-btn"
      buttonTitle="Remove access to this device"
      onButtonClick={onUnassignUser}
      emptyMessage="No children assigned to this device yet."
    />
    
    <AssignmentSection
      title="Available Children"
      icon={<MdPersonAdd />}
      children={availableChildren}
      count={availableChildren.length}
      buttonIcon={<MdAdd />}
      buttonClass="assign-btn"
      buttonTitle="Give access to this device"
      onButtonClick={onAssignUser}
      emptyMessage={
        buildingChildren.length === 0 
          ? 'No children found in this building.' 
          : 'All children in this building are already assigned to this device.'
      }
      isAvailable
    />
  </div>
);

const AssignmentSection = ({
  title,
  icon,
  children,
  count,
  buttonIcon,
  buttonClass,
  buttonTitle,
  onButtonClick,
  emptyMessage,
  isAvailable = false
}) => (
  <div className="assignment-section">
    <div className="assignment-header">
      <h3>{icon} {title} ({count})</h3>
    </div>
    
    {children.length > 0 ? (
      <div className="children-list">
        {children.map(child => (
          <div key={child.id} className={`child-item ${isAvailable ? 'available' : ''}`}>
            <div className="child-info">
              <div className="child-name">{child.Name || 'Unnamed'}</div>
              <div className="child-details">
                <span>Email: {child.Email || child.id}</span>
                {child.ContactNo && <span>Contact: {child.ContactNo}</span>}
              </div>
            </div>
            <button
              className={buttonClass}
              onClick={() => onButtonClick(child.id)}
              title={buttonTitle}
            >
              {buttonIcon}
            </button>
          </div>
        ))}
      </div>
    ) : (
      <div className="no-assignments">
        <p>{emptyMessage}</p>
      </div>
    )}
  </div>
);

const EnergyUsageTab = ({ deviceId, deviceName, locationName, buildingName }) => (
  <div className="energy-usage-tab">
    <div className="energy-info-banner">
      <h4>
        <MdBolt /> Energy Usage Analytics
      </h4>
      <p>
        Monitor energy consumption for <strong>{deviceName}</strong> located in <strong>{locationName}</strong>, <strong>{buildingName}</strong>.
      </p>
    </div>
    
    <EnergyChart
      deviceId={deviceId}
      title={`Energy Usage - ${deviceName}`}
      showControls={true}
      defaultFilter="week"
      height={350}
    />
  </div>
);

export default DeviceDetail;