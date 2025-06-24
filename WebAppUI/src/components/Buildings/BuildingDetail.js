// src/components/Buildings/BuildingDetail.js - Updated to hide locations and devices for SystemAdmin

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
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
import BuildingAutomationTab from './BuildingAutomationTab';
import buildingService from '../../services/buildingService';
import energyUsageService from '../../services/energyUsageService';
import automationService from '../../services/AutomationService';
import { sendBuildingInvitation } from '../../services/notificationService';
import { isSystemAdmin } from '../../utils/helpers';
import './BuildingDetail.css';

// ==============================================================================
// MAIN BUILDING DETAIL COMPONENT
// ==============================================================================

const BuildingDetail = () => {
  const { buildingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
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
  const [userAssignedLocations, setUserAssignedLocations] = useState([]);
  
  // Location Management State
  const [newLocationName, setNewLocationName] = useState('');
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [isRemovingLocation, setIsRemovingLocation] = useState(false);
  
  // Child Management State
  const [newChildEmail, setNewChildEmail] = useState('');
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  const [emailStatus, setEmailStatus] = useState({
    checking: false,
    exists: false,
    available: false,
    message: ''
  });
  
  // Modal State
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  
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
        return 'admin';
      }

      const role = await buildingService.getUserRoleInBuilding(userEmail, buildingId);
      setUserRoleInBuilding(role);
      
      if (role === 'user') {
        setError('You do not have access to this building');
        return 'user';
      }
      
      return role;
    } catch (err) {
      return 'user';
    }
  }, [userEmail, buildingId]);
  
  // Fetch children data
  const fetchChildrenData = useCallback(async () => {
    try {
      if (userRoleInBuilding === 'parent') {
        const childrenData = await buildingService.getBuildingChildren(buildingId);
        setChildren(childrenData);
      }
    } catch (err) {
    }
  }, [userRoleInBuilding, buildingId]);

  // Get current user's assigned locations for children role
  const getCurrentUserAssignedLocations = useCallback(async () => {
    if (userRoleInBuilding !== 'children') return [];
    
    try {
      const assignedLocs = await buildingService.getUserAssignedLocations(userEmail, buildingId);
      setUserAssignedLocations(assignedLocs);
      return assignedLocs;
    } catch (err) {
      setUserAssignedLocations([]);
      return [];
    }
  }, [userRoleInBuilding, userEmail, buildingId]);

  // Fetch building device IDs for energy usage
  const fetchBuildingDeviceIds = useCallback(async () => {
    try {
      const deviceIds = await energyUsageService.getBuildingDeviceIds(buildingId);
      setBuildingDeviceIds(deviceIds);
    } catch (error) {
      setBuildingDeviceIds([]);
    }
  }, [buildingId]);
  
  // Main data fetching effect
  useEffect(() => {
    const fetchBuildingData = async () => {
      try {
        setLoading(true);
        
        const roleInBuilding = await getUserRoleInBuilding();
        
        if (roleInBuilding === 'user' && !isUserSystemAdmin) {
          setLoading(false);
          return;
        }
        
        // Fetch building details
        const buildingData = await buildingService.getBuildingById(buildingId);
        if (!buildingData) {
          setError('Building not found');
          setLoading(false);
          return;
        }
        
        setBuilding(buildingData);
        setEditData({
          BuildingName: buildingData.BuildingName || '',
          Address: buildingData.Address || '',
          Description: buildingData.Description || ''
        });
        
        // UPDATED: Skip fetching locations and devices for SystemAdmin
        if (roleInBuilding !== 'admin' || !isUserSystemAdmin) {
          const locationsData = await buildingService.getBuildingLocations(buildingId);
          setLocations(locationsData);
      
          
          // Fetch devices based on user role
          if (roleInBuilding === 'children') {
            // For children, only fetch devices in their assigned locations
            const assignedLocations = await getCurrentUserAssignedLocations();
            
            const allDevices = await buildingService.getBuildingDevices(buildingId);
            const accessibleDevices = allDevices.filter(device => 
              assignedLocations.includes(device.Location)
            );
            setDevices(accessibleDevices);
          } else if (roleInBuilding === 'parent') {
            // For parents, fetch all devices
            const devicesData = await buildingService.getBuildingDevices(buildingId);
            setDevices(devicesData);
          }
          
          // Fetch children for parent users
          if (roleInBuilding === 'parent') {
            await fetchChildrenData();
          }
        }

        // Fetch device IDs for energy usage
        await fetchBuildingDeviceIds();
        
      } catch (err) {
        setError('Failed to load building data');
      } finally {
        setLoading(false);
      }
    };
    
    if (buildingId) {
      fetchBuildingData();
    }
  }, [buildingId, getUserRoleInBuilding, fetchChildrenData, isUserSystemAdmin, fetchBuildingDeviceIds, getCurrentUserAssignedLocations]);
  
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
      
      await buildingService.updateBuilding(buildingId, editData, userEmail);
      
      setBuilding(prev => ({
        ...prev,
        ...editData
      }));
      
      setIsEditing(false);
      setSuccess('Building updated successfully');
      
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err) {
      setError('Failed to save building changes: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [editData, userEmail, buildingId]);

  // Delete handler with building deletion notification
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
      
      await buildingService.deleteBuilding(buildingId, userEmail);
      
      navigate('/buildings', { 
        state: { 
          message: `Building "${building.BuildingName || building.id}" has been deleted successfully` 
        }
      });
      
    } catch (err) {
      setError('Failed to delete building: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }, [building, buildingId, navigate, userEmail]);
  
  // Modal handlers
  const handleChildClick = useCallback((childId) => {
    setSelectedUserId(childId);
    setIsUserModalOpen(true);
  }, []);
  
  const handleCloseUserModal = useCallback(() => {
    setIsUserModalOpen(false);
    setSelectedUserId(null);
    fetchChildrenData();
  }, [fetchChildrenData]);
  
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
      
      const createdLocation = await buildingService.addBuildingLocation(
        buildingId, 
        newLocationName.trim(), 
        userEmail
      );
      
      setLocations(prev => [...prev, createdLocation]);
      setNewLocationName('');
      setSuccess('Location added successfully');
      
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err) {
      setError('Failed to add location: ' + err.message);
    } finally {
      setIsAddingLocation(false);
    }
  }, [userRoleInBuilding, newLocationName, buildingId, userEmail]);
  
  const handleRemoveLocation = useCallback(async (locationId) => {
    if (userRoleInBuilding !== 'parent') {
      setError('You do not have permission to remove locations in this building');
      return;
    }
    
    try {
      setIsRemovingLocation(true);
      
      await buildingService.removeBuildingLocation(locationId, buildingId);
      
      setLocations(prev => prev.filter(loc => loc.id !== locationId));
      setSuccess('Location removed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to remove location: ' + err.message);
    } finally {
      setIsRemovingLocation(false);
    }
  }, [userRoleInBuilding, buildingId]);
  
  // Child Management - Email validation
  const checkEmailAvailability = useCallback(async (email) => {
    if (!email || !email.includes('@')) return;
    
    setEmailStatus(prev => ({ ...prev, checking: true, message: 'Checking email...' }));
    
    try {
      const validation = await buildingService.checkEmailAvailability(email.trim(), buildingId);
      setEmailStatus(validation);
    } catch (err) {
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

  // Send invitation
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
      
    } catch (err) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setIsSendingInvitation(false);
    }
  }, [userRoleInBuilding, newChildEmail, emailStatus, userEmail, buildingId, building]);
  
  const handleRemoveChild = useCallback(async (childId, userBuildingId) => {
    if (userRoleInBuilding !== 'parent') {
      setError('Only parents can remove children from this building');
      return;
    }
    
    if (!window.confirm('Are you sure you want to remove this child from the building?')) {
      return;
    }
    
    try {
      await buildingService.removeChildFromBuilding(childId, buildingId);
      setChildren(prev => prev.filter(child => child.id !== childId));
      setSuccess('Child user removed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to remove child user: ' + err.message);
    }
  }, [userRoleInBuilding, buildingId]);

  // Building automation handler
  const handleBuildingAutomation = useCallback(async (automationConfig) => {
    try {
      
      await automationService.saveAutomationState(buildingId, automationConfig);
      
      const energyInfo = automationConfig.energySaved > 0 
        ? ` (Est. ${automationConfig.energySaved}W energy saved)` 
        : '';
      
      setSuccess(`Building automation "${automationConfig.automationTitle}" applied successfully${energyInfo}`);
      setTimeout(() => setSuccess(null), 5000);
      
    } 
    catch (error) {
      setTimeout(() => setError(null), 5000);
    }
  }, [buildingId]);

  // Utility function
  const getLocationName = useCallback((locationId) => {
    const location = locations.find(loc => loc.id === locationId);
    return location ? (location.LocationName || locationId) : locationId;
  }, [locations]);
  
  // Permission checks - moved before early returns
  const permissions = useMemo(() => ({
    canManageLocations: userRoleInBuilding === 'parent',
    canEditBuilding: userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent',
    canDeleteBuilding: userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent',
    canManageChildren: userRoleInBuilding === 'parent',
    canViewChildren: userRoleInBuilding === 'parent',
    // UPDATED: Hide locations view for SystemAdmin
    canViewLocations: userRoleInBuilding !== 'admin' || !isUserSystemAdmin
  }), [userRoleInBuilding, isUserSystemAdmin]);

  // Filter locations for children - moved before early returns
  const displayedLocations = useMemo(() => {
    if (userRoleInBuilding === 'children') {
      return locations.filter(location => userAssignedLocations.includes(location.id));
    }
    return locations;
  }, [locations, userRoleInBuilding, userAssignedLocations]);
  
  // Loading and error states
  if (loading) {
    return (
      <div className="building-detail">
        <div className="loading">Loading building data...</div>
      </div>
    );
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

      <div className="building-info-form">
        {userRoleInBuilding !== 'children' && (
          <div className="info-group">
            <label>Building ID</label>
            <p className="building-id">{building.id}</p>
          </div>
        )}
        
        <div className="info-group">
          <label>
            <MdBusiness /> Building Name
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
        
        {userRoleInBuilding !== 'parent' && userRoleInBuilding !== 'children' && (
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
      </div>
      
      {/* UPDATED: Hide locations section for SystemAdmin */}
      {permissions.canViewLocations && !isSystemAdmin (
        <div className="locations-section">
          <div className="locations-header">
            <h3>
              <MdLocationOn /> 
              {userRoleInBuilding === 'children' 
                ? `My Assigned Locations (${displayedLocations.length})` 
                : `Locations (${displayedLocations.length})`
              }
            </h3>
          </div>
          
          {/* Add location form - only for parents */}
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
          
          {displayedLocations.length > 0 ? (
            <div className="locations-list">
              {displayedLocations.map(location => (
                <div key={location.id} className="location-item">
                  <div className="location-name">{location.LocationName || location.id}</div>
                  <div className="location-details">
                    {userRoleInBuilding !== 'children' && (
                      <span className="location-id">ID: {location.id}</span>
                    )}
                    {location.DateCreated && userRoleInBuilding !== 'children' && (
                      <span className="location-date">Created: {location.DateCreated}</span>
                    )}
                    <span className="location-devices">
                      Devices: {devices.filter(d => d.Location === location.id).length}
                    </span>
                    {userRoleInBuilding === 'children' && (
                      <span style={{ fontSize: '12px', color: '#059669', fontStyle: 'italic' }}>
                        ✓ You have access to this location
                      </span>
                    )}
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
            <p className="no-data-message">
              {userRoleInBuilding === 'children' 
                ? "You have not been assigned to any locations yet. Ask a parent to assign you to locations."
                : "No locations found for this building"
              }
            </p>
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
                {userRoleInBuilding !== 'children' && (
                  <span>ID: {device.id}</span>
                )}
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

  // Children Tab with invitation system
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
        <p className="no-data-message">No children found for this building. Invite users into your building.</p>
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

  // UPDATED: Add Devices tab only for non-SystemAdmin users
  if (permissions.canViewLocations && !isUserSystemAdmin) {
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

  if (userRoleInBuilding === 'parent') {
    tabs.push({
      label: 'Automation',
      content: (
        <BuildingAutomationTab
          building={building}
          userRole={userRoleInBuilding}
          onAutomationApply={handleBuildingAutomation}
        />
      )
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
        <h2>{building?.BuildingName || building?.id || 'Building Detail'}</h2>
      </div>

      {success && <div className="success-message">{success}</div>}
      {error && <div className="error-message">{error}</div>}
      
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
    </div>
  );
};

export default BuildingDetail;