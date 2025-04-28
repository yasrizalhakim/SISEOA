// MobileBottomNav.js
import React from 'react';
import { Link } from 'react-router-dom';
import { MdDashboard, MdDevices, MdAutoAwesome, MdSettings } from 'react-icons/md';

const MobileBottomNav = ({ currentPath }) => {
  const navItems = [
    { path: '/dashboard', icon: <MdDashboard className="nav-icon" />, label: 'Home' },
    { path: '/devices', icon: <MdDevices className="nav-icon" />, label: 'Devices' },
    { path: '/automation', icon: <MdAutoAwesome className="nav-icon" />, label: 'Auto' },
    { path: '/settings', icon: <MdSettings className="nav-icon" />, label: 'Setting' }
  ];
  
  return (
    <div className="mobile-bottom-nav">
      {navItems.map(item => (
        <Link
          key={item.path}
          to={item.path}
          className={`bottom-nav-item ${currentPath === item.path ? 'active' : ''}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </div>
  );
};

export default MobileBottomNav;