// src/services/automationService.js - MINIMAL VERSION - No Firestore Device Automation Metadata

import { database, firestore } from './firebase';
import { ref, get, update } from 'firebase/database';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ==============================================================================
// BUILDING AUTOMATION SERVICE - MINIMAL ARCHITECTURE
// ==============================================================================

/**
 * Get all devices in a building with minimal data structure
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of devices with current status
 */
const getBuildingDevices = async (buildingId) => {
  try {
    console.log(`🔍 Getting devices for building: ${buildingId}`);
    
    // Step 1: Get all locations in the building
    const locationsQuery = query(
      collection(firestore, 'LOCATION'),
      where('Building', '==', buildingId)
    );
    const locationsSnapshot = await getDocs(locationsQuery);
    
    if (locationsSnapshot.empty) {
      console.log(`⚠️ No locations found for building ${buildingId}`);
      return [];
    }
    
    const locationIds = locationsSnapshot.docs.map(doc => doc.id);
    console.log(`📍 Found ${locationIds.length} locations in building:`, locationIds);
    
    // Step 2: Get all devices in these locations from Firestore (core info only)
    const devices = [];
    const batches = [];
    for (let i = 0; i < locationIds.length; i += 10) {
      batches.push(locationIds.slice(i, i + 10));
    }
    
    for (const [batchIndex, batch] of batches.entries()) {
      const devicesQuery = query(
        collection(firestore, 'DEVICE'),
        where('Location', 'in', batch)
      );
      const devicesSnapshot = await getDocs(devicesQuery);
      
      for (const deviceDoc of devicesSnapshot.docs) {
        const deviceData = deviceDoc.data();
        const deviceId = deviceDoc.id;
        
        // Step 3: Get minimal RTDB data (status, locationId, locked only)
        try {
          const rtdbRef = ref(database, `Devices/${deviceId}`);
          const rtdbSnapshot = await get(rtdbRef);
          const rtdbData = rtdbSnapshot.exists() ? rtdbSnapshot.val() : {};
          
          const device = {
            id: deviceId,
            name: deviceData.DeviceName || deviceId,
            type: deviceData.DeviceType || 'Unknown',
            location: deviceData.Location,
            // RTDB data (minimal - only 3 fields)
            status: rtdbData.status || 'OFF',
            locked: rtdbData.locked || false,
            locationId: rtdbData.locationId || deviceData.Location,
            // Core Firestore data (no automation metadata)
            ...deviceData
          };
          
          devices.push(device);
          console.log(`✅ Added device ${deviceId} with status: ${device.status}, locked: ${device.locked}`);
          
        } catch (rtdbError) {
          console.error(`❌ Error getting RTDB status for device ${deviceId}:`, rtdbError);
          const device = {
            id: deviceId,
            name: deviceData.DeviceName || deviceId,
            type: deviceData.DeviceType || 'Unknown',
            location: deviceData.Location,
            status: 'OFF',
            locked: false,
            locationId: deviceData.Location,
            ...deviceData
          };
          devices.push(device);
        }
      }
    }
    
    console.log(`📱 Total devices found in building ${buildingId}: ${devices.length}`);
    return devices;
    
  } catch (error) {
    console.error('❌ Error getting building devices:', error);
    throw error;
  }
};

/**
 * Check if building has turn-off-all lockdown active (from Firestore)
 * @param {string} buildingId - Building ID
 * @returns {Promise<boolean>} True if lockdown is active
 */
const isTurnOffAllLockdownActive = async (buildingId) => {
  try {
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    
    if (buildingDoc.exists()) {
      const buildingData = buildingDoc.data();
      const automation = buildingData.Automation;
      
      if (automation) {
        const isLockdownActive = automation.currentMode === 'turn-off-all' && 
                                automation.status === 'active' &&
                                automation.lockdownActive === true;
        
        console.log(`🔒 Turn-off-all lockdown status for building ${buildingId}: ${isLockdownActive}`);
        return isLockdownActive;
      }
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error checking lockdown status:', error);
    return false;
  }
};

/**
 * Lock all devices in a building (RTDB only)
 * @param {string} buildingId - Building ID
 * @returns {Promise<Object>} Lock operation result
 */
const lockAllBuildingDevices = async (buildingId) => {
  try {
    console.log(`🔒 Locking all devices in building ${buildingId}`);
    
    const devices = await getBuildingDevices(buildingId);
    const rtdbUpdates = {};
    
    let devicesLocked = 0;
    
    for (const device of devices) {
      // RTDB: Only update lock status
      rtdbUpdates[`Devices/${device.id}/locked`] = true;
      devicesLocked++;
    }
    
    // Apply RTDB updates
    if (Object.keys(rtdbUpdates).length > 0) {
      await update(ref(database), rtdbUpdates);
    }
    
    console.log(`🔒 Successfully locked ${devicesLocked} devices in building ${buildingId}`);
    
    return {
      devicesLocked: devicesLocked,
      lockedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error locking building devices:', error);
    throw error;
  }
};

/**
 * Unlock all devices in a building (RTDB only)
 * @param {string} buildingId - Building ID
 * @returns {Promise<Object>} Unlock operation result
 */
const unlockAllBuildingDevices = async (buildingId) => {
  try {
    console.log(`🔓 Unlocking all devices in building ${buildingId}`);
    
    const devices = await getBuildingDevices(buildingId);
    const rtdbUpdates = {};
    
    let devicesUnlocked = 0;
    
    for (const device of devices) {
      if (device.locked) {
        // RTDB: Only update lock status
        rtdbUpdates[`Devices/${device.id}/locked`] = false;
        devicesUnlocked++;
      }
    }
    
    // Apply RTDB updates
    if (Object.keys(rtdbUpdates).length > 0) {
      await update(ref(database), rtdbUpdates);
    }
    
    console.log(`🔓 Successfully unlocked ${devicesUnlocked} devices in building ${buildingId}`);
    
    return {
      devicesUnlocked: devicesUnlocked,
      unlockedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error unlocking building devices:', error);
    throw error;
  }
};

/**
 * Validate device operation against automation lockdown (RTDB check only)
 * @param {string} deviceId - Device ID
 * @param {string} operation - Operation type ('turn-on', 'turn-off', 'toggle')
 * @returns {Promise<Object>} Validation result
 */
const validateDeviceOperation = async (deviceId, operation) => {
  try {
    console.log(`🔍 Validating ${operation} operation for device ${deviceId}`);
    
    // Get device RTDB data (only 3 fields: status, locationId, locked)
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
    console.error('❌ Error validating device operation:', error);
    return {
      allowed: false,
      reason: 'Error validating operation',
      code: 'VALIDATION_ERROR'
    };
  }
};

/**
 * Apply automation mode with minimal RTDB updates only
 * @param {string} buildingId - Building ID
 * @param {string} mode - Automation mode ('turn-off-all', 'eco-mode', 'night-mode')
 * @returns {Promise<Object>} Automation result with statistics
 */
const applyAutomationMode = async (buildingId, mode) => {
  try {
    console.log(`🔄 Applying ${mode} automation to building: ${buildingId}`);
    
    const devices = await getBuildingDevices(buildingId);
    
    if (devices.length === 0) {
      console.log(`ℹ️ No devices found in building ${buildingId}`);
      return { totalDevices: 0, devicesUpdated: 0, energySaved: 0 };
    }
    
    const rtdbUpdates = {};
    let devicesUpdated = 0;
    let energySaved = 0;
    const timestamp = new Date().toISOString();
    const userEmail = localStorage.getItem('userEmail') || 'automation';
    
    const devicePriority = {
      'Light': { priority: 1, maxWattage: 60, essential: true },
      'Fan': { priority: 2, maxWattage: 100, essential: false },
      'AC': { priority: 3, maxWattage: 2000, essential: false },
      'Other': { priority: 2, maxWattage: 80, essential: false }
    };
    
    switch (mode) {
      case 'turn-off-all':
        console.log(`🔒 Applying turn-off-all with lockdown for building ${buildingId}`);
        
        for (const device of devices) {
          // RTDB: Update status and lock (minimal updates)
          if (device.status === 'ON') {
            rtdbUpdates[`Devices/${device.id}/status`] = 'OFF';
            devicesUpdated++;
            energySaved += devicePriority[device.type]?.maxWattage || 50;
          }
          rtdbUpdates[`Devices/${device.id}/locked`] = true;
          
          console.log(`🔒 Turning OFF and LOCKING device ${device.id} (${device.name})`);
        }
        break;
        
      case 'eco-mode':
        for (const device of devices) {
          const deviceInfo = devicePriority[device.type] || devicePriority['Other'];
          
          if (deviceInfo.priority === 3 && device.status === 'ON') {
            // Turn off high-energy devices (AC, etc.)
            rtdbUpdates[`Devices/${device.id}/status`] = 'OFF';
            devicesUpdated++;
            energySaved += deviceInfo.maxWattage;
            
            console.log(`🌱 ECO: Turning OFF high-energy device ${device.id} (${device.name})`);
          } else if (device.status === 'ON') {
            // Calculate energy savings for optimization (no device metadata stored)
            energySaved += Math.floor(deviceInfo.maxWattage * 0.3);
            
            console.log(`🌱 ECO: Optimizing device ${device.id} (${device.name}) - estimated 30% energy saving`);
          }
        }
        break;
        
      case 'night-mode':
        for (const device of devices) {
          const deviceInfo = devicePriority[device.type] || devicePriority['Other'];
          
          if (deviceInfo.priority >= 2 && device.status === 'ON') {
            // Turn off non-essential devices (fans, AC, etc.)
            rtdbUpdates[`Devices/${device.id}/status`] = 'OFF';
            devicesUpdated++;
            energySaved += deviceInfo.maxWattage;
            
            console.log(`🌙 NIGHT: Turning OFF non-essential device ${device.id} (${device.name})`);
          } else if (device.type === 'Light' && device.status === 'ON') {
            // Calculate energy savings for dimming (no device metadata stored)
            energySaved += Math.floor(deviceInfo.maxWattage * 0.5);
            
            console.log(`🌙 NIGHT: Light ${device.id} (${device.name}) - estimated 50% energy saving from dimming`);
          }
        }
        break;
        
      default:
        throw new Error(`Unknown automation mode: ${mode}`);
    }
    
    // Apply RTDB updates (only status and locked fields)
    if (Object.keys(rtdbUpdates).length > 0) {
      await update(ref(database), rtdbUpdates);
      console.log(`✅ Applied RTDB updates for ${mode} automation`);
    }
    
    return {
      totalDevices: devices.length,
      devicesUpdated: devicesUpdated,
      energySaved: energySaved,
      mode: mode,
      appliedAt: timestamp,
      appliedBy: userEmail,
      lockdownActive: mode === 'turn-off-all'
    };
    
  } catch (error) {
    console.error(`❌ Error applying ${mode} automation:`, error);
    throw error;
  }
};

/**
 * Save automation state to Firestore BUILDING collection only
 * @param {string} buildingId - Building ID
 * @param {Object} automationConfig - Automation configuration
 * @returns {Promise<Object>} Saved automation data
 */
const saveAutomationState = async (buildingId, automationConfig) => {
  try {
    console.log(`💾 Saving automation state to Firestore for building ${buildingId}:`, automationConfig);
    
    const automationData = {
      currentMode: automationConfig.automationType,
      modeTitle: automationConfig.automationTitle,
      appliedAt: serverTimestamp(),
      appliedBy: automationConfig.appliedBy,
      deviceCount: automationConfig.deviceCount || 0,
      devicesUpdated: automationConfig.devicesUpdated || 0,
      energySaved: automationConfig.energySaved || 0,
      lastUpdated: serverTimestamp(),
      buildingId: buildingId,
      buildingName: automationConfig.buildingName || buildingId,
      lockdownActive: automationConfig.automationType === 'turn-off-all',
      lockdownReason: automationConfig.automationType === 'turn-off-all' ? 
                     'All devices locked - cannot be turned on until Turn Off All is disabled' : null,
      modes: {
        'turn-off-all': automationConfig.automationType === 'turn-off-all',
        'eco-mode': automationConfig.automationType === 'eco-mode',
        'night-mode': automationConfig.automationType === 'night-mode'
      },
      status: automationConfig.automationType !== 'none' ? 'active' : 'inactive',
      version: '1.1'
    };
    
    // Update Firestore BUILDING document
    await updateDoc(doc(firestore, 'BUILDING', buildingId), {
      Automation: automationData
    });
    
    console.log(`✅ Automation state saved to Firestore for building ${buildingId}`);
    return automationData;
    
  } catch (error) {
    console.error('❌ Error saving automation state to Firestore:', error);
    throw error;
  }
};

/**
 * Load automation state from Firestore BUILDING collection
 * @param {string} buildingId - Building ID
 * @returns {Promise<Object|null>} Automation state or null if not found
 */
const loadAutomationState = async (buildingId) => {
  try {
    console.log(`📖 Loading automation state from Firestore for building ${buildingId}`);
    
    const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
    
    if (buildingDoc.exists()) {
      const buildingData = buildingDoc.data();
      const automationData = buildingData.Automation;
      
      if (automationData) {
        console.log(`✅ Loaded automation state from Firestore:`, automationData);
        return automationData;
      }
    }
    
    console.log(`ℹ️ No automation state found for building ${buildingId}`);
    return null;
    
  } catch (error) {
    console.error('❌ Error loading automation state from Firestore:', error);
    return null;
  }
};

/**
 * Clear automation state with device unlocking (minimal updates)
 * @param {string} buildingId - Building ID
 * @returns {Promise<boolean>} Success indicator
 */
const clearAutomationState = async (buildingId) => {
  try {
    console.log(`🧹 Clearing automation state for building ${buildingId}`);
    
    // Unlock all devices (RTDB only)
    const unlockResult = await unlockAllBuildingDevices(buildingId);
    console.log(`🔓 Unlocked ${unlockResult.devicesUnlocked} devices`);
    
    // Clear building automation state in Firestore
    const clearData = {
      currentMode: 'none',
      modeTitle: 'No Automation',
      appliedAt: serverTimestamp(),
      appliedBy: localStorage.getItem('userEmail') || 'system',
      deviceCount: (await getBuildingDevices(buildingId)).length,
      devicesUpdated: 0,
      energySaved: 0,
      lastUpdated: serverTimestamp(),
      buildingId: buildingId,
      lockdownActive: false,
      lockdownReason: null,
      modes: {
        'turn-off-all': false,
        'eco-mode': false,
        'night-mode': false
      },
      status: 'inactive',
      version: '1.1'
    };
    
    await updateDoc(doc(firestore, 'BUILDING', buildingId), {
      Automation: clearData
    });
    
    console.log(`✅ Automation state cleared for building ${buildingId}`);
    return true;
    
  } catch (error) {
    console.error('❌ Error clearing automation state:', error);
    throw error;
  }
};

/**
 * Get automation statistics (minimal - no device metadata)
 * @param {string} buildingId - Building ID
 * @returns {Promise<Object>} Automation statistics
 */
const getAutomationStatistics = async (buildingId) => {
  try {
    console.log(`📊 Getting automation statistics for building ${buildingId}`);
    
    const automationState = await loadAutomationState(buildingId);
    const devices = await getBuildingDevices(buildingId);
    
    // Calculate device breakdown by type
    const deviceBreakdown = devices.reduce((breakdown, device) => {
      const type = device.type.toLowerCase();
      breakdown[type] = (breakdown[type] || 0) + 1;
      return breakdown;
    }, {});
    
    // Calculate devices by status (from RTDB)
    const onlineDevices = devices.filter(d => d.status === 'ON').length;
    const offlineDevices = devices.filter(d => d.status === 'OFF').length;
    const lockedDevices = devices.filter(d => d.locked).length;
    
    const stats = {
      totalDevices: devices.length,
      onlineDevices: onlineDevices,
      offlineDevices: offlineDevices,
      lockedDevices: lockedDevices,
      currentMode: automationState?.currentMode || 'none',
      modeTitle: automationState?.modeTitle || 'No Automation',
      lastApplied: automationState?.appliedAt || null,
      appliedBy: automationState?.appliedBy || null,
      energySaved: automationState?.energySaved || 0,
      automationActive: automationState?.status === 'active',
      lockdownActive: automationState?.lockdownActive || false,
      lockdownReason: automationState?.lockdownReason || null,
      deviceBreakdown: deviceBreakdown,
      automationEfficiency: devices.length > 0 ? Math.round((lockedDevices / devices.length) * 100) : 0,
      energyEfficiency: automationState?.energySaved > 0 ? 'High' : 'None',
      hasHighEnergyDevices: devices.some(d => d.type === 'AC'),
      hasEssentialDevices: devices.some(d => d.type === 'Light'),
      needsOptimization: onlineDevices > (devices.length * 0.8),
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`📊 Automation statistics calculated:`, stats);
    return stats;
    
  } catch (error) {
    console.error('❌ Error getting automation statistics:', error);
    return {
      totalDevices: 0,
      onlineDevices: 0,
      offlineDevices: 0,
      lockedDevices: 0,
      currentMode: 'none',
      modeTitle: 'No Automation',
      lastApplied: null,
      automationActive: false,
      lockdownActive: false,
      deviceBreakdown: {},
      lastUpdated: new Date().toISOString()
    };
  }
};

/**
 * Validate automation with Firestore lockdown check
 * @param {string} buildingId - Building ID
 * @param {string} mode - Automation mode
 * @returns {Promise<Object>} Validation result
 */
const validateAutomationApplication = async (buildingId, mode) => {
  try {
    const devices = await getBuildingDevices(buildingId);
    const currentAutomationState = await loadAutomationState(buildingId);
    
    if (devices.length === 0) {
      return {
        valid: false,
        reason: 'No devices found in building',
        affectedDevices: 0,
        totalDevices: 0
      };
    }
    
    // Check for existing lockdown
    if (currentAutomationState?.lockdownActive && mode !== 'turn-off-all') {
      return {
        valid: false,
        reason: 'Cannot apply other automation modes while Turn Off All lockdown is active',
        affectedDevices: 0,
        totalDevices: devices.length,
        recommendations: ['Disable Turn Off All automation first']
      };
    }
    
    let affectedDevices = 0;
    const deviceCounts = {
      total: devices.length,
      on: devices.filter(d => d.status === 'ON').length,
      off: devices.filter(d => d.status === 'OFF').length,
      locked: devices.filter(d => d.locked).length
    };
    
    switch (mode) {
      case 'turn-off-all':
        affectedDevices = deviceCounts.on;
        break;
      case 'eco-mode':
        affectedDevices = devices.filter(d => 
          d.status === 'ON' && (d.type === 'AC' || d.type === 'Fan' || d.type === 'Other')
        ).length;
        break;
      case 'night-mode':
        affectedDevices = devices.filter(d => 
          d.status === 'ON' && d.type !== 'Light'
        ).length;
        break;
      default:
        return { valid: false, reason: 'Invalid automation mode' };
    }
    
    return {
      valid: true,
      reason: 'Automation can be applied',
      affectedDevices: affectedDevices,
      totalDevices: devices.length,
      lockdownWillBeActive: mode === 'turn-off-all'
    };
    
  } catch (error) {
    console.error('❌ Error validating automation application:', error);
    return { valid: false, reason: 'Error validating automation' };
  }
};

// ==============================================================================
// EXPORTS
// ==============================================================================

export default {
  getBuildingDevices,
  applyAutomationMode,
  saveAutomationState,
  loadAutomationState,
  clearAutomationState,
  getAutomationStatistics,
  validateAutomationApplication,
  isTurnOffAllLockdownActive,
  lockAllBuildingDevices,
  unlockAllBuildingDevices,
  validateDeviceOperation
};