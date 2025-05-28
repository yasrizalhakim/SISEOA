// src/components/Dashboard/Dashboard.js - Enhanced and Consolidated

import React, { useState, useEffect } from 'react';
import { MdDevices, MdBolt, MdLocationOn, MdWarning, MdAdd, MdRefresh, MdAdminPanelSettings } from 'react-icons/md';
import { Link } from 'react-router-dom';
import { database } from '../../services/firebase';
import { ref, get, update } from 'firebase/database';
import dataService from '../../services/dataService';
import { 
  getUserRole, 
  filterUserDevices, 
  canControlDevice, 
  canManageDevices,
  isSystemAdmin 
} from '../../utils/helpers';
import './Dashboard.css';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    totalDevices: 0,
    activeDevices: 0,
    locations: 0,
    alerts: 0
  });
  const [devices, setDevices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState('none');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  
  // Get current user
  const userEmail = localStorage.getItem('userEmail') || '';

  // Main data fetcher
  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      setError(null);

      console.log('🚀 Fetching dashboard data for user:', userEmail);

      // Check if user is SystemAdmin first
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);

      // Get user role
      const role = await getUserRole(userEmail);
      setUserRole(role);

      // Check if user can manage devices
      const canManageDevs = await canManageDevices(userEmail);
      setCanManage(canManageDevs);

      console.log('👤 User info:', { 
        isSystemAdmin: isAdmin, 
        role: role, 
        canManageDevices: canManageDevs 
      });

      // Get all devices and locations
      const { devices: allDevices, locations: allLocations } = await dataService.getUserDevicesAndLocations(userEmail);
      setLocations(allLocations);

      // Filter devices based on user permissions
      const accessibleDevices = await filterUserDevices(allDevices, userEmail, allLocations);
      setDevices(accessibleDevices);

      // Calculate stats
      const totalDevices = accessibleDevices.length;
      const activeDevices = accessibleDevices.filter(device => device.status === 'ON').length;
      const uniqueLocations = new Set(accessibleDevices.map(device => device.Location).filter(Boolean)).size;

      // For SystemAdmin, show system-wide stats
      let systemStats = {};
      if (isAdmin) {
        console.log('🔧 Calculating system-wide stats for SystemAdmin');
        systemStats = {
          totalSystemDevices: allDevices.length,
          totalSystemLocations: allLocations.length,
          activeSystemDevices: allDevices.filter(device => device.status === 'ON').length
        };
      }

      setDashboardData({
        totalDevices,
        activeDevices,
        locations: uniqueLocations,
        alerts: 0, // Could be calculated based on device issues, etc.
        ...systemStats
      });

      console.log('📊 Dashboard stats:', { 
        totalDevices, 
        activeDevices, 
        uniqueLocations,
        ...(isAdmin && { systemStats })
      });

    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
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
    fetchDashboardData();
  };

  // Device update handler
  const handleDeviceUpdate = (deviceId, updatedDevice) => {
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

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

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
      
      {/* System Admin Banner */}
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
              System Total: {dashboardData.totalSystemDevices} devices, {dashboardData.totalSystemLocations} locations
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
          subtitle={isUserSystemAdmin && dashboardData.totalDevices !== dashboardData.totalSystemDevices ? 
            `${dashboardData.totalDevices} accessible to you` : null}
        />
        <StatCard
          icon={<MdBolt />}
          value={isUserSystemAdmin ? dashboardData.activeSystemDevices || dashboardData.activeDevices : dashboardData.activeDevices}
          label={isUserSystemAdmin ? "Active System Devices" : "Active Devices"}
          color="green"
          subtitle={isUserSystemAdmin && dashboardData.activeDevices !== dashboardData.activeSystemDevices ? 
            `${dashboardData.activeDevices} accessible to you` : null}
        />
        <StatCard
          icon={<MdLocationOn />}
          value={isUserSystemAdmin ? dashboardData.totalSystemLocations || dashboardData.locations : dashboardData.locations}
          label={isUserSystemAdmin ? "System Locations" : "My Locations"}
          color="purple"
        />
        <StatCard
          icon={<MdWarning />}
          value={dashboardData.alerts}
          label="Alerts"
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
        
        <EnergyPanel />
      </div>
    </div>
  );
};

// Enhanced Stat Card Component
const StatCard = ({ icon, value, label, color, subtitle }) => (
  <div className="stat-card">
    <div className={`stat-icon ${color}`}>
      {icon}
    </div>
    <div className="stat-content">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {subtitle && (
        <div style={{ 
          fontSize: '11px', 
          color: '#94a3b8', 
          marginTop: '2px',
          lineHeight: '1.2'
        }}>
          {subtitle}
        </div>
      )}
    </div>
  </div>
);

// Updated Device Toggle Component - Simple Toggle Switch
const DeviceToggle = ({ device, onDeviceUpdate, userEmail, locations, isSystemAdmin }) => {
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState(null);

  const handleToggle = async () => {
    if (isToggling) return;

    try {
      // SystemAdmin can control all devices, otherwise check permissions
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

// Enhanced Device Overview Panel Component
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
  const [filter, setFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');

  const getLocationName = (locationId) => {
    const location = locations.find(loc => loc.id === locationId);
    return location ? location.LocationName || locationId : locationId || 'No Location';
  };

  const filteredDevices = devices.filter(device => {
    if (filter !== 'all' && device.status !== filter.toUpperCase()) return false;
    if (locationFilter !== 'all' && device.Location !== locationFilter) return false;
    return true;
  });

  return (
    <div className="panel device-overview-panel">
      <div className="panel-header">
        <h3>
          {isSystemAdmin ? 'System Devices Overview' : 'My Devices Overview'}
          {isSystemAdmin && (
            <span style={{ 
              marginLeft: '8px', 
              fontSize: '12px', 
              backgroundColor: '#10b981', 
              color: 'white', 
              padding: '2px 6px', 
              borderRadius: '12px' 
            }}>
              Admin
            </span>
          )}
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
      </div>

      <div className="devices-list">
        {filteredDevices.length > 0 ? (
          filteredDevices.slice(0, 8).map(device => (
            <div key={device.id} className="device-item">
              <div className="device-info">
                <div className="device-name">{device.DeviceName || device.id}</div>
                <div className="device-location">{getLocationName(device.Location)}</div>
                <div className="device-type">{device.DeviceType || 'Unknown'}</div>
                {isSystemAdmin && device.AssignedTo && device.AssignedTo.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    Assigned to: {device.AssignedTo.length} user(s)
                  </div>
                )}
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
            {userRole === 'none' ? (
              <div>
                <p><strong>No access to devices</strong></p>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                  You don't have access to any buildings or devices yet. 
                  <br />
                  Contact an administrator or create a building to get started.
                </p>
              </div>
            ) : isSystemAdmin ? (
              <div>
                <p><strong>No available device!</strong></p>
                {/* <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                  No available device.
                </p> */}
              </div>
            ) : (
              <div>
                <p><strong>No devices found!</strong></p>
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

// Energy Panel Component (Placeholder for now)
const EnergyPanel = () => (
  <div className="panel energy-panel">
    <div className="panel-header">
      <h3>Energy Overview</h3>
    </div>
    <div className="energy-placeholder">
      <p>📊 Energy consumption data</p>
      <p>Coming soon...</p>
      {/* <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f0f9ff', 
        borderRadius: '6px',
        fontSize: '14px',
        color: '#0369a1'
      }}>
        <p style={{ margin: 0 }}>
          Future features:
        </p>
        <ul style={{ margin: '8px 0 0 20px', fontSize: '13px' }}>
          <li>Real-time energy consumption</li>
          <li>Usage trends and analytics</li>
          <li>Energy efficiency recommendations</li>
          <li>Cost calculations</li>
        </ul>
      </div> */}
    </div>
  </div>
);

export default Dashboard;