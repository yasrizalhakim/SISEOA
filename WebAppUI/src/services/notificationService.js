// src/services/notificationService.js - Fixed checkUserPendingApproval function

import { firestore } from './firebase';
import { addDoc, collection, serverTimestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

/**
 * Simplified notification service with role-based notifications
 * Creates notifications in NOTIFICATION collection with auto-generated IDs
 */

// Notification types
export const NOTIFICATION_TYPES = {
  SYSTEM: 'system',
  APPROVAL: 'approval', 
  INFO: 'info',
  ACTION_REQUIRED: 'action_required'
};

// User roles
export const USER_ROLES = {
  SYSTEM_ADMIN: 'systemAdmin',
  PARENT: 'parent', 
  CHILDREN: 'children'
};

/**
 * Core function to create notifications in Firestore
 * @param {Object} notificationData - Notification data
 * @returns {Promise<string>} Document ID of created notification
 */
const createNotification = async ({
  title,
  message,
  role,
  userId = null,
  type,
  actions = null
}) => {
  try {
    const notificationData = {
      title,
      message,
      role,
      userId,
      type,
      timestamp: serverTimestamp(),
      read: false
    };

    // Add actions if provided
    if (actions && (type === NOTIFICATION_TYPES.APPROVAL || type === NOTIFICATION_TYPES.ACTION_REQUIRED)) {
      notificationData.actions = actions;
    }

    console.log('📢 Creating notification:', notificationData);

    // Use addDoc for auto-generated ID
    const docRef = await addDoc(collection(firestore, 'NOTIFICATION'), notificationData);
    
    console.log('✅ Notification created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

/**
 * Get SystemAdmin email (first SystemAdmin found)
 * @returns {Promise<string|null>} SystemAdmin email or null
 */
const getSystemAdminEmail = async () => {
  try {
    const systemAdminQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', 'SystemAdmin'),
      where('Role', '==', 'admin'),
      limit(1)
    );
    
    const snapshot = await getDocs(systemAdminQuery);
    if (!snapshot.empty) {
      return snapshot.docs[0].data().User;
    }
    return null;
  } catch (error) {
    console.error('Error getting SystemAdmin email:', error);
    return null;
  }
};

/**
 * SystemAdmin Notifications
 */

/**
 * Notify SystemAdmin when new device is registered
 */
export const notifyDeviceRegistered = async (deviceName, deviceId, registeredBy) => {
  const systemAdminEmail = await getSystemAdminEmail();
  if (!systemAdminEmail) {
    console.log('No SystemAdmin found, skipping notification');
    return null;
  }

  return await createNotification({
    title: 'New Device Registered',
    message: `Device ${deviceName} has been successfully added.`,
    role: USER_ROLES.SYSTEM_ADMIN,
    userId: systemAdminEmail,
    type: NOTIFICATION_TYPES.SYSTEM
  });
};

/**
 * Notify SystemAdmin when device is deleted
 */
export const notifyDeviceDeleted = async (deviceName, deviceId, deletedBy) => {
  const systemAdminEmail = await getSystemAdminEmail();
  if (!systemAdminEmail) return null;

  return await createNotification({
    title: 'Device Deleted',
    message: `Device ${deviceName} has been deleted by ${deletedBy}.`,
    role: USER_ROLES.SYSTEM_ADMIN,
    userId: systemAdminEmail,
    type: NOTIFICATION_TYPES.SYSTEM
  });
};

/**
 * Parent Notifications  
 */

/**
 * Notify parent when new user requests to join with their email
 */
export const notifyNewUserRequest = async (parentEmail, childName, childEmail) => {
  return await createNotification({
    title: 'New User Request',
    message: `A user has requested to join your building.`,
    role: USER_ROLES.PARENT,
    userId: parentEmail,
    type: NOTIFICATION_TYPES.APPROVAL,
    actions: {
      acceptLabel: 'Approve',
      declineLabel: 'Reject'
    }
  });
};

/**
 * Notify parent when they claim a device and create building
 */
export const notifyDeviceClaimed = async (parentEmail, deviceName, buildingName) => {
  return await createNotification({
    title: 'Device Claimed',
    message: `You have claimed ${deviceName} and created a building.`,
    role: USER_ROLES.PARENT,
    userId: parentEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Notify parent when building is created
 */
export const notifyBuildingCreated = async (parentEmail, buildingName) => {
  return await createNotification({
    title: 'Building Created',
    message: `Your building "${buildingName}" has been successfully created.`,
    role: USER_ROLES.PARENT,
    userId: parentEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Notify parent when building is deleted
 */
export const notifyBuildingDeleted = async (parentEmail, buildingName) => {
  return await createNotification({
    title: 'Building Deleted',
    message: `Your building "${buildingName}" has been deleted.`,
    role: USER_ROLES.PARENT,
    userId: parentEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Notify parent when their device is deleted
 */
export const notifyParentDeviceDeleted = async (parentEmail, deviceName, buildingName) => {
  return await createNotification({
    title: 'Device Deleted',
    message: `Device ${deviceName} in building "${buildingName}" has been deleted by an administrator.`,
    role: USER_ROLES.PARENT,
    userId: parentEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Notify parent when invitation is sent to child
 */
export const notifyInvitationSent = async (parentEmail, childName, buildingName) => {
  return await createNotification({
    title: 'Invitation Sent', 
    message: `You've invited ${childName} to join your building.`,
    role: USER_ROLES.PARENT,
    userId: parentEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Notify parent when child responds to invitation
 */
export const notifyInvitationResponse = async (parentEmail, childName, response, buildingName) => {
  return await createNotification({
    title: 'Invitation Response',
    message: `${childName} has ${response} your building invitation.`,
    role: USER_ROLES.PARENT,
    userId: parentEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Children Notifications
 */

/**
 * Notify child when receiving building invitation
 */
export const notifyBuildingInvitation = async (childEmail, buildingName, parentName) => {
  return await createNotification({
    title: 'Building Invitation',
    message: `You've been invited to join ${buildingName}.`,
    role: USER_ROLES.CHILDREN,
    userId: childEmail,
    type: NOTIFICATION_TYPES.ACTION_REQUIRED,
    actions: {
      acceptLabel: 'Join',
      declineLabel: 'Decline'
    }
  });
};

/**
 * Notify child when location is assigned to them
 */
export const notifyLocationAssigned = async (childEmail, locationName, buildingName) => {
  return await createNotification({
    title: 'Location Assigned',
    message: `You've been assigned to ${locationName} in ${buildingName}.`,
    role: USER_ROLES.CHILDREN,
    userId: childEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Get user notifications with filters
 */
export const getUserNotifications = async (userEmail, filters = {}) => {
  try {
    let q = query(
      collection(firestore, 'NOTIFICATION'),
      where('userId', '==', userEmail),
      orderBy('timestamp', 'desc')
    );

    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }

    const snapshot = await getDocs(q);
    let notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Apply filters
    if (filters.type && filters.type !== 'all') {
      notifications = notifications.filter(n => n.type === filters.type);
    }

    if (filters.read !== undefined) {
      notifications = notifications.filter(n => n.read === filters.read);
    }

    return notifications;
  } catch (error) {
    console.error('Error getting user notifications:', error);
    return [];
  }
};

/**
 * FIXED: Check if user has pending approval
 * This function now properly validates the userEmail string parameter
 */
export const checkUserPendingApproval = async (userEmail) => {
  try {
    // Validate input parameter
    if (!userEmail || typeof userEmail !== 'string') {
      console.log('Invalid userEmail provided to checkUserPendingApproval');
      return false;
    }

    console.log('🔍 Checking pending approval for:', userEmail);

    // Check if user exists in USERBUILDING with any role
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail)
    );
    
    const snapshot = await getDocs(userBuildingQuery);
    
    // If user has building associations, they are not pending
    if (!snapshot.empty) {
      console.log('✅ User has building associations, not pending approval');
      return false;
    }
    
    // Check if there are approval notifications for this user
    // Query for approval type notifications
    const approvalQuery = query(
      collection(firestore, 'NOTIFICATION'),
      where('type', '==', NOTIFICATION_TYPES.APPROVAL)
    );
    
    const approvalSnapshot = await getDocs(approvalQuery);
    
    // Look for notifications mentioning this user
    for (const doc of approvalSnapshot.docs) {
      const data = doc.data();
      if (data.message && typeof data.message === 'string' && data.message.includes(userEmail)) {
        console.log('⏳ Found pending approval notification for user');
        return true; // User is pending approval
      }
    }
    
    console.log('❌ No pending approval found for user');
    return false;
  } catch (error) {
    console.error('❌ Error checking pending approval:', error);
    return false;
  }
};

export default {
  // SystemAdmin notifications
  notifyDeviceRegistered,
  notifyDeviceDeleted,
  
  // Parent notifications
  notifyNewUserRequest,
  notifyDeviceClaimed,
  notifyBuildingCreated,
  notifyBuildingDeleted,
  notifyParentDeviceDeleted,
  notifyInvitationSent, 
  notifyInvitationResponse,
  
  // Children notifications
  notifyBuildingInvitation,
  notifyLocationAssigned,
  
  // Utilities
  getUserNotifications,
  checkUserPendingApproval,
  
  // Constants
  NOTIFICATION_TYPES,
  USER_ROLES
};