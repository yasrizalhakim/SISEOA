// src/components/Layout/Sidebar.js
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MdDashboard, MdDevices, MdAutoAwesome, MdPeople, 
         MdInsertChart, MdNotifications, MdSettings, MdMenu, MdClose } from 'react-icons/md';
import './Sidebar.css';

const Sidebar = () => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const location = useLocation();
  
  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMobileMenu && e.target.closest('.sidebar') === null && 
          e.target.closest('.mobile-toggle') === null) {
        setShowMobileMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMobileMenu]);
  
  // Close sidebar when route changes on mobile
  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname]);
  
  const menuItems = [
    { path: '/dashboard', icon: <MdDashboard className="menu-icon" />, label: 'DASHBOARD' },
    { path: '/devices', icon: <MdDevices className="menu-icon" />, label: 'DEVICES' },
    { path: '/automation', icon: <MdAutoAwesome className="menu-icon" />, label: 'AUTOMATION' },
    { path: '/users', icon: <MdPeople className="menu-icon" />, label: 'USERS' },
    { path: '/reports', icon: <MdInsertChart className="menu-icon" />, label: 'REPORTS' },
    { path: '/notifications', icon: <MdNotifications className="menu-icon" />, label: 'NOTIFICATIONS' },
    { path: '/settings', icon: <MdSettings className="menu-icon" />, label: 'SETTINGS' }
  ];
  
  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };
  
  return (
    <>
      <div className="mobile-toggle" onClick={toggleMobileMenu}>
        <MdMenu className="menu-icon" />
      </div>
      
      <div className={`sidebar-overlay ${showMobileMenu ? 'show' : ''}`} onClick={toggleMobileMenu}></div>
      
      <div className={`sidebar ${showMobileMenu ? 'show-mobile' : ''}`}>
        <div className="logo">
          <h2>SISEOA</h2>
          <p>Smart IOT System for Energy Optimization & Automation</p>
        </div>
        
        <div className="menu-items">
          {menuItems.map(item => (
            <Link 
              key={item.path}
              to={item.path} 
              className={`menu-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        
        <div className="mobile-close" onClick={toggleMobileMenu}>
          <MdClose className="close-icon" />
        </div>
      </div>
      
      {/* Mobile bottom navigation */}
      <div className="mobile-bottom-nav">
        <Link to="/dashboard" className={`bottom-nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`}>
          <MdDashboard className="nav-icon" />
          <span>Home</span>
        </Link>
        <Link to="/devices" className={`bottom-nav-item ${location.pathname === '/devices' ? 'active' : ''}`}>
          <MdDevices className="nav-icon" />
          <span>Devices</span>
        </Link>
        <Link to="/automation" className={`bottom-nav-item ${location.pathname === '/automation' ? 'active' : ''}`}>
          <MdAutoAwesome className="nav-icon" />
          <span>Auto</span>
        </Link>
        <Link to="/settings" className={`bottom-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}>
          <MdSettings className="nav-icon" />
          <span>Setting</span>
        </Link>
      </div>
    </>
  );
};

export default Sidebar;