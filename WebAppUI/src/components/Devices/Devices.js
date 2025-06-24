// src/components/Devices/Devices.js - Enhanced with Pi Device Refresh Integration

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MdAdd, MdRefresh, MdSearch, MdDevices, MdMemory } from 'react-icons/md';
import { database } from '../../services/firebase';
import { ref, update } from 'firebase/database';
import dataService from '../../services/dataService';
import { 
  getUserRole, 
  canControlDevice, 
  canManageDevices,
  isSystemAdmin,
  getUserRoleInBuilding
} from '../../utils/helpers';
import './Devices.css';

// ==============================================================================
// PI DEVICE REFRESH SERVICE
// ==============================================================================

/**
 * Service to communicate with Raspberry Pi for device refresh operations
 */
const PiDeviceRefreshService = {
  /**
   * Trigger Pi to refresh its device mappings
   * @returns {Promise<Object>} Refresh result
   */
  triggerPiDeviceRefresh: async () => {
    try {
      console.log('🔄 Triggering Pi device mappings refresh...');
      
      const timestamp = new Date().toISOString();
      const refreshTrigger = {
        action: 'REFRESH_DEVICES',
        triggeredAt: timestamp,
        triggeredBy: localStorage.getItem('userEmail') || 'system',
        status: 'PENDING'
      };
      
      // Import Firebase functions
      const { firestore } = await import('../../services/firebase');
      const { doc, setDoc } = await import('firebase/firestore');
      
      // Create unique trigger ID
      const triggerId = `REFRESH_${Date.now()}`;
      
      // Send trigger to Pi
      await setDoc(
        doc(firestore, 'DEVICE_REFRESH_TRIGGERS', triggerId), 
        refreshTrigger
      );
      
      console.log(`✅ Device refresh trigger sent to Pi: ${triggerId}`);
      
      return {
        success: true,
        message: 'Pi device refresh triggered successfully',
        triggerId: triggerId
      };
      
    } catch (error) {
      console.error('❌ Error triggering Pi device refresh:', error);
      return {
        success: false,
        message: 'Failed to trigger Pi device refresh: ' + error.message
      };
    }
  }
};

// Filter options
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' }
];

const Devices = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const userEmail = localStorage.getItem('userEmail') || '';

  // Core state
  const [devices, setDevices] = useState([]);
  const [locations, setLocations] = useState([]);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState(null);
  
  // User permissions
  const [userRole, setUserRole] = useState('none');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);

  // Enhanced device filtering with strict security
  const filterAccessibleDevices = useCallback(async (allDevices, locationsData, isAdmin) => {
    const accessibleDevices = [];
    
    for (const device of allDevices) {
      let hasAccess = false;
      
      // SystemAdmin has access to all devices
      if (isAdmin) {
        hasAccess = true;
      } else if (device.Location) {
        // Device is claimed - check building access
        const location = locationsData.find(loc => loc.id === device.Location);
        if (location && location.Building) {
          const roleInBuilding = await getUserRoleInBuilding(userEmail, location.Building);
          
          if (roleInBuilding === 'parent') {
            // Parents can see all devices in their buildings
            hasAccess = true;
          } else if (roleInBuilding === 'children') {
            // Children can only see devices they're assigned to
            const assignedTo = device.AssignedTo || [];
            hasAccess = assignedTo.includes(userEmail);
          }
        }
      }
      // Unclaimed devices (no location) are only visible to SystemAdmin
      
      if (hasAccess) {
        accessibleDevices.push(device);
      }
    }
    
    return accessibleDevices;
  }, [userEmail]);

  // Memoized filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      // Search filter
      if (searchTerm) {
        const deviceName = device.DeviceName || device.id;
        const deviceType = device.DeviceType || '';
        const locationName = getLocationName(device);
        
        const searchText = `${deviceName} ${deviceType} ${locationName}`.toLowerCase();
        if (!searchText.includes(searchTerm.toLowerCase())) {
          return false;
        }
      }
      
      // Status filter
      if (statusFilter !== 'all') {
        const deviceStatus = device.status || 'OFF';
        if (statusFilter === 'on' && deviceStatus !== 'ON') return false;
        if (statusFilter === 'off' && deviceStatus !== 'OFF') return false;
      }
      
      // Location filter
      if (locationFilter !== 'all' && device.Location !== locationFilter) {
        return false;
      }
      
      return true;
    });
  }, [devices, searchTerm, statusFilter, locationFilter, locations]);

  // Helper functions
  const getLocationName = useCallback((device) => {
    if (!device.Location) return 'Unclaimed';
    
    if (device.locationDetails) {
      return device.locationDetails.locationName;
    }
    
    const location = locations.find(loc => loc.id === device.Location);
    return location ? (location.locationName || device.Location) : device.Location;
  }, [locations]);

  const getBuildingName = useCallback((device) => {
    if (!device.Location) return 'No Building';
    
    if (device.locationDetails) {
      return device.locationDetails.buildingName || device.locationDetails.building;
    }
    
    const location = locations.find(loc => loc.id === device.Location);
    return location ? (location.buildingName || location.Building || 'Unknown Building') : 'Unknown Building';
  }, [locations]);

  // Get user's role in device's building
  const getUserRoleInDeviceBuilding = useCallback(async (device) => {
    if (!device.Location) return 'none';
    
    const location = locations.find(loc => loc.id === device.Location);
    if (!location || !location.Building) return 'none';
    
    return await getUserRoleInBuilding(userEmail, location.Building);
  }, [locations, userEmail]);

  // Fetch device location details
  const fetchDeviceLocationDetails = useCallback(async (device) => {
    if (!device.Location) {
      return {
        ...device,
        locationDetails: null
      };
    }

    try {
      const { getDoc, doc } = await import('firebase/firestore');
      const { firestore } = await import('../../services/firebase');
      
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', device.Location));
      if (locationDoc.exists()) {
        const locationData = locationDoc.data();
        
        // Fetch building name
        let buildingName = 'Unknown Building';
        if (locationData.Building) {
          try {
            const buildingDoc = await getDoc(doc(firestore, 'BUILDING', locationData.Building));
            if (buildingDoc.exists()) {
              const buildingData = buildingDoc.data();
              buildingName = buildingData.BuildingName || locationData.Building;
            }
          } catch (buildingError) {
            console.error('Error fetching building data:', buildingError);
          }
        }
        
        return {
          ...device,
          locationDetails: {
            id: device.Location,
            locationName: locationData.LocationName || device.Location,
            building: locationData.Building || 'Unknown Building',
            buildingName: buildingName
          }
        };
      }
    } catch (error) {
      console.error('Error fetching location details:', error);
    }

    return {
      ...device,
      locationDetails: null
    };
  }, []);

  // ENHANCED: Fetch devices with Pi refresh integration
  const fetchDevices = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      setRefreshStatus(null);

      console.log('🔄 Starting device refresh...');

      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);

      const role = await getUserRole(userEmail);
      setUserRole(role);

      const canManageDevs = await canManageDevices(userEmail);
      setCanManage(canManageDevs);

      console.log('📱 Fetching device data from web app...');

      // Fetch devices and locations from web app
      const { devices: allDevices, locations: allLocations } = await dataService.getUserDevicesAndLocations(userEmail);
      
      const locationsWithBuildingNames = allLocations.map(location => ({
        ...location,
        locationName: location.LocationName || location.locationName || location.id,
        buildingName: location.buildingName || location.Building || 'Unknown Building'
      }));
      
      setLocations(locationsWithBuildingNames);

      const accessibleDevices = await filterAccessibleDevices(allDevices, locationsWithBuildingNames, isAdmin);
      
      console.log(`📊 Found ${accessibleDevices.length} accessible devices`);
      
      const devicesWithLocationDetails = await Promise.all(
        accessibleDevices.map(device => fetchDeviceLocationDetails(device))
      );
      
      setDevices(devicesWithLocationDetails);

      // ENHANCED: Trigger Pi device refresh for SystemAdmin users
      if (isAdmin) {
        console.log('👑 SystemAdmin detected - triggering Pi device refresh...');
        setRefreshStatus({
          type: 'info',
          message: '🤖 Syncing with Raspberry Pi...'
        });
        
        const piRefreshResult = await PiDeviceRefreshService.triggerPiDeviceRefresh();
        
        if (piRefreshResult.success) {
          setRefreshStatus({
            type: 'success',
            message: '✅ Web app and Pi device mappings refreshed successfully'
          });
          console.log('✅ Pi device refresh triggered successfully');
        } else {
          setRefreshStatus({
            type: 'warning',
            message: '⚠️ Web app refreshed, but Pi sync failed: ' + piRefreshResult.message
          });
          console.warn('⚠️ Pi device refresh failed:', piRefreshResult.message);
        }
      } else {
        setRefreshStatus({
          type: 'success',
          message: '✅ Device list refreshed successfully'
        });
      }
      
      // Auto-hide refresh status after 5 seconds
      setTimeout(() => {
        setRefreshStatus(null);
      }, 5000);

    } catch (error) {
      console.error('❌ Error in fetchDevices:', error);
      setError('Failed to load devices');
      setRefreshStatus({
        type: 'error',
        message: '❌ Failed to refresh devices: ' + error.message
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [userEmail, fetchDeviceLocationDetails, filterAccessibleDevices]);

  // Handle device click - navigate to device detail
  const handleDeviceClick = useCallback((deviceId) => {
    navigate(`/devices/detail/${deviceId}`);
  }, [navigate]);

  // Device toggle handler with runtime tracking
  const handleDeviceToggle = useCallback(async (device, e) => {
    e.stopPropagation();
    
    try {
      let canControl = isUserSystemAdmin;
      
      if (!canControl) {
        canControl = await canControlDevice(device, userEmail, locations);
      }
      
      if (!canControl) {
        alert('You do not have permission to control this device');
        return;
      }

      // Use the enhanced toggle function with runtime tracking
      const newStatus = await dataService.toggleDeviceStatus(device.id);
      
      setDevices(prevDevices => 
        prevDevices.map(d => 
          d.id === device.id ? { 
            ...d, 
            status: newStatus,
            onSince: newStatus === 'ON' ? new Date() : null,
            warningCount: 0
          } : d
        )
      );

    } catch (error) {
      console.error('Device toggle error:', error);
      alert('Failed to toggle device status');
    }
  }, [isUserSystemAdmin, userEmail, locations]);

  // Enhanced refresh handler
  const handleRefresh = useCallback(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Show message from navigation state
  useEffect(() => {
    if (location.state?.message) {
      setError(null);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Initial load
  useEffect(() => {
    if (userEmail) {
      fetchDevices();
    } else {
      setLoading(false);
      setError('User not authenticated');
    }
  }, [userEmail, fetchDevices]);

  if (loading) {
    return (
      <div className="devices-page">
        <div className="loading">Loading devices...</div>
      </div>
    );
  }

  return (
    <div className="devices-page">
      <DevicesHeader 
        canManage={canManage}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        isSystemAdmin={isUserSystemAdmin}
        devicesCount={devices.length}
        filteredCount={filteredDevices.length}
      />

      {error && (
        <ErrorMessage 
          message={error} 
          onRetry={handleRefresh} 
        />
      )}

      {/* Enhanced Refresh Status Display */}
      {refreshStatus && (
        <RefreshStatusMessage 
          status={refreshStatus}
          onDismiss={() => setRefreshStatus(null)}
        />
      )}

      <DeviceFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        locationFilter={locationFilter}
        onLocationFilterChange={setLocationFilter}
        locations={locations}
        isSystemAdmin={isUserSystemAdmin}
      />

      <DevicesGrid 
        devices={filteredDevices}
        userEmail={userEmail}
        isSystemAdmin={isUserSystemAdmin}
        userRole={userRole}
        searchTerm={searchTerm}
        onDeviceClick={handleDeviceClick}
        onDeviceToggle={handleDeviceToggle}
        getLocationName={getLocationName}
        getBuildingName={getBuildingName}
        getUserRoleInDeviceBuilding={getUserRoleInDeviceBuilding}
      />
    </div>
  );
};

// ==============================================================================
// ENHANCED COMPONENT DEFINITIONS
// ==============================================================================

// Enhanced Devices Header with Pi sync indication
const DevicesHeader = ({ 
  canManage, 
  onRefresh, 
  refreshing, 
  isSystemAdmin, 
  devicesCount 
}) => (
  <div className="devices-header">
    <h2>
      {isSystemAdmin ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MdDevices style={{ color: '#22c55e' }} />
          System Devices ({devicesCount})
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MdDevices style={{ color: '#22c55e' }} />
          My Devices ({devicesCount})
        </span>
      )}
    </h2>
    <div className="header-actions">
      <button 
        onClick={onRefresh}
        className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
        disabled={refreshing}
        title={isSystemAdmin ? "Refresh devices and sync with Pi" : "Refresh devices"}
      >
        <MdRefresh />
      </button>
      {canManage && (
        <Link to="/devices/add" className="add-device-btn">
          <MdAdd /> {isSystemAdmin ? 'Register New Device' : 'Claim Device'}
        </Link>
      )}
    </div>
  </div>
);

const ErrorMessage = ({ message, onRetry }) => (
  <div className="error-message">
    {message}
    <button onClick={onRetry} className="retry-btn">
      Try Again
    </button>
  </div>
);

// NEW: Refresh Status Message Component
const RefreshStatusMessage = ({ status, onDismiss }) => (
  <div className={`refresh-status-message ${status.type}`}>
    <span className="status-text">{status.message}</span>
    <button 
      onClick={onDismiss} 
      className="dismiss-btn"
      type="button"
      aria-label="Dismiss message"
    >
      ×
    </button>
  </div>
);

const DeviceFilters = ({ 
  searchTerm, 
  onSearchChange, 
  statusFilter, 
  onStatusFilterChange, 
  locationFilter, 
  onLocationFilterChange, 
  locations,
  isSystemAdmin 
}) => (
  <div className="filters-section">
    <div className="search-container">
      <MdSearch className="search-icon" />
      <input 
        type="text" 
        placeholder={isSystemAdmin ? "Search all devices..." : "Search devices..."} 
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
    </div>
    
    <div className="filter-controls">
      <div className="status-filters">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onStatusFilterChange(value)}
            className={`filter-btn ${statusFilter === value ? 'active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      
      <select 
        value={locationFilter} 
        onChange={(e) => onLocationFilterChange(e.target.value)}
        className="location-select"
      >
        <option value="all">All Locations</option>
        {locations.map(location => (
          <option key={location.id} value={location.id}>
            {location.locationName || location.id}
          </option>
        ))}
      </select>
    </div>
  </div>
);

const DevicesGrid = ({ 
  devices, 
  userEmail, 
  isSystemAdmin, 
  userRole,
  searchTerm,
  onDeviceClick, 
  onDeviceToggle, 
  getLocationName, 
  getBuildingName,
  getUserRoleInDeviceBuilding
}) => {
  if (devices.length === 0) {
    return (
      <NoDevicesMessage 
        searchTerm={searchTerm}
        userRole={userRole}
        isSystemAdmin={isSystemAdmin}
      />
    );
  }

  return (
    <div className="devices-grid">
      {devices.map(device => (
        <DeviceCard
          key={device.id}
          device={device}
          userEmail={userEmail}
          isSystemAdmin={isSystemAdmin}
          onClick={() => onDeviceClick(device.id)}
          onToggle={(e) => onDeviceToggle(device, e)}
          getLocationName={getLocationName}
          getBuildingName={getBuildingName}
          getUserRoleInDeviceBuilding={getUserRoleInDeviceBuilding}
        />
      ))}
    </div>
  );
};

const NoDevicesMessage = ({ searchTerm, userRole, isSystemAdmin }) => {
  const getMessage = () => {
    if (searchTerm) {
      return `No devices match "${searchTerm}". Try adjusting your search terms or filters.`;
    }
    
    if (userRole === 'none') {
      return "You don't have access to any devices yet. Contact an administrator or create a building to get started.";
    }
    
    if (isSystemAdmin) {
      return "No devices exist in the system yet. Users need to add devices to their buildings.";
    }
    
    return "No devices found in your accessible locations. Claim devices for your buildings or ask to be assigned to existing devices.";
  };

  return (
    <div className="no-devices">
      <div className="no-data-content">
        <h3>
          {searchTerm ? 'No Devices Found' : 'No Devices Available'}
        </h3>
        <p>{getMessage()}</p>
      </div>
    </div>
  );
};

// Device Card Component with runtime warning indicators
const DeviceCard = ({ 
  device, 
  userEmail, 
  isSystemAdmin, 
  onClick, 
  onToggle, 
  getLocationName, 
  getBuildingName,
  getUserRoleInDeviceBuilding
}) => {
  const [userRoleInBuilding, setUserRoleInBuilding] = React.useState('user');
  
  React.useEffect(() => {
    const fetchRole = async () => {
      const role = await getUserRoleInDeviceBuilding(device);
      setUserRoleInBuilding(role);
    };
    fetchRole();
  }, [device, getUserRoleInDeviceBuilding]);
  
  const isAssigned = device.AssignedTo && device.AssignedTo.includes(userEmail);
  const deviceStatus = device.status || 'OFF';
  const isClaimed = !!device.Location;
  const canViewSensitiveInfo = isSystemAdmin || userRoleInBuilding === 'parent';

  // Runtime warning indicators
  const isLongRunning = useMemo(() => {
    if (deviceStatus !== 'ON' || !device.onSince) return false;
    
    let onSince;
    if (device.onSince && typeof device.onSince.toDate === 'function') {
      onSince = device.onSince.toDate();
    } else if (device.onSince instanceof Date) {
      onSince = device.onSince;
    } else if (typeof device.onSince === 'string') {
      onSince = new Date(device.onSince);
    } else {
      return false;
    }
    
    const now = new Date();
    const hoursOn = Math.floor((now - onSince) / (1000 * 60 * 60));
    
    return hoursOn >= 5;
  }, [deviceStatus, device.onSince]);

  const warningCount = device.warningCount || 0;

  return (
    <div className="device-card" onClick={onClick}>
      <div className="device-content">
        <DeviceCardHeader 
          device={device}
          isAssigned={isAssigned}
          isClaimed={isClaimed}
          isSystemAdmin={isSystemAdmin}
          canViewSensitiveInfo={canViewSensitiveInfo}
          isLongRunning={isLongRunning}
          warningCount={warningCount}
        />
        
        <DeviceCardDetails 
          device={device}
          canViewSensitiveInfo={canViewSensitiveInfo}
          getLocationName={getLocationName}
          getBuildingName={getBuildingName}
          isLongRunning={isLongRunning}
        />
        
        <DeviceCardActions 
          device={device}
          deviceStatus={deviceStatus}
          isClaimed={isClaimed}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
};

// Device Card Header Component
const DeviceCardHeader = ({ 
  device, 
  isAssigned, 
  isClaimed, 
  isSystemAdmin, 
  canViewSensitiveInfo, 
  isLongRunning, 
  warningCount 
}) => (
  <div className="device-header">
    <h3 className="device-name">
      {device.DeviceName || device.id}
    </h3>
    <div className="device-indicators">
      {!isClaimed && (
        <span className="status-badge available" title="Device available for claiming">
          Available
        </span>
      )}
      {isAssigned && (
        <span className="assigned-badge" title="Device assigned to you">
          Assigned
        </span>
      )}
      {isLongRunning && (
        <span 
          className="status-badge" 
          style={{ 
            backgroundColor: '#f59e0b', 
            color: 'white' 
          }}
          title={`Device has been ON for 5+ hours${warningCount > 0 ? ` (${warningCount} warnings sent)` : ''}`}
        >
          ⚠️ Long Run
        </span>
      )}
    </div>
  </div>
);

// Device Card Details Component
const DeviceCardDetails = ({ 
  device, 
  canViewSensitiveInfo, 
  getLocationName, 
  getBuildingName, 
  isLongRunning 
}) => (
  <div className="device-details">
    <DeviceDetailItem label="Type:" value={device.DeviceType || 'Unknown'}/>
    <DeviceDetailItem label="Building:" value={getBuildingName(device)}/>
    <DeviceDetailItem label="Location:" value={getLocationName(device)}/>
    
    {isLongRunning && device.onSince && (
      <DeviceDetailItem 
        label="On Since:" 
        value={(() => {
          let onSince;
          if (device.onSince && typeof device.onSince.toDate === 'function') {
            onSince = device.onSince.toDate();
          } else if (device.onSince instanceof Date) {
            onSince = device.onSince;
          } else if (typeof device.onSince === 'string') {
            onSince = new Date(device.onSince);
          } else {
            return 'Unknown';
          }
          return onSince.toLocaleString();
        })()}
        style={{ color: '#f59e0b', fontSize: '0.75rem' }}
      />
    )}
    
    {canViewSensitiveInfo && device.AssignedTo && device.AssignedTo.length > 0 && (
      <DeviceDetailItem 
        label="Assigned:" 
        value={`${device.AssignedTo.length} user(s)`} 
      />
    )}
  </div>
);

// Device Detail Item Component
const DeviceDetailItem = ({ label, value, style = {} }) => (
  <div className="detail-item" style={style}>
    <span className="detail-label">{label}</span>
    <span className="detail-value">{value}</span>
  </div>
);

// Device Card Actions Component
const DeviceCardActions = ({ device, deviceStatus, isClaimed, onToggle }) => (
  <div className="device-actions">
    <div className="device-status-section">
      {isClaimed ? (
        <DeviceToggle 
          deviceStatus={deviceStatus}
          onToggle={onToggle}
        />
      ) : (
        <span style={{ 
          fontSize: '0.75rem', 
          color: '#6b7280', 
          fontStyle: 'italic' 
        }}>
          Not claimed yet
        </span>
      )}
    </div>
  </div>
);

// Device Toggle Component
const DeviceToggle = ({ deviceStatus, onToggle }) => (
  <button
    className={`device-toggle ${deviceStatus === 'ON' ? 'toggle-on' : 'toggle-off'}`}
    onClick={onToggle}
    title={`Turn ${deviceStatus === 'ON' ? 'OFF' : 'ON'}`}
  />
);

export default Devices;