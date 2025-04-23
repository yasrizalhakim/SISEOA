// src/components/Layout/Header.js
import React from 'react';
import { MdSearch, MdNotifications, MdPerson } from 'react-icons/md';
import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <div className="page-title">
        <h1>Dashboard</h1>
      </div>
      <div className="header-controls">
        <div className="search-box">
          <input type="text" placeholder="Search..." />
          <button className="search-button">
            <MdSearch className="icon" />
          </button>
        </div>
        <div className="user-profile">
          <div className="notifications">
            <MdNotifications className="icon" />
            <span className="notification-badge">3</span>
          </div>
          <div className="user-info">
            <div className="avatar">
              <MdPerson className="avatar-icon" />
            </div>
            <span className="username">Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;