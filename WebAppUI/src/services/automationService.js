// src/services/AutomationService.js - COMPLETE ENHANCED SERVICE
// Enhanced service for Pi automation with multiple ON/OFF stages per day

import { firestore, database } from './firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  serverTimestamp,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import { ref, get, update } from 'firebase/database';

// ==============================================================================
// CONSTANTS AND UTILITIES
// ==============================================================================

const MINIMUM_STAGE_GAP_MINUTES = 15; // Must match Pi controller
const MAX_EVENT_HISTORY = 30; // Maximum events to keep per device
const MAX_STAGES_PER_DAY = 3; // Maximum stages allowed per day

/**
 * Format time for display (HH:MM to readable format)
 */
const formatTimeDisplay = (timeStr) => {
  if (!timeStr) return timeStr;
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${minutes} ${ampm}`;
};

/**
 * Format hour for display
 */
const formatHour = (hour) => {
  const h = parseInt(hour);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:00 ${ampm}`;
};

/**
 * Format multi-stage schedule for display
 */
const formatMultiStageSchedule = (schedules) => {
  if (!schedules || !Array.isArray(schedules)) return 'No schedule';
  
  const daySchedules = schedules.map(daySchedule => {
    const day = daySchedule.day;
    const stages = daySchedule.stages || [];
    
    if (stages.length === 0) return `${day}: No stages`;
    
    const stageTexts = stages.map(stage => 
      `${formatTimeDisplay(stage.start)} - ${formatTimeDisplay(stage.end)}`
    );
    
    return `${day}: ${stageTexts.join(', ')}`;
  });
  
  return daySchedules.join('\n');
};

// ==============================================================================
// PI AUTOMATION RULE MANAGEMENT (Enhanced for Multi-Stage)
// ==============================================================================

/**
 * Get Pi automation rule for a device (supports both single and multi-stage)
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>} Pi automation rule or null
 */
export const getPiAutomationRule = async (deviceId) => {
  try {
    console.log(`🤖 Getting Pi automation rule for device: ${deviceId}`);
    
    const ruleDoc = await getDoc(doc(firestore, 'AUTOMATIONRULE', deviceId));
    
    if (ruleDoc.exists()) {
      const ruleData = ruleDoc.data();
      console.log(`✅ Found Pi automation rule for ${deviceId}:`, ruleData);
      
      // Enhanced rule object with multi-stage support
      const enhancedRule = {
        id: deviceId,
        ...ruleData,
        // Convert timestamps for display
        createdAt: ruleData.createdAt instanceof Date ? ruleData.createdAt : 
                   (ruleData.createdAt?.toDate?.() || new Date(ruleData.createdAt)),
        lastModified: ruleData.lastModified instanceof Date ? ruleData.lastModified :
                     (ruleData.lastModified?.toDate?.() || new Date(ruleData.lastModified)),
        
        // Multi-stage support
        isMultiStage: ruleData.multiStage || false,
        stageCount: ruleData.multiStage ? 
          (ruleData.schedules || []).reduce((total, daySchedule) => 
            total + (daySchedule.stages || []).length, 0) : 1,
        
        // Display helpers
        displaySchedule: ruleData.multiStage ? 
          formatMultiStageSchedule(ruleData.schedules) :
          `${formatTimeDisplay(ruleData.start)} - ${formatTimeDisplay(ruleData.end)}`,
        
        // Summary for UI
        summary: generateRuleSummary(ruleData)
      };
      
      return enhancedRule;
    }
    
    console.log(`ℹ️ No Pi automation rule found for device ${deviceId}`);
    return null;
    
  } catch (error) {
    console.error('❌ Error getting Pi automation rule:', error);
    return null;
  }
};

/**
 * Generate rule summary for UI display
 */
const generateRuleSummary = (ruleData) => {
  if (ruleData.multiStage && ruleData.schedules) {
    const totalStages = ruleData.schedules.reduce((total, daySchedule) => 
      total + (daySchedule.stages || []).length, 0);
    const activeDays = ruleData.schedules.length;
    
    return {
      type: 'Multi-Stage',
      stageCount: totalStages,
      activeDays: activeDays,
      description: `${totalStages} stages across ${activeDays} days`
    };
  } else {
    const days = ruleData.days || [];
    return {
      type: 'Single-Stage',
      stageCount: 1,
      activeDays: days.length,
      description: `${ruleData.start || 'N/A'} - ${ruleData.end || 'N/A'} on ${days.length} days`
    };
  }
};

/**
 * Create manual Pi automation rule with multi-stage support
 * @param {string} deviceId - Device ID
 * @param {Object} ruleData - Rule configuration
 * @param {string} userEmail - User creating the rule
 * @returns {Promise<Object>} Created rule
 */
export const createManualPiRule = async (deviceId, ruleData, userEmail) => {
  try {
    console.log(`🤖 Creating manual Pi rule for device: ${deviceId}`, ruleData);
    
    const { 
      startTime, 
      endTime, 
      days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      multiStage = false,
      stages = null
    } = ruleData;
    
    let manualRule;
    
    if (multiStage && stages) {
      // Multi-stage rule
      manualRule = {
        schedules: stages,
        enabled: false, // NEW RULES START DISABLED
        source: "manual",
        multiStage: true,
        stageGapMinutes: MINIMUM_STAGE_GAP_MINUTES,
        createdAt: new Date().toISOString(),
        createdBy: userEmail,
        lastModified: new Date().toISOString(),
        modifiedBy: userEmail,
        basedOnEvents: 0,
        confidence: null,
        patternType: "manual_multi_stage",
        analysisWindow: null,
        nextReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
    } else {
      // Single-stage rule (legacy format)
      manualRule = {
        start: startTime,
        end: endTime,
        days: days,
        enabled: false, // NEW RULES START DISABLED
        source: "manual",
        multiStage: false,
        createdAt: new Date().toISOString(),
        createdBy: userEmail,
        lastModified: new Date().toISOString(),
        modifiedBy: userEmail,
        basedOnEvents: 0,
        confidence: null,
        patternType: "manual_single_stage",
        analysisWindow: null,
        nextReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
    }
    
    // Save to AUTOMATIONRULE collection (Pi's collection)
    const ruleRef = doc(firestore, 'AUTOMATIONRULE', deviceId);
    await setDoc(ruleRef, manualRule); // setDoc overwrites existing rule
    
    console.log(`✅ Manual Pi rule created for ${deviceId} (DISABLED by default):`, manualRule);
    return manualRule;
    
  } catch (error) {
    console.error('❌ Error creating manual Pi rule:', error);
    throw error;
  }
};

/**
 * Update Pi automation rule (enable/disable, modify settings)
 * @param {string} deviceId - Device ID
 * @param {Object} updates - Rule updates
 * @param {string} userEmail - User making changes
 * @returns {Promise<Object>} Updated rule
 */
export const updatePiAutomationRule = async (deviceId, updates, userEmail) => {
  try {
    console.log(`🤖 Updating Pi rule for device: ${deviceId}`, updates);
    
    const updateData = {
      ...updates,
      lastModified: new Date().toISOString(),
      modifiedBy: userEmail
    };
    
    const ruleRef = doc(firestore, 'AUTOMATIONRULE', deviceId);
    await updateDoc(ruleRef, updateData);
    
    console.log(`✅ Pi rule updated for ${deviceId}`);
    return updateData;
    
  } catch (error) {
    console.error('❌ Error updating Pi rule:', error);
    throw error;
  }
};

/**
 * Delete Pi automation rule
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>} Success indicator
 */
export const deletePiAutomationRule = async (deviceId) => {
  try {
    console.log(`🤖 Deleting Pi rule for device: ${deviceId}`);
    
    await deleteDoc(doc(firestore, 'AUTOMATIONRULE', deviceId));
    
    console.log(`✅ Pi rule deleted for ${deviceId}`);
    return true;
    
  } catch (error) {
    console.error('❌ Error deleting Pi rule:', error);
    throw error;
  }
};

// ==============================================================================
// EVENT HISTORY MANAGEMENT (30-Event Rolling Limit)
// ==============================================================================

/**
 * Clear device event history (for "Learn New Pattern" feature)
 * @param {string} deviceId - Device ID
 * @returns {Promise<number>} Number of events cleared
 */
export const clearDeviceEventHistory = async (deviceId) => {
  try {
    console.log(`🧹 Clearing event history for device: ${deviceId}`);
    
    const eventsRef = collection(firestore, 'DEVICE', deviceId, 'eventHistory');
    const allEvents = await getDocs(eventsRef);
    
    let clearedCount = 0;
    const deletePromises = [];
    
    allEvents.docs.forEach(eventDoc => {
      deletePromises.push(deleteDoc(eventDoc.ref));
      clearedCount++;
    });
    
    await Promise.all(deletePromises);
    
    console.log(`✅ Cleared ${clearedCount} events from ${deviceId} history`);
    return clearedCount;
    
  } catch (error) {
    console.error('❌ Error clearing event history:', error);
    throw error;
  }
};

/**
 * Get device event history count
 * @param {string} deviceId - Device ID
 * @returns {Promise<number>} Number of events in history
 */
export const getEventHistoryCount = async (deviceId) => {
  try {
    const eventsRef = collection(firestore, 'DEVICE', deviceId, 'eventHistory');
    const eventsSnapshot = await getDocs(eventsRef);
    return eventsSnapshot.size;
  } catch (error) {
    console.error('❌ Error getting event history count:', error);
    return 0;
  }
};

/**
 * Log device event to eventHistory subcollection (enforces 30-event limit)
 * @param {string} deviceId - Device ID
 * @param {string} action - Action type
 * @param {string} status - Device status
 * @param {string} source - Event source
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Event ID or null
 */
export const logDeviceEvent = async (deviceId, action, status, source = 'manual', userId = null) => {
  try {
    const now = new Date();
    const eventData = {
      action: action,           // "TURN_ON", "TURN_OFF", etc.
      status: status,           // "ON", "OFF"
      timestamp: now,           // Use Date for Pi compatibility
      hour: now.getHours(),     // Essential for time patterns
      dayOfWeek: now.getDay(),  // Essential for day patterns
      source: source,           // "manual", "automation", "schedule"
      userId: userId || 'unknown'
    };
    
    const historyRef = collection(firestore, 'DEVICE', deviceId, 'eventHistory');
    
    // Check current count and enforce rolling limit
    const currentEvents = await getDocs(query(historyRef, orderBy('timestamp', 'asc')));
    
    if (currentEvents.size >= MAX_EVENT_HISTORY) {
      // Delete oldest events to make room
      const eventsToDelete = currentEvents.size - MAX_EVENT_HISTORY + 1;
      for (let i = 0; i < eventsToDelete; i++) {
        if (currentEvents.docs[i]) {
          await deleteDoc(currentEvents.docs[i].ref);
        }
      }
      console.log(`🧹 Deleted ${eventsToDelete} old events for ${deviceId} (rolling limit)`);
    }
    
    // Add new event
    const docRef = await addDoc(historyRef, eventData);
    
    console.log(`📝 Logged device event: ${deviceId} ${action} at ${now.toISOString()}`);
    return docRef.id;
    
  } catch (error) {
    console.error('❌ Error logging device event:', error);
    return null;
  }
};

/**
 * Get device event history for pattern analysis
 * @param {string} deviceId - Device ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of events
 */
export const getDeviceEventHistory = async (deviceId, startDate, endDate) => {
  try {
    console.log(`📊 Getting device history for ${deviceId}`);
    
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);
    
    const eventsQuery = query(
      collection(firestore, 'DEVICE', deviceId, 'eventHistory'),
      where('timestamp', '>=', startTimestamp),
      where('timestamp', '<=', endTimestamp),
      orderBy('timestamp', 'asc')
    );
    
    const eventsSnapshot = await getDocs(eventsQuery);
    const events = [];
    
    eventsSnapshot.docs.forEach(doc => {
      const eventData = doc.data();
      events.push({
        id: doc.id,
        action: eventData.action,
        status: eventData.status,
        timestamp: eventData.timestamp.toDate ? eventData.timestamp.toDate() : new Date(eventData.timestamp),
        hour: eventData.hour,
        dayOfWeek: eventData.dayOfWeek,
        source: eventData.source,
        userId: eventData.userId,
        isWeekend: eventData.dayOfWeek === 0 || eventData.dayOfWeek === 6
      });
    });
    
    console.log(`📊 Retrieved ${events.length} events from eventHistory`);
    return events;
    
  } catch (error) {
    console.error('❌ Error getting device event history:', error);
    return [];
  }
};

// ==============================================================================
// PATTERN DETECTION (Enhanced for Multi-Stage)
// ==============================================================================

/**
 * Group events into sessions based on time gaps
 */
const groupEventsIntoSessions = (events, gapMinutes = MINIMUM_STAGE_GAP_MINUTES) => {
  if (!events || events.length === 0) return [];
  
  const sessions = [];
  let currentSession = [];
  
  const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);
  
  for (const event of sortedEvents) {
    if (currentSession.length === 0) {
      currentSession.push(event);
    } else {
      const lastEvent = currentSession[currentSession.length - 1];
      const timeDiff = (event.timestamp - lastEvent.timestamp) / (1000 * 60); // minutes
      
      if (timeDiff <= gapMinutes) {
        currentSession.push(event);
      } else {
        // Gap is large enough - finish current session
        if (currentSession.length >= 2) {
          sessions.push([...currentSession]);
        }
        currentSession = [event];
      }
    }
  }
  
  // Don't forget the last session
  if (currentSession.length >= 2) {
    sessions.push(currentSession);
  }
  
  return sessions;
};

/**
 * Analyze device usage patterns for insights (enhanced for multi-stage)
 * @param {string} deviceId - Device ID
 * @param {number} analysisWindow - Days to analyze
 * @returns {Promise<Object>} Pattern analysis results
 */
export const detectDevicePatterns = async (deviceId, analysisWindow = 14) => {
  try {
    console.log(`🔍 Analyzing patterns for device ${deviceId} (${analysisWindow} days)`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - analysisWindow);
    
    const allEvents = await getDeviceEventHistory(deviceId, startDate, endDate);
    const turnOnEvents = allEvents.filter(event => event.action === 'TURN_ON');
    
    if (turnOnEvents.length < 3) {
      return {
        hasPatterns: false,
        message: `Need at least 3 usage events. Currently have ${turnOnEvents.length} events.`,
        patterns: [],
        summary: generateUsageSummary(allEvents, analysisWindow),
        analysisWindow,
        totalEvents: allEvents.length,
        turnOnEvents: turnOnEvents.length,
        multiStageAnalysis: {
          sessionsDetected: 0,
          avgSessionsPerDay: 0,
          potentialStages: 0
        }
      };
    }
    
    // Enhanced multi-stage analysis
    const multiStageAnalysis = analyzeMultiStagePatterns(allEvents, analysisWindow);
    const insights = analyzeUsageInsights(turnOnEvents, analysisWindow);
    const summary = generateUsageSummary(allEvents, analysisWindow);
    
    console.log(`🎯 Multi-stage pattern analysis completed: ${insights.length} insights generated`);
    
    return {
      hasPatterns: insights.length > 0 || multiStageAnalysis.sessionsDetected > 0,
      patterns: insights,
      summary: summary,
      analysisWindow,
      totalEvents: allEvents.length,
      turnOnEvents: turnOnEvents.length,
      multiStageAnalysis
    };
    
  } catch (error) {
    console.error('❌ Error analyzing patterns:', error);
    return { 
      hasPatterns: false, 
      patterns: [], 
      error: error.message,
      summary: { error: 'Analysis failed' },
      multiStageAnalysis: { error: 'Multi-stage analysis failed' }
    };
  }
};

/**
 * Analyze multi-stage usage patterns
 */
const analyzeMultiStagePatterns = (allEvents, totalDays) => {
  try {
    // Group events by day
    const dailyEvents = {};
    allEvents.forEach(event => {
      const dayKey = event.timestamp.toISOString().split('T')[0];
      if (!dailyEvents[dayKey]) dailyEvents[dayKey] = [];
      dailyEvents[dayKey].push(event);
    });
    
    let totalSessions = 0;
    let daysWithMultipleSessions = 0;
    let maxSessionsInDay = 0;
    
    Object.values(dailyEvents).forEach(dayEvents => {
      const sessions = groupEventsIntoSessions(dayEvents);
      totalSessions += sessions.length;
      
      if (sessions.length > 1) {
        daysWithMultipleSessions++;
      }
      
      if (sessions.length > maxSessionsInDay) {
        maxSessionsInDay = sessions.length;
      }
    });
    
    const avgSessionsPerDay = totalDays > 0 ? totalSessions / totalDays : 0;
    const multiStageScore = daysWithMultipleSessions / Math.max(Object.keys(dailyEvents).length, 1);
    
    return {
      sessionsDetected: totalSessions,
      avgSessionsPerDay: parseFloat(avgSessionsPerDay.toFixed(2)),
      daysWithMultipleSessions,
      maxSessionsInDay,
      multiStageScore: parseFloat(multiStageScore.toFixed(2)),
      potentialStages: maxSessionsInDay,
      recommendation: multiStageScore > 0.3 ? 
        'Device shows multi-stage usage patterns' : 
        'Device primarily used in single sessions'
    };
  } catch (error) {
    console.error('❌ Error analyzing multi-stage patterns:', error);
    return {
      sessionsDetected: 0,
      avgSessionsPerDay: 0,
      potentialStages: 0,
      error: 'Multi-stage analysis failed'
    };
  }
};

/**
 * Generate insights from usage data (enhanced for multi-stage)
 * @param {Array} turnOnEvents - Turn-on events
 * @param {number} totalDays - Analysis window
 * @returns {Array} Usage insights
 */
const analyzeUsageInsights = (turnOnEvents, totalDays) => {
  const insights = [];
  
  // Time usage insights
  const hourFrequency = {};
  turnOnEvents.forEach(event => {
    hourFrequency[event.hour] = (hourFrequency[event.hour] || 0) + 1;
  });
  
  // Find top 3 most active hours for multi-stage detection
  const topHours = Object.entries(hourFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);
  
  if (topHours.length >= 2) {
    const [firstHour, secondHour] = topHours;
    const hourGap = Math.abs(parseInt(firstHour[0]) - parseInt(secondHour[0]));
    
    if (hourGap >= 2) { // Significant gap between peak hours
      insights.push({
        type: 'multi_peak_insight',
        title: 'Multiple Usage Peaks Detected',
        description: `Device has distinct usage peaks at ${formatHour(firstHour[0])} and ${formatHour(secondHour[0])}`,
        confidence: (firstHour[1] + secondHour[1]) / totalDays,
        details: `Primary peak: ${firstHour[1]} times, Secondary peak: ${secondHour[1]} times`,
        recommendation: 'Excellent candidate for multi-stage automation'
      });
    }
  }
  
  // Peak usage hour
  if (topHours.length > 0) {
    const [peakHour, peakCount] = topHours[0];
    const usageRate = peakCount / totalDays;
    
    if (usageRate > 0.3) { // Used more than 30% of days at this hour
      insights.push({
        type: 'peak_hour_insight',
        title: `Peak Usage at ${formatHour(peakHour)}`,
        description: `Device is most commonly turned on at ${formatHour(peakHour)}`,
        confidence: usageRate,
        details: `Used ${peakCount} times out of ${totalDays} days (${Math.round(usageRate * 100)}%)`,
        recommendation: usageRate > 0.7 ? 'Highly predictable pattern - perfect for automation' : 'Good automation candidate'
      });
    }
  }
  
  // Day of week patterns
  const dayFrequency = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  turnOnEvents.forEach(event => {
    const dayName = dayNames[event.dayOfWeek];
    dayFrequency[dayName] = (dayFrequency[dayName] || 0) + 1;
  });
  
  // Weekday vs weekend usage
  const weekdayEvents = turnOnEvents.filter(event => event.dayOfWeek >= 1 && event.dayOfWeek <= 5);
  const weekendEvents = turnOnEvents.filter(event => event.dayOfWeek === 0 || event.dayOfWeek === 6);
  
  if (weekdayEvents.length > 0 && weekendEvents.length === 0) {
    insights.push({
      type: 'weekday_only_insight',
      title: 'Weekday-Only Usage Pattern',
      description: 'Device is only used on weekdays',
      confidence: 1.0,
      details: `${weekdayEvents.length} weekday events, ${weekendEvents.length} weekend events`,
      recommendation: 'Perfect for weekday-only automation schedule'
    });
  } else if (weekendEvents.length > 0 && weekdayEvents.length === 0) {
    insights.push({
      type: 'weekend_only_insight',
      title: 'Weekend-Only Usage Pattern',
      description: 'Device is only used on weekends',
      confidence: 1.0,
      details: `${weekendEvents.length} weekend events, ${weekdayEvents.length} weekday events`,
      recommendation: 'Perfect for weekend-only automation schedule'
    });
  } else if (weekdayEvents.length > 0 && weekendEvents.length > 0) {
    const weekdayRatio = weekdayEvents.length / (weekdayEvents.length + weekendEvents.length);
    
    if (weekdayRatio > 0.8) {
      insights.push({
        type: 'weekday_dominant_insight',
        title: 'Primarily Weekday Usage',
        description: 'Device is used mostly on weekdays with occasional weekend use',
        confidence: weekdayRatio,
        details: `${Math.round(weekdayRatio * 100)}% weekday usage`,
        recommendation: 'Consider separate weekday and weekend schedules'
      });
    } else if (weekdayRatio < 0.2) {
      insights.push({
        type: 'weekend_dominant_insight',
        title: 'Primarily Weekend Usage',
        description: 'Device is used mostly on weekends with occasional weekday use',
        confidence: 1 - weekdayRatio,
        details: `${Math.round((1 - weekdayRatio) * 100)}% weekend usage`,
        recommendation: 'Consider separate weekend and weekday schedules'
      });
    }
  }
  
  // Consistency insights
  const uniqueHours = Object.keys(hourFrequency).length;
  const consistencyScore = topHours.length > 0 ? topHours[0][1] / turnOnEvents.length : 0;
  
  if (consistencyScore > 0.6) {
    insights.push({
      type: 'high_consistency_insight',
      title: 'Highly Consistent Usage',
      description: 'Device usage shows very consistent timing patterns',
      confidence: consistencyScore,
      details: `${Math.round(consistencyScore * 100)}% of usage at peak hour`,
      recommendation: 'Excellent reliability for automated scheduling'
    });
  } else if (uniqueHours > 8) {
    insights.push({
      type: 'variable_usage_insight',
      title: 'Variable Usage Pattern',
      description: 'Device usage varies significantly throughout the day',
      confidence: 1 - consistencyScore,
      details: `Used across ${uniqueHours} different hours`,
      recommendation: 'Consider flexible or adaptive automation'
    });
  }
  
  return insights;
};

/**
 * Generate usage summary
 * @param {Array} allEvents - All events
 * @param {number} analysisWindow - Analysis window in days
 * @returns {Object} Usage summary
 */
const generateUsageSummary = (allEvents, analysisWindow) => {
  if (allEvents.length === 0) {
    return {
      totalEvents: 0,
      avgEventsPerDay: 0,
      mostActiveDay: 'No data',
      mostActiveHour: 'No data',
      usagePattern: 'No usage detected'
    };
  }
  
  const turnOnEvents = allEvents.filter(event => event.action === 'TURN_ON');
  const avgEventsPerDay = turnOnEvents.length / analysisWindow;
  
  // Most active day
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayFrequency = {};
  
  turnOnEvents.forEach(event => {
    const dayName = dayNames[event.dayOfWeek];
    dayFrequency[dayName] = (dayFrequency[dayName] || 0) + 1;
  });
  
  const mostActiveDay = Object.entries(dayFrequency)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'No data';
  
  // Most active hour
  const hourFrequency = {};
  turnOnEvents.forEach(event => {
    hourFrequency[event.hour] = (hourFrequency[event.hour] || 0) + 1;
  });
  
  const mostActiveHourData = Object.entries(hourFrequency)
    .sort(([,a], [,b]) => b - a)[0];
  const mostActiveHour = mostActiveHourData ? formatHour(mostActiveHourData[0]) : 'No data';
  
  // Usage pattern classification
  let usagePattern = 'Irregular';
  if (avgEventsPerDay > 1) {
    usagePattern = 'Heavy usage';
  } else if (avgEventsPerDay > 0.5) {
    usagePattern = 'Regular usage';
  } else if (avgEventsPerDay > 0.1) {
    usagePattern = 'Light usage';
  } else {
    usagePattern = 'Minimal usage';
  }
  
  return {
    totalEvents: allEvents.length,
    turnOnEvents: turnOnEvents.length,
    avgEventsPerDay: parseFloat(avgEventsPerDay.toFixed(1)),
    mostActiveDay,
    mostActiveHour,
    usagePattern,
    analysisWindow
  };
};

// ==============================================================================
// MULTI-STAGE VALIDATION HELPERS
// ==============================================================================

/**
 * Validate multi-stage configuration
 * @param {Array} stageConfig - Multi-stage configuration
 * @returns {Object} Validation result
 */
export const validateStageConfiguration = (stageConfig) => {
  const errors = [];
  const warnings = [];
  let totalStages = 0;
  
  if (!Array.isArray(stageConfig) || stageConfig.length === 0) {
    errors.push('No stage configuration provided');
    return { isValid: false, errors, warnings, stageCount: 0 };
  }
  
  stageConfig.forEach((dayConfig, dayIndex) => {
    const day = dayConfig.day;
    const stages = dayConfig.stages || [];
    
    if (!day) {
      errors.push(`Day ${dayIndex + 1}: Missing day name`);
      return;
    }
    
    if (stages.length === 0) {
      warnings.push(`${day}: No stages defined`);
      return;
    }
    
    // NEW: Check maximum stages per day limit
    if (stages.length > MAX_STAGES_PER_DAY) {
      errors.push(`${day}: Too many stages (${stages.length}). Maximum ${MAX_STAGES_PER_DAY} stages allowed per day`);
      return;
    }
    
    stages.forEach((stage, stageIndex) => {
      totalStages++;
      
      if (!stage.start || !stage.end) {
        errors.push(`${day} Stage ${stageIndex + 1}: Missing start or end time`);
        return;
      }
      
      // Convert time strings to minutes for comparison
      const startMinutes = timeToMinutes(stage.start);
      const endMinutes = timeToMinutes(stage.end);
      
      if (startMinutes >= endMinutes) {
        errors.push(`${day} Stage ${stageIndex + 1}: Start time (${stage.start}) must be before end time (${stage.end})`);
      }
      
      // Check minimum duration (at least 15 minutes)
      if (endMinutes - startMinutes < 15) {
        warnings.push(`${day} Stage ${stageIndex + 1}: Very short duration (${endMinutes - startMinutes} minutes)`);
      }
    });
    
    // Check for overlapping stages within the same day
    for (let i = 0; i < stages.length - 1; i++) {
      for (let j = i + 1; j < stages.length; j++) {
        const stage1 = stages[i];
        const stage2 = stages[j];
        
        const start1 = timeToMinutes(stage1.start);
        const end1 = timeToMinutes(stage1.end);
        const start2 = timeToMinutes(stage2.start);
        const end2 = timeToMinutes(stage2.end);
        
        if ((start1 < end2 && end1 > start2)) {
          errors.push(`${day}: Overlapping stages detected (${stage1.start}-${stage1.end} and ${stage2.start}-${stage2.end})`);
        }
      }
    }
    
    // Check gaps between stages
    const sortedStages = [...stages].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    for (let i = 0; i < sortedStages.length - 1; i++) {
      const currentEnd = timeToMinutes(sortedStages[i].end);
      const nextStart = timeToMinutes(sortedStages[i + 1].start);
      const gap = nextStart - currentEnd;
      
      if (gap < MINIMUM_STAGE_GAP_MINUTES) {
        warnings.push(`${day}: Short gap (${gap} min) between stages ${sortedStages[i].end} and ${sortedStages[i + 1].start}`);
      }
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stageCount: totalStages
  };
};

/**
 * Convert HH:MM time string to minutes since midnight
 * @param {string} timeStr - Time string in HH:MM format
 * @returns {number} Minutes since midnight
 */
const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours, minutes] = timeStr.split(':').map(num => parseInt(num, 10));
  return (hours * 60) + minutes;
};

/**
 * Convert minutes since midnight to HH:MM format
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time string in HH:MM format
 */
const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// ==============================================================================
// EXPORTS
// ==============================================================================

const AutomationService = {
  // Pi Automation Rule Management
  getPiAutomationRule,
  createManualPiRule,
  updatePiAutomationRule,
  deletePiAutomationRule,
  
  // Event History Management
  clearDeviceEventHistory,
  getEventHistoryCount,
  logDeviceEvent,
  getDeviceEventHistory,
  
  // Pattern Detection
  detectDevicePatterns,
  
  // Multi-Stage Validation
  validateStageConfiguration,
  
  // Utility Functions
  formatTimeDisplay,
  formatHour,
  formatMultiStageSchedule,
  
  // Constants
  MINIMUM_STAGE_GAP_MINUTES,
  MAX_EVENT_HISTORY,
  MAX_STAGES_PER_DAY
};

export default AutomationService;