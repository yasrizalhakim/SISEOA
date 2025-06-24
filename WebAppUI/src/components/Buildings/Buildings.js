// Enhanced Buildings.js with Manual Pattern Learning for SystemAdmin

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MdEdit, MdAdd, MdRefresh, MdSearch, MdAdminPanelSettings, MdPsychology, MdWarning } from 'react-icons/md';
import buildingService from '../../services/buildingService';
import { isSystemAdmin } from '../../utils/helpers';
import './Buildings.css';

// ==============================================================================
// SIMPLIFIED PATTERN LEARNING SERVICE
// ==============================================================================

/**
 * Simple Pattern Learning Service - Just triggers the Pi scheduler
 */
const PatternLearningService = {
  /**
   * Trigger the Pi to run its scheduler manually
   * @returns {Promise<Object>} Learning results
   */
  triggerScheduler: async () => {
    try {
      console.log('🧠 Triggering Pi scheduler to run pattern learning');
      
      // Simple trigger - just tell Pi to run the scheduler
      const triggerData = {
        action: 'RUN_SCHEDULER',
        triggeredAt: new Date().toISOString(),
        triggeredBy: localStorage.getItem('userEmail') || 'system'
      };
      
      // Write to a simple collection that Pi monitors
      const { firestore } = await import('../../services/firebase');
      const { doc, setDoc } = await import('firebase/firestore');
      
      const triggerId = `SCHEDULER_${Date.now()}`;
      await setDoc(doc(firestore, 'SCHEDULER_TRIGGERS', triggerId), triggerData);
      
      console.log(`✅ Scheduler trigger sent to Pi: ${triggerId}`);
      
      return {
        success: true,
        message: 'Pattern learning scheduler triggered. The Raspberry Pi will analyze all device patterns and create automation rules.',
        triggerId: triggerId
      };
      
    } catch (error) {
      console.error('❌ Error triggering scheduler:', error);
      return {
        success: false,
        message: 'Failed to trigger scheduler: ' + error.message
      };
    }
  }
};

// ==============================================================================
// SIMPLE SCHEDULER TRIGGER COMPONENT
// ==============================================================================

const SchedulerTriggerButton = ({ isSystemAdmin }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const handleTriggerScheduler = useCallback(async () => {
    if (isRunning) return;
    
    try {
      setIsRunning(true);
      setResult(null);
      
      console.log('🧠 Triggering Pi scheduler');
      
      const response = await PatternLearningService.triggerScheduler();
      
      setResult(response);
      setShowResult(true);
      
      // Auto-hide after success
      if (response.success) {
        setTimeout(() => {
          setShowResult(false);
        }, 6000);
      }
      
    } catch (error) {
      console.error('❌ Scheduler trigger error:', error);
      setResult({
        success: false,
        message: 'Failed to trigger scheduler: ' + error.message
      });
      setShowResult(true);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning]);

  if (!isSystemAdmin) {
    return null;
  }

  return (
    <div className="scheduler-trigger">
      <button
        type="button"
        onClick={handleTriggerScheduler}
        disabled={isRunning}
        className={`scheduler-btn ${isRunning ? 'running' : ''}`}
        title="Run pattern learning scheduler manually"
      >
        <MdPsychology className={isRunning ? 'spinning' : ''} />
        {isRunning ? 'Running...' : 'Run Pattern Learning'}
      </button>
      
      {showResult && result && (
        <div className={`result-popup ${result.success ? 'success' : 'error'}`}>
          <div className="result-header">
            <span className="result-icon">
              {result.success ? '✅' : '❌'}
            </span>
            <span className="result-title">
              {result.success ? 'Scheduler Triggered' : 'Failed'}
            </span>
            <button 
              className="close-result"
              onClick={() => setShowResult(false)}
              type="button"
            >
              ×
            </button>
          </div>
          
          <div className="result-content">
            <p>{result.message}</p>
            {result.success && (
              <div className="result-info">
                <MdWarning className="info-icon" />
                <p>The Pi is now analyzing device patterns. Check device automation settings for new rules.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ==============================================================================
// SIMPLIFIED BUILDING CARD COMPONENT
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
          {isSystemAdmin && (
            <div className="admin-badge">
              <MdAdminPanelSettings />
              Admin
            </div>
          )}
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

// ==============================================================================
// MAIN BUILDINGS COMPONENT (updated to pass isSystemAdmin to cards)
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
// BUILDINGS HEADER COMPONENT (with System Pattern Learning)
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
        {/* Simple Scheduler Trigger for SystemAdmin */}
        <SchedulerTriggerButton isSystemAdmin={isSystemAdmin} />
        
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

export default Buildings;