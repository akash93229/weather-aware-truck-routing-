import { useState, useEffect, useRef } from 'react';
import { getHealth, analyzeTrip } from './api/client';
import { useHeatmap } from './hooks/useHeatmap';
import TripForm from './components/TripForm';
import MapView from './components/MapView';
import RouteCards from './components/RouteCards';
import './App.css';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'ok' | 'unavailable'
  const [backendError, setBackendError] = useState('');

  // Trip analysis state
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisProgressHint, setAnalysisProgressHint] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [tripResults, setTripResults] = useState(null); // { routes, recommendation, warnings }
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [lastTripParams, setLastTripParams] = useState(null);

  // Heatmap visibility toggle
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Background heatmap hook: loads asynchronously without blocking route results
  const isTripReady = Boolean(tripResults && tripResults.routes && tripResults.routes.length > 0);
  const {
    heatmapData,
    isLoadingHeatmap,
    heatmapError,
    retryHeatmap,
  } = useHeatmap(lastTripParams, isTripReady);

  // Active in-flight AbortController ref
  const inFlightControllerRef = useRef(null);

  // Check backend health on mount
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
          setBackendError(err.message || 'Backend server is unavailable.');
          setBackendStatus('unavailable');
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleTripSubmit = async (formData) => {
    // Abort previous in-flight analysis request if still running
    if (inFlightControllerRef.current) {
      inFlightControllerRef.current.abort();
    }

    const controller = new AbortController();
    inFlightControllerRef.current = controller;

    setIsLoadingAnalysis(true);
    setAnalysisError('');
    setAnalysisProgressHint('');
    setLastTripParams(formData);

    try {
      const data = await analyzeTrip(formData, {
        signal: controller.signal,
        onWakeupHint: (hint) => {
          setAnalysisProgressHint(hint);
        },
      });

      setTripResults(data);
      // Auto-select recommended route or first route
      const initialSelected = data.recommendation?.route_id || data.routes?.[0]?.id || null;
      setSelectedRouteId(initialSelected);
    } catch (err) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        setAnalysisError(err.message || 'Trip analysis failed.');
      }
    } finally {
      setIsLoadingAnalysis(false);
      setAnalysisProgressHint('');
    }
  };

  const handleSelectRoute = (routeId) => {
    setSelectedRouteId(routeId);
  };

  const handleToggleHeatmap = () => {
    setShowHeatmap((prev) => !prev);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="title-badge-row">
          <h1 className="app-title">Weather-Aware Truck Routing</h1>
          <div
            className={`status-pill status-${backendStatus}`}
            title={backendStatus === 'unavailable' ? backendError : 'Backend online'}
          >
            <span className="status-dot" />
            <span>
              {backendStatus === 'checking' && 'Connecting...'}
              {backendStatus === 'ok' && 'API Online'}
              {backendStatus === 'unavailable' && 'API Offline'}
            </span>
          </div>
        </div>
        <p className="app-subtitle">
          Commercial vehicle routing with multi-route risk analysis, real-time weather sampling, and safety recommendations
        </p>
      </header>

      {/* Main Parameters Form */}
      <TripForm onSubmit={handleTripSubmit} isLoading={isLoadingAnalysis} />

      {/* Wakeup Progress Hint */}
      {analysisProgressHint && (
        <div className="alert-hint" id="server-wakeup-hint">
          <span className="error-icon">⏳</span>
          <span>{analysisProgressHint}</span>
        </div>
      )}

      {/* Error Banner */}
      {analysisError && (
        <div className="alert-error" id="analysis-error-banner">
          <span className="error-icon">✕</span>
          <span>{analysisError}</span>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoadingAnalysis && (
        <div className="skeleton-container" id="loading-skeletons">
          <div className="skeleton-banner" />
          <div className="skeleton-grid">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        </div>
      )}

      {/* Results Strip & Cards */}
      {tripResults && !isLoadingAnalysis && (
        <RouteCards
          routes={tripResults.routes}
          recommendation={tripResults.recommendation}
          selectedRouteId={selectedRouteId}
          onSelectRoute={handleSelectRoute}
        />
      )}

      {/* Map View with Corridor Heatmap and 0-48h Forecast Slider */}
      <MapView
        routes={tripResults?.routes || []}
        selectedRouteId={selectedRouteId}
        onSelectRoute={handleSelectRoute}
        heatmapData={heatmapData}
        showHeatmap={showHeatmap}
        onToggleHeatmap={handleToggleHeatmap}
        isLoadingHeatmap={isLoadingHeatmap}
        heatmapError={heatmapError}
        onRetryHeatmap={retryHeatmap}
      />

      {/* Empty State Banner when no calculation done yet */}
      {!tripResults && !isLoadingAnalysis && (
        <div className="empty-state-card" id="empty-state-prompt">
          <span className="empty-state-icon">🚚</span>
          <h3 className="empty-state-title">Ready for Route Analysis</h3>
          <p className="empty-state-desc">
            Enter an origin and destination above, select load weight and departure time, or click{' '}
            <strong>"Try example trip (Chicago → Dallas)"</strong> to evaluate safety and weather hazards across 3 distinct routes.
          </p>
        </div>
      )}

      {/* Footer Attribution */}
      <footer className="app-footer">
        <p>
          Map data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors
          </a>{' '}
          | Basemap style by{' '}
          <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">
            CARTO
          </a>{' '}
          | Weather forecasts provided by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
        </p>
      </footer>
    </div>
  );
}
