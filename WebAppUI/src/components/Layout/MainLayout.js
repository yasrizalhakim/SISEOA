// MainLayout.js
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import './MainLayout.css';

const MainLayout = () => {
  const location = useLocation();
  
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Header />
        <div className="content-area">
          <Outlet />
        </div>
      </div>
      <MobileBottomNav currentPath={location.pathname} />
    </div>
  );
};

export default MainLayout;