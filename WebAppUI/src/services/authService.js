// src/services/authService.js - Simplified Authentication

import { firestore } from './firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { getUserRole } from '../utils/helpers';

// ==============================================================================
// AUTHENTICATION FUNCTIONS
// ==============================================================================

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User data and authentication result
 */
export const loginUser = async (email, password) => {
  try {
    // Get user document from Firestore
    const userDoc = await getDoc(doc(firestore, 'USER', email));
    
    if (!userDoc.exists()) {
      throw new Error('Invalid email or password');
    }
    
    const userData = userDoc.data();
    
    // Simple password check (in production, use proper authentication)
    if (userData.Password !== password) {
      throw new Error('Invalid email or password');
    }
    
    // Get user's effective role
    const userRole = await getUserRole(email);
    
    // Store user information in localStorage
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userName', userData.Name || '');
    localStorage.setItem('userRole', userRole);
    
    return {
      email: email,
      name: userData.Name || '',
      role: userRole,
      contactNo: userData.ContactNo || '',
      parentEmail: userData.ParentEmail || null
    };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Register a new parent user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Created user data
 */
export const registerParentUser = async (userData) => {
  try {
    const { email, name, password, contactNo, deviceId, buildingName } = userData;
    
    // Check if email already exists
    const existingUser = await getDoc(doc(firestore, 'USER', email));
    if (existingUser.exists()) {
      throw new Error('This email is already registered');
    }
    
    // Verify device exists in Firestore
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    if (!deviceDoc.exists()) {
      throw new Error('Device unavailable.');
    }
    
    const deviceData = deviceDoc.data();
    
    // Check if device is already associated with a building that has a parent
    if (deviceData.Location) {
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
      
      if (locationDoc.exists()) {
        const locationData = locationDoc.data();
        const existingBuildingId = locationData.Building;
        
        // Check if this building already has a parent
        const existingParentQuery = query(
          collection(firestore, 'USERBUILDING'),
          where('Building', '==', existingBuildingId),
          where('Role', '==', 'parent')
        );
        
        const existingParentSnapshot = await getDocs(existingParentQuery);
        
        if (!existingParentSnapshot.empty) {
          throw new Error('This device is already associated with another parent. Please use a different device ID.');
        }
      }
    }
    
    // Generate unique building ID
    const buildingId = `Building_${name.replace(/\s+/g, '_')}_${Date.now()}`;
    
    // Create timestamp
    const timestamp = serverTimestamp();
    const now = new Date();
    const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    
    // 1. Create user in USER collection
    await setDoc(doc(firestore, 'USER', email), {
      Name: name,
      Email: email,
      Password: password, // In production, use proper password hashing
      ContactNo: contactNo || ''
    });
    
    // 2. Create building in BUILDING collection
    await setDoc(doc(firestore, 'BUILDING', buildingId), {
      BuildingName: buildingName,
      Address: '',
      Description: `Building created by ${name}`,
      CreatedAt: timestamp,
      DateCreated: dateCreated,
      CreatedBy: email
    });
    
    // 3. Create USERBUILDING record to associate user with building as parent
    const userBuildingId = `${email.split('@')[0]}_${buildingId}`;
    await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
      User: email,
      Building: buildingId,
      Role: 'parent',
      CreatedAt: timestamp
    });
    
    // 4. Create a default location in the building
    const locationId = `${buildingId}_Room1`;
    await setDoc(doc(firestore, 'LOCATION', locationId), {
      Building: buildingId,
      LocationName: 'Room 1',
      DateCreated: dateCreated
    });
    
    // 5. Update device to assign it to the new location
    await setDoc(doc(firestore, 'DEVICE', deviceId), {
      ...deviceData,
      Location: locationId
    }, { merge: true });
    
    return {
      email,
      name,
      role: 'parent',
      contactNo: contactNo || '',
      buildingId,
      locationId
    };
  } catch (error) {
    console.error('Error registering parent user:', error);
    throw error;
  }
};

/**
 * Register a new child user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Created user data
 */
export const registerChildUser = async (userData) => {
  try {
    const { email, name, password, contactNo, parentEmail } = userData;
    
    // Check if email already exists
    const existingUser = await getDoc(doc(firestore, 'USER', email));
    if (existingUser.exists()) {
      throw new Error('This email is already registered');
    }
    
    // Verify parent email exists
    const parentDoc = await getDoc(doc(firestore, 'USER', parentEmail));
    if (!parentDoc.exists()) {
      throw new Error('Parent email not found. Please check the email and try again.');
    }
    
    // Get parent's buildings
    const parentBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', parentEmail),
      where('Role', '==', 'parent')
    );
    
    const parentBuildingsSnapshot = await getDocs(parentBuildingsQuery);
    
    if (parentBuildingsSnapshot.empty) {
      throw new Error('Parent does not have any buildings. Parent must have at least one building to add children.');
    }
    
    const timestamp = serverTimestamp();
    
    // 1. Create user in USER collection
    await setDoc(doc(firestore, 'USER', email), {
      Name: name,
      Email: email,
      Password: password, // In production, use proper password hashing
      ContactNo: contactNo || '',
      ParentEmail: parentEmail
    });
    
    // 2. Add child to all parent's buildings with 'children' role
    for (const buildingDoc of parentBuildingsSnapshot.docs) {
      const buildingData = buildingDoc.data();
      const userBuildingId = `${email.split('@')[0]}_${buildingData.Building}`;
      
      await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
        User: email,
        Building: buildingData.Building,
        Role: 'children',
        CreatedAt: timestamp
      });
    }
    
    return {
      email,
      name,
      role: 'children',
      contactNo: contactNo || '',
      parentEmail
    };
  } catch (error) {
    console.error('Error registering child user:', error);
    throw error;
  }
};

/**
 * Login with Device ID (simplified version)
 * @param {string} deviceId - Device ID for login
 * @returns {Promise<Object>} Device data and authentication result
 */
export const loginWithDevice = async (deviceId) => {
  try {
    // Check if device exists
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    
    if (!deviceDoc.exists()) {
      throw new Error('Device Unavailable.');
    }
    
    // Get device data
    const deviceData = deviceDoc.data();
    
    // Store device information in localStorage
    localStorage.setItem('deviceId', deviceId);
    localStorage.setItem('deviceName', deviceData.DeviceName || deviceId);
    localStorage.setItem('deviceLocation', deviceData.Location || '');
    localStorage.setItem('userRole', 'device'); // Special role for device login
    
    return {
      id: deviceId,
      name: deviceData.DeviceName || deviceId,
      location: deviceData.Location,
      type: deviceData.DeviceType,
      description: deviceData.DeviceDescription
    };
  } catch (error) {
    console.error('Error logging in with device:', error);
    throw error;
  }
};

/**
 * Logout current user
 * @returns {void}
 */
export const logoutUser = () => {
  try {
    // Clear all user data from localStorage
    const userKeys = [
      'userEmail', 
      'userName', 
      'userRole', 
      'deviceId', 
      'deviceName', 
      'deviceLocation'
    ];
    
    userKeys.forEach(key => localStorage.removeItem(key));
    
    console.log('User logged out successfully');
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
};

/**
 * Check if user is currently authenticated
 * @returns {boolean} True if user is authenticated
 */
export const isAuthenticated = () => {
  const userEmail = localStorage.getItem('userEmail');
  const deviceId = localStorage.getItem('deviceId');
  
  return !!(userEmail || deviceId);
};

/**
 * Get current user data from localStorage
 * @returns {Object|null} Current user data or null
 */
export const getCurrentUser = () => {
  const userEmail = localStorage.getItem('userEmail');
  const deviceId = localStorage.getItem('deviceId');
  
  if (userEmail) {
    return {
      type: 'user',
      email: userEmail,
      name: localStorage.getItem('userName') || '',
      role: localStorage.getItem('userRole') || 'user'
    };
  }
  
  if (deviceId) {
    return {
      type: 'device',
      id: deviceId,
      name: localStorage.getItem('deviceName') || deviceId,
      location: localStorage.getItem('deviceLocation') || ''
    };
  }
  
  return null;
};

/**
 * Update user profile
 * @param {string} email - User email
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<boolean>} Success indicator
 */
export const updateUserProfile = async (email, profileData) => {
  try {
    const userRef = doc(firestore, 'USER', email);
    
    // Build update data
    const updateData = {
      Name: profileData.name,
      ContactNo: profileData.contactNo || ''
    };
    
    // Add password if it's being updated
    if (profileData.password) {
      updateData.Password = profileData.password;
    }
    
    await updateDoc(userRef, updateData);
    
    // Update localStorage if it's the current user
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.email === email) {
      localStorage.setItem('userName', profileData.name);
    }
    
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Validate user credentials (for password changes, etc.)
 * @param {string} email - User email
 * @param {string} password - Current password
 * @returns {Promise<boolean>} True if credentials are valid
 */
export const validateUserCredentials = async (email, password) => {
  try {
    const userDoc = await getDoc(doc(firestore, 'USER', email));
    
    if (!userDoc.exists()) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData.Password === password;
  } catch (error) {
    console.error('Error validating user credentials:', error);
    return false;
  }
};

// ==============================================================================
// EXPORTS
// ==============================================================================

export default {
  loginUser,
  registerParentUser,
  registerChildUser,
  loginWithDevice,
  logoutUser,
  isAuthenticated,
  getCurrentUser,
  updateUserProfile,
  validateUserCredentials
};