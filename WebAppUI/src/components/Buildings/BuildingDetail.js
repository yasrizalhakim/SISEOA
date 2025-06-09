// src/components/Buildings/BuildingDetail.js - Updated with Invitation-Based Child Addition

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { firestore } from '../../services/firebase';
import { notifyParentLocationAdded } from '../../services/notificationService';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  MdArrowBack, 
  MdLocationOn, 
  MdDevices, 
  MdPeople, 
  MdAdd, 
  MdDelete, 
  MdEdit, 
  MdPersonAdd, 
  MdSave, 
  MdCancel, 
  MdBusiness, 
  MdDescription,
  MdBolt
} from 'react-icons/md';
import TabPanel from '../common/TabPanel';
import EnergyChart from '../common/EnergyChart';
import UserModal from '../common/UserModal';
import { isSystemAdmin } from '../../utils/helpers';
import energyUsageService from '../../services/energyUsageService';
import { sendBuildingInvitation } from '../../services/notificationService';
import './BuildingDetail.css';

const BuildingDetail = () => {
  const { buildingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // State Management
  const [building, setBuilding] = useState(null);
  const [locations, setLocations] = useState([]);
  const [devices, setDevices] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editData, setEditData] = useState({
    BuildingName: '',
    Address: '',
    Description: ''
  });
  
  // User Role State
  const [userRoleInBuilding, setUserRoleInBuilding] = useState('user');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  
  // Location Management State
  const [newLocationName, setNewLocationName] = useState('');
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [isRemovingLocation, setIsRemovingLocation] = useState(false);
  
  // Child Management State - Updated for invitations
  const [newChildEmail, setNewChildEmail] = useState('');
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  
  // Email Validation State
  const [emailStatus, setEmailStatus] = useState({
    checking: false,
    exists: false,
    available: false,
    message: ''
  });
  
  // Modal State
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  
  // Energy State
  const [buildingDeviceIds, setBuildingDeviceIds] = useState([]);
  
  // User Context
  const userEmail = useMemo(() => 
    localStorage.getItem('userEmail') || '', 
    []
  );

  // Show message from navigation state
  useEffect(() => {
    if (location.state?.message) {
      setSuccess(location.state.message);
      window.history.replaceState({}, document.title);
      setTimeout(() => setSuccess(null), 5000);
    }
  }, [location.state]);
  
  // Get user's role in building
  const getUserRoleInBuilding = useCallback(async () => {
    try {
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);
      
      if (isAdmin) {
        console.log('🔧 SystemAdmin detected - granting admin access to building', buildingId);
        return 'admin';
      }

      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userEmail),
        where('Building', '==', buildingId)
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      if (!userBuildingSnapshot.empty) {
        const userBuildingData = userBuildingSnapshot.docs[0].data();
        console.log(`👤 User role in building ${buildingId}:`, userBuildingData.Role);
        return userBuildingData.Role;
      }
      
      console.log(`❌ User has no access to building ${buildingId}`);
      return 'user';
    } catch (err) {
      console.error('Error getting user role in building:', err);
      return 'user';
    }
  }, [userEmail, buildingId]);
  
  // Fetch children data
  const fetchChildrenData = useCallback(async () => {
    try {
      if (userRoleInBuilding === 'parent') {
        const userBuildingQuery = query(
          collection(firestore, 'USERBUILDING'),
          where('Building', '==', buildingId),
          where('Role', '==', 'children')
        );
        
        const userBuildingSnapshot = await getDocs(userBuildingQuery);
        
        const childrenList = [];
        for (const userBuilding of userBuildingSnapshot.docs) {
          const userData = userBuilding.data();
          const userDoc = await getDoc(doc(firestore, 'USER', userData.User));
          
          if (userDoc.exists()) {
            childrenList.push({
              id: userData.User,
              userBuildingId: userBuilding.id,
              assignedLocations: userData.AssignedLocations || [],
              ...userDoc.data()
            });
          }
        }
        
        setChildren(childrenList);
      }
    } catch (err) {
      console.error('Error refreshing children data:', err);
    }
  }, [userRoleInBuilding, buildingId]);

  // Get current user's assigned locations for children role
  const getCurrentUserAssignedLocations = useCallback(async () => {
    if (userRoleInBuilding !== 'children') return [];
    
    try {
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userEmail),
        where('Building', '==', buildingId)
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      if (!userBuildingSnapshot.empty) {
        const userBuildingData = userBuildingSnapshot.docs[0].data();
        return userBuildingData.AssignedLocations || [];
      }
      
      return [];
    } catch (err) {
      console.error('Error getting user assigned locations:', err);
      return [];
    }
  }, [userRoleInBuilding, userEmail, buildingId]);

  // Fetch building device IDs for energy usage
  const fetchBuildingDeviceIds = useCallback(async () => {
    try {
      const deviceIds = await energyUsageService.getBuildingDeviceIds(buildingId);
      setBuildingDeviceIds(deviceIds);
      console.log(`🏢 Building ${buildingId} has ${deviceIds.length} devices for energy tracking`);
    } catch (error) {
      console.error('Error fetching building device IDs:', error);
      setBuildingDeviceIds([]);
    }
  }, [buildingId]);
  
  // Main data fetching effect
  useEffect(() => {
    const fetchBuildingData = async () => {
      try {
        setLoading(true);
        
        const roleInBuilding = await getUserRoleInBuilding();
        setUserRoleInBuilding(roleInBuilding);
        
        if (roleInBuilding === 'user' && !isUserSystemAdmin) {
          setError('You do not have access to this building');
          setLoading(false);
          return;
        }
        
        console.log(`🏢 Fetching building ${buildingId} data for user with role: ${roleInBuilding}`);
        
        // Fetch building details
        const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
        if (!buildingDoc.exists()) {
          setError('Building not found');
          setLoading(false);
          return;
        }
        
        const buildingData = {
          id: buildingId,
          ...buildingDoc.data()
        };
        
        setBuilding(buildingData);
        setEditData({
          BuildingName: buildingData.BuildingName || '',
          Address: buildingData.Address || '',
          Description: buildingData.Description || ''
        });
        
        console.log('🏢 Building data loaded:', buildingData.BuildingName);
        
        // Fetch locations only for non-admin users
        if (roleInBuilding !== 'admin') {
          const locationsQuery = query(
            collection(firestore, 'LOCATION'),
            where('Building', '==', buildingId)
          );
          
          const locationsSnapshot = await getDocs(locationsQuery);
          const locationsList = locationsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          setLocations(locationsList);
          console.log(`📍 Found ${locationsList.length} locations`);
          
          // Fetch devices based on user role
          const devicesList = [];
          
          if (roleInBuilding === 'children') {
            // For children, only fetch devices in their assigned locations
            const assignedLocations = await getCurrentUserAssignedLocations();
            console.log(`👶 Child user assigned to ${assignedLocations.length} locations:`, assignedLocations);
            
            for (const assignedLocationId of assignedLocations) {
              const location = locationsList.find(loc => loc.id === assignedLocationId);
              if (location) {
                const devicesQuery = query(
                  collection(firestore, 'DEVICE'),
                  where('Location', '==', assignedLocationId)
                );
                
                const devicesSnapshot = await getDocs(devicesQuery);
                devicesSnapshot.docs.forEach(doc => {
                  devicesList.push({
                    id: doc.id,
                    ...doc.data(),
                    locationName: location.LocationName || location.id
                  });
                });
              }
            }
            console.log(`📱 Child can access ${devicesList.length} devices in assigned locations`);
          } else {
            // For parents and other roles, fetch all devices
            for (const location of locationsList) {
              const devicesQuery = query(
                collection(firestore, 'DEVICE'),
                where('Location', '==', location.id)
              );
              
              const devicesSnapshot = await getDocs(devicesQuery);
              devicesSnapshot.docs.forEach(doc => {
                devicesList.push({
                  id: doc.id,
                  ...doc.data(),
                  locationName: location.LocationName || location.id
                });
              });
            }
            console.log(`📱 Found ${devicesList.length} total devices`);
          }
          
          setDevices(devicesList);
          
          // Fetch children for parent users
          if (roleInBuilding === 'parent') {
            await fetchChildrenData();
          }
        }

        // Fetch device IDs for energy usage
        await fetchBuildingDeviceIds();
        
      } catch (err) {
        console.error('Error fetching building data:', err);
        setError('Failed to load building data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBuildingData();
  }, [buildingId, userEmail, getUserRoleInBuilding, fetchChildrenData, isUserSystemAdmin, fetchBuildingDeviceIds, getCurrentUserAssignedLocations]);
  
  // Edit mode handlers
  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      setEditData({
        BuildingName: building.BuildingName || '',
        Address: building.Address || '',
        Description: building.Description || ''
      });
      setIsEditing(false);
      setError(null);
    } else {
      setIsEditing(true);
    }
  }, [isEditing, building]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setEditData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      
      console.log('💾 Saving building changes...');
      
      if (!editData.BuildingName.trim()) {
        setError('Building name is required');
        setSaving(false);
        return;
      }
      
      const updateData = {
        BuildingName: editData.BuildingName.trim(),
        Address: editData.Address.trim(),
        Description: editData.Description.trim(),
        LastModified: serverTimestamp(),
        LastModifiedBy: userEmail
      };
      
      await updateDoc(doc(firestore, 'BUILDING', buildingId), updateData);
      
      setBuilding(prev => ({
        ...prev,
        ...updateData
      }));
      
      setIsEditing(false);
      setSuccess('Building updated successfully');
      
      setTimeout(() => setSuccess(null), 3000);
      
      console.log('✅ Building updated successfully');
      
    } catch (err) {
      console.error('❌ Error saving building:', err);
      setError('Failed to save building changes');
    } finally {
      setSaving(false);
    }
  }, [editData, userEmail, buildingId]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete building "${building.BuildingName || building.id}"?\n\n` +
      `This action cannot be undone and will:\n` +
      `• Remove the building from the system\n` +
      `• Remove all locations in this building\n` +
      `• Remove all user-building relationships\n` +
      `• NOTE: Devices will NOT be deleted but will become unassigned\n\n` +
      `Type "DELETE" to confirm:`
    );
    
    if (!confirmDelete) return;
    
    const confirmation = window.prompt('Type "DELETE" to confirm building deletion:');
    if (confirmation !== 'DELETE') {
      alert('Deletion cancelled - confirmation text did not match');
      return;
    }
    
    try {
      setDeleting(true);
      setError(null);
      
      console.log('🗑️ Deleting building...');
      
      // Delete all locations
      for (const location of locations) {
        await deleteDoc(doc(firestore, 'LOCATION', location.id));
      }
      
      // Delete user-building relationships
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      
      for (const userBuildingDoc of userBuildingsSnapshot.docs) {
        await deleteDoc(userBuildingDoc.ref);
      }
      
      // Update devices to remove location assignment
      for (const device of devices) {
        await updateDoc(doc(firestore, 'DEVICE', device.id), {
          Location: null
        });
      }
      
      // Delete the building
      await deleteDoc(doc(firestore, 'BUILDING', buildingId));
      
      console.log('✅ Building deleted successfully');
      
      navigate('/buildings', { 
        state: { 
          message: `Building "${building.BuildingName || building.id}" has been deleted successfully` 
        }
      });
      
    } catch (err) {
      console.error('❌ Error deleting building:', err);
      setError('Failed to delete building: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }, [building, locations, devices, buildingId, navigate]);
  
  // Modal handlers
  const handleChildClick = useCallback((childId) => {
    setSelectedUserId(childId);
    setIsUserModalOpen(true);
  }, []);
  
  const handleChildProfileClick = useCallback((child) => {
    setSelectedUserForProfile(child);
    setIsUserProfileModalOpen(true);
  }, []);
  
  const handleCloseUserModal = useCallback(() => {
    setIsUserModalOpen(false);
    setSelectedUserId(null);
    fetchChildrenData();
  }, [fetchChildrenData]);

  const handleCloseUserProfileModal = useCallback(() => {
    setIsUserProfileModalOpen(false);
    setSelectedUserForProfile(null);
  }, []);
  
  // Navigation handler
  const handleBack = useCallback(() => {
    navigate('/buildings');
  }, [navigate]);
  
  // Location management
  const handleAddLocation = useCallback(async () => {
    if (userRoleInBuilding !== 'parent') {
      setError('You do not have permission to add locations in this building');
      return;
    }
    
    if (!newLocationName.trim()) {
      setError('Location name is required');
      return;
    }
    
    try {
      setIsAddingLocation(true);
      setError(null);
      
      const now = new Date();
      const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
      const locationId = `${buildingId}${newLocationName.replace(/\s+/g, '')}`;
      
      const existingLocationDoc = await getDoc(doc(firestore, 'LOCATION', locationId));
      if (existingLocationDoc.exists()) {
        setError('A location with this name already exists in this building');
        setIsAddingLocation(false);
        return;
      }
      
      await setDoc(doc(firestore, 'LOCATION', locationId), {
        Building: buildingId,
        LocationName: newLocationName,
        DateCreated: dateCreated
      });
      
      setLocations(prev => [...prev, {
        id: locationId,
        Building: buildingId,
        LocationName: newLocationName,
        DateCreated: dateCreated
      }]);
      
      setNewLocationName('');
      setSuccess('Location added successfully');
      try {
    await notifyParentLocationAdded(
      userEmail,
      newLocationName,
      building.BuildingName || building.id
    );
    console.log('📢 Location addition notification sent to parent');
  } catch (notificationError) {
    console.error('❌ Failed to send location addition notification:', notificationError);
    // Don't fail the location creation if notification fails
  }
  
  setTimeout(() => setSuccess(null), 3000);
  
} catch (err) {
  console.error('Error adding location:', err);
  setError('Failed to add location: ' + err.message);
} finally {
      setIsAddingLocation(false);
    }
  }, [userRoleInBuilding, newLocationName, buildingId]);
  
  const handleRemoveLocation = useCallback(async (locationId) => {
    if (userRoleInBuilding !== 'parent') {
      setError('You do not have permission to remove locations in this building');
      return;
    }
    
    try {
      setIsRemovingLocation(true);
      
      const devicesQuery = query(
        collection(firestore, 'DEVICE'),
        where('Location', '==', locationId)
      );
      
      const devicesSnapshot = await getDocs(devicesQuery);
      
      if (!devicesSnapshot.empty) {
        setError(`Cannot remove this location. It contains ${devicesSnapshot.size} device(s). Move or delete the devices first.`);
        setIsRemovingLocation(false);
        return;
      }
      
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      
      let hasAssignedUsers = false;
      for (const userBuildingDoc of userBuildingsSnapshot.docs) {
        const userData = userBuildingDoc.data();
        const assignedLocations = userData.AssignedLocations || [];
        if (assignedLocations.includes(locationId)) {
          hasAssignedUsers = true;
          break;
        }
      }
      
      if (hasAssignedUsers) {
        setError('Cannot remove this location. Some users are assigned to it. Remove user assignments first.');
        setIsRemovingLocation(false);
        return;
      }
      
      await deleteDoc(doc(firestore, 'LOCATION', locationId));
      setLocations(prev => prev.filter(loc => loc.id !== locationId));
      setSuccess('Location removed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error removing location:', err);
      setError('Failed to remove location: ' + err.message);
    } finally {
      setIsRemovingLocation(false);
    }
  }, [userRoleInBuilding, buildingId]);
  
  // UPDATED: Child Management - Now uses invitation system
  const checkEmailAvailability = useCallback(async (email) => {
    if (!email || !email.includes('@')) return;
    
    setEmailStatus(prev => ({ ...prev, checking: true, message: 'Checking email...' }));
    
    try {
      const trimmedEmail = email.trim();
      
      // Check if user exists in the system
      const userDoc = await getDoc(doc(firestore, 'USER', trimmedEmail));
      
      if (!userDoc.exists()) {
        setEmailStatus({
          checking: false,
          exists: false,
          available: false,
          message: 'User not found'
        });
        return;
      }
      
      // Check if user already has access to this building
      const existingUserQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', trimmedEmail),
        where('Building', '==', buildingId)
      );
      
      const existingUserSnapshot = await getDocs(existingUserQuery);
      
      if (!existingUserSnapshot.empty) {
        setEmailStatus({
          checking: false,
          exists: true,
          available: false,
          message: 'Already has access'
        });
        return;
      }
      
      // User exists and is available
      setEmailStatus({
        checking: false,
        exists: true,
        available: true,
        message: 'Available to invite'
      });
      
    } catch (err) {
      console.error('Error checking email availability:', err);
      setEmailStatus({
        checking: false,
        exists: false,
        available: false,
        message: 'Error checking email'
      });
    }
  }, [buildingId]);

  const handleNewChildEmailChange = useCallback((e) => {
    const value = e.target.value;
    setNewChildEmail(value);
    
    // Clear errors when user starts typing
    if (error && (error.includes('Email') || error.includes('User not found') || error.includes('already has access'))) {
      setError(null);
    }
    
    // Reset email status when input is cleared
    if (!value.trim()) {
      setEmailStatus({
        checking: false,
        exists: false,
        available: false,
        message: ''
      });
      return;
    }
    
    // Check email availability when user stops typing (debounce)
    const timeoutId = setTimeout(() => {
      if (value.trim() && value.includes('@')) {
        checkEmailAvailability(value);
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [error, checkEmailAvailability]);

  // UPDATED: Send invitation instead of directly adding child
  const handleSendInvitation = useCallback(async () => {
    if (userRoleInBuilding !== 'parent') {
      setError('Only parents can invite users to this building');
      return;
    }
    
    const trimmedEmail = newChildEmail.trim();
    
    if (!trimmedEmail) {
      setError('Email is required');
      return;
    }
    
    if (!trimmedEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    
    // Check email availability before proceeding
    if (!emailStatus.exists || !emailStatus.available) {
      setError('Please enter a valid email of a registered user who doesn\'t already have access to this building');
      return;
    }
    
    try {
      setIsSendingInvitation(true);
      setError(null);
      
      console.log('📨 Sending building invitation to:', trimmedEmail);
      
      await sendBuildingInvitation(
        userEmail,
        trimmedEmail,
        buildingId,
        building.BuildingName || building.id
      );
      
      // Reset form
      setNewChildEmail('');
      setEmailStatus({
        checking: false,
        exists: false,
        available: false,
        message: ''
      });
      setShowAddChildForm(false);
      setSuccess(`Invitation sent to ${trimmedEmail}. They will receive a notification to join this building.`);
      setTimeout(() => setSuccess(null), 5000);
      
      console.log('✅ Building invitation sent successfully');
      
    } catch (err) {
      console.error('❌ Error sending invitation:', err);
      setError(err.message || 'Failed to send invitation');
    } finally {
      setIsSendingInvitation(false);
    }
  }, [userRoleInBuilding, newChildEmail, buildingId, emailStatus, userEmail, building]);
  
  const handleRemoveChild = useCallback(async (childId, userBuildingId) => {
    if (userRoleInBuilding !== 'parent') {
      setError('Only parents can remove children from this building');
      return;
    }
    
    if (!window.confirm('Are you sure you want to remove this child from the building?')) {
      return;
    }
    
    try {
      await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingId));
      setChildren(prev => prev.filter(child => child.id !== childId));
      setSuccess('Child user removed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error removing child:', err);
      setError('Failed to remove child user: ' + err.message);
    }
  }, [userRoleInBuilding]);

  // Utility function
  const getLocationName = useCallback((locationId) => {
    const location = locations.find(loc => loc.id === locationId);
    return location ? (location.LocationName || locationId) : locationId;
  }, [locations]);
  
  // Permission checks
  const permissions = useMemo(() => ({
    canManageLocations: userRoleInBuilding === 'parent',
    canEditBuilding: userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent',
    canDeleteBuilding: userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent',
    canManageChildren: userRoleInBuilding === 'parent',
    canViewChildren: userRoleInBuilding === 'parent',
    canViewLocations: userRoleInBuilding !== 'admin'
  }), [userRoleInBuilding]);
  
  // Loading and error states
  if (loading) {
    return <div className="loading">Loading building data...</div>;
  }
  
  if (error && !building) {
    return (
      <div className="building-detail">
        <div className="detail-header">
          <button className="back-button" onClick={handleBack} type="button">
            <MdArrowBack /> Back
          </button>
          <h2>Building Detail</h2>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }
  
  // Tab content components
  const BuildingInfoTab = () => (
    <div className="building-info-tab">
      {(permissions.canEditBuilding || permissions.canDeleteBuilding) && (
        <div className="building-actions">
          {permissions.canEditBuilding && (
            <>
              {!isEditing ? (
                <button className="edit-button" onClick={handleEditToggle} type="button">
                  <MdEdit /> Edit Building
                </button>
              ) : (
                <div className="edit-actions">
                  <button 
                    type="button"
                    className="save-button" 
                    onClick={handleSave}
                    disabled={saving || !editData.BuildingName.trim()}
                  >
                    <MdSave /> {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button 
                    type="button"
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
          
          {permissions.canDeleteBuilding && !isEditing && (
            <button 
              type="button"
              className="delete-button" 
              onClick={handleDelete}
              disabled={deleting}
            >
              <MdDelete /> {deleting ? 'Deleting...' : 'Delete Building'}
            </button>
          )}
        </div>
      )}

      {success && <div className="success-message">{success}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="building-info-form">
        <div className="info-group">
          <label>Building ID</label>
          <p className="building-id">{building.id}</p>
        </div>
        
        <div className="info-group">
          <label>
            <MdBusiness /> Building Name *
          </label>
          {isEditing ? (
            <input
              type="text"
              name="BuildingName"
              value={editData.BuildingName}
              onChange={handleInputChange}
              placeholder="Enter building name"
              disabled={saving}
              className={editData.BuildingName.trim() ? 'input-valid' : ''}
            />
          ) : (
            <p>{building.BuildingName || 'Unnamed Building'}</p>
          )}
        </div>
        
        <div className="info-group">
          <label>
            <MdLocationOn /> Address
          </label>
          {isEditing ? (
            <input
              type="text"
              name="Address"
              value={editData.Address}
              onChange={handleInputChange}
              placeholder="Enter building address (optional)"
              disabled={saving}
            />
          ) : (
            <p>{building.Address || 'No address specified'}</p>
          )}
        </div>
        
        <div className="info-group">
          <label>
            <MdDescription /> Description
          </label>
          {isEditing ? (
            <textarea
              name="Description"
              value={editData.Description}
              onChange={handleInputChange}
              placeholder="Enter building description (optional)"
              disabled={saving}
              rows="4"
            />
          ) : (
            <p>{building.Description || 'No description'}</p>
          )}
        </div>
        
        {userRoleInBuilding !== 'parent' && (
          <div className="info-group">
            <label>Created By</label>
            <p>{building.CreatedBy || 'Unknown'}</p>
          </div>
        )}
        
        {building.CreatedAt && userRoleInBuilding !== 'children' && (
          <div className="info-group">
            <label>Created At</label>
            <p>{typeof building.CreatedAt === 'string' 
                ? building.CreatedAt 
                : building.CreatedAt.toDate().toLocaleString()}</p>
          </div>
        )}

        {building.LastModifiedBy && (
          <div className="info-group">
            <label>Last Modified By</label>
            <p>{building.LastModifiedBy}</p>
          </div>
        )}
      </div>
      
      {permissions.canViewLocations && (
        <div className="locations-section">
          <div className="locations-header">
            <h3><MdLocationOn /> Locations ({locations.length})</h3>
          </div>
          
          {permissions.canManageLocations && (
            <div className="add-location-form">
              <input
                id="new-location-input"
                type="text"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="Enter new location name"
                disabled={isAddingLocation}
              />
              <button
                type="button"
                className="confirm-add-btn"
                onClick={handleAddLocation}
                disabled={isAddingLocation || !newLocationName.trim()}
              >
                {isAddingLocation ? 'Adding...' : 'Add'}
              </button>
            </div>
          )}
          
          {locations.length > 0 ? (
            <div className="locations-list">
              {locations.map(location => (
                <div key={location.id} className="location-item">
                  <div className="location-name">{location.LocationName || location.id}</div>
                  <div className="location-details">
                    <span className="location-id">ID: {location.id}</span>
                    {location.DateCreated && (
                      <span className="location-date">Created: {location.DateCreated}</span>
                    )}
                    <span className="location-devices">
                      Devices: {devices.filter(d => d.Location === location.id).length}
                    </span>
                  </div>
                  {permissions.canManageLocations && (
                    <button
                      type="button"
                      className="remove-location-btn"
                      onClick={() => handleRemoveLocation(location.id)}
                      disabled={isRemovingLocation}
                      aria-label="Remove location"
                    >
                      <MdDelete />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data-message">No locations found for this building</p>
          )}
        </div>
      )}
    </div>
  );

  const DevicesTab = () => (
    <div className="devices-tab">
      <h3>
        <MdDevices /> 
        {userRoleInBuilding === 'children' ? 'My Accessible Devices' : 'Devices'} ({devices.length})
      </h3>
      
      {userRoleInBuilding === 'children' && (
        <div className="children-device-info" style={{
          backgroundColor: '#f0f9ff',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #bae6fd'
        }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#0369a1' }}>
            📍 You can only see devices in locations you're assigned to. 
            Currently showing devices from your {devices.length > 0 ? 'assigned locations' : 'assigned locations (none found)'}.
          </p>
        </div>
      )}
      
      {devices.length > 0 ? (
        <div className="devices-list">
          {devices.map(device => (
            <div 
              key={device.id} 
              className="device-item" 
              onClick={() => navigate(`/devices/detail/${device.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(`/devices/detail/${device.id}`);
                }
              }}
            >
              <div className="device-name">{device.DeviceName || device.id}</div>
              <div className="device-details">
                <span>ID: {device.id}</span>
                <span>Location: {device.locationName}</span>
                <span>Type: {device.DeviceType || 'N/A'}</span>
                {userRoleInBuilding === 'children' && (
                  <span style={{ fontSize: '12px', color: '#059669', fontStyle: 'italic' }}>
                    ✓ Accessible via location assignment
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="no-data-message">
          {userRoleInBuilding === 'children' 
            ? "No devices found in your assigned locations. Ask a parent to assign you to locations with devices."
            : "No devices found for this building"
          }
        </p>
      )}
    </div>
  );

  // UPDATED: Children Tab with invitation system
  const ChildrenTab = () => (
    <div className="children-tab">
      <div className="children-header">
        <h3><MdPeople /> Children ({children.length})</h3>
        {permissions.canManageChildren && (
          <div className="children-actions">
            <button
              type="button"
              className="add-child-btn"
              onClick={() => {
                setShowAddChildForm(!showAddChildForm);
                // Clear any existing errors and email status when toggling form
                if (!showAddChildForm) {
                  setError(null);
                  setNewChildEmail('');
                  setEmailStatus({
                    checking: false,
                    exists: false,
                    available: false,
                    message: ''
                  });
                }
              }}
            >
              <MdPersonAdd /> Send Invitation
            </button>
          </div>
        )}
      </div>
      
      {showAddChildForm && permissions.canManageChildren && (
        <div className="add-child-form">
          <div className="email-input-container" style={{ position: 'relative', flex: 1 }}>
            <input
              type="email"
              value={newChildEmail}
              onChange={handleNewChildEmailChange}
              placeholder="Enter user's email address to invite"
              disabled={isSendingInvitation}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSendingInvitation && emailStatus.exists && emailStatus.available) {
                  handleSendInvitation();
                }
                if (e.key === 'Escape') {
                  setShowAddChildForm(false);
                  setNewChildEmail('');
                  setEmailStatus({
                    checking: false,
                    exists: false,
                    available: false,
                    message: ''
                  });
                  setError(null);
                }
              }}
              style={{
                paddingRight: '100px',
                borderColor: emailStatus.exists && emailStatus.available ? '#22c55e' : 
                            emailStatus.exists && !emailStatus.available ? '#ef4444' : '#e2e8f0'
              }}
              autoFocus
            />
            {emailStatus.checking && (
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
            {!emailStatus.checking && emailStatus.message && (
              <span style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '12px',
                color: emailStatus.available ? '#16a34a' : '#dc2626',
                fontWeight: '500'
              }}>
                {emailStatus.available ? '✓' : '✗'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="confirm-add-btn"
            onClick={handleSendInvitation}
            disabled={isSendingInvitation || !emailStatus.exists || !emailStatus.available}
          >
            {isSendingInvitation ? 'Sending...' : 'Send Invite'}
          </button>
          <button
            type="button"
            className="cancel-add-btn"
            onClick={() => {
              setShowAddChildForm(false);
              setNewChildEmail('');
              setEmailStatus({
                checking: false,
                exists: false,
                available: false,
                message: ''
              });
              setError(null);
            }}
            disabled={isSendingInvitation}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Info about invitation system */}
      {permissions.canManageChildren && (
        <div style={{
          backgroundColor: '#f0f9ff',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #bae6fd'
        }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#0369a1' }}>
            📨 When you send an invitation, the user will receive a notification to join this building. 
            They can accept or decline the invitation.
          </p>
        </div>
      )}
      
      {children.length > 0 ? (
        <div className="children-list">
          {children.map(child => (
            <div 
              key={child.id} 
              className="child-item clickable"
              onClick={() => handleChildClick(child.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleChildClick(child.id);
                }
              }}
            >
              <div className="child-name">{child.Name || 'Unnamed'}</div>
              <div className="child-details">
                <span>Email: {child.Email || child.id}</span>
                {child.ContactNo && <span>Contact: {child.ContactNo}</span>}
                <span>
                  Assigned Locations: {child.assignedLocations?.length || 0}
                  {child.assignedLocations?.length > 0 && (
                    <span style={{ fontSize: '0.6875rem', color: '#059669', display: 'block' }}>
                      {child.assignedLocations.map(locId => getLocationName(locId)).join(', ')}
                    </span>
                  )}
                </span>
                <span className="click-hint">Click to manage location access</span>
              </div>
              {permissions.canManageChildren && (
                <button
                  type="button"
                  className="remove-child-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveChild(child.id, child.userBuildingId);
                  }}
                  title="Remove child from building"
                  aria-label="Remove child from building"
                >
                  <MdDelete />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="no-data-message">No children found for this building</p>
      )}
    </div>
  );

  // Energy Usage tab component
  const EnergyUsageTab = () => (
    <div className="energy-usage-tab">
      <div className="energy-info-banner">
        <h4>
          <MdBolt /> Building Energy Analytics
        </h4>
        <p>
          Monitor aggregated energy consumption for all devices in <strong>{building?.BuildingName || 'this building'}</strong>. 
          This shows combined usage from {buildingDeviceIds.length} device{buildingDeviceIds.length !== 1 ? 's' : ''} across {locations.length} location{locations.length !== 1 ? 's' : ''}.
        </p>
      </div>
      
      <EnergyChart
        buildingId={buildingId}
        deviceIds={buildingDeviceIds}
        title={`Building Energy Usage - ${building?.BuildingName || buildingId}`}
        showControls={true}
        defaultFilter="week"
        height={400}
      />
      
      {buildingDeviceIds.length === 0 && (
        <div className="no-energy-data">
          <p><strong>No devices available for energy tracking</strong></p>
          <span>Add devices to locations in this building to start monitoring energy usage.</span>
        </div>
      )}
    </div>
  );
  
  // Prepare tabs
  const tabs = [
    {
      label: 'Building Info',
      content: <BuildingInfoTab />
    }
  ];

  // Add Devices tab only for non-admin users
  if (permissions.canViewLocations) {
    tabs.push({
      label: 'Devices',
      content: <DevicesTab />
    });
  }
  
  if (permissions.canViewChildren) {
    tabs.push({
      label: 'Children',
      content: <ChildrenTab />
    });
  }

  // Add Energy Usage tab
  tabs.push({
    label: 'Energy Usage',
    content: <EnergyUsageTab />
  });
  
  return (
    <div className="building-detail">
      <div className="detail-header">
        <button className="back-button" onClick={handleBack} type="button">
          <MdArrowBack /> Back
        </button>
        <h2>{building.BuildingName || building.id}</h2>
      </div>
      
      <TabPanel tabs={tabs} />
      
      <UserModal
        isOpen={isUserModalOpen}
        onClose={handleCloseUserModal}
        userId={selectedUserId}
        userRole={userRoleInBuilding}
        userEmail={userEmail}
        buildingId={buildingId}
        viewOnly={false}
        onUserUpdate={handleCloseUserModal}
      />

      <UserProfileModal
        isOpen={isUserProfileModalOpen}
        onClose={handleCloseUserProfileModal}
        user={selectedUserForProfile}
        buildingId={buildingId}
      />
    </div>
  );
};

// User Profile Modal Component
const UserProfileModal = ({ isOpen, onClose, user, buildingId }) => {
  if (!isOpen || !user) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <MdPeople /> User Profile
          </h3>
          <button 
            type="button"
            className="close-button" 
            onClick={onClose}
            aria-label="Close modal"
          >
            <MdDelete />
          </button>
        </div>

        <div className="modal-body">
          <div className="user-info-section">
            <h4>User Information</h4>
            <div className="user-details-grid">
              <div className="detail-item">
                <label>Name:</label>
                <span>{user.Name || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Email:</label>
                <span>{user.Email || user.id}</span>
              </div>
              {user.ContactNo && (
                <div className="detail-item">
                  <label>Contact:</label>
                  <span>{user.ContactNo}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Assigned Locations:</label>
                <span>{user.assignedLocations?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuildingDetail;