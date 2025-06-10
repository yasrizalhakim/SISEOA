// src/components/Users/UserDetail.js - Updated with Parent Delete Child Logic
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
        
        // Check if current user can remove this user from buildings
        const canRemove = await checkRemoveFromBuildingPermission(userId, currentUserEmail);
        setCanRemoveFromBuildings(canRemove);
        
        // Get user's building relationships (filtered by building-specific parent-child relationship)
        await fetchUserBuildings(userId, userData);
        
        // Get user's assigned locations across filtered buildings
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

  // UPDATED: Check if current user can manage the target user using USERBUILDING
  const checkUserManagementPermission = async (targetUserId, managerEmail) => {
    try {
      // SystemAdmin can manage all users
      if (await isSystemAdmin(managerEmail)) {
        setCurrentUserRole('systemadmin');
        return true;
      }

      // Check if manager and target user are in same buildings with parent-child roles
      const managerBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', managerEmail)
      );
      const managerBuildingsSnapshot = await getDocs(managerBuildingsQuery);
      
      const targetUserBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', targetUserId)
      );
      const targetUserBuildings = await getDocs(targetUserBuildingsQuery);
      
      // Create maps for easier lookup
      const managerBuildingRoles = new Map();
      managerBuildingsSnapshot.forEach(doc => {
        const data = doc.data();
        managerBuildingRoles.set(data.Building, data.Role);
      });
      
      let hasParentChildRelation = false;
      let hasAdminRelation = false;
      
      // Check each building where target user has access
      targetUserBuildings.forEach(targetDoc => {
        const targetData = targetDoc.data();
        const buildingId = targetData.Building;
        const targetRole = targetData.Role;
        
        if (managerBuildingRoles.has(buildingId)) {
          const managerRole = managerBuildingRoles.get(buildingId);
          
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
      });
      
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
      console.error('Error checking user management permission:', error);
      return false;
    }
  };

  // UPDATED: Check if current user can remove target user from buildings using USERBUILDING
  const checkRemoveFromBuildingPermission = async (targetUserId, managerEmail) => {
    try {
      // SystemAdmin can remove anyone
      if (await isSystemAdmin(managerEmail)) {
        return true;
      }
      
      // Check if manager has parent role for target user in any building
      const managerBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', managerEmail),
        where('Role', '==', 'parent')
      );
      const managerBuildingsSnapshot = await getDocs(managerBuildingsQuery);
      
      const targetUserBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', targetUserId),
        where('Role', '==', 'children')
      );
      const targetUserBuildings = await getDocs(targetUserBuildingsQuery);
      
      // Check if there's any building where manager is parent and target is children
      const managerParentBuildings = new Set();
      managerBuildingsSnapshot.forEach(doc => {
        managerParentBuildings.add(doc.data().Building);
      });
      
      let canRemove = false;
      targetUserBuildings.forEach(doc => {
        const buildingId = doc.data().Building;
        if (managerParentBuildings.has(buildingId)) {
          canRemove = true;
        }
      });
      
      return canRemove;
    } catch (error) {
      console.error('Error checking remove permission:', error);
      return false;
    }
  };

  // UPDATED: Fetch user's building relationships using USERBUILDING parent-child logic
  const fetchUserBuildings = async (targetUserId, targetUserData) => {
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
        
        // UPDATED: Apply USERBUILDING-based parent-child relationship filtering
        let shouldShowBuilding = false;
        
        if (isUserSystemAdmin) {
          // SystemAdmin can see all buildings
          shouldShowBuilding = true;
        } else if (currentUserEmail === targetUserId) {
          // Users can see their own building access
          shouldShowBuilding = true;
        } else {
          // Check if current user has parent role in this building and target user has children role
          const currentUserBuildingQuery = query(
            collection(firestore, 'USERBUILDING'),
            where('User', '==', currentUserEmail),
            where('Building', '==', buildingId)
          );
          const currentUserBuildingSnapshot = await getDocs(currentUserBuildingQuery);
          
          if (!currentUserBuildingSnapshot.empty) {
            const currentUserBuildingData = currentUserBuildingSnapshot.docs[0].data();
            const currentUserRoleInBuilding = currentUserBuildingData.Role;
            const targetUserRoleInBuilding = userBuildingData.Role;
            
            // Show building if current user is parent and target user is children in same building
            if (currentUserRoleInBuilding === 'parent' && targetUserRoleInBuilding === 'children') {
              shouldShowBuilding = true;
              console.log(`✅ Parent-child relationship found in building ${buildingId}`);
            }
            // Show building if current user is admin (admin can see all users in building)
            else if (currentUserRoleInBuilding === 'admin') {
              shouldShowBuilding = true;
              console.log(`✅ Admin access to building ${buildingId}`);
            }
          }
        }
        
        if (shouldShowBuilding) {
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
            
            console.log(`✅ Showing building ${buildingId} - role: ${userBuildingData.Role}`);
          }
        } else {
          console.log(`🚫 Hiding building ${buildingId} - no parent-child relationship or admin access`);
        }
      }
      
      setUserBuildings(buildingsList);
      console.log('🏢 User buildings (filtered by USERBUILDING logic):', buildingsList.length);
    } catch (error) {
      console.error('Error fetching user buildings:', error);
    }
  };

  // UPDATED: Fetch user's assigned locations (only for buildings the current user can see via USERBUILDING)
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
        
        // UPDATED: Only show locations for buildings where current user has appropriate access via USERBUILDING
        let canSeeBuilding = false;
        
        if (isUserSystemAdmin || currentUserEmail === targetUserId) {
          canSeeBuilding = true;
        } else {
          // Check if current user has parent or admin role in this building
          const currentUserBuildingQuery = query(
            collection(firestore, 'USERBUILDING'),
            where('User', '==', currentUserEmail),
            where('Building', '==', buildingId)
          );
          const currentUserBuildingSnapshot = await getDocs(currentUserBuildingQuery);
          
          if (!currentUserBuildingSnapshot.empty) {
            const currentUserRole = currentUserBuildingSnapshot.docs[0].data().Role;
            const targetUserRole = userBuildingData.Role;
            
            // Can see if parent-child relationship or admin access
            if ((currentUserRole === 'parent' && targetUserRole === 'children') || 
                currentUserRole === 'admin') {
              canSeeBuilding = true;
            }
          }
        }
        
        if (!canSeeBuilding) {
          console.log(`🚫 Skipping locations for building ${buildingId} - no access via USERBUILDING`);
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
              
              console.log(`✅ Added location ${locationId} for building ${buildingId} via USERBUILDING logic`);
            }
          } catch (locationError) {
            console.error(`Error fetching location ${locationId}:`, locationError);
          }
        }
      }
      
      setAssignedLocations(allLocations);
      console.log('📍 User locations (filtered by USERBUILDING logic):', allLocations.length);
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

  // NEW: Handle completely deleting child from all parent buildings
  const handleDeleteChild = async () => {
    try {
      // First, get the buildings that will be affected for confirmation
      const parentBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', currentUserEmail),
        where('Role', '==', 'parent')
      );
      const parentBuildingsSnapshot = await getDocs(parentBuildingsQuery);
      
      const parentBuildingIds = [];
      parentBuildingsSnapshot.forEach(doc => {
        const buildingId = doc.data().Building;
        if (buildingId !== 'SystemAdmin') {
          parentBuildingIds.push(buildingId);
        }
      });
      
      if (parentBuildingIds.length === 0) {
        setError('No buildings found where you are the parent.');
        return;
      }
      
      // Get building names for confirmation
      const buildingNames = [];
      for (const buildingId of parentBuildingIds) {
        const childBuildingQuery = query(
          collection(firestore, 'USERBUILDING'),
          where('User', '==', userId),
          where('Building', '==', buildingId),
          where('Role', '==', 'children')
        );
        const childBuildingSnapshot = await getDocs(childBuildingQuery);
        
        if (!childBuildingSnapshot.empty) {
          const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
          const buildingName = buildingDoc.exists() ? 
            (buildingDoc.data().BuildingName || buildingId) : buildingId;
          buildingNames.push(buildingName);
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
      
      console.log('🗑️ Removing child from all parent buildings...');
      
      // Remove child from all parent buildings
      let removedCount = 0;
      const removedBuildings = [];
      
      for (const buildingId of parentBuildingIds) {
        const childBuildingQuery = query(
          collection(firestore, 'USERBUILDING'),
          where('User', '==', userId),
          where('Building', '==', buildingId),
          where('Role', '==', 'children')
        );
        const childBuildingSnapshot = await getDocs(childBuildingQuery);
        
        for (const childDoc of childBuildingSnapshot.docs) {
          await deleteDoc(doc(firestore, 'USERBUILDING', childDoc.id));
          removedCount++;
          
          // Get building name for success message
          const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
          const buildingName = buildingDoc.exists() ? 
            (buildingDoc.data().BuildingName || buildingId) : buildingId;
          removedBuildings.push(buildingName);
          
          console.log(`✅ Removed child from building ${buildingId}`);
        }
      }
      
      if (removedCount === 0) {
        setError('No relationships found to remove. This user may not be your child in any buildings.');
        return;
      }
      
      setSuccess(
        `Successfully removed ${user.Name || user.email} from ${removedCount} building(s): ${removedBuildings.join(', ')}`
      );
      
      console.log(`✅ Child removed from ${removedCount} buildings successfully`);
      
      // Redirect to users page after a short delay
      setTimeout(() => {
        navigate('/users', {
          state: {
            message: `${user.Name || user.email} has been removed from all your buildings successfully`
          }
        });
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error removing child:', error);
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

  // UPDATED: Handle removing user from building with USERBUILDING validation
  const handleRemoveFromBuilding = async (buildingId, buildingName, userBuildingId) => {
    // Additional validation: ensure current user can remove from this building
    if (!canRemoveFromBuildings) {
      setError('You do not have permission to remove this user from buildings.');
      return;
    }
    
    // Verify parent-child relationship in this specific building
    try {
      const currentUserBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', currentUserEmail),
        where('Building', '==', buildingId),
        where('Role', '==', 'parent')
      );
      const currentUserBuildingSnapshot = await getDocs(currentUserBuildingQuery);
      
      const targetUserBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userId),
        where('Building', '==', buildingId),
        where('Role', '==', 'children')
      );
      const targetUserBuildingSnapshot = await getDocs(targetUserBuildingQuery);
      
      if (currentUserBuildingSnapshot.empty || targetUserBuildingSnapshot.empty) {
        setError('You can only remove children from buildings where you are the parent.');
        return;
      }
    } catch (validationError) {
      console.error('Error validating removal permission:', validationError);
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
      
      console.log('🗑️ Removing user from building via USERBUILDING...');
      
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
          onDeleteChild={handleDeleteChild} // NEW: Pass delete child function
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

// UPDATED: User Info Tab Component - Shows delete button for parents viewing children
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
    
    {/* Edit Controls - UPDATED: Show delete button for parents viewing children */}
    {canManageThisUser && (
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
          // Show edit functionality for other roles (admin, systemadmin, self)
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
    
    {/* User Information Form - UPDATED: Show read-only for parents viewing children */}
    <div className="user-info-form">
      {/* <div className="info-group">
        <label>User ID</label>
        <p className="user-id">{user.id}</p>
      </div> */}
      
      <div className="info-group">
        <label>
          <MdPerson /> Name
        </label>
        <p className="user-name">{user.name || user.Name}</p>
        {/* {isEditing && currentUserRole !== 'parent' ? (
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
        )} */}
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
        {/* {isEditing && currentUserRole !== 'parent' ? (
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
        )} */}
      </div>
      
      
      {user.LastModifiedBy && (
        <div className="info-group">
          <label>Last Modified By</label>
          <p>{user.LastModifiedBy}</p>
        </div>
      )}
    </div>
    
    {/* UPDATED: Building Access Section with USERBUILDING-based Filtering */}
    {userBuildings.length > 0 && (
      <div className="building-access-section">
        <h3>
          <MdBusiness /> Building Access ({userBuildings.length})
          <span style={{ 
            fontSize: '12px', 
            fontWeight: '400', 
            color: '#6b7280',
            marginLeft: '8px'
          }}>
          </span>
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
                  Role: {building.userRole}
                </span>
                <span className="building-role-info">
                  Locations: {building.assignedLocations?.length || 0} assigned
                </span>
              </div>
              
              {/* Remove from Building Button - Only if current user has parent role and target has children role */}
              {canRemoveFromBuildings && building.userRole === 'children' && currentUserRole === 'parent' && (
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
    
    {/* UPDATED: Show message when no buildings are visible due to USERBUILDING filtering */}
    {userBuildings.length === 0 && (
      <div className="building-access-section">
        <h3>
          <MdBusiness /> Building Access (0)
        </h3>
        <div className="no-buildings">
          <div className="no-data-content">
            <h4>No Building Access Visible</h4>
            <p>
              {currentUserRole === 'parent' 
                ? "This user has no building access in buildings where you are assigned as parent."
                : currentUserRole === 'admin'
                ? "This user has no building access in buildings where you are admin."
                : "This user has no building access or you don't have permission to view their building access."
              }
            </p>
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
                <span>Role: {building.userRole}</span>
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