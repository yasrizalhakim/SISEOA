// src/components/Devices/DeviceAutomationTab.js - FIXED: No userRole references
import React, { useState, useCallback } from 'react';
import { MdBolt, MdSchedule, MdAccessTime } from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import './DeviceAutomationTab.css';

const DeviceAutomationTab = ({ device, userEmail, onAutomationApply }) => {
  // ALL HOOKS MUST BE AT THE TOP - NO CONDITIONAL CALLS
  // State for custom schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [customTimes, setCustomTimes] = useState({
    startTime: '08:00',
    endTime: '18:00'
  });
  const [applying, setApplying] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(false);

  // Handle schedule toggle
  const handleScheduleToggle = useCallback(() => {
    setScheduleEnabled(!scheduleEnabled);
  }, [scheduleEnabled]);

  // Handle custom time changes
  const handleTimeChange = useCallback((field, value) => {
    setCustomTimes(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Validate time range
  const isValidTimeRange = useCallback(() => {
    const start = customTimes.startTime;
    const end = customTimes.endTime;
    return start !== end; // At least they should be different
  }, [customTimes]);

  // Check if user has permission to control this specific device
  const canControlDevice = useCallback(async () => {
    if (!userEmail || !device) {
      console.log('❌ No user email or device');
      return false;
    }
    
    // If device is not claimed (no location), no one can control it
    if (!device.Location) {
      console.log('❌ Device has no location');
      return false;
    }
    
    try {
      // Check if user is assigned to this device
      const assignedUsers = device.AssignedTo || [];
      if (assignedUsers.includes(userEmail)) {
        console.log('✅ User is assigned to device - automation access granted');
        return true;
      }
      
      // NEW: Check if user is a parent of the building containing this device
      console.log(`🔍 Checking if user ${userEmail} is parent of building containing device ${device.id}`);
      
      // Step 1: Get the location to find the building
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', device.Location));
      
      if (!locationDoc.exists()) {
        console.log(`⚠️ Location ${device.Location} not found`);
        return false;
      }

      const locationData = locationDoc.data();
      const deviceBuildingId = locationData.Building;

      console.log(`🏢 Device is in building: ${deviceBuildingId}`);

      // Step 2: Check if user is a parent of this building
      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userEmail),
        where('Building', '==', deviceBuildingId),
        where('Role', '==', 'parent')
      );

      const userBuildingSnapshot = await getDocs(userBuildingQuery);

      if (!userBuildingSnapshot.empty) {
        console.log('✅ User is parent of building - automation access granted');
        return true;
      }
      
      console.log(`❌ User is not assigned to device and not parent of building ${deviceBuildingId}`);
      return false;
      
    } catch (error) {
      console.error('❌ Error checking building parent status:', error);
      return false;
    }
  }, [userEmail, device]);

  // Handle apply automation
  const handleApplyAutomation = useCallback(async () => {
    if (scheduleEnabled && !isValidTimeRange()) {
      alert('Please ensure start time and end time are different.');
      return;
    }

    // Check permissions before applying
    setCheckingPermissions(true);
    const hasPermission = await canControlDevice();
    setCheckingPermissions(false);

    if (!hasPermission) {
      alert('You do not have permission to configure automation for this device.');
      return;
    }

    setApplying(true);
    
    try {
      const automationConfig = {
        deviceId: device.id,
        deviceName: device.DeviceName || device.id,
        automationType: scheduleEnabled ? 'custom-schedule' : 'none',
        automationTitle: scheduleEnabled ? 'Custom Schedule' : 'No Schedule',
        timestamp: new Date().toISOString(),
        appliedBy: localStorage.getItem('userEmail'),
        ...(scheduleEnabled && {
          schedule: {
            startTime: customTimes.startTime,
            endTime: customTimes.endTime,
            enabled: true
          }
        })
      };

      // Call parent component's automation handler if provided
      if (onAutomationApply) {
        await onAutomationApply(automationConfig);
      }

      // Here you would integrate with your backend/database to save the automation settings
      // For now, just show a success message
      if (scheduleEnabled) {
        alert(`Applied custom schedule (${customTimes.startTime} - ${customTimes.endTime}) to device "${device.DeviceName || device.id}"`);
      } else {
        alert(`Cleared automation schedule for device "${device.DeviceName || device.id}"`);
      }
      
    } catch (error) {
      console.error('Error applying device automation:', error);
      alert('Failed to apply automation. Please try again.');
    } finally {
      setApplying(false);
    }
  }, [scheduleEnabled, customTimes, device, isValidTimeRange, onAutomationApply, canControlDevice]);

  // NOW AFTER ALL HOOKS - CHECK CONDITIONS AND RENDER
  
  // Check if device is not claimed (no location)
  if (!device.Location) {
    return (
      <div className="device-automation-tab">
        <div className="automation-unavailable">
          <MdBolt className="unavailable-icon" />
          <h3>Automation Unavailable</h3>
          <p>This device must be claimed and assigned to a location before automation can be configured.</p>
          <p>Please claim this device first in the Device Info tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="device-automation-tab">
      {/* Header */}
      <div className="automation-header">
        <div className="header-content">
          <h3>
            <MdBolt className="header-icon" />
            Device Automation
          </h3>
          <p>Configure automated scheduling for <strong>{device.DeviceName || device.id}</strong></p>
        </div>
      </div>

      {/* Device Status Info
      <div className="device-status-info">
        <div className="status-item">
          <span className="status-label">Device:</span>
          <span className="status-value">{device.DeviceName || device.id}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Current Status:</span>
          <span className={`status-value status-${device.status?.toLowerCase() || 'unknown'}`}>
            {device.status || 'Unknown'}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">Device Type:</span>
          <span className="status-value">{device.DeviceType || 'Not specified'}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Location:</span>
          <span className="status-value">{device.locationName || device.Location}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Your Access:</span>
          <span className="status-value access-granted">Device Controller</span>
        </div>
      </div> */}

      {/* Custom Schedule Section */}
      <div className="custom-schedule-section">
        <div className="schedule-header">
          <h4>
            <MdSchedule className="schedule-icon" />
            Custom Schedule
          </h4>
          <div className="schedule-toggle">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={handleScheduleToggle}
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
              <span className="toggle-text">
                {scheduleEnabled ? 'Schedule Enabled' : 'Schedule Disabled'}
              </span>
            </label>
          </div>
        </div>

        <div className="schedule-description">
          <p>
            When enabled, this device will automatically turn <strong>ON</strong> during 
            the specified time range and turn <strong>OFF</strong> outside of these hours.
          </p>
          <p>
            <em>Note: You can configure this schedule because you have control access to this device or you are a parent of the building containing this device.</em>
          </p>
        </div>

        {/* Time Configuration */}
        <div className={`time-configuration ${scheduleEnabled ? 'enabled' : 'disabled'}`}>
          <h5>
            <MdAccessTime className="time-icon" />
            Active Hours
          </h5>
          <div className="time-inputs-container">
            <div className="time-input-group">
              <label htmlFor="start-time">Start Time:</label>
              <input
                id="start-time"
                type="time"
                value={customTimes.startTime}
                onChange={(e) => handleTimeChange('startTime', e.target.value)}
                className="time-input"
                disabled={!scheduleEnabled}
              />
              <span className="time-help">Device turns ON</span>
            </div>
            
            <div className="time-separator">
              <span>to</span>
            </div>
            
            <div className="time-input-group">
              <label htmlFor="end-time">End Time:</label>
              <input
                id="end-time"
                type="time"
                value={customTimes.endTime}
                onChange={(e) => handleTimeChange('endTime', e.target.value)}
                className="time-input"
                disabled={!scheduleEnabled}
              />
              <span className="time-help">Device turns OFF</span>
            </div>
          </div>

          {scheduleEnabled && (
            <div className="schedule-preview">
              <h6>Schedule Preview:</h6>
              <div className="preview-timeline">
                <div className="timeline-item off">
                  <span className="time">00:00</span>
                  <span className="status">OFF</span>
                </div>
                <div className="timeline-item on">
                  <span className="time">{customTimes.startTime}</span>
                  <span className="status">ON</span>
                </div>
                <div className="timeline-item off">
                  <span className="time">{customTimes.endTime}</span>
                  <span className="status">OFF</span>
                </div>
                <div className="timeline-item off">
                  <span className="time">23:59</span>
                  <span className="status">OFF</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Apply Actions */}
      <div className="automation-actions">
        <button 
          className="apply-button"
          onClick={handleApplyAutomation}
          disabled={applying || checkingPermissions || (scheduleEnabled && !isValidTimeRange())}
        >
          {applying ? 'Applying...' : 
           checkingPermissions ? 'Checking permissions...' :
           scheduleEnabled ? 'Apply Schedule' : 'Clear Schedule'}
        </button>
        
        {scheduleEnabled && (
          <button 
            className="clear-button"
            onClick={() => setScheduleEnabled(false)}
            disabled={applying || checkingPermissions}
          >
            Disable Schedule
          </button>
        )}
      </div>

      {/* Help Text */}
      <div className="automation-help">
        <h4>How Device Scheduling Works</h4>
        <ul>
          <li>
            <strong>Automatic Control:</strong> The device will turn ON at the start time and OFF at the end time every day
          </li>
          <li>
            <strong>Manual Override:</strong> You can still manually control the device, but the schedule will resume at the next scheduled time
          </li>
          <li>
            <strong>Time Format:</strong> Use 24-hour format (e.g., 08:00 for 8 AM, 20:00 for 8 PM)
          </li>
          <li>
            <strong>Daily Repeat:</strong> The schedule repeats every day until disabled
          </li>
          <li>
            <strong>Access Control:</strong> Only users assigned to the device or building parents can configure automation schedules
          </li>
        </ul>
        <p><em>Note: Only one schedule can be active per device. Setting a new schedule will override any existing one.</em></p>
      </div>
    </div>
  );
};

export default DeviceAutomationTab;