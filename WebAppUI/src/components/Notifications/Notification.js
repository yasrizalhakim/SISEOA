// src/components/Notifications/Notifications.js - Optimized Notifications Component

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MdNotifications, 
  MdCheck, 
  MdClose, 
  MdRefresh, 
  MdMarkEmailRead,
  MdCheckCircle,
  MdInfo,
  MdWarning,
  MdError,
  MdPersonAdd,
  MdAccessTime,
  MdFilterList
} from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { 
  doc, 
  updateDoc, 
  setDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { 
  setupNotificationListener,
  cleanupListener,
  markAllNotificationsAsRead,
  processNotificationAction,
  performPeriodicNotificationCheck,
  createNotification,
  NOTIFICATION_TYPES
} from '../../services/notificationService';
import { isSystemAdmin, getUserRole, getUserBuildingRoles } from '../../utils/helpers';
import './Notification.css';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Filters
  const [filter, setFilter] = useState('all'); // all, unread, read
  const [typeFilter, setTypeFilter] = useState('all'); // all, success, info, warning, error, request, invitation
  const [timeFilter, setTimeFilter] = useState('month'); // today, week, month
  
  // Processing state
  const [processing, setProcessing] = useState(new Set());
  
  // User data
  const [userRole, setUserRole] = useState('user');
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Component state
  const [isComponentActive, setIsComponentActive] = useState(true);
  const listenerRef = useRef(null);
  const periodicIntervalRef = useRef(null);
  
  const userEmail = localStorage.getItem('userEmail') || '';

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        listenerRef.current();
      }
      if (periodicIntervalRef.current) {
        clearInterval(periodicIntervalRef.current);
      }
      cleanupListener(userEmail);
    };
  }, [userEmail]);

  // Setup user permissions
  useEffect(() => {
    const setupUser = async () => {
      if (!userEmail) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }

      try {
        const isAdmin = await isSystemAdmin(userEmail);
        const role = await getUserRole(userEmail);
        
        setIsUserSystemAdmin(isAdmin);
        setUserRole(role);
        
        console.log('👤 User setup:', { isAdmin, role });
      } catch (error) {
        console.error('Error setting up user:', error);
      }
    };

    setupUser();
  }, [userEmail]);

  // Setup optimized notification listener
  const setupListener = useCallback(() => {
    if (!userEmail) return;

    console.log('🔔 Setting up notification listener...');

    // Calculate date filter
    const dateThreshold = new Date();
    let daysBack = 30; // month
    
    if (timeFilter === 'today') {
      daysBack = 1;
    } else if (timeFilter === 'week') {
      daysBack = 7;
    }

    const listenerOptions = {
      realTime: true,
      maxNotifications: 50,
      daysBack: daysBack,
      unreadOnly: false
    };

    const unsubscribe = setupNotificationListener(
      userEmail,
      (notificationsList, unreadCount, error) => {
        if (error) {
          console.error('Notification listener error:', error);
          setError('Failed to load notifications');
          setLoading(false);
          return;
        }

        setNotifications(notificationsList);
        setUnreadCount(unreadCount);
        setLoading(false);
        
        // Clear any existing error
        if (error) {
          setError(null);
        }
      },
      listenerOptions
    );

    listenerRef.current = unsubscribe;
    return unsubscribe;
  }, [userEmail, timeFilter]);

  // Setup listener when component mounts or timeFilter changes
  useEffect(() => {
    if (userEmail) {
      setupListener();
    }
  }, [setupListener]);

  // Handle component visibility for optimization
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsComponentActive(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Setup periodic check when component is not active
  useEffect(() => {
    if (!isComponentActive && userEmail) {
      // Start periodic check every 10 minutes when not active
      periodicIntervalRef.current = setInterval(async () => {
        try {
          const count = await performPeriodicNotificationCheck(userEmail);
          setUnreadCount(count);
        } catch (error) {
          console.error('Periodic check error:', error);
        }
      }, 10 * 60 * 1000); // 10 minutes
    } else {
      // Clear periodic check when component is active
      if (periodicIntervalRef.current) {
        clearInterval(periodicIntervalRef.current);
        periodicIntervalRef.current = null;
      }
    }

    return () => {
      if (periodicIntervalRef.current) {
        clearInterval(periodicIntervalRef.current);
      }
    };
  }, [isComponentActive, userEmail]);

  // Manual refresh
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      // Cleanup existing listener
      if (listenerRef.current) {
        listenerRef.current();
      }
      
      // Setup new listener
      setupListener();
      
      setSuccess('Notifications refreshed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error refreshing notifications:', error);
      setError('Failed to refresh notifications');
    } finally {
      setRefreshing(false);
    }
  };

  // Handle notification actions (accept/deny)
  const handleNotificationAction = async (notification, action) => {
    if (processing.has(notification.id)) return;

    try {
      setProcessing(prev => new Set(prev).add(notification.id));
      setError(null);

      console.log('🎬 Processing notification action:', { notificationId: notification.id, action });

      if (notification.NotificationType === NOTIFICATION_TYPES.REQUEST) {
        await handleChildRegistrationAction(notification, action);
      } else if (notification.NotificationType === NOTIFICATION_TYPES.INVITATION) {
        await handleChildInvitationAction(notification, action);
      }

      // Mark notification as processed
      await processNotificationAction(notification, action);

      setSuccess(`Request ${action}ed successfully`);
      setTimeout(() => setSuccess(null), 3000);

    } catch (error) {
      console.error('Error processing notification action:', error);
      setError(`Failed to ${action} request: ${error.message}`);
    } finally {
      setProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(notification.id);
        return newSet;
      });
    }
  };

  // Handle child registration request (parent accepting/denying child)
  const handleChildRegistrationAction = async (notification, action) => {
    const { childEmail, childName, parentEmail } = notification.Data;

    if (action === 'accept') {
      console.log(`✅ Accepting child registration: ${childEmail}`);
      
      // Get all parent's buildings and add child to each
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', parentEmail),
        where('Role', '==', 'parent')
      );

      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);

      // Add child to each parent building
      for (const buildingDoc of userBuildingsSnapshot.docs) {
        const buildingData = buildingDoc.data();
        const userBuildingId = `${childEmail.replace(/\./g, '_')}_${buildingData.Building}`;

        await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
          User: childEmail,
          Building: buildingData.Building,
          Role: 'children',
          RegistrationStatus: 'approved',
          AssignedLocations: [],
          CreatedAt: serverTimestamp(),
          ApprovedBy: parentEmail,
          ApprovedAt: serverTimestamp()
        });
      }

      // Create success notification for child
      await createNotification(
        childEmail,
        NOTIFICATION_TYPES.SUCCESS,
        'Registration Approved',
        `Your registration request has been approved by ${parentEmail}. You now have access to their buildings.`,
        { parentEmail, approvedAt: new Date().toISOString() }
      );
    } else {
      console.log(`❌ Denying child registration: ${childEmail}`);
      
      // Update registration status to denied
      const userBuildingsQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', childEmail),
        where('RegistrationStatus', '==', 'pending')
      );

      const userBuildingsSnapshot = await getDocs(userBuildingsQuery);
      
      for (const doc of userBuildingsSnapshot.docs) {
        await updateDoc(doc.ref, {
          RegistrationStatus: 'denied',
          DeniedBy: parentEmail,
          DeniedAt: serverTimestamp()
        });
      }

      // Create info notification for child
      await createNotification(
        childEmail,
        NOTIFICATION_TYPES.INFO,
        'Registration Denied',
        `Your registration request was denied by ${parentEmail}. Please contact them for more information.`,
        { parentEmail, deniedAt: new Date().toISOString() }
      );
    }
  };

  // Handle child invitation response (child accepting/declining invitation)
  const handleChildInvitationAction = async (notification, action) => {
    const { parentEmail, buildingId, buildingName } = notification.Data;

    if (action === 'accept') {
      console.log(`✅ Accepting building invitation: ${buildingName}`);
      
      // Add child to the specific building
      const userBuildingId = `${userEmail.replace(/\./g, '_')}_${buildingId}`;

      await setDoc(doc(firestore, 'USERBUILDING', userBuildingId), {
        User: userEmail,
        Building: buildingId,
        Role: 'children',
        RegistrationStatus: 'approved',
        AssignedLocations: [],
        CreatedAt: serverTimestamp(),
        InvitedBy: parentEmail,
        AcceptedAt: serverTimestamp()
      });

      // Notify parent of acceptance
      await createNotification(
        parentEmail,
        NOTIFICATION_TYPES.SUCCESS,
        'Invitation Accepted',
        `${userEmail} has accepted your invitation to join "${buildingName}".`,
        { childEmail: userEmail, buildingId, acceptedAt: new Date().toISOString() }
      );
    } else {
      console.log(`❌ Declining building invitation: ${buildingName}`);
      
      // Delete the pending invitation record if it exists
      const userBuildingId = `${userEmail.replace(/\./g, '_')}_${buildingId}`;
      try {
        await deleteDoc(doc(firestore, 'USERBUILDING', userBuildingId));
      } catch (error) {
        // Record might not exist, which is fine
        console.log('No pending invitation record to delete');
      }

      // Notify parent of decline
      await createNotification(
        parentEmail,
        NOTIFICATION_TYPES.INFO,
        'Invitation Declined',
        `${userEmail} has declined your invitation to join "${buildingName}".`,
        { childEmail: userEmail, buildingId, declinedAt: new Date().toISOString() }
      );
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(firestore, 'NOTIFICATION', notificationId), {
        IsRead: true,
        ReadAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      setRefreshing(true);
      const markedCount = await markAllNotificationsAsRead(userEmail);
      
      if (markedCount > 0) {
        setSuccess(`Marked ${markedCount} notifications as read`);
        setUnreadCount(0);
      } else {
        setSuccess('All notifications are already read');
      }
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error marking all as read:', error);
      setError('Failed to mark all notifications as read');
    } finally {
      setRefreshing(false);
    }
  };

  // Filter notifications based on current filters
  const filteredNotifications = notifications.filter(notification => {
    // Filter by read status
    if (filter === 'unread' && notification.IsRead) return false;
    if (filter === 'read' && !notification.IsRead) return false;

    // Filter by type
    if (typeFilter !== 'all' && notification.NotificationType !== typeFilter) return false;

    // Filter by time
    if (timeFilter !== 'month') {
      const notificationDate = notification.CreatedAt?.toDate ? 
        notification.CreatedAt.toDate() : new Date(notification.CreatedAt);
      const now = new Date();
      const diffTime = now - notificationDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (timeFilter === 'today' && diffDays > 1) return false;
      if (timeFilter === 'week' && diffDays > 7) return false;
    }

    return true;
  });

  // Get notification icon
  const getNotificationIcon = (type) => {
    switch (type) {
      case NOTIFICATION_TYPES.SUCCESS:
        return <MdCheckCircle className="notification-icon success" />;
      case NOTIFICATION_TYPES.INFO:
        return <MdInfo className="notification-icon info" />;
      case NOTIFICATION_TYPES.WARNING:
        return <MdWarning className="notification-icon warning" />;
      case NOTIFICATION_TYPES.ERROR:
        return <MdError className="notification-icon error" />;
      case NOTIFICATION_TYPES.REQUEST:
        return <MdPersonAdd className="notification-icon request" />;
      case NOTIFICATION_TYPES.INVITATION:
        return <MdPersonAdd className="notification-icon invitation" />;
      default:
        return <MdNotifications className="notification-icon default" />;
    }
  };

  // Format time
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="notifications-page">
        <div className="loading">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h2>
          <MdNotifications />
          Notifications ({filteredNotifications.length})
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </h2>
        <div className="header-actions">
          <button 
            onClick={markAllAsRead}
            className="mark-all-read-btn"
            disabled={refreshing || unreadCount === 0}
            title="Mark all as read"
          >
            <MdMarkEmailRead />
          </button>
          <button 
            onClick={handleRefresh}
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            disabled={refreshing}
            title="Refresh notifications"
          >
            <MdRefresh />
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Status:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Type:</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value={NOTIFICATION_TYPES.SUCCESS}>Success</option>
            <option value={NOTIFICATION_TYPES.INFO}>Info</option>
            <option value={NOTIFICATION_TYPES.WARNING}>Warning</option>
            <option value={NOTIFICATION_TYPES.ERROR}>Error</option>
            <option value={NOTIFICATION_TYPES.REQUEST}>Requests</option>
            <option value={NOTIFICATION_TYPES.INVITATION}>Invitations</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Time:</label>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="notifications-list">
        {filteredNotifications.length === 0 ? (
          <div className="no-notifications">
            <div className="no-data-content">
              <MdNotifications className="no-data-icon" />
              <h3>No Notifications</h3>
              <p>
                {filter === 'unread' 
                  ? "You have no unread notifications."
                  : typeFilter !== 'all'
                    ? `No ${typeFilter} notifications found.`
                    : timeFilter !== 'month'
                      ? `No notifications found for ${timeFilter}.`
                      : "You have no notifications yet."
                }
              </p>
            </div>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onAction={handleNotificationAction}
              onMarkAsRead={markAsRead}
              processing={processing.has(notification.id)}
              getNotificationIcon={getNotificationIcon}
              formatTime={formatTime}
            />
          ))
        )}
      </div>

      {/* Optimization Info (for development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="optimization-info">
          <h4>Optimization Status:</h4>
          <p>Component Active: {isComponentActive ? 'Yes' : 'No'}</p>
          <p>Real-time Listener: {listenerRef.current ? 'Active' : 'Inactive'}</p>
          <p>Periodic Check: {periodicIntervalRef.current ? 'Active' : 'Inactive'}</p>
          <p>Cached Unread Count: {unreadCount}</p>
        </div>
      )}
    </div>
  );
};

// Notification Card Component
const NotificationCard = ({ 
  notification, 
  onAction, 
  onMarkAsRead, 
  processing, 
  getNotificationIcon, 
  formatTime 
}) => {
  const handleCardClick = () => {
    if (!notification.IsRead) {
      onMarkAsRead(notification.id);
    }
  };

  const isExpired = notification.ExpiresAt && 
    new Date() > (notification.ExpiresAt.toDate ? notification.ExpiresAt.toDate() : new Date(notification.ExpiresAt));

  return (
    <div 
      className={`notification-card ${!notification.IsRead ? 'unread' : ''} ${isExpired ? 'expired' : ''}`}
      onClick={handleCardClick}
    >
      <div className="notification-content">
        <div className="notification-header">
          <div className="notification-title">
            {getNotificationIcon(notification.NotificationType)}
            <span>{notification.Title}</span>
          </div>
          <div className="notification-time">
            <MdAccessTime className="time-icon" />
            {formatTime(notification.CreatedAt)}
          </div>
        </div>
        
        <div className="notification-message">
          {notification.Message}
        </div>
        
        {notification.ActionRequired && 
         notification.Actions && 
         notification.Actions.length > 0 && 
         !notification.ProcessedAction && 
         !isExpired && (
          <div className="notification-actions">
            {notification.Actions.map(action => (
              <button
                key={action}
                className={`action-btn ${action}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(notification, action);
                }}
                disabled={processing}
              >
                {action === 'accept' && <MdCheck />}
                {action === 'deny' && <MdClose />}
                {action === 'decline' && <MdClose />}
                {processing ? 'Processing...' : action.charAt(0).toUpperCase() + action.slice(1)}
              </button>
            ))}
          </div>
        )}

        {notification.ProcessedAction && (
          <div className="processed-indicator">
            Action taken: <strong>{notification.ProcessedAction}</strong>
          </div>
        )}

        {isExpired && notification.ActionRequired && !notification.ProcessedAction && (
          <div className="expired-indicator">
            This request has expired
          </div>
        )}
      </div>
      
      {!notification.IsRead && (
        <div className="unread-indicator" />
      )}
    </div>
  );
};

export default Notifications;