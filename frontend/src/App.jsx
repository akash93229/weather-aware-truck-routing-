import { useState, useEffect, useRef, useCallback } from 'react';
import { getHealth, analyzeTrip } from './api/client';
import { useHeatmap } from './hooks/useHeatmap';
import Logo from './components/Logo';
import Hero from './components/Hero';
import TripForm from './components/TripForm';
import MapView from './components/MapView';
import RouteCards from './components/RouteCards';
import RiskProfileChart from './components/RiskProfileChart';
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

  // UI View Modes & Panel Collapse state
  const [showHero, setShowHero] = useState(true);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [mobileTab, setMobileTab] = useState('map'); // 'map' | 'form' | 'routes' | 'weather'

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

    // Dismiss hero automatically on search and focus routes panel
    setShowHero(false);
    setIsRightPanelCollapsed(false);
    setMobileTab('routes');

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

  const handleSelectRoute = useCallback((routeId) => {
    setSelectedRouteId(routeId);
  }, []);

  const handleToggleHeatmap = useCallback(() => {
    setShowHeatmap((prev) => !prev);
  }, []);

  const handleToggle3D = useCallback(() => {
    setIs3D((prev) => !prev);
  }, []);

  return (
    <div className="stormlane-app" id="stormlane-root">
      {/* Top Bar with Logo, Viewport Controls, and Backend Status */}
      <header className="app-topbar" id="app-topbar">
        <div className="topbar-left">
          <Logo size="small" showWordmark={true} />
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className={`topbar-chip-btn ${is3D ? 'active' : ''}`}
            onClick={handleToggle3D}
            id="topbar-3d-btn"
            title={is3D ? 'Switch to 2D flat view' : 'Switch to 3D angled perspective'}
            aria-label="Toggle 3D View"
          >
            <span className="chip-tag">{is3D ? '3D View' : '2D View'}</span>
          </button>

          <button
            type="button"
            className={`topbar-chip-btn ${showHero ? 'active' : ''}`}
            onClick={() => setShowHero((s) => !s)}
            id="topbar-guide-btn"
            title="Toggle Guide & Features Overview"
            aria-label="Toggle Guide"
          >
            <span className="chip-tag">ℹ Overview</span>
          </button>

          <div
            className={`status-pill status-${backendStatus}`}
            id="api-status-pill"
            title={backendStatus === 'unavailable' ? backendError : 'Backend online'}
          >
            <span className="status-dot" />
            <span className="status-label">
              {backendStatus === 'checking' && 'Connecting...'}
              {backendStatus === 'ok' && 'API Online'}
              {backendStatus === 'unavailable' && 'API Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Full-Viewport Map Stage */}
      <main className="viewport-stage" id="viewport-stage">
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
          is3D={is3D}
          onToggle3D={handleToggle3D}
        />

        {/* Hero Banner Modal/Overlay (dismissable) */}
        {showHero && (
          <Hero
            onPlanTripClick={() => {
              setShowHero(false);
              setIsLeftPanelCollapsed(false);
              setMobileTab('form');
            }}
            isVisible={showHero}
          />
        )}

        {/* Left Floating Glass Panel: Trip Form (Collapsible) */}
        <aside
          className={`floating-glass-panel panel-left ${isLeftPanelCollapsed ? 'collapsed' : ''} ${mobileTab === 'form' ? 'mobile-visible' : ''}`}
          id="panel-trip-setup"
          aria-label="Trip Parameters Panel"
        >
          <div className="panel-header">
            <span className="panel-title-text">Trip Parameters</span>
            <button
              type="button"
              className="btn-panel-toggle"
              onClick={() => setIsLeftPanelCollapsed((c) => !c)}
              title={isLeftPanelCollapsed ? 'Expand Trip Parameters' : 'Collapse Trip Parameters'}
              id="collapse-left-panel-btn"
              aria-expanded={!isLeftPanelCollapsed}
            >
              {isLeftPanelCollapsed ? '▶' : '◀'}
            </button>
          </div>

          {!isLeftPanelCollapsed && (
            <div className="panel-content-scroll">
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
            </div>
          )}
        </aside>

        {/* Right Floating Glass Panel: Recommendation & 3 Route Cards (Collapsible) */}
        <aside
          className={`floating-glass-panel panel-right ${isRightPanelCollapsed ? 'collapsed' : ''} ${mobileTab === 'routes' ? 'mobile-visible' : ''}`}
          id="panel-route-cards"
          aria-label="Route Recommendations Panel"
        >
          <div className="panel-header">
            <span className="panel-title-text">
              {tripResults ? 'Route Comparison (3)' : 'Route Analysis'}
            </span>
            <button
              type="button"
              className="btn-panel-toggle"
              onClick={() => setIsRightPanelCollapsed((c) => !c)}
              title={isRightPanelCollapsed ? 'Expand Route Cards' : 'Collapse Route Cards'}
              id="collapse-right-panel-btn"
              aria-expanded={!isRightPanelCollapsed}
            >
              {isRightPanelCollapsed ? '◀' : '▶'}
            </button>
          </div>

          {!isRightPanelCollapsed && (
            <div className="panel-content-scroll">
              {/* Skeletons while analyzing */}
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

              {/* Loaded Route Cards & Recommendation */}
              {tripResults && !isLoadingAnalysis && (
                <>
                  <RouteCards
                    routes={tripResults.routes}
                    recommendation={tripResults.recommendation}
                    selectedRouteId={selectedRouteId}
                    onSelectRoute={handleSelectRoute}
                  />
                  <RiskProfileChart
                    route={
                      tripResults.routes?.find((r) => r.id === selectedRouteId) ||
                      tripResults.routes?.[0] ||
                      null
                    }
                  />
                </>
              )}

              {/* Empty State Prompt */}
              {!tripResults && !isLoadingAnalysis && (
                <div className="empty-state-card" id="empty-state-prompt">
                  <span className="empty-state-icon">🚚</span>
                  <h3 className="empty-state-title">Ready for Route Analysis</h3>
                  <p className="empty-state-desc">
                    Enter an origin and destination in Trip Parameters, or load the preset corridor below:
                  </p>
                  <button
                    type="button"
                    className="btn-quick-sample"
                    id="quick-sample-chicago-dallas"
                    onClick={() => {
                      setIsLeftPanelCollapsed(false);
                      setMobileTab('form');
                      const exBtn = document.getElementById('try-example-trip-btn');
                      if (exBtn) exBtn.click();
                    }}
                  >
                    Try Sample (Chicago → Dallas)
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </main>

      {/* Mobile Bottom Navigation Bar (Phone width < 768px) */}
      <nav className="mobile-nav-bar" id="mobile-nav-bar" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === 'map' ? 'active' : ''}`}
          onClick={() => setMobileTab('map')}
          id="mobile-tab-map"
        >
          <span className="tab-icon">🗺</span>
          <span className="tab-label">Map</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === 'form' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('form');
            setIsLeftPanelCollapsed(false);
          }}
          id="mobile-tab-form"
        >
          <span className="tab-icon">📋</span>
          <span className="tab-label">Setup</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === 'routes' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('routes');
            setIsRightPanelCollapsed(false);
          }}
          id="mobile-tab-routes"
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">Routes</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === 'weather' ? 'active' : ''}`}
          onClick={() => setMobileTab('weather')}
          id="mobile-tab-weather"
        >
          <span className="tab-icon">⏱</span>
          <span className="tab-label">48h Weather</span>
        </button>
      </nav>
    </div>
  );
}
