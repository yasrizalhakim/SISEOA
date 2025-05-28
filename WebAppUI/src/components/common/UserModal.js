// src/components/common/UserModal.js - Updated for Location-Based Device Management
import React, { useState, useEffect } from 'react';
import { firestore } from '../../services/firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { MdClose, MdPerson, MdLocationOn, MdCheck, MdRemove, MdInfo } from 'react-icons/md';
import './UserModal.css';

const UserModal = ({ 
  isOpen, 
  onClose, 
  userId, 
  userRole, // This is now the user's role in the specific building
  userEmail, 
  buildingId = null,
  onUserUpdate = null,
  viewOnly = false
}) => {
  const [user, setUser] = useState(null);
  const [assignedLocations, setAssignedLocations] = useState([]);
  const [availableLocations, setAvailableLocations] = useState([]);
  const [locationDevices, setLocationDevices] = useState({}); // Map of locationId -> devices array
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [userRoleInBuilding, setUserRoleInBuilding] = useState('user');

  // Get the current user's role in the specific building
  const getCurrentUserRoleInBuilding = async () => {
    const globalUserRole = localStorage.getItem('userRole') || 'user';
    
    if (globalUserRole === 'admin') {
      return 'admin';
    }

    if (!buildingId) {
      return globalUserRole;
    }

    try {
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userEmail),
        where('Building', '==', buildingId)
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      if (!userBuildingSnapshot.empty) {
        const userBuildingData = userBuildingSnapshot.docs[0].data();
        return userBuildingData.Role;
      }
      
      return 'user';
    } catch (error) {
      console.error('Error getting current user role in building:', error);
      return 'user';
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserData();
    }
  }, [isOpen, userId, buildingId]);

  // Check if current user is a parent of the viewed user in the specific building
  const checkParentChildRelationship = async (childUserId, parentUserEmail) => {
    try {
      // Method 1: Check direct parent relationship via ParentEmail field
      const childUserDoc = await getDoc(doc(firestore, 'USER', childUserId));
      if (childUserDoc.exists()) {
        const childData = childUserDoc.data();
        if (childData.ParentEmail === parentUserEmail) {
          return true;
        }
      }

      // Method 2: Check building-based parent-child relationship (building-specific)
      if (buildingId) {
        // Get current user's role in this building
        const currentUserRole = await getCurrentUserRoleInBuilding();
        
        if (currentUserRole === 'parent') {
          // Check if the child user has 'children' role in this same building
          const childBuildingQuery = query(
            collection(firestore, 'USERBUILDING'),
            where('User', '==', childUserId),
            where('Building', '==', buildingId),
            where('Role', '==', 'children')
          );
          
          const childBuildingSnapshot = await getDocs(childBuildingQuery);
          return !childBuildingSnapshot.empty;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking parent-child relationship:', error);
      return false;
    }
  };

  const fetchUserData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user's role in this building
      const currentUserRoleInBuilding = await getCurrentUserRoleInBuilding();
      setUserRoleInBuilding(currentUserRoleInBuilding);

      // Fetch user details
      const userDoc = await getDoc(doc(firestore, 'USER', userId));
      if (!userDoc.exists()) {
        setError('User not found');
        return;
      }

      const userData = userDoc.data();
      setUser({
        id: userId,
        email: userId,
        ...userData
      });

      // Skip location management if viewOnly mode
      if (viewOnly) {
        setLoading(false);
        return;
      }

      // Check if the current user has permission to manage this user's locations
      let hasPermission = false;
      
      if (currentUserRoleInBuilding === 'admin') {
        // SystemAdmin and building admins cannot manage children - only view
        hasPermission = false;
      } else if (currentUserRoleInBuilding === 'parent') {
        // Check if current user is a parent of the viewed user in this building
        hasPermission = await checkParentChildRelationship(userId, userEmail);
      }

      if (!hasPermission) {
        setError('You do not have permission to manage this user\'s location access');
        setLoading(false);
        return;
      }

      // Fetch location data only if user has permission and building is specified
      if (buildingId) {
        await fetchBuildingLocationsAndDevices();
        await fetchUserLocationAssignments();
      }

    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch all locations in the building and their devices
  const fetchBuildingLocationsAndDevices = async () => {
    try {
      console.log('📍 Fetching locations and devices for building:', buildingId);
      
      // Get all locations in this building
      const locationsQuery = query(
        collection(firestore, 'LOCATION'),
        where('Building', '==', buildingId)
      );
      const locationsSnapshot = await getDocs(locationsQuery);
      
      const locations = [];
      const devicesByLocation = {};
      
      // For each location, get its devices
      for (const locationDoc of locationsSnapshot.docs) {
        const locationData = locationDoc.data();
        const locationId = locationDoc.id;
        
        locations.push({
          id: locationId,
          name: locationData.LocationName || locationId,
          ...locationData
        });
        
        // Get devices in this location
        const devicesQuery = query(
          collection(firestore, 'DEVICE'),
          where('Location', '==', locationId)
        );
        const devicesSnapshot = await getDocs(devicesQuery);
        
        devicesByLocation[locationId] = devicesSnapshot.docs.map(deviceDoc => ({
          id: deviceDoc.id,
          ...deviceDoc.data()
        }));
      }
      
      setLocationDevices(devicesByLocation);
      
      console.log('📍 Locations loaded:', locations.length);
      console.log('📱 Devices by location:', devicesByLocation);
      
    } catch (error) {
      console.error('Error fetching building locations and devices:', error);
    }
  };

  // Fetch user's current location assignments
  const fetchUserLocationAssignments = async () => {
    try {
      // Get user's building relationship to find assigned locations
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userId),
        where('Building', '==', buildingId)
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      if (!userBuildingSnapshot.empty) {
        const userBuildingData = userBuildingSnapshot.docs[0].data();
        const assignedLocationIds = userBuildingData.AssignedLocations || [];
        
        // Get all locations in building
        const locationsQuery = query(
          collection(firestore, 'LOCATION'),
          where('Building', '==', buildingId)
        );
        const locationsSnapshot = await getDocs(locationsQuery);
        
        const assigned = [];
        const available = [];
        
        locationsSnapshot.docs.forEach(locationDoc => {
          const locationData = locationDoc.data();
          const location = {
            id: locationDoc.id,
            name: locationData.LocationName || locationDoc.id,
            ...locationData
          };
          
          if (assignedLocationIds.includes(locationDoc.id)) {
            assigned.push(location);
          } else {
            available.push(location);
          }
        });
        
        setAssignedLocations(assigned);
        setAvailableLocations(available);
        
        console.log('📍 User location assignments:', {
          assigned: assigned.length,
          available: available.length
        });
      }
      
    } catch (error) {
      console.error('Error fetching user location assignments:', error);
    }
  };

  // Handle assigning location to user
  const handleAssignLocation = async (locationId) => {
    try {
      setError(null);
      
      console.log('➕ Assigning location to user:', locationId);
      
      // Get current user building relationship
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userId),
        where('Building', '==', buildingId)
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      if (userBuildingSnapshot.empty) {
        setError('User is not associated with this building');
        return;
      }
      
      const userBuildingDoc = userBuildingSnapshot.docs[0];
      const userBuildingData = userBuildingDoc.data();
      const currentAssignedLocations = userBuildingData.AssignedLocations || [];
      
      if (currentAssignedLocations.includes(locationId)) {
        setError('User is already assigned to this location');
        return;
      }
      
      const updatedAssignedLocations = [...currentAssignedLocations, locationId];
      
      // Update user building relationship with new location
      await updateDoc(userBuildingDoc.ref, {
        AssignedLocations: updatedAssignedLocations
      });
      
      // Update local state
      const locationToMove = availableLocations.find(loc => loc.id === locationId);
      if (locationToMove) {
        setAssignedLocations(prev => [...prev, locationToMove]);
        setAvailableLocations(prev => prev.filter(loc => loc.id !== locationId));
      }
      
      setSuccess('Location assigned successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      // Call callback if provided
      if (onUserUpdate) {
        onUserUpdate();
      }
      
      console.log('✅ Location assigned successfully');
      
    } catch (error) {
      console.error('❌ Error assigning location:', error);
      setError('Failed to assign location');
    }
  };

  // Handle unassigning location from user
  const handleUnassignLocation = async (locationId) => {
    try {
      setError(null);
      
      console.log('➖ Unassigning location from user:', locationId);
      
      // Get current user building relationship
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userId),
        where('Building', '==', buildingId)
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      if (userBuildingSnapshot.empty) {
        setError('User is not associated with this building');
        return;
      }
      
      const userBuildingDoc = userBuildingSnapshot.docs[0];
      const userBuildingData = userBuildingDoc.data();
      const currentAssignedLocations = userBuildingData.AssignedLocations || [];
      
      const updatedAssignedLocations = currentAssignedLocations.filter(id => id !== locationId);
      
      // Update user building relationship
      await updateDoc(userBuildingDoc.ref, {
        AssignedLocations: updatedAssignedLocations
      });
      
      // Update local state
      const locationToMove = assignedLocations.find(loc => loc.id === locationId);
      if (locationToMove) {
        setAvailableLocations(prev => [...prev, locationToMove]);
        setAssignedLocations(prev => prev.filter(loc => loc.id !== locationId));
      }
      
      setSuccess('Location unassigned successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      // Call callback if provided
      if (onUserUpdate) {
        onUserUpdate();
      }
      
      console.log('✅ Location unassigned successfully');
      
    } catch (error) {
      console.error('❌ Error unassigning location:', error);
      setError('Failed to unassign location');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <MdPerson /> 
            {user?.Name || user?.email || 'User Details'}
            {viewOnly && <span className="view-only-badge">View Only</span>}
          </h3>
          <button className="close-button" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className="modal-body">
          {loading && <div className="loading">Loading user data...</div>}
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {user && !loading && (
            <>
              {/* User Info Section */}
              <div className="user-info-section">
                <h4><MdInfo /> User Information</h4>
                <div className="user-details-grid">
                  <div className="detail-item">
                    <label>Name:</label>
                    <span>{user.Name || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Email:</label>
                    <span>{user.email}</span>
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
                  {buildingId && (
                    <div className="detail-item">
                      <label>Role in Building:</label>
                      <span className={`role-badge ${userRole}`}>{userRole}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <label>Your Role:</label>
                    <span className={`role-badge ${userRoleInBuilding}`}>{userRoleInBuilding}</span>
                  </div>
                </div>
              </div>

              {/* Location Management Section - Only show if not view only and user has permission */}
              {!viewOnly && userRoleInBuilding === 'parent' && buildingId && (
                <div className="device-management-section">
                  <h4><MdLocationOn /> Location Access Management (Building Specific)</h4>
                  
                  {/* Assigned Locations */}
                  <div className="devices-subsection">
                    <h5>Assigned Locations ({assignedLocations.length})</h5>
                    {assignedLocations.length > 0 ? (
                      <div className="devices-grid">
                        {assignedLocations.map(location => (
                          <div key={location.id} className="device-card assigned">
                            <div className="device-info">
                              <div className="device-name">{location.name}</div>
                              <div className="device-details">
                                <span>ID: {location.id}</span>
                                <span>Building: {buildingId}</span>
                                <span>Devices: {locationDevices[location.id]?.length || 0} device(s)</span>
                                {locationDevices[location.id]?.length > 0 && (
                                  <span style={{ fontSize: '11px', color: '#059669', fontStyle: 'italic' }}>
                                    Access to: {locationDevices[location.id].map(d => d.DeviceName || d.id).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              className="device-action-btn unassign"
                              onClick={() => handleUnassignLocation(location.id)}
                              title="Remove access to this location"
                            >
                              <MdRemove />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-devices">No locations assigned to this user in this building</div>
                    )}
                  </div>

                  {/* Available Locations */}
                  <div className="devices-subsection">
                    <h5>Available Locations ({availableLocations.length})</h5>
                    {availableLocations.length > 0 ? (
                      <div className="devices-grid">
                        {availableLocations.map(location => (
                          <div key={location.id} className="device-card available">
                            <div className="device-info">
                              <div className="device-name">{location.name}</div>
                              <div className="device-details">
                                <span>ID: {location.id}</span>
                                <span>Building: {buildingId}</span>
                                <span>Devices: {locationDevices[location.id]?.length || 0} device(s)</span>
                                {locationDevices[location.id]?.length > 0 && (
                                  <span style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>
                                    Contains: {locationDevices[location.id].map(d => d.DeviceName || d.id).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              className="device-action-btn assign"
                              onClick={() => handleAssignLocation(location.id)}
                              title="Give access to this location"
                            >
                              <MdCheck />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-devices">No available locations to assign in this building</div>
                    )}
                  </div>
                </div>
              )}

              {/* Show assigned locations in view-only mode */}
              {viewOnly && assignedLocations.length > 0 && (
                <div className="device-management-section">
                  <h4><MdLocationOn /> Assigned Locations ({assignedLocations.length})</h4>
                  <div className="devices-grid">
                    {assignedLocations.map(location => (
                      <div key={location.id} className="device-card assigned view-only">
                        <div className="device-info">
                          <div className="device-name">{location.name}</div>
                          <div className="device-details">
                            <span>ID: {location.id}</span>
                            <span>Building: {buildingId}</span>
                            <span>Devices: {locationDevices[location.id]?.length || 0} device(s)</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserModal;