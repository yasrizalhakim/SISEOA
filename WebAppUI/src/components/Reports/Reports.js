// src/components/Reports/Reports.js - Updated with Date Range Support

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MdAssessment, MdRefresh, MdDownload, MdBarChart, MdAdminPanelSettings, MdCalendarToday } from 'react-icons/md';
import EnergyReport from './EnergyReport';
import { generateEnergyReportPDF } from './ReportPDFGenerator';
import energyUsageService from '../../services/energyUsageService';
import dataService from '../../services/dataService';
import { 
  isSystemAdmin, 
  getUserBuildingRoles
} from '../../utils/helpers';
import {
  calculateEnergyCost,
  calculateCarbonFootprint,
  analyzeDeviceTypes,
  generateRecommendations,
  calculateSavingsPotential
} from './reportUtils';
import './Reports.css';

const Reports = () => {
  // State management
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [error, setError] = useState(null);
  
  // User context
  const [isUserSystemAdmin, setIsUserSystemAdmin] = useState(false);
  const [userBuildings, setUserBuildings] = useState([]);
  const [systemStats, setSystemStats] = useState({});
  
  // Report controls
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startDateObj, setStartDateObj] = useState(null);
  const [endDateObj, setEndDateObj] = useState(null);
  const [reportData, setReportData] = useState(null);
  
  const userEmail = useMemo(() => 
    localStorage.getItem('userEmail') || '', 
    []
  );

  // Initialize default date range (last 7 days)
  useEffect(() => {
    const { startDate: defaultStart, endDate: defaultEnd } = energyUsageService.getDefaultDateRange();
    
    setStartDateObj(defaultStart);
    setEndDateObj(defaultEnd);
    setStartDate(energyUsageService.formatDateForInput(defaultStart));
    setEndDate(energyUsageService.formatDateForInput(defaultEnd));
  }, []);

  // Check if user is SystemAdmin and load initial data
  useEffect(() => {
    const initializeReports = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!userEmail) {
          setError('User not authenticated');
          setLoading(false);
          return;
        }

        console.log('🔍 Initializing reports for user:', userEmail);

        // Check SystemAdmin status
        const isAdmin = await isSystemAdmin(userEmail);
        setIsUserSystemAdmin(isAdmin);

        if (isAdmin) {
          console.log('🔧 SystemAdmin detected - loading system-wide data');
          await loadSystemAdminData();
        } else {
          console.log('👤 Regular user - loading user buildings');
          await loadUserBuildings();
        }

      } catch (err) {
        console.error('❌ Error initializing reports:', err);
        setError('Failed to load reports data');
      } finally {
        setLoading(false);
      }
    };

    initializeReports();
  }, [userEmail]);

  // Load system-wide data for SystemAdmin
  const loadSystemAdminData = async () => {
    try {
      // Get all buildings
      const allBuildings = await dataService.getAllBuildings();
      
      // Add special "System Overview" option
      const buildingsWithSystem = [
        { 
          id: 'SYSTEM_OVERVIEW', 
          buildingName: 'System Overview',
          BuildingName: 'System Overview'
        },
        ...allBuildings
      ];
      
      setUserBuildings(buildingsWithSystem);
      setSelectedBuilding('SYSTEM_OVERVIEW');

      // Get system statistics
      const allUsers = await getAllSystemUsers();
      const allDevices = await dataService.getAllDevices();
      const allLocations = await dataService.getAllLocations();

      setSystemStats({
        totalUsers: allUsers.length,
        totalBuildings: allBuildings.length,
        totalDevices: allDevices.length,
        totalLocations: allLocations.length,
        activeDevices: allDevices.filter(d => d.status === 'ON').length
      });

      console.log('📊 System stats loaded:', {
        users: allUsers.length,
        buildings: allBuildings.length,
        devices: allDevices.length
      });

    } catch (error) {
      console.error('Error loading system admin data:', error);
      throw error;
    }
  };

  // Get all system users (for SystemAdmin)
  const getAllSystemUsers = async () => {
    try {
      const { getDocs, collection } = await import('firebase/firestore');
      const { firestore } = await import('../../services/firebase');
      
      const usersSnapshot = await getDocs(collection(firestore, 'USER'));
      return usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting all system users:', error);
      return [];
    }
  };

  // Load buildings accessible to regular user
  const loadUserBuildings = async () => {
    try {
      const buildingRoles = await getUserBuildingRoles(userEmail);
      const buildings = [];

      for (const [buildingId, role] of buildingRoles) {
        if (buildingId === 'SystemAdmin') continue;

        try {
          const building = await dataService.getBuilding(buildingId);
          if (building) {
            buildings.push({
              ...building,
              userRole: role
            });
          }
        } catch (err) {
          console.error(`Error loading building ${buildingId}:`, err);
        }
      }

      setUserBuildings(buildings);
      
      // Auto-select first building if available
      if (buildings.length > 0) {
        setSelectedBuilding(buildings[0].id);
      }

      console.log(`👤 User has access to ${buildings.length} buildings`);

    } catch (error) {
      console.error('Error loading user buildings:', error);
      throw error;
    }
  };

  // Handle date changes
  const handleStartDateChange = useCallback((e) => {
    const dateValue = e.target.value;
    setStartDate(dateValue);
    
    if (dateValue) {
      const dateObj = energyUsageService.parseDateFromInput(dateValue);
      dateObj.setHours(0, 0, 0, 0);
      setStartDateObj(dateObj);
    } else {
      setStartDateObj(null);
    }
  }, []);

  const handleEndDateChange = useCallback((e) => {
    const dateValue = e.target.value;
    setEndDate(dateValue);
    
    if (dateValue) {
      const dateObj = energyUsageService.parseDateFromInput(dateValue);
      dateObj.setHours(23, 59, 59, 999);
      setEndDateObj(dateObj);
    } else {
      setEndDateObj(null);
    }
  }, []);

  // Calculate min and max dates for inputs
  const { minStartDate, maxStartDate, minEndDate, maxEndDate } = useMemo(() => {
    const today = new Date();
    const todayStr = energyUsageService.formatDateForInput(today);
    
    return {
      minStartDate: null, // No minimum restriction
      maxStartDate: endDate || todayStr, // Can't be after end date or today
      minEndDate: startDate, // Can't be before start date
      maxEndDate: todayStr // Can't be in the future
    };
  }, [startDate, endDate]);

  // Validate date range
  const dateValidation = useMemo(() => {
    if (startDateObj && endDateObj) {
      return energyUsageService.validateDateRange(startDateObj, endDateObj);
    }
    return { isValid: true, error: null };
  }, [startDateObj, endDateObj]);

  // Generate energy report
  const generateReport = useCallback(async () => {
    if (!selectedBuilding) {
      setError('Please select a building');
      return;
    }

    if (!dateValidation.isValid) {
      setError(dateValidation.error);
      return;
    }

    if (!startDateObj || !endDateObj) {
      setError('Please select both start and end dates');
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      
      console.log(`📊 Generating report for ${selectedBuilding} from ${startDate} to ${endDate}`);

      // Create date range object for report
      const dateRange = {
        startDate: startDateObj,
        endDate: endDateObj,
        periodText: `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`,
        formatted: `${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}`
      };

      let buildingName = '';
      let deviceIds = [];
      let energyData = [];
      let reportSummary = {};

      if (selectedBuilding === 'SYSTEM_OVERVIEW' && isUserSystemAdmin) {
        // System-wide report
        buildingName = 'System Overview';
        
        // Get all devices in system
        const allDevices = await dataService.getAllDevices();
        deviceIds = allDevices.map(device => device.id);
        
        // Get aggregated energy data
        if (deviceIds.length > 0) {
          energyData = await energyUsageService.getBuildingEnergyUsage('system', deviceIds, startDateObj, endDateObj);
          reportSummary = await energyUsageService.getBuildingEnergyUsageSummary('system', startDateObj, endDateObj);
        }
        
        // Add system stats
        reportSummary = {
          ...reportSummary,
          ...systemStats
        };

      } else {
        // Single building report
        const building = userBuildings.find(b => b.id === selectedBuilding);
        buildingName = building?.buildingName || building?.BuildingName || selectedBuilding;
        
        // Get building devices
        deviceIds = await energyUsageService.getBuildingDeviceIds(selectedBuilding);
        
        if (deviceIds.length > 0) {
          energyData = await energyUsageService.getBuildingEnergyUsage(selectedBuilding, deviceIds, startDateObj, endDateObj);
          reportSummary = await energyUsageService.getBuildingEnergyUsageSummary(selectedBuilding, startDateObj, endDateObj);
        }
      }

      // If no data found, return early with error
      if (energyData.length === 0) {
        setError('No energy data found for the selected building and date range');
        setGenerating(false);
        return;
      }

      // Calculate cost breakdown
      const costBreakdown = calculateEnergyCost(reportSummary.totalUsage);
      reportSummary.totalCost = costBreakdown.totalCost;
      reportSummary.averageRate = costBreakdown.averageRate;

      // Get devices for analysis
      let devicesForAnalysis = [];
      if (selectedBuilding === 'SYSTEM_OVERVIEW' && isUserSystemAdmin) {
        devicesForAnalysis = await dataService.getAllDevices();
      } else {
        // Get user devices and locations from dataService
        const { devices } = await dataService.getUserDevicesAndLocations(userEmail);
        devicesForAnalysis = devices.filter(device => {
          // Find device location and check if it belongs to selected building
          return device.Location && device.Location.includes(selectedBuilding);
        });
      }

      // Add energy usage to devices for analysis (distribute total usage)
      devicesForAnalysis = devicesForAnalysis.map(device => ({
        ...device,
        energyUsage: Math.random() * (reportSummary.totalUsage / Math.max(devicesForAnalysis.length, 1))
      }));

      // Analyze device types
      const deviceAnalysis = analyzeDeviceTypes(devicesForAnalysis);

      // Calculate carbon footprint
      const carbonFootprint = calculateCarbonFootprint(reportSummary.totalUsage);

      // Calculate savings potential
      const savingsPotential = calculateSavingsPotential({
        summary: reportSummary,
        deviceAnalysis
      });

      // Format energy data for charts
      const totalDays = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;
      const chartData = energyData.map(item => ({
        name: energyUsageService.formatDateForDisplay(item.date, totalDays),
        usage: Number(item.usage.toFixed(6)),
        date: item.date
      }));

      // Generate recommendations
      const recommendations = generateRecommendations({
        summary: reportSummary,
        deviceAnalysis,
        carbonFootprint
      });

      const completeReportData = {
        summary: reportSummary,
        energyData: chartData,
        costBreakdown,
        deviceAnalysis,
        carbonFootprint,
        savingsPotential,
        recommendations,
        dateRange,
        buildingId: selectedBuilding
      };

      setReportData(completeReportData);
      console.log('✅ Report generated successfully');

    } catch (err) {
      console.error('❌ Error generating report:', err);
      setError('Failed to generate report: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }, [selectedBuilding, startDateObj, endDateObj, dateValidation, isUserSystemAdmin, userBuildings, systemStats, userEmail, startDate, endDate]);

  // Download PDF report
  const downloadPDF = useCallback(async () => {
    if (!reportData) {
      setError('No report data available for PDF generation');
      return;
    }

    try {
      setDownloadingPDF(true);
      setError(null);

      const building = userBuildings.find(b => b.id === selectedBuilding);
      const buildingName = building?.buildingName || building?.BuildingName || selectedBuilding;

      await generateEnergyReportPDF(reportData, buildingName, 'custom', isUserSystemAdmin);
      
      console.log('✅ PDF downloaded successfully');

    } catch (err) {
      console.error('❌ Error downloading PDF:', err);
      setError('Failed to download PDF: ' + err.message);
    } finally {
      setDownloadingPDF(false);
    }
  }, [reportData, selectedBuilding, isUserSystemAdmin, userBuildings]);

  // Refresh data
  const handleRefresh = useCallback(() => {
    if (isUserSystemAdmin) {
      loadSystemAdminData();
    } else {
      loadUserBuildings();
    }
  }, [isUserSystemAdmin]);

  // Loading state
  if (loading) {
    return (
      <div className="reports-page">
        <div className="loading">Loading reports...</div>
      </div>
    );
  }

  // No buildings available
  if (userBuildings.length === 0) {
    return (
      <div className="reports-page">
        <div className="reports-header">
          <h2>
            <MdAssessment /> Energy Reports
          </h2>
        </div>
        
        <div className="no-report-state">
          <h3>No Buildings Available</h3>
          <p>
            {isUserSystemAdmin 
              ? "No buildings exist in the system yet."
              : "You don't have access to any buildings. Contact an administrator to get access."
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      {/* Reports Header */}
      <div className="reports-header">
        <h2>
          <MdAssessment /> Energy Reports
          {isUserSystemAdmin && (
            <span className="admin-badge">ADMIN</span>
          )}
        </h2>
        
        <div className="header-actions">
          <button 
            onClick={handleRefresh}
            className="retry-btn"
            title="Refresh data"
          >
            <MdRefresh />
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="retry-btn">
            Dismiss
          </button>
        </div>
      )}

      {/* Report Controls */}
      <div className="report-controls">
        <div className="controls-row">
          <div className="control-group">
            <label htmlFor="building-select">
              {isUserSystemAdmin ? 'Building/System' : 'Building'}
            </label>
            <select
              id="building-select"
              className="control-select"
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
            >
              <option value="">
                {isUserSystemAdmin ? 'Select building or system overview' : 'Select a building'}
              </option>
              {userBuildings.map(building => (
                <option key={building.id} value={building.id}>
                  {building.buildingName || building.BuildingName || building.id}
                  {building.id === 'SYSTEM_OVERVIEW' && ' (All Buildings)'}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="start-date-select">
              <MdCalendarToday /> From Date
            </label>
            <input
              id="start-date-select"
              type="date"
              className="control-select"
              value={startDate}
              onChange={handleStartDateChange}
              min={minStartDate}
              max={maxStartDate}
            />
          </div>

          <div className="control-group">
            <label htmlFor="end-date-select">
              <MdCalendarToday /> To Date
            </label>
            <input
              id="end-date-select"
              type="date"
              className="control-select"
              value={endDate}
              onChange={handleEndDateChange}
              min={minEndDate}
              max={maxEndDate}
            />
          </div>

          <button
            className="generate-btn"
            onClick={generateReport}
            disabled={generating || !selectedBuilding || !dateValidation.isValid}
          >
            <MdBarChart />
            {generating ? 'Generating...' : 'Generate Report'}
          </button>

          {reportData && (
            <button
              className="download-pdf-btn"
              onClick={downloadPDF}
              disabled={downloadingPDF}
            >
              <MdDownload />
              {downloadingPDF ? 'Downloading...' : 'Download PDF'}
            </button>
          )}
        </div>

        {/* Date validation error */}
        {!dateValidation.isValid && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            borderRadius: '6px',
            fontSize: '14px',
            border: '1px solid #fecaca'
          }}>
            {dateValidation.error}
          </div>
        )}
      </div>

      {/* Report Display */}
      {reportData ? (
        <EnergyReport
          reportData={reportData}
          buildingName={
            userBuildings.find(b => b.id === selectedBuilding)?.buildingName || 
            userBuildings.find(b => b.id === selectedBuilding)?.BuildingName || 
            selectedBuilding
          }
          isSystemAdmin={isUserSystemAdmin}
        />
      ) : (
        <div className="no-report-state">
          <h3>Ready to Generate Report</h3>
          <p>
            Select a {isUserSystemAdmin ? 'building or system overview' : 'building'} and date range, 
            then click "Generate Report" to view detailed energy analysis.
          </p>
        </div>
      )}
    </div>
  );
};

export default Reports;