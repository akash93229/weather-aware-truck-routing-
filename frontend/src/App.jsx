import { useState, useEffect } from 'react';
import { getHealth } from './api/client';
import MapView from './components/MapView';
import './App.css';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [backendError, setBackendError] = useState('');

  useEffect(() => {
    let ignore = false;
    getHealth()
      .then(() => {
        if (!ignore) {
          setBackendStatus('ok');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setBackendError(err.message || 'Backend is unavailable.');
          setBackendStatus('unavailable');
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="app-card">
      <header className="app-header">
        <h1 className="app-title">Weather-Aware Truck Routing</h1>
        <p className="app-subtitle">
          Interactive multi-route weather analysis and safety risk evaluation
        </p>
      </header>

      <div className="status-bar">
        {backendStatus === 'checking' && (
          <div className="badge badge-checking">
            <span className="badge-dot" />
            <span>Checking backend...</span>
          </div>
        )}
        {backendStatus === 'ok' && (
          <div className="badge badge-ok">
            <span className="badge-dot" />
            <span>Backend OK</span>
          </div>
        )}
        {backendStatus === 'unavailable' && (
          <div className="badge badge-unavailable" title={backendError}>
            <span className="badge-dot" />
            <span>Backend unavailable: {backendError}</span>
          </div>
        )}
      </div>

      <MapView />

      <footer className="app-footer">
        <p>
          Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> |
          Basemap by <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a> |
          Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
        </p>
      </footer>
    </div>
  );
}
