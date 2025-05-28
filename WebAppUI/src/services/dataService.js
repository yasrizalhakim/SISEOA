// src/services/dataService.js - Enhanced with Location-Based Assignment Support

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
  serverTimestamp 
} from 'firebase/firestore';
import { ref, get, set, update, remove } from 'firebase/database';

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
    const now = new Date();
    const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    
    await setDoc(doc(firestore, 'BUILDING', buildingId), {
      BuildingName: buildingData.name,
      Address: buildingData.address || '',
      Description: buildingData.description || '',
      CreatedAt: serverTimestamp(),
      DateCreated: dateCreated,
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
    const now = new Date();
    const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    
    await setDoc(doc(firestore, 'LOCATION', locationId), {
      Building: locationData.buildingId,
      LocationName: locationData.name,
      DateCreated: dateCreated
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
    console.log(`📍 Assigning user ${userEmail} to locations:`, locationIds);
    
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
    console.error('Error assigning user to locations:', error);
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
// SIMPLIFIED DEVICE OPERATIONS (6 fields only)
// ==============================================================================

export const getAllDevices = async () => {
  try {
    const devicesSnapshot = await getDocs(collection(firestore, 'DEVICE'));
    const devices = devicesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get RTDB status for each device
    const devicesWithStatus = await Promise.all(
      devices.map(async (device) => {
        try {
          const rtdbRef = ref(database, `Devices/${device.id}`);
          const rtdbSnapshot = await get(rtdbRef);
          
          if (rtdbSnapshot.exists()) {
            return {
              ...device,
              status: rtdbSnapshot.val().status || 'OFF',
              lastSeen: rtdbSnapshot.val().lastSeen
            };
          }
          
          return { ...device, status: 'OFF' };
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
    
    // Get RTDB status
    try {
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      const rtdbSnapshot = await get(rtdbRef);
      
      if (rtdbSnapshot.exists()) {
        deviceData.status = rtdbSnapshot.val().status || 'OFF';
        deviceData.lastSeen = rtdbSnapshot.val().lastSeen;
      } else {
        deviceData.status = 'OFF';
      }
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
    // Create device in Firestore with only the 6 allowed fields
    const firestoreData = {
      AssignedTo: deviceData.assignedTo || [],
      DeviceDescription: deviceData.description || '',
      DeviceName: deviceData.name,
      DeviceType: deviceData.type || 'Other',
      Location: deviceData.location || null
    };
    
    await setDoc(doc(firestore, 'DEVICE', deviceId), firestoreData);
    
    // Create device in RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await set(rtdbRef, {
      status: 'OFF',
      locationId: deviceData.location || '',
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
    
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
    const updateData = {};
    
    // Only include allowed fields in the update
    for (const [key, value] of Object.entries(deviceData)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }
    
    // Update in Firestore
    await updateDoc(doc(firestore, 'DEVICE', deviceId), updateData);
    
    // Update location in RTDB if location changed
    if (updateData.Location !== undefined) {
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      await update(rtdbRef, {
        locationId: updateData.Location || '',
        lastSeen: new Date().toISOString()
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error updating device:', error);
    throw error;
  }
};

export const deleteDevice = async (deviceId) => {
  try {
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
    
    if (snapshot.exists()) {
      const currentStatus = snapshot.val().status;
      const newStatus = currentStatus === 'ON' ? 'OFF' : 'ON';
      
      await update(rtdbRef, {
        status: newStatus,
        lastSeen: new Date().toISOString()
      });
      
      return newStatus;
    }
    
    throw new Error('Device not found in RTDB');
  } catch (error) {
    console.error('Error toggling device status:', error);
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
    console.log(`📍 Claiming device ${deviceId} to location ${locationId}`);
    
    // Update device with location and any other updates
    const updateData = {
      Location: locationId,
      ...deviceUpdates
    };
    
    // Only include allowed fields
    const allowedFields = ['AssignedTo', 'DeviceDescription', 'DeviceName', 'DeviceType', 'Location'];
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
      locationId: locationId,
      lastSeen: new Date().toISOString()
    });
    
    console.log('✅ Device claimed successfully');
    return true;
  } catch (error) {
    console.error('Error claiming device:', error);
    throw error;
  }
};

/**
 * Unclaim a device by removing its location
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>} Success indicator
 */
export const unclaimDevice = async (deviceId) => {
  try {
    console.log(`📍 Unclaiming device ${deviceId}`);
    
    // Update device to remove location and clear legacy assignments
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      Location: null,
      AssignedTo: [] // Clear legacy assignments when unclaiming
    });
    
    // Update RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await update(rtdbRef, {
      locationId: '',
      lastSeen: new Date().toISOString()
    });
    
    console.log('✅ Device unclaimed successfully');
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
          const rtdbRef = ref(database, `Devices/${device.id}`);
          const rtdbSnapshot = await get(rtdbRef);
          
          if (rtdbSnapshot.exists()) {
            return {
              ...device,
              status: rtdbSnapshot.val().status || 'OFF',
              lastSeen: rtdbSnapshot.val().lastSeen
            };
          }
          
          return { ...device, status: 'OFF' };
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
 * Get devices in a specific location
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
    
    // Get RTDB status for each device
    const devicesWithStatus = await Promise.all(
      devices.map(async (device) => {
        try {
          const rtdbRef = ref(database, `Devices/${device.id}`);
          const rtdbSnapshot = await get(rtdbRef);
          
          if (rtdbSnapshot.exists()) {
            return {
              ...device,
              status: rtdbSnapshot.val().status || 'OFF',
              lastSeen: rtdbSnapshot.val().lastSeen
            };
          }
          
          return { ...device, status: 'OFF' };
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
 * Move device to a different location
 * @param {string} deviceId - Device ID
 * @param {string} newLocationId - New location ID (null to unclaim)
 * @returns {Promise<boolean>} Success indicator
 */
export const moveDeviceToLocation = async (deviceId, newLocationId) => {
  try {
    console.log(`📍 Moving device ${deviceId} to location ${newLocationId}`);
    
    // Update device location in Firestore
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      Location: newLocationId
    });
    
    // Update location in RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await update(rtdbRef, {
      locationId: newLocationId || '',
      lastSeen: new Date().toISOString()
    });
    
    console.log('✅ Device moved successfully');
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
        AssignedTo: [...currentAssignedTo, userEmail]
      });
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
      AssignedTo: updatedAssignedTo
    });
    
    return true;
  } catch (error) {
    console.error('Error unassigning device from user:', error);
    throw error;
  }
};

// ==============================================================================
// BULK OPERATIONS (Enhanced for Location-Based Access)
// ==============================================================================

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
    
    // Get all devices
    const devices = await getAllDevices();
    
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
    console.log(`🔄 Starting migration for building: ${buildingId}`);
    
    // Get all devices in this building
    const locationsQuery = query(
      collection(firestore, 'LOCATION'),
      where('Building', '==', buildingId)
    );
    const locationsSnapshot = await getDocs(locationsQuery);
    const locationIds = locationsSnapshot.docs.map(doc => doc.id);
    
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
    
    console.log(`✅ Migration completed:`, migrationResults);
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
  
  // Location-based user assignments (NEW)
  assignUserToLocations,
  addLocationToUser,
  removeLocationFromUser,
  getUserAssignedLocations,
  
  // Device operations (simplified)
  getAllDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  toggleDeviceStatus,
  
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
  
  // Bulk operations
  getUserDevicesAndLocations,
  
  // Validation
  validateDeviceExists,
  validateUserExists,
  validateBuildingExists,
  validateLocationExists,
  validateDeviceAvailableForClaiming,
  validateUserHasLocationAccess,
  
  // Migration utilities
  migrateLegacyDeviceAssignments
};