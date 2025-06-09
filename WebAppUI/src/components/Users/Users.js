// src/components/Users/Users.js - Updated to use USERBUILDING for parent-child relationships
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MdAdd, MdPerson, MdFamilyRestroom, MdHome, MdAdminPanelSettings, MdBusiness, MdLocationOn, MdEmail, MdPhone, MdRefresh, MdSearch, MdSettings } from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { isSystemAdmin, getUserBuildingRoles } from '../../utils/helpers';
import './Users.css';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [usersByBuilding, setUsersByBuilding] = useState({});
  const [buildings, setBuildings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [currentUserType, setCurrentUserType] = useState('none');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail') || '';
  
  // Determine user's access type based on their building roles
  const determineUserAccessType = useCallback(async () => {
    if (!userEmail) return 'none';
    
    try {
      // Check if SystemAdmin first
      const isAdmin = await isSystemAdmin(userEmail);
      if (isAdmin) {
        return 'systemadmin';
      }

      // Get user's building roles
      const buildingRoles = await getUserBuildingRoles(userEmail);
      let hasParentRole = false;
      let hasAdminRole = false;

      for (const [buildingId, role] of buildingRoles) {
        if (buildingId === 'SystemAdmin') continue;
        
        if (role === 'parent') {
          hasParentRole = true;
        } else if (role === 'admin') {
          hasAdminRole = true;
        }
      }

      // Priority: admin > parent > user (all users can see user management if they have any role)
      if (hasAdminRole) return 'admin';
      if (hasParentRole) return 'parent';

      // Even children can access user management (they may become parents later)
      return 'user'; // Changed from 'none' to 'user' to allow access
    } catch (error) {
      console.error('Error determining user access type:', error);
      return 'none';
    }
  }, [userEmail]);

  // Fetch users based on current user's access level
  const fetchUsers = useCallback(async () => {
    if (!userEmail) return;
    
    try {
      setRefreshing(true);
      setError(null);
      
      const accessType = await determineUserAccessType();
      setCurrentUserType(accessType);
      setIsUserSystemAdmin(accessType === 'systemadmin');
      
      let usersList = [];
      let buildingsList = [];
      let usersBuildingMap = {};
      
      console.log('🔍 User access type:', accessType);

      if (accessType === 'systemadmin') {
        console.log('🔧 SystemAdmin detected - fetching all parents via USERBUILDING');
        await fetchSystemAdminUsers(usersList, buildingsList);
        
      } else if (accessType === 'admin') {
        console.log('🏢 Building admin detected - fetching parents in managed buildings via USERBUILDING');
        await fetchBuildingAdminUsers(usersList, buildingsList, usersBuildingMap);
        
      } else if (accessType === 'parent') {
        console.log('👨‍👩‍👧‍👦 Parent user detected - fetching children via USERBUILDING');
        await fetchParentUsers(usersList, buildingsList, usersBuildingMap);
        
      } else if (accessType === 'user') {
        console.log('👤 Basic user detected - showing their own info');
        await fetchBasicUserInfo(usersList, buildingsList, usersBuildingMap);
        
      } else {
        setError('You do not have access to user management.');
        setLoading(false);
        return;
      }
      
      setUsers(usersList);
      setBuildings(buildingsList);
      setUsersByBuilding(usersBuildingMap);
      setError(null);
      
      console.log('📊 Final stats:', {
        totalUsers: usersList.length,
        totalBuildings: buildingsList.length,
        accessType: accessType
      });
      
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('Failed to load users');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [userEmail, determineUserAccessType]);

  // Fetch basic user info for users who are only children but might become parents
  const fetchBasicUserInfo = async (usersList, buildingsList, usersBuildingMap) => {
    // Get current user's details and show a minimal view
    const currentUserDoc = await getDoc(doc(firestore, 'USER', userEmail));
    
    if (currentUserDoc.exists()) {
      const userData = currentUserDoc.data();
      
      usersList.push({
        id: userEmail,
        email: userEmail,
        ...userData,
        role: 'user',
        buildingAccess: []
      });
    }
    
    // Show message that they can create buildings to become parents
    usersBuildingMap["potential"] = [];
  };

  // Fetch users for SystemAdmin (all parents)
  const fetchSystemAdminUsers = async (usersList, buildingsList) => {
    // Get all parents in the system via USERBUILDING
    const parentsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Role', '==', 'parent')
    );
    
    const parentsSnapshot = await getDocs(parentsQuery);
    const uniqueParentEmails = new Set();
    
    parentsSnapshot.forEach(doc => {
      const userData = doc.data();
      uniqueParentEmails.add(userData.User);
    });
    
    // Fetch parent user details with building access
    for (const email of uniqueParentEmails) {
      const userDoc = await getDoc(doc(firestore, 'USER', email));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Get user's building access via USERBUILDING
        const userBuildingQuery = query(
          collection(firestore, 'USERBUILDING'),
          where('User', '==', email)
        );
        const userBuildingSnapshot = await getDocs(userBuildingQuery);
        
        const buildingAccess = [];
        for (const ubDoc of userBuildingSnapshot.docs) {
          const ubData = ubDoc.data();
          if (ubData.Building === 'SystemAdmin') continue;
          
          const buildingDoc = await getDoc(doc(firestore, 'BUILDING', ubData.Building));
          if (buildingDoc.exists()) {
            buildingAccess.push({
              id: ubData.Building,
              name: buildingDoc.data().BuildingName || ubData.Building,
              role: ubData.Role
            });
          }
        }
        
        usersList.push({
          id: email,
          email: email,
          ...userData,
          role: 'parent',
          buildingAccess: buildingAccess
        });
      }
    }
    
    // Fetch all buildings for context
    const buildingsQuery = collection(firestore, 'BUILDING');
    const buildingsSnapshot = await getDocs(buildingsQuery);
    
    buildingsList.push(...buildingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })));
  };

  // Fetch users for building admins (parents in buildings they admin)
  const fetchBuildingAdminUsers = async (usersList, buildingsList, usersBuildingMap) => {
    // Get buildings where current user is admin via USERBUILDING
    const adminBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Role', '==', 'admin')
    );
    
    const adminBuildingsSnapshot = await getDocs(adminBuildingsQuery);
    const adminBuildingIds = [];
    
    for (const buildingDoc of adminBuildingsSnapshot.docs) {
      const buildingId = buildingDoc.data().Building;
      if (buildingId === 'SystemAdmin') continue;
      
      adminBuildingIds.push(buildingId);
      
      // Get building details
      const buildingDetails = await getDoc(doc(firestore, 'BUILDING', buildingId));
      if (buildingDetails.exists()) {
        buildingsList.push({
          id: buildingId,
          ...buildingDetails.data()
        });
      }
      
      usersBuildingMap[buildingId] = [];
    }
    
    // For each building, get parents via USERBUILDING
    for (const buildingId of adminBuildingIds) {
      const parentsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId),
        where('Role', '==', 'parent')
      );
      
      const parentsSnapshot = await getDocs(parentsQuery);
      
      for (const parentDoc of parentsSnapshot.docs) {
        const parentData = parentDoc.data();
        const parentEmail = parentData.User;
        
        const parentUserDoc = await getDoc(doc(firestore, 'USER', parentEmail));
        
        if (parentUserDoc.exists()) {
          const parentUser = {
            id: parentEmail,
            email: parentEmail,
            ...parentUserDoc.data(),
            role: 'parent',
            buildingRole: parentData.Role,
            buildingAccess: [{
              id: buildingId,
              name: buildingsList.find(b => b.id === buildingId)?.BuildingName || buildingId,
              role: parentData.Role
            }]
          };
          
          usersBuildingMap[buildingId].push(parentUser);
          
          if (!usersList.find(u => u.id === parentEmail)) {
            usersList.push(parentUser);
          }
        }
      }
    }
  };

  // UPDATED: Fetch users for parents (children in buildings they manage) - Using USERBUILDING only
  const fetchParentUsers = async (usersList, buildingsList, usersBuildingMap) => {
    // Get buildings where the user has 'parent' role via USERBUILDING
    const parentBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Role', '==', 'parent')
    );
    
    const parentBuildingsSnapshot = await getDocs(parentBuildingsQuery);
    const parentBuildingIds = [];
    
    for (const buildingDoc of parentBuildingsSnapshot.docs) {
      const buildingId = buildingDoc.data().Building;
      parentBuildingIds.push(buildingId);
      
      // Get building details
      const buildingDetails = await getDoc(doc(firestore, 'BUILDING', buildingId));
      if (buildingDetails.exists()) {
        buildingsList.push({
          id: buildingId,
          ...buildingDetails.data()
        });
      }
      
      usersBuildingMap[buildingId] = [];
    }
    
    // UPDATED: Fetch children for each building where current user is parent via USERBUILDING
    for (const buildingId of parentBuildingIds) {
      const childrenQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Role', '==', 'children'),
        where('Building', '==', buildingId)
      );
      
      const childrenSnapshot = await getDocs(childrenQuery);
      
      for (const childDoc of childrenSnapshot.docs) {
        const childData = childDoc.data();
        const childEmail = childData.User;
        
        // Get child user details
        const childUserDoc = await getDoc(doc(firestore, 'USER', childEmail));
        
        if (childUserDoc.exists()) {
          const childUserData = childUserDoc.data();
          
          // UPDATED: Since we're only using USERBUILDING, any children in buildings where 
          // current user is parent are considered manageable by the current user
          const childUser = {
            id: childEmail,
            email: childEmail,
            ...childUserData,
            role: 'children',
            buildingRole: childData.Role,
            buildingAccess: [{
              id: buildingId,
              name: buildingsList.find(b => b.id === buildingId)?.BuildingName || buildingId,
              role: childData.Role
            }]
          };
          
          usersBuildingMap[buildingId].push(childUser);
          
          if (!usersList.find(u => u.id === childEmail)) {
            usersList.push(childUser);
          }
          
          console.log(`✅ Added ${childEmail} as child in building ${buildingId} via USERBUILDING logic`);
        }
      }
    }
    
    // UPDATED: Handle unassigned children - users who have building access but not in buildings where current user is parent
    // Since we're using USERBUILDING only, we won't show "unassigned" children as parent-child is building-specific
    console.log('ℹ️ Parent-child relationships are now building-specific via USERBUILDING');
  };
  
  // Initial load
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Manual refresh
  const handleRefresh = () => {
    fetchUsers();
  };

  // Handle clicking on a user card - navigate to user detail
  const handleUserCardClick = (userId) => {
    navigate(`/users/detail/${userId}`);
  };
  
  // Filter users based on search term
  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;
    
    const userName = user.Name || user.email;
    return userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
           user.email.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Get page title based on user type
  const getPageTitle = () => {
    switch (currentUserType) {
      case 'systemadmin':
        return `System Users (${users.length})`;
      case 'admin':
        return `Managed Users (${users.length})`;
      case 'parent':
        return `My Children (${users.length})`;
      default:
        return 'User Management';
    }
  };

  // Get search placeholder based on user type
  const getSearchPlaceholder = () => {
    switch (currentUserType) {
      case 'systemadmin':
        return 'Search all parents...';
      case 'admin':
        return 'Search parents...';
      case 'parent':
        return 'Search children...';
      default:
        return 'Search users...';
    }
  };

  
  if (loading) {
    return (
      <div className="users-page">
        <div className="loading">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="users-page">
      <UsersHeader 
        currentUserType={currentUserType}
        isUserSystemAdmin={isUserSystemAdmin}
        userCount={users.length}
        filteredCount={filteredUsers.length}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {error && (
        <div className="error-message">
          {error}
          <button onClick={handleRefresh} className="retry-btn">
            Try Again
          </button>
        </div>
      )}

      <SearchControls 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        getSearchPlaceholder={getSearchPlaceholder}
      />

      <UsersGrid 
        users={filteredUsers}
        buildings={buildings}
        usersByBuilding={usersByBuilding}
        currentUserType={currentUserType}
        isUserSystemAdmin={isUserSystemAdmin}
        searchTerm={searchTerm}
        onUserCardClick={handleUserCardClick}
      />
    </div>
  );
};

// Users Header Component - Updated for USERBUILDING-based multi-role support
const UsersHeader = ({ currentUserType, isUserSystemAdmin, userCount, filteredCount, onRefresh, refreshing }) => {
  const getHeaderContent = () => {
    if (currentUserType === 'systemadmin') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MdAdminPanelSettings style={{ color: '#10b981' }} />
          System Users ({userCount})
        </span>
      );
    } else if (currentUserType === 'admin') {
      return `Managed Users (${userCount})`;
    } else if (currentUserType === 'parent') {
      return (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>My Children ({userCount})</span>
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '400' }}>
            Children in buildings where you are parent
          </span>
        </span>
      );
    } else {
      return (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>User Management</span>
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '400' }}>
            Create buildings to become a parent
          </span>
        </span>
      );
    }
  };

  return (
    <div className="users-header">
      <h2>{getHeaderContent()}</h2>
      <div className="header-actions">
        <button 
          onClick={onRefresh}
          className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
          disabled={refreshing}
          title="Refresh users"
        >
          <MdRefresh />
        </button>
        {isUserSystemAdmin && (
          <Link to="/users/add" className="add-user-btn">
            <MdAdd /> Add Parent
          </Link>
        )}
      </div>
    </div>
  );
};

// Search Controls Component - Consistent with Buildings Search
const SearchControls = ({ searchTerm, onSearchChange, getSearchPlaceholder }) => (
  <div className="search-section">
    <div className="search-container">
      <MdSearch className="search-icon" />
      <input 
        type="text" 
        placeholder={getSearchPlaceholder()} 
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
    </div>
  </div>
);

// Users Grid Component - Similar structure to Buildings Grid
const UsersGrid = ({ users, buildings, usersByBuilding, currentUserType, isUserSystemAdmin, searchTerm, onUserCardClick }) => {
  if (currentUserType === 'systemadmin') {
    // SystemAdmin view - show all parents in simple grid
    return (
      <div>
        <div className="users-stats">
          <div className="stat-card">
            <div className="stat-icon">
              <MdPerson />
            </div>
            <div className="stat-content">
              <div className="stat-value">{users.length}</div>
              <div className="stat-label">Total Parents</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <MdHome />
            </div>
            <div className="stat-content">
              <div className="stat-value">{buildings.length}</div>
              <div className="stat-label">Buildings</div>
            </div>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="no-users">
            <div className="no-data-content">
              <h3>
                {searchTerm ? 'No Users Found' : 'No Parents Available'}
              </h3>
              <p>
                {searchTerm ? (
                  `No parents match "${searchTerm}". Try adjusting your search terms.`
                ) : (
                  "No parent users exist in the system yet."
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="users-grid">
            {users.map(user => (
              <UserCard
                key={user.id}
                user={user}
                currentUserType={currentUserType}
                onClick={() => onUserCardClick(user.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Building-based view (admin or parent) - Updated for USERBUILDING logic
  return (
    <div>
      <div className="users-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <MdPerson />
          </div>
          <div className="stat-content">
            <div className="stat-value">{users.length}</div>
            <div className="stat-label">
              {currentUserType === 'admin' ? 'Parents' : 'Children'}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <MdHome />
          </div>
          <div className="stat-content">
            <div className="stat-value">{buildings.length}</div>
            <div className="stat-label">Buildings</div>
          </div>
        </div>
      </div>

      {buildings.length > 0 ? (
        buildings.map(building => (
          <div key={building.id} className="building-category">
            <div className="building-category-header">
              <h3>
                <MdHome />
                {building.BuildingName || building.id}
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: '400', 
                  color: '#6b7280',
                  marginLeft: '8px'
                }}>
                  {/* {currentUserType === 'parent' ? 
                    '(Children where you are parent)' : 
                    '(Parents in building you admin)'
                  } */}
                </span>
              </h3>
            </div>
            
            <div className="building-category-content">
              {usersByBuilding[building.id] && usersByBuilding[building.id].length > 0 ? (
                <div className="users-grid">
                  {usersByBuilding[building.id]
                    .filter(user => !searchTerm || 
                      (user.Name || user.email).toLowerCase().includes(searchTerm.toLowerCase()) ||
                      user.email.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(user => (
                      <UserCard 
                        key={user.id}
                        user={user}
                        currentUserType={currentUserType}
                        onClick={() => onUserCardClick(user.id)}
                      />
                    ))}
                </div>
              ) : (
                <div className="no-users">
                  <div className="no-data-content">
                    <h3>No Users</h3>
                    <p>
                      {currentUserType === 'admin' 
                        ? 'No parents in this building' 
                        : 'No children in this building where you are parent'
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="no-users">
          <div className="no-data-content">
            <h3>No Buildings Available</h3>
            <p>
              {currentUserType === 'admin' 
                ? "You don't have admin access to any buildings."
                : "You don't have parent role in any buildings. You need to be assigned as parent in buildings to manage children."
              }
            </p>
          </div>
        </div>
      )}
      
      {/* UPDATED: Removed unassigned children since parent-child is now building-specific */}
    </div>
  );
};

// User Card Component - Similar to Building Card structure
const UserCard = ({ user, currentUserType, onClick }) => {
  const getRoleBadgeClass = (role) => {
    switch(role) {
      case 'parent': return 'parent-badge';
      case 'children': return 'children-badge';
      case 'admin': return 'admin-badge';
      default: return 'default-badge';
    }
  };

  return (
    <div className="user-card" onClick={onClick}>
      <div className="user-content">
        <div className="user-header">
          <h3 className="user-name">
            {user.Name || user.email}
          </h3>
          
        </div>
        
        <div className="user-details">
          <div className="detail-item">
            <span className="detail-label">Email:</span>
            <span className="detail-value">{user.email}</span>
          </div>
          
          {user.ContactNo && (
            <div className="detail-item">
              <span className="detail-label">Contact:</span>
              <span className="detail-value">{user.ContactNo}</span>
            </div>
          )}
          
          {/* UPDATED: Show building-specific role instead of legacy ParentEmail */}
          {user.buildingRole && (
            <div className="detail-item">
              <span className="detail-label">Building Role:</span>
              <span className="detail-value">{user.buildingRole}</span>
            </div>
          )}
        </div>
        
        {/* Building Access Display */}
        {/* {user.buildingAccess && user.buildingAccess.length > 0 && (
          <div className="access-level-section">
            <h4>Building Access</h4>
            <div className="buildings-access-list">
              {user.buildingAccess.slice(0, 3).map((building, index) => (
                <div key={index} className="building-access-item">
                  <span className="building-name">{building.name}</span>
                  <span className={`building-role ${building.role}`}>
                    {building.role}
                  </span>
                </div>
              ))}
              {user.buildingAccess.length > 3 && (
                <div className="building-access-item">
                  <span className="building-name">+{user.buildingAccess.length - 3} more...</span>
                </div>
              )}
            </div>
          </div>
        )} */}
      </div>
    </div>
  );
};

export default Users;