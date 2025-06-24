// src/components/common/UserModal.js - Refactored with component consolidation

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '../../services/firebase';
import { notifyLocationAssigned } from '../../services/notificationService';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { MdClose, MdPerson, MdLocationOn, MdCheck, MdRemove, MdInfo } from 'react-icons/md';
import './UserModal.css';

const UserModal = ({ 
  isOpen, 
  onClose, 
  userId, 
  userRole, 
  userEmail, 
  buildingId = null,
  onUserUpdate = null,
  viewOnly = false
}) => {
  const [user, setUser] = useState(null);
  const [assignedLocations, setAssignedLocations] = useState([]);
  const [availableLocations, setAvailableLocations] = useState([]);
  const [locationDevices, setLocationDevices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [userRoleInBuilding, setUserRoleInBuilding] = useState('user');

  // Get the current user's role in the specific building
  const getCurrentUserRoleInBuilding = useCallback(async () => {
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
      return 'user';
    }
  }, [userEmail, buildingId]);

  // Check if current user is a parent of the viewed user in the specific building
  const checkParentChildRelationship = useCallback(async (childUserId, parentUserEmail) => {
    try {
      // Check direct parent relationship via ParentEmail field
      const childUserDoc = await getDoc(doc(firestore, 'USER', childUserId));
      if (childUserDoc.exists()) {
        const childData = childUserDoc.data();
        if (childData.ParentEmail === parentUserEmail) {
          return true;
        }
      }

      // Check building-based parent-child relationship
      if (buildingId) {
        const currentUserRole = await getCurrentUserRoleInBuilding();
        
        if (currentUserRole === 'parent') {
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
      return false;
    }
  }, [buildingId, getCurrentUserRoleInBuilding]);

  const fetchUserData = useCallback(async () => {
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
        hasPermission = false;
      } else if (currentUserRoleInBuilding === 'parent') {
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
 
      setError('Failed to load user data');
    } finally {
      setLoading(false);
    }
  }, [userId, buildingId, getCurrentUserRoleInBuilding, checkParentChildRelationship, userEmail, viewOnly]);

  // Fetch all locations in the building and their devices
  const fetchBuildingLocationsAndDevices = useCallback(async () => {
    try {
      
      const locationsQuery = query(
        collection(firestore, 'LOCATION'),
        where('Building', '==', buildingId)
      );
      const locationsSnapshot = await getDocs(locationsQuery);
      
      const devicesByLocation = {};
      
      // For each location, get its devices
      for (const locationDoc of locationsSnapshot.docs) {
        const locationId = locationDoc.id;
        
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
      
     
      
    } catch (error) {
    }
  }, [buildingId]);

  // Fetch user's current location assignments
  const fetchUserLocationAssignments = useCallback(async () => {
    try {
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userId),
        where('Building', '==', buildingId)
      );
      
      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      
      if (!userBuildingSnapshot.empty) {
        const userBuildingData = userBuildingSnapshot.docs[0].data();
        const assignedLocationIds = userBuildingData.AssignedLocations || [];
        
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

      }
      
    } catch (error) {

    }
  }, [userId, buildingId]);

  // Auto-assign user to all devices in a location
  const autoAssignUserToLocationDevices = useCallback(async (locationId, userId) => {
    try {
  
      
      const devices = locationDevices[locationId] || [];
      
      for (const device of devices) {
        const currentAssignedTo = device.AssignedTo || [];
        
        // Only add if user is not already assigned
        if (!currentAssignedTo.includes(userId)) {
          const updatedAssignedTo = [...currentAssignedTo, userId];
          
          await updateDoc(doc(firestore, 'DEVICE', device.id), {
            AssignedTo: updatedAssignedTo
          });
          
        
        }
      }
      
    
      
    } catch (error) {
     
    }
  }, [locationDevices]);

  // Auto-unassign user from all devices in a location
  const autoUnassignUserFromLocationDevices = useCallback(async (locationId, userId) => {
    try {
   
      const devices = locationDevices[locationId] || [];
      
      for (const device of devices) {
        const currentAssignedTo = device.AssignedTo || [];
        
        // Only remove if user is currently assigned
        if (currentAssignedTo.includes(userId)) {
          const updatedAssignedTo = currentAssignedTo.filter(id => id !== userId);
          
          await updateDoc(doc(firestore, 'DEVICE', device.id), {
            AssignedTo: updatedAssignedTo
          });
          
          
        }
      }
      
   
      
    } catch (error) {
    
    }
  }, [locationDevices]);

  // Handle assigning location to user
  const handleAssignLocation = useCallback(async (locationId) => {
    try {
      setError(null);
      
    
      
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
      
      await updateDoc(userBuildingDoc.ref, {
        AssignedLocations: updatedAssignedLocations
      });
      
      // Auto-assign user to all devices in this location
      await autoAssignUserToLocationDevices(locationId, userId);
      
      // Update local state
      const locationToMove = availableLocations.find(loc => loc.id === locationId);
      if (locationToMove) {
        setAssignedLocations(prev => [...prev, locationToMove]);
        setAvailableLocations(prev => prev.filter(loc => loc.id !== locationId));
      }
      
      setSuccess('Location assigned successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      if (onUserUpdate) {
        onUserUpdate();
      }
    } catch (error) {
      setError('Failed to assign location');
    }

    try {
      const location = availableLocations.find(loc => loc.id === locationId);
      
      await notifyLocationAssigned(
        userId,
        location?.name || locationId,
        buildingId
      );
    
    } catch (notificationError) {
      
    }
  }, [userId, buildingId, availableLocations, autoAssignUserToLocationDevices, onUserUpdate]);

  // Handle unassigning location from user
  const handleUnassignLocation = useCallback(async (locationId) => {
    try {
      setError(null);
      
     
      
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
      
      await updateDoc(userBuildingDoc.ref, {
        AssignedLocations: updatedAssignedLocations
      });
      
      // Auto-unassign user from all devices in this location
      await autoUnassignUserFromLocationDevices(locationId, userId);
      
      // Update local state
      const locationToMove = assignedLocations.find(loc => loc.id === locationId);
      if (locationToMove) {
        setAvailableLocations(prev => [...prev, locationToMove]);
        setAssignedLocations(prev => prev.filter(loc => loc.id !== locationId));
      }
      
      setSuccess('Location unassigned successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      if (onUserUpdate) {
        onUserUpdate();
      }
      
      
      
    } catch (error) {
  
      setError('Failed to unassign location');
    }
  }, [userId, buildingId, assignedLocations, autoUnassignUserFromLocationDevices, onUserUpdate]);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserData();
    }
  }, [isOpen, userId, buildingId, fetchUserData]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <ModalHeader 
          user={user}
          viewOnly={viewOnly}
          onClose={onClose}
        />

        <div className="modal-body">
          {loading && <div className="loading">Loading user data...</div>}
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {user && !loading && (
            <>
              <UserInfoSection user={user} />

              {!viewOnly && userRoleInBuilding === 'parent' && buildingId && (
                <LocationManagementSection
                  assignedLocations={assignedLocations}
                  availableLocations={availableLocations}
                  locationDevices={locationDevices}
                  onAssignLocation={handleAssignLocation}
                  onUnassignLocation={handleUnassignLocation}
                />
              )}

              {viewOnly && assignedLocations.length > 0 && (
                <ViewOnlyLocationsSection
                  assignedLocations={assignedLocations}
                  locationDevices={locationDevices}
                  buildingId={buildingId}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Modal Header Component
const ModalHeader = ({ user, viewOnly, onClose }) => (
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
);

// User Info Section Component
const UserInfoSection = ({ user }) => (
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
    </div>
  </div>
);

// Location Management Section Component
const LocationManagementSection = ({ 
  assignedLocations, 
  availableLocations, 
  locationDevices, 
  onAssignLocation, 
  onUnassignLocation 
}) => (
  <div className="device-management-section">
    <h4><MdLocationOn /> Location Access Management (Building Specific)</h4>
    
    <LocationSubsection
      title={`Assigned Locations (${assignedLocations.length})`}
      locations={assignedLocations}
      locationDevices={locationDevices}
      actionType="unassign"
      onAction={onUnassignLocation}
      emptyMessage="No locations assigned to this user in this building"
    />

    <LocationSubsection
      title={`Available Locations (${availableLocations.length})`}
      locations={availableLocations}
      locationDevices={locationDevices}
      actionType="assign"
      onAction={onAssignLocation}
      emptyMessage="No available locations to assign in this building"
    />
  </div>
);

// Location Subsection Component
const LocationSubsection = ({ 
  title, 
  locations, 
  locationDevices, 
  actionType, 
  onAction, 
  emptyMessage 
}) => (
  <div className="devices-subsection">
    <h5>{title}</h5>
    {locations.length > 0 ? (
      <div className="devices-grid">
        {locations.map(location => (
          <LocationCard
            key={location.id}
            location={location}
            locationDevices={locationDevices}
            actionType={actionType}
            onAction={onAction}
          />
        ))}
      </div>
    ) : (
      <div className="no-devices">{emptyMessage}</div>
    )}
  </div>
);

// Location Card Component
const LocationCard = ({ location, locationDevices, actionType, onAction }) => {
  const devices = locationDevices[location.id] || [];
  const isAssigned = actionType === 'unassign';

  return (
    <div className={`device-card ${isAssigned ? 'assigned' : 'available'}`}>
      <div className="device-info">
        <div className="device-name">{location.name}</div>
        <div className="device-details">
          <span>ID: {location.id}</span>
          <span>Building: {location.Building}</span>
          <span>Devices: {devices.length} device(s)</span>
          {devices.length > 0 && (
            <span style={{ fontSize: '11px', color: isAssigned ? '#059669' : '#6b7280', fontStyle: 'italic' }}>
              {isAssigned ? 'Auto-assigned to: ' : 'Will auto-assign to: '}
              {devices.map(d => d.DeviceName || d.id).join(', ')}
            </span>
          )}
        </div>
      </div>
      <button
        className={`device-action-btn ${actionType}`}
        onClick={() => onAction(location.id)}
        title={isAssigned ? 
          "Remove access to this location and all its devices" : 
          "Give access to this location and auto-assign to all its devices"
        }
      >
        {isAssigned ? <MdRemove /> : <MdCheck />}
      </button>
    </div>
  );
};

// View Only Locations Section Component
const ViewOnlyLocationsSection = ({ assignedLocations, locationDevices, buildingId }) => (
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
);

export default UserModal;