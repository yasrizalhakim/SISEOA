// src/services/notificationService.js - Enhanced with Firestore Timestamp Compatibility

import { firestore } from './firebase';
import { 
  addDoc, 
  collection, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  doc,
  updateDoc,
  getDoc,
  setDoc
} from 'firebase/firestore';

// Notification types
export const NOTIFICATION_TYPES = {
  SYSTEM: 'system',
  INVITATION: 'invitation',
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning' // For device runtime warnings
};

// Invitation status
export const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  ERROR: 'error'
};

/**
 * Create a notification
 */
const createNotification = async ({
  title,
  message,
  userId,
  type,
  invitationData = null
}) => {
  try {
    const notificationData = {
      title,
      message,
      userId,
      type,
      timestamp: serverTimestamp(),
      read: false
    };

    // Add invitation data if it's an invitation notification
    if (type === NOTIFICATION_TYPES.INVITATION && invitationData) {
      notificationData.invitation = {
        ...invitationData,
        status: INVITATION_STATUS.PENDING
      };
    }
    const docRef = await addDoc(collection(firestore, 'NOTIFICATION'), notificationData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Send building invitation to user
 */
export const sendBuildingInvitation = async (parentEmail, childEmail, buildingId, buildingName) => {
  try {

    // Check if child user exists
    const childDoc = await getDoc(doc(firestore, 'USER', childEmail));
    if (!childDoc.exists()) {
      throw new Error('User not found. Please check the email address.');
    }

    const childData = childDoc.data();

    // Check if user already has access to this building
    const existingAccess = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', childEmail),
      where('Building', '==', buildingId)
    );
    const accessSnapshot = await getDocs(existingAccess);
    
    if (!accessSnapshot.empty) {
      throw new Error('User already has access to this building.');
    }

    // Check for pending invitations
    const pendingInvitations = query(
      collection(firestore, 'NOTIFICATION'),
      where('userId', '==', childEmail),
      where('type', '==', NOTIFICATION_TYPES.INVITATION)
    );
    const pendingSnapshot = await getDocs(pendingInvitations);
    
    // Check if there's already a pending invitation for this building
    const existingInvite = pendingSnapshot.docs.find(doc => {
      const data = doc.data();
      return data.invitation && 
             data.invitation.buildingId === buildingId && 
             data.invitation.status === INVITATION_STATUS.PENDING;
    });

    if (existingInvite) {
      throw new Error('There is already a pending invitation for this building.');
    }

    // Create invitation notification
    const notificationId = await createNotification({
      title: 'Building Invitation',
      message: `You've been invited to join "${buildingName}"`,
      userId: childEmail,
      type: NOTIFICATION_TYPES.INVITATION,
      invitationData: {
        buildingId: buildingId,
        buildingName: buildingName,
        parentEmail: parentEmail,
        childEmail: childEmail,
        invitedAt: new Date().toISOString()
      }
    });

 
    return notificationId;
  } catch (error) {
    console.error('Error sending building invitation:', error);
    throw error;
  }
};

/**
 * Respond to building invitation
 */
export const respondToBuildingInvitation = async (notificationId, response) => {
  try {


    // Get the notification
    const notificationRef = doc(firestore, 'NOTIFICATION', notificationId);
    const notificationDoc = await getDoc(notificationRef);

    if (!notificationDoc.exists()) {
      throw new Error('Invitation not found');
    }

    const notificationData = notificationDoc.data();

    if (!notificationData.invitation) {
      throw new Error('Invalid invitation data');
    }

    if (notificationData.invitation.status !== INVITATION_STATUS.PENDING) {
      throw new Error('This invitation has already been responded to');
    }

    const { buildingId, buildingName, parentEmail, childEmail } = notificationData.invitation;

    let updateStatus = INVITATION_STATUS.ERROR;
    let updateMessage = 'ERROR: Please contact the admin';

    if (response === 'accept') {
      try {
        // Verify building still exists
        const buildingDoc = await getDoc(doc(firestore, 'BUILDING', buildingId));
        if (!buildingDoc.exists()) {
          updateMessage = 'ERROR: Building no longer exists';
        } else {
          // Verify child user still exists
          const childDoc = await getDoc(doc(firestore, 'USER', childEmail));
          if (!childDoc.exists()) {
            updateMessage = 'ERROR: User account not found';
          } else {
            // Create user-building relationship
            const userBuildingId = `${childEmail.replace(/\./g, '_')}_${buildingId}`;
            await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
              User: childEmail,
              Building: buildingId,
              Role: 'children',
              AssignedLocations: [],
              CreatedAt: serverTimestamp()
            });

            updateStatus = INVITATION_STATUS.ACCEPTED;
            updateMessage = `Invitation accepted! You've joined "${buildingName}"`;

            // Send notification to parent
            await createNotification({
              title: 'Invitation Accepted',
              message: `${childEmail} has accepted your invitation to join "${buildingName}"`,
              userId: parentEmail,
              type: NOTIFICATION_TYPES.INFO
            });

      
          }
        }
      } catch (error) {
        console.error('Error accepting invitation:', error);
        updateStatus = INVITATION_STATUS.ERROR;
        updateMessage = 'ERROR: Failed to join building. Please contact admin.';
      }
    } else if (response === 'decline') {
      updateStatus = INVITATION_STATUS.DECLINED;
      updateMessage = `Invitation declined for "${buildingName}"`;

      // Send notification to parent
      try {
        await createNotification({
          title: 'Invitation Declined',
          message: `${childEmail} has declined your invitation to join "${buildingName}"`,
          userId: parentEmail,
          type: NOTIFICATION_TYPES.INFO
        });
      } catch (error) {
        console.error('Error sending decline notification to parent:', error);
      }
    }

    // Update the notification
    await updateDoc(notificationRef, {
      message: updateMessage,
      'invitation.status': updateStatus,
      'invitation.respondedAt': new Date().toISOString(),
      read: true
    });

    return { status: updateStatus, message: updateMessage };
  } catch (error) {
    throw error;
  }
};

/**
 * Get user notifications
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
 * Send simple info notification
 */
export const sendInfoNotification = async (userEmail, title, message) => {
  return await createNotification({
    title,
    message,
    userId: userEmail,
    type: NOTIFICATION_TYPES.INFO
  });
};

/**
 * Send success notification
 */
export const sendSuccessNotification = async (userEmail, title, message) => {
  return await createNotification({
    title,
    message,
    userId: userEmail,
    type: NOTIFICATION_TYPES.SUCCESS
  });
};

/**
 * Send system notification
 */
export const sendSystemNotification = async (userEmail, title, message) => {
  return await createNotification({
    title,
    message,
    userId: userEmail,
    type: NOTIFICATION_TYPES.SYSTEM
  });
};

/**
 * Send warning notification
 */
export const sendWarningNotification = async (userEmail, title, message) => {
  return await createNotification({
    title,
    message,
    userId: userEmail,
    type: NOTIFICATION_TYPES.WARNING
  });
};

// SystemAdmin utilities
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

// Building utilities
const getBuildingParents = async (buildingId) => {
  try {
    const parentQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('Building', '==', buildingId),
      where('Role', '==', 'parent')
    );
    
    const snapshot = await getDocs(parentQuery);
    return snapshot.docs.map(doc => doc.data().User);
  } catch (error) {
    console.error('Error getting building parents:', error);
    return [];
  }
};

// ================================
// EXISTING NOTIFICATION FUNCTIONS
// ================================

/**
 * Notify parent when they successfully create a building
 */
export const notifyParentBuildingCreated = async (parentEmail, buildingName, buildingId) => {
  try {
    
    return await sendSuccessNotification(
      parentEmail,
      'Building Created Successfully',
      `Your building "${buildingName}" has been created successfully! You can now add locations and claim devices.`
    );
  } catch (error) {
    return null;
  }
};

/**
 * Notify parent when they add a location to their building
 */
export const notifyParentLocationAdded = async (parentEmail, locationName, buildingName) => {
  try {
   
    
    return await sendSuccessNotification(
      parentEmail,
      'Location Added Successfully',
      `Location "${locationName}" has been added to your building "${buildingName}". You can now assign devices and users to this location.`
    );
  } catch (error) {
    console.error('Error notifying parent about location addition:', error);
    return null;
  }
};

/**
 * Notify parent when they successfully claim a device
 */
export const notifyParentDeviceClaimed = async (parentEmail, deviceName, deviceId, locationName, buildingName) => {
  try {
  
    
    return await sendSuccessNotification(
      parentEmail,
      'Device Claimed Successfully',
      `Device "${deviceName}" has been successfully claimed and assigned to "${locationName}" in your building "${buildingName}".`
    );
  } catch (error) {
    console.error(' Error notifying parent about device claim:', error);
    return null;
  }
};

/**
 * Notify SystemAdmin about device registration
 */
export const notifyDeviceRegistered = async (deviceName, deviceId, registeredBy) => {
  try {
    const systemAdminEmail = await getSystemAdminEmail();
    if (!systemAdminEmail) {
 
      return null;
    }

  

    return await sendSystemNotification(
      systemAdminEmail,
      'New Device Registered',
      `A new device "${deviceName}" (ID: ${deviceId}) has been registered in the system by ${registeredBy}.`
    );
  } catch (error) {
    console.error('Error notifying SystemAdmin about device registration:', error);
    return null;
  }
};

/**
 * Notify SystemAdmin when admin adds/registers a device 
 */
export const notifyAdminDeviceAdded = async (deviceName, deviceId, addedBy) => {
  try {
    const systemAdminEmail = await getSystemAdminEmail();
    if (!systemAdminEmail) {
   
      return null;
    }

    // Don't notify if the admin adding the device is the SystemAdmin themselves
    if (systemAdminEmail === addedBy) {
      return null;
    }


    return await sendSystemNotification(
      systemAdminEmail,
      'Device Added by Admin',
      `Administrator ${addedBy} has added device "${deviceName}" (ID: ${deviceId}) to the system.`
    );
  } catch (error) {
    console.error('Error notifying SystemAdmin about admin device addition:', error);
    return null;
  }
};

/**
 * Notify SystemAdmin about device deletion
 */
export const notifyDeviceDeleted = async (deviceName, deviceId, deletedBy) => {
  try {
    const systemAdminEmail = await getSystemAdminEmail();
    if (!systemAdminEmail) {
      return null;
    }

    return await sendSystemNotification(
      systemAdminEmail,
      'Device Deleted',
      `Device "${deviceName}" (ID: ${deviceId}) has been deleted by ${deletedBy}.`
    );
  } catch (error) {
    console.error('Error notifying SystemAdmin about device deletion:', error);
    return null;
  }
};

/**
 * Notify parent when their device is deleted
 */
export const notifyParentDeviceDeleted = async (parentEmail, deviceName, buildingName) => {
  try {
    return await sendInfoNotification(
      parentEmail,
      'Device Deleted',
      `Device "${deviceName}" in building "${buildingName}" has been deleted by an administrator.`
    );
  } catch (error) {
    console.error('Error notifying parent about device deletion:', error);
    return null;
  }
};

/**
 * Notify child when location is assigned to them
 */
export const notifyLocationAssigned = async (childEmail, locationName, buildingName) => {
  try {
    return await sendInfoNotification(
      childEmail,
      'Location Assigned',
      `You've been assigned to "${locationName}" in "${buildingName}".`
    );
  } catch (error) {
    console.error('Error notifying about location assignment:', error);
    return null;
  }
};

// ================================
// UPDATED NOTIFICATION FUNCTIONS
// ================================

/**
 * Notify building parents when building is deleted by SystemAdmin
 */
export const notifyBuildingDeleted = async (buildingId, buildingName, deletedBy) => {
  try {
  

    const parentEmails = await getBuildingParents(buildingId);
    
    if (parentEmails.length === 0) {
  
      return [];
    }

    const notificationPromises = parentEmails.map(parentEmail => 
      sendInfoNotification(
        parentEmail,
        'Building Deleted',
        `Your building "${buildingName}" has been deleted by an administrator. All associated data has been removed from the system.`
      )
    );

    const results = await Promise.allSettled(notificationPromises);
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Failed to notify parent ${parentEmails[index]}:`, result.reason);
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
  
    
    return results;
  } catch (error) {
    console.error('Error notifying about building deletion:', error);
    return [];
  }
};

/**
 * Notify building parents when their device is deleted by SystemAdmin
 */
export const notifySystemAdminDeviceDeleted = async (deviceName, deviceId, buildingId, buildingName, deletedBy) => {
  try {
    const parentEmails = await getBuildingParents(buildingId);
    
    if (parentEmails.length === 0) {
 
      return [];
    }

    // Filter out the deleter if they are also a parent (avoid self-notification)
    const parentsToNotify = parentEmails.filter(email => email !== deletedBy);

    if (parentsToNotify.length === 0) {
    
      return [];
    }

    const notificationPromises = parentsToNotify.map(parentEmail => 
      sendInfoNotification(
        parentEmail,
        'Device Deleted by Administrator',
        `Device "${deviceName}" in your building "${buildingName}" has been deleted by an administrator.`
      )
    );

    const results = await Promise.allSettled(notificationPromises);
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
      
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
   
    
    return results;
  } catch (error) {
    console.error('Error notifying about SystemAdmin device deletion:', error);
    return [];
  }
};

/**
 * UPDATED: Send device runtime warning to building parents and assigned children
 * Enhanced to work with Firestore timestamps and improved user targeting
 */
export const sendDeviceRuntimeWarning = async (deviceId, deviceName, locationName, buildingId, buildingName, hoursOn, warningCount) => {
  try {
 
    const usersToNotify = [];

    // Get building parents
    const parentEmails = await getBuildingParents(buildingId);
    usersToNotify.push(...parentEmails);

    // UPDATED: Get children assigned to locations in the building that have access to this device
    try {
      // Get the specific location document to find children assigned to it
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', locationName));
      let actualLocationId = locationName;
      
      if (locationDoc.exists()) {
        actualLocationId = locationDoc.id;
      }

      const childrenQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('Building', '==', buildingId),
        where('Role', '==', 'children')
      );
      
      const childrenSnapshot = await getDocs(childrenQuery);
      
      for (const childDoc of childrenSnapshot.docs) {
        const childData = childDoc.data();
        const assignedLocations = childData.AssignedLocations || [];
        
        // Check if child has access to the device's location
        if (assignedLocations.includes(actualLocationId)) {
          usersToNotify.push(childData.User);
        }
      }

      // UPDATED: Also check legacy device assignments for backward compatibility
      const deviceDoc = await getDoc(doc(firestore, 'DEVICE', deviceId));
      if (deviceDoc.exists()) {
        const deviceData = deviceDoc.data();
        const legacyAssignedUsers = deviceData.AssignedTo || [];
        usersToNotify.push(...legacyAssignedUsers);
      }

    } catch (childrenError) {
      console.error('Error getting children for runtime warning:', childrenError);
    }

    // Remove duplicates
    const uniqueUsers = [...new Set(usersToNotify)];

    if (uniqueUsers.length === 0) {
     
      return [];
    }

    // UPDATED: Enhanced warning message with better context
    const warningMessage = warningCount === 1 
      ? `Device "${deviceName}" in "${locationName}", "${buildingName}" has been running for ${hoursOn} hours. Consider turning it off to save energy and prevent overheating.`
      : `Device "${deviceName}" in "${locationName}", "${buildingName}" has been running for ${hoursOn} hours (Warning #${warningCount}). Please check the device and turn it off if not needed.`;
    
    const notificationPromises = uniqueUsers.map(userEmail => 
      sendWarningNotification(
        userEmail,
        `Device Runtime Warning${warningCount > 1 ? ` #${warningCount}` : ''}`,
        warningMessage
      )
    );

    const results = await Promise.allSettled(notificationPromises);
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Failed to notify user ${uniqueUsers[index]}:`, result.reason);
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
  
    
    return results;
  } catch (error) {
    console.error('Error sending device runtime warning:', error);
    return [];
  }
};

/**
 * Check if user has pending approval - simplified version
 */
export const checkUserPendingApproval = async (userEmail) => {
  try {
    // Validate input parameter
    if (!userEmail || typeof userEmail !== 'string') {
      console.log('Invalid userEmail provided to checkUserPendingApproval');
      return false;
    }

   

    // Check if user exists in USERBUILDING with any role
    const userBuildingQuery = query(
      collection(firestore, 'USERBUILDING'),
      where('User', '==', userEmail)
    );
    
    const snapshot = await getDocs(userBuildingQuery);
    
    // If user has building associations, they are not pending
    if (!snapshot.empty) {
       return false;
    }
    
    // Check if there are pending invitation notifications for this user
    const pendingInvitations = query(
      collection(firestore, 'NOTIFICATION'),
      where('userId', '==', userEmail),
      where('type', '==', NOTIFICATION_TYPES.INVITATION)
    );
    
    const invitationSnapshot = await getDocs(pendingInvitations);
    
    // Look for pending invitations
    for (const doc of invitationSnapshot.docs) {
      const data = doc.data();
      if (data.invitation && data.invitation.status === INVITATION_STATUS.PENDING) {
 
        return true; // User has pending invitations
      }
    }
    
    console.log('No pending approval found for user');
    return false;
  } catch (error) {
    console.error('Error checking pending approval:', error);
    return false;
  }
};

export default {
  sendBuildingInvitation,
  respondToBuildingInvitation,
  getUserNotifications,
  sendInfoNotification,
  sendSuccessNotification,
  sendSystemNotification,
  sendWarningNotification,
  notifyParentBuildingCreated,
  notifyParentLocationAdded,
  notifyParentDeviceClaimed,
  notifyAdminDeviceAdded,
  notifyDeviceRegistered,
  notifyDeviceDeleted,
  notifyParentDeviceDeleted,
  notifyLocationAssigned,
  notifyBuildingDeleted,
  notifySystemAdminDeviceDeleted,
  sendDeviceRuntimeWarning, // UPDATED: Enhanced for Firestore timestamps
  checkUserPendingApproval,
  NOTIFICATION_TYPES,
  INVITATION_STATUS
};