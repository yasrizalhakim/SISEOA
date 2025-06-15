// src/components/Buildings/BuildingAutomationTab.js - REFACTORED to use automationService
import React, { useState, useCallback, useEffect } from 'react';
import { MdBolt, MdNightlight, MdEco, MdPowerOff, MdWarning } from 'react-icons/md';
import automationService from '../../services/automationService'; // Use the service
import './BuildingAutomationTab.css';

const BuildingAutomationTab = ({ building, userRole, onAutomationApply }) => {
  // State for automation modes - only one can be true at a time
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
      title: 'Turn Off All Devices',
      description: 'Instantly shuts down all connected devices in this building to maximize energy savings.',
      icon: MdPowerOff,
      color: '#dc2626',
      energySaving: 'Maximum'
    },
    {
      id: 'eco-mode',
      title: 'Eco Mode',
      description: 'Turns off high-energy devices (AC, heaters) and optimizes others to reduce consumption by 30-50%.',
      icon: MdEco,
      color: '#16a34a',
      energySaving: 'High'
    },
    {
      id: 'night-mode',
      title: 'Night Mode',
      description: 'Keeps only essential lighting active (dimmed) and turns off comfort devices for overnight operation.',
      icon: MdNightlight,
      color: '#1e40af',
      energySaving: 'Medium'
    }
  ];

  // Load building devices and automation state on component mount
  useEffect(() => {
    const loadBuildingData = async () => {
      try {
        setLoadingDevices(true);
        setError(null);
        
        console.log(`🏢 Loading automation data for building: ${building.id}`);
        
        // Use automationService to get devices
        const devices = await automationService.getBuildingDevices(building.id);
        setBuildingDevices(devices);
        console.log(`📱 Loaded ${devices.length} devices for building ${building.id}`);
        
        // Use automationService to load automation state
        const automationState = await automationService.loadAutomationState(building.id);
        if (automationState) {
          setAutomationModes({
            'turn-off-all': automationState.modes?.['turn-off-all'] || false,
            'eco-mode': automationState.modes?.['eco-mode'] || false,
            'night-mode': automationState.modes?.['night-mode'] || false
          });
          console.log(`✅ Loaded automation state:`, automationState);
        }
        
        // Use automationService to get automation statistics
        const stats = await automationService.getAutomationStatistics(building.id);
        setAutomationStats(stats);
        console.log(`📊 Loaded automation statistics:`, stats);
        
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

  // Handle toggle change - use automationService for all operations
  const handleToggleChange = useCallback(async (optionId) => {
    if (isApplying) return;
    
    const wasActive = automationModes[optionId];
    const selectedOptionData = automationOptions.find(opt => opt.id === optionId);
    
    try {
      setIsApplying(true);
      setError(null);
      setSuccess(null);
      
      console.log(`🔄 ${wasActive ? 'Disabling' : 'Enabling'} automation mode: ${optionId}`);
      
      // Update state immediately for UI feedback
      setAutomationModes(prev => {
        if (prev[optionId]) {
          // Turn off current mode
          return {
            'turn-off-all': false,
            'eco-mode': false,
            'night-mode': false
          };
        } else {
          // Turn on selected mode, turn off others
          return {
            'turn-off-all': optionId === 'turn-off-all',
            'eco-mode': optionId === 'eco-mode',
            'night-mode': optionId === 'night-mode'
          };
        }
      });

      let result = { totalDevices: buildingDevices.length, devicesUpdated: 0, energySaved: 0 };
      
      if (!wasActive) {
        // Apply the selected automation mode using automationService
        result = await automationService.applyAutomationMode(building.id, optionId);
        
        // Show appropriate success message
        switch (optionId) {
          case 'turn-off-all':
            setSuccess(`Successfully turned off ${result.devicesUpdated} device(s) in the building`);
            break;
          case 'eco-mode':
            setSuccess(`Eco Mode activated - ${result.devicesUpdated} devices optimized, estimated ${result.energySaved}W energy saved`);
            break;
          case 'night-mode':
            setSuccess(`Night Mode activated - ${result.devicesUpdated} devices adjusted, estimated ${result.energySaved}W energy saved`);
            break;
          default:
            setSuccess('Automation mode activated');
            break;
        }
      } else {
        // Clear automation mode using automationService
        await automationService.clearAutomationState(building.id);
        setSuccess('Automation mode disabled');
      }
      
      // Create automation config for parent component
      const automationConfig = {
        buildingId: building.id,
        buildingName: building.BuildingName || building.id,
        automationType: wasActive ? 'none' : optionId,
        automationTitle: wasActive ? 'No Automation' : selectedOptionData?.title,
        timestamp: new Date().toISOString(),
        appliedBy: localStorage.getItem('userEmail') || 'automation',
        deviceCount: result.totalDevices,
        devicesUpdated: result.devicesUpdated,
        energySaved: result.energySaved
      };
      
      // Save automation state using automationService (only if activating)
      if (!wasActive) {
        await automationService.saveAutomationState(building.id, automationConfig);
      }
      
      // Refresh automation statistics
      const updatedStats = await automationService.getAutomationStatistics(building.id);
      setAutomationStats(updatedStats);
      
      // Call parent component's automation handler if provided
      if (onAutomationApply) {
        await onAutomationApply(automationConfig);
      }

      console.log('✅ Automation operation completed:', automationConfig);
      
      // Refresh device list to show updated statuses
      setTimeout(async () => {
        try {
          const refreshedDevices = await automationService.getBuildingDevices(building.id);
          setBuildingDevices(refreshedDevices);
          console.log(`🔄 Refreshed device statuses after automation`);
        } catch (refreshError) {
          console.error('❌ Error refreshing device statuses:', refreshError);
        }
      }, 1000);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
      
    } catch (error) {
      console.error('❌ Error applying building automation:', error);
      setError(`Failed to apply automation: ${error.message}`);
      
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
      
      // Clear error message after 8 seconds
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsApplying(false);
    }
  }, [automationModes, building, automationOptions, onAutomationApply, buildingDevices.length]);

  // Manual refresh handler
  const handleRefreshDevices = useCallback(async () => {
    try {
      setLoadingDevices(true);
      const refreshedDevices = await automationService.getBuildingDevices(building.id);
      setBuildingDevices(refreshedDevices);
      
      const refreshedStats = await automationService.getAutomationStatistics(building.id);
      setAutomationStats(refreshedStats);
      
      setSuccess('Device statuses refreshed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('❌ Error refreshing devices:', error);
      setError('Failed to refresh device statuses');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoadingDevices(false);
    }
  }, [building.id]);

  // Check if user has permission
  if (userRole !== 'parent') {
    return (
      <div className="building-automation-tab">
        <div className="automation-unavailable">
          <MdBolt className="unavailable-icon" />
          <h3>Automation Access Restricted</h3>
          <p>Only building parents can configure automation settings.</p>
          <p>Contact a building parent to modify automation configurations.</p>
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
            Building Automation
          </h3>
          <p>Configure automated behavior for all devices in <strong>{building.BuildingName || building.id}</strong></p>
        </div>
        {/* <button 
          type="button"
          onClick={handleRefreshDevices}
          disabled={loadingDevices}
          className="refresh-devices-btn"
          title="Refresh device statuses"
        >
          🔄 {loadingDevices ? 'Refreshing...' : 'Refresh'}
        </button> */}
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

      {/* Building Status Info with Automation Statistics
      <div className="building-status-info">
        <div className="status-item">
          <span className="status-label">Building:</span>
          <span className="status-value">{building.BuildingName || building.id}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Address:</span>
          <span className="status-value">{building.Address || 'Not specified'}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Your Role:</span>
          <span className="status-value role-parent">Parent</span>
        </div>
        <div className="status-item">
          <span className="status-label">Connected Devices:</span>
          <span className="status-value">
            {loadingDevices ? 'Loading...' : `${buildingDevices.length} device(s)`}
          </span>
        </div>
        {!loadingDevices && automationStats && (
          <>
            <div className="status-item">
              <span className="status-label">Devices Online:</span>
              <span className="status-value">
                {automationStats.onlineDevices} ON / {automationStats.offlineDevices} OFF
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">Current Mode:</span>
              <span className={`status-value ${automationStats.automationActive ? 'automation-active' : ''}`}>
                {automationStats.currentMode === 'none' ? 'No Automation' : 
                 automationOptions.find(opt => opt.id === automationStats.currentMode)?.title || 'Unknown'}
              </span>
            </div>
            {automationStats.energySaved > 0 && (
              <div className="status-item">
                <span className="status-label">Energy Saved:</span>
                <span className="status-value energy-saved">{automationStats.energySaved}W</span>
              </div>
            )}
          </>
        )}
      </div> */}

      {/* Device Breakdown by Type
      {!loadingDevices && automationStats && automationStats.deviceBreakdown && (
        <div className="device-breakdown">
          <h4>Device Types in Building</h4>
          <div className="device-type-stats">
            {Object.entries(automationStats.deviceBreakdown).map(([type, count]) => (
              count > 0 && (
                <div key={type} className="device-type-stat">
                  <span className="device-type-name">{type.charAt(0).toUpperCase() + type.slice(1)}:</span>
                  <span className="device-type-count">{count}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )} */}

      {/* Device List Preview
      {!loadingDevices && buildingDevices.length > 0 && (
        <div className="devices-preview">
          <h4>Devices in this Building</h4>
          <div className="devices-list">
            {buildingDevices.slice(0, 8).map(device => (
              <div key={device.id} className="device-preview-item">
                <span className="device-name">{device.name}</span>
                <span className="device-type">{device.type}</span>
                <span className={`device-status ${device.status.toLowerCase()}`}>
                  {device.status}
                </span>
              </div>
            ))}
            {buildingDevices.length > 8 && (
              <div className="device-preview-item more">
                <span>... and {buildingDevices.length - 8} more device(s)</span>
              </div>
            )}
          </div>
        </div>
      )} */}

      {/* Automation Options */}
      <div className="automation-options-section">
        <h4>Select Automation Mode</h4>
        <p>Only one automation mode can be active at a time. Toggle to enable/disable each mode.</p>
        
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
                      <span className={`energy-badge ${option.energySaving.toLowerCase()}`}>
                        {option.energySaving} Energy Saving
                      </span>
                    </div>
                    <p className="option-description">{option.description}</p>
                    {/* {isActive && (
                      <div className="active-indicator">
                        <span className="active-dot"></span>
                        Currently Active
                      </div>
                    )} */}
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
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Automation Help */}
      <div className="automation-help">
        <h4>How Building Automation Works</h4>
        <ul>
          <li><strong>Turn Off All Devices:</strong> Immediately switches off all devices in the building. Provides maximum energy savings but requires manual restart of needed devices.</li>
          <li><strong>Eco Mode:</strong> Smart energy optimization that turns off high-consumption devices (AC units more than 2000W) and limits others to reduce energy by 30-50%. Essential lighting remains functional.</li>
          <li><strong>Night Mode:</strong> Optimized for overnight operation - keeps only essential lighting active (dimmed to 50%) and turns off all comfort devices like fans and AC.</li>
        </ul>
        <p><em>Note: Automation state is saved automatically and will persist until manually changed. Energy savings are estimated based on device types and typical wattage.</em></p>
      </div>

    </div>
  );
};

export default BuildingAutomationTab;