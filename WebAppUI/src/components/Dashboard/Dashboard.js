// src/components/Dashboard/Dashboard.js
import React, { useState, useCallback } from 'react';
import { MdDevices, MdBolt, MdTrendingDown, MdWarning, MdRefresh } from 'react-icons/md';
import DeviceOverview from './DeviceOverview';
import EnergyUsage from './EnergyUsage';
import './Dashboard.css';

const Dashboard = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  
  // Color classes for stat cards
  const iconClasses = {
    devices: "bg-blue-100 text-blue-600",
    energy: "bg-purple-100 text-purple-600",
    savings: "bg-green-100 text-green-600",
    alerts: "bg-red-100 text-red-600"
  };
  
  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    // Simulate data refresh (replace with actual API calls)
    setTimeout(() => {
      setIsRefreshing(false);
      setLastRefreshed(new Date());
    }, 1500);
  }, [isRefreshing]);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>System Overview</h2>
        
        <div className="dashboard-controls">
          <div className="refresh-control" onClick={handleRefresh}>
            <MdRefresh className={`refresh-icon ${isRefreshing ? 'spinning' : ''}`} />
          </div>
          <div className="date-picker">
            <select>
              <option>Last 24 hours</option>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Custom range</option>
            </select>
          </div>
        </div>
      </div>
      
      {isRefreshing && <div className="refresh-indicator">Refreshing data...</div>}
      
      <div className="stats-cards">
        <div className="stat-card">
          <div className={`stat-icon ${iconClasses.devices}`}>
            <MdDevices />
          </div>
          <div className="stat-info">
            <h3>15</h3>
            <p>Active Devices</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className={`stat-icon ${iconClasses.energy}`}>
            <MdBolt />
          </div>
          <div className="stat-info">
            <h3>287 kWh</h3>
            <p>Energy Used (Monthly)</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className={`stat-icon ${iconClasses.savings}`}>
            <MdTrendingDown />
          </div>
          <div className="stat-info">
            <h3>43 kWh</h3>
            <p>Energy Saved</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className={`stat-icon ${iconClasses.alerts}`}>
            <MdWarning />
          </div>
          <div className="stat-info">
            <h3>2</h3>
            <p>Active Alerts</p>
          </div>
        </div>
      </div>
      
      <div className="dashboard-grid">
        <DeviceOverview />
        <EnergyUsage />
      </div>
      
      <div className="last-updated">
        Last refreshed: {lastRefreshed.toLocaleTimeString()}
      </div>
    </div>
  );
};

export default Dashboard;