// src/components/Users/UserDetail.js - Updated to show only parent buildings for SystemAdmin view
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
  MdWarning,
  MdPersonRemove // Added for delete child functionality
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
        
      
        // Check if current user can manage this user
        const canManage = await checkUserManagementPermission(userId, currentUserEmail);
        setCanManageThisUser(canManage);
        
        // Check if current user can remove this user from buildings
        const canRemove = await checkRemoveFromBuildingPermission(userId, currentUserEmail);
        setCanRemoveFromBuildings(canRemove);
        
        // Get user's building relationships (filtered by building-specific parent-child relationship)
        await fetchUserBuildings(userId, userData);
        
        // Get user's assigned locations across filtered buildings (only if not SystemAdmin viewing)
        if (!isAdmin) {
          await fetchUserLocations(userId);
        }
        
      } catch (error) {
       
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };
    
    if (userId && currentUserEmail) {
      fetchUserData();
    }
  }, [userId, currentUserEmail]);

  // UPDATED: Check if current user can manage the target user using getUserBuildingRoles helper
  const checkUserManagementPermission = async (targetUserId, managerEmail) => {
    try {
      // SystemAdmin can view all users but cannot edit them
      if (await isSystemAdmin(managerEmail)) {
        setCurrentUserRole('systemadmin');
        return false; // SystemAdmin can view but not manage/edit
      }

      // Use getUserBuildingRoles helper to get roles for both users
      const managerBuildingRoles = await getUserBuildingRoles(managerEmail);
      const targetUserBuildingRoles = await getUserBuildingRoles(targetUserId);
      
      let hasParentChildRelation = false;
      let hasAdminRelation = false;
      
      // Check each building where target user has access
      for (const [buildingId, targetRole] of targetUserBuildingRoles) {
        if (buildingId === 'SystemAdmin') continue;
        
        const managerRole = managerBuildingRoles.get(buildingId);
        if (managerRole) {
          // Parent-child relationship: manager has 'parent' role, target has 'children' role in same building
          if (managerRole === 'parent' && targetRole === 'children') {
            hasParentChildRelation = true;
            setCurrentUserRole('parent');
          }
          // Admin relationship: manager has 'admin' role
          else if (managerRole === 'admin') {
            hasAdminRelation = true;
            setCurrentUserRole('admin');
          }
        }
      }
      
      // Self-management: users can manage themselves
      if (managerEmail === targetUserId) {
        setCurrentUserRole('self');
        return true;
      }
      
      // Priority: parent-child > admin > none
      if (hasParentChildRelation) {
        return true;
      } else if (hasAdminRelation) {
        return true;
      }
      
      setCurrentUserRole('user');
      return false;
    } catch (error) {
   
      return false;
    }
  };

  // UPDATED: Check if current user can remove target user from buildings using getUserBuildingRoles helper
  const checkRemoveFromBuildingPermission = async (targetUserId, managerEmail) => {
    try {
      // SystemAdmin cannot remove users from buildings (view-only access)
      if (await isSystemAdmin(managerEmail)) {
        return false;
      }
      
      // Use getUserBuildingRoles helper to get roles for both users
      const managerBuildingRoles = await getUserBuildingRoles(managerEmail);
      const targetUserBuildingRoles = await getUserBuildingRoles(targetUserId);
      
      // Check if there's any building where manager is parent and target is children
      for (const [buildingId, targetRole] of targetUserBuildingRoles) {
        if (buildingId === 'SystemAdmin') continue;
        
        const managerRole = managerBuildingRoles.get(buildingId);
        if (managerRole === 'parent' && targetRole === 'children') {
          return true;
        }
      }
      
      return false;
    } catch (error) {
    
      return false;
    }
  };

  // UPDATED: Fetch user's building relationships - SystemAdmin shows only parent buildings
  const fetchUserBuildings = async (targetUserId, targetUserData) => {
    try {
     
      // Use getUserBuildingRoles helper to get user's building roles
      const targetUserBuildingRoles = await getUserBuildingRoles(targetUserId);
     
      
      // Get current user's building roles for permission checking (only if not SystemAdmin)
      let currentUserBuildingRoles = new Map();
      if (!isUserSystemAdmin) {
        currentUserBuildingRoles = await getUserBuildingRoles(currentUserEmail);
    
      }
      
      const buildingsList = [];
      
      // Get USERBUILDING documents for assignedLocations and userBuildingId
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', targetUserId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      const userBuildingMap = new Map();
      userBuildingsSnapshot.forEach(doc => {
        const data = doc.data();
        userBuildingMap.set(data.Building, {
          id: doc.id,
          assignedLocations: data.AssignedLocations || []
        });
      });
      
    
      
      for (const [buildingId, userRole] of targetUserBuildingRoles) {
        // Skip SystemAdmin building
        if (buildingId === 'SystemAdmin') {
          continue;
        }
        
       
        // Determine if this building should be shown based on current user's permissions
        let shouldShowBuilding = false;
        
        if (isUserSystemAdmin) {
          // UPDATED: SystemAdmin can only see buildings where target user has 'parent' role
        
          
          if (userRole === 'parent') {
            shouldShowBuilding = true;
          
          } else {
           
          }
        } else if (currentUserEmail === targetUserId) {
          // Users can see their own building access
          shouldShowBuilding = true;
          
        } else {
          // For non-SystemAdmin users, check parent-child or admin relationships
          const currentUserRoleInBuilding = currentUserBuildingRoles.get(buildingId);
          
          if (currentUserRoleInBuilding) {
            // Show building if current user is parent and target user is children in same building
            if (currentUserRoleInBuilding === 'parent' && userRole === 'children') {
              shouldShowBuilding = true;
              
            }
            // Show building if current user is admin (admin can see all users in building)
            else if (currentUserRoleInBuilding === 'admin') {
              shouldShowBuilding = true;
             
            } else {
              console.log(` No valid relationship in building ${buildingId} (current: ${currentUserRoleInBuilding}, target: ${userRole})`);
            }
          } else {
            console.log(`Current user has no role in building ${buildingId}`);
          }
        }
        
        if (shouldShowBuilding) {
          // Get building details from BUILDING collection
          const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
          if (buildingDoc.exists()) {
            const buildingData = buildingDoc.data();
            const userBuildingInfo = userBuildingMap.get(buildingId);
            
            buildingsList.push({
              id: buildingId,
              userBuildingId: userBuildingInfo?.id, // Store USERBUILDING document ID for removal
              ...buildingData,
              userRole: userRole, // Role from getUserBuildingRoles
              assignedLocations: userBuildingInfo?.assignedLocations || []
            });
            
          } else {
            console.log(`Building document not found for ID: ${buildingId}`);
          }
        }
      }
      
      setUserBuildings(buildingsList);
    
      
      if (isUserSystemAdmin) {
        
      }
      
    } catch (error) {
    
    }
  };

  // UPDATED: Fetch user's assigned locations using getUserBuildingRoles helper for access validation
  const fetchUserLocations = async (targetUserId) => {
    try {
      
      
      // Use getUserBuildingRoles helper to get user's building roles
      const targetUserBuildingRoles = await getUserBuildingRoles(targetUserId);
      const currentUserBuildingRoles = await getUserBuildingRoles(currentUserEmail);
      
      // Get USERBUILDING documents for assignedLocations
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', targetUserId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      const userBuildingMap = new Map();
      userBuildingsSnapshot.forEach(doc => {
        const data = doc.data();
        userBuildingMap.set(data.Building, data.AssignedLocations || []);
      });
      
      const allLocations = [];
      
      for (const [buildingId, targetUserRole] of targetUserBuildingRoles) {
        if (buildingId === 'SystemAdmin') continue;
        
        const assignedLocationIds = userBuildingMap.get(buildingId) || [];
        if (assignedLocationIds.length === 0) continue;
        
      
        
        // Check if current user can see locations in this building using getUserBuildingRoles
        let canSeeBuilding = false;
        
        if (isUserSystemAdmin || currentUserEmail === targetUserId) {
          canSeeBuilding = true;
         
        } else {
          // Validate current user's role in this building using getUserBuildingRoles
          const currentUserRole = currentUserBuildingRoles.get(buildingId);
          
          if (currentUserRole) {
            // Can see if parent-child relationship or admin access
            if ((currentUserRole === 'parent' && targetUserRole === 'children') || 
                currentUserRole === 'admin') {
              canSeeBuilding = true;
              
            } else {
              console.log(`Location access denied - No valid role relationship (current: ${currentUserRole}, target: ${targetUserRole})`);
            }
          } else {
            console.log(`Location access denied - Current user has no role in building ${buildingId}`);
          }
        }
        
        if (!canSeeBuilding) {
          continue;
        }
        
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
      
      
    } catch (error) {
      console.error('Error saving user:', error);
      setError('Failed to save user changes');
    } finally {
      setSaving(false);
    }
  };

  // NEW: Handle completely deleting child from all parent buildings using getUserBuildingRoles
  const handleDeleteChild = async () => {
    try {
      // Use getUserBuildingRoles to get current user's parent buildings
      const currentUserBuildingRoles = await getUserBuildingRoles(currentUserEmail);
      const targetUserBuildingRoles = await getUserBuildingRoles(userId);
      
      // Find buildings where current user is parent
      const parentBuildingIds = [];
      for (const [buildingId, role] of currentUserBuildingRoles) {
        if (buildingId !== 'SystemAdmin' && role === 'parent') {
          parentBuildingIds.push(buildingId);
        }
      }
      
      if (parentBuildingIds.length === 0) {
        setError('No buildings found where you are the parent.');
        return;
      }
      
      // Get building names for confirmation - only where target user is children
      const buildingNames = [];
      const validRemovalBuildings = [];
      
      for (const buildingId of parentBuildingIds) {
        const targetUserRole = targetUserBuildingRoles.get(buildingId);
        if (targetUserRole === 'children') {
          const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
          const buildingName = buildingDoc.exists() ? 
            (buildingDoc.data().BuildingName || buildingId) : buildingId;
          buildingNames.push(buildingName);
          validRemovalBuildings.push(buildingId);
        }
      }
      
      if (buildingNames.length === 0) {
        setError('No relationships found to remove. This user may not be your child in any buildings.');
        return;
      }
      
      const confirmed = window.confirm(
        `Are you sure you want to completely remove ${user.Name || user.email} from all your buildings?\n\n` +
        `Buildings affected:\n${buildingNames.map(name => `• ${name}`).join('\n')}\n\n` +
        `This will:\n` +
        `• Remove them from all buildings listed above\n` +
        `• Remove all their location assignments in those buildings\n` +
        `• Remove access to all devices in those buildings\n` +
        `• NOT delete their user account\n\n` +
        `This action cannot be undone.`
      );
      
      if (!confirmed) return;
      
      setRemoving(true);
      setError(null);
      
      // Remove child from all valid parent buildings
      let removedCount = 0;
      const removedBuildings = [];
      
      // Get USERBUILDING documents to delete
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userId)
      );
      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      
      for (const userBuildingDoc of userBuildingsSnapshot.docs) {
        const data = userBuildingDoc.data();
        const buildingId = data.Building;
        const role = data.Role;
        
        if (validRemovalBuildings.includes(buildingId) && role === 'children') {
          await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingDoc.id));
          removedCount++;
          
          // Get building name for success message
          const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
          const buildingName = buildingDoc.exists() ? 
            (buildingDoc.data().BuildingName || buildingId) : buildingId;
          removedBuildings.push(buildingName);
          
          console.log(`Removed child from building ${buildingId}`);
        }
      }
      
      if (removedCount === 0) {
        setError('No relationships found to remove. This user may not be your child in any buildings.');
        return;
      }
      
      setSuccess(
        `Successfully removed ${user.Name || user.email} from ${removedCount} building(s): ${removedBuildings.join(', ')}`
      );
      
      // Redirect to users page after a short delay
      setTimeout(() => {
        navigate('/users', {
          state: {
            message: `${user.Name || user.email} has been removed from all your buildings successfully`
          }
        });
      }, 2000);
      
    } catch (error) {
      console.error('Error removing child:', error);
      setError('Failed to remove child: ' + error.message);
    } finally {
      setRemoving(false);
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
    if (user) {
      fetchUserBuildings(userId, user);
      fetchUserLocations(userId);
    }
  };

  // UPDATED: Handle removing user from building with getUserBuildingRoles validation
  const handleRemoveFromBuilding = async (buildingId, buildingName, userBuildingId) => {
    // Additional validation: ensure current user can remove from this building
    if (!canRemoveFromBuildings) {
      setError('You do not have permission to remove this user from buildings.');
      return;
    }
    
    // Verify parent-child relationship in this specific building using getUserBuildingRoles
    try {
      const currentUserBuildingRoles = await getUserBuildingRoles(currentUserEmail);
      const targetUserBuildingRoles = await getUserBuildingRoles(userId);
      
      const currentUserRole = currentUserBuildingRoles.get(buildingId);
      const targetUserRole = targetUserBuildingRoles.get(buildingId);
      
      if (currentUserRole !== 'parent' || targetUserRole !== 'children') {
        setError('You can only remove children from buildings where you are the parent.');
        return;
      }
    } catch (validationError) {
      setError('Failed to validate removal permissions.');
      return;
    }
    
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
      // Delete the user-building relationship
      await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingId));
      
      // Update local state
      setUserBuildings(prev => prev.filter(building => building.id !== buildingId));
      setAssignedLocations(prev => prev.filter(location => location.buildingId !== buildingId));
      
      setSuccess(`User removed from building "${buildingName}" successfully`);
      
      // Redirect to building page after a short delay
      setTimeout(() => {
        navigate(`/buildings/detail/${buildingId}`, {
          state: {
            message: `${user.Name || user.email} has been removed from the building successfully`
          }
        });
      }, 2000);
      
    } catch (error) {
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

  // UPDATED: Prepare tabs content - Hide Location Access tab for SystemAdmin
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
          onDeleteChild={handleDeleteChild} // NEW: Pass delete child function
          onRemoveFromBuilding={handleRemoveFromBuilding}
          error={error}
          success={success}
        />
      )
    }
  ];

  // UPDATED: Only add Location Access tab if not SystemAdmin
  if (!isUserSystemAdmin) {
    tabs.push({
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
    });
  }

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

// UPDATED: User Info Tab Component - SystemAdmin shows only parent buildings
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
  onDeleteChild, // NEW: Delete child function
  onRemoveFromBuilding,
  error, 
  success 
}) => (
  <div className="user-info-tab">
    {error && <div className="error-message">{error}</div>}
    {success && <div className="success-message">{success}</div>}
    
    {/* UPDATED: Edit Controls - Hide edit button for SystemAdmin */}
    {canManageThisUser && !isUserSystemAdmin && (
      <div className="user-actions">
        {currentUserRole === 'parent' ? (
          // Show delete all button for parents viewing children
          <button 
            className="delete-button" 
            onClick={onDeleteChild}
            disabled={removing}
          >
            <MdPersonRemove /> {removing ? 'Removing...' : 'Remove from All Buildings'}
          </button>
        ) : (
          // Show edit functionality for other roles (admin, self) - but not systemadmin
          !isEditing ? (
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
          )
        )}
      </div>
    )}
    
    {/* User Information Form - UPDATED: Show read-only for SystemAdmin */}
    <div className="user-info-form">
      <div className="info-group">
        <label>
          <MdPerson /> Name
        </label>
        <p className="user-name">{user.name || user.Name}</p>
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
        <p className="user-phone">{user.ContactNo}</p>
      </div>
      
      {user.LastModifiedBy && (
        <div className="info-group">
          <label>Last Modified By</label>
          <p>{user.LastModifiedBy}</p>
        </div>
      )}
    </div>
    
    {/* UPDATED: Building Access Section - SystemAdmin shows only parent buildings */}
    {userBuildings.length > 0 && (
      <div className="building-access-section">
        <h3>
          <MdBusiness /> Building Access ({userBuildings.length})
          {isUserSystemAdmin && (
            <span style={{ 
              fontSize: '12px', 
              fontWeight: '400', 
              color: '#6b7280',
              marginLeft: '8px'
            }}>
              (Buildings where user is parent)
            </span>
          )}
        </h3>
        
        <div className="buildings-list">
          {userBuildings.map(building => (
            <div key={building.id} className="building-item">
              <div className="building-name">{building.BuildingName || building.id}</div>
              <div className="building-details">
                {building.Address && (
                  <span className="building-address">
                    <MdLocationOn /> {building.Address}
                  </span>
                )}
                <span className="building-role-info">
                  Role: {building.userRole} | Locations: {building.assignedLocations?.length || 0} assigned
                </span>
              </div>
              
              {/* Remove from Building Button - Only if current user has parent role and target has children role and not SystemAdmin */}
              {canRemoveFromBuildings && building.userRole === 'children' && currentUserRole === 'parent' && !isUserSystemAdmin && (
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
      </div>
    )}
    
    {/* UPDATED: No buildings message - now filtered for SystemAdmin */}
    {userBuildings.length === 0 && (
      <div className="building-access-section">
        <h3>
          <MdBusiness /> Building Access (0)
        </h3>
        <div className="no-buildings">
          <div className="no-data-content">
            <h4>No Building Access Visible</h4>
            <p>
              {isUserSystemAdmin 
                ? "This user is not a parent of any buildings."
                : currentUserRole === 'parent' 
                ? "This user has no building access in buildings where you are assigned as parent."
                : currentUserRole === 'admin'
                ? "This user has no building access in buildings where you are admin."
                : "This user has no building access or you don't have permission to view their building access."
              }
            </p>
            {isUserSystemAdmin && (
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                SystemAdmin view shows only buildings where user has parent role
              </p>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
);

// UPDATED: Location Access Tab Component - Shows only USERBUILDING-filtered locations
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
    {userBuildings.length > 0 && canManageThisUser && currentUserRole === 'parent' && (
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ marginBottom: '15px', color: '#1e293b' }}>Manage by Building:</h4>
        <div className="buildings-list">
          {userBuildings.map(building => (
            <div key={building.id} className="building-item" style={{ position: 'relative' }}>
              <div className="building-name">{building.BuildingName || building.id}</div>
              <div className="building-details">
                <span>Assigned Locations: {building.assignedLocations?.length || 0}</span>
              </div>
              {building.userRole === 'children' && (
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
    <h4 style={{ marginBottom: '15px', color: '#1e293b' }}>Location Access:</h4>
    {assignedLocations.length > 0 ? (
      <div className="devices-list">
        {assignedLocations.map(location => (
          <div key={location.id} className="device-item" style={{ position: 'relative' }}>
            <div className="device-name">{location.name}</div>
            <div className="device-details">
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
            {canManageThisUser && currentUserRole === 'parent'
              ? `This user has no location access assigned in buildings where you have management rights. Use the "Manage Locations" button to assign locations.`
              : currentUserRole === 'admin'
              ? 'This user has no location access assigned to them in buildings you can view. Only parents can manage location assignments.'
              : currentUserRole === 'parent'
              ? 'This user has no location access assigned to them in buildings you can view.'
              : 'This user has no location access assigned to them in buildings you can view.'
            }
          </p>
        </div>
      </div>
    )}
  </div>
);

export default UserDetail;