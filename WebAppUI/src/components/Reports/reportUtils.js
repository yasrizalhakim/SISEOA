// src/components/Reports/reportUtils.js - Updated Energy Report Calculations and Utilities

// Malaysia TNB Tariff Rates for Residential/Small Office (RM per kWh)
export const MALAYSIA_ENERGY_RATES = {
  tier1: { min: 0, max: 200, rate: 0.218 },      // 1-200 kWh
  tier2: { min: 201, max: 300, rate: 0.334 },    // 201-300 kWh
  tier3: { min: 301, max: 600, rate: 0.516 },    // 301-600 kWh
  tier4: { min: 601, max: 900, rate: 0.546 },    // 601-900 kWh
  tier5: { min: 901, max: Infinity, rate: 0.571 } // 901+ kWh
};

// Malaysia's electricity grid emission factor (kg CO2 per kWh)
export const MALAYSIA_CARBON_FACTOR = 0.708; // Based on Malaysia's energy mix

// Device type energy consumption estimates (watts) - for analysis
export const DEVICE_TYPE_ESTIMATES = {
  'Light': 60,
  'Fan': 75,
  'Air Conditioner': 1500,
  'TV': 150,
  'Computer': 200,
  'Refrigerator': 150,
  'Water Heater': 2000,
  'Washing Machine': 500,
  'Microwave': 1000,
  'Other': 100
};

/**
 * Calculate energy cost using Malaysia's tiered pricing system
 * @param {number} totalKwh - Total energy consumption in kWh
 * @returns {Object} Cost breakdown by tiers
 */
export const calculateEnergyCost = (totalKwh) => {
  const breakdown = [];
  let remainingKwh = totalKwh;
  let totalCost = 0;

  const tiers = Object.values(MALAYSIA_ENERGY_RATES);

  for (const tier of tiers) {
    if (remainingKwh <= 0) break;

    const tierRange = tier.max - tier.min + 1;
    const tierUsage = Math.min(remainingKwh, tierRange);
    const tierCost = tierUsage * tier.rate;

    if (tierUsage > 0) {
      breakdown.push({
        tier: `${tier.min}-${tier.max === Infinity ? '∞' : tier.max} kWh`,
        usage: tierUsage,
        rate: tier.rate,
        cost: tierCost
      });

      totalCost += tierCost;
      remainingKwh -= tierUsage;
    }
  }

  return {
    breakdown,
    totalCost,
    totalKwh,
    averageRate: totalKwh > 0 ? totalCost / totalKwh : 0
  };
};

/**
 * Calculate carbon footprint from energy consumption
 * @param {number} totalKwh - Total energy consumption in kWh
 * @returns {Object} Carbon footprint data
 */
export const calculateCarbonFootprint = (totalKwh) => {
  const carbonEmission = totalKwh * MALAYSIA_CARBON_FACTOR; // kg CO2
  const treesEquivalent = carbonEmission / 22; // Average tree absorbs 22kg CO2/year
  const carMilesEquivalent = carbonEmission / 0.411; // Average car emits 0.411 kg CO2/mile

  return {
    carbonEmission: Number(carbonEmission.toFixed(2)),
    treesEquivalent: Number(treesEquivalent.toFixed(1)),
    carMilesEquivalent: Number(carMilesEquivalent.toFixed(1))
  };
};

/**
 * Analyze device types and their energy consumption
 * @param {Array} devices - Array of device objects with usage data
 * @returns {Object} Device analysis data
 */
export const analyzeDeviceTypes = (devices) => {
  const deviceTypeUsage = {};
  const deviceDetails = [];

  devices.forEach(device => {
    const deviceType = device.DeviceType || 'Other';
    const usage = device.energyUsage || 0;

    // Aggregate by device type
    if (!deviceTypeUsage[deviceType]) {
      deviceTypeUsage[deviceType] = 0;
    }
    deviceTypeUsage[deviceType] += usage;

    // Individual device details
    deviceDetails.push({
      name: device.DeviceName || device.id,
      type: deviceType,
      usage: usage,
      cost: calculateEnergyCost(usage).totalCost,
      percentage: 0 // Will be calculated later
    });
  });

  // Calculate total usage for percentage calculations
  const totalUsage = Object.values(deviceTypeUsage).reduce((sum, usage) => sum + usage, 0);

  // Convert to chart data format
  const chartData = Object.entries(deviceTypeUsage).map(([type, usage]) => ({
    name: type,
    value: usage,
    percentage: totalUsage > 0 ? (usage / totalUsage * 100) : 0
  }));

  // Update percentage for device details
  deviceDetails.forEach(device => {
    device.percentage = totalUsage > 0 ? (device.usage / totalUsage * 100) : 0;
  });

  return {
    chartData,
    deviceDetails: deviceDetails.sort((a, b) => b.usage - a.usage),
    totalUsage,
    totalDevices: devices.length
  };
};

/**
 * Generate energy efficiency recommendations
 * @param {Object} reportData - Complete report data
 * @returns {Array} Array of recommendation strings
 */
export const generateRecommendations = (reportData) => {
  const recommendations = [];
  const { summary, deviceAnalysis, carbonFootprint } = reportData;

  // Peak usage recommendations
  if (summary.peakUsage > summary.averageUsage * 1.5) {
    recommendations.push(
      "Consider shifting high-energy activities to off-peak hours to reduce demand charges and improve grid efficiency."
    );
  }

  // Device-specific recommendations
  if (deviceAnalysis.chartData.length > 0) {
    const topConsumer = deviceAnalysis.chartData[0];
    if (topConsumer.percentage > 40) {
      recommendations.push(
        `${topConsumer.name} devices consume ${topConsumer.percentage.toFixed(1)}% of total energy. Consider upgrading to more efficient models.`
      );
    }
  }

  // Carbon footprint recommendations
  if (carbonFootprint.carbonEmission > 100) {
    recommendations.push(
      "Consider investing in renewable energy sources or carbon offset programs to reduce environmental impact."
    );
  }

  // Cost efficiency recommendations
  if (summary.totalCost > summary.totalUsage * 0.4) {
    recommendations.push(
      "Your average energy rate is high. Consider energy-saving measures or time-of-use scheduling to reduce costs."
    );
  }

  // Usage pattern recommendations
  if (summary.daysWithData < summary.totalDays * 0.8) {
    recommendations.push(
      "Inconsistent energy monitoring detected. Ensure all devices are properly connected for accurate tracking."
    );
  }

  // General recommendations
  recommendations.push(
    "Regular maintenance of electrical equipment can improve efficiency by 5-15%.",
    "LED lighting upgrades can reduce lighting energy consumption by up to 75%.",
    "Smart scheduling of air conditioning can reduce cooling costs by 10-30%."
  );

  return recommendations.slice(0, 6); // Return top 6 recommendations
};

/**
 * Format energy value for display
 * @param {number} value - Energy value in kWh
 * @returns {string} Formatted energy string
 */
export const formatEnergyValue = (value) => {
  if (value === 0) return '0 kWh';
  if (value < 0.001) return `${(value * 1000).toFixed(1)} Wh`;
  if (value < 1) return `${(value * 1000).toFixed(0)} Wh`;
  return `${value.toFixed(3)} kWh`;
};

/**
 * Format currency value for Malaysia (RM)
 * @param {number} value - Currency value
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value) => {
  return `RM ${value.toFixed(2)}`;
};

/**
 * Format percentage value
 * @param {number} value - Percentage value
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value) => {
  return `${value.toFixed(1)}%`;
};

/**
 * Generate date range string for report period from custom dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Object} Start and end dates with formatted string
 */
export const getReportDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    // Fallback to default range if dates not provided
    const defaultEnd = new Date();
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 6);
    
    return {
      startDate: defaultStart,
      endDate: defaultEnd,
      periodText: `${defaultStart.toLocaleDateString()} - ${defaultEnd.toLocaleDateString()}`,
      formatted: `${defaultStart.toLocaleDateString()} to ${defaultEnd.toLocaleDateString()}`
    };
  }
  
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  let periodText;
  
  if (totalDays === 1) {
    periodText = `${startDate.toLocaleDateString()}`;
  } else if (totalDays <= 7) {
    periodText = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (${totalDays} days)`;
  } else if (totalDays <= 31) {
    periodText = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (${totalDays} days)`;
  } else {
    periodText = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (${Math.floor(totalDays / 30)} months)`;
  }

  return {
    startDate,
    endDate,
    periodText,
    formatted: `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
    totalDays
  };
};

/**
 * Calculate energy efficiency rating
 * @param {number} totalUsage - Total energy usage in kWh
 * @param {number} totalDevices - Number of devices
 * @param {number} totalDays - Number of days in period
 * @returns {Object} Efficiency rating information
 */
export const calculateEfficiencyRating = (totalUsage, totalDevices, totalDays) => {
  if (totalDevices === 0 || totalDays === 0) {
    return { 
      rating: 'N/A', 
      score: 0, 
      description: 'No devices to analyze',
      usagePerDevicePerDay: 0
    };
  }

  // Calculate usage per device per day
  const usagePerDevicePerDay = totalUsage / (totalDevices * totalDays);

  let rating, score, description;

  if (usagePerDevicePerDay < 0.5) {
    rating = 'Excellent';
    score = 95;
    description = 'Very efficient energy usage';
  } else if (usagePerDevicePerDay < 1.0) {
    rating = 'Good';
    score = 80;
    description = 'Above average efficiency';
  } else if (usagePerDevicePerDay < 2.0) {
    rating = 'Average';
    score = 65;
    description = 'Typical energy consumption';
  } else if (usagePerDevicePerDay < 3.0) {
    rating = 'Below Average';
    score = 45;
    description = 'Higher than normal consumption';
  } else {
    rating = 'Poor';
    score = 25;
    description = 'Inefficient energy usage';
  }

  return { 
    rating, 
    score, 
    description, 
    usagePerDevicePerDay: Number(usagePerDevicePerDay.toFixed(6))
  };
};

/**
 * Calculate energy savings potential
 * @param {Object} reportData - Complete report data
 * @returns {Object} Savings potential information
 */
export const calculateSavingsPotential = (reportData) => {
  const { summary, deviceAnalysis } = reportData;
  
  // Estimate potential savings based on device efficiency improvements
  let potentialSavings = 0;
  
  // Air conditioner efficiency improvements (20% potential)
  const acUsage = deviceAnalysis.chartData.find(d => d.name.toLowerCase().includes('air'))?.value || 0;
  potentialSavings += acUsage * 0.20;
  
  // Lighting efficiency improvements (50% potential with LED)
  const lightUsage = deviceAnalysis.chartData.find(d => d.name.toLowerCase().includes('light'))?.value || 0;
  potentialSavings += lightUsage * 0.50;
  
  // General efficiency improvements (10% potential)
  const otherUsage = summary.totalUsage - acUsage - lightUsage;
  potentialSavings += otherUsage * 0.10;
  
  const potentialCostSavings = calculateEnergyCost(potentialSavings).totalCost;
  const potentialCarbonSavings = potentialSavings * MALAYSIA_CARBON_FACTOR;
  
  return {
    energySavings: Number(potentialSavings.toFixed(6)),
    costSavings: Number(potentialCostSavings.toFixed(2)),
    carbonSavings: Number(potentialCarbonSavings.toFixed(2)),
    percentage: summary.totalUsage > 0 ? Number(((potentialSavings / summary.totalUsage) * 100).toFixed(1)) : 0
  };
};

export default {
  MALAYSIA_ENERGY_RATES,
  MALAYSIA_CARBON_FACTOR,
  DEVICE_TYPE_ESTIMATES,
  calculateEnergyCost,
  calculateCarbonFootprint,
  analyzeDeviceTypes,
  generateRecommendations,
  formatEnergyValue,
  formatCurrency,
  formatPercentage,
  getReportDateRange,
  calculateEfficiencyRating,
  calculateSavingsPotential
};