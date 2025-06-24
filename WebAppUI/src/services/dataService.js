// src/services/dataService.js - UPDATED with unified AutomationService integration
// Enhanced with Firestore Timestamps and Device Runtime Warning System + Event Logging

import { firestore, database } from './firebase';
import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where,
  serverTimestamp, 
  Timestamp
} from 'firebase/firestore';
import { ref, get, set, update, remove } from 'firebase/database';
import { sendDeviceRuntimeWarning } from './notificationService';
import AutomationService from './AutomationService'; 
import { logDeviceEvent } from './AutomationService'; 
// FIXED: Import validateDeviceOperation from deviceService
import { validateDeviceOperation } from './deviceService';

// ================================
// DEVICE RUNTIME WARNING SYSTEM (Updated for Firestore)
// ================================

/**
 * UPDATED: Check and send device runtime warnings (now using Firestore timestamps)
 * @param {string} deviceId - Device ID
 * @param {Object} deviceData - Device data from Firestore (includes timestamps)
 * @param {Object} rtdbData - Real-time database data (status only)
 * @returns {Promise<boolean>} True if warning was sent
 */
const checkDeviceRuntimeWarning = async (deviceId, deviceData, rtdbData) => {
  try {
    // Only check devices that are currently ON and have location
    if (!rtdbData || rtdbData.status !== 'ON' || !deviceData.Location) {
      return false;
    }

    const now = new Date();
    const onSince = deviceData.onSince ? deviceData.onSince.toDate() : null;
    const lastWarningAt = deviceData.lastWarningAt ? deviceData.lastWarningAt.toDate() : null;
    const warningCount = deviceData.warningCount || 0;

    // If no onSince timestamp, set it now (device just turned on)
    if (!onSince) {
      await updateDoc(doc(firestore, 'DEVICE', deviceId), {
        onSince: serverTimestamp(),
        lastWarningAt: null,
        warningCount: 0
      });
    
      return false;
    }

    // Calculate hours the device has been on
    const hoursOn = Math.floor((now - onSince) / (1000 * 60 * 60));
    
    // Determine if we should send a warning
    let shouldWarn = false;
    let nextWarningHour = 5; // First warning at 5 hours

    if (warningCount === 0 && hoursOn >= 5) {
      // First warning at 5 hours
      shouldWarn = true;
      nextWarningHour = 5;
    } else if (warningCount > 0) {
      // Subsequent warnings every 2 hours: 7h, 9h, 11h, etc.
      nextWarningHour = 5 + (warningCount * 2);
      if (hoursOn >= nextWarningHour) {
        // Check if enough time has passed since last warning (at least 1.5 hours to avoid spam)
        const hoursSinceLastWarning = lastWarningAt ? 
          Math.floor((now - lastWarningAt) / (1000 * 60 * 60)) : 999;
        
        if (hoursSinceLastWarning >= 1.5) {
          shouldWarn = true;
        }
      }
    }

    if (!shouldWarn) {
      return false;
    }

    // Get location and building details
    const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
    if (!locationDoc.exists()) {
      console.error(`Location ${deviceData.Location} not found for device ${deviceId}`);
      return false;
    }

    const locationData = locationDoc.data();
    const buildingId = locationData.Building;
    
    // Get building name
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    const buildingName = buildingDoc.exists() ? 
      (buildingDoc.data().BuildingName || buildingId) : buildingId;

    const locationName = locationData.LocationName || deviceData.Location;
    const deviceName = deviceData.DeviceName || deviceId;

    // Send warning notifications
    await sendDeviceRuntimeWarning(
      deviceId,
      deviceName,
      locationName,
      buildingId,
      buildingName,
      hoursOn,
      warningCount + 1
    );

    // UPDATED: Update warning tracking in Firestore
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      lastWarningAt: serverTimestamp(),
      warningCount: warningCount + 1,
      lastSeen: serverTimestamp()
    });


    return true;

  } catch (error) {
    console.error(`Error checking runtime warning for device ${deviceId}:`, error);
    return false;
  }
};

/**
 * UPDATED: Reset device runtime tracking when device turns OFF (now using Firestore)
 * @param {string} deviceId - Device ID
 */
const resetDeviceRuntimeTracking = async (deviceId) => {
  try {
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      onSince: null,
      lastWarningAt: null,
      warningCount: 0,
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    console.error(`Error resetting runtime tracking for device ${deviceId}:`, error);
  }
};

/**
 * UPDATED: Bulk check runtime warnings for multiple devices (now using Firestore)
 */
const bulkCheckRuntimeWarnings = async (deviceIds = []) => {
  try {
    let checkedCount = 0;
    let warningsSent = 0;
    
    for (const deviceId of deviceIds) {
      try {
        // Get device data from Firestore (includes timestamps)
        const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
        if (!deviceDoc.exists()) continue;
        
        const deviceData = deviceDoc.data();
        const rtdbData = await getDeviceStatus(deviceId);
        
        const warningSent = await checkDeviceRuntimeWarning(deviceId, deviceData, rtdbData);
        
        checkedCount++;
        if (warningSent) warningsSent++;
        
      } catch (error) {
        console.error(`Error checking device ${deviceId}:`, error);
      }
    }
    
 
    return { checkedCount, warningsSent };
    
  } catch (error) {
    console.error('Error in bulk runtime warning check:', error);
    return { checkedCount: 0, warningsSent: 0 };
  }
};

// ==============================================================================
// USER DATA OPERATIONS
// ==============================================================================

export const getUserData = async (email) => {
  try {
    const userDoc = await getDoc(doc(firestore, 'USER', email));
    return userDoc.exists() ? { id: email, ...userDoc.data() } : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
};

export const createUser = async (email, userData) => {
  try {
    await setDoc(doc(firestore, 'USER', email), {
      Name: userData.name,
      Email: email,
      Password: userData.password, // In production, use proper hashing
      ContactNo: userData.contactNo || '',
      ParentEmail: userData.parentEmail || null
    });
    return { id: email, ...userData };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const updateUser = async (email, userData) => {
  try {
    await updateDoc(doc(firestore, 'USER', email), userData);
    return true;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

// ==============================================================================
// BUILDING OPERATIONS
// ==============================================================================

export const getAllBuildings = async () => {
  try {
    const buildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
    return buildingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      buildingName: doc.data().BuildingName || doc.id
    }));
  } catch (error) {
    console.error('Error getting buildings:', error);
    throw error;
  }
};

export const getBuilding = async (buildingId) => {
  try {
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    if (!buildingDoc.exists()) return null;
    
    const buildingData = buildingDoc.data();
    return { 
      id: buildingId, 
      ...buildingData,
      buildingName: buildingData.BuildingName || buildingId
    };
  } catch (error) {
    console.error('Error getting building:', error);
    throw error;
  }
};

export const createBuilding = async (buildingId, buildingData) => {
  try {
    await setDoc(doc(firestore, 'BUILDING', buildingId), {
      BuildingName: buildingData.name,
      Address: buildingData.address || '',
      Description: buildingData.description || '',
      CreatedAt: serverTimestamp(),
      CreatedBy: buildingData.createdBy
    });
    
    return { id: buildingId, ...buildingData };
  } catch (error) {
    console.error('Error creating building:', error);
    throw error;
  }
};

export const updateBuilding = async (buildingId, buildingData) => {
  try {
    await updateDoc(doc(firestore, 'BUILDING', buildingId), buildingData);
    return true;
  } catch (error) {
    console.error('Error updating building:', error);
    throw error;
  }
};

export const deleteBuilding = async (buildingId) => {
  try {
    // Delete building
    await deleteDoc(doc(firestore, 'BUILDING', buildingId));
    
    // Delete all user-building relationships
    const userBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', buildingId)
    );
    const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
    
    const deletePromises = userBuildingsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return true;
  } catch (error) {
    console.error('Error deleting building:', error);
    throw error;
  }
};

export const getAllBuildingsWithDetails = async () => {
  try {
    const buildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
    return buildingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      buildingName: doc.data().BuildingName || doc.id
    }));
  } catch (error) {
    console.error('Error getting buildings with details:', error);
    throw error;
  }
};

// ==============================================================================
// LOCATION OPERATIONS
// ==============================================================================

export const getBuildingLocations = async (buildingId) => {
  try {
    const locationsQuery = query(
      collection(firestore, 'LOCATION'),
      where('Building', '==', buildingId)
    );
    const locationsSnapshot = await getDocs(locationsQuery);
    
    // Get building details for proper name mapping
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    const buildingName = buildingDoc.exists() ? 
      (buildingDoc.data().BuildingName || buildingId) : buildingId;
    
    return locationsSnapshot.docs.map(doc => {
      const locationData = doc.data();
      return {
        id: doc.id,
        ...locationData,
        locationName: locationData.LocationName || doc.id,
        buildingId: locationData.Building,
        buildingName: buildingName
      };
    });
  } catch (error) {
    console.error('Error getting building locations:', error);
    throw error;
  }
};

export const getAllLocations = async () => {
  try {
    const locationsSnapshot = await getDocs(collection(firestore, 'LOCATION'));
    
    // Get all buildings for name mapping
    const buildings = await getAllBuildings();
    const buildingMap = new Map(buildings.map(b => [b.id, b.buildingName]));
    
    return locationsSnapshot.docs.map(doc => {
      const locationData = doc.data();
      return {
        id: doc.id,
        ...locationData,
        locationName: locationData.LocationName || doc.id,
        buildingId: locationData.Building,
        buildingName: buildingMap.get(locationData.Building) || 'Unknown Building'
      };
    });
  } catch (error) {
    console.error('Error getting all locations:', error);
    throw error;
  }
};

export const createLocation = async (locationId, locationData) => {
  try {
    await setDoc(doc(firestore, 'LOCATION', locationId), {
      Building: locationData.buildingId,
      LocationName: locationData.name,
      CreatedAt: serverTimestamp(),
    });
    
    return { id: locationId, ...locationData };
  } catch (error) {
    console.error('Error creating location:', error);
    throw error;
  }
};

export const deleteLocation = async (locationId) => {
  try {
    // Check if any devices are in this location
    const devicesQuery = query(
      collection(firestore, 'DEVICE'),
      where('Location', '==', locationId)
    );
    const devicesSnapshot = await getDocs(devicesQuery);
    
    if (!devicesSnapshot.empty) {
      throw new Error(`Cannot delete location. It contains ${devicesSnapshot.size} device(s).`);
    }
    
    // Check if any users are assigned to this location
    const userBuildingsQuery = query(collection(firestore, 'USERBUILDING'));
    const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
    
    let hasAssignedUsers = false;
    for (const userBuildingDoc of userBuildingsSnapshot.docs) {
      const userData = userBuildingDoc.data();
      const assignedLocations = userData.AssignedLocations || [];
      if (assignedLocations.includes(locationId)) {
        hasAssignedUsers = true;
        break;
      }
    }
    
    if (hasAssignedUsers) {
      throw new Error('Cannot delete location. Some users are assigned to it.');
    }
    
    await deleteDoc(doc(firestore, 'LOCATION', locationId));
    return true;
  } catch (error) {
    console.error('Error deleting location:', error);
    throw error;
  }
};

// ==============================================================================
// LOCATION-BASED USER ASSIGNMENT OPERATIONS
// ==============================================================================

/**
 * Assign user to locations in a building
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @param {Array} locationIds - Array of location IDs to assign
 * @returns {Promise<boolean>} Success indicator
 */
export const assignUserToLocations = async (userEmail, buildingId, locationIds) => {
  try {

    
    // Get user's building relationship
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (userBuildingSnapshot.empty) {
      throw new Error('User is not associated with this building');
    }
    
    const userBuildingDoc = userBuildingSnapshot.docs[0];
    
    // Update assigned locations
    await updateDoc(userBuildingDoc.ref, {
      AssignedLocations: locationIds
    });
    
    console.log('✅ User assigned to locations successfully');
    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Add location to user's assignments
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @param {string} locationId - Location ID to add
 * @returns {Promise<boolean>} Success indicator
 */
export const addLocationToUser = async (userEmail, buildingId, locationId) => {
  try {
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (userBuildingSnapshot.empty) {
      throw new Error('User is not associated with this building');
    }
    
    const userBuildingDoc = userBuildingSnapshot.docs[0];
    const userData = userBuildingDoc.data();
    const currentLocations = userData.AssignedLocations || [];
    
    if (!currentLocations.includes(locationId)) {
      await updateDoc(userBuildingDoc.ref, {
        AssignedLocations: [...currentLocations, locationId]
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error adding location to user:', error);
    throw error;
  }
};

/**
 * Remove location from user's assignments
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @param {string} locationId - Location ID to remove
 * @returns {Promise<boolean>} Success indicator
 */
export const removeLocationFromUser = async (userEmail, buildingId, locationId) => {
  try {
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (userBuildingSnapshot.empty) {
      throw new Error('User is not associated with this building');
    }
    
    const userBuildingDoc = userBuildingSnapshot.docs[0];
    const userData = userBuildingDoc.data();
    const currentLocations = userData.AssignedLocations || [];
    
    const updatedLocations = currentLocations.filter(id => id !== locationId);
    
    await updateDoc(userBuildingDoc.ref, {
      AssignedLocations: updatedLocations
    });
    
    return true;
  } catch (error) {
    console.error('Error removing location from user:', error);
    throw error;
  }
};

/**
 * Get user's assigned locations in a building
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of location IDs
 */
export const getUserAssignedLocations = async (userEmail, buildingId) => {
  try {
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (!userBuildingSnapshot.empty) {
      const userData = userBuildingSnapshot.docs[0].data();
      return userData.AssignedLocations || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error getting user assigned locations:', error);
    return [];
  }
};

// ==============================================================================
// ENHANCED DEVICE OPERATIONS (with eventHistory integration)
// ==============================================================================

/**
 * UPDATED: Get device status from Real-time Database (status only)
 */
const getDeviceStatus = async (deviceId) => {
  try {
    const deviceRef = ref(database, `Devices/${deviceId}`);
    const snapshot = await get(deviceRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      return { status: 'OFF' };
    }
  } catch (error) {
    console.error(`Error getting device status for ${deviceId}:`, error);
    return { status: 'OFF' };
  }
};

export const getAllDevices = async () => {
  try {
    const devicesSnapshot = await getDocs(collection(firestore, 'DEVICE'));
    const devices = devicesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // UPDATED: Get RTDB status for each device and combine with Firestore timestamps
    const devicesWithStatus = await Promise.all(
      devices.map(async (device) => {
        try {
          const rtdbData = await getDeviceStatus(device.id);
          
          // UPDATED: Check for runtime warnings using Firestore data
          await checkDeviceRuntimeWarning(device.id, device, rtdbData);
          
          return {
            ...device,
            status: rtdbData.status || 'OFF',
            locationId: rtdbData.locationId || device.Location || ''
          };
        } catch (err) {
          console.error(`Error getting RTDB status for device ${device.id}:`, err);
          return { ...device, status: 'OFF' };
        }
      })
    );
    
    return devicesWithStatus;
  } catch (error) {
    console.error('Error getting devices:', error);
    throw error;
  }
};

export const getDevice = async (deviceId) => {
  try {
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    
    if (!deviceDoc.exists()) return null;
    
    const deviceData = { id: deviceId, ...deviceDoc.data() };
    
    // UPDATED: Get RTDB status and combine with Firestore timestamps
    try {
      const rtdbData = await getDeviceStatus(deviceId);
      
      // UPDATED: Check for runtime warnings using Firestore data
      await checkDeviceRuntimeWarning(deviceId, deviceData, rtdbData);
      
      deviceData.status = rtdbData.status || 'OFF';
      deviceData.locationId = rtdbData.locationId || deviceData.Location || '';
    } catch (err) {
      console.error(`Error getting RTDB status for device ${deviceId}:`, err);
      deviceData.status = 'OFF';
    }
    
    return deviceData;
  } catch (error) {
    console.error('Error getting device:', error);
    throw error;
  }
};

export const createDevice = async (deviceId, deviceData) => {
  try {
    // UPDATED: Create device in Firestore with timestamp fields
    const firestoreData = {
      AssignedTo: deviceData.assignedTo || [],
      DeviceDescription: deviceData.description || '',
      DeviceName: deviceData.name,
      DeviceType: deviceData.type || 'Other',
      Location: deviceData.location || null,
      // NEW: Timestamp fields in Firestore
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      onSince: null,
      lastWarningAt: null,
      warningCount: 0
    };
    
    await setDoc(doc(firestore, 'DEVICE', deviceId), firestoreData);
    
    // UPDATED: Create device in RTDB with only status and locationId
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await set(rtdbRef, {
      status: 'OFF',
      locationId: deviceData.location || ''
    });
    
    // 🔥 UPDATED: Log device creation event to eventHistory
    await logDeviceEvent(
      deviceId, 
      'DEVICE_CREATED', 
      'OFF', 
      'system', 
      deviceData.createdBy || 'system'
    );
    
    return { id: deviceId, ...firestoreData };
  } catch (error) {
    console.error('Error creating device:', error);
    throw error;
  }
};

export const updateDevice = async (deviceId, deviceData) => {
  try {
    // Prepare update data with only allowed fields
    const allowedFields = ['AssignedTo', 'DeviceDescription', 'DeviceName', 'DeviceType', 'Location'];
    const updateData = {
      lastSeen: serverTimestamp() // Always update lastSeen
    };
    
    // Only include allowed fields in the update
    for (const [key, value] of Object.entries(deviceData)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }
    
    // Check if location changed for event logging
    const oldLocation = (await getDoc(doc(firestore, 'DEVICE', deviceId))).data()?.Location;
    const newLocation = updateData.Location;
    
    // Update in Firestore
    await updateDoc(doc(firestore, 'DEVICE', deviceId), updateData);
    
    // Update location in RTDB if location changed
    if (updateData.Location !== undefined) {
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      await update(rtdbRef, {
        locationId: updateData.Location || ''
      });
    }
    
    // 🔥 UPDATED: Log location change event if location changed (to eventHistory)
    if (oldLocation !== newLocation) {
      await logDeviceEvent(
        deviceId, 
        'LOCATION_CHANGED', 
        'OFF', 
        'manual', 
        localStorage.getItem('userEmail') || 'unknown'
      );
    }
    
    return true;
  } catch (error) {
    console.error('Error updating device:', error);
    throw error;
  }
};

export const deleteDevice = async (deviceId) => {
  try {
    // 🔥 UPDATED: Log device deletion event before deleting (to eventHistory)
    await logDeviceEvent(
      deviceId, 
      'DEVICE_DELETED', 
      'OFF', 
      'system', 
      localStorage.getItem('userEmail') || 'system'
    );
    
    // Delete from Firestore
    await deleteDoc(doc(firestore, 'DEVICE', deviceId));
    
    // Delete from RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await remove(rtdbRef);
    
    return true;
  } catch (error) {
    console.error('Error deleting device:', error);
    throw error;
  }
};

export const toggleDeviceStatus = async (deviceId) => {
  try {
    
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    const snapshot = await get(rtdbRef);
    
    let currentStatus = 'OFF';
    if (snapshot.exists()) {
      currentStatus = snapshot.val().status || 'OFF';
    }
    
    const newStatus = currentStatus === 'ON' ? 'OFF' : 'ON';
    const action = newStatus === 'ON' ? 'TURN_ON' : 'TURN_OFF';
    
    // FIXED: Use validateDeviceOperation from deviceService instead of AutomationService
    if (newStatus === 'ON') {
      const validation = await validateDeviceOperation(deviceId, 'turn-on');
      
      if (!validation.allowed) {
  
        
        // Throw a user-friendly error based on the validation code
        switch (validation.code) {
          case 'DEVICE_LOCKED':
            throw new Error(`Cannot turn on device: ${validation.reason}\n\nTo turn on devices, first disable the "Turn Off All" automation mode in the building's automation settings.`);
          case 'DEVICE_NOT_FOUND':
            throw new Error('Device not found in the system. Please check the device configuration.');
          case 'VALIDATION_ERROR':
            throw new Error('Unable to validate device operation. Please try again or contact support.');
          default:
            throw new Error(`Cannot turn on device: ${validation.reason}`);
        }
      }
      
    }
    
    // Proceed with status update if validation passed (or if turning off)
    await update(rtdbRef, {
      status: newStatus
    });

    // 🔥 UPDATED: Log device event to eventHistory subcollection
    await logDeviceEvent(
      deviceId, 
      action, 
      newStatus, 
      'manual', 
      localStorage.getItem('userEmail')
    );

    // UPDATED: Handle timestamp tracking in Firestore
    const firestoreUpdateData = {
      lastSeen: serverTimestamp()
    };

    if (newStatus === 'ON') {
      // Device turning ON - start tracking
      firestoreUpdateData.onSince = serverTimestamp();
      firestoreUpdateData.lastWarningAt = null;
      firestoreUpdateData.warningCount = 0;
    } else {
      // Device turning OFF - reset tracking
      firestoreUpdateData.onSince = null;
      firestoreUpdateData.lastWarningAt = null;
      firestoreUpdateData.warningCount = 0;
    }
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), firestoreUpdateData);
    

    return newStatus;
  } catch (error) {

    throw error;
  }
};

// ==============================================================================
// DEVICE CLAIMING AND MANAGEMENT
// ==============================================================================

/**
 * Claim a device by assigning it to a location
 * @param {string} deviceId - Device ID
 * @param {string} locationId - Location ID to assign device to
 * @returns {Promise<boolean>} Success indicator
 */
export const claimDevice = async (deviceId, locationId, deviceUpdates = {}) => {
  try {
  
    
    // Update device with location and any other updates
    const updateData = {
      Location: locationId,
      lastSeen: serverTimestamp(),
      ...deviceUpdates
    };
    
    // Only include allowed fields
    const allowedFields = ['AssignedTo', 'DeviceDescription', 'DeviceName', 'DeviceType', 'Location', 'lastSeen'];
    const filteredData = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        filteredData[key] = value;
      }
    }
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), filteredData);
    
    // Update location in RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await update(rtdbRef, {
      locationId: locationId
    });
    
    // 🔥 UPDATED: Log device claim event to eventHistory
    await logDeviceEvent(
      deviceId, 
      'DEVICE_CLAIMED', 
      'OFF', 
      'manual', 
      localStorage.getItem('userEmail')
    );
    

    return true;
  } catch (error) {
    console.error('Error claiming device:', error);
    throw error;
  }
};

/**
 * UPDATED: Unclaim a device by removing its location (with Firestore timestamp reset)
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>} Success indicator
 */
export const unclaimDevice = async (deviceId) => {
  try {

    
    // UPDATED: Update device to remove location and reset timestamps
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      Location: null,
      AssignedTo: [], // Clear legacy assignments when unclaiming
      lastSeen: serverTimestamp(),
      // Reset runtime tracking when unclaiming
      onSince: null,
      lastWarningAt: null,
      warningCount: 0
    });
    
    // Update RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await update(rtdbRef, {
      locationId: ''
    });
    
    // 🔥 UPDATED: Log device unclaim event to eventHistory
    await logDeviceEvent(
      deviceId, 
      'DEVICE_UNCLAIMED', 
      'OFF', 
      'manual', 
      localStorage.getItem('userEmail')
    );
    return true;
  } catch (error) {
    console.error('Error unclaiming device:', error);
    throw error;
  }
};

/**
 * Get all unclaimed devices (devices without location)
 * @returns {Promise<Array>} Array of unclaimed devices
 */
export const getUnclaimedDevices = async () => {
  try {
    const unclaimedQuery = query(
      collection(firestore, 'DEVICE'),
      where('Location', '==', null)
    );
    
    const unclaimedSnapshot = await getDocs(unclaimedQuery);
    
    const devices = unclaimedSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get RTDB status for each device
    const devicesWithStatus = await Promise.all(
      devices.map(async (device) => {
        try {
          const rtdbData = await getDeviceStatus(device.id);
          
          return {
            ...device,
            status: rtdbData.status || 'OFF',
            locationId: rtdbData.locationId || ''
          };
        } catch (err) {
          console.error(`Error getting RTDB status for device ${device.id}:`, err);
          return { ...device, status: 'OFF' };
        }
      })
    );
    
    return devicesWithStatus;
  } catch (error) {
    console.error('Error getting unclaimed devices:', error);
    throw error;
  }
};

/**
 * UPDATED: Get devices in a specific location with Firestore timestamp checks
 * @param {string} locationId - Location ID
 * @returns {Promise<Array>} Array of devices in the location
 */
export const getDevicesByLocation = async (locationId) => {
  try {
    const devicesQuery = query(
      collection(firestore, 'DEVICE'),
      where('Location', '==', locationId)
    );
    
    const devicesSnapshot = await getDocs(devicesQuery);
    
    const devices = devicesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // UPDATED: Get RTDB status for each device and check runtime warnings
    const devicesWithStatus = await Promise.all(
      devices.map(async (device) => {
        try {
          const rtdbData = await getDeviceStatus(device.id);
          
          // UPDATED: Check for runtime warnings using Firestore data
          await checkDeviceRuntimeWarning(device.id, device, rtdbData);
          
          return {
            ...device,
            status: rtdbData.status || 'OFF',
            locationId: rtdbData.locationId || device.Location || ''
          };
        } catch (err) {
          console.error(`Error getting RTDB status for device ${device.id}:`, err);
          return { ...device, status: 'OFF' };
        }
      })
    );
    
    return devicesWithStatus;
  } catch (error) {
    console.error('Error getting devices by location:', error);
    throw error;
  }
};

/**
 * UPDATED: Move device to a different location (with Firestore timestamp reset)
 * @param {string} deviceId - Device ID
 * @param {string} newLocationId - New location ID (null to unclaim)
 * @returns {Promise<boolean>} Success indicator
 */
export const moveDeviceToLocation = async (deviceId, newLocationId) => {
  try {
    
    // UPDATED: Update device location in Firestore with timestamp reset
    const updateData = {
      Location: newLocationId,
      lastSeen: serverTimestamp()
    };
    
    // Reset runtime tracking when moving device
    if (newLocationId) {
      updateData.onSince = null;
      updateData.lastWarningAt = null;
      updateData.warningCount = 0;
    }
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), updateData);
    
    // Update location in RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await update(rtdbRef, {
      locationId: newLocationId || ''
    });
    
    // 🔥 UPDATED: Log device move event to eventHistory
    await logDeviceEvent(
      deviceId, 
      'DEVICE_MOVED', 
      'OFF', 
      'manual', 
      localStorage.getItem('userEmail')
    );
    

    return true;
  } catch (error) {
    console.error('Error moving device:', error);
    throw error;
  }
};

// ==============================================================================
// USER-BUILDING RELATIONSHIPS (Enhanced for Location Assignments)
// ==============================================================================

export const addUserToBuilding = async (userEmail, buildingId, role, assignedLocations = []) => {
  try {
    const userBuildingId = `${userEmail.replace(/\./g, '_')}_${buildingId}`;
    
    await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
      User: userEmail,
      Building: buildingId,
      Role: role,
      AssignedLocations: assignedLocations, // New field for location assignments
      CreatedAt: serverTimestamp()
    });
    
    return { id: userBuildingId, User: userEmail, Building: buildingId, Role: role, AssignedLocations: assignedLocations };
  } catch (error) {
    console.error('Error adding user to building:', error);
    throw error;
  }
};

export const removeUserFromBuilding = async (userEmail, buildingId) => {
  try {
    const userBuildingId = `${userEmail.replace(/\./g, '_')}_${buildingId}`;
    await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingId));
    return true;
  } catch (error) {
    console.error('Error removing user from building:', error);
    throw error;
  }
};

export const getUsersInBuilding = async (buildingId, role = null) => {
  try {
    let userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', buildingId)
    );
    
    if (role) {
      userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId),
        where('Role', '==', role)
      );
    }
    
    const userBuildingsSnapshot = await getDocs(userBuildingQuery);
    
    const users = [];
    for (const doc of userBuildingsSnapshot.docs) {
      const data = doc.data();
      const userDoc = await getDoc(doc(firestore, 'USER', data.User));
      
      if (userDoc.exists()) {
        users.push({
          id: data.User,
          ...userDoc.data(),
          buildingRole: data.Role,
          assignedLocations: data.AssignedLocations || []
        });
      }
    }
    
    return users;
  } catch (error) {
    console.error('Error getting users in building:', error);
    throw error;
  }
};

// ==============================================================================
// LEGACY DEVICE ASSIGNMENT OPERATIONS (For Backward Compatibility)
// ==============================================================================

export const assignDeviceToUser = async (deviceId, userEmail) => {
  try {
    const deviceRef = doc(firestore, 'DEVICE', deviceId);
    const deviceDoc = await getDoc(deviceRef);
    
    if (!deviceDoc.exists()) {
      throw new Error('Device not found');
    }
    
    const currentAssignedTo = deviceDoc.data().AssignedTo || [];
    
    if (!currentAssignedTo.includes(userEmail)) {
      await updateDoc(deviceRef, {
        AssignedTo: [...currentAssignedTo, userEmail],
        lastSeen: serverTimestamp()
      });
      
      // 🔥 UPDATED: Log assignment event to eventHistory
      await logDeviceEvent(
        deviceId, 
        'USER_ASSIGNED', 
        'OFF', 
        'manual', 
        localStorage.getItem('userEmail')
      );
    }
    
    return true;
  } catch (error) {
    console.error('Error assigning device to user:', error);
    throw error;
  }
};

export const unassignDeviceFromUser = async (deviceId, userEmail) => {
  try {
    const deviceRef = doc(firestore, 'DEVICE', deviceId);
    const deviceDoc = await getDoc(deviceRef);
    
    if (!deviceDoc.exists()) {
      throw new Error('Device not found');
    }
    
    const currentAssignedTo = deviceDoc.data().AssignedTo || [];
    const updatedAssignedTo = currentAssignedTo.filter(email => email !== userEmail);
    
    await updateDoc(deviceRef, {
      AssignedTo: updatedAssignedTo,
      lastSeen: serverTimestamp()
    });
    
    // 🔥 UPDATED: Log unassignment event to eventHistory
    await logDeviceEvent(
      deviceId, 
      'USER_UNASSIGNED', 
      'OFF', 
      'manual', 
      localStorage.getItem('userEmail')
    );
    
    return true;
  } catch (error) {
    console.error('Error unassigning device from user:', error);
    throw error;
  }
};

// ==============================================================================
// UPDATED BULK OPERATIONS (with Firestore Timestamp Integration)
// ==============================================================================

/**
 * UPDATED: Get user devices and locations with Firestore timestamp checks
 */
export const getUserDevicesAndLocations = async (userEmail) => {
  try {
    

    // Get user's building roles
    const userBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail)
    );
    const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
    
    const buildingIds = [];
    const userLocationAssignments = new Map(); // building -> locations
    
    userBuildingsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.Building !== 'SystemAdmin') {
        buildingIds.push(data.Building);
        userLocationAssignments.set(data.Building, data.AssignedLocations || []);
      }
    });
    
    // Get locations with building info
    const locations = [];
    
    for (const buildingId of buildingIds) {
      try {
        // Get locations for this building
        const locationsQuery = query(
          collection(firestore, 'LOCATION'),
          where('Building', '==', buildingId)
        );
        const locationsSnapshot = await getDocs(locationsQuery);
        
        // Get building name
        const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
        const buildingName = buildingDoc.exists() ? 
          (buildingDoc.data().BuildingName || buildingId) : buildingId;
        
        locationsSnapshot.docs.forEach(doc => {
          const locationData = doc.data();
          locations.push({
            id: doc.id,
            ...locationData,
            locationName: locationData.LocationName || doc.id,
            buildingId: locationData.Building,
            buildingName: buildingName,
            userHasAccess: userLocationAssignments.get(buildingId)?.includes(doc.id) || false
          });
        });
        
      } catch (error) {
        console.error(`Error fetching locations for building ${buildingId}:`, error);
      }
    }
    
    // UPDATED: Get all devices with Firestore timestamp handling and event logging
    const devices = await getAllDevices(); // This now includes Firestore timestamp handling and event logging
    
  
    
    return { devices, locations, buildingIds, userLocationAssignments };
  } catch (error) {
    console.error('Error getting user devices and locations:', error);
    throw error;
  }
};

// ==============================================================================
// VALIDATION HELPERS (Enhanced for Location-Based System)
// ==============================================================================

export const validateDeviceExists = async (deviceId) => {
  try {
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    return deviceDoc.exists();
  } catch (error) {
    console.error('Error validating device exists:', error);
    return false;
  }
};

export const validateUserExists = async (userEmail) => {
  try {
    const userDoc = await getDoc(doc(firestore, 'USER', userEmail));
    return userDoc.exists();
  } catch (error) {
    console.error('Error validating user exists:', error);
    return false;
  }
};

export const validateBuildingExists = async (buildingId) => {
  try {
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    return buildingDoc.exists();
  } catch (error) {
    console.error('Error validating building exists:', error);
    return false;
  }
};

export const validateLocationExists = async (locationId) => {
  try {
    const locationDoc = await getDoc(doc(firestore, 'LOCATION', locationId));
    return locationDoc.exists();
  } catch (error) {
    console.error('Error validating location exists:', error);
    return false;
  }
};

/**
 * Validate if device is available for claiming (no location assigned)
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} Validation result
 */
export const validateDeviceAvailableForClaiming = async (deviceId) => {
  try {
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    
    if (!deviceDoc.exists()) {
      return { available: false, reason: 'Device Unavailable' };
    }
    
    const deviceData = deviceDoc.data();
    
    if (deviceData.Location) {
      return { available: false, reason: 'Device Unavailable' };
    }
    
    return { available: true, reason: 'Device available for claiming' };
    
  } catch (error) {
    console.error('Error validating device availability:', error);
    return { available: false, reason: 'Validation error' };
  }
};

/**
 * Validate user has access to location
 * @param {string} userEmail - User's email
 * @param {string} locationId - Location ID
 * @returns {Promise<boolean>} True if user has access
 */
export const validateUserHasLocationAccess = async (userEmail, locationId) => {
  try {
    // Get location details to find building
    const locationDoc = await getDoc(doc(firestore, 'LOCATION', locationId));
    if (!locationDoc.exists()) return false;
    
    const locationData = locationDoc.data();
    const buildingId = locationData.Building;
    
    // Get user's assigned locations in this building
    const assignedLocations = await getUserAssignedLocations(userEmail, buildingId);
    
    return assignedLocations.includes(locationId);
  } catch (error) {
    console.error('Error validating user location access:', error);
    return false;
  }
};

// ==============================================================================
// MIGRATION UTILITIES (For transitioning from device-based to location-based)
// ==============================================================================

/**
 * Migrate legacy device assignments to location-based assignments
 * This function is for transitioning existing systems
 * @param {string} buildingId - Building ID to migrate
 * @returns {Promise<Object>} Migration result
 */
export const migrateLegacyDeviceAssignments = async (buildingId) => {
  try {

    
    // Get all locations in the building
    const locationsQuery = query(
      collection(firestore, 'LOCATION'),
      where('Building', '==', buildingId)
    );
    const locationsSnapshot = await getDocs(locationsQuery);
    const locationIds = locationsSnapshot.docs.map(doc => doc.id);
    
    if (locationIds.length === 0) {
      console.log('No locations found for building');
      return { devicesProcessed: 0, usersUpdated: 0, locationsAssigned: 0 };
    }
    
    const devicesQuery = query(
      collection(firestore, 'DEVICE'),
      where('Location', 'in', locationIds)
    );
    const devicesSnapshot = await getDocs(devicesQuery);
    
    const migrationResults = {
      devicesProcessed: 0,
      usersUpdated: 0,
      locationsAssigned: 0
    };
    
    // Process each device
    for (const deviceDoc of devicesSnapshot.docs) {
      const deviceData = deviceDoc.data();
      const assignedUsers = deviceData.AssignedTo || [];
      
      if (assignedUsers.length === 0) continue;
      
      migrationResults.devicesProcessed++;
      
      // For each assigned user, add the device's location to their assigned locations
      for (const userEmail of assignedUsers) {
        try {
          const userBuildingQuery = query(
            collection(firestore, 'USERBUILDING'),
            where('User', '==', userEmail),
            where('Building', '==', buildingId)
          );
          
          const userBuildingSnapshot = await getDocs(userBuildingQuery);
          
          if (!userBuildingSnapshot.empty) {
            const userBuildingDoc = userBuildingSnapshot.docs[0];
            const userData = userBuildingDoc.data();
            const currentLocations = userData.AssignedLocations || [];
            
            if (!currentLocations.includes(deviceData.Location)) {
              await updateDoc(userBuildingDoc.ref, {
                AssignedLocations: [...currentLocations, deviceData.Location]
              });
              
              migrationResults.locationsAssigned++;
            }
            
            migrationResults.usersUpdated++;
          }
        } catch (userError) {
          console.error(`Error updating user ${userEmail}:`, userError);
        }
      }
      
      // Optionally clear the legacy AssignedTo field
      // await updateDoc(deviceDoc.ref, { AssignedTo: [] });
    }
    
    return migrationResults;
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
};

// ==============================================================================
// EXPORTS
// ==============================================================================

export default {
  // User operations
  getUserData,
  createUser,
  updateUser,
  
  // Building operations
  getAllBuildings,
  getBuilding,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  getAllBuildingsWithDetails,
  
  // Location operations
  getBuildingLocations,
  getAllLocations,
  createLocation,
  deleteLocation,
  
  // Location-based user assignments
  assignUserToLocations,
  addLocationToUser,
  removeLocationFromUser,
  getUserAssignedLocations,
  
  // UPDATED: Device operations (with eventHistory integration)
  getAllDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  toggleDeviceStatus,
  getDeviceStatus, // Exposed for external use
  
  // Device claiming operations
  claimDevice,
  unclaimDevice,
  getUnclaimedDevices,
  getDevicesByLocation,
  moveDeviceToLocation,
  
  // User-Building relationships (enhanced)
  addUserToBuilding,
  removeUserFromBuilding,
  getUsersInBuilding,
  
  // Legacy device assignments (for backward compatibility)
  assignDeviceToUser,
  unassignDeviceFromUser,
  
  // UPDATED: Bulk operations (with eventHistory integration)
  getUserDevicesAndLocations,
  
  // Validation
  validateDeviceExists,
  validateUserExists,
  validateBuildingExists,
  validateLocationExists,
  validateDeviceAvailableForClaiming,
  validateUserHasLocationAccess,
  
  // Migration utilities
  migrateLegacyDeviceAssignments,
  
  // UPDATED: Runtime warning operations (now using Firestore)
  checkDeviceRuntimeWarning,
  resetDeviceRuntimeTracking,
  bulkCheckRuntimeWarnings
};