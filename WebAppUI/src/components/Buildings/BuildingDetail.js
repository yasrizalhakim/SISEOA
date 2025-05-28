// src/components/Buildings/BuildingDetail.js - Updated for Location-Based Device Management
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { firestore } from '../../services/firebase';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { MdArrowBack, MdLocationOn, MdDevices, MdPeople, MdAdd, MdDelete, MdSettings, MdEdit, MdPersonAdd, MdSave, MdCancel, MdBusiness, MdDescription } from 'react-icons/md';
import TabPanel from '../common/TabPanel';
import UserModal from '../common/UserModal';
import { isSystemAdmin } from '../../utils/helpers';
import './BuildingDetail.css';

const BuildingDetail = () => {
  const { buildingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [building, setBuilding] = useState(null);
  const [locations, setLocations] = useState([]);
  const [devices, setDevices] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editData, setEditData] = useState({
    BuildingName: '',
    Address: '',
    Description: ''
  });
  
  // User role in THIS specific building
  const [userRoleInBuilding, setUserRoleInBuilding] = useState('user');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  
  // New location state
  const [newLocationName, setNewLocationName] = useState('');
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [isRemovingLocation, setIsRemovingLocation] = useState(false);
  
  // New child user state
  const [newChildEmail, setNewChildEmail] = useState('');
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  
  // User modal state for location management
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  
  // User profile modal state
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  
  // User context
  const userEmail = localStorage.getItem('userEmail') || '';

  // Show message from navigation state
  useEffect(() => {
    if (location.state?.message) {
      setSuccess(location.state.message);
      
      // Clear the state to prevent showing the message again
      window.history.replaceState({}, document.title);
      
      // Clear success message after a delay
      setTimeout(() => setSuccess(null), 5000);
    }
  }, [location.state]);
  
  // Get user's role in this specific building with proper SystemAdmin detection
  const getUserRoleInBuilding = async () => {
    try {
      // First check if user is SystemAdmin
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);
      
      if (isAdmin) {
        console.log('🔧 SystemAdmin detected - granting admin access to building', buildingId);
        return 'admin';
      }

      // Check user's role in this specific building
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
    } catch (error) {
      console.error('Error getting user role in building:', error);
      return 'user';
    }
  };
  
  useEffect(() => {
    const fetchBuildingData = async () => {
      try {
        setLoading(true);
        
        // First, get user's role in this specific building
        const roleInBuilding = await getUserRoleInBuilding();
        setUserRoleInBuilding(roleInBuilding);
        
        // Check if user has access to this building (SystemAdmin or building-specific access)
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
        
        // Set edit form data
        setEditData({
          BuildingName: buildingData.BuildingName || '',
          Address: buildingData.Address || '',
          Description: buildingData.Description || ''
        });
        
        console.log('🏢 Building data loaded:', buildingData.BuildingName);
        
        // Fetch locations for this building
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
        
        // Fetch devices for all locations in this building
        const devicesList = [];
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
        
        setDevices(devicesList);
        console.log(`📱 Found ${devicesList.length} devices`);
        
        // Fetch children users for this building (only for parents, not SystemAdmin or admins)
        if (roleInBuilding === 'parent') {
          const userBuildingQuery = query(
            collection(firestore, 'USERBUILDING'),
            where('Building', '==', buildingId),
            where('Role', '==', 'children')
          );
          
          const userBuildingSnapshot = await getDocs(userBuildingQuery);
          
          // Get user details for each child
          const childrenList = [];
          for (const userBuilding of userBuildingSnapshot.docs) {
            const userData = userBuilding.data();
            const userDoc = await getDoc(doc(firestore, 'USER', userData.User));
            
            if (userDoc.exists()) {
              childrenList.push({
                id: userData.User,
                userBuildingId: userBuilding.id, // Store for removal
                assignedLocations: userData.AssignedLocations || [],
                ...userDoc.data()
              });
            }
          }
          
          setChildren(childrenList);
          console.log(`👶 Found ${childrenList.length} children`);
        }
        
      } catch (error) {
        console.error('Error fetching building data:', error);
        setError('Failed to load building data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBuildingData();
  }, [buildingId, userEmail]);
  
  // Handle edit mode toggle
  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset form data
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
      
      console.log('💾 Saving building changes...');
      
      // Validate required fields
      if (!editData.BuildingName.trim()) {
        setError('Building name is required');
        setSaving(false);
        return;
      }
      
      // Prepare update data
      const updateData = {
        BuildingName: editData.BuildingName.trim(),
        Address: editData.Address.trim(),
        Description: editData.Description.trim(),
        LastModified: serverTimestamp(),
        LastModifiedBy: userEmail
      };
      
      // Update building in Firestore
      await updateDoc(doc(firestore, 'BUILDING', buildingId), updateData);
      
      // Update local state
      setBuilding(prev => ({
        ...prev,
        ...updateData
      }));
      
      setIsEditing(false);
      setSuccess('Building updated successfully');
      
      setTimeout(() => setSuccess(null), 3000);
      
      console.log('✅ Building updated successfully');
      
    } catch (error) {
      console.error('❌ Error saving building:', error);
      setError('Failed to save building changes');
    } finally {
      setSaving(false);
    }
  };

  // Handle building deletion
  const handleDelete = async () => {
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
      
      // Delete all locations in this building
      for (const location of locations) {
        await deleteDoc(doc(firestore, 'LOCATION', location.id));
      }
      
      // Delete all user-building relationships
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      
      for (const userBuildingDoc of userBuildingsSnapshot.docs) {
        await deleteDoc(userBuildingDoc.ref);
      }
      
      // Update devices to remove location assignment (don't delete devices)
      for (const device of devices) {
        await updateDoc(doc(firestore, 'DEVICE', device.id), {
          Location: null
        });
      }
      
      // Finally, delete the building itself
      await deleteDoc(doc(firestore, 'BUILDING', buildingId));
      
      console.log('✅ Building deleted successfully');
      
      // Navigate back to buildings list
      navigate('/buildings', { 
        state: { 
          message: `Building "${building.BuildingName || building.id}" has been deleted successfully` 
        }
      });
      
    } catch (error) {
      console.error('❌ Error deleting building:', error);
      setError('Failed to delete building: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };
  
  // Handle clicking on a child user for location management
  const handleChildClick = (childId) => {
    setSelectedUserId(childId);
    setIsUserModalOpen(true);
  };
  
  // Handle clicking on a child user for profile view
  const handleChildProfileClick = (child) => {
    setSelectedUserForProfile(child);
    setIsUserProfileModalOpen(true);
  };
  
  // Close user modal
  const handleCloseUserModal = () => {
    setIsUserModalOpen(false);
    setSelectedUserId(null);
    // Refresh children data to show updated location assignments
    fetchChildrenData();
  };

  // Close user profile modal
  const handleCloseUserProfileModal = () => {
    setIsUserProfileModalOpen(false);
    setSelectedUserForProfile(null);
  };

  // Refresh children data after location changes
  const fetchChildrenData = async () => {
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
    } catch (error) {
      console.error('Error refreshing children data:', error);
    }
  };
  
  // Go back to buildings list
  const handleBack = () => {
    navigate('/buildings');
  };
  
  // Add new location (only if user has parent or admin role in this building)
  const handleAddLocation = async () => {
    if (userRoleInBuilding !== 'admin' && userRoleInBuilding !== 'parent') {
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
      
      // Format current date as "DD-MM-YYYY"
      const now = new Date();
      const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
      
      // Generate location ID based on building ID and location name
      const locationId = `${buildingId}${newLocationName.replace(/\s+/g, '')}`;
      
      // Check if location with this ID already exists
      const existingLocationDoc = await getDoc(doc(firestore, 'LOCATION', locationId));
      if (existingLocationDoc.exists()) {
        setError('A location with this name already exists in this building');
        setIsAddingLocation(false);
        return;
      }
      
      // Create the location in LOCATION collection
      await setDoc(doc(firestore, 'LOCATION', locationId), {
        Building: buildingId,
        LocationName: newLocationName,
        DateCreated: dateCreated
      });
      
      // Add the new location to the state
      setLocations([...locations, {
        id: locationId,
        Building: buildingId,
        LocationName: newLocationName,
        DateCreated: dateCreated
      }]);
      
      // Clear the input and show success message
      setNewLocationName('');
      setSuccess('Location added successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error adding location:', error);
      setError('Failed to add location: ' + error.message);
    } finally {
      setIsAddingLocation(false);
    }
  };
  
  // Remove location (only if user has parent or admin role in this building)
  const handleRemoveLocation = async (locationId) => {
    if (userRoleInBuilding !== 'admin' && userRoleInBuilding !== 'parent') {
      setError('You do not have permission to remove locations in this building');
      return;
    }
    
    // First check if there are any devices in this location
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
      
      // Check if any children are assigned to this location
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
      
      // If no devices and no user assignments, proceed with deletion
      await deleteDoc(doc(firestore, 'LOCATION', locationId));
      
      // Remove from state
      setLocations(locations.filter(loc => loc.id !== locationId));
      
      setSuccess('Location removed successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error removing location:', error);
      setError('Failed to remove location: ' + error.message);
    } finally {
      setIsRemovingLocation(false);
    }
  };
  
  // Add new child user (only if user has parent role in this building)
  const handleAddChild = async () => {
    if (userRoleInBuilding !== 'parent') {
      setError('Only parents can add children to this building');
      return;
    }
    
    if (!newChildEmail.trim()) {
      setError('Email is required');
      return;
    }
    
    // Validate email format
    if (!newChildEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    
    try {
      setIsAddingChild(true);
      setError(null);
      
      // Check if user exists in USER collection
      const userDoc = await getDoc(doc(firestore, 'USER', newChildEmail));
      if (!userDoc.exists()) {
        setError('User not found. Please make sure the email is registered in the system.');
        setIsAddingChild(false);
        return;
      }
      
      // Check if user is already added to this building
      const existingUserQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', newChildEmail),
        where('Building', '==', buildingId)
      );
      
      const existingUserSnapshot = await getDocs(existingUserQuery);
      
      if (!existingUserSnapshot.empty) {
        setError('User already has access to this building');
        setIsAddingChild(false);
        return;
      }
      
      // Add user to building with 'children' role and empty location assignments
      const formattedEmail = newChildEmail.replace(/\./g, '_');
      const userBuildingId = `${formattedEmail}_${buildingId}`;
      
      await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
        User: newChildEmail,
        Building: buildingId,
        Role: 'children',
        AssignedLocations: [], // Start with no location assignments
        CreatedAt: serverTimestamp()
      });
      
      // Add to local state
      const userData = userDoc.data();
      setChildren(prev => [
        ...prev,
        {
          id: newChildEmail,
          userBuildingId: userBuildingId,
          assignedLocations: [],
          ...userData
        }
      ]);
      
      // Reset form
      setNewChildEmail('');
      setShowAddChildForm(false);
      setSuccess('Child user added successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error adding child:', error);
      setError('Failed to add child user: ' + error.message);
    } finally {
      setIsAddingChild(false);
    }
  };
  
  // Remove child user (only if user has parent role in this building)
  const handleRemoveChild = async (childId, userBuildingId) => {
    if (userRoleInBuilding !== 'parent') {
      setError('Only parents can remove children from this building');
      return;
    }
    
    if (!window.confirm('Are you sure you want to remove this child from the building?')) {
      return;
    }
    
    try {
      // Delete user-building association (this will also remove location assignments)
      await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingId));
      
      // Update local state
      setChildren(prev => prev.filter(child => child.id !== childId));
      
      setSuccess('Child user removed successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error removing child:', error);
      setError('Failed to remove child user: ' + error.message);
    }
  };

  // Get location name by ID
  const getLocationName = (locationId) => {
    const location = locations.find(loc => loc.id === locationId);
    return location ? (location.LocationName || locationId) : locationId;
  };
  
  if (loading) {
    return <div className="loading">Loading building data...</div>;
  }
  
  if (error && !building) {
    return (
      <div className="building-detail">
        <div className="detail-header">
          <button className="back-button" onClick={handleBack}>
            <MdArrowBack /> Back
          </button>
          <h2>Building Detail</h2>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }
  
  // Check permissions based on user's role in THIS building
  const canManageLocations = userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent';
  const canEditBuilding = userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent';
  const canDeleteBuilding = userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent';
  const canManageChildren = userRoleInBuilding === 'parent'; // Only parents can manage children, not admins
  const canViewChildren = userRoleInBuilding === 'parent'; // Only parents can see children
  
  // Prepare tabs content
  const tabs = [
    {
      label: 'Building Info',
      content: (
        <div className="building-info-tab">
          {/* Edit/Delete Controls - Consistent with Device Detail */}
          {(canEditBuilding || canDeleteBuilding) && (
            <div className="building-actions">
              {canEditBuilding && (
                <>
                  {!isEditing ? (
                    <button className="edit-button" onClick={handleEditToggle}>
                      <MdEdit /> Edit Building
                    </button>
                  ) : (
                    <div className="edit-actions">
                      <button 
                        className="save-button" 
                        onClick={handleSave}
                        disabled={saving || !editData.BuildingName.trim()}
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
              
              {canDeleteBuilding && !isEditing && (
                <button 
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

          {/* Building Information Form */}
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
            
            <div className="info-group">
              <label>Created By</label>
              <p>{building.CreatedBy || 'Unknown'}</p>
            </div>
            
            {building.CreatedAt && (
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
          
          <div className="locations-section">
            <div className="locations-header">
              <h3><MdLocationOn /> Locations ({locations.length})</h3>
            </div>
            
            {canManageLocations && (
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
                    {canManageLocations && (
                      <button
                        className="remove-location-btn"
                        onClick={() => handleRemoveLocation(location.id)}
                        disabled={isRemovingLocation}
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
        </div>
      )
    },
    {
      label: 'Devices',
      content: (
        <div className="devices-tab">
          <h3><MdDevices /> Devices ({devices.length})</h3>
          {devices.length > 0 ? (
            <div className="devices-list">
              {devices.map(device => (
                <div key={device.id} className="device-item" onClick={() => navigate(`/devices/detail/${device.id}`)}>
                  <div className="device-name">{device.DeviceName || device.id}</div>
                  <div className="device-details">
                    <span>ID: {device.id}</span>
                    <span>Location: {device.locationName}</span>
                    <span>Type: {device.DeviceType || 'N/A'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data-message">No devices found for this building</p>
          )}
        </div>
      )
    }
  ];
  
  // Add Children tab only for parent users in this building
  if (canViewChildren) {
    tabs.push({
      label: 'Children',
      content: (
        <div className="children-tab">
          <div className="children-header">
            <h3><MdPeople /> Children ({children.length})</h3>
            {canManageChildren && (
              <div className="children-actions">
                <button
                  className="add-child-btn"
                  onClick={() => setShowAddChildForm(!showAddChildForm)}
                >
                  <MdPersonAdd /> Add Child
                </button>
              </div>
            )}
          </div>
          
          {/* Add Child Form - Only for parents */}
          {showAddChildForm && canManageChildren && (
            <div className="add-child-form">
              <input
                type="email"
                value={newChildEmail}
                onChange={(e) => setNewChildEmail(e.target.value)}
                placeholder="Enter child's email address"
                disabled={isAddingChild}
              />
              <button
                className="confirm-add-btn"
                onClick={handleAddChild}
                disabled={isAddingChild || !newChildEmail.trim()}
              >
                {isAddingChild ? 'Adding...' : 'Add'}
              </button>
              <button
                className="cancel-add-btn"
                onClick={() => {
                  setShowAddChildForm(false);
                  setNewChildEmail('');
                }}
                disabled={isAddingChild}
              >
                Cancel
              </button>
            </div>
          )}
          
          {children.length > 0 ? (
            <div className="children-list">
              {children.map(child => (
                <div 
                  key={child.id} 
                  className="child-item clickable"
                  onClick={() => handleChildClick(child.id)}
                >
                  <div className="child-name">{child.Name || 'Unnamed'}</div>
                  <div className="child-details">
                    <span>Email: {child.Email || child.id}</span>
                    {child.ContactNo && <span>Contact: {child.ContactNo}</span>}
                    <span>
                      Assigned Locations: {child.assignedLocations?.length || 0}
                      {child.assignedLocations?.length > 0 && (
                        <span style={{ fontSize: '11px', color: '#059669', display: 'block' }}>
                          {child.assignedLocations.map(locId => getLocationName(locId)).join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="click-hint">Click to manage location access</span>
                  </div>
                  {canManageChildren && (
                    <button
                      className="remove-child-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveChild(child.id, child.userBuildingId);
                      }}
                      title="Remove child from building"
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
      )
    });
  }
  
  return (
    <div className="building-detail">
      <div className="detail-header">
        <button className="back-button" onClick={handleBack}>
          <MdArrowBack /> Back
        </button>
        <h2>{building.BuildingName || building.id}</h2>
      </div>
      
      <TabPanel tabs={tabs} />
      
      {/* User Modal for child location management */}
      <UserModal
        isOpen={isUserModalOpen}
        onClose={handleCloseUserModal}
        userId={selectedUserId}
        userRole={userRoleInBuilding} // Pass building-specific role
        userEmail={userEmail}
        buildingId={buildingId}
        viewOnly={false} // Parents can manage children's locations
        onUserUpdate={handleCloseUserModal}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isUserProfileModalOpen}
        onClose={handleCloseUserProfileModal}
        user={selectedUserForProfile}
        buildingId={buildingId}
      />
    </div>
  );
};

// User Profile Modal Component for viewing user details
const UserProfileModal = ({ isOpen, onClose, user, buildingId }) => {
  if (!isOpen || !user) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <MdPeople /> User Profile
          </h3>
          <button className="close-button" onClick={onClose}>
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
              {user.ParentEmail && (
                <div className="detail-item">
                  <label>Parent:</label>
                  <span>{user.ParentEmail}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Role in Building:</label>
                <span className="role-badge children">children</span>
              </div>
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