// src/services/deviceService.js - Consolidated Device Management Service

import { firestore, database } from './firebase';
import { 
  notifyDeviceRegistered, 
  notifyParentDeviceClaimed, 
  notifyAdminDeviceAdded,
  notifyDeviceDeleted,
  notifySystemAdminDeviceDeleted 
} from './notificationService';
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
// DEVICE CRUD OPERATIONS
// ==============================================================================

/**
 * Get all devices in the system with status from RTDB
 * @returns {Promise<Array>} Array of all devices with status
 */
export const getAllDevices = async () => {
  try {
    const devicesSnapshot = await getDocs(collection(firestore, 'DEVICE'));
    
    const devices = await Promise.all(
      devicesSnapshot.docs.map(async (deviceDoc) => {
        const deviceData = deviceDoc.data();
        const deviceId = deviceDoc.id;
        
        // Get status from RTDB
        try {
          const rtdbRef = ref(database, `Devices/${deviceId}`);
          const rtdbSnapshot = await get(rtdbRef);
          const rtdbData = rtdbSnapshot.exists() ? rtdbSnapshot.val() : {};
          
          return {
            id: deviceId,
            ...deviceData,
            status: rtdbData.status || 'OFF',
            locationId: rtdbData.locationId || deviceData.Location || ''
          };
        } catch (rtdbError) {
          console.error(`Error getting RTDB status for device ${deviceId}:`, rtdbError);
          return {
            id: deviceId,
            ...deviceData,
            status: 'OFF',
            locationId: deviceData.Location || ''
          };
        }
      })
    );
    
 
    return devices;
  } catch (error) {
    console.error('Error fetching all devices:', error);
    throw new Error('Failed to fetch devices: ' + error.message);
  }
};

/**
 * Get devices accessible to a specific user
 * @param {string} userEmail - User's email
 * @returns {Promise<Object>} Object with devices and locations
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
    const userLocationAssignments = new Map();
    
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
        const locationsQuery = query(
          collection(firestore, 'LOCATION'),
          where('Building', '==', buildingId)
        );
        const locationsSnapshot = await getDocs(locationsQuery);
        
        const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
        const buildingName = buildingDoc.exists() ? 
          (buildingDoc.data().BuildingName || buildingId) : buildingId;
        
        locationsSnapshot.docs.forEach(locationDoc => {
          const locationData = locationDoc.data();
          locations.push({
            id: locationDoc.id,
            ...locationData,
            locationName: locationData.LocationName || locationDoc.id,
            buildingId: locationData.Building,
            buildingName: buildingName,
            userHasAccess: userLocationAssignments.get(buildingId)?.includes(locationDoc.id) || false
          });
        });
        
      } catch (error) {
        console.error(`Error fetching locations for building ${buildingId}:`, error);
      }
    }
    
    // Get all devices with status
    const devices = await getAllDevices();
    
   
    
    return { devices, locations, buildingIds, userLocationAssignments };
  } catch (error) {
    console.error('Error getting user devices and locations:', error);
    throw new Error('Failed to fetch user devices and locations: ' + error.message);
  }
};

/**
 * Get a single device by ID with enriched data
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>} Device data with location details or null if not found
 */
export const getDeviceById = async (deviceId) => {
  try {
 
    
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    
    if (!deviceDoc.exists()) {
 
      return null;
    }
    
    const deviceData = deviceDoc.data();
    const enrichedDevice = await enrichDeviceData(deviceId, deviceData);
    
    console.log('Device data loaded:', enrichedDevice.DeviceName || deviceId);
    return enrichedDevice;
  } catch (error) {

    throw new Error('Failed to fetch device: ' + error.message);
  }
};

/**
 * Check if device exists and is available for claiming
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} Availability result
 */
export const checkDeviceAvailability = async (deviceId) => {
  try {
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    
    if (!deviceDoc.exists()) {
      return {
        exists: false,
        available: false,
        message: 'Device Unavailable.'
      };
    }
    
    const deviceData = deviceDoc.data();
    
    if (deviceData.Location) {
      return {
        exists: true,
        available: false,
        message: 'Device Unavailable.',
        deviceData
      };
    }
    
    return {
      exists: true,
      available: true,
      message: 'Device available for claiming!',
      deviceData
    };
  } catch (error) {
    console.error('Error checking device availability:', error);
    return {
      exists: false,
      available: false,
      message: 'Error checking device. Please try again.'
    };
  }
};

/**
 * Register a new device in the system
 * @param {Object} deviceData - Device registration data
 * @returns {Promise<Object>} Created device data
 */
export const registerDevice = async (deviceData) => {
  try {
    const {
      deviceId,
      deviceName,
      deviceDescription = '',
      deviceType = 'Other',
      location = null,
      userEmail
    } = deviceData;
    
 
    
    // Check if device already exists
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    if (deviceDoc.exists()) {
      throw new Error('Device ID already exists.');
    }
    
    // Create device in Firestore with timestamp fields
    const firestoreData = {
      AssignedTo: [],
      DeviceDescription: deviceDescription,
      DeviceName: deviceName,
      DeviceType: deviceType,
      Location: location,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      onSince: null,
      lastWarningAt: null,
      warningCount: 0
    };
    
    await setDoc(doc(firestore, 'DEVICE', deviceId), firestoreData);
    
    // Create RTDB entry with status and locationId
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await set(rtdbRef, {
      status: 'OFF',
      locationId: location || ''
    });

    // Create energy usage structure
    await createEnergyUsageStructure(deviceId);
    
    // Send notifications
    try {
      await notifyDeviceRegistered(deviceName, deviceId, userEmail);
   
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }


    
    return {
      id: deviceId,
      ...firestoreData
    };
    
  } catch (error) {
    console.error(' Error registering device:', error);
    throw error;
  }
};

/**
 * Claim an existing device by assigning it to a location
 * @param {Object} claimData - Device claim data
 * @returns {Promise<Object>} Updated device data
 */
export const claimDevice = async (claimData) => {
  try {
    const {
      deviceId,
      deviceName,
      deviceDescription = '',
      deviceType = 'Other',
      location,
      userEmail
    } = claimData;
    

    
    // Update device in Firestore
    const updateData = {
      Location: location,
      DeviceName: deviceName,
      DeviceDescription: deviceDescription,
      DeviceType: deviceType,
      lastSeen: serverTimestamp()
    };
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), updateData);
    
    // Update RTDB with locationId
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await update(rtdbRef, {
      locationId: location
    });
    

    
    return updateData;
    
  } catch (error) {
    console.error('Error claiming device:', error);
    throw new Error('Failed to claim device: ' + error.message);
  }
};

/**
 * Update device information
 * @param {string} deviceId - Device ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<boolean>} Success indicator
 */
export const updateDevice = async (deviceId, updateData) => {
  try {
 
    
    if (!updateData.DeviceName?.trim()) {
      throw new Error('Device name is required');
    }
    
    const updates = {
      AssignedTo: updateData.AssignedTo || [],
      DeviceDescription: updateData.DeviceDescription?.trim() || '',
      DeviceName: updateData.DeviceName.trim(),
      DeviceType: updateData.DeviceType?.trim() || 'Other',
      Location: updateData.Location || null,
      lastSeen: serverTimestamp()
    };
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), updates);
    
    // Update RTDB if location changed
    if (updates.Location !== undefined) {
      const rtdbRef = ref(database, `Devices/${deviceId}`);
      await update(rtdbRef, {
        locationId: updates.Location || ''
      });
    }
    
 
    return true;
  } catch (error) {
    throw new Error('Failed to update device: ' + error.message);
  }
};

/**
 * Delete device and all related data
 * @param {string} deviceId - Device ID
 * @param {string} userEmail - User performing deletion
 * @returns {Promise<boolean>} Success indicator
 */
export const deleteDevice = async (deviceId, userEmail) => {
  try {

    
    // Get device data for notifications
    const device = await getDeviceById(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }
    
    // Send notifications before deletion
    if (device.Location && device.locationDetails) {
      try {
        await notifySystemAdminDeviceDeleted(
          device.DeviceName || device.id,
          device.id,
          device.locationDetails.building,
          device.locationDetails.buildingName,
          userEmail
        );

      } catch (notificationError) {
      }
    }
    
    try {
      await notifyDeviceDeleted(device.DeviceName || device.id, device.id, userEmail);
    } catch (notificationError) {
    }
    
    // Delete from Firestore
    await deleteDoc(doc(firestore, 'DEVICE', deviceId));
    
    // Delete from RTDB
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    await remove(rtdbRef);
    
    // Remove energy usage structure
    await removeEnergyUsageStructure(deviceId);
    

    return true;
  } catch (error) {

    throw new Error('Failed to delete device: ' + error.message);
  }
};

/**
 * Toggle device status with automation validation
 * @param {string} deviceId - Device ID
 * @returns {Promise<string>} New device status
 */
export const toggleDeviceStatus = async (deviceId) => {
  try {

    
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    const snapshot = await get(rtdbRef);
    
    let currentStatus = 'OFF';
    if (snapshot.exists()) {
      currentStatus = snapshot.val().status || 'OFF';
    }
    
    const newStatus = currentStatus === 'ON' ? 'OFF' : 'ON';

    
    // Validate device operation against automation lockdown
    if (newStatus === 'ON') {
      const validation = await validateDeviceOperation(deviceId, 'turn-on');
      
      if (!validation.allowed) {

        
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
    
    // Update RTDB status
    await update(rtdbRef, {
      status: newStatus
    });

    // Update Firestore timestamp tracking
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
// DEVICE ACCESS CONTROL
// ==============================================================================

/**
 * Check if user has access to a specific device
 * @param {Object} device - Device data
 * @param {string} userEmail - User's email
 * @returns {Promise<boolean>} True if user has access
 */
export const checkDeviceAccess = async (device, userEmail) => {
  try {

    
    // If device has no location (unclaimed), only SystemAdmin can access
    if (!device.Location) {

      return false;
    }
    
    // Get the building from device location
    const locationDoc = await getDoc(doc(firestore, 'LOCATION', device.Location));
    if (!locationDoc.exists()) {

      return false;
    }
    
    const locationData = locationDoc.data();
    const buildingId = locationData.Building;
    
    // Check user's role in the building
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (userBuildingSnapshot.empty) {
      console.log('No access - user has no role in device building');
      return false;
    }
    
    const userBuildingData = userBuildingSnapshot.docs[0].data();
    const roleInBuilding = userBuildingData.Role;
    
    if (roleInBuilding === 'parent') {
 
      return true;
    }
    
    if (roleInBuilding === 'children') {
      // Check if child is assigned to this device
      const assignedTo = device.AssignedTo || [];
      const hasAccess = assignedTo.includes(userEmail);
      console.log(`${hasAccess ? '✅' : '❌'} Child access ${hasAccess ? 'granted' : 'denied'} - device assignment check`);
      return hasAccess;
    }
    
    return false;
    
  } catch (error) {
    console.error('Error checking device access:', error);
    return false;
  }
};

/**
 * Check if user can control a device (for automation and toggles)
 * @param {Object} device - Device data
 * @param {string} userEmail - User's email
 * @param {Array} locations - Available locations for context
 * @returns {Promise<boolean>} True if user can control device
 */
export const canControlDevice = async (device, userEmail, locations = []) => {
  try {
    if (!userEmail || !device) {
      return false;
    }
    
    // If device is not claimed (no location), no one can control it
    if (!device.Location) {
      return false;
    }
    
    // Check if user is assigned to this device
    const assignedUsers = device.AssignedTo || [];
    if (assignedUsers.includes(userEmail)) {
      return true;
    }
    
    // Check if user is a parent of the building containing this device
    const locationDoc = await getDoc(doc(firestore, 'LOCATION', device.Location));
    
    if (!locationDoc.exists()) {
      return false;
    }

    const locationData = locationDoc.data();
    const deviceBuildingId = locationData.Building;

    // Check if user is a parent of this building
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', deviceBuildingId),
      where('Role', '==', 'parent')
    );

    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    return !userBuildingSnapshot.empty;
    
  } catch (error) {
    console.error('Error checking device control permissions:', error);
    return false;
  }
};

/**
 * Filter devices based on user access permissions
 * @param {Array} allDevices - All devices
 * @param {string} userEmail - User's email
 * @param {Array} locations - User's accessible locations
 * @param {boolean} isSystemAdmin - Whether user is system admin
 * @returns {Promise<Array>} Filtered accessible devices
 */
export const filterAccessibleDevices = async (allDevices, userEmail, locations, isSystemAdmin) => {
  const accessibleDevices = [];
  
  for (const device of allDevices) {
    let hasAccess = false;
    
    // SystemAdmin has access to all devices
    if (isSystemAdmin) {
      hasAccess = true;
    } else if (device.Location) {
      // Device is claimed - check building access
      const location = locations.find(loc => loc.id === device.Location);
      if (location && location.Building) {
        const roleInBuilding = await getUserRoleInBuilding(userEmail, location.Building);
        
        if (roleInBuilding === 'parent') {
          // Parents can see all devices in their buildings
          hasAccess = true;
        } else if (roleInBuilding === 'children') {
          // Children can only see devices they're assigned to
          const assignedTo = device.AssignedTo || [];
          hasAccess = assignedTo.includes(userEmail);
        }
      }
    }
    // Unclaimed devices (no location) are only visible to SystemAdmin
    
    if (hasAccess) {
      accessibleDevices.push(device);
    }
  }
  return accessibleDevices;
};

// ==============================================================================
// DEVICE ASSIGNMENT OPERATIONS
// ==============================================================================

/**
 * Assign user to device
 * @param {string} deviceId - Device ID
 * @param {string} userEmail - User's email to assign
 * @returns {Promise<boolean>} Success indicator
 */
export const assignUserToDevice = async (deviceId, userEmail) => {
  try {

    
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    if (!deviceDoc.exists()) {
      throw new Error('Device not found');
    }
    
    const deviceData = deviceDoc.data();
    const currentAssignedTo = deviceData.AssignedTo || [];
    
    if (currentAssignedTo.includes(userEmail)) {
      throw new Error('User is already assigned to this device');
    }
    
    const updatedAssignedTo = [...currentAssignedTo, userEmail];
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      AssignedTo: updatedAssignedTo,
      lastSeen: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error(`Error assigning user to device:`, error);
    throw error;
  }
};

/**
 * Unassign user from device
 * @param {string} deviceId - Device ID
 * @param {string} userEmail - User's email to unassign
 * @returns {Promise<boolean>} Success indicator
 */
export const unassignUserFromDevice = async (deviceId, userEmail) => {
  try {
 
    
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    if (!deviceDoc.exists()) {
      throw new Error('Device not found');
    }
    
    const deviceData = deviceDoc.data();
    const currentAssignedTo = deviceData.AssignedTo || [];
    const updatedAssignedTo = currentAssignedTo.filter(id => id !== userEmail);
    
    await updateDoc(doc(firestore, 'DEVICE', deviceId), {
      AssignedTo: updatedAssignedTo,
      lastSeen: serverTimestamp()
    });
    
 
    return true;
  } catch (error) {
    console.error(`Error unassigning user from device:`, error);
    throw error;
  }
};

/**
 * Get children users from device's building
 * @param {string} buildingId - Building ID
 * @param {Array} currentAssignedTo - Currently assigned users
 * @returns {Promise<Object>} Object with all, assigned, and available children
 */
export const getBuildingChildren = async (buildingId, currentAssignedTo = []) => {
  try {
    
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', buildingId),
      where('Role', '==', 'children')
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    const allChildren = [];
    for (const userBuilding of userBuildingSnapshot.docs) {
      const userData = userBuilding.data();
      const userDoc = await getDoc(doc(firestore, 'USER', userData.User));
      
      if (userDoc.exists()) {
        allChildren.push({
          id: userData.User,
          ...userDoc.data()
        });
      }
    }
    
    const assigned = allChildren.filter(child => currentAssignedTo.includes(child.id));
    const available = allChildren.filter(child => !currentAssignedTo.includes(child.id));
    
    
    return {
      allChildren,
      assignedChildren: assigned,
      availableChildren: available
    };
    
  } catch (error) {
    console.error('Error fetching building children:', error);
    throw new Error('Failed to fetch building children: ' + error.message);
  }
};

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Enrich device data with location and status information
 * @param {string} deviceId - Device ID
 * @param {Object} deviceData - Raw device data from Firestore
 * @returns {Promise<Object>} Enriched device data
 */
export const enrichDeviceData = async (deviceId, deviceData) => {
  const enrichedDevice = { id: deviceId, ...deviceData };
  
  // Fetch location details if device has location
  if (deviceData.Location) {
    try {
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
      if (locationDoc.exists()) {
        const locationData = locationDoc.data();
        
        // Fetch building name for display
        let buildingName = 'Unknown Building';
        if (locationData.Building) {
          try {
            const buildingDoc = await getDoc(doc(firestore, 'BUILDING', locationData.Building));
            if (buildingDoc.exists()) {
              const buildingData = buildingDoc.data();
              buildingName = buildingData.BuildingName || locationData.Building;
            }
          } catch (buildingError) {
            console.error('Error fetching building details:', buildingError);
          }
        }
        
        enrichedDevice.locationDetails = {
          id: deviceData.Location,
          locationName: locationData.LocationName || deviceData.Location,
          building: locationData.Building || 'Unknown Building',
          buildingName: buildingName
        };
      }
    } catch (locationError) {
      console.error('Error fetching location details:', locationError);
    }
  }
  
  // Get device status from RTDB
  try {
    const rtdbRef = ref(database, `Devices/${deviceId}`);
    const rtdbSnapshot = await get(rtdbRef);
    
    if (rtdbSnapshot.exists()) {
      enrichedDevice.status = rtdbSnapshot.val().status || 'OFF';
      enrichedDevice.locationId = rtdbSnapshot.val().locationId || '';
    } else {
      enrichedDevice.status = 'OFF';
      enrichedDevice.locationId = '';
    }
  } catch (rtdbError) {
    console.error('Error getting RTDB status:', rtdbError);
    enrichedDevice.status = 'OFF';
    enrichedDevice.locationId = '';
  }
  
  return enrichedDevice;
};

/**
 * Get user's role in a specific building
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @returns {Promise<string>} User's role in building
 */
export const getUserRoleInBuilding = async (userEmail, buildingId) => {
  try {
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (!userBuildingSnapshot.empty) {
      const userBuildingData = userBuildingSnapshot.docs[0].data();
      return userBuildingData.Role;
    }
    
    return 'user';
  } catch (error) {
    console.error('Error getting user role in building:', error);
    return 'user';
  }
};

/**
 * Validate device operation against automation lockdown
 * @param {string} deviceId - Device ID
 * @param {string} operation - Operation type ('turn-on', 'turn-off', 'toggle')
 * @returns {Promise<Object>} Validation result
 */
export const validateDeviceOperation = async (deviceId, operation) => {
  try {
 
    
    // Get device RTDB data
    const deviceRef = ref(database, `Devices/${deviceId}`);
    const deviceSnapshot = await get(deviceRef);
    
    if (!deviceSnapshot.exists()) {
      return {
        allowed: false,
        reason: 'Device not found in database',
        code: 'DEVICE_NOT_FOUND'
      };
    }
    
    const deviceData = deviceSnapshot.val();
    const currentStatus = deviceData.status || 'OFF';
    const isLocked = deviceData.locked || false;
    
    // Check if operation is trying to turn device on while locked
    if (isLocked && (operation === 'turn-on' || (operation === 'toggle' && currentStatus === 'OFF'))) {
      return {
        allowed: false,
        reason: 'Turn Off All automation - devices cannot be turned on until automation is disabled',
        code: 'DEVICE_LOCKED',
        currentStatus: currentStatus
      };
    }
    
    return {
      allowed: true,
      reason: 'Operation permitted',
      code: 'OPERATION_ALLOWED',
      currentStatus: currentStatus,
      isLocked: isLocked
    };
    
  } catch (error) {
    console.error('Error validating device operation:', error);
    return {
      allowed: false,
      reason: 'Error validating operation',
      code: 'VALIDATION_ERROR'
    };
  }
};

// ==============================================================================
// ENERGY USAGE OPERATIONS
// ==============================================================================

/**
 * Create energy usage structure for new device
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export const createEnergyUsageStructure = async (deviceId) => {
  try {
   
    
    const today = new Date();
    const dateStr = formatDateForFirestore(today);
    
    // Create empty energy usage document
    await setDoc(doc(firestore, 'ENERGYUSAGE', deviceId, 'DailyUsage', dateStr), {
      Usage: 0
    });
    
  } catch (error) {
    console.error(`Error creating energy usage structure:`, error);
  }
};

/**
 * Remove energy usage structure for device
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export const removeEnergyUsageStructure = async (deviceId) => {
  try {
 
    
    // Get all daily usage documents for this device
    const dailyUsageSnapshot = await getDocs(collection(firestore, 'ENERGYUSAGE', deviceId, 'DailyUsage'));
    
    // Delete all daily usage documents
    const deletePromises = dailyUsageSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

  } catch (error) {
    console.error(`Error removing energy usage structure:`, error);
  }
};

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

/**
 * Format date for Firestore document ID
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string (yyyy-mm-dd)
 */
export const formatDateForFirestore = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format timestamp for display
 * @param {any} timestamp - Firestore timestamp or Date
 * @returns {string} Formatted timestamp
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unknown';
  
  try {
    let date;
    if (timestamp && typeof timestamp.toDate === 'function') {
      // Firestore Timestamp object
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      // JavaScript Date object
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      // ISO string (fallback for compatibility)
      date = new Date(timestamp);
    } else {
      return 'Unknown';
    }
    
    return date.toLocaleString();
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'Unknown';
  }
};

/**
 * Filter devices by search term
 * @param {Array} devices - Array of devices
 * @param {string} searchTerm - Search term
 * @returns {Array} Filtered devices
 */
export const filterDevicesBySearch = (devices, searchTerm) => {
  if (!searchTerm) return devices;
  
  const lowerSearchTerm = searchTerm.toLowerCase();
  
  return devices.filter(device => {
    const deviceName = device.DeviceName || device.id;
    const deviceType = device.DeviceType || '';
    const locationName = device.locationDetails?.locationName || device.Location || '';
    
    const searchText = `${deviceName} ${deviceType} ${locationName}`.toLowerCase();
    return searchText.includes(lowerSearchTerm);
  });
};

/**
 * Filter devices by status
 * @param {Array} devices - Array of devices
 * @param {string} statusFilter - Status filter ('all', 'on', 'off')
 * @returns {Array} Filtered devices
 */
export const filterDevicesByStatus = (devices, statusFilter) => {
  if (statusFilter === 'all') return devices;
  
  return devices.filter(device => {
    const deviceStatus = device.status || 'OFF';
    if (statusFilter === 'on') return deviceStatus === 'ON';
    if (statusFilter === 'off') return deviceStatus === 'OFF';
    return true;
  });
};

/**
 * Filter devices by location
 * @param {Array} devices - Array of devices
 * @param {string} locationFilter - Location filter ('all' or location ID)
 * @returns {Array} Filtered devices
 */
export const filterDevicesByLocation = (devices, locationFilter) => {
  if (locationFilter === 'all') return devices;
  
  return devices.filter(device => device.Location === locationFilter);
};

// ==============================================================================
// DEFAULT EXPORT
// ==============================================================================

export default {
  // Device CRUD
  getAllDevices,
  getUserDevicesAndLocations,
  getDeviceById,
  checkDeviceAvailability,
  registerDevice,
  claimDevice,
  updateDevice,
  deleteDevice,
  toggleDeviceStatus,
  
  // Device access control
  checkDeviceAccess,
  canControlDevice,
  filterAccessibleDevices,
  
  // Device assignments
  assignUserToDevice,
  unassignUserFromDevice,
  getBuildingChildren,
  
  // Helper functions
  enrichDeviceData,
  getUserRoleInBuilding,
  validateDeviceOperation,
  
  // Energy usage
  createEnergyUsageStructure,
  removeEnergyUsageStructure,
  
  // Utilities
  formatDateForFirestore,
  formatTimestamp,
  filterDevicesBySearch,
  filterDevicesByStatus,
  filterDevicesByLocation
};