import { useState, useEffect } from 'react';
import { getHealth } from './api/client';
import './App.css';

export default function App() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'ok' | 'unavailable'
  const [serviceName, setServiceName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const checkHealth = () => {
    setStatus('checking');
    setErrorMessage('');
    getHealth()
      .then((data) => {
        setServiceName(data.service || 'weather-aware-truck-routing-api');
        setStatus('ok');
      })
      .catch((err) => {
        setErrorMessage(err.message || 'Unknown error occurred while contacting backend.');
        setStatus('unavailable');
      });
  };

  useEffect(() => {
    let ignore = false;
    getHealth()
      .then((data) => {
        if (!ignore) {
          setServiceName(data.service || 'weather-aware-truck-routing-api');
          setStatus('ok');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err.message || 'Unknown error occurred while contacting backend.');
          setStatus('unavailable');
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
          Intelligent route optimization balancing real-time weather risk, load weight constraints, and travel time.
        </p>
      </header>

      <section className="status-section">
        {status === 'checking' && (
          <div className="badge badge-checking" id="backend-status-badge">
            <span className="badge-dot" />
            <span>Checking backend status...</span>
          </div>
        )}

        {status === 'ok' && (
          <>
            <div className="badge badge-ok" id="backend-status-badge">
              <span className="badge-dot" />
              <span>Backend OK</span>
            </div>
            {serviceName && (
              <span className="service-info">Connected service: {serviceName}</span>
            )}
          </>
        )}

        {status === 'unavailable' && (
          <>
            <div className="badge badge-unavailable" id="backend-status-badge">
              <span className="badge-dot" />
              <span>Backend unavailable</span>
            </div>
            {errorMessage && (
              <div className="error-details" id="backend-error-message">
                {errorMessage}
              </div>
            )}
            <button type="button" className="retry-btn" onClick={checkHealth}>
              Retry Connection
            </button>
          </>
        )}
      </section>
    </div>
  );
}
