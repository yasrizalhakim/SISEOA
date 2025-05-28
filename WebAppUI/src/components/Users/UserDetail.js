// src/components/Users/UserDetail.js - Updated with Location-Based Management & Remove from Building
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { firestore } from '../../services/firebase';
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
import { 
  MdArrowBack, 
  MdPerson, 
  MdEmail, 
  MdPhone, 
  MdLocationOn, 
  MdBusiness,
  MdEdit,
  MdSave,
  MdCancel,
  MdAssignmentInd,
  MdFamilyRestroom,
  MdRemoveCircle,
  MdWarning
} from 'react-icons/md';
import TabPanel from '../common/TabPanel';
import UserModal from '../common/UserModal';
import { 
  isSystemAdmin, 
  getUserRoleInBuilding, 
  getUserBuildingRoles,
  canManageUsers
} from '../../utils/helpers';
import './UserDetail.css';

const UserDetail = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  
  const [user, setUser] = useState(null);
  const [userBuildings, setUserBuildings] = useState([]);
  const [assignedLocations, setAssignedLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  
  // User permissions
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [canManageThisUser, setCanManageThisUser] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('user');
  const [canRemoveFromBuildings, setCanRemoveFromBuildings] = useState(false);
  
  // Location management modal
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  
  // Edit form data
  const [editData, setEditData] = useState({
    Name: '',
    ContactNo: ''
  });
  
  const currentUserEmail = localStorage.getItem('userEmail') || '';

  // Fetch user data and check permissions
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔍 Fetching user details for:', userId);
        
        // Check if current user is SystemAdmin
        const isAdmin = await isSystemAdmin(currentUserEmail);
        setIsUserSystemAdmin(isAdmin);
        
        // Fetch user from Firestore
        const userDoc = await getDoc(doc(firestore, 'USER', userId));
        if (!userDoc.exists()) {
          setError('User not found');
          setLoading(false);
          return;
        }
        
        const userData = { id: userId, email: userId, ...userDoc.data() };
        setUser(userData);
        
        // Set edit form data
        setEditData({
          Name: userData.Name || '',
          ContactNo: userData.ContactNo || ''
        });
        
        console.log('👤 User data loaded:', userData);
        
        // Check if current user can manage this user
        const canManage = await checkUserManagementPermission(userId, currentUserEmail);
        setCanManageThisUser(canManage);
        
        // Check if current user can remove this user from buildings (only parents)
        const canRemove = await checkRemoveFromBuildingPermission(userId, currentUserEmail);
        setCanRemoveFromBuildings(canRemove);
        
        // Get user's building relationships
        await fetchUserBuildings(userId);
        
        // Get user's assigned locations across all buildings
        await fetchUserLocations(userId);
        
      } catch (error) {
        console.error('❌ Error fetching user data:', error);
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };
    
    if (userId && currentUserEmail) {
      fetchUserData();
    }
  }, [userId, currentUserEmail]);

  // Check if current user can manage the target user
  const checkUserManagementPermission = async (targetUserId, managerEmail) => {
    try {
      // SystemAdmin can manage all users
      if (await isSystemAdmin(managerEmail)) {
        setCurrentUserRole('systemadmin');
        return true;
      }

      // Get target user's data to check parent relationship
      const targetUserDoc = await getDoc(doc(firestore, 'USER', targetUserId));
      if (!targetUserDoc.exists()) return false;
      
      const targetUserData = targetUserDoc.data();
      
      // Check if manager is parent of target user
      if (targetUserData.ParentEmail === managerEmail) {
        setCurrentUserRole('parent');
        return true;
      }
      
      // Check if both users are in same building where manager has admin/parent role
      const managerBuildingRoles = await getUserBuildingRoles(managerEmail);
      const targetUserBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', targetUserId)
      );
      const targetUserBuildings = await getDocs(targetUserBuildingsQuery);
      
      for (const targetBuildingDoc of targetUserBuildings.docs) {
        const targetBuildingData = targetBuildingDoc.data();
        const buildingId = targetBuildingData.Building;
        
        if (managerBuildingRoles.has(buildingId)) {
          const managerRole = managerBuildingRoles.get(buildingId);
          if (managerRole === 'admin' || managerRole === 'parent') {
            setCurrentUserRole(managerRole);
            return true;
          }
        }
      }
      
      setCurrentUserRole('user');
      return false;
    } catch (error) {
      console.error('Error checking user management permission:', error);
      return false;
    }
  };

  // Check if current user can remove target user from buildings (only parents)
  const checkRemoveFromBuildingPermission = async (targetUserId, managerEmail) => {
    try {
      // Get target user's data to check parent relationship
      const targetUserDoc = await getDoc(doc(firestore, 'USER', targetUserId));
      if (!targetUserDoc.exists()) return false;
      
      const targetUserData = targetUserDoc.data();
      
      // Only direct parents can remove children from buildings
      if (targetUserData.ParentEmail === managerEmail) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking remove permission:', error);
      return false;
    }
  };

  // Fetch user's building relationships
  const fetchUserBuildings = async (targetUserId) => {
    try {
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', targetUserId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      
      const buildingsList = [];
      for (const userBuildingDoc of userBuildingsSnapshot.docs) {
        const userBuildingData = userBuildingDoc.data();
        const buildingId = userBuildingData.Building;
        
        if (buildingId === 'SystemAdmin') continue;
        
        // Get building details
        const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
        if (buildingDoc.exists()) {
          buildingsList.push({
            id: buildingId,
            userBuildingId: userBuildingDoc.id, // Store for removal
            ...buildingDoc.data(),
            userRole: userBuildingData.Role,
            assignedLocations: userBuildingData.AssignedLocations || []
          });
        }
      }
      
      setUserBuildings(buildingsList);
      console.log('🏢 User buildings:', buildingsList.length);
    } catch (error) {
      console.error('Error fetching user buildings:', error);
    }
  };

  // Fetch user's assigned locations across all buildings
  const fetchUserLocations = async (targetUserId) => {
    try {
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', targetUserId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      
      const allLocations = [];
      
      for (const userBuildingDoc of userBuildingsSnapshot.docs) {
        const userBuildingData = userBuildingDoc.data();
        const buildingId = userBuildingData.Building;
        const assignedLocationIds = userBuildingData.AssignedLocations || [];
        
        if (buildingId === 'SystemAdmin' || assignedLocationIds.length === 0) continue;
        
        // Get location details for each assigned location
        for (const locationId of assignedLocationIds) {
          try {
            const locationDoc = await getDoc(doc(firestore, 'LOCATION', locationId));
            if (locationDoc.exists()) {
              const locationData = locationDoc.data();
              
              // Get building name
              const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
              const buildingName = buildingDoc.exists() ? 
                (buildingDoc.data().BuildingName || buildingId) : buildingId;
              
              // Get devices in this location
              const devicesQuery = query(
                collection(firestore, 'DEVICE'),
                where('Location', '==', locationId)
              );
              const devicesSnapshot = await getDocs(devicesQuery);
              const devices = devicesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              
              allLocations.push({
                id: locationId,
                name: locationData.LocationName || locationId,
                buildingId: buildingId,
                buildingName: buildingName,
                devices: devices
              });
            }
          } catch (locationError) {
            console.error(`Error fetching location ${locationId}:`, locationError);
          }
        }
      }
      
      setAssignedLocations(allLocations);
      console.log('📍 User locations:', allLocations.length);
    } catch (error) {
      console.error('Error fetching user locations:', error);
    }
  };

  // Handle edit mode toggle
  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset form data
      setEditData({
        Name: user.Name || '',
        ContactNo: user.ContactNo || ''
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
      
      console.log('💾 Saving user changes...');
      
      // Validate required fields
      if (!editData.Name.trim()) {
        setError('Name is required');
        setSaving(false);
        return;
      }
      
      // Prepare update data
      const updateData = {
        Name: editData.Name.trim(),
        ContactNo: editData.ContactNo.trim(),
        LastModified: serverTimestamp(),
        LastModifiedBy: currentUserEmail
      };
      
      // Update user in Firestore
      await updateDoc(doc(firestore, 'USER', userId), updateData);
      
      // Update local state
      setUser(prev => ({
        ...prev,
        ...updateData
      }));
      
      setIsEditing(false);
      setSuccess('User updated successfully');
      
      setTimeout(() => setSuccess(null), 3000);
      
      console.log('✅ User updated successfully');
      
    } catch (error) {
      console.error('❌ Error saving user:', error);
      setError('Failed to save user changes');
    } finally {
      setSaving(false);
    }
  };

  // Handle location management
  const handleManageLocations = (buildingId) => {
    setSelectedBuildingId(buildingId);
    setIsLocationModalOpen(true);
  };

  // Close location modal
  const handleCloseLocationModal = () => {
    setIsLocationModalOpen(false);
    setSelectedBuildingId(null);
    // Refresh data
    fetchUserBuildings(userId);
    fetchUserLocations(userId);
  };

  // Handle removing user from building
  const handleRemoveFromBuilding = async (buildingId, buildingName, userBuildingId) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove ${user.Name || user.email} from "${buildingName}"?\n\n` +
      `This will:\n` +
      `• Remove their access to the building\n` +
      `• Remove all location assignments in this building\n` +
      `• Remove access to all devices in this building\n` +
      `• NOT delete their user account\n\n` +
      `This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      setRemoving(true);
      setError(null);
      
      console.log('🗑️ Removing user from building...');
      
      // Delete the user-building relationship
      await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingId));
      
      // Update local state
      setUserBuildings(prev => prev.filter(building => building.id !== buildingId));
      setAssignedLocations(prev => prev.filter(location => location.buildingId !== buildingId));
      
      setSuccess(`User removed from building "${buildingName}" successfully`);
      
      console.log('✅ User removed from building successfully');
      
      // Redirect to building page after a short delay
      setTimeout(() => {
        navigate(`/buildings/detail/${buildingId}`, {
          state: {
            message: `${user.Name || user.email} has been removed from the building successfully`
          }
        });
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error removing user from building:', error);
      setError('Failed to remove user from building: ' + error.message);
    } finally {
      setRemoving(false);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    navigate('/users');
  };

  if (loading) {
    return <div className="loading">Loading user details...</div>;
  }

  if (error && !user) {
    return (
      <div className="user-detail">
        <div className="detail-header">
          <button className="back-button" onClick={handleBack}>
            <MdArrowBack /> Back
          </button>
          <h2>User Detail</h2>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  // Prepare tabs content
  const tabs = [
    {
      label: 'User Info',
      content: (
        <UserInfoTab
          user={user}
          userBuildings={userBuildings}
          isEditing={isEditing}
          editData={editData}
          saving={saving}
          removing={removing}
          canManageThisUser={canManageThisUser}
          canRemoveFromBuildings={canRemoveFromBuildings}
          currentUserRole={currentUserRole}
          isUserSystemAdmin={isUserSystemAdmin}
          onEditToggle={handleEditToggle}
          onInputChange={handleInputChange}
          onSave={handleSave}
          onRemoveFromBuilding={handleRemoveFromBuilding}
          error={error}
          success={success}
        />
      )
    },
    {
      label: 'Location Access',
      content: (
        <LocationAccessTab
          user={user}
          userBuildings={userBuildings}
          assignedLocations={assignedLocations}
          canManageThisUser={canManageThisUser}
          currentUserRole={currentUserRole}
          onManageLocations={handleManageLocations}
        />
      )
    }
  ];

  return (
    <div className="user-detail">
      <div className="detail-header">
        <button className="back-button" onClick={handleBack}>
          <MdArrowBack /> Back
        </button>
        <h2>{user.Name || user.email}</h2>
      </div>
      
      <TabPanel tabs={tabs} />
      
      {/* Location Management Modal */}
      {canManageThisUser && selectedBuildingId && (
        <UserModal
          isOpen={isLocationModalOpen}
          onClose={handleCloseLocationModal}
          userId={userId}
          userRole={currentUserRole}
          userEmail={currentUserEmail}
          buildingId={selectedBuildingId}
          onUserUpdate={handleCloseLocationModal}
        />
      )}
    </div>
  );
};

// User Info Tab Component - Updated with Remove from Building functionality
const UserInfoTab = ({ 
  user, 
  userBuildings, 
  isEditing, 
  editData, 
  saving, 
  removing,
  canManageThisUser, 
  canRemoveFromBuildings,
  currentUserRole,
  isUserSystemAdmin,
  onEditToggle, 
  onInputChange, 
  onSave, 
  onRemoveFromBuilding,
  error, 
  success 
}) => (
  <div className="user-info-tab">
    {error && <div className="error-message">{error}</div>}
    {success && <div className="success-message">{success}</div>}
    
    {/* Edit Controls */}
    {canManageThisUser && (
      <div className="user-actions">
        {!isEditing ? (
          <button className="edit-button" onClick={onEditToggle}>
            <MdEdit /> Edit User
          </button>
        ) : (
          <div className="edit-actions">
            <button 
              className="save-button" 
              onClick={onSave}
              disabled={saving || !editData.Name.trim()}
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
      </div>
    )}
    
    {/* User Information Form */}
    <div className="user-info-form">
      <div className="info-group">
        <label>User ID</label>
        <p className="user-id">{user.id}</p>
      </div>
      
      <div className="info-group">
        <label>
          <MdPerson /> Name *
        </label>
        {isEditing ? (
          <input
            type="text"
            name="Name"
            value={editData.Name}
            onChange={onInputChange}
            placeholder="Enter user name"
            disabled={saving}
            className={editData.Name.trim() ? 'input-valid' : ''}
          />
        ) : (
          <p>{user.Name || 'No name provided'}</p>
        )}
      </div>
      
      <div className="info-group">
        <label>
          <MdEmail /> Email
        </label>
        <p className="user-email">{user.Email || user.email}</p>
      </div>
      
      <div className="info-group">
        <label>
          <MdPhone /> Contact Number
        </label>
        {isEditing ? (
          <input
            type="tel"
            name="ContactNo"
            value={editData.ContactNo}
            onChange={onInputChange}
            placeholder="Enter contact number"
            disabled={saving}
          />
        ) : (
          <p>{user.ContactNo || 'No contact number provided'}</p>
        )}
      </div>
      
      {user.ParentEmail && (
        <div className="info-group">
          <label>
            <MdFamilyRestroom /> Parent Email
          </label>
          <p className="parent-email">{user.ParentEmail}</p>
        </div>
      )}
      
      <div className="info-group">
        <label>User Type</label>
        <p>
          <span className={`role-badge ${user.role || 'user'}`}>
            {user.role === 'parent' ? 'Parent' : user.role === 'children' ? 'Child' : 'User'}
          </span>
        </p>
      </div>

      {user.LastModifiedBy && (
        <div className="info-group">
          <label>Last Modified By</label>
          <p>{user.LastModifiedBy}</p>
        </div>
      )}
    </div>
    
    {/* Building Access Section with Remove Functionality */}
    {userBuildings.length > 0 && (
      <div className="building-access-section">
        <h3>
  <MdBusiness /> Building Access ({userBuildings.length})
  {userBuildings.length > 1 && (
    <span style={{ 
      fontSize: '12px', 
      fontWeight: '400', 
      color: '#6b7280',
      marginLeft: '8px'
    }}>
      Multi-role user
    </span>
  )}
</h3>
        
        <div className="buildings-list">
          {userBuildings.map(building => (
            <div key={building.id} className="building-item">
              <div className="building-name">{building.BuildingName || building.id}</div>
              <div className="building-details">
                <span className="building-address">ID: {building.id}</span>
                {building.Address && (
                  <span className="building-address">
                    <MdLocationOn /> {building.Address}
                  </span>
                )}
                <span className="building-role-info">
  Role: <span className={`role-badge ${building.userRole}`}>
    {building.userRole}
  </span>
  {building.userRole === 'parent' && (
    <span style={{ fontSize: '11px', color: '#059669', marginLeft: '5px' }}>
      (Can manage this building)
    </span>
  )}
  {building.userRole === 'children' && (
    <span style={{ fontSize: '11px', color: '#8b5cf6', marginLeft: '5px' }}>
      (Location-based access)
    </span>
  )}
</span>
                <span className="building-role-info">
                  Locations: {building.assignedLocations?.length || 0} assigned
                </span>
              </div>
              
              {/* Remove from Building Button - Only for parents and if user is a child */}
              {canRemoveFromBuildings && building.userRole === 'children' && (
                <button
                  className="remove-child-btn"
                  onClick={() => onRemoveFromBuilding(
                    building.id, 
                    building.BuildingName || building.id,
                    building.userBuildingId
                  )}
                  disabled={removing}
                  title="Remove from this building"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '10px',
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px'
                  }}
                >
                  <MdRemoveCircle />
                </button>
              )}
            </div>
          ))}
        </div>
        
        {/* Warning for Remove Functionality */}
        {canRemoveFromBuildings && userBuildings.some(b => b.userRole === 'children') && (
          <div className="warning-message" style={{ marginTop: '15px' }}>
            <MdWarning /> You can remove this user from buildings where they have 'children' role. 
            This will remove their access to the building and all devices within it.
          </div>
        )}
      </div>
    )}
  </div>
);

// Location Access Tab Component - Updated for Location-Based Management
const LocationAccessTab = ({ 
  user, 
  userBuildings,
  assignedLocations, 
  canManageThisUser, 
  currentUserRole,
  onManageLocations 
}) => (
  <div className="device-access-tab">
    <div className="device-access-header">
      <h3>
        <MdLocationOn /> Location Access ({assignedLocations.length})
      </h3>
    </div>
    
    {/* Building-Specific Location Management */}
    {userBuildings.length > 0 && canManageThisUser && (
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ marginBottom: '15px', color: '#1e293b' }}>Manage by Building:</h4>
        <div className="buildings-list">
          {userBuildings.map(building => (
            <div key={building.id} className="building-item" style={{ position: 'relative' }}>
              <div className="building-name">{building.BuildingName || building.id}</div>
              <div className="building-details">
                <span>Role: {building.userRole}</span>
                <span>Assigned Locations: {building.assignedLocations?.length || 0}</span>
              </div>
              {building.userRole === 'children' && currentUserRole === 'parent' && (
                <button 
                  className="manage-devices-btn" 
                  onClick={() => onManageLocations(building.id)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)'
                  }}
                >
                  <MdAssignmentInd /> Manage Locations
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
    
    {/* Current Location Access Display */}
    {assignedLocations.length > 0 ? (
      <div className="devices-list">
        {assignedLocations.map(location => (
          <div key={location.id} className="device-item">
            <div className="device-name">{location.name}</div>
            <div className="device-details">
              <div className="detail-item">
                <span className="detail-label">Location ID:</span>
                <span className="detail-value">{location.id}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Building:</span>
                <span className="detail-value">{location.buildingName}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Devices:</span>
                <span className="detail-value">{location.devices.length} device(s)</span>
              </div>
              {location.devices.length > 0 && (
                <div className="detail-item">
                  <span className="detail-label">Device Access:</span>
                  <span className="detail-value" style={{ fontSize: '12px', color: '#059669' }}>
                    {location.devices.map(d => d.DeviceName || d.id).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="no-devices">
        <div className="no-data-content">
          <h4>No Location Access</h4>
          <p>
            {canManageThisUser 
              ? `This user has no location access assigned. Use the "Manage Locations" button to assign locations.`
              : 'This user has no location access assigned to them.'
            }
          </p>
        </div>
      </div>
    )}
  </div>
);

export default UserDetail;