// src/components/Dashboard/Dashboard.js
import React from 'react';
import { MdDevices, MdBolt, MdTrendingDown, MdWarning } from 'react-icons/md';
import DeviceOverview from './DeviceOverview';
import EnergyUsage from './EnergyUsage';
import './Dashboard.css';

const Dashboard = () => {
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>System Overview</h2>
        <div className="date-picker">
          <select>
            <option>Last 24 hours</option>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Custom range</option>
          </select>
        </div>
      </div>
      
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-icon devices">
            <MdDevices />
          </div>
          <div className="stat-info">
            <h3>15</h3>
            <p>Active Devices</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon energy">
            <MdBolt />
          </div>
          <div className="stat-info">
            <h3>287 kWh</h3>
            <p>Energy Used (Monthly)</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon savings">
            <MdTrendingDown />
          </div>
          <div className="stat-info">
            <h3>43 kWh</h3>
            <p>Energy Saved</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon alerts">
            <MdWarning />
          </div>
          <div className="stat-info">
            <h3>2</h3>
            <p>Active Alerts</p>
          </div>
        </div>
      </div>
      
      <div className="dashboard-grid">
        <div className="grid-item device-overview">
          <DeviceOverview />
        </div>
        <div className="grid-item energy-usage">
          <EnergyUsage />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;