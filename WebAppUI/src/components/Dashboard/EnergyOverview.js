// src/components/dashboard/EnergyOverview.js - Simple Dashboard Energy Overview

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { MdBolt, MdTrendingUp, MdDevices, MdRefresh } from 'react-icons/md';
import energyUsageService from '../../services/energyUsageService';

const EnergyOverview = ({ 
  buildingId = null, 
  deviceIds = null,
  className = "",
  height = 200 
}) => {
  const [energyData, setEnergyData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch last 7 days of energy data
  const fetchEnergyOverview = async () => {
    try {
      setLoading(true);
      
      let data = [];
      let summaryData = null;

      if (buildingId) {
        // Building energy data
        const buildingDeviceIds = await energyUsageService.getBuildingDeviceIds(buildingId);
        if (buildingDeviceIds.length > 0) {
          data = await energyUsageService.getBuildingEnergyUsage(buildingId, buildingDeviceIds, 'week');
          summaryData = await energyUsageService.getBuildingEnergyUsageSummary(buildingId, 'week');
        }
      } else if (deviceIds && Array.isArray(deviceIds) && deviceIds.length > 0) {
        // Custom device list
        data = await energyUsageService.getBuildingEnergyUsage('custom', deviceIds, 'week');
        
        if (data.length > 0) {
          const totalUsage = data.reduce((sum, item) => sum + item.usage, 0);
          const daysWithData = data.filter(item => item.usage > 0).length;
          const peakUsage = Math.max(...data.map(item => item.usage));
          
          summaryData = {
            totalUsage: Number(totalUsage.toFixed(6)),
            peakUsage: Number(peakUsage.toFixed(6)),
            activeDevices: deviceIds.length,
            daysWithData: daysWithData
          };
        }
      } else {
        // Fallback - use sample data for demo
        console.log('📊 Using sample data for energy overview');
        data = energyUsageService.getSampleEnergyData('week');
        
        const totalUsage = data.reduce((sum, item) => sum + item.usage, 0);
        summaryData = {
          totalUsage: Number(totalUsage.toFixed(6)),
          peakUsage: Math.max(...data.map(item => item.usage)),
          activeDevices: 3,
          daysWithData: 7
        };
      }

      // Format data for simple chart (last 7 days)
      const chartData = data.slice(-7).map(item => ({
        day: item.date.toLocaleDateString('en-US', { weekday: 'short' }),
        usage: Number(item.usage.toFixed(6)),
        fullDate: item.date.toLocaleDateString()
      }));

      setEnergyData(chartData);
      setSummary(summaryData);
      
    } catch (error) {
      console.error('Error fetching energy overview:', error);
      
      // Fallback to sample data
      const sampleData = energyUsageService.getSampleEnergyData('week');
      const chartData = sampleData.slice(-7).map(item => ({
        day: item.date.toLocaleDateString('en-US', { weekday: 'short' }),
        usage: Number(item.usage.toFixed(6)),
        fullDate: item.date.toLocaleDateString()
      }));
      
      setEnergyData(chartData);
      setSummary({
        totalUsage: Number(chartData.reduce((sum, item) => sum + item.usage, 0).toFixed(6)),
        peakUsage: Math.max(...chartData.map(item => item.usage)),
        activeDevices: 3,
        daysWithData: 7
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnergyOverview();
  }, [buildingId, deviceIds]);

  // Format usage value for display
  const formatUsageValue = (value) => {
    if (value === 0) return '0';
    if (value < 0.001) return `${(value * 1000).toFixed(1)}W`;
    if (value < 1) return `${(value * 1000).toFixed(0)}Wh`;
    return `${value.toFixed(3)} kWh`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#ffffff',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '0.875rem',
          border: 'none'
        }}>
          <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>{data.fullDate}</p>
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              background: '#22c55e',
              borderRadius: '50%',
              display: 'inline-block'
            }}></span>
            Energy: {formatUsageValue(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`energy-overview-card ${className}`} style={{
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      border: '1px solid #e2e8f0'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.25rem',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '1rem',
          fontWeight: '600',
          color: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <MdBolt style={{ color: '#22c55e', fontSize: '1.1rem' }} />
          Energy Overview
        </h3>
        
        <button
          onClick={fetchEnergyOverview}
          disabled={loading}
          style={{
            padding: '0.4rem',
            border: 'none',
            background: '#ffffff',
            color: '#64748b',
            cursor: loading ? 'not-allowed' : 'pointer',
            borderRadius: '6px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            opacity: loading ? 0.6 : 1,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.target.style.background = '#f8fafc';
              e.target.style.color = '#22c55e';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.target.style.background = '#ffffff';
              e.target.style.color = '#64748b';
            }
          }}
        >
          <MdRefresh style={{
            fontSize: '1rem',
            animation: loading ? 'spin 1s linear infinite' : 'none'
          }} />
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          color: '#64748b',
          fontSize: '0.875rem'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid #e2e8f0',
            borderTop: '2px solid #22c55e',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginRight: '0.5rem'
          }}></div>
          Loading...
        </div>
      )}

      {/* Chart */}
      {!loading && energyData.length > 0 && (
        <div style={{ padding: '0.75rem', paddingBottom: '0' }}>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={energyData}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <XAxis 
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="usage" 
                fill="#22c55e"
                radius={[3, 3, 0, 0]}
                opacity={0.8}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Stats */}
      {!loading && summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          padding: '1rem 1.25rem',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '0.75rem',
              color: '#64748b',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
              marginBottom: '0.25rem'
            }}>
              Total (7d)
            </div>
            <div style={{
              fontSize: '0.95rem',
              fontWeight: '700',
              color: '#1e293b'
            }}>
              {formatUsageValue(summary.totalUsage)}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '0.75rem',
              color: '#64748b',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
              marginBottom: '0.25rem'
            }}>
              Peak Day
            </div>
            <div style={{
              fontSize: '0.95rem',
              fontWeight: '700',
              color: '#1e293b'
            }}>
              {formatUsageValue(summary.peakUsage)}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '0.75rem',
              color: '#64748b',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
              marginBottom: '0.25rem'
            }}>
              Active
            </div>
            <div style={{
              fontSize: '0.95rem',
              fontWeight: '700',
              color: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem'
            }}>
              <MdDevices style={{ fontSize: '0.875rem', color: '#22c55e' }} />
              {summary.activeDevices || 0}
            </div>
          </div>
        </div>
      )}

      {/* No Data State */}
      {!loading && energyData.length === 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          color: '#64748b'
        }}>
          <MdTrendingUp style={{
            fontSize: '2rem',
            color: '#cbd5e1',
            marginBottom: '0.5rem'
          }} />
          <p style={{
            margin: '0 0 0.25rem 0',
            fontSize: '0.875rem',
            fontWeight: '600'
          }}>
            No energy data available
          </p>
          <span style={{
            fontSize: '0.8125rem',
            color: '#9ca3af'
          }}>
            Energy usage will appear here once devices start reporting
          </span>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default EnergyOverview;