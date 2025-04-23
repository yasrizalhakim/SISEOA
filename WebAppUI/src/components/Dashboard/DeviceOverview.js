// src/components/Dashboard/DeviceOverview.js
import React from 'react';
import { MdEdit, MdToggleOn, MdToggleOff } from 'react-icons/md';
import './DeviceOverview.css';

const DeviceOverview = () => {
  // Sample device data
  const devices = [
    { id: 1, name: 'Living Room Light', type: 'Light', status: 'active', location: 'Living Room' },
    { id: 2, name: 'Kitchen Fan', type: 'Fan', status: 'inactive', location: 'Kitchen' },
    { id: 3, name: 'Bedroom AC', type: 'AC', status: 'active', location: 'Bedroom' },
    { id: 4, name: 'TV', type: 'Entertainment', status: 'inactive', location: 'Living Room' },
    { id: 5, name: 'Office Lamp', type: 'Light', status: 'active', location: 'Office' }
  ];

  return (
    <div className="device-overview-container">
      <div className="panel-header">
        <h3>Device Overview</h3>
        <button className="add-device-btn">+ Add Device</button>
      </div>
      
      <div className="device-list">
        <table>
          <thead>
            <tr>
              <th>Device Name</th>
              <th>Type</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(device => (
              <tr key={device.id}>
                <td>{device.name}</td>
                <td>{device.type}</td>
                <td>{device.location}</td>
                <td>
                  <span className={`status-badge ${device.status}`}>
                    {device.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="device-actions">
                    <button className="action-btn edit">
                      <MdEdit /> Edit
                    </button>
                    <button className="action-btn toggle">
                      {device.status === 'active' ? <MdToggleOff /> : <MdToggleOn />}
                      {device.status === 'active' ? 'Turn Off' : 'Turn On'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="panel-footer">
        <a href="/devices" className="view-all">View All Devices</a>
      </div>
    </div>
  );
};

export default DeviceOverview;