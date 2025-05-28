// src/components/common/TabPanel.js
import React, { useState } from 'react';
import './TabPanel.css';

/**
 * Tab panel component for displaying tabbed content
 * @param {Object} props - Component props
 * @param {Array} props.tabs - Array of tab objects {label, content}
 * @param {Number} props.defaultTab - Default active tab index (0-based)
 */
const TabPanel = ({ tabs, defaultTab = 0 }) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabClick = (index) => {
    setActiveTab(index);
  };

  return (
    <div className="tab-panel">
      <div className="tab-buttons">
        {tabs.map((tab, index) => (
          <button
            key={index}
            className={`tab-button ${activeTab === index ? 'active' : ''}`}
            onClick={() => handleTabClick(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {tabs[activeTab].content}
      </div>
    </div>
  );
};

export default TabPanel;