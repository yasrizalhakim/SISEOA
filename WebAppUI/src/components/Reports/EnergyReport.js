// src/components/Reports/EnergyReport.js - Updated Energy Report Display Component with Methodology

import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  formatEnergyValue, 
  formatCurrency, 
  formatPercentage,
  calculateEfficiencyRating,
  MALAYSIA_ENERGY_RATES,
  MALAYSIA_CARBON_FACTOR
} from './reportUtils';

const EnergyReport = ({ reportData, buildingName, isSystemAdmin }) => {
  const [showMethodology, setShowMethodology] = useState(false);

  if (!reportData) {
    return (
      <div className="no-report-state">
        <h3>No Report Data Available</h3>
        <p>Generate a report to view energy analysis and insights.</p>
      </div>
    );
  }

  const { 
    summary, 
    energyData, 
    costBreakdown, 
    deviceAnalysis, 
    carbonFootprint, 
    recommendations,
    dateRange,
    savingsPotential
  } = reportData;

  // Colors for pie chart
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#ffffff',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '0.875rem',
          border: 'none'
        }}>
          <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>{label}</p>
          <p style={{ margin: 0 }}>
            {payload[0].name}: {formatEnergyValue(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Efficiency rating - updated to use total days from date range
  const totalDays = dateRange.totalDays || summary.totalDays || energyData.length;
  const efficiencyRating = calculateEfficiencyRating(
    summary.totalUsage, 
    summary.totalDevices || deviceAnalysis.totalDevices, 
    totalDays
  );

  return (
    <div className="report-content" id="energy-report">
      {/* Report Header */}
      <div className="report-header">
        <h1 className="report-title">
          {isSystemAdmin ? 'System Energy Report' : 'Building Energy Report'}
        </h1>
        <h2 className="report-subtitle">{buildingName}</h2>
        <p className="report-period">{dateRange.periodText}</p>
      </div>

      <div className="report-body">
        {/* Executive Summary */}
        <div className="summary-section">
          <h3>📊 Executive Summary</h3>
          
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">
                {formatEnergyValue(summary.totalUsage)}
              </div>
              <p className="summary-label">Total Energy Consumption</p>
            </div>
            
            <div className="summary-card">
              <div className="summary-value">
                {formatCurrency(summary.totalCost)}
              </div>
              <p className="summary-label">Total Energy Cost</p>
            </div>
            
            <div className="summary-card">
              <div className="summary-value">
                {formatCurrency(summary.averageRate)}
                <span className="summary-unit">/kWh</span>
              </div>
              <p className="summary-label">Average Rate</p>
            </div>
            
            <div className="summary-card">
              <div className="summary-value">
                {summary.activeDevices || 0}
              </div>
              <p className="summary-label">Active Devices</p>
            </div>

            {isSystemAdmin && (
              <div className="summary-card">
                <div className="summary-value">
                  {summary.totalUsers || 0}
                </div>
                <p className="summary-label">System Users</p>
              </div>
            )}
          </div>
        </div>

        {/* Energy Consumption Charts */}
        <div className="charts-section">
          <h3>📈 Energy Consumption Analysis</h3>
          
          <div className="charts-grid">
            {/* Time-series chart */}
            <div className="chart-container">
              <h4 className="chart-title">Energy Usage Over Time</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={energyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    angle={energyData.length > 7 ? -45 : 0}
                    textAnchor={energyData.length > 7 ? 'end' : 'middle'}
                    height={energyData.length > 7 ? 60 : 30}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="usage" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Device type breakdown */}
            <div className="chart-container">
              <h4 className="chart-title">Energy by Device Type</h4>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={deviceAnalysis.chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${formatPercentage(percentage)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {deviceAnalysis.chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => [formatEnergyValue(value), 'Energy Usage']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="cost-section">
          <h3>💰 Cost Breakdown (Malaysia TNB Tariff)</h3>
          
          <table className="cost-table">
            <thead>
              <tr>
                <th>Usage Tier</th>
                <th>Consumption</th>
                <th>Rate (RM/kWh)</th>
                <th>Cost (RM)</th>
              </tr>
            </thead>
            <tbody>
              {costBreakdown.breakdown.map((tier, index) => (
                <tr key={index}>
                  <td>{tier.tier}</td>
                  <td>{formatEnergyValue(tier.usage)}</td>
                  <td>{formatCurrency(tier.rate)}</td>
                  <td className="cost-amount">{formatCurrency(tier.cost)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td><strong>Total</strong></td>
                <td><strong>{formatEnergyValue(costBreakdown.totalKwh)}</strong></td>
                <td><strong>{formatCurrency(costBreakdown.averageRate)}</strong></td>
                <td className="cost-amount"><strong>{formatCurrency(costBreakdown.totalCost)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Device Analysis */}
        <div className="device-analysis">
          <h3>🔌 Top Energy Consuming Devices</h3>
          
          <table className="device-table">
            <thead>
              <tr>
                <th>Device Name</th>
                <th>Type</th>
                <th>Energy Usage</th>
                <th>Cost</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {deviceAnalysis.deviceDetails.slice(0, 10).map((device, index) => (
                <tr key={index}>
                  <td>{device.name}</td>
                  <td>{device.type}</td>
                  <td>{formatEnergyValue(device.usage)}</td>
                  <td className="cost-amount">{formatCurrency(device.cost)}</td>
                  <td>{formatPercentage(device.percentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Environmental Impact */}
        <div className="environmental-section">
          <h3>🌱 Environmental Impact</h3>
          
          <div className="environmental-grid">
            <div className="environmental-card">
              <div className="summary-value">
                {carbonFootprint.carbonEmission}
                <span className="summary-unit">kg</span>
              </div>
              <p className="summary-label">CO₂ Emissions</p>
            </div>
            
            <div className="environmental-card">
              <div className="summary-value">
                {carbonFootprint.treesEquivalent}
              </div>
              <p className="summary-label">Trees Needed (1 year)</p>
            </div>
            
            <div className="environmental-card">
              <div className="summary-value">
                {carbonFootprint.carMilesEquivalent.toFixed(0)}
                <span className="summary-unit">miles</span>
              </div>
              <p className="summary-label">Car Miles Equivalent</p>
            </div>
          </div>
        </div>

        {/* Energy Efficiency Assessment */}
        <div className="efficiency-section">
          <h3>⚡ Energy Efficiency Assessment</h3>
          
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">
                {efficiencyRating.score}/100
              </div>
              <p className="summary-label">Efficiency Score</p>
            </div>
            
            <div className="summary-card">
              <div className="summary-value">
                {formatEnergyValue(efficiencyRating.usagePerDevicePerDay)}
              </div>
              <p className="summary-label">Usage per Device/Day</p>
            </div>

            <div className="summary-card">
              <div className="summary-value">
                {totalDays}
              </div>
              <p className="summary-label">Days Analyzed</p>
            </div>
          </div>
          
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: '#f0f9ff',
            borderRadius: '6px',
            border: '1px solid #bae6fd'
          }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#0369a1' }}>
              <strong>Efficiency Rating:</strong> {efficiencyRating.rating} - {efficiencyRating.description}
            </p>
          </div>
        </div>

        {/* Report Methodology Section */}
        <div className="methodology-section" style={{
          marginTop: '2rem',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <div 
            style={{
              backgroundColor: '#f8fafc',
              padding: '1rem',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: showMethodology ? '1px solid #e2e8f0' : 'none'
            }}
            onClick={() => setShowMethodology(!showMethodology)}
          >
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#1e293b' }}>
              📋 Report Methodology & Calculations
            </h3>
            <span style={{ fontSize: '1.2rem', color: '#64748b' }}>
              {showMethodology ? '−' : '+'}
            </span>
          </div>
          
          {showMethodology && (
            <div style={{ padding: '1.5rem', backgroundColor: 'white' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600', color: '#374151' }}>
                  🌱 Carbon Footprint Calculations
                </h4>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.5' }}>
                  Carbon emissions are calculated using Malaysia's electricity grid emission factor:
                </p>
                <ul style={{ margin: '0 0 0 1rem', fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.4' }}>
                  <li><strong>CO₂ Emissions:</strong> Energy Usage (kWh) × {MALAYSIA_CARBON_FACTOR} kg CO₂/kWh</li>
                  <li><strong>Trees Equivalent:</strong> CO₂ Emissions ÷ 22 kg (average CO₂ absorbed by one tree per year)</li>
                  <li><strong>Car Miles Equivalent:</strong> CO₂ Emissions ÷ 0.411 kg/mile (average car emissions)</li>
                </ul>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600', color: '#374151' }}>
                  ⚡ Energy Efficiency Assessment
                </h4>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.5' }}>
                  Efficiency rating is based on energy usage per device per day:
                </p>
                <ul style={{ margin: '0 0 0 1rem', fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.4' }}>
                  <li><strong>Formula:</strong> Total Usage (kWh) ÷ (Number of Devices × Days in Period)</li>
                  <li><strong>Excellent:</strong> &lt; 0.5 kWh per device per day</li>
                  <li><strong>Good:</strong> 0.5 - 1.0 kWh per device per day</li>
                  <li><strong>Average:</strong> 1.0 - 2.0 kWh per device per day</li>
                  <li><strong>Below Average:</strong> 2.0 - 3.0 kWh per device per day</li>
                  <li><strong>Poor:</strong> &gt; 3.0 kWh per device per day</li>
                </ul>
              </div>
              <div style={{ marginBottom: '0' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600', color: '#374151' }}>
                  📊 Data Sources & Accuracy
                </h4>
                <ul style={{ margin: '0 0 0 1rem', fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.4' }}>
                  <li>Energy usage data collected from IoT central hub</li>
                  <li>Tariff rates updated according to TNB Malaysia official rates</li>
                  <li>Carbon emission factors based on Malaysia's Energy Commission data</li>
                  <li>All calculations rounded for display but use full precision internally</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Report Footer */}
        <div className="report-footer">
          <p style={{ 
            textAlign: 'center', 
            fontSize: '0.75rem', 
            color: '#64748b', 
            marginTop: '2rem',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '1rem'
          }}>
            Report generated on {new Date().toLocaleDateString()} by SISEAO Energy Management System
            <br />
            Energy rates based on TNB Malaysia tariff structure.
            <br />
            Report period: {dateRange.formatted} ({totalDays} day{totalDays !== 1 ? 's' : ''})
          </p>
        </div>
      </div>
    </div>
  );
};

export default EnergyReport;