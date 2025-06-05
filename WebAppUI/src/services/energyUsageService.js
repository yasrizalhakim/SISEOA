// src/services/energyUsageService.js - Fixed Energy Usage Data Management

import { firestore } from './firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  orderBy,
  startAt,
  endAt
} from 'firebase/firestore';

// ==============================================================================
// ENERGY USAGE DATA OPERATIONS
// ==============================================================================

/**
 * Get energy usage data for a specific device and date range
 * @param {string} deviceId - Device ID
 * @param {string} filter - 'day', 'week', or 'month'
 * @param {Date} date - Base date for filtering (default: today)
 * @returns {Promise<Array>} Array of energy usage data
 */
export const getDeviceEnergyUsage = async (deviceId, filter = 'day', date = new Date()) => {
  try {
    console.log(`📊 Fetching energy usage for device ${deviceId}, filter: ${filter}`);
    
    const { startDate, endDate } = getDateRange(filter, date);
    const usageData = [];
    
    // Get data for each day in the range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = formatDateForFirestore(currentDate);
      
      try {
        // Updated path: ENERGYUSAGE/{deviceId}/DailyUsage/{yyyy-mm-dd}
        const energyDoc = await getDoc(doc(firestore, 'ENERGYUSAGE', deviceId, 'DailyUsage', dateStr));
        
        if (energyDoc.exists()) {
          const data = energyDoc.data();
          // Note: Using capital 'U' in 'Usage' to match Firestore structure
          usageData.push({
            date: new Date(currentDate),
            dateStr: dateStr,
            usage: data.Usage || 0, // Fixed: was data.usage, now data.Usage
            lastUpdated: data.LastUpdated || null,
            deviceWattage: data.DeviceWattage || null
          });
        } else {
          // Add zero usage for missing days
          usageData.push({
            date: new Date(currentDate),
            dateStr: dateStr,
            usage: 0,
            lastUpdated: null,
            deviceWattage: null
          });
        }
      } catch (docError) {
        console.warn(`No energy data for ${deviceId} on ${dateStr}:`, docError);
        usageData.push({
          date: new Date(currentDate),
          dateStr: dateStr,
          usage: 0,
          lastUpdated: null,
          deviceWattage: null
        });
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`📊 Found ${usageData.length} energy data points for device ${deviceId}`);
    return usageData;
  } catch (error) {
    console.error('Error fetching device energy usage:', error);
    return [];
  }
};

/**
 * Get aggregated energy usage for all devices in a building
 * @param {string} buildingId - Building ID
 * @param {Array} deviceIds - Array of device IDs in the building
 * @param {string} filter - 'day', 'week', or 'month'
 * @param {Date} date - Base date for filtering (default: today)
 * @returns {Promise<Array>} Array of aggregated energy usage data
 */
export const getBuildingEnergyUsage = async (buildingId, deviceIds, filter = 'day', date = new Date()) => {
  try {
    console.log(`🏢 Fetching building energy usage for ${deviceIds.length} devices, filter: ${filter}`);
    
    if (!deviceIds || deviceIds.length === 0) {
      console.log('No devices found for building');
      return [];
    }
    
    const { startDate, endDate } = getDateRange(filter, date);
    const aggregatedData = [];
    
    // Get data for each day in the range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = formatDateForFirestore(currentDate);
      let totalUsage = 0;
      let devicesWithData = 0;
      const deviceDataForDay = [];
      
      // Get usage for all devices on this date
      for (const deviceId of deviceIds) {
        try {
          // Updated path: ENERGYUSAGE/{deviceId}/DailyUsage/{yyyy-mm-dd}
          const energyDoc = await getDoc(doc(firestore, 'ENERGYUSAGE', deviceId, 'DailyUsage', dateStr));
          
          if (energyDoc.exists()) {
            const data = energyDoc.data();
            const deviceUsage = data.Usage || 0; // Fixed: was data.usage, now data.Usage
            totalUsage += deviceUsage;
            
            if (deviceUsage > 0) {
              devicesWithData++;
            }
            
            deviceDataForDay.push({
              deviceId: deviceId,
              usage: deviceUsage,
              wattage: data.DeviceWattage || null,
              lastUpdated: data.LastUpdated || null
            });
          } else {
            deviceDataForDay.push({
              deviceId: deviceId,
              usage: 0,
              wattage: null,
              lastUpdated: null
            });
          }
        } catch (docError) {
          console.warn(`No energy data for device ${deviceId} on ${dateStr}`);
          deviceDataForDay.push({
            deviceId: deviceId,
            usage: 0,
            wattage: null,
            lastUpdated: null
          });
        }
      }
      
      aggregatedData.push({
        date: new Date(currentDate),
        dateStr: dateStr,
        usage: totalUsage,
        devicesWithData: devicesWithData,
        totalDevices: deviceIds.length,
        deviceBreakdown: deviceDataForDay // Include individual device data for debugging
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`🏢 Aggregated ${aggregatedData.length} data points for building ${buildingId}`);
    return aggregatedData;
  } catch (error) {
    console.error('Error fetching building energy usage:', error);
    return [];
  }
};

/**
 * Get device IDs for a building by finding devices in building locations
 * @param {string} buildingId - Building ID
 * @returns {Promise<Array>} Array of device IDs
 */
export const getBuildingDeviceIds = async (buildingId) => {
  try {
    console.log(`🔍 Getting device IDs for building: ${buildingId}`);
    
    // Get all locations in the building
    const locationsQuery = query(
      collection(firestore, 'LOCATION'),
      where('Building', '==', buildingId)
    );
    const locationsSnapshot = await getDocs(locationsQuery);
    const locationIds = locationsSnapshot.docs.map(doc => doc.id);
    
    if (locationIds.length === 0) {
      console.log('No locations found for building');
      return [];
    }
    
    console.log(`📍 Found ${locationIds.length} locations in building: ${locationIds}`);
    
    // Get all devices in these locations
    // Handle Firestore 'in' query limitation (max 10 values)
    const deviceIds = [];
    const batches = [];
    
    for (let i = 0; i < locationIds.length; i += 10) {
      batches.push(locationIds.slice(i, i + 10));
    }
    
    for (const batch of batches) {
      const devicesQuery = query(
        collection(firestore, 'DEVICE'),
        where('Location', 'in', batch)
      );
      const devicesSnapshot = await getDocs(devicesQuery);
      const batchDeviceIds = devicesSnapshot.docs.map(doc => doc.id);
      deviceIds.push(...batchDeviceIds);
    }
    
    console.log(`📱 Found ${deviceIds.length} devices in building ${buildingId}: ${deviceIds}`);
    return deviceIds;
  } catch (error) {
    console.error('Error getting building device IDs:', error);
    return [];
  }
};

/**
 * Get energy usage summary for a device
 * @param {string} deviceId - Device ID
 * @param {string} filter - 'day', 'week', or 'month'
 * @returns {Promise<Object>} Energy usage summary
 */
export const getDeviceEnergyUsageSummary = async (deviceId, filter = 'day') => {
  try {
    const usageData = await getDeviceEnergyUsage(deviceId, filter);
    
    if (usageData.length === 0) {
      return {
        totalUsage: 0,
        averageUsage: 0,
        peakUsage: 0,
        daysWithData: 0,
        totalDays: 0,
        deviceWattage: null
      };
    }
    
    const totalUsage = usageData.reduce((sum, item) => sum + item.usage, 0);
    const daysWithData = usageData.filter(item => item.usage > 0).length;
    const peakUsage = Math.max(...usageData.map(item => item.usage));
    const averageUsage = daysWithData > 0 ? totalUsage / daysWithData : 0;
    
    // Get device wattage from the most recent data point that has it
    const deviceWattage = usageData.find(item => item.deviceWattage)?.deviceWattage || null;
    
    return {
      totalUsage: Number(totalUsage.toFixed(6)), // Increased precision for small values
      averageUsage: Number(averageUsage.toFixed(6)),
      peakUsage: Number(peakUsage.toFixed(6)),
      daysWithData: daysWithData,
      totalDays: usageData.length,
      deviceWattage: deviceWattage
    };
  } catch (error) {
    console.error('Error getting device energy usage summary:', error);
    return {
      totalUsage: 0,
      averageUsage: 0,
      peakUsage: 0,
      daysWithData: 0,
      totalDays: 0,
      deviceWattage: null
    };
  }
};

/**
 * Get energy usage summary for a building
 * @param {string} buildingId - Building ID
 * @param {string} filter - 'day', 'week', or 'month'
 * @returns {Promise<Object>} Building energy usage summary
 */
export const getBuildingEnergyUsageSummary = async (buildingId, filter = 'day') => {
  try {
    const deviceIds = await getBuildingDeviceIds(buildingId);
    
    if (deviceIds.length === 0) {
      return {
        totalUsage: 0,
        averageUsage: 0,
        peakUsage: 0,
        daysWithData: 0,
        totalDays: 0,
        deviceCount: 0,
        activeDevices: 0
      };
    }
    
    const usageData = await getBuildingEnergyUsage(buildingId, deviceIds, filter);
    
    if (usageData.length === 0) {
      return {
        totalUsage: 0,
        averageUsage: 0,
        peakUsage: 0,
        daysWithData: 0,
        totalDays: 0,
        deviceCount: deviceIds.length,
        activeDevices: 0
      };
    }
    
    const totalUsage = usageData.reduce((sum, item) => sum + item.usage, 0);
    const daysWithData = usageData.filter(item => item.usage > 0).length;
    const peakUsage = Math.max(...usageData.map(item => item.usage));
    const averageUsage = daysWithData > 0 ? totalUsage / daysWithData : 0;
    
    // Calculate active devices (devices that have reported usage)
    const activeDevices = new Set();
    usageData.forEach(dayData => {
      dayData.deviceBreakdown?.forEach(deviceData => {
        if (deviceData.usage > 0) {
          activeDevices.add(deviceData.deviceId);
        }
      });
    });
    
    return {
      totalUsage: Number(totalUsage.toFixed(6)), // Increased precision
      averageUsage: Number(averageUsage.toFixed(6)),
      peakUsage: Number(peakUsage.toFixed(6)),
      daysWithData: daysWithData,
      totalDays: usageData.length,
      deviceCount: deviceIds.length,
      activeDevices: activeDevices.size
    };
  } catch (error) {
    console.error('Error getting building energy usage summary:', error);
    return {
      totalUsage: 0,
      averageUsage: 0,
      peakUsage: 0,
      daysWithData: 0,
      totalDays: 0,
      deviceCount: 0,
      activeDevices: 0
    };
  }
};

/**
 * Get energy status history for a device (individual on/off events)
 * @param {string} deviceId - Device ID
 * @param {string} filter - 'day', 'week', or 'month'
 * @param {Date} date - Base date for filtering (default: today)
 * @returns {Promise<Array>} Array of energy status events
 */
export const getDeviceEnergyStatusHistory = async (deviceId, filter = 'day', date = new Date()) => {
  try {
    console.log(`📊 Fetching energy status history for device ${deviceId}, filter: ${filter}`);
    
    const { startDate, endDate } = getDateRange(filter, date);
    
    // Get all energy status documents in the date range
    // Path: ENERGYUSAGE/{deviceId}/DeviceEnergyStatus/{timestamp}
    const energyStatusQuery = query(
      collection(firestore, 'ENERGYUSAGE', deviceId, 'DeviceEnergyStatus')
    );
    
    const energyStatusSnapshot = await getDocs(energyStatusQuery);
    const statusEvents = [];
    
    energyStatusSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const timestamp = new Date(data.Timestamp);
      
      // Filter by date range
      if (timestamp >= startDate && timestamp <= endDate) {
        statusEvents.push({
          id: doc.id,
          timestamp: timestamp,
          energyUsed: data.EnergyUsed || 0,
          date: data.Date || '',
          deviceWattage: data.DeviceWattage || null,
          ...data
        });
      }
    });
    
    // Sort by timestamp
    statusEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`📊 Found ${statusEvents.length} energy status events for device ${deviceId}`);
    return statusEvents;
  } catch (error) {
    console.error('Error fetching device energy status history:', error);
    return [];
  }
};

/**
 * Get device status history (ON/OFF events)
 * @param {string} deviceId - Device ID
 * @param {string} filter - 'day', 'week', or 'month'
 * @param {Date} date - Base date for filtering (default: today)
 * @returns {Promise<Array>} Array of device status events
 */
export const getDeviceStatusHistory = async (deviceId, filter = 'day', date = new Date()) => {
  try {
    console.log(`📊 Fetching device status history for device ${deviceId}, filter: ${filter}`);
    
    const { startDate, endDate } = getDateRange(filter, date);
    
    // Get all device status documents in the date range
    // Path: ENERGYUSAGE/{deviceId}/DeviceStatusUsage/{timestamp}
    const statusQuery = query(
      collection(firestore, 'ENERGYUSAGE', deviceId, 'DeviceStatusUsage')
    );
    
    const statusSnapshot = await getDocs(statusQuery);
    const statusEvents = [];
    
    statusSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const timestamp = new Date(data.Timestamp);
      
      // Filter by date range
      if (timestamp >= startDate && timestamp <= endDate) {
        statusEvents.push({
          id: doc.id,
          timestamp: timestamp,
          status: data.Status || 'OFF',
          timestampStr: data.Timestamp || '',
          ...data
        });
      }
    });
    
    // Sort by timestamp
    statusEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`📊 Found ${statusEvents.length} status events for device ${deviceId}`);
    return statusEvents;
  } catch (error) {
    console.error('Error fetching device status history:', error);
    return [];
  }
};

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

/**
 * Get date range based on filter type
 * @param {string} filter - 'day', 'week', or 'month'
 * @param {Date} baseDate - Base date for calculation
 * @returns {Object} Object with startDate and endDate
 */
const getDateRange = (filter, baseDate) => {
  const date = new Date(baseDate);
  let startDate, endDate;
  
  switch (filter) {
    case 'week':
      // Get start of week (Sunday)
      startDate = new Date(date);
      startDate.setDate(date.getDate() - date.getDay());
      startDate.setHours(0, 0, 0, 0);
      
      // Get end of week (Saturday)
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'month':
      // Get start of month
      startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      
      // Get end of month
      endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'day':
    default:
      // Just today
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      break;
  }
  
  return { startDate, endDate };
};

/**
 * Format date for Firestore document ID
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string (yyyy-mm-dd)
 */
const formatDateForFirestore = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format date for display
 * @param {Date} date - Date to format
 * @param {string} filter - Filter type for appropriate formatting
 * @returns {string} Formatted date string for display
 */
export const formatDateForDisplay = (date, filter) => {
  if (!date) return '';
  
  switch (filter) {
    case 'week':
      // Show week start date
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
    case 'day':
    default:
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};

/**
 * Get sample energy data for testing (remove in production)
 * @param {string} filter - Filter type
 * @returns {Array} Sample data array
 */
export const getSampleEnergyData = (filter = 'day') => {
  const data = [];
  const { startDate, endDate } = getDateRange(filter, new Date());
  
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    data.push({
      date: new Date(currentDate),
      dateStr: formatDateForFirestore(currentDate),
      usage: Number((Math.random() * 0.05 + 0.01).toFixed(6)), // Small realistic values (0.01-0.06 kWh)
      lastUpdated: new Date().toISOString()
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return data;
};

// ==============================================================================
// EXPORTS
// ==============================================================================

export default {
  getDeviceEnergyUsage,
  getBuildingEnergyUsage,
  getBuildingDeviceIds,
  getDeviceEnergyUsageSummary,
  getBuildingEnergyUsageSummary,
  getDeviceEnergyStatusHistory,
  getDeviceStatusHistory,
  formatDateForDisplay,
  getSampleEnergyData
};