// src/services/buildingService.js - Consolidated Building Management Service

import { firestore } from './firebase';
import { notifyParentBuildingCreated, notifyParentLocationAdded, notifyBuildingDeleted } from './notificationService';
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

// ==============================================================================
// BUILDING CRUD OPERATIONS
// ==============================================================================

/**
 * Get all buildings in the system (for SystemAdmin)
 * @returns {Promise<Array>} Array of all buildings
 */
export const getAllBuildings = async () => {
  try {
    console.log('🏢 Fetching all buildings in system');
    
    const buildingsSnapshot = await getDocs(collection(firestore, 'BUILDING'));
    
    const buildings = buildingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      userRoleInBuilding: 'admin'
    }));
    
    console.log(`🏢 Found ${buildings.length} total buildings in system`);
    return buildings;
  } catch (error) {
    console.error('❌ Error fetching all buildings:', error);
    throw new Error('Failed to fetch buildings: ' + error.message);
  }
};

/**
 * Get buildings accessible to a specific user
 * @param {string} userEmail - User's email
 * @returns {Promise<Array>} Array of user's accessible buildings
 */
export const getUserBuildings = async (userEmail) => {
  try {
    console.log('🏢 Fetching buildings for user:', userEmail);
    
    const userBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail)
    );
    
    const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
    
    if (userBuildingsSnapshot.empty) {
      console.log('⚠️ User has no building access');
      return [];
    }
    
    console.log('🏢 Found', userBuildingsSnapshot.docs.length, 'building relationships');
    
    const buildings = await Promise.all(
      userBuildingsSnapshot.docs
        .filter(doc => doc.data().Building !== 'SystemAdmin')
        .map(async (userBuildingDoc) => {
          const userBuildingData = userBuildingDoc.data();
          const buildingId = userBuildingData.Building;
          const userRoleInBuilding = userBuildingData.Role;
          
          try {
            const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
            
            if (buildingDoc.exists()) {
              return {
                id: buildingId,
                ...buildingDoc.data(),
                userRoleInBuilding: userRoleInBuilding
              };
            } else {
              console.warn(`⚠️ Building ${buildingId} not found`);
              return null;
            }
          } catch (buildingError) {
            console.error(`❌ Error fetching building ${buildingId}:`, buildingError);
            return null;
          }
        })
    );
    
    const validBuildings = buildings.filter(building => building !== null);
    console.log('🏢 Valid buildings loaded:', validBuildings.length);
    
    return validBuildings;
  } catch (error) {
    console.error('❌ Error fetching user buildings:', error);
    throw new Error('Failed to fetch user buildings: ' + error.message);
  }
};

/**
 * Get a single building by ID
 * @param {string} buildingId - Building ID
 * @returns {Promise<Object|null>} Building data or null if not found
 */
export const getBuildingById = async (buildingId) => {
  try {
    console.log(`🏢 Fetching building: ${buildingId}`);
    
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    
    if (!buildingDoc.exists()) {
      console.log(`❌ Building ${buildingId} not found`);
      return null;
    }
    
    const buildingData = {
      id: buildingId,
      ...buildingDoc.data()
    };
    
    console.log('✅ Building data loaded:', buildingData.BuildingName);
    return buildingData;
  } catch (error) {
    console.error(`❌ Error fetching building ${buildingId}:`, error);
    throw new Error('Failed to fetch building: ' + error.message);
  }
};

/**
 * Check if building ID exists
 * @param {string} buildingId - Building ID to check
 * @returns {Promise<boolean>} True if building exists
 */
export const buildingExists = async (buildingId) => {
  try {
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    return buildingDoc.exists();
  } catch (error) {
    console.error('Error checking building existence:', error);
    return false;
  }
};

/**
 * Create a new building with locations and user assignment
 * @param {Object} buildingData - Building creation data
 * @returns {Promise<Object>} Created building data
 */
export const createBuilding = async (buildingData) => {
  try {
    const {
      deviceId,
      buildingId,
      buildingName,
      buildingAddress = '',
      buildingDescription = '',
      locations = [],
      userEmail
    } = buildingData;
    
    console.log(`🏗️ Creating building: ${buildingName} (${buildingId})`);
    
    // Validate required fields
    if (!deviceId || !buildingId || !buildingName || !userEmail) {
      throw new Error('Missing required fields for building creation');
    }
    
    // Check if building ID already exists
    const exists = await buildingExists(buildingId);
    if (exists) {
      throw new Error('Building ID already exists');
    }
    
    // Validate device availability
    const deviceValidation = await validateDeviceForBuilding(deviceId);
    if (!deviceValidation.available) {
      throw new Error(deviceValidation.reason || 'Device unavailable');
    }
    
    const timestamp = serverTimestamp();
    const now = new Date();
    const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    
    // 1. Create building
    await setDoc(doc(firestore, 'BUILDING', buildingId), {
      BuildingName: buildingName,
      Address: buildingAddress,
      Description: buildingDescription,
      CreatedAt: timestamp,
      DateCreated: dateCreated,
      CreatedBy: userEmail
    });
    
    // 2. Create user-building relationship (parent role)
    const userBuildingId = `${userEmail.replace(/\./g, '_')}_${buildingId}`;
    await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
      User: userEmail,
      Building: buildingId,
      Role: 'parent',
      CreatedAt: timestamp
    });
    
    // 3. Create locations
    const createdLocations = [];
    for (const location of locations) {
      if (location.name?.trim()) {
        const locationId = location.id || `${buildingId}${location.name.replace(/\s+/g, '')}`;
        
        await setDoc(doc(firestore, 'LOCATION', locationId), {
          Building: buildingId,
          LocationName: location.name,
          DateCreated: dateCreated
        });
        
        createdLocations.push({
          id: locationId,
          name: location.name
        });
      }
    }
    
    // 4. Assign device to first location if locations exist
    if (createdLocations.length > 0) {
      await assignDeviceToLocation(deviceId, createdLocations[0].id);
    }
    
    // 5. Send notification
    try {
      await notifyParentBuildingCreated(userEmail, buildingName, buildingId);
      console.log('📢 Building creation notification sent');
    } catch (notificationError) {
      console.error('❌ Failed to send building creation notification:', notificationError);
    }
    
    console.log(`✅ Building ${buildingName} created successfully`);
    
    return {
      id: buildingId,
      BuildingName: buildingName,
      Address: buildingAddress,
      Description: buildingDescription,
      CreatedBy: userEmail,
      locations: createdLocations
    };
    
  } catch (error) {
    console.error('❌ Error creating building:', error);
    throw error;
  }
};

/**
 * Update building information
 * @param {string} buildingId - Building ID
 * @param {Object} updateData - Data to update
 * @param {string} userEmail - User making the update
 * @returns {Promise<boolean>} Success indicator
 */
export const updateBuilding = async (buildingId, updateData, userEmail) => {
  try {
    console.log(`💾 Updating building ${buildingId}`);
    
    if (!updateData.BuildingName?.trim()) {
      throw new Error('Building name is required');
    }
    
    const updates = {
      BuildingName: updateData.BuildingName.trim(),
      Address: updateData.Address?.trim() || '',
      Description: updateData.Description?.trim() || '',
      LastModified: serverTimestamp(),
      LastModifiedBy: userEmail
    };
    
    await updateDoc(doc(firestore, 'BUILDING', buildingId), updates);
    
    console.log(`✅ Building ${buildingId} updated successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error updating building ${buildingId}:`, error);
    throw new Error('Failed to update building: ' + error.message);
  }
};

/**
 * Delete building and all related data
 * @param {string} buildingId - Building ID
 * @param {string} userEmail - User performing deletion
 * @returns {Promise<boolean>} Success indicator
 */
export const deleteBuilding = async (buildingId, userEmail) => {
  try {
    console.log(`🗑️ Deleting building ${buildingId}`);
    
    // Get building data for notification
    const building = await getBuildingById(buildingId);
    if (!building) {
      throw new Error('Building not found');
    }
    
    // Get all locations and devices before deletion
    const locations = await getBuildingLocations(buildingId);
    const devices = await getBuildingDevices(buildingId);
    
    // Send notification before deletion
    try {
      await notifyBuildingDeleted(buildingId, building.BuildingName || buildingId, userEmail);
      console.log('📢 Building deletion notifications sent');
    } catch (notificationError) {
      console.error('❌ Failed to send deletion notifications:', notificationError);
    }
    
    // Delete all locations
    for (const location of locations) {
      await deleteDoc(doc(firestore, 'LOCATION', location.id));
    }
    
    // Delete user-building relationships
    const userBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', buildingId)
    );
    const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
    
    for (const userBuildingDoc of userBuildingsSnapshot.docs) {
      await deleteDoc(userBuildingDoc.ref);
    }
    
    // Unassign devices (remove location assignment)
    for (const device of devices) {
      await updateDoc(doc(firestore, 'DEVICE', device.id), {
        Location: null
      });
    }
    
    // Delete the building
    await deleteDoc(doc(firestore, 'BUILDING', buildingId));
    
    console.log(`✅ Building ${buildingId} deleted successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting building ${buildingId}:`, error);
    throw new Error('Failed to delete building: ' + error.message);
  }
};

// ==============================================================================
// LOCATION MANAGEMENT
// ==============================================================================

/**
 * Get all locations in a building
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of locations
 */
export const getBuildingLocations = async (buildingId) => {
  try {
    console.log(`📍 Fetching locations for building: ${buildingId}`);
    
    const locationsQuery = query(
      collection(firestore, 'LOCATION'),
      where('Building', '==', buildingId)
    );
    const locationsSnapshot = await getDocs(locationsQuery);
    
    const locations = locationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📍 Found ${locations.length} locations`);
    return locations;
  } catch (error) {
    console.error(`❌ Error fetching locations for building ${buildingId}:`, error);
    throw new Error('Failed to fetch locations: ' + error.message);
  }
};

/**
 * Add a new location to a building
 * @param {string} buildingId - Building ID
 * @param {string} locationName - Location name
 * @param {string} userEmail - User adding the location
 * @returns {Promise<Object>} Created location data
 */
export const addBuildingLocation = async (buildingId, locationName, userEmail) => {
  try {
    console.log(`📍 Adding location "${locationName}" to building ${buildingId}`);
    
    if (!locationName?.trim()) {
      throw new Error('Location name is required');
    }
    
    const now = new Date();
    const dateCreated = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    const locationId = `${buildingId}${locationName.replace(/\s+/g, '')}`;
    
    // Check if location already exists
    const existingLocationDoc = await getDoc(doc(firestore, 'LOCATION', locationId));
    if (existingLocationDoc.exists()) {
      throw new Error('A location with this name already exists in this building');
    }
    
    // Create location
    await setDoc(doc(firestore, 'LOCATION', locationId), {
      Building: buildingId,
      LocationName: locationName.trim(),
      DateCreated: dateCreated
    });
    
    // Send notification
    try {
      const building = await getBuildingById(buildingId);
      await notifyParentLocationAdded(
        userEmail,
        locationName,
        building?.BuildingName || buildingId
      );
      console.log('📢 Location addition notification sent');
    } catch (notificationError) {
      console.error('❌ Failed to send location addition notification:', notificationError);
    }
    
    const createdLocation = {
      id: locationId,
      Building: buildingId,
      LocationName: locationName.trim(),
      DateCreated: dateCreated
    };
    
    console.log(`✅ Location "${locationName}" added successfully`);
    return createdLocation;
  } catch (error) {
    console.error(`❌ Error adding location to building ${buildingId}:`, error);
    throw error;
  }
};

/**
 * Remove a location from a building
 * @param {string} locationId - Location ID
 * @param {string} buildingId - Building ID
 * @returns {Promise<boolean>} Success indicator
 */
export const removeBuildingLocation = async (locationId, buildingId) => {
  try {
    console.log(`📍 Removing location ${locationId} from building ${buildingId}`);
    
    // Check if location has devices
    const devicesQuery = query(
      collection(firestore, 'DEVICE'),
      where('Location', '==', locationId)
    );
    const devicesSnapshot = await getDocs(devicesQuery);
    
    if (!devicesSnapshot.empty) {
      throw new Error(`Cannot remove this location. It contains ${devicesSnapshot.size} device(s). Move or delete the devices first.`);
    }
    
    // Check if location has assigned users
    const userBuildingsQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', buildingId)
    );
    const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
    
    for (const userBuildingDoc of userBuildingsSnapshot.docs) {
      const userData = userBuildingDoc.data();
      const assignedLocations = userData.AssignedLocations || [];
      if (assignedLocations.includes(locationId)) {
        throw new Error('Cannot remove this location. Some users are assigned to it. Remove user assignments first.');
      }
    }
    
    // Delete location
    await deleteDoc(doc(firestore, 'LOCATION', locationId));
    
    console.log(`✅ Location ${locationId} removed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error removing location ${locationId}:`, error);
    throw error;
  }
};

// ==============================================================================
// DEVICE MANAGEMENT
// ==============================================================================

/**
 * Get all devices in a building
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of devices
 */
export const getBuildingDevices = async (buildingId) => {
  try {
    console.log(`📱 Fetching devices for building: ${buildingId}`);
    
    const locations = await getBuildingLocations(buildingId);
    const devicesList = [];
    
    for (const location of locations) {
      const devicesQuery = query(
        collection(firestore, 'DEVICE'),
        where('Location', '==', location.id)
      );
      
      const devicesSnapshot = await getDocs(devicesQuery);
      devicesSnapshot.docs.forEach(doc => {
        devicesList.push({
          id: doc.id,
          ...doc.data(),
          locationName: location.LocationName || location.id
        });
      });
    }
    
    console.log(`📱 Found ${devicesList.length} devices in building`);
    return devicesList;
  } catch (error) {
    console.error(`❌ Error fetching devices for building ${buildingId}:`, error);
    throw new Error('Failed to fetch building devices: ' + error.message);
  }
};

/**
 * Validate device availability for building creation
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} Validation result
 */
export const validateDeviceForBuilding = async (deviceId) => {
  try {
    console.log(`🔍 Validating device ${deviceId} for building creation`);
    
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    
    if (!deviceDoc.exists()) {
      return {
        available: false,
        exists: false,
        reason: 'Device Unavailable'
      };
    }
    
    const deviceData = deviceDoc.data();
    
    // Check if device is already assigned to a location with a parent
    if (deviceData.Location) {
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', deviceData.Location));
      
      if (locationDoc.exists()) {
        const locationData = locationDoc.data();
        const deviceBuildingId = locationData.Building;
        
        // Check if this building already has a parent
        const parentQuery = query(
          collection(firestore, 'USERBUILDING'),
          where('Building', '==', deviceBuildingId),
          where('Role', '==', 'parent')
        );
        
        const parentSnapshot = await getDocs(parentQuery);
        
        if (!parentSnapshot.empty) {
          return {
            available: false,
            exists: true,
            reason: 'Device Unavailable'
          };
        }
      }
    }
    
    console.log(`✅ Device ${deviceId} is available for building creation`);
    return {
      available: true,
      exists: true,
      reason: 'Device available'
    };
  } catch (error) {
    console.error(`❌ Error validating device ${deviceId}:`, error);
    return {
      available: false,
      exists: false,
      reason: 'Error validating device'
    };
  }
};

/**
 * Assign device to a location
 * @param {string} deviceId - Device ID
 * @param {string} locationId - Location ID
 * @returns {Promise<boolean>} Success indicator
 */
export const assignDeviceToLocation = async (deviceId, locationId) => {
  try {
    console.log(`📱 Assigning device ${deviceId} to location ${locationId}`);
    
    const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
    if (!deviceDoc.exists()) {
      throw new Error('Device not found');
    }
    
    const currentDeviceData = deviceDoc.data();
    
    await setDoc(doc(firestore, 'DEVICE', deviceId), {
      ...currentDeviceData,
      Location: locationId
    });
    
    console.log(`✅ Device ${deviceId} assigned to location ${locationId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error assigning device ${deviceId} to location ${locationId}:`, error);
    throw new Error('Failed to assign device: ' + error.message);
  }
};

// ==============================================================================
// USER ROLE AND ACCESS MANAGEMENT
// ==============================================================================

/**
 * Get user's role in a specific building
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @returns {Promise<string>} User's role in building
 */
export const getUserRoleInBuilding = async (userEmail, buildingId) => {
  try {
    console.log(`👤 Getting user role for ${userEmail} in building ${buildingId}`);
    
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (!userBuildingSnapshot.empty) {
      const userBuildingData = userBuildingSnapshot.docs[0].data();
      const role = userBuildingData.Role;
      console.log(`👤 User role in building ${buildingId}: ${role}`);
      return role;
    }
    
    console.log(`❌ User has no access to building ${buildingId}`);
    return 'user';
  } catch (error) {
    console.error('❌ Error getting user role in building:', error);
    return 'user';
  }
};

/**
 * Get children users in a building
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of children users
 */
export const getBuildingChildren = async (buildingId) => {
  try {
    console.log(`👶 Fetching children for building: ${buildingId}`);
    
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', buildingId),
      where('Role', '==', 'children')
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    const children = [];
    for (const userBuilding of userBuildingSnapshot.docs) {
      const userData = userBuilding.data();
      const userDoc = await getDoc(doc(firestore, 'USER', userData.User));
      
      if (userDoc.exists()) {
        children.push({
          id: userData.User,
          userBuildingId: userBuilding.id,
          assignedLocations: userData.AssignedLocations || [],
          ...userDoc.data()
        });
      }
    }
    
    console.log(`👶 Found ${children.length} children in building`);
    return children;
  } catch (error) {
    console.error(`❌ Error fetching children for building ${buildingId}:`, error);
    throw new Error('Failed to fetch building children: ' + error.message);
  }
};

/**
 * Get user's assigned locations in a building
 * @param {string} userEmail - User's email
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of assigned location IDs
 */
export const getUserAssignedLocations = async (userEmail, buildingId) => {
  try {
    console.log(`📍 Getting assigned locations for ${userEmail} in building ${buildingId}`);
    
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail),
      where('Building', '==', buildingId)
    );
    
    const userBuildingSnapshot = await getDocs(userBuildingQuery);
    
    if (!userBuildingSnapshot.empty) {
      const userData = userBuildingSnapshot.docs[0].data();
      const assignedLocations = userData.AssignedLocations || [];
      console.log(`📍 User assigned to ${assignedLocations.length} locations`);
      return assignedLocations;
    }
    
    console.log(`📍 User has no assigned locations`);
    return [];
  } catch (error) {
    console.error('❌ Error getting user assigned locations:', error);
    return [];
  }
};

/**
 * Remove child user from building
 * @param {string} childEmail - Child's email
 * @param {string} buildingId - Building ID
 * @returns {Promise<boolean>} Success indicator
 */
export const removeChildFromBuilding = async (childEmail, buildingId) => {
  try {
    console.log(`👶 Removing child ${childEmail} from building ${buildingId}`);
    
    const userBuildingId = `${childEmail.replace(/\./g, '_')}_${buildingId}`;
    await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingId));
    
    console.log(`✅ Child ${childEmail} removed from building successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error removing child from building:`, error);
    throw new Error('Failed to remove child from building: ' + error.message);
  }
};

// ==============================================================================
// EMAIL VALIDATION FOR INVITATIONS
// ==============================================================================

/**
 * Check if email is available for building invitation
 * @param {string} email - Email to check
 * @param {string} buildingId - Building ID
 * @returns {Promise<Object>} Validation result
 */
export const checkEmailAvailability = async (email, buildingId) => {
  try {
    if (!email || !email.includes('@')) {
      return {
        checking: false,
        exists: false,
        available: false,
        message: 'Invalid email format'
      };
    }
    
    const trimmedEmail = email.trim();
    
    // Check if user exists in the system
    const userDoc = await getDoc(doc(firestore, 'USER', trimmedEmail));
    
    if (!userDoc.exists()) {
      return {
        checking: false,
        exists: false,
        available: false,
        message: 'User not found'
      };
    }
    
    // Check if user already has access to this building
    const existingUserQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', trimmedEmail),
      where('Building', '==', buildingId)
    );
    
    const existingUserSnapshot = await getDocs(existingUserQuery);
    
    if (!existingUserSnapshot.empty) {
      return {
        checking: false,
        exists: true,
        available: false,
        message: 'Already has access'
      };
    }
    
    // User exists and is available
    return {
      checking: false,
      exists: true,
      available: true,
      message: 'Available to invite'
    };
    
  } catch (error) {
    console.error('Error checking email availability:', error);
    return {
      checking: false,
      exists: false,
      available: false,
      message: 'Error checking email'
    };
  }
};

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

/**
 * Sort buildings alphabetically by name
 * @param {Array} buildings - Array of buildings
 * @returns {Array} Sorted buildings
 */
export const sortBuildingsAlphabetically = (buildings) => {
  return buildings.sort((a, b) => {
    const nameA = a.BuildingName || a.id;
    const nameB = b.BuildingName || b.id;
    return nameA.localeCompare(nameB);
  });
};

/**
 * Filter buildings by search term
 * @param {Array} buildings - Array of buildings
 * @param {string} searchTerm - Search term
 * @returns {Array} Filtered buildings
 */
export const filterBuildingsBySearch = (buildings, searchTerm) => {
  if (!searchTerm) return buildings;
  
  const lowerSearchTerm = searchTerm.toLowerCase();
  
  return buildings.filter(building => {
    const buildingName = building.BuildingName || building.id;
    const buildingAddress = building.Address || '';
    const createdBy = building.CreatedBy || '';
    
    return buildingName.toLowerCase().includes(lowerSearchTerm) ||
           buildingAddress.toLowerCase().includes(lowerSearchTerm) ||
           createdBy.toLowerCase().includes(lowerSearchTerm) ||
           building.id.toLowerCase().includes(lowerSearchTerm);
  });
};

/**
 * Format date for display
 * @param {string|Object} dateStr - Date string or Firestore timestamp
 * @returns {string} Formatted date
 */
export const formatBuildingDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  
  if (typeof dateStr === 'object' && dateStr.toDate) {
    return dateStr.toDate().toLocaleDateString();
  }
  
  if (typeof dateStr === 'string') {
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const date = new Date(parts[2], parts[1] - 1, parts[0]);
        return date.toLocaleDateString();
      }
    }
    return new Date(dateStr).toLocaleDateString();
  }
  
  return dateStr;
};

// ==============================================================================
// DEFAULT EXPORT
// ==============================================================================

export default {
  // Building CRUD
  getAllBuildings,
  getUserBuildings,
  getBuildingById,
  buildingExists,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  
  // Location management
  getBuildingLocations,
  addBuildingLocation,
  removeBuildingLocation,
  
  // Device management
  getBuildingDevices,
  validateDeviceForBuilding,
  assignDeviceToLocation,
  
  // User management
  getUserRoleInBuilding,
  getBuildingChildren,
  getUserAssignedLocations,
  removeChildFromBuilding,
  
  // Email validation
  checkEmailAvailability,
  
  // Utilities
  sortBuildingsAlphabetically,
  filterBuildingsBySearch,
  formatBuildingDate
};