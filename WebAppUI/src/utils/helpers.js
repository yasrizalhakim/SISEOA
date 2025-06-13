// src/utils/helpers.js - Refactored with duplicate removal and cleanup

import { firestore } from '../services/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

// ==============================================================================
// ROLE CHECKING UTILITIES
// ==============================================================================

/**
 * Check if user is SystemAdmin
 * @param {string} userEmail - User's email
 * @returns {Promise<boolean>} True if user is SystemAdmin
 */
export const isSystemAdmin = async (userEmail) => {
  if (!userEmail) {
    console.log('❌ No email provided for SystemAdmin check');
    return false;
  }
  
  try {
    console.log(`🔍 Checking SystemAdmin status for: ${userEmail}`);
    
    const systemAdminQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', 'SystemAdmin'),
      where('Role', '==', 'admin')
    );
    
    const systemAdminSnapshot = await getDocs(systemAdminQuery);
    const isAdmin = !systemAdminSnapshot.empty;
    
    console.log(`🔧 SystemAdmin check result for ${userEmail}:`, isAdmin);
    
    if (isAdmin) {
      console.log('✅ User is SystemAdmin - has full system access');
    }
    
    return isAdmin;
  } catch (error) {
    console.error('❌ Error checking SystemAdmin status:', error);
    return false;
  }
};

/**
 * Get user's building roles
 * @param {string} userEmail - User's email
 * @returns {Promise<Map>} Map of building ID to role
 */
export const getUserBuildingRoles = async (userEmail) => {
  if (!userEmail) return new Map();

  try {
    const buildingRoles = new Map();
    
    // First check if user is SystemAdmin
    const isAdmin = await isSystemAdmin(userEmail);
    if (isAdmin) {
      console.log('🔧 SystemAdmin detected - adding SystemAdmin role to map');
      buildingRoles.set('SystemAdmin', 'admin');
    }
    
    const userBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail)
    );
    
    const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
    
    userBuildingsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      buildingRoles.set(data.Building, data.Role);
    });
    
    console.log(`👤 Building roles for ${userEmail}:`, Object.fromEntries(buildingRoles));
    return buildingRoles;
  } catch (error) {
    console.error('Error fetching user building roles:', error);
    return new Map();
  }
};

/**
 * Get user's effective role (highest permission)
 * @param {string} userEmail - User's email
 * @returns {Promise<string>} 'admin', 'parent', 'children', or 'none'
 */
export const getUserRole = async (userEmail) => {
  if (!userEmail) return 'none';
  
  try {
    // Check if SystemAdmin first - this takes precedence
    if (await isSystemAdmin(userEmail)) {
      console.log('🔧 User is SystemAdmin - returning admin role');
      return 'admin';
    }
    
    const buildingRoles = await getUserBuildingRoles(userEmail);
    const roles = Array.from(buildingRoles.values());
    
    // Remove SystemAdmin from roles list for this check since we already handled it
    const nonSystemRoles = roles.filter(role => role !== 'admin' || !buildingRoles.has('SystemAdmin'));
    
    if (nonSystemRoles.includes('parent')) return 'parent';
    if (nonSystemRoles.includes('children')) return 'children';
    
    return 'none';
  } catch (error) {
    console.error('Error getting user role:', error);
    return 'none';
  }
};

/**
 * Get user's role in a specific building
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @returns {Promise<string>} Role in the specific building
 */
export const getUserRoleInBuilding = async (userEmail, buildingId) => {
  if (!userEmail || !buildingId) return 'none';
  
  try {
    // SystemAdmin has admin access to all buildings
    if (await isSystemAdmin(userEmail)) {
      console.log(`🔧 SystemAdmin has admin access to building ${buildingId}`);
      return 'admin';
    }
    
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (!userBuildingSnapshot.empty) {
      const userBuildingData = userBuildingSnapshot.docs[0].data();
      console.log(`👤 User role in building ${buildingId}:`, userBuildingData.Role);
      return userBuildingData.Role;
    }
    
    console.log(`❌ User has no access to building ${buildingId}`);
    return 'none';
  } catch (error) {
    console.error(`Error getting user role in building ${buildingId}:`, error);
    return 'none';
  }
};

/**
 * Get user's assigned locations in a specific building
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of location IDs user has access to
 */
export const getUserAssignedLocations = async (userEmail, buildingId) => {
  if (!userEmail || !buildingId) return [];
  
  try {
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (!userBuildingSnapshot.empty) {
      const userBuildingData = userBuildingSnapshot.docs[0].data();
      return userBuildingData.AssignedLocations || [];
    }
    
    return [];
  } catch (error) {
    console.error(`Error getting user assigned locations in building ${buildingId}:`, error);
    return [];
  }
};

// ==============================================================================
// PERMISSION CHECKING UTILITIES
// ==============================================================================

/**
 * Check if user can manage devices
 * @param {string} userEmail - User's email
 * @returns {Promise<boolean>} True if user can manage devices
 */
export const canManageDevices = async (userEmail) => {
  try {
    // SystemAdmin can manage all devices
    if (await isSystemAdmin(userEmail)) {
      console.log('🔧 SystemAdmin can manage devices');
      return true;
    }
    
    // Check if user has any parent/admin role in any building
    const buildingRoles = await getUserBuildingRoles(userEmail);
    let hasManagementRole = false;
    
    for (const [buildingId, role] of buildingRoles) {
      if (buildingId === 'SystemAdmin') continue;
      if (role === 'parent' || role === 'admin') {
        hasManagementRole = true;
        break;
      }
    }
    
    // ALL users can claim devices (children can become parents by claiming)
    const canManage = true; // Allow all users to attempt device claiming
    console.log(`👤 Can manage devices (hasManagementRole: ${hasManagementRole}):`, canManage);
    return canManage;
  } catch (error) {
    console.error('Error checking device management permission:', error);
    return false;
  }
};

/**
 * Check if user can manage buildings
 * @param {string} userEmail - User's email
 * @returns {Promise<boolean>} True if user can manage buildings
 */
export const canManageBuildings = async (userEmail) => {
  try {
    // SystemAdmin can manage all buildings
    if (await isSystemAdmin(userEmail)) {
      console.log('🔧 SystemAdmin can manage buildings');
      return true;
    }
    
    // Check if user has any parent role in any building (can add more buildings)
    const buildingRoles = await getUserBuildingRoles(userEmail);
    let hasParentRole = false;
    
    for (const [buildingId, role] of buildingRoles) {
      if (buildingId === 'SystemAdmin') continue;
      if (role === 'parent' || role === 'admin') {
        hasParentRole = true;
        break;
      }
    }
    
    // ALL users (including children) can create buildings if they have a device ID
    // Children can become parents of new buildings
    const canManage = true; // Allow all users to attempt building creation
    console.log(`👤 Can manage buildings (hasParentRole: ${hasParentRole}):`, canManage);
    return canManage;
  } catch (error) {
    console.error('Error checking building management permission:', error);
    return false;
  }
};

/**
 * Check if user can manage other users
 * @param {string} userEmail - User's email
 * @returns {Promise<boolean>} True if user can manage users
 */
export const canManageUsers = async (userEmail) => {
  try {
    // SystemAdmin can manage all users
    if (await isSystemAdmin(userEmail)) {
      console.log('🔧 SystemAdmin can manage users');
      return true;
    }
    
    // Check if user has any parent/admin role in any building
    const buildingRoles = await getUserBuildingRoles(userEmail);
    let hasManagementRole = false;
    
    for (const [buildingId, role] of buildingRoles) {
      if (buildingId === 'SystemAdmin') continue;
      if (role === 'parent' || role === 'admin') {
        hasManagementRole = true;
        break;
      }
    }
    
    console.log(`👤 Can manage users (hasManagementRole: ${hasManagementRole}):`, hasManagementRole);
    return hasManagementRole;
  } catch (error) {
    console.error('Error checking user management permission:', error);
    return false;
  }
};

/**
 * Check if user can control a specific device
 * @param {Object} device - Device object
 * @param {string} userEmail - User's email
 * @param {Array} locations - Array of location objects
 * @returns {Promise<boolean>} True if user can control the device
 */
export const canControlDevice = async (device, userEmail, locations) => {
  if (!device || !userEmail) return false;
  
  try {
    // SystemAdmin can control all devices
    if (await isSystemAdmin(userEmail)) {
      console.log('🔧 SystemAdmin can control all devices');
      return true;
    }
    
    // Device must have a location
    if (!device.Location) {
      console.log('❌ Device has no location assigned');
      return false;
    }
    
    // Find location and building
    const location = locations.find(loc => loc.id === device.Location);
    if (!location) {
      console.log('❌ Device location not found');
      return false;
    }
    
    const userRoleInBuilding = await getUserRoleInBuilding(userEmail, location.Building);
    
    if (userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent') {
      console.log(`✅ User can control device (role: ${userRoleInBuilding})`);
      return true;
    } else if (userRoleInBuilding === 'children') {
      // Children can control devices if they have access to the device's location
      const assignedLocations = await getUserAssignedLocations(userEmail, location.Building);
      const hasLocationAccess = assignedLocations.includes(device.Location);
      
      console.log(`👶 Child user location access check:`, {
        deviceLocation: device.Location,
        assignedLocations: assignedLocations,
        hasAccess: hasLocationAccess
      });
      
      // BACKWARD COMPATIBILITY: Also check legacy AssignedTo field
      const legacyAccess = device.AssignedTo && Array.isArray(device.AssignedTo) && device.AssignedTo.includes(userEmail);
      
      const canControl = hasLocationAccess || legacyAccess;
      console.log(`👶 Child user device access (location-based: ${hasLocationAccess}, legacy: ${legacyAccess}):`, canControl);
      return canControl;
    }
    
    console.log('❌ User cannot control device');
    return false;
  } catch (error) {
    console.error('Error checking device control permission:', error);
    return false;
  }
};

/**
 * Check if user has access to a device based on location assignments
 * @param {Object} device - Device object
 * @param {string} userEmail - User's email
 * @param {Array} locations - Array of location objects
 * @returns {Promise<boolean>} True if user has access to the device
 */
export const hasDeviceAccess = async (device, userEmail, locations) => {
  if (!device || !userEmail) return false;
  
  try {
    // SystemAdmin has access to all devices
    if (await isSystemAdmin(userEmail)) {
      return true;
    }
    
    // Device must have a location
    if (!device.Location) return false;
    
    // Find location and building
    const location = locations.find(loc => loc.id === device.Location);
    if (!location) return false;
    
    const userRoleInBuilding = await getUserRoleInBuilding(userEmail, location.Building);
    
    // Parents and admins have access to all devices in their buildings
    if (userRoleInBuilding === 'admin' || userRoleInBuilding === 'parent') {
      return true;
    }
    
    // Children have access based on location assignments
    if (userRoleInBuilding === 'children') {
      const assignedLocations = await getUserAssignedLocations(userEmail, location.Building);
      const hasLocationAccess = assignedLocations.includes(device.Location);
      
      // BACKWARD COMPATIBILITY: Also check legacy AssignedTo field
      const legacyAccess = device.AssignedTo && Array.isArray(device.AssignedTo) && device.AssignedTo.includes(userEmail);
      
      return hasLocationAccess || legacyAccess;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking device access:', error);
    return false;
  }
};

// ==============================================================================
// DATA FILTERING UTILITIES
// ==============================================================================

/**
 * Filter devices based on user permissions
 * @param {Array} devices - Array of device objects
 * @param {string} userEmail - User's email
 * @param {Array} locations - Array of location objects
 * @returns {Promise<Array>} Filtered devices array
 */
export const filterUserDevices = async (devices, userEmail, locations) => {
  if (!userEmail) return [];
  
  try {
    // SystemAdmin sees all devices
    if (await isSystemAdmin(userEmail)) {
      console.log('🔧 SystemAdmin - returning all devices');
      return devices;
    }
    
    const buildingRoles = await getUserBuildingRoles(userEmail);
    const accessibleDevices = [];
    
    // Process each device to check access
    for (const device of devices) {
      if (!device.Location) continue; // Skip unclaimed devices for regular users
      
      const location = locations.find(loc => loc.id === device.Location);
      if (!location) continue;
      
      const userRoleInBuilding = buildingRoles.get(location.Building);
      if (!userRoleInBuilding) continue;
      
      if (userRoleInBuilding === 'parent' || userRoleInBuilding === 'admin') {
        // Parents and admins see all devices in their buildings
        accessibleDevices.push(device);
      } else if (userRoleInBuilding === 'children') {
        // Children see devices based on location assignments
        const assignedLocations = await getUserAssignedLocations(userEmail, location.Building);
        const hasLocationAccess = assignedLocations.includes(device.Location);
        
        // BACKWARD COMPATIBILITY: Also check legacy AssignedTo field
        const legacyAccess = device.AssignedTo && Array.isArray(device.AssignedTo) && device.AssignedTo.includes(userEmail);
        
        if (hasLocationAccess || legacyAccess) {
          accessibleDevices.push(device);
        }
      }
    }
    
    console.log(`👤 User can access ${accessibleDevices.length} out of ${devices.length} devices`);
    return accessibleDevices;
  } catch (error) {
    console.error('Error filtering user devices:', error);
    return [];
  }
};

/**
 * Get buildings accessible to user
 * @param {string} userEmail - User's email
 * @returns {Promise<Array>} Array of building objects with user role
 */
export const getUserBuildings = async (userEmail) => {
  if (!userEmail) return [];
  
  try {
    // SystemAdmin sees all buildings
    if (await isSystemAdmin(userEmail)) {
      console.log('🔧 SystemAdmin - fetching all buildings');
      const buildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
      return buildingsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        userRole: 'admin'
      }));
    }
    
    // Regular users see only their buildings
    const buildingRoles = await getUserBuildingRoles(userEmail);
    const buildings = [];
    
    for (const [buildingId, role] of buildingRoles) {
      if (buildingId === 'SystemAdmin') continue;
      
      try {
        const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
        if (buildingDoc.exists()) {
          buildings.push({
            id: buildingId,
            ...buildingDoc.data(),
            userRole: role
          });
        }
      } catch (error) {
        console.error(`Error fetching building ${buildingId}:`, error);
      }
    }
    
    console.log(`👤 User has access to ${buildings.length} buildings`);
    return buildings;
  } catch (error) {
    console.error('Error getting user buildings:', error);
    return [];
  }
};

/**
 * Get user's accessible locations across all buildings
 * @param {string} userEmail - User's email
 * @returns {Promise<Array>} Array of location objects with access info
 */
export const getUserAccessibleLocations = async (userEmail) => {
  if (!userEmail) return [];
  
  try {
    // SystemAdmin has access to all locations
    if (await isSystemAdmin(userEmail)) {
      const locationsSnapshot = await getDocs(collection(firestore, 'LOCATION'));
      return locationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        accessType: 'admin',
        assigned: true
      }));
    }
    
    const buildingRoles = await getUserBuildingRoles(userEmail);
    const accessibleLocations = [];
    
    for (const [buildingId, role] of buildingRoles) {
      if (buildingId === 'SystemAdmin') continue;
      
      // Get all locations in this building
      const locationsQuery = query(
        collection(firestore, 'LOCATION'),
        where('Building', '==', buildingId)
      );
      const locationsSnapshot = await getDocs(locationsQuery);
      
      if (role === 'parent' || role === 'admin') {
        // Parents and admins have access to all locations in their buildings
        locationsSnapshot.docs.forEach(doc => {
          accessibleLocations.push({
            id: doc.id,
            ...doc.data(),
            accessType: role,
            assigned: true,
            buildingId: buildingId
          });
        });
      } else if (role === 'children') {
        // Children only have access to assigned locations
        const assignedLocationIds = await getUserAssignedLocations(userEmail, buildingId);
        
        locationsSnapshot.docs.forEach(doc => {
          const isAssigned = assignedLocationIds.includes(doc.id);
          accessibleLocations.push({
            id: doc.id,
            ...doc.data(),
            accessType: 'children',
            assigned: isAssigned,
            buildingId: buildingId
          });
        });
      }
    }
    
    return accessibleLocations;
  } catch (error) {
    console.error('Error getting user accessible locations:', error);
    return [];
  }
};

// ==============================================================================
// VALIDATION UTILITIES
// ==============================================================================

export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isRequired = (value) => {
  return value && value.toString().trim().length > 0;
};

export const isValidDeviceId = (deviceId) => {
  const deviceIdRegex = /^[a-zA-Z0-9_-]+$/;
  return deviceIdRegex.test(deviceId);
};

// ==============================================================================
// UI UTILITIES
// ==============================================================================

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const truncateText = (text, maxLength = 50) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const formatDate = (date) => {
  if (!date) return 'N/A';
  
  if (date.toDate && typeof date.toDate === 'function') {
    return date.toDate().toLocaleDateString();
  }
  
  if (typeof date === 'string') {
    return new Date(date).toLocaleDateString();
  }
  
  return date.toLocaleDateString();
};

export const getRoleBadgeClass = (role) => {
  switch (role?.toLowerCase()) {
    case 'admin': return 'admin-badge';
    case 'parent': return 'parent-badge';
    case 'children': return 'children-badge';
    default: return 'default-badge';
  }
};

// ==============================================================================
// DEVICE UTILITIES
// ==============================================================================

export const getDeviceDisplayName = (device) => {
  return device.DeviceName || device.name || device.id || 'Unknown Device';
};

export const getDeviceStatusClass = (status) => {
  switch (status?.toUpperCase()) {
    case 'ON':
    case 'ACTIVE':
      return 'status-active';
    case 'OFF':
    case 'INACTIVE':
      return 'status-inactive';
    default:
      return 'status-unknown';
  }
};

/**
 * Get devices accessible in a specific location
 * @param {string} locationId - Location ID
 * @param {Array} devices - Array of all devices
 * @returns {Array} Devices in the specified location
 */
export const getDevicesInLocation = (locationId, devices) => {
  return devices.filter(device => device.Location === locationId);
};

/**
 * Get user's device access summary
 * @param {string} userEmail - User's email
 * @param {Array} devices - Array of all devices
 * @param {Array} locations - Array of all locations
 * @returns {Promise<Object>} Device access summary
 */
export const getUserDeviceAccessSummary = async (userEmail, devices, locations) => {
  try {
    const accessibleDevices = await filterUserDevices(devices, userEmail, locations);
    const accessibleLocations = await getUserAccessibleLocations(userEmail);
    
    const summary = {
      totalDevices: devices.length,
      accessibleDevices: accessibleDevices.length,
      totalLocations: locations.length,
      accessibleLocations: accessibleLocations.filter(loc => loc.assigned).length,
      byBuilding: {}
    };
    
    // Group by building
    const buildingRoles = await getUserBuildingRoles(userEmail);
    for (const [buildingId, role] of buildingRoles) {
      if (buildingId === 'SystemAdmin') continue;
      
      const buildingDevices = accessibleDevices.filter(device => {
        const location = locations.find(loc => loc.id === device.Location);
        return location && location.Building === buildingId;
      });
      
      const buildingLocations = accessibleLocations.filter(loc => 
        loc.buildingId === buildingId && loc.assigned
      );
      
      summary.byBuilding[buildingId] = {
        role: role,
        devices: buildingDevices.length,
        locations: buildingLocations.length
      };
    }
    
    return summary;
  } catch (error) {
    console.error('Error getting user device access summary:', error);
    return {
      totalDevices: 0,
      accessibleDevices: 0,
      totalLocations: 0,
      accessibleLocations: 0,
      byBuilding: {}
    };
  }
};

// ==============================================================================
// ERROR HANDLING UTILITIES
// ==============================================================================

export const handleError = (error, defaultMessage = 'An error occurred') => {
  console.error('API Error:', error);
  return error.message || defaultMessage;
};

// ==============================================================================
// CURRENT USER UTILITIES
// ==============================================================================

export const getCurrentUser = () => ({
  email: localStorage.getItem('userEmail') || '',
  name: localStorage.getItem('userName') || '',
  role: localStorage.getItem('userRole') || 'user'
});

export const clearUserData = () => {
  const userKeys = ['userEmail', 'userName', 'userRole', 'deviceId', 'deviceName', 'deviceLocation'];
  userKeys.forEach(key => localStorage.removeItem(key));
};

/**
 * Get comprehensive user info including SystemAdmin status and location access
 * @param {string} userEmail - User's email
 * @returns {Promise<Object>} Complete user information
 */
export const getComprehensiveUserInfo = async (userEmail) => {
  if (!userEmail) return null;
  
  try {
    const isAdmin = await isSystemAdmin(userEmail);
    const effectiveRole = await getUserRole(userEmail);
    const buildingRoles = await getUserBuildingRoles(userEmail);
    const accessibleLocations = await getUserAccessibleLocations(userEmail);
    
    return {
      email: userEmail,
      isSystemAdmin: isAdmin,
      effectiveRole: effectiveRole,
      buildingRoles: Object.fromEntries(buildingRoles),
      accessibleLocations: accessibleLocations,
      canManageDevices: await canManageDevices(userEmail),
      canManageBuildings: await canManageBuildings(userEmail),
      canManageUsers: await canManageUsers(userEmail)
    };
  } catch (error) {
    console.error('Error getting comprehensive user info:', error);
    return null;
  }
};

// ==============================================================================
// EXPORTS (for backwards compatibility)
// ==============================================================================

// Main utilities object
export const utils = {
  // Role checking
  isSystemAdmin,
  getUserBuildingRoles,
  getUserRole,
  getUserRoleInBuilding,
  getUserAssignedLocations,
  
  // Permissions
  canManageDevices,
  canManageBuildings,
  canManageUsers,
  canControlDevice,
  hasDeviceAccess,
  
  // Data filtering
  filterUserDevices,
  getUserBuildings,
  getUserAccessibleLocations,
  
  // Validation
  isValidEmail,
  isRequired,
  isValidDeviceId,
  
  // UI
  debounce,
  truncateText,
  formatDate,
  getRoleBadgeClass,
  
  // Device
  getDeviceDisplayName,
  getDeviceStatusClass,
  getDevicesInLocation,
  getUserDeviceAccessSummary,
  
  // Error handling
  handleError,
  
  // Current user
  getCurrentUser,
  clearUserData,
  getComprehensiveUserInfo
};

export default utils;