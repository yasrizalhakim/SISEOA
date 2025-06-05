// src/components/Devices/Devices.js - Enhanced Security and Role-Based Access
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MdAdd, MdRefresh, MdSearch, MdDevices } from 'react-icons/md';
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
  
  // User permissions
  const [userRole, setUserRole] = useState('none');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [userBuildingRoles, setUserBuildingRoles] = useState(new Map());

  // NEW: Enhanced device filtering with strict security
  const filterAccessibleDevices = useCallback(async (allDevices) => {
    const accessibleDevices = [];
    
    for (const device of allDevices) {
      let hasAccess = false;
      
      // SystemAdmin has access to all devices
      if (isUserSystemAdmin) {
        hasAccess = true;
      } else if (device.Location) {
        // Device is claimed - check building access
        const location = locations.find(loc => loc.id === device.Location);
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
    
    console.log(`🔐 Filtered ${allDevices.length} devices to ${accessibleDevices.length} accessible devices`);
    return accessibleDevices;
  }, [isUserSystemAdmin, userEmail, locations]);

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
  }, [devices, searchTerm, statusFilter, locationFilter]);

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

  // NEW: Get user's role in device's building
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
        
        // NEW: Fetch building name
        let buildingName = 'Unknown Building';
        if (locationData.Building) {
          try {
            const buildingDoc = await getDoc(doc(firestore, 'BUILDING', locationData.Building));
            if (buildingDoc.exists()) {
              const buildingData = buildingDoc.data();
              buildingName = buildingData.BuildingName || locationData.Building;
            }
          } catch (buildingError) {
            console.error('Error fetching building details:', buildingError);
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
      console.error(`Error fetching location details for device ${device.id}:`, error);
    }

    return {
      ...device,
      locationDetails: null
    };
  }, []);

  // Fetch devices and user permissions
  const fetchDevices = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);

      console.log('🚀 Fetching devices for user:', userEmail);

      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);

      const role = await getUserRole(userEmail);
      setUserRole(role);

      const canManageDevs = await canManageDevices(userEmail);
      setCanManage(canManageDevs);

      console.log('👤 User permissions:', { 
        isSystemAdmin: isAdmin, 
        role: role, 
        canManageDevices: canManageDevs 
      });

      const { devices: allDevices, locations: allLocations } = await dataService.getUserDevicesAndLocations(userEmail);
      
      const locationsWithBuildingNames = allLocations.map(location => ({
        ...location,
        locationName: location.LocationName || location.locationName || location.id,
        buildingName: location.buildingName || location.Building || 'Unknown Building'
      }));
      
      setLocations(locationsWithBuildingNames);

      // NEW: Use enhanced filtering with strict security
      const accessibleDevices = await filterAccessibleDevices(allDevices);
      
      console.log('📍 Fetching location details for accessible devices...');
      const devicesWithLocationDetails = await Promise.all(
        accessibleDevices.map(device => fetchDeviceLocationDetails(device))
      );
      
      setDevices(devicesWithLocationDetails);

      console.log('📱 Accessible devices with location details:', devicesWithLocationDetails.length);

    } catch (error) {
      console.error('❌ Error fetching devices:', error);
      setError('Failed to load devices');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [userEmail, fetchDeviceLocationDetails, filterAccessibleDevices]);

  // Handle device click - navigate to device detail
  const handleDeviceClick = useCallback((deviceId) => {
    navigate(`/devices/detail/${deviceId}`);
  }, [navigate]);

  // Device toggle handler
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

      const newStatus = await dataService.toggleDeviceStatus(device.id);
      
      setDevices(prevDevices => 
        prevDevices.map(d => 
          d.id === device.id ? { ...d, status: newStatus } : d
        )
      );

    } catch (error) {
      console.error('Error toggling device:', error);
      alert('Failed to toggle device status');
    }
  }, [isUserSystemAdmin, userEmail, locations]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Show message from navigation state
  useEffect(() => {
    if (location.state?.message) {
      setError(null);
      console.log('Navigation message:', location.state.message);
      
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

// Devices Header Component
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
      <RefreshButton 
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      {canManage && (
        <AddDeviceButton isSystemAdmin={isSystemAdmin} />
      )}
    </div>
  </div>
);

// Refresh Button Component
const RefreshButton = ({ onRefresh, refreshing }) => (
  <button 
    onClick={onRefresh}
    className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
    disabled={refreshing}
    title="Refresh devices"
  >
    <MdRefresh />
  </button>
);

// Add Device Button Component
const AddDeviceButton = ({ isSystemAdmin }) => (
  <Link to="/devices/add" className="add-device-btn">
    <MdAdd /> {isSystemAdmin ? 'Register New Device' : 'Claim Device'}
  </Link>
);

// Error Message Component
const ErrorMessage = ({ message, onRetry }) => (
  <div className="error-message">
    {message}
    <button onClick={onRetry} className="retry-btn">
      Try Again
    </button>
  </div>
);

// Device Filters Component
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
    <SearchInput 
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      isSystemAdmin={isSystemAdmin}
    />
    
    <div className="filter-controls">
      <StatusFilters 
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
      />
      
      <LocationFilter
        locationFilter={locationFilter}
        onLocationFilterChange={onLocationFilterChange}
        locations={locations}
      />
    </div>
  </div>
);

// Search Input Component
const SearchInput = ({ searchTerm, onSearchChange, isSystemAdmin }) => (
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
);

// Status Filters Component
const StatusFilters = ({ statusFilter, onStatusFilterChange }) => (
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
);

// Location Filter Component
const LocationFilter = ({ locationFilter, onLocationFilterChange, locations }) => (
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
);

// Devices Grid Component
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

// No Devices Message Component
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

// Device Card Component
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
  
  // Get user's role in device building for display logic
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

  return (
    <div className="device-card" onClick={onClick}>
      <div className="device-content">
        <DeviceCardHeader 
          device={device}
          isAssigned={isAssigned}
          isClaimed={isClaimed}
          isSystemAdmin={isSystemAdmin}
          canViewSensitiveInfo={canViewSensitiveInfo}
        />
        
        <DeviceCardDetails 
          device={device}
          canViewSensitiveInfo={canViewSensitiveInfo}
          getLocationName={getLocationName}
          getBuildingName={getBuildingName}
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
const DeviceCardHeader = ({ device, isAssigned, isClaimed, isSystemAdmin, canViewSensitiveInfo }) => (
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
      {isSystemAdmin && (
        <span className="admin-badge" title="SystemAdmin access">
          Admin
        </span>
      )}
    </div>
  </div>
);

// Device Card Details Component
const DeviceCardDetails = ({ device, canViewSensitiveInfo, getLocationName, getBuildingName }) => (
  <div className="device-details">
    {/* Only show Device ID to users who can view sensitive info */}
    {canViewSensitiveInfo && (
      <DeviceDetailItem label="ID:" value={device.id} />
    )}
    <DeviceDetailItem label="Type:" value={device.DeviceType || 'Unknown'} />
    <DeviceDetailItem label="Location:" value={getLocationName(device)} />
    <DeviceDetailItem label="Building:" value={getBuildingName(device)} />
    
    {/* Only show assigned count to users who can view sensitive info */}
    {canViewSensitiveInfo && device.AssignedTo && device.AssignedTo.length > 0 && (
      <DeviceDetailItem 
        label="Assigned:" 
        value={`${device.AssignedTo.length} user(s)`} 
      />
    )}
  </div>
);

// Device Detail Item Component
const DeviceDetailItem = ({ label, value }) => (
  <div className="detail-item">
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