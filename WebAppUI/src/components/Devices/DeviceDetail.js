// src/components/Devices/DeviceDetail.js - Simplified without Owner concept
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { firestore, database } from '../../services/firebase';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs 
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
  MdWarning,
  MdPeople,
  MdPersonAdd,
  MdAdd
} from 'react-icons/md';
import TabPanel from '../common/TabPanel';
import { 
  isSystemAdmin, 
  getUserRoleInBuilding, 
  getUserBuildingRoles 
} from '../../utils/helpers';
import './DeviceDetail.css';

const DeviceDetail = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  
  const [device, setDevice] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
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
  
  const userEmail = localStorage.getItem('userEmail') || '';

  // Fetch children users from the device's building
  const fetchBuildingChildren = async (buildingId, currentAssignedTo = []) => {
    try {
      console.log('👶 Fetching children from building:', buildingId);
      
      // Get all children in the device's building
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId),
        where('Role', '==', 'children')
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      // Get user details for each child
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
      
      // Separate assigned and available children
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
  };

  // Handle assigning user to device
  const handleAssignUser = async (userId) => {
    try {
      setError(null);
      
      console.log('➕ Assigning user to device:', userId);
      
      const currentAssignedTo = device.AssignedTo || [];
      if (currentAssignedTo.includes(userId)) {
        setError('User is already assigned to this device');
        return;
      }
      
      const updatedAssignedTo = [...currentAssignedTo, userId];
      
      // Update device in Firestore
      await updateDoc(doc(firestore, 'DEVICE', deviceId), {
        AssignedTo: updatedAssignedTo
      });
      
      // Update local device state
      setDevice(prev => ({
        ...prev,
        AssignedTo: updatedAssignedTo
      }));
      
      // Update children lists
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
  };

  // Handle unassigning user from device
  const handleUnassignUser = async (userId) => {
    try {
      setError(null);
      
      console.log('➖ Unassigning user from device:', userId);
      
      const currentAssignedTo = device.AssignedTo || [];
      const updatedAssignedTo = currentAssignedTo.filter(id => id !== userId);
      
      // Update device in Firestore
      await updateDoc(doc(firestore, 'DEVICE', deviceId), {
        AssignedTo: updatedAssignedTo
      });
      
      // Update local device state
      setDevice(prev => ({
        ...prev,
        AssignedTo: updatedAssignedTo
      }));
      
      // Update children lists
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
  };

  // Fetch device and permission data
  useEffect(() => {
    const fetchDeviceData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔍 Fetching device details for:', deviceId);
        
        // Check if user is SystemAdmin
        const isAdmin = await isSystemAdmin(userEmail);
        setIsUserSystemAdmin(isAdmin);
        
        // Fetch device from Firestore
        const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
        if (!deviceDoc.exists()) {
          setError('Device not found');
          setLoading(false);
          return;
        }
        
        const deviceData = { id: deviceId, ...deviceDoc.data() };
        
        // Fetch location details if device has location
        if (deviceData.Location) {
          try {
            const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
            if (locationDoc.exists()) {
              const locationData = locationDoc.data();
              deviceData.locationDetails = {
                id: deviceData.Location,
                locationName: locationData.LocationName || deviceData.Location,
                building: locationData.Building || 'Unknown Building'
              };
            }
          } catch (locationError) {
            console.error('Error fetching location details:', locationError);
          }
        }
        
        // Get device status from RTDB
        try {
          const rtdbRef = ref(database, `Devices/${deviceId}`);
          const rtdbSnapshot = await get(rtdbRef);
          
          if (rtdbSnapshot.exists()) {
            deviceData.status = rtdbSnapshot.val().status || 'OFF';
            deviceData.lastSeen = rtdbSnapshot.val().lastSeen;
          } else {
            deviceData.status = 'OFF';
          }
        } catch (rtdbError) {
          console.error('Error getting RTDB status:', rtdbError);
          deviceData.status = 'OFF';
        }
        
        setDevice(deviceData);
        setEditData({
          DeviceName: deviceData.DeviceName || '',
          DeviceDescription: deviceData.DeviceDescription || '',
          DeviceType: deviceData.DeviceType || '',
          Location: deviceData.Location || ''
        });
        
        console.log('📱 Device data loaded:', deviceData);
        
        // Determine permissions based on device location and user roles
        let canEditDevice = isAdmin;
        let canDeleteDevice = isAdmin;
        let canAssignDevice = false;
        let roleInDeviceBuilding = 'user';
        
        if (deviceData.Location && deviceData.locationDetails) {
          const buildingId = deviceData.locationDetails.building;
          roleInDeviceBuilding = await getUserRoleInBuilding(userEmail, buildingId);
          
          // Users with parent role in the device's building can edit/delete/assign
          if (roleInDeviceBuilding === 'parent') {
            canEditDevice = true;
            canDeleteDevice = true;
            canAssignDevice = true; // Only parents can assign devices
          }
        }
        
        setUserRoleInBuilding(roleInDeviceBuilding);
        setCanEdit(canEditDevice);
        setCanDelete(canDeleteDevice);
        setCanAssignUsers(canAssignDevice);
        
        console.log('🔐 Permissions:', { 
          canEdit: canEditDevice, 
          canDelete: canDeleteDevice,
          canAssign: canAssignDevice,
          roleInBuilding: roleInDeviceBuilding,
          isSystemAdmin: isAdmin
        });
        
        // If user can edit, fetch all their buildings for location selection
        if (canEditDevice) {
          await fetchUserBuildingsAndLocations();
        }
        
        // If user can assign and device has location, fetch children from device's building
        if (canAssignDevice && deviceData.Location && deviceData.locationDetails) {
          await fetchBuildingChildren(deviceData.locationDetails.building, deviceData.AssignedTo || []);
        }
        
      } catch (error) {
        console.error('❌ Error fetching device data:', error);
        setError('Failed to load device data');
      } finally {
        setLoading(false);
      }
    };
    
    if (deviceId && userEmail) {
      fetchDeviceData();
    }
  }, [deviceId, userEmail]);

  // Fetch user's buildings and locations for device relocation
  const fetchUserBuildingsAndLocations = async () => {
    try {
      console.log('🏢 Fetching user buildings and locations...');
      
      let userBuildings = [];
      let userLocations = [];
      
      if (isUserSystemAdmin) {
        // SystemAdmin can see all buildings and locations
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
        // Get user's building roles (only parent roles can move devices)
        const buildingRoles = await getUserBuildingRoles(userEmail);
        
        for (const [buildingId, role] of buildingRoles) {
          if (buildingId === 'SystemAdmin') continue;
          
          if (role === 'parent') {
            // Get building details
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
  };

  // Handle edit mode toggle
  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset form data
      setEditData({
        DeviceName: device.DeviceName || '',
        DeviceDescription: device.DeviceDescription || '',
        DeviceType: device.DeviceType || '',
        Location: device.Location || ''
      });
      setIsEditing(false);
      setError(null);
    } else {
      setIsEditing(true);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle save changes
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      console.log('💾 Saving device changes...');
      
      // Validate required fields
      if (!editData.DeviceName.trim()) {
        setError('Device name is required');
        setSaving(false);
        return;
      }
      
      // Prepare update data with only the 6 allowed fields
      const updateData = {
        AssignedTo: device.AssignedTo || [], // Keep existing assigned users
        DeviceDescription: editData.DeviceDescription.trim(),
        DeviceName: editData.DeviceName.trim(),
        DeviceType: editData.DeviceType.trim(),
        Location: editData.Location || null
      };
      
      // Update device in Firestore
      await updateDoc(doc(firestore, 'DEVICE', deviceId), updateData);
      
      // Update RTDB location if changed
      if (updateData.Location !== device.Location) {
        const rtdbRef = ref(database, `Devices/${deviceId}`);
        await update(rtdbRef, {
          locationId: updateData.Location || '',
          lastSeen: new Date().toISOString()
        });
      }
      
      // Update local state
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
  };

  // Handle device deletion
  const handleDelete = async () => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete device "${device.DeviceName || device.id}"?\n\n` +
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
      
      // Delete from Firestore
      await deleteDoc(doc(firestore, 'DEVICE', deviceId));
      
      // Delete from RTDB
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      await remove(rtdbRef);
      
      console.log('✅ Device deleted successfully');
      
      // Navigate back to devices list
      navigate('/devices', { 
        state: { 
          message: `Device "${device.DeviceName || device.id}" has been deleted successfully` 
        }
      });
      
    } catch (error) {
      console.error('❌ Error deleting device:', error);
      setError('Failed to delete device: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const getLocationName = (locationId) => {
    if (!locationId) return 'No Location';
    
    // Use the fetched location details from device
    if (device?.locationDetails?.id === locationId) {
      return device.locationDetails.locationName;
    }
    
    return locationId; // Fallback to locationId
  };

  const getBuildingName = (locationId) => {
    if (!locationId) return 'No Building';
    
    // Use the fetched location details from device
    if (device?.locationDetails?.id === locationId) {
      return device.locationDetails.building;
    }
    
    return 'Unknown Building'; // Fallback
  };

  // Handle back navigation
  const handleBack = () => {
    navigate('/devices');
  };

  if (loading) {
    return <div className="loading">Loading device details...</div>;
  }

  if (error && !device) {
    return (
      <div className="device-detail">
        <div className="detail-header">
          <button className="back-button" onClick={handleBack}>
            <MdArrowBack /> Back
          </button>
          <h2>Device Detail</h2>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  // Prepare tabs content
  const tabs = [
    {
      label: 'Device Info',
      content: (
        <div className="device-info-tab">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          
          {/* Edit/Delete Controls */}
          {(canEdit || canDelete) && (
            <div className="device-actions">
              {canEdit && (
                <>
                  {!isEditing ? (
                    <button className="edit-button" onClick={handleEditToggle}>
                      <MdEdit /> Edit Device
                    </button>
                  ) : (
                    <div className="edit-actions">
                      <button 
                        className="save-button" 
                        onClick={handleSave}
                        disabled={saving}
                      >
                        <MdSave /> {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button 
                        className="cancel-button" 
                        onClick={handleEditToggle}
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
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <MdDelete /> {deleting ? 'Deleting...' : 'Delete Device'}
                </button>
              )}
            </div>
          )}
          
          {/* Device Information Form */}
          <div className="device-info-form">
            <div className="info-group">
              <label>Device ID</label>
              <p className="device-id">{device.id}</p>
            </div>
            
            <div className="info-group">
              <label>Device Name *</label>
              {isEditing ? (
                <input
                  type="text"
                  name="DeviceName"
                  value={editData.DeviceName}
                  onChange={handleInputChange}
                  placeholder="Enter device name"
                  disabled={saving}
                  className={editData.DeviceName.trim() ? 'input-valid' : ''}
                />
              ) : (
                <p>{device.DeviceName || 'Unnamed Device'}</p>
              )}
            </div>
            
            <div className="info-group">
              <label>Description</label>
              {isEditing ? (
                <textarea
                  name="DeviceDescription"
                  value={editData.DeviceDescription}
                  onChange={handleInputChange}
                  placeholder="Enter device description (optional)"
                  disabled={saving}
                  rows="3"
                />
              ) : (
                <p>{device.DeviceDescription || 'No description'}</p>
              )}
            </div>
            
            <div className="info-group">
              <label>Device Type</label>
              {isEditing ? (
                <select
                  name="DeviceType"
                  value={editData.DeviceType}
                  onChange={handleInputChange}
                  disabled={saving}
                >
                  <option value="">Select device type</option>
                  <option value="Light">Light</option>
                  <option value="Fan">Fan</option>
                  <option value="AC">Air Conditioner</option>
                  <option value="Other">Other</option>
                </select>
              ) : (
                <p>{device.DeviceType || 'Unknown'}</p>
              )}
            </div>
            
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
                  onChange={handleInputChange}
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
                    {device?.locationDetails?.locationName || getLocationName(device.Location)}
                  </p>
                  <p className="building-info">
                    <MdBusiness className="building-icon" />
                    {device?.locationDetails?.building || getBuildingName(device.Location)}
                  </p>
                </div>
              )}
            </div>
            
            <div className="info-group">
              <label>Status</label>
              <p className={`device-status ${device.status === 'ON' ? 'status-on' : 'status-off'}`}>
                {device.status || 'OFF'}
              </p>
            </div>
            
            {device.lastSeen && (
              <div className="info-group">
                <label>Last Seen</label>
                <p>{new Date(device.lastSeen).toLocaleString()}</p>
              </div>
            )}
            
            {device.AssignedTo && device.AssignedTo.length > 0 && (
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
        </div>
      )
    }
  ];

  // Add Assignment tab only for parents with claimed devices
  if (canAssignUsers && device.Location) {
    tabs.push({
      label: 'Assign Device',
      content: (
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
          
          {/* Assigned Children Section */}
          <div className="assignment-section">
            <div className="assignment-header">
              <h3><MdPeople /> Assigned Children ({assignedChildren.length})</h3>
            </div>
            
            {assignedChildren.length > 0 ? (
              <div className="children-list">
                {assignedChildren.map(child => (
                  <div key={child.id} className="child-item">
                    <div className="child-info">
                      <div className="child-name">{child.Name || 'Unnamed'}</div>
                      <div className="child-details">
                        <span>Email: {child.Email || child.id}</span>
                        {child.ContactNo && <span>Contact: {child.ContactNo}</span>}
                      </div>
                    </div>
                    <button
                      className="unassign-btn"
                      onClick={() => handleUnassignUser(child.id)}
                      title="Remove access to this device"
                    >
                      <MdDelete />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-assignments">
                <p>No children assigned to this device yet.</p>
              </div>
            )}
          </div>
          
          {/* Available Children Section */}
          <div className="assignment-section">
            <div className="assignment-header">
              <h3><MdPersonAdd /> Available Children ({availableChildren.length})</h3>
            </div>
            
            {availableChildren.length > 0 ? (
              <div className="children-list">
                {availableChildren.map(child => (
                  <div key={child.id} className="child-item available">
                    <div className="child-info">
                      <div className="child-name">{child.Name || 'Unnamed'}</div>
                      <div className="child-details">
                        <span>Email: {child.Email || child.id}</span>
                        {child.ContactNo && <span>Contact: {child.ContactNo}</span>}
                      </div>
                    </div>
                    <button
                      className="assign-btn"
                      onClick={() => handleAssignUser(child.id)}
                      title="Give access to this device"
                    >
                      <MdAdd />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-assignments">
                <p>
                  {buildingChildren.length === 0 
                    ? 'No children found in this building.' 
                    : 'All children in this building are already assigned to this device.'
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      )
    });
  }

  return (
    <div className="device-detail">
      <div className="detail-header">
        <button className="back-button" onClick={handleBack}>
          <MdArrowBack /> Back
        </button>
        <h2>
          <MdDevices className="header-icon" />
          {device.DeviceName || device.id}
        </h2>
      </div>
      
      <TabPanel tabs={tabs} />
    </div>
  );
};

export default DeviceDetail;