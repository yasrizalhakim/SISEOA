// src/components/Dashboard/DeviceOverview.js
import React, { useState } from 'react';
import { MdEdit, MdToggleOn, MdToggleOff } from 'react-icons/md';
import { Link } from 'react-router-dom';
import './DeviceOverview.css';

const DeviceOverview = () => {
  // Sample device data
  const [devices, setDevices] = useState([
    { id: 1, name: 'Living Room Light', type: 'Light', status: 'active', location: 'Living Room' },
    { id: 2, name: 'Kitchen Fan', type: 'Fan', status: 'inactive', location: 'Kitchen' },
    { id: 3, name: 'Bedroom AC', type: 'AC', status: 'active', location: 'Bedroom' },
    { id: 4, name: 'TV', type: 'Entertainment', status: 'inactive', location: 'Living Room' },
    { id: 5, name: 'Office Lamp', type: 'Light', status: 'active', location: 'Office' }
  ]);

  const [activeFilter, setActiveFilter] = useState('all');

  // Filter devices based on selection
  const filteredDevices = activeFilter === 'all' 
    ? devices 
    : devices.filter(device => device.status === activeFilter);

  // Toggle device status
  const handleDeviceToggle = (deviceId) => {
    setDevices(devices.map(device => {
      if (device.id === deviceId) {
        return {
          ...device,
          status: device.status === 'active' ? 'inactive' : 'active'
        };
      }
      return device;
    }));
  };

  return (
    <div className="device-overview-container panel">
      <div className="panel-header">
        <h3>Device Overview</h3>
        <button className="add-device-btn">+ Add Device</button>
      </div>
      
      <div className="device-filters">
        <button 
          className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All
        </button>
        <button 
          className={`filter-btn ${activeFilter === 'active' ? 'active' : ''}`}
          onClick={() => setActiveFilter('active')}
        >
          Active
        </button>
        <button 
          className={`filter-btn ${activeFilter === 'inactive' ? 'active' : ''}`}
          onClick={() => setActiveFilter('inactive')}
        >
          Inactive
        </button>
      </div>
      
      <div className="device-list">
        {filteredDevices.map(device => (
          <div key={device.id} className="device-item">
            <div className="device-name">
              {device.name}
              <span className="device-location">{device.location}</span>
            </div>
            <div className="device-actions">
              <Link to="/devices" className="edit-button">
                <MdEdit /> Edit
              </Link>
              <button 
                className={`toggle-button ${device.status === 'active' ? 'active' : 'inactive'}`}
                onClick={() => handleDeviceToggle(device.id)}
              >
                {device.status === 'active' ? 
                  <>
                    <MdToggleOff /> On
                  </> : 
                  <>
                    <MdToggleOn /> Off
                  </>
                }
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="panel-footer">
        <Link to="/devices" className="view-all">View All Devices</Link>
      </div>
    </div>
  );
};

export default DeviceOverview;