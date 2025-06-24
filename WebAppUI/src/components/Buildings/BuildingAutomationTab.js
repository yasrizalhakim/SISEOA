// src/components/Buildings/BuildingAutomationTab.js - Fixed with proper service usage

import React, { useState, useCallback, useEffect } from 'react';
import { MdBolt, MdEco, MdPowerOff, MdWarning, MdMemory, MdLock } from 'react-icons/md';
import buildingService from '../../services/buildingService'; // Import buildingService for building operations
import { firestore } from '../../services/firebase'; // Import for direct Firestore operations
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import './BuildingAutomationTab.css';

const BuildingAutomationTab = ({ building, userRole, onAutomationApply }) => {
  const [automationModes, setAutomationModes] = useState({
    'turn-off-all': false,
    'eco-mode': false,
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
      description: 'Smart hub will immediately shut down and lock all connected devices.',
      icon: MdLock,
      color: '#dc2626',
      energySaving: 'Maximum'
    },
    {
      id: 'eco-mode',
      title: 'Eco Mode',
      description: 'Smart hub automatically turns off high-energy devices (AC units) for energy savings.',
      icon: MdEco,
      color: '#16a34a',
      energySaving: 'High'
    }
  ];

  // Helper function to load automation state from Firestore
  const loadAutomationState = async (buildingId) => {
    try {
      const automationDoc = await getDoc(doc(firestore, 'BUILDINGAUTOMATION', buildingId));
      if (automationDoc.exists()) {
        const data = automationDoc.data();
        return data;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  };

  // Helper function to set automation mode in Firestore
  const setAutomationMode = async (buildingId, mode, userEmail) => {
    try {
      const automationData = {
        buildingId: buildingId,
        mode: mode,
        enabled: mode !== 'none',
        lastModified: serverTimestamp(),
        modifiedBy: userEmail || 'unknown',
        modes: {
          'turn-off-all': mode === 'turn-off-all',
          'eco-mode': mode === 'eco-mode',

        }
      };
      await setDoc(doc(firestore, 'BUILDINGAUTOMATION', buildingId), automationData);
      return automationData;
    } catch (error) {
      throw error;
    }
  };

  // Helper function to get automation statistics
  const getAutomationStatistics = async (buildingId) => {
    try {
      const devices = await buildingService.getBuildingDevices(buildingId);
      const automationState = await loadAutomationState(buildingId);
      
      const totalDevices = devices.length;
      const onlineDevices = devices.filter(device => 
        device.Status === 'ON' || device.status === 'ON'
      ).length;
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
        
        // Use buildingService to get devices
        const devices = await buildingService.getBuildingDevices(building.id);
        setBuildingDevices(devices);
        
        // Load automation state
        const automationState = await loadAutomationState(building.id);
        if (automationState) {
          setAutomationModes({
            'turn-off-all': automationState.modes?.['turn-off-all'] || false,
            'eco-mode': automationState.modes?.['eco-mode'] || false,
          });
        }
        
        // Get automation statistics
        const stats = await getAutomationStatistics(building.id);
        setAutomationStats(stats);
        
      } catch (error) {
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
          };
        } else {
          // Turning on - set only this mode
          return {
            'turn-off-all': optionId === 'turn-off-all',
            'eco-mode': optionId === 'eco-mode',
          };
        }
      });

      // Show success message
      if (!wasActive) {
        switch (optionId) {
          case 'turn-off-all':
            setSuccess(`Smart hub will turn off and lock all devices`);
            break;
          case 'eco-mode':
            setSuccess(`Smart hub will activate Eco Mode`);
            break;
        }
      } else {
        setSuccess('Smart hub will disable automation and unlock devices');
      }
      
      // Refresh stats after a short delay to allow Pi to process
      setTimeout(async () => {
        try {
          const updatedStats = await getAutomationStatistics(building.id);
          setAutomationStats(updatedStats);
        } catch (error) {
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
      setError(`Failed to update automation mode: ${error.message}`);
      // Revert state on error
      setAutomationModes(prev => {
        if (wasActive) {
          return { ...prev, [optionId]: true };
        } else {
          return {
            'turn-off-all': false,
            'eco-mode': false,
            
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
          </h3>
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

    </div>
  );
};

export default BuildingAutomationTab;