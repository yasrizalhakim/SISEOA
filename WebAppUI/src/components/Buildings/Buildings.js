// src/components/Buildings/Buildings.js - Refactored with component consolidation

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  
  const userEmail = useMemo(() => 
    localStorage.getItem('userEmail') || '', 
    []
  );

  // Check if user is SystemAdmin
  const checkSystemAdmin = useCallback(async () => {
    if (!userEmail) return false;
    
    try {
      const isAdmin = await isSystemAdmin(userEmail);
      console.log('🔧 SystemAdmin check result:', isAdmin);
      return isAdmin;
    } catch (err) {
      console.error('Error checking SystemAdmin status:', err);
      return false;
    }
  }, [userEmail]);

  // Fetch buildings based on user's access level
  const fetchBuildings = useCallback(async () => {
    if (!userEmail) return;

    try {
      setRefreshing(true);
      setError(null);

      console.log('🏢 Fetching buildings for user:', userEmail);

      const isAdmin = await checkSystemAdmin();
      setIsUserSystemAdmin(isAdmin);
      
      let buildingsData = [];

      if (isAdmin) {
        console.log('🔧 SystemAdmin detected - fetching ALL buildings in system');
        
        const allBuildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
        
        buildingsData = allBuildingsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          userRoleInBuilding: 'admin'
        }));
        
        console.log('🏢 SystemAdmin found', buildingsData.length, 'total buildings in system');
        
      } else {
        console.log('👨‍👩‍👧‍👦 Regular user - fetching user-specific buildings');
        
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

        buildingsData = await Promise.all(
          userBuildingsSnapshot.docs.map(async (userBuildingDoc) => {
            const userBuildingData = userBuildingDoc.data();
            const buildingId = userBuildingData.Building;
            const userRoleInBuilding = userBuildingData.Role;
            
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
                  userRoleInBuilding: userRoleInBuilding
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

        buildingsData = buildingsData.filter(building => building !== null);
      }

      // Sort buildings alphabetically
      buildingsData.sort((a, b) => {
        const nameA = a.BuildingName || a.id;
        const nameB = b.BuildingName || b.id;
        return nameA.localeCompare(nameB);
      });

      console.log('🏢 Valid buildings loaded:', buildingsData.length);
      setBuildings(buildingsData);
      
    } catch (err) {
      console.error('❌ Error fetching buildings:', err);
      setError('Failed to load buildings');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [userEmail, checkSystemAdmin]);

  // Filter buildings by search term
  const filteredBuildings = useMemo(() => {
    return buildings.filter(building => {
      if (!searchTerm) return true;
      
      const buildingName = building.BuildingName || building.id;
      const buildingAddress = building.Address || '';
      const createdBy = building.CreatedBy || '';
      
      return buildingName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             buildingAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
             createdBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
             building.id.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [buildings, searchTerm]);

  // Navigation handler
  const handleBuildingClick = useCallback((buildingId) => {
    navigate(`/buildings/detail/${buildingId}`);
  }, [navigate]);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  // Permission checks
  const canAddBuildings = useMemo(() => 
    isUserSystemAdmin || buildings.length >= 0, 
    [isUserSystemAdmin, buildings.length]
  );

  // Initial load
  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  // Loading state
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
      />

      {error && (
        <div className="error-message">
          {error}
          <button onClick={handleRefresh} className="retry-btn" type="button">
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
const BuildingsHeader = ({ 
  canAddBuildings, 
  onRefresh, 
  refreshing, 
  isSystemAdmin, 
  buildingsCount 
}) => {
  const getHeaderText = useCallback(() => {
    if (isSystemAdmin) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MdAdminPanelSettings style={{ color: '#10b981' }} />
          System Buildings ({buildingsCount})
        </span>
      );
    }
    
    return (
      <span style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem', 
        flexDirection: 'column', 
        alignItems: 'flex-start' 
      }}>
        <span>My Buildings ({buildingsCount})</span>
      </span>
    );
  }, [isSystemAdmin, buildingsCount]);

  return (
    <div className="buildings-header">
      <h2>{getHeaderText()}</h2>
      <div className="header-actions">
        <button 
          type="button"
          onClick={onRefresh}
          className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
          disabled={refreshing}
          title="Refresh buildings"
          aria-label="Refresh buildings"
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
        placeholder={isSystemAdmin ? "Search all buildings..." : "Search buildings..."} 
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
        aria-label="Search buildings"
      />
    </div>
  </div>
);

// Buildings Grid Component
const BuildingsGrid = ({ 
  buildings, 
  userEmail, 
  onBuildingClick, 
  isSystemAdmin, 
  searchTerm 
}) => {
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
          onClick={() => onBuildingClick(building.id)}
          isSystemAdmin={isSystemAdmin}
        />
      ))}
    </div>
  );
};

// Building Card Component
const BuildingCard = ({ building, onClick, isSystemAdmin }) => {
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return 'N/A';
    
    if (typeof dateStr === 'object' && dateStr.toDate) {
      return dateStr.toDate().toLocaleDateString();
    }
    
    if (typeof dateStr === 'string') {
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const date = new Date(parts[2], parts[1] - 1, parts[0]);
          return date.toLocaleDateString();
        }
      }
      return new Date(dateStr).toLocaleDateString();
    }
    
    return dateStr;
  }, []);

  const handleCardClick = useCallback(() => {
    onClick();
  }, [onClick]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }, [onClick]);

  return (
    <div 
      className="building-card" 
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${building.BuildingName || building.id}`}
    >
      <div className="building-content">
        <div className="building-header">
          <h3 className="building-name">
            {building.BuildingName || building.id}
          </h3>
        </div>
        
        <div className="building-details">
          {/* Completely hide Building ID for children role */}
          {building.userRoleInBuilding !== 'children' || isSystemAdmin && (
            <div className="detail-item">
              <span className="detail-label">ID:</span>
              <span className="detail-value">{building.id}</span>
            </div>
          )}
          
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

          <div className="detail-item">
            <span className="detail-label">Created by:</span>
            <span className="detail-value">{building.CreatedBy}</span>
          </div>
          
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