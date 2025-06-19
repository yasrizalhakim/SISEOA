// src/components/Devices/DeviceAutomationTab.js - ENHANCED WITH MULTI-STAGE SUPPORT
// Pi automation with multiple ON/OFF stages per day, "Learn New Pattern" button, and 30-event rolling limit

import React, { useState, useCallback, useEffect } from 'react';
import { 
  MdBolt, MdAutoMode, MdAnalytics, MdSchedule, MdAccessTime, 
  MdDelete, MdTrendingUp, MdWarning, MdInfo, MdPowerOff,
  MdSettings, MdTimeline, MdSmartToy, MdTune, MdAdd, MdRemove,
  MdRefresh, MdClear, MdLayers
} from 'react-icons/md';
import { firestore } from '../../services/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import AutomationService from '../../services/AutomationService'; // UPDATED IMPORT
import './DeviceAutomationTab.css';

const DeviceAutomationTab = ({ device, userEmail, onAutomationApply }) => {
  // ================================
  // STATE MANAGEMENT
  // ================================
  
  // Main UI state
  const [activeTab, setActiveTab] = useState('smart'); // 'smart', 'analytics', 'manual'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Device permissions
  const [canControl, setCanControl] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  
  // Smart automation (Pi) state - ENHANCED FOR MULTI-STAGE
  const [piRule, setPiRule] = useState(null);
  const [updatingPiRule, setUpdatingPiRule] = useState(false);
  
  // Analytics state (read-only insights)
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analysisWindow, setAnalysisWindow] = useState(14);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [eventHistoryCount, setEventHistoryCount] = useState(0);
  
  // Manual rule builder state - ENHANCED FOR MULTI-STAGE
  const [ruleBuilderMode, setRuleBuilderMode] = useState('simple'); // 'simple' or 'multi-stage'
  const [customTimes, setCustomTimes] = useState({
    startTime: '08:00',
    endTime: '18:00'
  });
  const [multiStageConfig, setMultiStageConfig] = useState([
    {
      day: 'Monday',
      stages: [{ start: '08:00', end: '18:00' }]
    }
  ]);

  // ================================
  // PERMISSION CHECKING
  // ================================
  
  const checkDevicePermissions = useCallback(async () => {
    if (!userEmail || !device?.Location) {
      setCanControl(false);
      setCheckingPermissions(false);
      return;
    }
    
    try {
      // Check if user is assigned to device
      const assignedUsers = device.AssignedTo || [];
      if (assignedUsers.includes(userEmail)) {
        setCanControl(true);
        setCheckingPermissions(false);
        return;
      }
      
      // Check if user is parent of building
      const locationDoc = await getDoc(doc(firestore, 'LOCATION', device.Location));
      if (!locationDoc.exists()) {
        setCanControl(false);
        setCheckingPermissions(false);
        return;
      }

      const locationData = locationDoc.data();
      const deviceBuildingId = locationData.Building;

      const userBuildingQuery = query(
        collection(firestore, 'USERBUILDING'),
        where('User', '==', userEmail),
        where('Building', '==', deviceBuildingId),
        where('Role', '==', 'parent')
      );

      const userBuildingSnapshot = await getDocs(userBuildingQuery);
      setCanControl(!userBuildingSnapshot.empty);
      
    } catch (error) {
      console.error('Error checking permissions:', error);
      setCanControl(false);
    } finally {
      setCheckingPermissions(false);
    }
  }, [userEmail, device]);

  // ================================
  // DATA LOADING
  // ================================
  
  const loadAutomationData = useCallback(async () => {
    if (!device?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Load Pi automation rule using enhanced service
      const rule = await AutomationService.getPiAutomationRule(device.id);
      setPiRule(rule);
      
      // Load event history count
      const historyCount = await AutomationService.getEventHistoryCount(device.id);
      setEventHistoryCount(historyCount);
      
    } catch (err) {
      console.error('Error loading automation data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [device?.id]);

  const loadAnalyticsData = useCallback(async () => {
    if (!device?.id) return;
    
    setLoadingAnalytics(true);
    
    try {
      // Load enhanced analytics data with multi-stage analysis
      const patternResult = await AutomationService.detectDevicePatterns(device.id, analysisWindow);
      setAnalyticsData(patternResult);
      
    } catch (err) {
      console.error('Error loading analytics data:', err);
      setAnalyticsData({ error: err.message });
    } finally {
      setLoadingAnalytics(false);
    }
  }, [device?.id, analysisWindow]);

  // ================================
  // EFFECTS
  // ================================
  
  useEffect(() => {
    checkDevicePermissions();
  }, [checkDevicePermissions]);
  
  useEffect(() => {
    if (canControl) {
      loadAutomationData();
    }
  }, [canControl, loadAutomationData]);

  useEffect(() => {
    if (canControl && activeTab === 'analytics') {
      loadAnalyticsData();
    }
  }, [canControl, activeTab, analysisWindow, loadAnalyticsData]);

  // ================================
  // SMART AUTOMATION HANDLERS (ENHANCED FOR MULTI-STAGE)
  // ================================
  
  const handleTogglePiAutomation = useCallback(async (enabled) => {
    if (!piRule && enabled) {
      alert('No automation rule found. Create a manual rule first or wait for auto-detection.');
      return;
    }
    
    try {
      setUpdatingPiRule(true);
      
      await AutomationService.updatePiAutomationRule(device.id, { enabled }, userEmail);
      setPiRule(prev => ({ ...prev, enabled }));
      
    } catch (error) {
      console.error('Error updating Pi rule:', error);
      alert('Failed to update automation. Please try again.');
    } finally {
      setUpdatingPiRule(false);
    }
  }, [device?.id, userEmail, piRule]);

  const handleCreateManualRule = useCallback(async () => {
    const ruleType = ruleBuilderMode === 'multi-stage' ? 'multi-stage' : 'simple';
    const confirmMessage = ruleBuilderMode === 'multi-stage' ? 
      'Create a multi-stage automation rule? This will replace any existing rule.' :
      'Create a simple automation rule? This will replace any existing rule.';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      setUpdatingPiRule(true);
      
      let manualRule;
      
      if (ruleBuilderMode === 'multi-stage') {
        // Create multi-stage rule
        const validation = validateMultiStageConfig(multiStageConfig);
        
        if (!validation.isValid) {
          alert(`Cannot create rule:\n${validation.errors.join('\n')}`);
          return;
        }
        
        if (validation.warnings.length > 0) {
          const proceedWithWarnings = window.confirm(
            `Warnings detected:\n${validation.warnings.join('\n')}\n\nProceed anyway?`
          );
          if (!proceedWithWarnings) return;
        }
        
        manualRule = await AutomationService.createManualPiRule(device.id, {
          multiStage: true,
          stages: multiStageConfig
        }, userEmail);
        
        // Update success message to use validation
        const successMessage = `Multi-stage rule created with ${validation.stageCount} stages! Rule starts DISABLED - enable it when ready.`;
        alert(successMessage);
      } else {
        // Create simple rule
        manualRule = await AutomationService.createManualPiRule(device.id, {
          startTime: customTimes.startTime,
          endTime: customTimes.endTime,
          multiStage: false
        }, userEmail);
        
        const successMessage = `Simple rule created! Device will turn ON at ${customTimes.startTime} and OFF at ${customTimes.endTime}. Rule starts DISABLED - enable it when ready.`;
        alert(successMessage);
      }
      
      setPiRule(manualRule);
      
      // Call automation apply callback
      if (onAutomationApply) {
        const ruleDescription = ruleBuilderMode === 'multi-stage' ? 
          `Multi-Stage Rule: ${validateMultiStageConfig(multiStageConfig).stageCount} stages` :
          `Simple Rule: ${customTimes.startTime} - ${customTimes.endTime}`;
          
        await onAutomationApply({
          deviceId: device.id,
          deviceName: device.DeviceName || device.id,
          automationType: ruleBuilderMode === 'multi-stage' ? 'pi-multi-stage' : 'pi-manual',
          automationTitle: ruleDescription,
          timestamp: new Date().toISOString(),
          appliedBy: userEmail,
          schedule: manualRule
        });
      }
      
    } catch (error) {
      console.error('Error creating manual rule:', error);
      alert('Failed to create automation rule. Please try again.');
    } finally {
      setUpdatingPiRule(false);
    }
  }, [device?.id, userEmail, ruleBuilderMode, customTimes, multiStageConfig, onAutomationApply]);

  // ================================
  // LEARN NEW PATTERN HANDLER
  // ================================
  
  const handleLearnNewPattern = useCallback(async () => {
    const confirmMessage = `Clear all ${eventHistoryCount} events from device history and start learning new patterns?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      setUpdatingPiRule(true);
      
      // Clear event history
      const clearedCount = await AutomationService.clearDeviceEventHistory(device.id);
      
      // Delete existing automation rule
      if (piRule) {
        await AutomationService.deletePiAutomationRule(device.id);
        setPiRule(null);
      }
      
      // Update event history count
      setEventHistoryCount(0);
      
      alert(`Pattern learning reset! Cleared ${clearedCount} events. Pi will start learning new patterns from your usage.`);
      
    } catch (error) {
      console.error('Error learning new pattern:', error);
      alert('Failed to reset pattern learning. Please try again.');
    } finally {
      setUpdatingPiRule(false);
    }
  }, [device?.id, eventHistoryCount, piRule]);

  // ================================
  // MULTI-STAGE CONFIGURATION HELPERS
  // ================================
  
  const validateMultiStageConfig = (config) => {
    const errors = [];
    const warnings = [];
    let totalStages = 0;
    
    config.forEach((dayConfig, dayIndex) => {
      const day = dayConfig.day;
      const stages = dayConfig.stages || [];
      
      if (stages.length === 0) {
        warnings.push(`${day}: No stages defined`);
        return;
      }
      
      stages.forEach((stage, stageIndex) => {
        totalStages++;
        
        if (!stage.start || !stage.end) {
          errors.push(`${day} Stage ${stageIndex + 1}: Missing start or end time`);
          return;
        }
        
        if (stage.start >= stage.end) {
          errors.push(`${day} Stage ${stageIndex + 1}: Start time must be before end time`);
        }
      });
      
      // Check for overlapping stages within the same day
      for (let i = 0; i < stages.length - 1; i++) {
        for (let j = i + 1; j < stages.length; j++) {
          const stage1 = stages[i];
          const stage2 = stages[j];
          
          if ((stage1.start < stage2.end && stage1.end > stage2.start)) {
            errors.push(`${day}: Overlapping stages detected`);
          }
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

  const addStageToDay = (dayIndex) => {
    const newConfig = [...multiStageConfig];
    const currentStages = newConfig[dayIndex].stages.length;
    
    // Check 3-stage limit
    if (currentStages >= 3) {
      alert('Maximum 3 stages allowed per day');
      return;
    }
    
    newConfig[dayIndex].stages.push({ start: '08:00', end: '18:00' });
    setMultiStageConfig(newConfig);
  };

  const removeStageFromDay = (dayIndex, stageIndex) => {
    const newConfig = [...multiStageConfig];
    newConfig[dayIndex].stages.splice(stageIndex, 1);
    setMultiStageConfig(newConfig);
  };

  const updateStage = (dayIndex, stageIndex, field, value) => {
    const newConfig = [...multiStageConfig];
    newConfig[dayIndex].stages[stageIndex][field] = value;
    setMultiStageConfig(newConfig);
  };

  const addDay = () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const usedDays = multiStageConfig.map(config => config.day);
    const availableDays = days.filter(day => !usedDays.includes(day));
    
    if (availableDays.length > 0) {
      const newConfig = [...multiStageConfig, {
        day: availableDays[0],
        stages: [{ start: '08:00', end: '18:00' }]
      }];
      setMultiStageConfig(newConfig);
    }
  };

  const removeDay = (dayIndex) => {
    const newConfig = [...multiStageConfig];
    newConfig.splice(dayIndex, 1);
    setMultiStageConfig(newConfig);
  };

  // ================================
  // RENDER HELPERS
  // ================================
  
  const renderPermissionCheck = () => {
    if (checkingPermissions) {
      return (
        <div className="device-automation-loading">
          <MdSettings className="loading-icon spinning" />
          <span>Checking permissions...</span>
        </div>
      );
    }
    
    if (!canControl) {
      return (
        <div className="device-automation-error">
          <MdWarning className="error-icon" />
          <div>
            <h3>Access Restricted</h3>
            <p>You don't have permission to configure automation for this device.</p>
          </div>
        </div>
      );
    }
    
    return null;
  };

  const renderTabNavigation = () => (
    <div className="automation-tabs">
      <button 
        className={`tab-button ${activeTab === 'smart' ? 'active' : ''}`}
        onClick={() => setActiveTab('smart')}
      >
        <MdSmartToy /> Pi Automation
      </button>
      <button 
        className={`tab-button ${activeTab === 'manual' ? 'active' : ''}`}
        onClick={() => setActiveTab('manual')}
      >
        <MdTune /> Manual Rules
      </button>
      <button 
        className={`tab-button ${activeTab === 'analytics' ? 'active' : ''}`}
        onClick={() => setActiveTab('analytics')}
      >
        <MdAnalytics /> Analytics
      </button>
    </div>
  );

  const renderPiAutomationTab = () => (
    <div className="automation-tab-content">
      <div className="automation-section">
        <div className="section-header">
          <div className="section-title">
            <MdBolt className="section-icon" />
            <h3>Smart Pi Automation</h3>
          </div>
          <div className="section-subtitle">
            Automatic device control based on usage patterns
          </div>
        </div>

        {/* Current Rule Display - ENHANCED FOR MULTI-STAGE */}
        <div className="current-rule-card">
          {piRule ? (
            <div className="rule-info">
              <div className="rule-header">
                <div className="rule-title">
                  <span className={`rule-status ${piRule.enabled ? 'enabled' : 'disabled'}`}>
                    {piRule.enabled ? 'ACTIVE' : 'DISABLED'}
                  </span>
                  <span className="rule-type">
                    {piRule.isMultiStage ? (
                      <>
                        <MdLayers className="icon" />
                        Multi-Stage Rule ({piRule.stageCount} stages)
                      </>
                    ) : (
                      <>
                        <MdSchedule className="icon" />
                        Simple Rule
                      </>
                    )}
                  </span>
                </div>
                <div className="rule-actions">
                  <button
                    className={`toggle-button ${piRule.enabled ? 'on' : 'off'}`}
                    onClick={() => handleTogglePiAutomation(!piRule.enabled)}
                    disabled={updatingPiRule}
                  >
                    {updatingPiRule ? 'Updating...' : (piRule.enabled ? 'Turn OFF' : 'Turn ON')}
                  </button>
                </div>
              </div>

              <div className="rule-schedule">
                <h4>Schedule:</h4>
                <div className="schedule-display">
                  {piRule.isMultiStage ? (
                    <div className="multi-stage-display">
                      {piRule.schedules?.map((daySchedule, index) => (
                        <div key={index} className="day-schedule">
                          <strong>{daySchedule.day}:</strong>
                          {daySchedule.stages?.map((stage, stageIndex) => (
                            <span key={stageIndex} className="stage-time">
                              {stage.start} - {stage.end}
                              {stageIndex < daySchedule.stages.length - 1 && ', '}
                            </span>
                          )) || <span className="no-stages">No stages</span>}
                        </div>
                      )) || <div>No schedule configured</div>}
                    </div>
                  ) : (
                    <div className="simple-schedule-display">
                      <MdAccessTime className="icon" />
                      {piRule.start} - {piRule.end}
                      {piRule.days && (
                        <div className="active-days">
                          <strong>Days:</strong> {piRule.days.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rule-metadata">
                <div className="metadata-row">
                  <span className="metadata-label">Source:</span>
                  <span className="metadata-value">
                    {piRule.source === 'historical' ? 'Auto-detected' : 'Manual'}
                  </span>
                </div>
                {piRule.basedOnEvents > 0 && (
                  <div className="metadata-row">
                    <span className="metadata-label">Based on:</span>
                    <span className="metadata-value">{piRule.basedOnEvents} usage events</span>
                  </div>
                )}
                <div className="metadata-row">
                  <span className="metadata-label">Created:</span>
                  <span className="metadata-value">
                    {piRule.createdAt ? new Date(piRule.createdAt).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="no-rule-info">
              <MdInfo className="info-icon" />
              <div>
                <h4>No Automation Rule</h4>
                <p>Create a manual rule or use the device regularly for auto-detection.</p>
              </div>
            </div>
          )}
        </div>

        {/* Learning Status & Actions */}
        <div className="learning-section">
          <div className="learning-info">
            <MdAnalytics className="icon" />
            <div>
              <h4>Pattern Learning</h4>
              <p>Pi has recorded {eventHistoryCount}/30 usage events for pattern analysis</p>
            </div>
          </div>
          
          <button
            className="learn-button"
            onClick={handleLearnNewPattern}
            disabled={updatingPiRule}
          >
            <MdClear className="icon" />
            Learn New Pattern
          </button>
        </div>
      </div>
    </div>
  );

  const renderManualRulesTab = () => (
    <div className="automation-tab-content">
      <div className="automation-section">
        <div className="section-header">
          <div className="section-title">
            <MdTune className="section-icon" />
            <h3>Manual Rule Builder</h3>
          </div>
          <div className="section-subtitle">
            Create custom automation schedules
          </div>
        </div>

        {/* Rule Type Selector */}
        <div className="rule-type-selector">
          <button
            className={`type-button ${ruleBuilderMode === 'simple' ? 'active' : ''}`}
            onClick={() => setRuleBuilderMode('simple')}
          >
            <MdSchedule className="icon" />
            Simple Rule
          </button>
          <button
            className={`type-button ${ruleBuilderMode === 'multi-stage' ? 'active' : ''}`}
            onClick={() => setRuleBuilderMode('multi-stage')}
          >
            <MdLayers className="icon" />
            Multi-Stage Rule
          </button>
        </div>

        {/* Simple Rule Builder */}
        {ruleBuilderMode === 'simple' && (
          <div className="simple-rule-builder">
            <div className="time-inputs">
              <div className="input-group">
                <label>Start Time:</label>
                <input
                  type="time"
                  value={customTimes.startTime}
                  onChange={(e) => setCustomTimes(prev => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label>End Time:</label>
                <input
                  type="time"
                  value={customTimes.endTime}
                  onChange={(e) => setCustomTimes(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="rule-preview">
              <h4>Preview:</h4>
              <p>Device will turn ON at {customTimes.startTime} and OFF at {customTimes.endTime} on weekdays</p>
            </div>
          </div>
        )}

        {/* Multi-Stage Rule Builder */}
        {ruleBuilderMode === 'multi-stage' && (
          <div className="multi-stage-rule-builder">
            <div className="builder-header">
              <h4>Configure Multiple Stages</h4>
              <button className="add-day-button" onClick={addDay}>
                <MdAdd className="icon" />
                Add Day
              </button>
            </div>

            {multiStageConfig.map((dayConfig, dayIndex) => (
              <div key={dayIndex} className="day-config">
                <div className="day-header">
                  <select
                    value={dayConfig.day}
                    onChange={(e) => {
                      const newConfig = [...multiStageConfig];
                      newConfig[dayIndex].day = e.target.value;
                      setMultiStageConfig(newConfig);
                    }}
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  
                  <div className="day-actions">
                    <button 
                      className="add-stage-button"
                      onClick={() => addStageToDay(dayIndex)}
                      disabled={dayConfig.stages.length >= 3}
                      title={dayConfig.stages.length >= 3 ? 'Maximum 3 stages per day' : 'Add new stage'}
                    >
                      <MdAdd className="icon" />
                      Stage {dayConfig.stages.length >= 3 ? '(Max)' : ''}
                    </button>
                    {multiStageConfig.length > 1 && (
                      <button 
                        className="remove-day-button"
                        onClick={() => removeDay(dayIndex)}
                      >
                        <MdRemove className="icon" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="stages-list">
                  {dayConfig.stages.map((stage, stageIndex) => (
                    <div key={stageIndex} className="stage-config">
                      <span className="stage-label">Stage {stageIndex + 1}:</span>
                      <input
                        type="time"
                        value={stage.start}
                        onChange={(e) => updateStage(dayIndex, stageIndex, 'start', e.target.value)}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={stage.end}
                        onChange={(e) => updateStage(dayIndex, stageIndex, 'end', e.target.value)}
                      />
                      {dayConfig.stages.length > 1 && (
                        <button 
                          className="remove-stage-button"
                          onClick={() => removeStageFromDay(dayIndex, stageIndex)}
                        >
                          <MdRemove className="icon" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="multi-stage-preview">
              <h4>Preview:</h4>
              <div className="preview-summary">
                {validateMultiStageConfig(multiStageConfig).stageCount} total stages across {multiStageConfig.length} days
              </div>
              {multiStageConfig.map((dayConfig, index) => (
                <div key={index} className="preview-day">
                  <strong>{dayConfig.day}:</strong>
                  {dayConfig.stages.map((stage, stageIndex) => (
                    <span key={stageIndex} className="preview-stage">
                      {stage.start} - {stage.end}
                      {stageIndex < dayConfig.stages.length - 1 && ', '}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            {/* Validation Messages */}
            {(() => {
              const validation = validateMultiStageConfig(multiStageConfig);
              return (
                <>
                  {validation.errors.length > 0 && (
                    <div className="validation-errors">
                      <MdWarning className="icon" />
                      <div>
                        <strong>Errors:</strong>
                        <ul>
                          {validation.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div className="validation-warnings">
                      <MdInfo className="icon" />
                      <div>
                        <strong>Warnings:</strong>
                        <ul>
                          {validation.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Create Rule Button */}
        <div className="rule-actions">
          <button
            className="create-rule-button"
            onClick={handleCreateManualRule}
            disabled={updatingPiRule || (ruleBuilderMode === 'multi-stage' && !validateMultiStageConfig(multiStageConfig).isValid)}
          >
            {updatingPiRule ? 'Creating...' : `Create ${ruleBuilderMode === 'multi-stage' ? 'Multi-Stage' : 'Simple'} Rule`}
          </button>
        </div>

        {/* Important Note */}
        <div className="rule-note">
          <MdInfo className="icon" />
          <p><strong>Note:</strong> New rules start DISABLED. Enable them in the Pi Automation tab when ready.</p>
        </div>
      </div>
    </div>
  );

  const renderAnalyticsTab = () => (
    <div className="automation-tab-content">
      <div className="automation-section">
        <div className="section-header">
          <div className="section-title">
            <MdAnalytics className="section-icon" />
            <h3>Usage Analytics</h3>
          </div>
          <div className="section-subtitle">
            Insights from device usage patterns (Read-only)
          </div>
        </div>

        <div className="analytics-controls">
          <div className="control-group">
            <label>Analysis Window:</label>
            <select 
              value={analysisWindow} 
              onChange={(e) => setAnalysisWindow(parseInt(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
          <button className="refresh-analytics-button" onClick={loadAnalyticsData}>
            <MdRefresh className="icon" />
            Refresh
          </button>
        </div>

        {loadingAnalytics ? (
          <div className="analytics-loading">
            <MdAnalytics className="loading-icon spinning" />
            <span>Analyzing usage patterns...</span>
          </div>
        ) : analyticsData ? (
          <div className="analytics-results">
            {/* Usage Summary */}
            <div className="analytics-card">
              <h4>Usage Summary</h4>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="summary-label">Total Events:</span>
                  <span className="summary-value">{analyticsData.totalEvents}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Turn-On Events:</span>
                  <span className="summary-value">{analyticsData.turnOnEvents}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Analysis Period:</span>
                  <span className="summary-value">{analysisWindow} days</span>
                </div>
              </div>
            </div>

            {/* Multi-Stage Analysis */}
            {analyticsData.multiStageAnalysis && (
              <div className="analytics-card">
                <h4>Multi-Stage Analysis</h4>
                <div className="multi-stage-metrics">
                  <div className="metric">
                    <span className="metric-label">Sessions Detected:</span>
                    <span className="metric-value">{analyticsData.multiStageAnalysis.sessionsDetected}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Avg Sessions/Day:</span>
                    <span className="metric-value">{analyticsData.multiStageAnalysis.avgSessionsPerDay}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Days with Multiple Sessions:</span>
                    <span className="metric-value">{analyticsData.multiStageAnalysis.daysWithMultipleSessions}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Max Sessions in Day:</span>
                    <span className="metric-value">{analyticsData.multiStageAnalysis.maxSessionsInDay}</span>
                  </div>
                </div>
                {analyticsData.multiStageAnalysis.recommendation && (
                  <div className="analysis-recommendation">
                    <MdInfo className="icon" />
                    <span>{analyticsData.multiStageAnalysis.recommendation}</span>
                  </div>
                )}
              </div>
            )}

            {/* Usage Patterns */}
            {analyticsData.hasPatterns && analyticsData.patterns?.length > 0 ? (
              <div className="analytics-card">
                <h4>Detected Patterns</h4>
                <div className="patterns-list">
                  {analyticsData.patterns.map((pattern, index) => (
                    <div key={index} className="pattern-item">
                      <div className="pattern-header">
                        <span className="pattern-type">{pattern.type}</span>
                        <span className="pattern-confidence">
                          {pattern.confidence ? `${Math.round(pattern.confidence * 100)}% confidence` : ''}
                        </span>
                      </div>
                      <div className="pattern-title">{pattern.title}</div>
                      <div className="pattern-description">{pattern.description}</div>
                      {pattern.recommendation && (
                        <div className="pattern-recommendation">
                          <MdTrendingUp className="icon" />
                          {pattern.recommendation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="analytics-card">
                <div className="no-patterns">
                  <MdInfo className="info-icon" />
                  <div>
                    <h4>No Clear Patterns</h4>
                    <p>{analyticsData.message || 'Device usage doesn\'t show consistent patterns yet.'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Event History Status */}
            <div className="analytics-card">
              <h4>Pattern Learning Status</h4>
              <div className="learning-status">
                <div className="progress-info">
                  <span>Event History: {eventHistoryCount}/30 events</span>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${(eventHistoryCount / 30) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div className="learning-tips">
                  <MdInfo className="icon" />
                  <span>
                    {eventHistoryCount < 10 
                      ? 'Use the device more to improve pattern detection'
                      : eventHistoryCount < 20 
                      ? 'Good progress! More usage will improve accuracy'
                      : 'Excellent data for reliable pattern detection'
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {analyticsData.error && (
              <div className="analytics-error">
                <MdWarning className="error-icon" />
                <div>
                  <h4>Analysis Error</h4>
                  <p>{analyticsData.error}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="analytics-empty">
            <MdAnalytics className="empty-icon" />
            <p>Click "Refresh" to analyze usage patterns</p>
          </div>
        )}
      </div>
    </div>
  );

  // ================================
  // MAIN RENDER
  // ================================
  
  const permissionCheck = renderPermissionCheck();
  if (permissionCheck) {
    return <div className="device-automation-tab">{permissionCheck}</div>;
  }

  return (
    <div className="device-automation-tab">
      <div className="automation-header">
        <div className="header-title">
          <MdBolt className="header-icon" />
          <h2>Device Automation</h2>
        </div>
        <div className="header-subtitle">
          Smart automation powered by Raspberry Pi with multi-stage support
        </div>
      </div>

      {renderTabNavigation()}

      {error && (
        <div className="automation-error">
          <MdWarning className="error-icon" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="automation-loading">
          <MdSettings className="loading-icon spinning" />
          <span>Loading automation data...</span>
        </div>
      ) : (
        <>
          {activeTab === 'smart' && renderPiAutomationTab()}
          {activeTab === 'manual' && renderManualRulesTab()}
          {activeTab === 'analytics' && renderAnalyticsTab()}
        </>
      )}
    </div>
  );
};

export default DeviceAutomationTab;