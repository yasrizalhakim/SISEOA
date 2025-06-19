// src/components/Dashboard/Dashboard.js - COMPLETELY FIXED SystemAdmin Access

import React, { useState, useEffect } from 'react';
import { MdDevices, MdBolt, MdLocationOn, MdWarning, MdAdd, MdRefresh, MdAdminPanelSettings, MdBusiness } from 'react-icons/md';
import { Link } from 'react-router-dom';
import { database } from '../../services/firebase';
import { ref, get, update } from 'firebase/database';
import EnergyOverview from '../Dashboard/EnergyOverview';
import dataService from '../../services/dataService';
import { 
  getUserRole, 
  filterUserDevices, 
  canControlDevice, 
  canManageDevices,
  isSystemAdmin,
  getUserRoleInBuilding
} from '../../utils/helpers';
import './Dashboard.css';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    totalDevices: 0,
    activeDevices: 0,
    locations: 0,
    buildings: 0,
    alerts: 0
  });
  const [devices, setDevices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [accessibleBuildings, setAccessibleBuildings] = useState([]);
  const [accessibleDeviceIds, setAccessibleDeviceIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState('none');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  
  // Get current user
  const userEmail = localStorage.getItem('userEmail') || '';

  // COMPLETELY FIXED: Main data fetcher with guaranteed SystemAdmin access
  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      setError(null);

      console.log('🚀 DASHBOARD: Fetching data for user:', userEmail);

      // Step 1: Check SystemAdmin status
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);
      console.log('🔧 DASHBOARD: SystemAdmin status:', isAdmin);

      // Step 2: Get user role and permissions
      const role = await getUserRole(userEmail);
      setUserRole(role);

      const canManageDevs = await canManageDevices(userEmail);
      setCanManage(canManageDevs);

      console.log('👤 DASHBOARD: User info:', { 
        isSystemAdmin: isAdmin, 
        role: role, 
        canManageDevices: canManageDevs 
      });

      // Step 3: CRITICAL - Fetch data based on user type
      let allDevices, allLocations;

      if (isAdmin) {
        // SystemAdmin: Get ALL system data directly - NO FILTERING
        console.log('🔧 DASHBOARD: SystemAdmin detected - fetching ALL system data');
        
        try {
          allDevices = await dataService.getAllDevices();
          console.log(`🔧 DASHBOARD: getAllDevices() returned ${allDevices.length} devices`);
          
          allLocations = await dataService.getAllLocations();
          console.log(`🔧 DASHBOARD: getAllLocations() returned ${allLocations.length} locations`);
        } catch (fetchError) {
          console.error('❌ DASHBOARD: Error fetching system data:', fetchError);
          throw fetchError;
        }
      } else {
        // Regular user: Get filtered data
        console.log('🔧 DASHBOARD: Regular user - fetching user-specific data');
        
        try {
          const { devices: userDevices, locations: userLocations } = await dataService.getUserDevicesAndLocations(userEmail);
          allDevices = userDevices;
          allLocations = userLocations;
          console.log(`🔧 DASHBOARD: Regular user fetched ${allDevices.length} devices, ${allLocations.length} locations`);
        } catch (fetchError) {
          console.error('❌ DASHBOARD: Error fetching user data:', fetchError);
          throw fetchError;
        }
      }

      // Step 4: Set locations
      setLocations(allLocations);

      // Step 5: CRITICAL - Handle device filtering
      let finalDevices;
      if (isAdmin) {
        // SystemAdmin: NO FILTERING AT ALL
        console.log('🔧 DASHBOARD: SystemAdmin - using ALL devices without any filtering');
        finalDevices = allDevices;
      } else {
        // Regular user: Apply security filtering
        console.log('🔧 DASHBOARD: Regular user - applying security filtering');
        finalDevices = await applyUserDeviceFiltering(allDevices, allLocations, userEmail);
      }

      console.log(`🔧 DASHBOARD: Final devices to display: ${finalDevices.length}`);
      
      // Step 6: Set devices state
      setDevices(finalDevices);
      console.log(`🔧 DASHBOARD: Devices state set to ${finalDevices.length} devices`);

      // Step 7: Get accessible buildings
      const userAccessibleBuildings = await getAccessibleBuildings(allLocations, isAdmin);
      setAccessibleBuildings(userAccessibleBuildings);

      // Step 8: Set device IDs for energy overview
      const deviceIds = finalDevices.map(device => device.id);
      setAccessibleDeviceIds(deviceIds);

      // Step 9: Calculate dashboard stats
      const totalDevices = finalDevices.length;
      const activeDevices = finalDevices.filter(device => device.status === 'ON').length;
      
      let uniqueLocations, uniqueBuildings;
      if (isAdmin) {
        uniqueLocations = allLocations.length;
        uniqueBuildings = userAccessibleBuildings.length;
      } else {
        const accessibleLocations = allLocations.filter(location => {
          if (!location.Building) return false;
          return userAccessibleBuildings.includes(location.Building);
        });
        uniqueLocations = accessibleLocations.length;
        uniqueBuildings = userAccessibleBuildings.length;
      }

      // System stats for SystemAdmin
      let systemStats = {};
      if (isAdmin) {
        systemStats = {
          totalSystemDevices: allDevices.length,
          totalSystemLocations: allLocations.length,
          activeSystemDevices: allDevices.filter(device => device.status === 'ON').length,
          totalSystemBuildings: userAccessibleBuildings.length
        };
        console.log('🔧 DASHBOARD: SystemAdmin stats calculated:', systemStats);
      }

      setDashboardData({
        totalDevices,
        activeDevices,
        locations: uniqueLocations,
        buildings: uniqueBuildings,
        alerts: 0,
        ...systemStats
      });

      console.log('📊 DASHBOARD: Final stats:', { 
        totalDevices, 
        activeDevices, 
        uniqueLocations,
        uniqueBuildings,
        isSystemAdmin: isAdmin
      });

    } catch (error) {
      console.error('❌ DASHBOARD: Error in fetchDashboardData:', error);
      setError('Failed to load dashboard data: ' + error.message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  // Helper: Apply user-based device filtering (for non-SystemAdmin)
  const applyUserDeviceFiltering = async (allDevices, allLocations, userEmail) => {
    const accessibleDevices = [];
    
    for (const device of allDevices) {
      let hasAccess = false;
      
      if (device.Location) {
        // Device is claimed - check building access
        const location = allLocations.find(loc => loc.id === device.Location);
        if (location && location.Building) {
          const roleInBuilding = await getUserRoleInBuilding(userEmail, location.Building);
          
          if (roleInBuilding === 'parent') {
            hasAccess = true;
          } else if (roleInBuilding === 'children') {
            const assignedTo = device.AssignedTo || [];
            hasAccess = assignedTo.includes(userEmail);
          }
        }
      }
      // Unclaimed devices are only visible to SystemAdmin
      
      if (hasAccess) {
        accessibleDevices.push(device);
      }
    }
    
    console.log(`🔐 DASHBOARD: Filtered ${allDevices.length} devices to ${accessibleDevices.length} accessible devices`);
    return accessibleDevices;
  };

  // Helper: Get accessible buildings
  const getAccessibleBuildings = async (allLocations, isAdmin) => {
    const buildings = new Set();
    
    if (isAdmin) {
      // SystemAdmin can see all buildings
      const { getDocs, collection } = await import('firebase/firestore');
      const { firestore } = await import('../../services/firebase');
      
      const buildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
      buildingsSnapshot.docs.forEach(doc => {
        buildings.add(doc.id);
      });
    } else {
      // Regular users - only buildings they have access to
      for (const location of allLocations) {
        if (location.Building) {
          const roleInBuilding = await getUserRoleInBuilding(userEmail, location.Building);
          if (roleInBuilding === 'parent' || roleInBuilding === 'children') {
            buildings.add(location.Building);
          }
        }
      }
    }
    
    return Array.from(buildings);
  };

  // Initial load
  useEffect(() => {
    if (userEmail) {
      fetchDashboardData();
    } else {
      setLoading(false);
      setError('User not authenticated');
    }
  }, [userEmail]);

  // Manual refresh handler
  const handleRefresh = () => {
    console.log('🔄 DASHBOARD: Manual refresh triggered');
    fetchDashboardData();
  };

  // Device update handler
  const handleDeviceUpdate = (deviceId, updatedDevice) => {
    console.log(`🔄 DASHBOARD: Updating device ${deviceId}:`, updatedDevice);
    
    setDevices(prevDevices => 
      prevDevices.map(device => 
        device.id === deviceId ? { ...device, ...updatedDevice } : device
      )
    );
    
    // Update active devices count
    const updatedDevices = devices.map(device => 
      device.id === deviceId ? { ...device, ...updatedDevice } : device
    );
    const activeDevices = updatedDevices.filter(device => device.status === 'ON').length;
    
    setDashboardData(prev => ({
      ...prev,
      activeDevices
    }));
  };

  // Render loading state
  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  // Render main dashboard
  return (
    <div className="dashboard">
      {error && (
        <div className="error-message">
          {error}
          <button onClick={handleRefresh} className="retry-btn">
            Try Again
          </button>
        </div>
      )}
      
      {/* SystemAdmin Banner */}
      {isUserSystemAdmin && (
        <div style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          <MdAdminPanelSettings size={20} />
          <span>SystemAdmin View - Full System Access</span>
          {dashboardData.totalSystemDevices > 0 && (
            <span style={{ 
              marginLeft: 'auto', 
              fontSize: '12px', 
              opacity: 0.9 
            }}>
              System Total: {dashboardData.totalSystemDevices} devices, {dashboardData.totalSystemBuildings} buildings
            </span>
          )}
        </div>
      )}
      
      {/* Stats Cards */}
      <div className="stats-container">
        <StatCard
          icon={<MdDevices />}
          value={isUserSystemAdmin ? dashboardData.totalSystemDevices || dashboardData.totalDevices : dashboardData.totalDevices}
          label={isUserSystemAdmin ? "System Devices" : "My Devices"}
          color="blue"
        />
        <StatCard
          icon={<MdBolt />}
          value={isUserSystemAdmin ? dashboardData.activeSystemDevices || dashboardData.activeDevices : dashboardData.activeDevices}
          label={isUserSystemAdmin ? "Active System Devices" : "Active Devices"}
          color="green"
        />
        <StatCard
          icon={<MdBusiness />}
          value={isUserSystemAdmin ? dashboardData.totalSystemBuildings || dashboardData.buildings : dashboardData.buildings}
          label={isUserSystemAdmin ? "System Buildings" : "My Buildings"}
          color="purple"
        />
        <StatCard
          icon={<MdLocationOn />}
          value={isUserSystemAdmin ? dashboardData.totalSystemLocations || dashboardData.locations : dashboardData.locations}
          label={isUserSystemAdmin ? "System Locations" : "My Locations"}
          color="red"
        />
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <DeviceOverviewPanel 
          devices={devices}
          locations={locations}
          userEmail={userEmail}
          userRole={userRole}
          isSystemAdmin={isUserSystemAdmin}
          onRefresh={handleRefresh}
          onDeviceUpdate={handleDeviceUpdate}
          refreshing={refreshing}
          canManage={canManage}
        />
        
        <EnergyPanel 
          deviceIds={accessibleDeviceIds}
          isSystemAdmin={isUserSystemAdmin}
          devicesCount={devices.length}
        />
      </div>
    </div>
  );
};

// Enhanced Stat Card Component
const StatCard = ({ icon, value, label, color }) => (
  <div className="stat-card">
    <div className={`stat-icon ${color}`}>
      {icon}
    </div>
    <div className="stat-content">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);

// Device Toggle Component
const DeviceToggle = ({ device, onDeviceUpdate, userEmail, locations, isSystemAdmin }) => {
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState(null);

  const handleToggle = async () => {
    if (isToggling) return;

    try {
      // SystemAdmin can control all devices
      let canControl = isSystemAdmin;
      
      if (!canControl) {
        canControl = await canControlDevice(device, userEmail, locations);
      }
      
      if (!canControl) {
        setError('Not authorized');
        setTimeout(() => setError(null), 3000);
        return;
      }

      setIsToggling(true);
      setError(null);

      const newStatus = await dataService.toggleDeviceStatus(device.id);

      if (onDeviceUpdate) {
        onDeviceUpdate(device.id, { status: newStatus });
      }

    } catch (error) {
      console.error('Error toggling device:', error);
      setError('Failed to toggle');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsToggling(false);
    }
  };

  const deviceStatus = device.status || 'OFF';
  
  return (
    <div className="device-toggle-container">
      <button
        className={`toggle-switch ${deviceStatus === 'ON' ? 'on' : 'off'} ${isToggling ? 'toggling' : ''}`}
        onClick={handleToggle}
        disabled={isToggling}
        title={`Turn ${deviceStatus === 'ON' ? 'OFF' : 'ON'}`}
      >
        <div className="toggle-knob"></div>
      </button>
      {error && <div className="toggle-error">{error}</div>}
    </div>
  );
};

// COMPLETELY FIXED: Device Overview Panel
const DeviceOverviewPanel = ({ 
  devices, 
  locations, 
  userEmail, 
  userRole,
  isSystemAdmin,
  onRefresh, 
  onDeviceUpdate, 
  refreshing,
  canManage 
}) => {
  const [filter, setFilter] = React.useState('all');
  const [locationFilter, setLocationFilter] = React.useState('all');

  // Reset location filter for SystemAdmin
  React.useEffect(() => {
    if (isSystemAdmin) {
      setLocationFilter('all');
    }
  }, [isSystemAdmin]);

  const getLocationName = (locationId) => {
    const location = locations.find(loc => loc.id === locationId);
    return location ? location.LocationName || locationId : locationId || 'No Location';
  };

  // FIXED: Proper filtering logic for SystemAdmin
  const filteredDevices = devices.filter(device => {
    // Status filter (applies to all users)
    if (filter !== 'all' && device.status !== filter.toUpperCase()) return false;
    
    // Location filter (only applies to non-SystemAdmin users)
    if (!isSystemAdmin && locationFilter !== 'all' && device.Location !== locationFilter) {
      return false;
    }
    
    return true;
  });

  console.log(`🔍 DASHBOARD DeviceOverviewPanel: Input devices: ${devices.length}, Filtered: ${filteredDevices.length} (filter: ${filter}, location: ${isSystemAdmin ? 'N/A (SystemAdmin)' : locationFilter}, isSystemAdmin: ${isSystemAdmin})`);

  return (
    <div className="panel device-overview-panel">
      <div className="panel-header">
        <h3>
          {isSystemAdmin ? 'System Devices Overview' : 'My Devices Overview'}
        </h3>
        <div className="panel-actions">
          <button 
            onClick={onRefresh} 
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            disabled={refreshing}
            title="Refresh devices"
          >
            <MdRefresh />
          </button>
          {canManage && (
            <Link to="/devices/add" className="add-btn">
              <MdAdd /> {isSystemAdmin ? 'Add/Claim Device' : 'Claim Device'}
            </Link>
          )}
        </div>
      </div>

      <div className="filter-row">
        <div className="status-filters">
          {['all', 'on', 'off'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`filter-btn ${filter === status ? 'active' : ''}`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Only show location filter for non-SystemAdmin users */}
        {!isSystemAdmin && (
          <select 
            value={locationFilter} 
            onChange={(e) => setLocationFilter(e.target.value)}
            className="location-select"
          >
            <option value="all">All Locations</option>
            {locations.map(location => (
              <option key={location.id} value={location.id}>
                {location.LocationName || location.id}
              </option>
            ))}
          </select>
        )}

        {/* SystemAdmin indicator */}
        {isSystemAdmin && (
          <div style={{
            padding: '8px 12px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            color: '#15803d',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            📊 Viewing All System Devices
          </div>
        )}
      </div>

      <div className="devices-list">
        {filteredDevices.length > 0 ? (
          filteredDevices.slice(0, 8).map(device => (
            <div key={device.id} className="device-item">
              <div className="device-info">
                <div className="device-name">{device.DeviceName || device.id}</div>
                <div className="device-location">{getLocationName(device.Location)}</div>
                <div className="device-type">{device.DeviceType || 'Unknown'}</div>
              </div>
              <DeviceToggle 
                device={device} 
                onDeviceUpdate={onDeviceUpdate}
                userEmail={userEmail}
                locations={locations}
                isSystemAdmin={isSystemAdmin}
              />
            </div>
          ))
        ) : (
          <div className="no-data">
            {userRole === 'none' && !isSystemAdmin ? (
              <div>
                <p><strong>No access to devices</strong></p>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                  You don't have access to any buildings or devices yet.
                </p>
              </div>
            ) : isSystemAdmin ? (
              <div>
                <p><strong>No devices in system</strong></p>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                  No devices have been registered in the system yet.
                </p>
              </div>
            ) : (
              <div>
                <p><strong>No devices found</strong></p>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                  {userRole === 'children' 
                    ? 'No devices have been assigned to you yet.'
                    : 'No devices found in your accessible locations.'
                  }
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <Link to="/devices" className="view-all-link">
          View All {isSystemAdmin ? 'System ' : ''}Devices ({devices.length})
        </Link>
      </div>
    </div>
  );
};

// Energy Panel Component
const EnergyPanel = ({ deviceIds, isSystemAdmin, devicesCount }) => (
  <div className="panel energy-panel">
    <div className="panel-header">
      <h3>
        <MdBolt style={{ color: '#22c55e', marginRight: '0.5rem' }} />
        Energy Overview
      </h3>
    </div>
    
    {devicesCount > 0 ? (
      <EnergyOverview 
        deviceIds={deviceIds}
        className="dashboard-energy-overview"
        height={250}
      />
    ) : (
      <div className="energy-placeholder">
        <p>📊 No accessible devices</p>
        <p>{isSystemAdmin ? 'No devices in system yet' : 'No devices assigned to you yet'}</p>
      </div>
    )}
  </div>
);

export default Dashboard;