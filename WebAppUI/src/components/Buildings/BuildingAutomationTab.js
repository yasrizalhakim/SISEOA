// src/components/Buildings/BuildingAutomationTab.js - Fixed with proper service usage

import React, { useState, useCallback, useEffect } from 'react';
import { MdBolt, MdNightlight, MdEco, MdPowerOff, MdWarning, MdMemory, MdLock } from 'react-icons/md';
import buildingService from '../../services/buildingService'; // Import buildingService for building operations
import { firestore } from '../../services/firebase'; // Import for direct Firestore operations
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import './BuildingAutomationTab.css';

const BuildingAutomationTab = ({ building, userRole, onAutomationApply }) => {
  const [automationModes, setAutomationModes] = useState({
    'turn-off-all': false,
    'eco-mode': false,
    'night-mode': false
  });
  
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [buildingDevices, setBuildingDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [automationStats, setAutomationStats] = useState(null);

  const automationOptions = [
    {
      id: 'turn-off-all',
      title: 'Lockdown',
      description: 'Raspberry Pi will immediately shut down and lock all connected devices.',
      icon: MdLock,
      color: '#dc2626',
      energySaving: 'Maximum'
    },
    {
      id: 'eco-mode',
      title: 'Eco Mode',
      description: 'Pi automatically turns off high-energy devices (AC units) for energy savings.',
      icon: MdEco,
      color: '#16a34a',
      energySaving: 'High'
    },
    {
      id: 'night-mode',
      title: 'Night Mode',
      description: 'Pi keeps only lighting active and turns off comfort devices (Fan, AC).',
      icon: MdNightlight,
      color: '#1e40af',
      energySaving: 'Medium'
    }
  ];

  // Helper function to load automation state from Firestore
  const loadAutomationState = async (buildingId) => {
    try {
      console.log(`🔍 Loading automation state for building: ${buildingId}`);
      
      const automationDoc = await getDoc(doc(firestore, 'BUILDINGAUTOMATION', buildingId));
      
      if (automationDoc.exists()) {
        const data = automationDoc.data();
        console.log(`✅ Found automation state:`, data);
        return data;
      } else {
        console.log(`ℹ️ No automation state found for building ${buildingId}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Error loading automation state:', error);
      return null;
    }
  };

  // Helper function to set automation mode in Firestore
  const setAutomationMode = async (buildingId, mode, userEmail) => {
    try {
      console.log(`🤖 Setting automation mode for building ${buildingId}: ${mode}`);
      
      const automationData = {
        buildingId: buildingId,
        mode: mode,
        enabled: mode !== 'none',
        lastModified: serverTimestamp(),
        modifiedBy: userEmail || 'unknown',
        modes: {
          'turn-off-all': mode === 'turn-off-all',
          'eco-mode': mode === 'eco-mode',
          'night-mode': mode === 'night-mode'
        }
      };
      
      await setDoc(doc(firestore, 'BUILDINGAUTOMATION', buildingId), automationData);
      console.log(`✅ Automation mode set successfully`);
      
      return automationData;
    } catch (error) {
      console.error('❌ Error setting automation mode:', error);
      throw error;
    }
  };

  // Helper function to get automation statistics
  const getAutomationStatistics = async (buildingId) => {
    try {
      console.log(`📊 Getting automation statistics for building: ${buildingId}`);
      
      const devices = await buildingService.getBuildingDevices(buildingId);
      const automationState = await loadAutomationState(buildingId);
      
      const totalDevices = devices.length;
      const onlineDevices = devices.filter(device => 
        device.Status === 'ON' || device.status === 'ON'
      ).length;
      
      // For demonstration - in real implementation, this would come from Pi status
      const lockedDevices = automationState?.enabled ? totalDevices : 0;
      
      let modeTitle = 'No Automation';
      if (automationState?.enabled) {
        switch (automationState.mode) {
          case 'turn-off-all':
            modeTitle = 'Turn Off All';
            break;
          case 'eco-mode':
            modeTitle = 'Eco Mode';
            break;
          case 'night-mode':
            modeTitle = 'Night Mode';
            break;
          default:
            modeTitle = 'Custom Mode';
        }
      }
      
      return {
        totalDevices,
        onlineDevices,
        lockedDevices,
        modeTitle,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting automation statistics:', error);
      return {
        totalDevices: 0,
        onlineDevices: 0,
        lockedDevices: 0,
        modeTitle: 'Error',
        lastUpdate: new Date().toISOString()
      };
    }
  };

  // Load building data
  useEffect(() => {
    const loadBuildingData = async () => {
      try {
        setLoadingDevices(true);
        setError(null);
        
        console.log(`🏢 Loading automation data for building: ${building.id}`);
        
        // Use buildingService to get devices
        const devices = await buildingService.getBuildingDevices(building.id);
        setBuildingDevices(devices);
        
        // Load automation state
        const automationState = await loadAutomationState(building.id);
        if (automationState) {
          setAutomationModes({
            'turn-off-all': automationState.modes?.['turn-off-all'] || false,
            'eco-mode': automationState.modes?.['eco-mode'] || false,
            'night-mode': automationState.modes?.['night-mode'] || false
          });
        }
        
        // Get automation statistics
        const stats = await getAutomationStatistics(building.id);
        setAutomationStats(stats);
        
      } catch (error) {
        console.error('❌ Error loading building data:', error);
        setError('Failed to load building data: ' + error.message);
      } finally {
        setLoadingDevices(false);
      }
    };

    if (building?.id) {
      loadBuildingData();
    }
  }, [building?.id]);

  // Handle automation toggle
  const handleToggleChange = useCallback(async (optionId) => {
    if (isApplying) return;
    
    const wasActive = automationModes[optionId];
    const selectedOptionData = automationOptions.find(opt => opt.id === optionId);
    
    try {
      setIsApplying(true);
      setError(null);
      setSuccess(null);
      
      // Determine new mode
      const newMode = wasActive ? 'none' : optionId;
      
      // Update Firestore - Pi will read this and apply automation
      await setAutomationMode(building.id, newMode, localStorage.getItem('userEmail'));
      
      // Update local state immediately
      setAutomationModes(prev => {
        if (wasActive) {
          // Turning off - clear all modes
          return {
            'turn-off-all': false,
            'eco-mode': false,
            'night-mode': false
          };
        } else {
          // Turning on - set only this mode
          return {
            'turn-off-all': optionId === 'turn-off-all',
            'eco-mode': optionId === 'eco-mode',
            'night-mode': optionId === 'night-mode'
          };
        }
      });

      // Show success message
      if (!wasActive) {
        switch (optionId) {
          case 'turn-off-all':
            setSuccess(`🤖 Raspberry Pi will turn off and lock all devices`);
            break;
          case 'eco-mode':
            setSuccess(`🌱 Raspberry Pi will activate Eco Mode`);
            break;
          case 'night-mode':
            setSuccess(`🌙 Raspberry Pi will activate Night Mode`);
            break;
        }
      } else {
        setSuccess('🤖 Raspberry Pi will disable automation and unlock devices');
      }
      
      // Refresh stats after a short delay to allow Pi to process
      setTimeout(async () => {
        try {
          const updatedStats = await getAutomationStatistics(building.id);
          setAutomationStats(updatedStats);
        } catch (error) {
          console.error('❌ Error refreshing stats:', error);
        }
      }, 2000);
      
      // Call parent callback if provided
      if (onAutomationApply) {
        const automationConfig = {
          buildingId: building.id,
          buildingName: building.BuildingName || building.id,
          automationType: newMode,
          automationTitle: wasActive ? 'No Automation' : selectedOptionData?.title,
          timestamp: new Date().toISOString(),
          appliedBy: localStorage.getItem('userEmail') || 'automation'
        };
        
        await onAutomationApply(automationConfig);
      }
      
      setTimeout(() => setSuccess(null), 5000);
      
    } catch (error) {
      console.error('❌ Error applying building automation:', error);
      setError(`Failed to update automation mode: ${error.message}`);
      
      // Revert state on error
      setAutomationModes(prev => {
        if (wasActive) {
          return { ...prev, [optionId]: true };
        } else {
          return {
            'turn-off-all': false,
            'eco-mode': false,
            'night-mode': false
          };
        }
      });
      
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsApplying(false);
    }
  }, [automationModes, building, automationOptions, onAutomationApply]);

  // Check if user has permission
  if (userRole !== 'parent') {
    return (
      <div className="building-automation-tab">
        <div className="automation-unavailable">
          <MdBolt className="unavailable-icon" />
          <h3>Automation Access Restricted</h3>
          <p>Only building parents can configure automation settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="building-automation-tab">
      {/* Header */}
      <div className="automation-header">
        <div className="header-content">
          <h3>
            <MdBolt className="header-icon" />
            Smart Building Automation
            {/* <span className="pi-badge">
              <MdMemory className="pi-icon" />
              Pi-Controlled
            </span> */}
          </h3>
          <p>Configure automated behavior for all devices in <strong>{building.BuildingName || building.id}</strong></p>
        </div>
      </div>

      {/* Error and Success Messages */}
      {error && (
        <div className="error-message">
          <MdWarning /> {error}
        </div>
      )}
      
      {success && (
        <div className="success-message">
          ✅ {success}
        </div>
      )}

      {/* Building Status Info */}
      {/* <div className="building-status-info">
        <div className="status-item">
          <span className="status-label">Building</span>
          <span className="status-value">{building.BuildingName || building.id}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Your Role</span>
          <span className="status-value role-parent">Parent</span>
        </div>
        <div className="status-item">
          <span className="status-label">Total Devices</span>
          <span className="status-value">{buildingDevices.length}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Automation</span>
          <span className="status-value">
            {Object.values(automationModes).some(Boolean) ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div> */}

      {/* Devices Preview */}
      {/* {buildingDevices.length > 0 && (
        <div className="devices-preview">
          <h4>Connected Devices ({buildingDevices.length})</h4>
          <div className="devices-list">
            {buildingDevices.slice(0, 3).map(device => (
              <div key={device.id} className="device-preview-item">
                <span className="device-name">
                  {device.DeviceName || device.id} - {device.locationName}
                </span>
                <span className={`device-status ${(device.Status || device.status || 'unknown').toLowerCase()}`}>
                  {device.Status || device.status || 'Unknown'}
                </span>
              </div>
            ))}
            {buildingDevices.length > 3 && (
              <div className="device-preview-item more">
                +{buildingDevices.length - 3} more devices
              </div>
            )}
          </div>
        </div>
      )} */}

      {/* Automation Options */}
      <div className="automation-options-section">
        <h4>Select Automation Mode</h4>
        
        {loadingDevices ? (
          <div className="loading-message">Loading building devices...</div>
        ) : buildingDevices.length === 0 ? (
          <div className="no-devices-message">
            <MdWarning />
            <p>No devices found in this building. Add devices to locations before configuring automation.</p>
          </div>
        ) : (
          <div className="automation-options">
            {automationOptions.map((option) => {
              const IconComponent = option.icon;
              const isActive = automationModes[option.id];
              
              return (
                <div key={option.id} className={`automation-option ${isActive ? 'active' : ''}`}>
                  <div className="option-info">
                    <div className="option-header">
                      <IconComponent 
                        className="option-icon" 
                        style={{ color: option.color }}
                      />
                      <h5>{option.title}</h5>
                      {/* <span className={`energy-badge ${option.energySaving.toLowerCase()}`}>
                        {option.energySaving} Energy Saving
                      </span> */}
                    </div>
                    <p className="option-description">{option.description}</p>
                    {isActive && (
                      <div className="active-indicator">
                        <div className="active-dot"></div>
                        Currently Active
                      </div>
                    )}
                  </div>
                  
                  <div className="option-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => handleToggleChange(option.id)}
                        className="toggle-input"
                        disabled={isApplying}
                      />
                      <span className="toggle-slider"></span>
                      <span className="toggle-text">
                        {isActive ? 'Disable' : 'Enable'}
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Automation Statistics */}
      {automationStats && (
        <div className="automation-stats">
          <h4>debug</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Devices:</span>
              <span className="stat-value">{automationStats.totalDevices}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Online:</span>
              <span className="stat-value">{automationStats.onlineDevices}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Locked:</span>
              <span className="stat-value">{automationStats.lockedDevices}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Mode:</span>
              <span className="stat-value">{automationStats.modeTitle}</span>
            </div>
          </div>
        </div>
      )}

      {/* Help Section
      <div className="automation-help">
        <h4>Pi-Controlled Automation</h4>
        <ul>
          <li><strong>🤖 Raspberry Pi Control:</strong> All automation is handled directly by the Raspberry Pi</li>
          <li><strong>🔄 Automatic Application:</strong> Changes are applied immediately to connected devices</li>
          <li><strong>🔒 Hardware Locking:</strong> Pi prevents manual device control when automation is active</li>
          <li><strong>⚡ Real-time Response:</strong> No delays - devices respond instantly to automation changes</li>
        </ul>
        <p><em>Note: The Raspberry Pi monitors this building's automation mode and applies changes automatically. Device status will update in real-time.</em></p>
      </div> */}
    </div>
  );
};

export default BuildingAutomationTab;