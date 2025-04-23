import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './EnergyUsage.css';

const EnergyUsage = () => {
  // Sample energy usage data
  const energyData = [
    { name: '00:00', usage: 40 },
    { name: '03:00', usage: 30 },
    { name: '06:00', usage: 20 },
    { name: '09:00', usage: 50 },
    { name: '12:00', usage: 65 },
    { name: '15:00', usage: 75 },
    { name: '18:00', usage: 90 },
    { name: '21:00', usage: 60 },
    { name: '24:00', usage: 45 },
  ];

  return (
    <div className="energy-usage-container">
      <div className="panel-header">
        <h3>Energy Consumption</h3>
        <div className="chart-controls">
          <button className="chart-btn active">Day</button>
          <button className="chart-btn">Week</button>
          <button className="chart-btn">Month</button>
        </div>
      </div>
      
      <div className="chart-area">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={energyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="usage" 
              stroke="#10b981" 
              strokeWidth={2} 
              dot={{ stroke: '#10b981', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }} 
              name="Energy (kWh)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="energy-summary">
        <div className="summary-item">
          <span className="summary-label">Today's Usage</span>
          <span className="summary-value">24.5 kWh</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Average</span>
          <span className="summary-value">22.8 kWh</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Projected Monthly</span>
          <span className="summary-value">730 kWh</span>
        </div>
      </div>
    </div>
  );
};

export default EnergyUsage;