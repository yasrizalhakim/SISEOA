// src/components/Layout/Sidebar.js
import React from 'react';
import { Link } from 'react-router-dom';
import { MdDashboard, MdDevices, MdAutoAwesome, MdPeople, 
         MdInsertChart, MdNotifications, MdSettings } from 'react-icons/md';
import './Sidebar.css';

const Sidebar = () => {
  return (
    <div className="sidebar">
      <div className="logo">
        <h2>SISEOA</h2>
        <p>Smart IOT System for Eenrgy Optimization & Automation</p>
      </div>
      
      <div className="menu-items">
        <Link to="/dashboard" className="menu-item">
          <MdDashboard className="menu-icon" />
          <span>DASHBOARD</span>
        </Link>
        
        <Link to="/devices" className="menu-item">
          <MdDevices className="menu-icon" />
          <span>DEVICES</span>
        </Link>
        
        <Link to="/automation" className="menu-item">
          <MdAutoAwesome className="menu-icon" />
          <span>AUTOMATION</span>
        </Link>
        
        <Link to="/users" className="menu-item">
          <MdPeople className="menu-icon" />
          <span>USERS</span>
        </Link>
        
        <Link to="/reports" className="menu-item">
          <MdInsertChart className="menu-icon" />
          <span>REPORTS</span>
        </Link>
        
        <Link to="/notifications" className="menu-item">
          <MdNotifications className="menu-icon" />
          <span>NOTIFICATIONS</span>
        </Link>
        
        <Link to="/settings" className="menu-item">
          <MdSettings className="menu-icon" />
          <span>SETTINGS</span>
        </Link>
      </div>
    </div>
  );
};

export default Sidebar;