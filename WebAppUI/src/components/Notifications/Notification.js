// src/components/Notifications/Notification.js - Simplified with Invitation Handling

import React, { useState, useEffect } from 'react';
import { 
  MdNotifications, 
  MdRefresh, 
  MdMarkEmailRead,
  MdCheckCircle,
  MdInfo,
  MdWarning,
  MdError,
  MdPersonAdd,
  MdSearch,
  MdFilterList,
  MdCheck,
  MdClose
} from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { updateDoc, doc, writeBatch } from 'firebase/firestore';
import { 
  NOTIFICATION_TYPES, 
  INVITATION_STATUS,
  getUserNotifications,
  respondToBuildingInvitation
} from '../../services/notificationService';
import './Notification.css';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  
  const [unreadCount, setUnreadCount] = useState(0);
  const [respondingToInvite, setRespondingToInvite] = useState(null);
  
  const userEmail = localStorage.getItem('userEmail') || '';

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!userEmail) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    try {
      setRefreshing(true);
      setError(null);

      console.log('🔔 Fetching notifications for user:', userEmail);

      const notificationsList = await getUserNotifications(userEmail, { limit: 50 });
      
      setNotifications(notificationsList);
      
      // Count unread notifications
      const unread = notificationsList.filter(n => !n.read).length;
      setUnreadCount(unread);
      
      console.log('📢 Notifications loaded:', notificationsList.length, 'unread:', unread);
      
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
      setError('Failed to load notifications');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  // Filter and search notifications
  useEffect(() => {
    let filtered = [...notifications];

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(notification => 
        notification.title?.toLowerCase().includes(search) ||
        notification.message?.toLowerCase().includes(search)
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(notification => notification.type === typeFilter);
    }

    // Apply read filter
    if (readFilter === 'unread') {
      filtered = filtered.filter(notification => !notification.read);
    } else if (readFilter === 'read') {
      filtered = filtered.filter(notification => notification.read);
    }

    setFilteredNotifications(filtered);
  }, [notifications, searchTerm, typeFilter, readFilter]);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [userEmail]);

  // Manual refresh
  const handleRefresh = () => {
    fetchNotifications();
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(firestore, 'NOTIFICATION', notificationId), {
        read: true
      });
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      setRefreshing(true);
      
      const unreadNotifications = notifications.filter(n => !n.read);
      
      if (unreadNotifications.length === 0) {
        setSuccess('All notifications are already read');
        setRefreshing(false);
        return;
      }

      const batch = writeBatch(firestore);
      
      unreadNotifications.forEach(notification => {
        batch.update(doc(firestore, 'NOTIFICATION', notification.id), {
          read: true
        });
      });

      await batch.commit();
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, read: true }))
      );
      
      setUnreadCount(0);
      setSuccess(`Marked ${unreadNotifications.length} notifications as read`);
      
    } catch (error) {
      console.error('Error marking all as read:', error);
      setError('Failed to mark all notifications as read');
    } finally {
      setRefreshing(false);
    }
  };

  // Handle invitation response
  const handleInvitationResponse = async (notificationId, response) => {
    try {
      setRespondingToInvite(notificationId);
      setError(null);

      console.log(`📝 Responding to invitation ${notificationId}: ${response}`);

      const result = await respondToBuildingInvitation(notificationId, response);
      
      // Update local notification
      setNotifications(prev => 
        prev.map(n => {
          if (n.id === notificationId) {
            return {
              ...n,
              message: result.message,
              invitation: {
                ...n.invitation,
                status: result.status
              },
              read: true
            };
          }
          return n;
        })
      );

      setSuccess(response === 'accept' ? 'Invitation accepted!' : 'Invitation declined');
      
    } catch (error) {
      console.error(`❌ Error responding to invitation:`, error);
      setError(error.message || 'Failed to respond to invitation');
    } finally {
      setRespondingToInvite(null);
    }
  };

  // Clear messages after timeout
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Get notification icon
  const getNotificationIcon = (type) => {
    switch (type) {
      case NOTIFICATION_TYPES.SYSTEM:
        return <MdInfo className="notification-icon info" />;
      case NOTIFICATION_TYPES.INVITATION:
        return <MdPersonAdd className="notification-icon warning" />;
      case NOTIFICATION_TYPES.INFO:
        return <MdCheckCircle className="notification-icon success" />;
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
      {/* Header */}
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

      {/* Messages */}
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-container">
          <MdSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filters-container">
          <div className="filter-group">
            <MdFilterList className="filter-icon" />
            <select 
              value={typeFilter} 
              onChange={(e) => setTypeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value={NOTIFICATION_TYPES.SYSTEM}>System</option>
              <option value={NOTIFICATION_TYPES.INVITATION}>Invitations</option>
              <option value={NOTIFICATION_TYPES.INFO}>Info</option>
            </select>
          </div>

          <div className="filter-group">
            <select 
              value={readFilter} 
              onChange={(e) => setReadFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
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
                {searchTerm 
                  ? `No notifications match "${searchTerm}"`
                  : typeFilter !== 'all'
                    ? `No ${typeFilter} notifications found`
                    : readFilter !== 'all'
                      ? `No ${readFilter} notifications found`
                      : "You have no notifications yet"
                }
              </p>
            </div>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={markAsRead}
              onInvitationResponse={handleInvitationResponse}
              getNotificationIcon={getNotificationIcon}
              formatTime={formatTime}
              isResponding={respondingToInvite === notification.id}
            />
          ))
        )}
      </div>
    </div>
  );
};

// Notification Card Component
const NotificationCard = ({ 
  notification, 
  onMarkAsRead, 
  onInvitationResponse,
  getNotificationIcon, 
  formatTime,
  isResponding 
}) => {
  const handleCardClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
  };

  const handleAccept = (e) => {
    e.stopPropagation();
    onInvitationResponse(notification.id, 'accept');
  };

  const handleDecline = (e) => {
    e.stopPropagation();
    onInvitationResponse(notification.id, 'decline');
  };

  return (
    <div 
      className={`notification-card ${!notification.read ? 'unread' : ''}`}
      onClick={handleCardClick}
    >
      <div className="notification-content">
        <div className="notification-header">
          <div className="notification-title">
            {getNotificationIcon(notification.type)}
            <span>{notification.title}</span>
          </div>
          <div className="notification-time">
            {formatTime(notification.timestamp)}
          </div>
        </div>
        
        <div className="notification-message">
          {notification.message}
        </div>
        
        {/* Invitation Actions */}
        {notification.type === NOTIFICATION_TYPES.INVITATION && 
         notification.invitation && 
         notification.invitation.status === INVITATION_STATUS.PENDING && (
          <div className="notification-actions">
            <button 
              className="action-btn accept"
              onClick={handleAccept}
              disabled={isResponding}
            >
              <MdCheck /> {isResponding ? 'Processing...' : 'Accept'}
            </button>
            <button 
              className="action-btn decline"
              onClick={handleDecline}
              disabled={isResponding}
            >
              <MdClose /> {isResponding ? 'Processing...' : 'Decline'}
            </button>
          </div>
        )}

        {/* Show invitation status for non-pending invitations */}
        {notification.type === NOTIFICATION_TYPES.INVITATION && 
         notification.invitation && 
         notification.invitation.status !== INVITATION_STATUS.PENDING && (
          <div className="notification-status">
            <span className={`status-badge ${notification.invitation.status}`}>
              {notification.invitation.status === INVITATION_STATUS.ACCEPTED && '✅ Accepted'}
              {notification.invitation.status === INVITATION_STATUS.DECLINED && '❌ Declined'}
              {notification.invitation.status === INVITATION_STATUS.ERROR && '⚠️ Error'}
            </span>
          </div>
        )}
      </div>
      
      {!notification.read && (
        <div className="unread-indicator" />
      )}
    </div>
  );
};

export default Notifications;