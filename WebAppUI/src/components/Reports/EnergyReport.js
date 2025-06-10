// src/components/Reports/EnergyReport.js - Energy Report Display Component

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  formatEnergyValue, 
  formatCurrency, 
  formatPercentage,
  calculateEfficiencyRating
} from './reportUtils';

const EnergyReport = ({ reportData, buildingName, period, isSystemAdmin }) => {
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

  // Efficiency rating
  const efficiencyRating = calculateEfficiencyRating(
    summary.totalUsage, 
    summary.totalDevices || deviceAnalysis.totalDevices, 
    period
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

            <div className="summary-card">
              <div className="summary-value">
                {efficiencyRating.rating}
              </div>
              <p className="summary-label">Efficiency Rating</p>
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
                    angle={period === 'month' ? -45 : 0}
                    textAnchor={period === 'month' ? 'end' : 'middle'}
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

        {/* Environmental Impact
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

            {savingsPotential && (
              <div className="environmental-card">
                <div className="summary-value">
                  {formatPercentage(savingsPotential.percentage)}
                </div>
                <p className="summary-label">Potential Savings</p>
              </div>
            )}
          </div>
        </div> */}

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

            {savingsPotential && (
              <>
                <div className="summary-card">
                  <div className="summary-value">
                    {formatCurrency(savingsPotential.costSavings)}
                  </div>
                  <p className="summary-label">Potential Cost Savings</p>
                </div>
                
                <div className="summary-card">
                  <div className="summary-value">
                    {savingsPotential.carbonSavings.toFixed(1)}
                    <span className="summary-unit">kg CO₂</span>
                  </div>
                  <p className="summary-label">Potential Carbon Reduction</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recommendations
        <div className="recommendations-section">
          <h3>💡 Energy Optimization Recommendations</h3>
          
          <ul className="recommendations-list">
            {recommendations.map((recommendation, index) => (
              <li key={index}>{recommendation}</li>
            ))}
          </ul>
        </div> */}

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
            {/* Carbon footprint calculated using Malaysia's grid emission factor (0.708 kg CO₂/kWh). */}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EnergyReport;