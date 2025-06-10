// src/components/Reports/ReportPDFGenerator.js - PDF Generation Utility

import html2pdf from 'html2pdf.js';
import { 
  formatEnergyValue, 
  formatCurrency, 
  formatPercentage 
} from './reportUtils';

/**
 * Generate PDF from energy report data
 * @param {Object} reportData - Complete report data
 * @param {string} buildingName - Building name
 * @param {string} period - Report period
 * @param {boolean} isSystemAdmin - Whether user is system admin
 * @returns {Promise} PDF generation promise
 */
export const generateEnergyReportPDF = async (reportData, buildingName, period, isSystemAdmin = false) => {
  if (!reportData) {
    throw new Error('No report data available for PDF generation');
  }

  const { 
    summary, 
    costBreakdown, 
    deviceAnalysis, 
    carbonFootprint, 
    recommendations,
    dateRange,
    savingsPotential
  } = reportData;

  // Create HTML content for PDF
  const htmlContent = createPDFHTML({
    reportData,
    buildingName,
    period,
    isSystemAdmin,
    summary,
    costBreakdown,
    deviceAnalysis,
    carbonFootprint,
    recommendations,
    dateRange,
    savingsPotential
  });

  // PDF options
  const options = {
    margin: [0.5, 0.5, 0.5, 0.5],
    filename: `Energy_Report_${buildingName.replace(/\s+/g, '_')}_${period}_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2,
      useCORS: true,
      letterRendering: true,
      allowTaint: false
    },
    jsPDF: { 
      unit: 'in', 
      format: 'a4', 
      orientation: 'portrait',
      compress: true
    },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  try {
    // Generate PDF
    await html2pdf().set(options).from(htmlContent).save();
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF report');
  }
};

/**
 * Create HTML content for PDF generation
 */
const createPDFHTML = (data) => {
  const {
    buildingName,
    period,
    isSystemAdmin,
    summary,
    costBreakdown,
    deviceAnalysis,
    carbonFootprint,
    recommendations,
    dateRange,
    savingsPotential
  } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Energy Report - ${buildingName}</title>
      <style>
        ${getPDFStyles()}
      </style>
    </head>
    <body>
      <!-- Report Header -->
      <div class="pdf-header">
        <div class="company-info">
          <h1>SISEAO Energy Management System</h1>
          <p>Smart IoT System for Energy Optimization and Automation</p>
        </div>
        <div class="report-info">
          <h2>${isSystemAdmin ? 'System Energy Report' : 'Building Energy Report'}</h2>
          <h3>${buildingName}</h3>
          <p class="period">${dateRange.periodText}</p>
          <p class="generated">Generated: ${new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <!-- Executive Summary -->
      <div class="section">
        <h2 class="section-title">📊 Executive Summary</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-value">${formatEnergyValue(summary.totalUsage)}</div>
            <div class="summary-label">Total Energy Consumption</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">${formatCurrency(summary.totalCost)}</div>
            <div class="summary-label">Total Energy Cost</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">${formatCurrency(summary.averageRate)}/kWh</div>
            <div class="summary-label">Average Rate</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">${summary.activeDevices || 0}</div>
            <div class="summary-label">Active Devices</div>
          </div>
          ${isSystemAdmin ? `
          <div class="summary-item">
            <div class="summary-value">${summary.totalUsers || 0}</div>
            <div class="summary-label">System Users</div>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Cost Breakdown -->
      <div class="section">
        <h2 class="section-title">💰 Cost Breakdown (Malaysia TNB Tariff)</h2>
        <table class="cost-table">
          <thead>
            <tr>
              <th>Usage Tier</th>
              <th>Consumption</th>
              <th>Rate (RM/kWh)</th>
              <th>Cost (RM)</th>
            </tr>
          </thead>
          <tbody>
            ${costBreakdown.breakdown.map(tier => `
              <tr>
                <td>${tier.tier}</td>
                <td>${formatEnergyValue(tier.usage)}</td>
                <td>${formatCurrency(tier.rate)}</td>
                <td class="amount">${formatCurrency(tier.cost)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td><strong>Total</strong></td>
              <td><strong>${formatEnergyValue(costBreakdown.totalKwh)}</strong></td>
              <td><strong>${formatCurrency(costBreakdown.averageRate)}</strong></td>
              <td class="amount"><strong>${formatCurrency(costBreakdown.totalCost)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Device Analysis -->
      <div class="section">
        <h2 class="section-title">🔌 Top Energy Consuming Devices</h2>
        <table class="device-table">
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
            ${deviceAnalysis.deviceDetails.slice(0, 10).map(device => `
              <tr>
                <td>${device.name}</td>
                <td>${device.type}</td>
                <td>${formatEnergyValue(device.usage)}</td>
                <td class="amount">${formatCurrency(device.cost)}</td>
                <td>${formatPercentage(device.percentage)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Device Type Breakdown -->
      <div class="section">
        <h2 class="section-title">📈 Energy Consumption by Device Type</h2>
        <div class="device-breakdown">
          ${deviceAnalysis.chartData.map((item, index) => `
            <div class="breakdown-item">
              <div class="breakdown-bar">
                <div class="bar-fill" style="width: ${item.percentage}%; background-color: ${getColorByIndex(index)};"></div>
              </div>
              <div class="breakdown-details">
                <span class="device-type">${item.name}</span>
                <span class="device-usage">${formatEnergyValue(item.value)} (${formatPercentage(item.percentage)})</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Environmental Impact -->
      <!-- <div class="section">
        <h2 class="section-title">🌱 Environmental Impact</h2>
        <div class="environmental-grid">
          <div class="env-item">
            <div class="env-value">${carbonFootprint.carbonEmission} kg</div>
            <div class="env-label">CO₂ Emissions</div>
          </div>
          <div class="env-item">
            <div class="env-value">${carbonFootprint.treesEquivalent}</div>
            <div class="env-label">Trees Needed (1 year)</div>
          </div>
          <div class="env-item">
            <div class="env-value">${carbonFootprint.carMilesEquivalent.toFixed(0)} miles</div>
            <div class="env-label">Car Miles Equivalent</div>
          </div>
          ${savingsPotential ? `
          <div class="env-item">
            <div class="env-value">${formatPercentage(savingsPotential.percentage)}</div>
            <div class="env-label">Potential Savings</div>
          </div>
          ` : ''}
        </div>
      </div> -->

      <!-- Energy Efficiency -->
      ${savingsPotential ? `
      <div class="section">
        <h2 class="section-title">⚡ Energy Savings Potential</h2>
        <div class="savings-grid">
          <div class="savings-item">
            <div class="savings-value">${formatEnergyValue(savingsPotential.energySavings)}</div>
            <div class="savings-label">Potential Energy Savings</div>
          </div>
          <div class="savings-item">
            <div class="savings-value">${formatCurrency(savingsPotential.costSavings)}</div>
            <div class="savings-label">Potential Cost Savings</div>
          </div>
          <div class="savings-item">
            <div class="savings-value">${savingsPotential.carbonSavings.toFixed(1)} kg CO₂</div>
            <div class="savings-label">Potential Carbon Reduction</div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Recommendations -->
      <!-- <div class="section">
        <h2 class="section-title">💡 Energy Optimization Recommendations</h2>
        <div class="recommendations">
          ${recommendations.map((rec, index) => `
            <div class="recommendation-item">
              <span class="rec-number">${index + 1}</span>
              <span class="rec-text">${rec}</span>
            </div>
          `).join('')}
        </div>
      </div> -->

      <!-- Report Footer -->
      <div class="pdf-footer">
        <div class="footer-content">
          <p><strong>Report Details:</strong></p>
          <p>• Report generated on ${new Date().toLocaleDateString()} by SISEAO Energy Management System</p>
          <p>• Energy rates based on TNB Malaysia tariff structure for residential/small office consumption</p>
          <!-- <p>• Carbon footprint calculated using Malaysia's grid emission factor (0.708 kg CO₂/kWh)</p>
          <p>• Recommendations are based on industry best practices and energy efficiency standards</p> -->
        </div>
        <div class="footer-logo">
          <p><strong>SISEAO</strong> - Smart IoT System for Energy Optimization and Automation</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Get CSS styles for PDF
 */
const getPDFStyles = () => `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    color: #1e293b;
    background-color: white;
  }

  .pdf-header {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    padding: 20px;
    text-align: center;
    margin-bottom: 20px;
    border-radius: 8px;
  }

  .pdf-header h1 {
    font-size: 24px;
    margin-bottom: 5px;
    font-weight: 700;
  }

  .pdf-header h2 {
    font-size: 18px;
    margin: 10px 0 5px 0;
    font-weight: 600;
  }

  .pdf-header h3 {
    font-size: 16px;
    margin-bottom: 5px;
    font-weight: 500;
  }

  .pdf-header p {
    margin: 2px 0;
    opacity: 0.9;
  }

  .period {
    font-size: 14px !important;
    font-weight: 500;
  }

  .generated {
    font-size: 11px !important;
    opacity: 0.8;
  }

  .section {
    margin-bottom: 25px;
    page-break-inside: avoid;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 15px;
    padding-bottom: 5px;
    border-bottom: 2px solid #10b981;
  }

  /* Summary Grid */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
  }

  .summary-item {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 15px;
    text-align: center;
  }

  .summary-value {
    font-size: 18px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 5px;
  }

  .summary-label {
    font-size: 11px;
    color: #64748b;
    font-weight: 500;
  }

  /* Tables */
  .cost-table,
  .device-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
  }

  .cost-table th,
  .device-table th {
    background-color: #f8fafc;
    padding: 10px;
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    color: #374151;
    border-bottom: 1px solid #e2e8f0;
  }

  .cost-table td,
  .device-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 11px;
  }

  .amount {
    text-align: right;
    font-weight: 600;
    color: #059669;
  }

  .total-row {
    background-color: #f0fdf4;
  }

  .total-row td {
    color: #15803d;
    font-weight: 600;
  }

  /* Device Breakdown */
  .device-breakdown {
    margin-top: 15px;
  }

  .breakdown-item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    padding: 8px;
    background-color: #f8fafc;
    border-radius: 4px;
  }

  .breakdown-bar {
    width: 100px;
    height: 16px;
    background-color: #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    margin-right: 15px;
  }

  .bar-fill {
    height: 100%;
    border-radius: 8px;
    transition: none;
  }

  .breakdown-details {
    display: flex;
    justify-content: space-between;
    flex: 1;
    align-items: center;
  }

  .device-type {
    font-weight: 600;
    color: #1e293b;
  }

  .device-usage {
    font-size: 11px;
    color: #64748b;
    font-weight: 500;
  }

  /* Environmental Grid */
  .environmental-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 15px;
    margin-top: 15px;
  }

  .env-item {
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    border: 1px solid #86efac;
    border-radius: 6px;
    padding: 15px;
    text-align: center;
  }

  .env-value {
    font-size: 16px;
    font-weight: 700;
    color: #15803d;
    margin-bottom: 5px;
  }

  .env-label {
    font-size: 10px;
    color: #166534;
    font-weight: 500;
  }

  /* Savings Grid */
  .savings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 15px;
    margin-top: 15px;
  }

  .savings-item {
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    border: 1px solid #93c5fd;
    border-radius: 6px;
    padding: 15px;
    text-align: center;
  }

  .savings-value {
    font-size: 16px;
    font-weight: 700;
    color: #1d4ed8;
    margin-bottom: 5px;
  }

  .savings-label {
    font-size: 10px;
    color: #1e40af;
    font-weight: 500;
  }

  /* Recommendations */
  .recommendations {
    margin-top: 15px;
  }

  .recommendation-item {
    display: flex;
    align-items: flex-start;
    margin-bottom: 12px;
    padding: 10px;
    background-color: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
  }

  .rec-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background-color: #3b82f6;
    color: white;
    border-radius: 50%;
    font-size: 10px;
    font-weight: 600;
    margin-right: 10px;
    flex-shrink: 0;
  }

  .rec-text {
    font-size: 11px;
    color: #1e40af;
    line-height: 1.4;
  }

  /* Footer */
  .pdf-footer {
    margin-top: 30px;
    padding: 20px;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    page-break-inside: avoid;
  }

  .footer-content p {
    font-size: 10px;
    color: #64748b;
    margin-bottom: 3px;
    line-height: 1.3;
  }

  .footer-logo {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
  }

  .footer-logo p {
    font-size: 12px;
    color: #10b981;
    font-weight: 600;
  }

  /* Print optimizations */
  @media print {
    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    
    .section {
      page-break-inside: avoid;
    }
    
    .cost-table,
    .device-table {
      page-break-inside: avoid;
    }
  }

  /* Page breaks */
  .page-break {
    page-break-before: always;
  }

  .avoid-break {
    page-break-inside: avoid;
  }
`;

/**
 * Get color by index for charts
 */
const getColorByIndex = (index) => {
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
  return colors[index % colors.length];
};

export default {
  generateEnergyReportPDF
};