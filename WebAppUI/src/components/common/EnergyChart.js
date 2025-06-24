// src/components/common/EnergyChart.js - Simplified with date range controls and bar chart only

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MdDateRange, MdBarChart, MdRefresh} from 'react-icons/md';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import energyUsageService from '../../services/energyUsageService';
import './EnergyChart.css';

const EnergyChart = ({ 
  deviceId = null, 
  deviceIds = null, 
  buildingId = null,
  title = 'Energy Usage', 
  showControls = true,
  height = 300
}) => {
  // State management
  const [energyData, setEnergyData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Date range controls - default to last 7 days
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6); // 7 days ago
    return energyUsageService.formatDateForInput(date);
  });
  
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    return energyUsageService.formatDateForInput(date);
  });
  
  // Determine chart mode
  const chartMode = useMemo(() => {
    if (deviceId) return 'device';
    if (deviceIds || buildingId) return 'building';
    return 'unknown';
  }, [deviceId, deviceIds, buildingId]);

  // Get formatted date range for title
  const dateRangeTitle = useMemo(() => {
    if (!startDate || !endDate) return title;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined
      });
    };
    
    return `${title} (${formatDate(start)} - ${formatDate(end)})`;
  }, [title, startDate, endDate]);

  // Calculate date range
  const getDateRange = useCallback(() => {
    const start = energyUsageService.parseDateFromInput(startDate);
    const end = energyUsageService.parseDateFromInput(endDate);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    return { startDate: start, endDate: end };
  }, [startDate, endDate]);

  // Fetch energy data
  const fetchEnergyData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { startDate: start, endDate: end } = getDateRange();
      
      let data = [];
      let summaryData = null;
      
      if (chartMode === 'device' && deviceId) {
        // Single device energy usage
        data = await energyUsageService.getDeviceEnergyUsage(deviceId, start, end);
        summaryData = await energyUsageService.getDeviceEnergyUsageSummary(deviceId, start, end);
      } else if (chartMode === 'building') {
        // Building energy usage (multiple devices)
        const buildingDeviceIds = deviceIds || 
          (buildingId ? await energyUsageService.getBuildingDeviceIds(buildingId) : []);
        
        if (buildingDeviceIds.length > 0) {
          data = await energyUsageService.getBuildingEnergyUsage(
            buildingId || 'multi-device', 
            buildingDeviceIds, 
            start, 
            end
          );
          summaryData = await energyUsageService.getBuildingEnergyUsageSummary(
            buildingId || 'multi-device', 
            start, 
            end
          );
        }
      }
      
      setEnergyData(data);
      setSummary(summaryData);
      
      
    } catch (error) {
      setError('Failed to load energy data');
    } finally {
      setLoading(false);
    }
  }, [chartMode, deviceId, deviceIds, buildingId, getDateRange]);

  // Handle date changes with validation
  const handleStartDateChange = useCallback((value) => {
    setStartDate(value);
    
    // If start date is after end date, adjust end date
    if (value && endDate && new Date(value) > new Date(endDate)) {
      setEndDate(value);
    }
  }, [endDate]);

  const handleEndDateChange = useCallback((value) => {
    setEndDate(value);
    
    // If end date is before start date, adjust start date
    if (value && startDate && new Date(value) < new Date(startDate)) {
      setStartDate(value);
    }
  }, [startDate]);


  // Refresh data
  const handleRefresh = useCallback(() => {
    fetchEnergyData();
  }, [fetchEnergyData]);

  // Format data for chart display
  const chartData = useMemo(() => {
    if (energyData.length === 0) return [];
    
    return energyData.map(item => ({
      date: item.dateStr || item.date.toISOString().split('T')[0],
      dateDisplay: energyUsageService.formatDateForDisplay(item.date, energyData.length),
      usage: Number((item.usage || 0).toFixed(2)),
      devices: item.devicesWithData || (item.usage > 0 ? 1 : 0)
    }));
  }, [energyData]);

  // Format usage value for display
  const formatUsageValue = (value) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)} kWh`;
    } else if (value >= 1) {
      return `${value.toFixed(2)} Wh`;
    } else {
      return `${(value * 1000).toFixed(2)} W`;
    }
  };

  // Initial load and date changes
  useEffect(() => {
    if (startDate && endDate) {
      fetchEnergyData();
    }
  }, [fetchEnergyData, startDate, endDate]);

  return (
    <div className="energy-chart">
      {showControls && (
        <ChartControls
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          onRefresh={handleRefresh}
          loading={loading}
          hasData={energyData.length > 0}
        />
      )}

      <div className="chart-wrapper">
        <div className="chart-container" style={{ height: `${height}px` }}>
          <ChartHeader title={dateRangeTitle} summary={summary} />
          
          {loading && (
            <div className="chart-loading">
              <div className="loading-spinner"></div>
              <span>Loading energy data...</span>
            </div>
          )}
          
          {error && (
            <div className="chart-error">
              <p>{error}</p>
              <button onClick={handleRefresh} className="retry-btn">
                <MdRefresh /> Retry
              </button>
            </div>
          )}
          
          {!loading && !error && chartData.length === 0 && (
            <div className="chart-no-data">
              <p>No energy data available for the selected period.</p>
              <span>Try selecting a different date range or check if devices are reporting usage.</span>
            </div>
          )}
          
          {!loading && !error && chartData.length > 0 && (
            <div className="chart-content">
              <EnergyBarChart data={chartData} formatUsageValue={formatUsageValue} />
            </div>
          )}
        </div>
        
        {summary && (
          <ChartSummary summary={summary} />
        )}
      </div>
    </div>
  );
};

// Simplified Chart Controls with date range inputs
const ChartControls = ({ 
  startDate, 
  endDate,
  onStartDateChange, 
  onEndDateChange,
  onRefresh, 
  onExport, 
  loading,
  hasData 
}) => (
  <div className="chart-controls">
    <div className="date-range-controls">
      <div className="date-input-group">
        <MdDateRange className="control-icon" />
        <div className="date-inputs">
          <div className="date-input-wrapper">
            <label htmlFor="start-date">Start Date</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              max={endDate} // Prevent selecting date after end date
              onChange={(e) => onStartDateChange(e.target.value)}
              className="date-input"
            />
          </div>
          <span className="date-separator">to</span>
          <div className="date-input-wrapper">
            <label htmlFor="end-date">End Date</label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              min={startDate} // Prevent selecting date before start date
              max={new Date().toISOString().split('T')[0]} // Prevent future dates
              onChange={(e) => onEndDateChange(e.target.value)}
              className="date-input"
            />
          </div>
        </div>
      </div>
    </div>
    
    <div className="action-controls">
      <button
        onClick={onRefresh}
        className="action-btn"
        disabled={loading}
        title="Refresh data"
      >
        <MdRefresh className={loading ? 'spinning' : ''} />
      </button>

    </div>
  </div>
);

// Chart Header with dynamic title
const ChartHeader = ({ title, summary }) => (
  <div className="chart-header">
    <h3 className="chart-title">
      <MdBarChart className="chart-icon" />
      {title}
    </h3>
  </div>
);

// Energy Bar Chart Component using Recharts
const EnergyBarChart = ({ data, formatUsageValue }) => {
  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          border: 'none',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>{data.dateDisplay}</p>
          <p style={{ margin: '4px 0 0 0', color: '#22c55e' }}>
            <span style={{ 
              display: 'inline-block', 
              width: '8px', 
              height: '8px', 
              backgroundColor: '#22c55e', 
              borderRadius: '50%', 
              marginRight: '6px' 
            }}></span>
            {formatUsageValue(data.usage)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart
        data={data}
        margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="dateDisplay"
          tick={{ fontSize: 12 }}
          angle={data.length > 7 ? -45 : 0}
          textAnchor={data.length > 7 ? 'end' : 'middle'}
          height={data.length > 7 ? 60 : 30}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar 
          dataKey="usage" 
          fill="#22c55e" 
          radius={[4, 4, 0, 0]}
        />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
};

// Chart Summary
const ChartSummary = ({ summary }) => (
  <div className="chart-summary">
    <div className="summary-grid">
      <div className="summary-item">
        <label>Total Usage</label>
        <span>{summary.totalUsage.toFixed(2)} kWh</span>
      </div>
      <div className="summary-item">
        <label>Average Usage</label>
        <span>{summary.averageUsage.toFixed(2)} kWh</span>
      </div>
      <div className="summary-item">
        <label>Peak Usage</label>
        <span>{summary.peakUsage.toFixed(2)} kWh</span>
      </div>
      {summary.deviceCount !== undefined && (
        <div className="summary-item">
          <label>Active Devices</label>
          <span>{summary.activeDevices} / {summary.deviceCount}</span>
        </div>
      )}
    </div>
  </div>
);

export default EnergyChart;