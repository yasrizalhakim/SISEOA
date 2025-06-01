// src/services/energyUsageService.js - Energy Usage Data Management

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
          usageData.push({
            date: new Date(currentDate),
            dateStr: dateStr,
            usage: data.usage || 0,
            //timestamp: data.timestamp || null
          });
        } else {
          // Add zero usage for missing days
          usageData.push({
            date: new Date(currentDate),
            dateStr: dateStr,
            usage: 0,
            //timestamp: null
          });
        }
      } catch (docError) {
        console.warn(`No energy data for ${deviceId} on ${dateStr}:`, docError);
        usageData.push({
          date: new Date(currentDate),
          dateStr: dateStr,
          usage: 0,
          //timestamp: null
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
      
      // Get usage for all devices on this date
      for (const deviceId of deviceIds) {
        try {
          // Updated path: ENERGYUSAGE/{deviceId}/DailyUsage/{yyyy-mm-dd}
          const energyDoc = await getDoc(doc(firestore, 'ENERGYUSAGE', deviceId, 'DailyUsage', dateStr));
          
          if (energyDoc.exists()) {
            const data = energyDoc.data();
            totalUsage += data.usage || 0;
            devicesWithData++;
          }
        } catch (docError) {
          console.warn(`No energy data for device ${deviceId} on ${dateStr}`);
        }
      }
      
      aggregatedData.push({
        date: new Date(currentDate),
        dateStr: dateStr,
        usage: totalUsage,
        devicesWithData: devicesWithData,
        totalDevices: deviceIds.length
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
    
    // Get all devices in these locations
    const devicesQuery = query(
      collection(firestore, 'DEVICE'),
      where('Location', 'in', locationIds)
    );
    const devicesSnapshot = await getDocs(devicesQuery);
    const deviceIds = devicesSnapshot.docs.map(doc => doc.id);
    
    console.log(`📱 Found ${deviceIds.length} devices in building ${buildingId}`);
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
        totalDays: 0
      };
    }
    
    const totalUsage = usageData.reduce((sum, item) => sum + item.usage, 0);
    const daysWithData = usageData.filter(item => item.usage > 0).length;
    const peakUsage = Math.max(...usageData.map(item => item.usage));
    const averageUsage = daysWithData > 0 ? totalUsage / daysWithData : 0;
    
    return {
      totalUsage: Number(totalUsage.toFixed(2)),
      averageUsage: Number(averageUsage.toFixed(2)),
      peakUsage: Number(peakUsage.toFixed(2)),
      daysWithData: daysWithData,
      totalDays: usageData.length
    };
  } catch (error) {
    console.error('Error getting device energy usage summary:', error);
    return {
      totalUsage: 0,
      averageUsage: 0,
      peakUsage: 0,
      daysWithData: 0,
      totalDays: 0
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
        deviceCount: 0
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
        deviceCount: deviceIds.length
      };
    }
    
    const totalUsage = usageData.reduce((sum, item) => sum + item.usage, 0);
    const daysWithData = usageData.filter(item => item.usage > 0).length;
    const peakUsage = Math.max(...usageData.map(item => item.usage));
    const averageUsage = daysWithData > 0 ? totalUsage / daysWithData : 0;
    
    return {
      totalUsage: Number(totalUsage.toFixed(2)),
      averageUsage: Number(averageUsage.toFixed(2)),
      peakUsage: Number(peakUsage.toFixed(2)),
      daysWithData: daysWithData,
      totalDays: usageData.length,
      deviceCount: deviceIds.length
    };
  } catch (error) {
    console.error('Error getting building energy usage summary:', error);
    return {
      totalUsage: 0,
      averageUsage: 0,
      peakUsage: 0,
      daysWithData: 0,
      totalDays: 0,
      deviceCount: 0
    };
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
      usage: Math.random() * 50 + 10, // Random usage between 10-60 kWh
      //timestamp: currentDate.toISOString()
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
  formatDateForDisplay,
  getSampleEnergyData
};