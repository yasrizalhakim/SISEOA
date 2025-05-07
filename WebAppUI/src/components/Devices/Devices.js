// src/components/Devices/Devices.js
import React, { useState } from 'react';
import { MdEdit, MdToggleOn, MdToggleOff, MdAdd, MdClose } from 'react-icons/md';
import './Devices.css';

const Devices = () => {
  // Sample device data
  const [devices, setDevices] = useState([
    { id: 1, name: 'Living Room Light', type: 'Light', status: 'active', location: 'Living Room', energy: '12 kWh/month' },
    { id: 2, name: 'Kitchen Fan', type: 'Fan', status: 'inactive', location: 'Kitchen', energy: '20 kWh/month' },
    { id: 3, name: 'Bedroom AC', type: 'AC', status: 'active', location: 'Bedroom', energy: '45 kWh/month' },
    { id: 4, name: 'TV', type: 'Entertainment', status: 'inactive', location: 'Living Room', energy: '30 kWh/month' },
    { id: 5, name: 'Office Lamp', type: 'Light', status: 'active', location: 'Office', energy: '8 kWh/month' },
    { id: 6, name: 'Bathroom Heater', type: 'Heater', status: 'inactive', location: 'Bathroom', energy: '25 kWh/month' },
    { id: 7, name: 'Dining Room Light', type: 'Light', status: 'active', location: 'Dining Room', energy: '10 kWh/month' },
    { id: 8, name: 'Porch Light', type: 'Light', status: 'inactive', location: 'Porch', energy: '5 kWh/month' }
  ]);

  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingDevice, setEditingDevice] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    type: '',
    location: '',
    energy: ''
  });

  // Filter devices based on selection and search
  const filteredDevices = devices
    .filter(device => activeFilter === 'all' || device.status === activeFilter)
    .filter(device => 
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.location.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

  // Start editing a device
  const handleEditClick = (device) => {
    setEditingDevice(device.id);
    setEditForm({
      name: device.name,
      type: device.type,
      location: device.location,
      energy: device.energy
    });
  };

  // Handle input changes in form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm({
      ...editForm,
      [name]: value
    });
  };

  // Save edited device
  const handleSaveEdit = () => {
    setDevices(devices.map(device => {
      if (device.id === editingDevice) {
        return {
          ...device,
          name: editForm.name,
          type: editForm.type,
          location: editForm.location,
          energy: editForm.energy
        };
      }
      return device;
    }));
    setEditingDevice(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingDevice(null);
  };

  return (
    <div className="devices">
      <div className="devices-header">
        <h2>Device Management</h2>
        <button className="add-device-btn">
          <MdAdd /> Add New Device
        </button>
      </div>

      <div className="controls-row">
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Search devices..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
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
      </div>

      <div className="devices-grid">
        {filteredDevices.length > 0 ? (
          filteredDevices.map(device => (
            <div key={device.id} className="device-card">
              {editingDevice === device.id ? (
                <div className="device-edit-form">
                  <div className="form-group">
                    <label>Name:</label>
                    <input 
                      type="text" 
                      name="name" 
                      value={editForm.name} 
                      onChange={handleInputChange} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Type:</label>
                    <input 
                      type="text" 
                      name="type" 
                      value={editForm.type} 
                      onChange={handleInputChange} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Location:</label>
                    <input 
                      type="text" 
                      name="location" 
                      value={editForm.location} 
                      onChange={handleInputChange} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Energy Use:</label>
                    <input 
                      type="text" 
                      name="energy" 
                      value={editForm.energy} 
                      onChange={handleInputChange} 
                    />
                  </div>
                  <div className="edit-buttons">
                    <button onClick={handleSaveEdit} className="save-btn">Save</button>
                    <button onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="device-status-indicator" data-status={device.status}></div>
                  <div className="device-info">
                    <h3>{device.name}</h3>
                    <div className="device-details">
                      <span className="device-type">{device.type}</span>
                      <span className="device-location">{device.location}</span>
                      <span className="device-energy">{device.energy}</span>
                    </div>
                  </div>
                  <div className="device-actions">
                    <button 
                      className="edit-button"
                      onClick={() => handleEditClick(device)}
                    >
                      <MdEdit /> Edit
                    </button>
                    <button 
                      className={`toggle-button ${device.status === 'active' ? 'active' : 'inactive'}`}
                      onClick={() => handleDeviceToggle(device.id)}
                    >
                      {device.status === 'active' ? 
                        <>
                          <MdToggleOn /> On
                        </> : 
                        <>
                          <MdToggleOff /> Off
                        </>
                      }
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        ) : (
          <div className="no-devices">No devices found matching your criteria</div>
        )}
      </div>
    </div>
  );
};

export default Devices;