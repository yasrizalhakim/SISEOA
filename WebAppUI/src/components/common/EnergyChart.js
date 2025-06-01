// src/components/common/EnergyChart.js - Energy Usage Chart Component

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MdRefresh } from 'react-icons/md';
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
  const [energyData, setEnergyData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
        data = await energyUsageService.getBuildingEnergyUsage(buildingId, buildingDeviceIds, activeView);
        summaryData = await energyUsageService.getBuildingEnergyUsageSummary(buildingId, activeView);
      } else if (deviceIds && Array.isArray(deviceIds)) {
        // Custom device list data (aggregated)
        console.log(`📱 Fetching energy data for ${deviceIds.length} devices`);
        data = await energyUsageService.getBuildingEnergyUsage('custom', deviceIds, activeView);
        
        // Calculate summary for custom device list
        if (data.length > 0) {
          const totalUsage = data.reduce((sum, item) => sum + item.usage, 0);
          const daysWithData = data.filter(item => item.usage > 0).length;
          const peakUsage = Math.max(...data.map(item => item.usage));
          const averageUsage = daysWithData > 0 ? totalUsage / daysWithData : 0;
          
          summaryData = {
            totalUsage: Number(totalUsage.toFixed(2)),
            averageUsage: Number(averageUsage.toFixed(2)),
            peakUsage: Number(peakUsage.toFixed(2)),
            daysWithData: daysWithData,
            totalDays: data.length,
            deviceCount: deviceIds.length
          };
        }
      }

      // Format data for chart
      const chartData = data.map(item => ({
        name: energyUsageService.formatDateForDisplay(item.date, activeView),
        usage: Number(item.usage.toFixed(2)),
        date: item.date,
        fullDate: item.date.toLocaleDateString()
      }));

      setEnergyData(chartData);
      setSummary(summaryData);

      console.log(`📊 Energy chart data loaded: ${chartData.length} points`);
    } catch (error) {
      console.error('Error fetching energy data:', error);
      setError('Failed to load energy data');
      
      // Use sample data for demonstration
      console.log('📊 Using sample data for demonstration');
      const sampleData = energyUsageService.getSampleEnergyData(activeView);
      const chartData = sampleData.map(item => ({
        name: energyUsageService.formatDateForDisplay(item.date, activeView),
        usage: Number(item.usage.toFixed(2)),
        date: item.date,
        fullDate: item.date.toLocaleDateString()
      }));
      
      setEnergyData(chartData);
      
      // Sample summary
      const totalUsage = chartData.reduce((sum, item) => sum + item.usage, 0);
      const averageUsage = chartData.length > 0 ? totalUsage / chartData.length : 0;
      const peakUsage = Math.max(...chartData.map(item => item.usage));
      
      setSummary({
        totalUsage: Number(totalUsage.toFixed(2)),
        averageUsage: Number(averageUsage.toFixed(2)),
        peakUsage: Number(peakUsage.toFixed(2)),
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
        </div>
      );
    }
    return null;
  };

  // Get chart color based on data source
  const getChartColor = () => {
    if (deviceId) return '#22c55e'; // Green for single device
    if (buildingId) return '#3b82f6'; // Blue for building
    return '#8b5cf6'; // Purple for custom device list
  };

  return (
    <div className="energy-chart-container">
      {/* Header with controls */}
      <div className="chart-header">
        <h3 className="chart-title">{title}</h3>
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

      {/* Error message */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <span className="error-note">(Showing sample data)</span>
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
            <LineChart data={energyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                fontSize={12}
                tick={{ fill: '#64748b' }}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={12}
                tick={{ fill: '#64748b' }}
                label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="usage" 
                stroke={getChartColor()}
                strokeWidth={2} 
                dot={{ stroke: getChartColor(), strokeWidth: 2, r: 4, fill: '#fff' }}
                activeDot={{ r: 6, stroke: getChartColor(), strokeWidth: 2, fill: getChartColor() }} 
                name="Energy (kWh)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary section */}
      {summary && !loading && (
        <div className="energy-summary">
          <div className="summary-item">
            <span className="summary-label">Total Usage</span>
            <span className="summary-value">{summary.totalUsage} kWh</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Average</span>
            <span className="summary-value">{summary.averageUsage} kWh</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Peak Usage</span>
            <span className="summary-value">{summary.peakUsage} kWh</span>
          </div>
          {summary.deviceCount && summary.deviceCount > 1 && (
            <div className="summary-item">
              <span className="summary-label">Devices</span>
              <span className="summary-value">{summary.deviceCount}</span>
            </div>
          )}
        </div>
      )}

      {/* No data state */}
      {!loading && energyData.length === 0 && !error && (
        <div className="no-data-state">
          <p>No energy usage data available</p>
          <span>Energy data will appear here once devices start reporting usage.</span>
        </div>
      )}
    </div>
  );
};

export default EnergyChart;