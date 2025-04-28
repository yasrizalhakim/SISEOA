// src/components/AppLoader.js
import React, { useEffect, useState } from 'react';
import { MdDevices } from 'react-icons/md';

const AppLoader = ({ onLoaded }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate app initialization
    const timer = setTimeout(() => {
      setLoading(false);
      if (onLoaded) onLoaded();
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [onLoaded]);

  return loading ? (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#111827',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000
      }}
    >
      <div
        style={{
          color: '#10b981',
          fontSize: '3rem',
          marginBottom: '1rem',
          animation: 'pulse 1.5s infinite'
        }}
      >
        <MdDevices />
      </div>
      <h1 style={{ color: 'white', margin: 0 }}>SISEOA</h1>
      <p style={{ color: 'rgba(255,255,255,0.7)' }}>
        Smart IOT System for Energy Optimization
      </p>
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
        `}
      </style>
    </div>
  ) : null;
};

export default AppLoader;