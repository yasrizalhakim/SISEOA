// src/components/common/EnergyChart.js - Fixed Energy Usage Chart Component

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { MdRefresh, MdInfo, MdBolt, MdTrendingUp } from 'react-icons/md';
import energyUsageService from '../../services/energyUsageService';
import './EnergyChart.css';

const EnergyChart = ({ 
  deviceId = null, 
  buildingId = null, 
  deviceIds = null,
  title = "Energy Consumption",
  showControls = true,
  defaultFilter = 'day',
  height = 300 
}) => {
  const [activeView, setActiveView] = useState(defaultFilter);
  // Removed chartType state - using only bar charts now
  const [energyData, setEnergyData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  // Fetch energy data
  const fetchEnergyData = async () => {
    if (!deviceId && !buildingId && !deviceIds) {
      console.log('❌ No device or building ID provided');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let data = [];
      let summaryData = null;

      if (deviceId) {
        // Single device data
        console.log(`📊 Fetching energy data for device: ${deviceId}`);
        data = await energyUsageService.getDeviceEnergyUsage(deviceId, activeView);
        summaryData = await energyUsageService.getDeviceEnergyUsageSummary(deviceId, activeView);
      } else if (buildingId) {
        // Building aggregated data
        console.log(`🏢 Fetching energy data for building: ${buildingId}`);
        const buildingDeviceIds = await energyUsageService.getBuildingDeviceIds(buildingId);
        
        if (buildingDeviceIds.length === 0) {
          console.log('🏢 No devices found in building');
          setEnergyData([]);
          setSummary({
            totalUsage: 0,
            averageUsage: 0,
            peakUsage: 0,
            daysWithData: 0,
            totalDays: 0,
            deviceCount: 0,
            activeDevices: 0
          });
          setLoading(false);
          return;
        }
        
        data = await energyUsageService.getBuildingEnergyUsage(buildingId, buildingDeviceIds, activeView);
        summaryData = await energyUsageService.getBuildingEnergyUsageSummary(buildingId, activeView);
      } else if (deviceIds && Array.isArray(deviceIds)) {
        // Custom device list data (aggregated)
        console.log(`📱 Fetching energy data for ${deviceIds.length} devices`);
        
        if (deviceIds.length === 0) {
          console.log('📱 No devices provided in list');
          setEnergyData([]);
          setSummary({
            totalUsage: 0,
            averageUsage: 0,
            peakUsage: 0,
            daysWithData: 0,
            totalDays: 0,
            deviceCount: 0
          });
          setLoading(false);
          return;
        }
        
        data = await energyUsageService.getBuildingEnergyUsage('custom', deviceIds, activeView);
        
        // Calculate summary for custom device list
        if (data.length > 0) {
          const totalUsage = data.reduce((sum, item) => sum + item.usage, 0);
          const daysWithData = data.filter(item => item.usage > 0).length;
          const peakUsage = Math.max(...data.map(item => item.usage));
          const averageUsage = daysWithData > 0 ? totalUsage / daysWithData : 0;
          
          summaryData = {
            totalUsage: Number(totalUsage.toFixed(6)),
            averageUsage: Number(averageUsage.toFixed(6)),
            peakUsage: Number(peakUsage.toFixed(6)),
            daysWithData: daysWithData,
            totalDays: data.length,
            deviceCount: deviceIds.length
          };
        }
      }

      // Format data for chart with proper date display
      const chartData = data.map(item => {
        let displayDate;
        switch (activeView) {
          case 'week':
            displayDate = item.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            break;
          case 'month':
            displayDate = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            break;
          case 'day':
          default:
            displayDate = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            break;
        }
        
        return {
          name: displayDate,
          usage: Number(item.usage.toFixed(6)), // Increased precision for small values
          usageDisplay: Number(item.usage.toFixed(6)), // For display
          date: item.date,
          fullDate: item.date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          }),
          devicesWithData: item.devicesWithData || null,
          totalDevices: item.totalDevices || null
        };
      });

      setEnergyData(chartData);
      setSummary(summaryData);
      setLastUpdateTime(new Date());

      console.log(`📊 Energy chart data loaded: ${chartData.length} points`);
      console.log(`📊 Summary:`, summaryData);
      
      // Show detailed data in console for debugging
      if (chartData.length > 0) {
        console.log(`📊 Sample data points:`, chartData.slice(0, 3));
        console.log(`📊 Total usage in dataset: ${chartData.reduce((sum, item) => sum + item.usage, 0).toFixed(6)} kWh`);
      }
      
    } catch (error) {
      console.error('Error fetching energy data:', error);
      setError('Failed to load energy data. Using sample data for demonstration.');
      
      // Use sample data for demonstration with proper date formatting
      console.log('📊 Using sample data for demonstration');
      const sampleData = energyUsageService.getSampleEnergyData(activeView);
      const chartData = sampleData.map(item => {
        let displayDate;
        switch (activeView) {
          case 'week':
            displayDate = item.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            break;
          case 'month':
            displayDate = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            break;
          case 'day':
          default:
            displayDate = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            break;
        }
        
        return {
          name: displayDate,
          usage: Number(item.usage.toFixed(6)),
          usageDisplay: Number(item.usage.toFixed(6)),
          date: item.date,
          fullDate: item.date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })
        };
      });
      
      setEnergyData(chartData);
      
      // Sample summary
      const totalUsage = chartData.reduce((sum, item) => sum + item.usage, 0);
      const averageUsage = chartData.length > 0 ? totalUsage / chartData.length : 0;
      const peakUsage = Math.max(...chartData.map(item => item.usage));
      
      setSummary({
        totalUsage: Number(totalUsage.toFixed(6)),
        averageUsage: Number(averageUsage.toFixed(6)),
        peakUsage: Number(peakUsage.toFixed(6)),
        daysWithData: chartData.length,
        totalDays: chartData.length,
        deviceCount: deviceIds ? deviceIds.length : 1
      });
    } finally {
      setLoading(false);
    }
  };

  // Load data when component mounts or filter changes
  useEffect(() => {
    fetchEnergyData();
  }, [deviceId, buildingId, deviceIds, activeView]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="energy-tooltip">
          <p className="tooltip-label">{data.fullDate}</p>
          <p className="tooltip-value">
            <span className="tooltip-indicator" />
            {`Energy: ${payload[0].value} kWh`}
          </p>
          {data.devicesWithData !== null && (
            <p className="tooltip-devices">
              {`Active: ${data.devicesWithData}/${data.totalDevices} devices`}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Format usage value for display
  const formatUsageValue = (value) => {
    if (value === 0) return '0';
    if (value < 0.001) return `${(value * 1000).toFixed(2)}W`; // Show in watts for very small values
    if (value < 1) return `${(value * 1000).toFixed(0)}Wh`; // Show in watt-hours
    return `${value.toFixed(3)} kWh`; // Show in kilowatt-hours
  };

  // Get chart color based on data source
  const getChartColor = () => {
    if (deviceId) return '#22c55e'; // Green for single device
    if (buildingId) return '#3b82f6'; // Blue for building
    return '#8b5cf6'; // Purple for custom device list
  };

  // Get Y-axis domain for better visualization of small values
  const getYAxisDomain = () => {
    if (energyData.length === 0) return [0, 1];
    
    const maxUsage = Math.max(...energyData.map(item => item.usage));
    const minUsage = Math.min(...energyData.map(item => item.usage));
    
    // If all values are very small, adjust the scale
    if (maxUsage < 0.001) {
      return [0, maxUsage * 1.1];
    }
    
    return [0, maxUsage * 1.1];
  };

  // Render bar chart only
  const renderChart = () => {
    const commonProps = {
      data: energyData,
      margin: { top: 20, right: 30, left: 20, bottom: 5 }
    };

    const xAxisProps = {
      dataKey: "name",
      stroke: "#64748b",
      fontSize: 12,
      tick: { fill: '#64748b' },
      angle: activeView === 'month' ? -45 : 0,
      textAnchor: activeView === 'month' ? 'end' : 'middle',
      height: activeView === 'month' ? 60 : 30
    };

    const yAxisProps = {
      stroke: "#64748b",
      fontSize: 12,
      tick: { fill: '#64748b' },
      label: { 
        value: 'Energy (kWh)', 
        angle: -90, 
        position: 'insideLeft', 
        style: { textAnchor: 'middle' } 
      },
      domain: getYAxisDomain(),
      tickFormatter: (value) => {
        if (value < 0.001 && value > 0) return `${(value * 1000).toFixed(1)}W`;
        if (value < 1 && value > 0) return `${(value * 1000).toFixed(0)}Wh`;
        return `${value.toFixed(3)}`;
      }
    };

    return (
      <BarChart {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar 
          dataKey="usage" 
          fill={getChartColor()}
          name="Energy (kWh)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    );
  };

  return (
    <div className="energy-chart-container">
      {/* Header with controls */}
      <div className="chart-header">
        <h3 className="chart-title">
          <MdBolt className="chart-icon" />
          {title}
        </h3>
        <div className="chart-controls">
          {showControls && (
            <>
              <div className="view-controls">
                <button 
                  className={`control-btn ${activeView === 'day' ? 'active' : ''}`}
                  onClick={() => setActiveView('day')}
                >
                  Day
                </button>
                <button 
                  className={`control-btn ${activeView === 'week' ? 'active' : ''}`}
                  onClick={() => setActiveView('week')}
                >
                  Week
                </button>
                <button 
                  className={`control-btn ${activeView === 'month' ? 'active' : ''}`}
                  onClick={() => setActiveView('month')}
                >
                  Month
                </button>
              </div>
              
              <button 
                className="refresh-btn"
                onClick={fetchEnergyData}
                disabled={loading}
                title="Refresh data"
              >
                <MdRefresh className={loading ? 'spinning' : ''} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info banner for devices */}
      {summary && summary.deviceCount > 1 && (
        <div className="chart-info-banner">
          <MdInfo className="info-icon" />
          <span>
            Showing aggregated data from {summary.deviceCount} devices
            {summary.activeDevices !== undefined && 
              ` (${summary.activeDevices} have reported usage)`
            }
          </span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <span>Loading energy data...</span>
        </div>
      )}

      {/* Chart area */}
      {!loading && (
        <div className="chart-area" style={{ height: height }}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary section */}
      {summary && !loading && (
        <div className="energy-summary">
          <div className="summary-item">
            <span className="summary-label">Total Usage</span>
            <span className="summary-value">{formatUsageValue(summary.totalUsage)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Average</span>
            <span className="summary-value">{formatUsageValue(summary.averageUsage)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Peak Usage</span>
            <span className="summary-value">{formatUsageValue(summary.peakUsage)}</span>
          </div>
          {summary.deviceCount && summary.deviceCount > 1 && (
            <div className="summary-item">
              <span className="summary-label">Devices</span>
              <span className="summary-value">
                {summary.activeDevices !== undefined 
                  ? `${summary.activeDevices}/${summary.deviceCount}` 
                  : summary.deviceCount
                }
              </span>
            </div>
          )}
          {summary.daysWithData !== undefined && (
            <div className="summary-item">
              <span className="summary-label">Data Coverage</span>
              <span className="summary-value">
                {summary.daysWithData}/{summary.totalDays} days
              </span>
            </div>
          )}
        </div>
      )}

      {/* Last update time */}
      {lastUpdateTime && !loading && (
        <div className="chart-footer">
          <span className="last-update">
            Last updated: {lastUpdateTime.toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* No data state */}
      {!loading && energyData.length === 0 && !error && (
        <div className="no-data-state">
          <MdTrendingUp className="no-data-icon" />
          <p>No energy usage data available</p>
          <span>
            {deviceId && "This device hasn't reported any energy usage yet."}
            {buildingId && "No devices in this building have reported energy usage yet."}
            {deviceIds && "None of the selected devices have reported energy usage yet."}
          </span>
          <span className="help-text">
            Energy data will appear here once devices start reporting usage.
          </span>
        </div>
      )}
    </div>
  );
};

export default EnergyChart;