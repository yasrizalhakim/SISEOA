// src/components/Layout/MainLayout.js - Updated Navigation with Universal Users Access
import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  MdDashboard, 
  MdDevices, 
  MdSchedule, 
  MdPeople, 
  MdAssessment, 
  MdNotifications, 
  MdExitToApp, 
  MdMenu, 
  MdClose,
  MdRefresh,
  MdHomeWork,
  MdAccountCircle,
  MdLightMode,
  MdDarkMode,
  MdAdminPanelSettings
} from 'react-icons/md';
import { isSystemAdmin, getUserBuildingRoles } from '../../utils/helpers';
import './MainLayout.css';

const MainLayout = ({ handleLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('user');
  const [darkMode, setDarkMode] = useState(false);
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [hasUsersAccess, setHasUsersAccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Get current page title based on path
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/dashboard')) return 'System Overview';
    if (path.includes('/buildings')) return 'Building Management';
    if (path.includes('/devices')) return 'Device Management';
    if (path.includes('/users')) return 'User Management';
    // if (path.includes('/automation')) return 'Automation';
    if (path.includes('/reports')) return 'Reports';
    if (path.includes('/notifications')) return 'Notifications';
    if (path.includes('/profile')) return 'User Profile';
    return 'SISEAO - Energy Management';
  };

  // Check user's access to users page based on building roles
  const checkUsersAccess = async (userEmail) => {
    try {
      // SystemAdmin always has access
      const isAdmin = await isSystemAdmin(userEmail);
      if (isAdmin) {
        return true;
      }

      // Check if user has parent or admin role in any building
      const buildingRoles = await getUserBuildingRoles(userEmail);
      
      for (const [buildingId, role] of buildingRoles) {
        if (buildingId === 'SystemAdmin') continue;
        
        // Users with parent or admin role in any building can access users page
        if (role === 'parent' || role === 'admin' || role== 'children') {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking users access:', error);
      return false;
    }
  };

  // Initialize user data and dark mode preference
  useEffect(() => {
    const storedUserName = localStorage.getItem('userName');
    const storedUserRole = localStorage.getItem('userRole');
    const deviceName = localStorage.getItem('deviceName');
    const storedDarkMode = localStorage.getItem('darkMode');
    const userEmail = localStorage.getItem('userEmail');
    
    if (storedUserName) {
      setUserName(storedUserName);
    } else if (deviceName) {
      setUserName(`Device: ${deviceName}`);
    }
    
    if (storedUserRole) {
      setUserRole(storedUserRole);
    }

    // Set dark mode from localStorage or default to false
    if (storedDarkMode !== null) {
      setDarkMode(storedDarkMode === 'true');
    }

    // Check user permissions
    if (userEmail) {
      checkSystemAdminStatus(userEmail);
      checkUserAccess(userEmail);
    }
  }, []);

  // Check if user is SystemAdmin
  const checkSystemAdminStatus = async (userEmail) => {
    try {
      const isAdmin = await isSystemAdmin(userEmail);
      setIsUserSystemAdmin(isAdmin);
      console.log('🔧 SystemAdmin status:', isAdmin);
    } catch (error) {
      console.error('Error checking SystemAdmin status:', error);
      setIsUserSystemAdmin(false);
    }
  };

  // Check if user has access to users page
  const checkUserAccess = async (userEmail) => {
    try {
      const hasAccess = await checkUsersAccess(userEmail);
      setHasUsersAccess(hasAccess);
      console.log('👥 Users page access:', hasAccess);
    } catch (error) {
      console.error('Error checking user access:', error);
      setHasUsersAccess(false);
    }
  };

  // Apply dark mode class to body when darkMode changes
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    // Save preference to localStorage
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Handle logout
  const onLogout = () => {
    handleLogout();
    navigate('/login');
  };

  // Toggle mobile menu
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // Close menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Navigation items based on user role and permissions
  const getNavigationItems = () => {
    const baseItems = [
      { path: '/dashboard', icon: MdDashboard, label: 'Dashboard' },
      { path: '/buildings', icon: MdHomeWork, label: 'Buildings' },
      { 
        path: '/devices', 
        icon: MdDevices, 
        label: isUserSystemAdmin ? 'Device Management' : 'Devices'
      },
    ];

    // Add Users page for users with appropriate access
    if (hasUsersAccess) {
      baseItems.push({ 
        path: '/users', 
        icon: MdPeople, 
        label: isUserSystemAdmin ? 'System Users' : 'Users'
      });
    }

    baseItems.push(
      // { path: '/automation', icon: MdSchedule, label: 'Automation' },
      { path: '/reports', icon: MdAssessment, label: 'Reports' },
      { path: '/notifications', icon: MdNotifications, label: 'Notifications' },
      { path: '/profile', icon: MdAccountCircle, label: 'Profile' }
    );

    return baseItems;
  };

  const navigationItems = getNavigationItems();

  return (
    <div className={`layout-container ${darkMode ? 'dark-mode' : ''}`}>
      {/* Mobile menu toggle button */}
      <button className="menu-toggle" onClick={toggleMenu} aria-label="Toggle menu">
        <MdMenu />
      </button>
      
      {/* App header */}
      <header className="app-header">
        <h1>SMART IOT SYSTEM FOR ENERGY OPTIMIZATION AND AUTOMATION</h1>
        
        {/* Header controls */}
        <div className="header-controls">
          {/* Dark mode toggle */}
          <button 
            className="dark-mode-toggle" 
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <MdLightMode /> : <MdDarkMode />}
          </button>
        </div>
      </header>
      
      {/* Sidebar overlay for mobile */}
      {menuOpen && <div className="sidebar-overlay" onClick={toggleMenu} />}
      
      {/* Sidebar navigation */}
      <nav className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>SISEAO</h2>
          <button className="close-menu" onClick={toggleMenu} aria-label="Close menu">
            <MdClose />
          </button>
        </div>
        
        <div className="user-info">
          <div className="user-avatar">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="user-details">
            <div className="user-name">{userName}</div>
          </div>
        </div>
        
        <div className="sidebar-nav">
          {navigationItems.map((item) => (
            <NavLink 
              key={item.path}
              to={item.path} 
              className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
            >
              <item.icon className="nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
        
        <div className="sidebar-footer">
          <button className="logout-button" onClick={onLogout}>
            <MdExitToApp className="nav-icon" />
            <span>Logout</span>
          </button>
        </div>
      </nav>
      
      {/* Main content area */}
      <main className="main-content">
        <div className="page-header">
          <h2>{getPageTitle()}</h2>
          <div className="header-controls">
            {location.pathname.includes('/dashboard') && (
              <div className="refresh-control">
                <button className="refresh-button" aria-label="Refresh">
                  <MdRefresh />
                </button>
                <select className="time-range-select" aria-label="Time range">
                  <option>Last 24 hours</option>
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>Custom range</option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="content-area">
          <Outlet />
        </div>
      </main>
      
      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav">
        {navigationItems.slice(0, 4).map((item) => (
          <NavLink 
            key={item.path}
            to={item.path}
            className={({isActive}) => isActive ? 'bottom-nav-item active' : 'bottom-nav-item'}
          >
            <item.icon className="nav-icon" />
            <span>{item.label === 'Buildings' ? 'Buildings' : item.label === 'Dashboard' ? 'Home' : item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default MainLayout;