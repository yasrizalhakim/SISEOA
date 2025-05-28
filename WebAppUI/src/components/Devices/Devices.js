// src/components/Devices/Devices.js - Simplified without Owner concept
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MdAdd, MdRefresh, MdSearch, MdDevices, MdBusiness, MdLocationOn } from 'react-icons/md';
import { database, firestore } from '../../services/firebase';
import { ref, get, update } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import dataService from '../../services/dataService';
import { 
  getUserRole, 
  filterUserDevices, 
  canControlDevice, 
  canManageDevices,
  isSystemAdmin 
} from '../../utils/helpers';
import './Devices.css';

const Devices = () => {
  const [devices, setDevices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState('none');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const userEmail = localStorage.getItem('userEmail') || '';

  // Show message from navigation state (e.g., after device creation/deletion)
  useEffect(() => {
    if (location.state?.message) {
      setError(null);
      console.log('Navigation message:', location.state.message);
      
      // Clear the state to prevent showing the message again
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // ENHANCED: Fetch location details for each device
  const fetchDeviceLocationDetails = async (device) => {
    if (!device.Location) {
      return {
        ...device,
        locationDetails: null
      };
    }

    try {
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', device.Location));
      if (locationDoc.exists()) {
        const locationData = locationDoc.data();
        return {
          ...device,
          locationDetails: {
            id: device.Location,
            locationName: locationData.LocationName || device.Location,
            building: locationData.Building || 'Unknown Building'
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
  };

  // Fetch devices and user permissions
  const fetchDevices = async () => {
    try {
      setRefreshing(true);
      setError(null);

      console.log('🚀 Fetching devices for user:', userEmail);

      // Check if user is SystemAdmin
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);

      // Get user role
      const role = await getUserRole(userEmail);
      setUserRole(role);

      // Check if user can manage devices
      const canManageDevs = await canManageDevices(userEmail);
      setCanManage(canManageDevs);

      console.log('👤 User permissions:', { 
        isSystemAdmin: isAdmin, 
        role: role, 
        canManageDevices: canManageDevs 
      });

      // Get all devices and locations with building details
      const { devices: allDevices, locations: allLocations, buildings } = await dataService.getUserDevicesAndLocations(userEmail);
      
      // Set locations with proper building names
      const locationsWithBuildingNames = allLocations.map(location => ({
        ...location,
        locationName: location.LocationName || location.locationName || location.id,
        buildingName: location.buildingName || location.Building || 'Unknown Building'
      }));
      
      setLocations(locationsWithBuildingNames);

      // Filter devices based on user permissions
      const accessibleDevices = await filterUserDevices(allDevices, userEmail, locationsWithBuildingNames);
      
      // ENHANCED: Fetch location details for each device
      console.log('📍 Fetching location details for devices...');
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
  };

  // Initial load
  useEffect(() => {
    if (userEmail) {
      fetchDevices();
    } else {
      setLoading(false);
      setError('User not authenticated');
    }
  }, [userEmail]);

  // Manual refresh
  const handleRefresh = () => {
    fetchDevices();
  };

  // Handle device click - navigate to device detail
  const handleDeviceClick = (deviceId) => {
    navigate(`/devices/detail/${deviceId}`);
  };

  // Device toggle handler
  const handleDeviceToggle = async (device, e) => {
    e.stopPropagation(); // Prevent card click
    
    try {
      // Check if user can control this device
      let canControl = isUserSystemAdmin;
      
      if (!canControl) {
        canControl = await canControlDevice(device, userEmail, locations);
      }
      
      if (!canControl) {
        alert('You do not have permission to control this device');
        return;
      }

      const newStatus = await dataService.toggleDeviceStatus(device.id);
      
      // Update local state
      setDevices(prevDevices => 
        prevDevices.map(d => 
          d.id === device.id ? { ...d, status: newStatus } : d
        )
      );

    } catch (error) {
      console.error('Error toggling device:', error);
      alert('Failed to toggle device status');
    }
  };

  // Get location display name - ENHANCED
  const getLocationName = (device) => {
    if (!device.Location) return 'Unclaimed';
    
    // Use enhanced device location details first
    if (device.locationDetails) {
      return device.locationDetails.locationName;
    }
    
    // Fallback to locations array
    const location = locations.find(loc => loc.id === device.Location);
    return location ? (location.locationName || device.Location) : device.Location;
  };

  // Get building name for location - ENHANCED
  const getBuildingName = (device) => {
    if (!device.Location) return 'No Building';
    
    // Use enhanced device location details first
    if (device.locationDetails) {
      return device.locationDetails.building;
    }
    
    // Fallback to locations array
    const location = locations.find(loc => loc.id === device.Location);
    return location ? (location.buildingName || location.Building || 'Unknown Building') : 'Unknown Building';
  };

  // Filter devices based on search and filters
  const filteredDevices = devices.filter(device => {
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
        <div className="error-message">
          {error}
          <button onClick={handleRefresh} className="retry-btn">
            Try Again
          </button>
        </div>
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
        locations={locations}
        userEmail={userEmail}
        isSystemAdmin={isUserSystemAdmin}
        userRole={userRole}
        onDeviceClick={handleDeviceClick}
        onDeviceToggle={handleDeviceToggle}
        getLocationName={getLocationName}
        getBuildingName={getBuildingName}
        searchTerm={searchTerm}
      />
    </div>
  );
};

// Devices Header Component
const DevicesHeader = ({ canManage, onRefresh, refreshing, isSystemAdmin, devicesCount, filteredCount }) => (
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
        title="Refresh devices"
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
    <div className="search-container">
      <MdSearch className="search-icon" />
      <input 
        type="text" 
        placeholder={isSystemAdmin ? "     Search all devices..." : "Search devices..."} 
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
    </div>
    
    <div className="filter-controls">
      <div className="status-filters">
        {['all', 'on', 'off'].map(status => (
          <button
            key={status}
            onClick={() => onStatusFilterChange(status)}
            className={`filter-btn ${statusFilter === status ? 'active' : ''}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
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

// Devices Grid Component
const DevicesGrid = ({ 
  devices, 
  locations, 
  userEmail, 
  isSystemAdmin, 
  userRole,
  onDeviceClick, 
  onDeviceToggle, 
  getLocationName, 
  getBuildingName, 
  searchTerm 
}) => {
  if (devices.length === 0) {
    return (
      <div className="no-devices">
        <div className="no-data-content">
          <h3>
            {searchTerm ? 'No Devices Found' : 'No Devices Available'}
          </h3>
          <p>
            {searchTerm ? (
              `No devices match "${searchTerm}". Try adjusting your search terms or filters.`
            ) : userRole === 'none' ? (
              "You don't have access to any devices yet. Contact an administrator or create a building to get started."
            ) : isSystemAdmin ? (
              "No devices exist in the system yet. Users need to add devices to their buildings."
            ) : (
              "No devices found in your accessible locations. Claim devices for your buildings or ask to be assigned to existing devices."
            )}
          </p>
        </div>
      </div>
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
        />
      ))}
    </div>
  );
};

// Device Card Component - ENHANCED without Owner concept
const DeviceCard = ({ 
  device, 
  userEmail, 
  isSystemAdmin, 
  onClick, 
  onToggle, 
  getLocationName, 
  getBuildingName 
}) => {
  const isAssigned = device.AssignedTo && device.AssignedTo.includes(userEmail);
  const deviceStatus = device.status || 'OFF';
  const isClaimed = !!device.Location;

  return (
    <div className="device-card" onClick={onClick}>
      <div className="device-content">
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
        
        <div className="device-details">
          <div className="detail-item">
            <span className="detail-label">ID:</span>
            <span className="detail-value">{device.id}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Type:</span>
            <span className="detail-value">{device.DeviceType || 'Unknown'}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Location:</span>
            <span className="detail-value">{getLocationName(device)}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Building:</span>
            <span className="detail-value">{getBuildingName(device)}</span>
          </div>
          
          {device.AssignedTo && device.AssignedTo.length > 0 && (
            <div className="detail-item">
              <span className="detail-label">Assigned:</span>
              <span className="detail-value">{device.AssignedTo.length} user(s)</span>
            </div>
          )}
        </div>
        
        <div className="device-actions">
          <div className="device-status-section">
            {isClaimed && (
              <button
                className={`device-toggle ${deviceStatus === 'ON' ? 'toggle-on' : 'toggle-off'}`}
                onClick={onToggle}
                title={`Turn ${deviceStatus === 'ON' ? 'OFF' : 'ON'}`}
              />
            )}
            {!isClaimed && (
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
      </div>
    </div>
  );
};

export default Devices;