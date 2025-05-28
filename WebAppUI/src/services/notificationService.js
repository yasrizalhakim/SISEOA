// src/services/notificationService.js - Optimized Notification Management Service

import { firestore } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDocs,
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  Timestamp
} from 'firebase/firestore';

// Notification types enum
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  REQUEST: 'request',      // For approval requests (child registration)
  INVITATION: 'invitation' // For invitations (parent inviting child)
};

// Notification priorities for cleanup (higher number = higher priority to keep)
const NOTIFICATION_PRIORITIES = {
  [NOTIFICATION_TYPES.REQUEST]: 5,
  [NOTIFICATION_TYPES.INVITATION]: 4,
  [NOTIFICATION_TYPES.ERROR]: 3,
  [NOTIFICATION_TYPES.WARNING]: 2,
  [NOTIFICATION_TYPES.SUCCESS]: 1,
  [NOTIFICATION_TYPES.INFO]: 1
};

// Cache for active listeners to prevent memory leaks
const activeListeners = new Map();

// Cache for notification counts
const notificationCountCache = new Map();

// ==============================================================================
// OPTIMIZED LISTENER MANAGEMENT
// ==============================================================================

/**
 * Set up optimized real-time listener for notifications
 * @param {string} userEmail - User's email
 * @param {Function} callback - Callback function for updates
 * @param {Object} options - Listener options
 * @returns {Function} Unsubscribe function
 */
export const setupNotificationListener = (userEmail, callback, options = {}) => {
  // Clean up existing listener for this user
  cleanupListener(userEmail);

  const {
    realTime = true,
    maxNotifications = 50,
    daysBack = 30,
    unreadOnly = false
  } = options;

  // Calculate date threshold
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysBack);

  // Build query
  let notificationQuery = query(
    collection(firestore, 'NOTIFICATION'),
    where('UserID', '==', userEmail),
    where('CreatedAt', '>=', Timestamp.fromDate(dateThreshold)),
    orderBy('CreatedAt', 'desc'),
    limit(maxNotifications)
  );

  // Add unread filter if specified
  if (unreadOnly) {
    notificationQuery = query(
      collection(firestore, 'NOTIFICATION'),
      where('UserID', '==', userEmail),
      where('IsRead', '==', false),
      where('CreatedAt', '>=', Timestamp.fromDate(dateThreshold)),
      orderBy('CreatedAt', 'desc'),
      limit(maxNotifications)
    );
  }

  console.log('🔔 Setting up notification listener for:', userEmail);

  const unsubscribe = onSnapshot(
    notificationQuery,
    (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Update count cache
      const unreadCount = notifications.filter(n => !n.IsRead).length;
      notificationCountCache.set(userEmail, unreadCount);

      console.log('🔔 Notifications updated:', {
        total: notifications.length,
        unread: unreadCount,
        user: userEmail
      });

      callback(notifications, unreadCount);
    },
    (error) => {
      console.error('❌ Notification listener error:', error);
      callback([], 0, error);
    }
  );

  // Store listener for cleanup
  activeListeners.set(userEmail, unsubscribe);

  return unsubscribe;
};

/**
 * Setup lightweight listener for notification count only
 * @param {string} userEmail - User's email
 * @param {Function} callback - Callback function for count updates
 * @returns {Function} Unsubscribe function
 */
export const setupNotificationCountListener = (userEmail, callback) => {
  const countQuery = query(
    collection(firestore, 'NOTIFICATION'),
    where('UserID', '==', userEmail),
    where('IsRead', '==', false),
    limit(10) // Limit to reduce data transfer
  );

  console.log('🔢 Setting up notification count listener for:', userEmail);

  return onSnapshot(
    countQuery,
    (snapshot) => {
      const unreadCount = snapshot.size;
      notificationCountCache.set(userEmail, unreadCount);
      console.log('🔢 Notification count updated:', unreadCount);
      callback(unreadCount);
    },
    (error) => {
      console.error('❌ Notification count listener error:', error);
      callback(0, error);
    }
  );
};

/**
 * Clean up listener for a specific user
 * @param {string} userEmail - User's email
 */
export const cleanupListener = (userEmail) => {
  const unsubscribe = activeListeners.get(userEmail);
  if (unsubscribe) {
    unsubscribe();
    activeListeners.delete(userEmail);
    console.log('🧹 Cleaned up listener for:', userEmail);
  }
};

/**
 * Clean up all active listeners
 */
export const cleanupAllListeners = () => {
  activeListeners.forEach((unsubscribe, userEmail) => {
    unsubscribe();
    console.log('🧹 Cleaned up listener for:', userEmail);
  });
  activeListeners.clear();
  notificationCountCache.clear();
};

// ==============================================================================
// NOTIFICATION CREATION FUNCTIONS
// ==============================================================================

/**
 * Create a notification for a user with automatic cleanup
 * @param {string} userId - Target user's email
 * @param {string} type - Notification type from NOTIFICATION_TYPES
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data for the notification
 * @param {boolean} actionRequired - Whether the notification requires user action
 * @param {Array} actions - Available actions ['accept', 'deny', etc.]
 * @returns {Promise<string>} Notification ID
 */
export const createNotification = async (userId, type, title, message, data = {}, actionRequired = false, actions = []) => {
  try {
    // Generate unique notification ID
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const randomId = Math.random().toString(36).substr(2, 4);
    const notificationId = `${userId.replace(/[@.]/g, '_')}_${dateStr}_${timeStr}_${randomId}`;

    // Prepare notification data
    const notificationData = {
      NotificationID: notificationId,
      UserID: userId,
      NotificationType: type,
      IsRead: false,
      Title: title,
      Message: message,
      Data: data,
      CreatedAt: serverTimestamp(),
      ActionRequired: actionRequired,
      Actions: actions,
      Priority: NOTIFICATION_PRIORITIES[type] || 1
    };

    // Add expiration for requests and invitations (24 hours)
    if (type === NOTIFICATION_TYPES.REQUEST || type === NOTIFICATION_TYPES.INVITATION) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      notificationData.ExpiresAt = Timestamp.fromDate(expiresAt);
    }

    // Clean up old notifications before creating new one
    await cleanupOldNotifications(userId);

    // Create the notification
    await setDoc(doc(firestore, 'NOTIFICATION', notificationId), notificationData);
    
    console.log('✅ Notification created:', {
      id: notificationId,
      type,
      title,
      user: userId
    });

    return notificationId;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

/**
 * Clean up old notifications to maintain limit (50 per user)
 * @param {string} userId - User's email
 * @param {number} maxNotifications - Maximum notifications to keep
 */
const cleanupOldNotifications = async (userId, maxNotifications = 50) => {
  try {
    // Get all notifications for user
    const userNotificationsQuery = query(
      collection(firestore, 'NOTIFICATION'),
      where('UserID', '==', userId),
      orderBy('CreatedAt', 'desc')
    );

    const snapshot = await getDocs(userNotificationsQuery);
    
    if (snapshot.size <= maxNotifications) {
      return; // No cleanup needed
    }

    // Sort notifications by priority and recency
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort by: unread first, then priority, then recency
    notifications.sort((a, b) => {
      // Unread notifications have higher priority
      if (a.IsRead !== b.IsRead) {
        return a.IsRead ? 1 : -1;
      }
      
      // Then by notification priority
      const aPriority = a.Priority || NOTIFICATION_PRIORITIES[a.NotificationType] || 1;
      const bPriority = b.Priority || NOTIFICATION_PRIORITIES[b.NotificationType] || 1;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Finally by recency
      const aTime = a.CreatedAt?.seconds || 0;
      const bTime = b.CreatedAt?.seconds || 0;
      return bTime - aTime;
    });

    // Keep only the most important notifications
    const toKeep = notifications.slice(0, maxNotifications);
    const toDelete = notifications.slice(maxNotifications);

    if (toDelete.length > 0) {
      // Batch delete old notifications
      const batch = writeBatch(firestore);
      
      toDelete.forEach(notification => {
        batch.delete(doc(firestore, 'NOTIFICATION', notification.id));
      });

      await batch.commit();
      
      console.log(`🧹 Cleaned up ${toDelete.length} old notifications for ${userId}`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up notifications:', error);
    // Don't throw - cleanup failure shouldn't prevent notification creation
  }
};

// ==============================================================================
// BATCH OPERATIONS FOR EFFICIENCY
// ==============================================================================

/**
 * Mark multiple notifications as read in a single batch
 * @param {Array} notificationIds - Array of notification IDs
 * @returns {Promise<void>}
 */
export const markNotificationsAsRead = async (notificationIds) => {
  if (!notificationIds.length) return;

  try {
    const batch = writeBatch(firestore);
    const readAt = serverTimestamp();

    notificationIds.forEach(notificationId => {
      batch.update(doc(firestore, 'NOTIFICATION', notificationId), {
        IsRead: true,
        ReadAt: readAt
      });
    });

    await batch.commit();
    
    console.log(`✅ Marked ${notificationIds.length} notifications as read`);
  } catch (error) {
    console.error('❌ Error marking notifications as read:', error);
    throw error;
  }
};

/**
 * Mark all notifications as read for a user
 * @param {string} userId - User's email
 * @returns {Promise<number>} Number of notifications marked as read
 */
export const markAllNotificationsAsRead = async (userId) => {
  try {
    // Get all unread notifications
    const unreadQuery = query(
      collection(firestore, 'NOTIFICATION'),
      where('UserID', '==', userId),
      where('IsRead', '==', false)
    );

    const snapshot = await getDocs(unreadQuery);
    
    if (snapshot.empty) {
      return 0;
    }

    // Batch update all unread notifications
    const batch = writeBatch(firestore);
    const readAt = serverTimestamp();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        IsRead: true,
        ReadAt: readAt
      });
    });

    await batch.commit();
    
    // Update cache
    notificationCountCache.set(userId, 0);
    
    console.log(`✅ Marked ${snapshot.size} notifications as read for ${userId}`);
    return snapshot.size;
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    throw error;
  }
};

// ==============================================================================
// SPECIFIC NOTIFICATION CREATORS
// ==============================================================================

/**
 * Create child registration request notification for parent
 * @param {string} parentEmail - Parent's email
 * @param {string} childEmail - Child's email
 * @param {string} childName - Child's name
 */
export const createChildRegistrationRequestNotification = async (parentEmail, childEmail, childName) => {
  return await createNotification(
    parentEmail,
    NOTIFICATION_TYPES.REQUEST,
    'Child Registration Request',
    `${childName} (${childEmail}) wants to join as a child using your email address.`,
    {
      childEmail,
      childName,
      parentEmail,
      requestType: 'child_registration'
    },
    true,
    ['accept', 'deny']
  );
};

/**
 * Create device claim notification for SystemAdmin
 * @param {string} adminEmail - SystemAdmin email
 * @param {string} deviceId - Device ID
 * @param {string} userEmail - User who claimed the device
 */
export const createDeviceClaimNotification = async (adminEmail, deviceId, userEmail) => {
  return await createNotification(
    adminEmail,
    NOTIFICATION_TYPES.INFO,
    'Device Claimed',
    `Device ${deviceId} has been claimed by ${userEmail}.`,
    {
      deviceId,
      claimedBy: userEmail,
      claimedAt: new Date().toISOString()
    }
  );
};

/**
 * Create device unclaim notification for SystemAdmin
 * @param {string} adminEmail - SystemAdmin email
 * @param {string} deviceId - Device ID
 * @param {string} userEmail - User who unclaimed the device
 */
export const createDeviceUnclaimNotification = async (adminEmail, deviceId, userEmail) => {
  return await createNotification(
    adminEmail,
    NOTIFICATION_TYPES.INFO,
    'Device Unclaimed',
    `Device ${deviceId} has been unclaimed by ${userEmail}.`,
    {
      deviceId,
      unclaimedBy: userEmail,
      unclaimedAt: new Date().toISOString()
    }
  );
};

/**
 * Create location assignment notification
 * @param {string} userEmail - Target user email
 * @param {string} locationName - Location name
 * @param {string} buildingName - Building name
 * @param {boolean} isParent - Whether this is for the parent or child
 * @param {string} targetUserEmail - The user being assigned (for parent notifications)
 */
export const createLocationAssignmentNotification = async (userEmail, locationName, buildingName, isParent = false, targetUserEmail = null) => {
  const message = isParent 
    ? `${targetUserEmail} has been assigned to ${locationName} in ${buildingName}.`
    : `You have been assigned to ${locationName} in ${buildingName}.`;

  const title = isParent ? 'Child Location Assignment' : 'Location Access Granted';

  return await createNotification(
    userEmail,
    NOTIFICATION_TYPES.SUCCESS,
    title,
    message,
    {
      locationName,
      buildingName,
      assignedUser: targetUserEmail || userEmail,
      assignedAt: new Date().toISOString()
    }
  );
};

/**
 * Create location removal notification
 * @param {string} userEmail - Target user email
 * @param {string} locationName - Location name
 * @param {string} buildingName - Building name
 * @param {boolean} isParent - Whether this is for the parent or child
 * @param {string} targetUserEmail - The user being unassigned (for parent notifications)
 */
export const createLocationRemovalNotification = async (userEmail, locationName, buildingName, isParent = false, targetUserEmail = null) => {
  const message = isParent 
    ? `${targetUserEmail} has been removed from ${locationName} in ${buildingName}.`
    : `Your access to ${locationName} in ${buildingName} has been removed.`;

  const title = isParent ? 'Child Location Removal' : 'Location Access Removed';

  return await createNotification(
    userEmail,
    NOTIFICATION_TYPES.INFO,
    title,
    message,
    {
      locationName,
      buildingName,
      removedUser: targetUserEmail || userEmail,
      removedAt: new Date().toISOString()
    }
  );
};

/**
 * Create success notification for user actions
 * @param {string} userEmail - User email
 * @param {string} action - Action performed
 * @param {string} subject - Subject of the action
 * @param {Object} additionalData - Additional data
 */
export const createSuccessNotification = async (userEmail, action, subject, additionalData = {}) => {
  return await createNotification(
    userEmail,
    NOTIFICATION_TYPES.SUCCESS,
    `${action} Successful`,
    `${subject} has been ${action.toLowerCase()} successfully.`,
    {
      action,
      subject,
      completedAt: new Date().toISOString(),
      ...additionalData
    }
  );
};

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

/**
 * Get cached notification count for a user
 * @param {string} userEmail - User's email
 * @returns {number} Cached unread count or 0
 */
export const getCachedNotificationCount = (userEmail) => {
  return notificationCountCache.get(userEmail) || 0;
};

/**
 * Process notification action (accept/deny)
 * @param {Object} notification - Notification object
 * @param {string} action - Action taken
 * @returns {Promise<void>}
 */
export const processNotificationAction = async (notification, action) => {
  try {
    // Update notification as processed
    await updateDoc(doc(firestore, 'NOTIFICATION', notification.id), {
      IsRead: true,
      ProcessedAt: serverTimestamp(),
      ProcessedAction: action
    });

    console.log(`✅ Processed notification ${notification.id} with action: ${action}`);
  } catch (error) {
    console.error('❌ Error processing notification action:', error);
    throw error;
  }
};

// ==============================================================================
// PERIODIC CHECK FUNCTION (Fallback)
// ==============================================================================

/**
 * Perform periodic check for new notifications (fallback for when real-time is not active)
 * @param {string} userEmail - User's email
 * @returns {Promise<number>} Unread notification count
 */
export const performPeriodicNotificationCheck = async (userEmail) => {
  try {
    const unreadQuery = query(
      collection(firestore, 'NOTIFICATION'),
      where('UserID', '==', userEmail),
      where('IsRead', '==', false),
      limit(10) // Limit to reduce reads
    );

    const snapshot = await getDocs(unreadQuery);
    const unreadCount = snapshot.size;
    
    // Update cache
    notificationCountCache.set(userEmail, unreadCount);
    
    console.log(`🔄 Periodic check: ${unreadCount} unread notifications for ${userEmail}`);
    return unreadCount;
  } catch (error) {
    console.error('❌ Error in periodic notification check:', error);
    return 0;
  }
};

export default {
  // Listener management
  setupNotificationListener,
  setupNotificationCountListener,
  cleanupListener,
  cleanupAllListeners,
  
  // Notification creation
  createNotification,
  createChildRegistrationRequestNotification,
  createDeviceClaimNotification,
  createDeviceUnclaimNotification,
  createLocationAssignmentNotification,
  createLocationRemovalNotification,
  createSuccessNotification,
  
  // Batch operations
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  processNotificationAction,
  
  // Utilities
  getCachedNotificationCount,
  performPeriodicNotificationCheck,
  
  // Constants
  NOTIFICATION_TYPES
};