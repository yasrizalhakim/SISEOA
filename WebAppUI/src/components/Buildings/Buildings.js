// src/components/Buildings/Buildings.js - Refactored without custom hooks

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MdEdit, MdAdd, MdRefresh, MdSearch, MdAdminPanelSettings } from 'react-icons/md';
import buildingService from '../../services/buildingService';
import { isSystemAdmin } from '../../utils/helpers';
import './Buildings.css';

// ==============================================================================
// MAIN BUILDINGS COMPONENT
// ==============================================================================

const Buildings = () => {
  const [buildings, setBuildings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  
  const navigate = useNavigate();
  const userEmail = useMemo(() => localStorage.getItem('userEmail') || '', []);

  // Check if user is SystemAdmin
  const checkSystemAdmin = useCallback(async () => {
    if (!userEmail) return false;
    
    try {
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);
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

      const isAdmin = await checkSystemAdmin();
      let buildingsData = [];

      if (isAdmin) {
        buildingsData = await buildingService.getAllBuildings();
      } else {
        buildingsData = await buildingService.getUserBuildings(userEmail);
      }

      // Sort buildings alphabetically
      const sortedBuildings = buildingService.sortBuildingsAlphabetically(buildingsData);
      setBuildings(sortedBuildings);
      
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
    return buildingService.filterBuildingsBySearch(buildings, searchTerm);
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
        onBuildingClick={handleBuildingClick}
        isSystemAdmin={isUserSystemAdmin}
        searchTerm={searchTerm}
      />
    </div>
  );
};

// ==============================================================================
// BUILDINGS HEADER COMPONENT
// ==============================================================================

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
    
    return `My Buildings (${buildingsCount})`;
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

// ==============================================================================
// SEARCH CONTROLS COMPONENT
// ==============================================================================

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

// ==============================================================================
// BUILDINGS GRID COMPONENT
// ==============================================================================

const BuildingsGrid = ({ 
  buildings, 
  onBuildingClick, 
  isSystemAdmin, 
  searchTerm 
}) => {
  if (buildings.length === 0) {
    return <EmptyBuildingsState searchTerm={searchTerm} isSystemAdmin={isSystemAdmin} />;
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

// ==============================================================================
// EMPTY STATE COMPONENT
// ==============================================================================

const EmptyBuildingsState = ({ searchTerm, isSystemAdmin }) => (
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

// ==============================================================================
// BUILDING CARD COMPONENT
// ==============================================================================

const BuildingCard = ({ building, onClick, isSystemAdmin }) => {
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
          {building.userRoleInBuilding !== 'children' && (
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
            <span className="detail-value">
              {buildingService.formatBuildingDate(building.DateCreated || building.CreatedAt)}
            </span>
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