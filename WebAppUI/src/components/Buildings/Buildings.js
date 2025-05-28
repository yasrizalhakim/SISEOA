// src/components/Buildings/Buildings.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MdEdit, MdAdd, MdRefresh, MdSearch, MdAdminPanelSettings } from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { isSystemAdmin } from '../../utils/helpers';
import './Buildings.css';

const Buildings = () => {
  const [buildings, setBuildings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail') || '';

  // Check if user is SystemAdmin
  const checkSystemAdmin = async () => {
    if (!userEmail) return false;
    
    try {
      const isAdmin = await isSystemAdmin(userEmail);
      console.log('🔧 SystemAdmin check result:', isAdmin);
      return isAdmin;
    } catch (error) {
      console.error('Error checking SystemAdmin status:', error);
      return false;
    }
  };

  // Fetch buildings based on user's access level
  const fetchBuildings = async () => {
    if (!userEmail) return;

    try {
      setRefreshing(true);
      setError(null);

      console.log('🏢 Fetching buildings for user:', userEmail);

      // Check if user is SystemAdmin
      const isAdmin = await checkSystemAdmin();
      setIsUserSystemAdmin(isAdmin);
      
      let buildingsData = [];

      if (isAdmin) {
        console.log('🔧 SystemAdmin detected - fetching ALL buildings in system');
        
        // SystemAdmin can see all buildings in the system
        const allBuildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
        
        buildingsData = allBuildingsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          userRoleInBuilding: 'admin' // SystemAdmin has admin role everywhere
        }));
        
        console.log('🏢 SystemAdmin found', buildingsData.length, 'total buildings in system');
        
        // Sort buildings alphabetically for SystemAdmin
        buildingsData.sort((a, b) => {
          const nameA = a.BuildingName || a.id;
          const nameB = b.BuildingName || b.id;
          return nameA.localeCompare(nameB);
        });
        
      } else {
        console.log('👨‍👩‍👧‍👦 Regular user - fetching user-specific buildings');
        
        // Get user's building relationships with their specific roles
        const userBuildingsQuery = query(
          collection(firestore, 'USERBUILDING'),
          where('User', '==', userEmail)
        );
        
        const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
        
        if (userBuildingsSnapshot.empty) {
          console.log('⚠️ User has no building access');
          setBuildings([]);
          return;
        }

        console.log('🏢 Found', userBuildingsSnapshot.docs.length, 'building relationships');

        // Process each building relationship
        buildingsData = await Promise.all(
          userBuildingsSnapshot.docs.map(async (userBuildingDoc) => {
            const userBuildingData = userBuildingDoc.data();
            const buildingId = userBuildingData.Building;
            const userRoleInBuilding = userBuildingData.Role;
            
            // Skip SystemAdmin building for display (not a real building)
            if (buildingId === 'SystemAdmin') {
              return null;
            }
            
            console.log(`🏢 Processing building ${buildingId} with role ${userRoleInBuilding}`);
            
            try {
              const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
              
              if (buildingDoc.exists()) {
                return {
                  id: buildingId,
                  ...buildingDoc.data(),
                  userRoleInBuilding: userRoleInBuilding // Store building-specific role
                };
              } else {
                console.warn(`⚠️ Building ${buildingId} not found in BUILDING collection`);
                return null;
              }
            } catch (buildingError) {
              console.error(`❌ Error fetching building ${buildingId}:`, buildingError);
              return null;
            }
          })
        );

        // Filter out null values and sort
        buildingsData = buildingsData.filter(building => building !== null);
        buildingsData.sort((a, b) => {
          const nameA = a.BuildingName || a.id;
          const nameB = b.BuildingName || b.id;
          return nameA.localeCompare(nameB);
        });
      }

      console.log('🏢 Valid buildings loaded:', buildingsData.length);
      setBuildings(buildingsData);
      
    } catch (error) {
      console.error('❌ Error fetching buildings:', error);
      setError('Failed to load buildings');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchBuildings();
  }, [userEmail]);

  // Manual refresh
  const handleRefresh = () => {
    fetchBuildings();
  };

  // Filter buildings by search term
  const filteredBuildings = buildings.filter(building => {
    if (!searchTerm) return true;
    
    const buildingName = building.BuildingName || building.id;
    const buildingAddress = building.Address || '';
    const createdBy = building.CreatedBy || '';
    
    return buildingName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           buildingAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
           createdBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
           building.id.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Navigate to building detail
  const handleBuildingClick = (buildingId) => {
    navigate(`/buildings/detail/${buildingId}`);
  };

  // Check if user can add buildings (SystemAdmin or have parent role in at least one building or have no buildings)
  const canAddBuildings = isUserSystemAdmin || buildings.length >= 0; // Always allow non-admins to try

  if (loading) {
    return (
      <div className="buildings-page">
        <div className="loading">Loading buildings...</div>
      </div>
    );
  }

  return (
    <div className="buildings-page">
      <BuildingsHeader 
        canAddBuildings={canAddBuildings}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        isSystemAdmin={isUserSystemAdmin}
        buildingsCount={buildings.length}
        filteredCount={filteredBuildings.length}
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
        isSystemAdmin={isUserSystemAdmin}
      />

      <BuildingsGrid 
        buildings={filteredBuildings}
        userEmail={userEmail}
        onBuildingClick={handleBuildingClick}
        isSystemAdmin={isUserSystemAdmin}
        searchTerm={searchTerm}
      />
    </div>
  );
};

// Buildings Header Component
const BuildingsHeader = ({ canAddBuildings, onRefresh, refreshing, isSystemAdmin, buildingsCount, filteredCount }) => {
  const getHeaderText = () => {
    if (isSystemAdmin) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MdAdminPanelSettings style={{ color: '#10b981' }} />
          System Buildings ({buildingsCount})
        </span>
      );
    }
    
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span>My Buildings ({buildingsCount})</span>
        <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '400' }}>
          Different roles across buildings
        </span>
      </span>
    );
  };

  return (
    <div className="buildings-header">
      <h2>{getHeaderText()}</h2>
      <div className="header-actions">
        <button 
          onClick={onRefresh}
          className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
          disabled={refreshing}
          title="Refresh buildings"
        >
          <MdRefresh />
        </button>
        {canAddBuildings && (
          <Link to="/buildings/add" className="add-building-btn">
            <MdAdd /> Add Building
          </Link>
        )}
      </div>
    </div>
  );
};

// Search Controls Component
const SearchControls = ({ searchTerm, onSearchChange, isSystemAdmin }) => (
  <div className="search-section">
    <div className="search-container">
      <MdSearch className="search-icon" />
      <input 
        type="text" 
        placeholder={isSystemAdmin ? "    Search all buildings..." : "Search buildings..."} 
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
    </div>
  </div>
);

// Buildings Grid Component
const BuildingsGrid = ({ buildings, userEmail, onBuildingClick, isSystemAdmin, searchTerm }) => {
  const getRoleBadgeClass = (roleInBuilding) => {
    switch(roleInBuilding) {
      case 'admin': return 'admin-badge';
      case 'parent': return 'parent-badge';
      case 'children': return 'children-badge';
      default: return 'default-badge';
    }
  };

  if (buildings.length === 0) {
    return (
      <div className="no-buildings">
        <div className="no-data-content">
          <h3>
            {searchTerm ? 'No Buildings Found' : 'No Buildings Available'}
          </h3>
          <p>
            {searchTerm ? (
              `No buildings match "${searchTerm}". Try adjusting your search terms.`
            ) : isSystemAdmin ? (
              "No buildings exist in the system yet. Buildings will appear here once users create them."
            ) : (
              "You don't have access to any buildings yet. Create your first building or ask a parent to add you to theirs."
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="buildings-grid">
      {buildings.map(building => (
        <BuildingCard
          key={building.id}
          building={building}
          getRoleBadgeClass={getRoleBadgeClass}
          onClick={() => onBuildingClick(building.id)}
          isSystemAdmin={isSystemAdmin}
        />
      ))}
    </div>
  );
};

// Building Card Component - Shows building-specific role
const BuildingCard = ({ building, getRoleBadgeClass, onClick, isSystemAdmin }) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    
    // Handle Firebase timestamp objects
    if (typeof dateStr === 'object' && dateStr.toDate) {
      return dateStr.toDate().toLocaleDateString();
    }
    
    // Handle string dates
    if (typeof dateStr === 'string') {
      // If it's in DD-MM-YYYY format, parse it correctly
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          // Assume DD-MM-YYYY format
          const date = new Date(parts[2], parts[1] - 1, parts[0]);
          return date.toLocaleDateString();
        }
      }
      return new Date(dateStr).toLocaleDateString();
    }
    
    return dateStr;
  };

  return (
    <div className="building-card" onClick={onClick}>
      <div className="building-content">
        <div className="building-header">
          <h3 className="building-name">
            {building.BuildingName || building.id}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
  <span className={`role-badge ${getRoleBadgeClass(building.userRoleInBuilding)}`}>
    {building.userRoleInBuilding}
    {isSystemAdmin && building.userRoleInBuilding === 'admin' && (
      <span style={{ marginLeft: '4px' }}>*</span>
    )}
  </span>
  {/* Multi-role indicator */}
  <span style={{ 
    fontSize: '10px', 
    color: '#6b7280', 
    fontStyle: 'italic',
    textAlign: 'right'
  }}>
    Role in this building
  </span>
</div>
        </div>
        
        <div className="building-details">
          <div className="detail-item">
            <span className="detail-label">ID:</span>
            <span className="detail-value">{building.id}</span>
          </div>
          
          {building.Address && (
            <div className="detail-item">
              <span className="detail-label">Address:</span>
              <span className="detail-value">{building.Address}</span>
            </div>
          )}
          
          <div className="detail-item">
            <span className="detail-label">Created:</span>
            <span className="detail-value">{formatDate(building.DateCreated || building.CreatedAt)}</span>
          </div>

          {building.CreatedBy && (
            <div className="detail-item">
              <span className="detail-label">Created by:</span>
              <span className="detail-value">{building.CreatedBy}</span>
            </div>
          )}
          
          {/* {isSystemAdmin && (
            <div className="detail-item">
              <span className="detail-label">Access Level:</span>
              <span className="detail-value" style={{ color: '#10b981', fontWeight: '500' }}>
                Full System Access
              </span>
            </div>
          )} */}
          
          {building.Description && (
            <div className="detail-item">
              <span className="detail-label">Description:</span>
              <span className="detail-value">{building.Description}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Buildings;