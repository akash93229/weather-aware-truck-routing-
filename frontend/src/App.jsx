import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { getHealth, analyzeTrip, saveRecentTrip } from './api/client';
import { useHeatmap } from './hooks/useHeatmap';
import Logo from './components/Logo';
import Hero from './components/Hero';
import TripForm from './components/TripForm';
import MapView from './components/MapView';
import RouteCards from './components/RouteCards';
import NavRail from './components/NavRail';
import WeatherReportPanel from './components/WeatherReportPanel';
import RecentTripsPanel from './components/RecentTripsPanel';
import Home from './home/Home';
import { SegmentedControl, IconButton, Button, EmptyState } from './ui/components';
import { Icon } from './ui/icons';

const RiskProfileChart = lazy(() => import('./components/RiskProfileChart'));
const UiKitPage = lazy(() => import('./ui/UiKitPage'));

function formatDepartureSummary(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return isoStr;
  }
}

function computeResultsMeta(p) {
  if (!p) return '';
  const s = p.scenario === 'storm' ? 'Storm demo' : p.scenario === 'calm' ? 'Calm demo' : 'Live forecast';
  const dep = p.departure_time ? `, departs ${formatDepartureSummary(p.departure_time)}` : '';
  return `${s}, ${Number(p.load_weight_lb || 0).toLocaleString()} lb, ${p.interval_miles || 25} mi${dep}`;
}

export default function App() {
  const [isUiKit, setIsUiKit] = useState(() => import.meta.env.DEV && window.location.hash === '#ui-kit');
  useEffect(() => {
    const handleHash = () => {
      setIsUiKit(import.meta.env.DEV && window.location.hash === '#ui-kit');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const [started, setStarted] = useState(false);

  const pendingExampleTripRef = useRef(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'ok' | 'unavailable'
  const [backendError, setBackendError] = useState('');

  // Dark / Light Theme state (Phase 6)
  const [theme, setTheme] = useState(() => {
    try {
      return (
        document.documentElement.getAttribute('data-theme') ||
        localStorage.getItem('stormlane-theme') ||
        (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      );
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('stormlane-theme', theme);
    } catch {}
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);


  // Sidebar Rail State (Phase 2: Hidden off-canvas by default)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    try {
      return sessionStorage.getItem('stormlane-rail-pinned') === 'true';
    } catch {
      return false;
    }
  });

  const handleTogglePin = useCallback(() => {
    setIsSidebarPinned((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('stormlane-rail-pinned', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Two-Dock Layout State (Phase 1)
  // Left Dock (Trip Parameters | Recent Trips)
  const [isLeftDockOpen, setIsLeftDockOpen] = useState(true);
  const [leftDockTab, setLeftDockTab] = useState('params'); // 'params' | 'recent'

  // Right Dock (Route Analysis | Weather Report)
  const [isRightDockOpen, setIsRightDockOpen] = useState(false);
  const [rightDockTab, setRightDockTab] = useState('routes'); // 'routes' | 'weather'
  const [hasUnviewedWeather, setHasUnviewedWeather] = useState(false);
  const [hasNewResults, setHasNewResults] = useState(false);

  // Map attribution popover state
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);

  // Driver Brief Units (Imperial vs Metric)
  const [units, setUnits] = useState(() => {
    try {
      return sessionStorage.getItem('stormlane-units') || 'imperial';
    } catch {
      return 'imperial';
    }
  });

  const handleUnitsChange = useCallback((newUnits) => {
    setUnits(newUnits);
    try {
      sessionStorage.setItem('stormlane-units', newUnits);
    } catch {}
  }, []);

  // Focused key stop on map & timeline
  const [focusedStop, setFocusedStop] = useState(null);

  const [recentTripsRefreshKey, setRecentTripsRefreshKey] = useState(0);
  const [prefillTrip, setPrefillTrip] = useState(null);

  // Live form state (for showing Weather Report even before full analysis)
  const [currentFormState, setCurrentFormState] = useState({
    originCoord: null,
    destCoord: null,
    departureTime: '',
  });

  // Trip analysis state
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisProgressHint, setAnalysisProgressHint] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [tripResults, setTripResults] = useState(null); // { routes, recommendation, warnings }
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [lastTripParams, setLastTripParams] = useState(null);
  const [isInputsChanged, setIsInputsChanged] = useState(false);

  // UI View Modes & Controls
  const [showHero, setShowHero] = useState(true);
  const [is3D, setIs3D] = useState(true);

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

  // Health check on mount + 30s retry poll
  useEffect(() => {
    let ignore = false;

    const check = () => {
      getHealth()
        .then(() => {
          if (!ignore) {
            setBackendStatus('ok');
            setBackendError('');
          }
        })
        .catch((err) => {
          if (!ignore) {
            setBackendError(err.message || 'Backend server is unavailable.');
            setBackendStatus('unavailable');
          }
        });
    };

    check();
    const interval = setInterval(check, 30000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  // Keyboard shortcut for sidebar rail: '[' to toggle, 'Escape' to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        if (e.key === 'Escape') {
          setIsSidebarOpen(false);
        }
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        setIsSidebarOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle triggered example trip from Home landing
  useEffect(() => {
    if (started && pendingExampleTripRef.current) {
      pendingExampleTripRef.current = false;
      const timer = setTimeout(() => {
        setIsLeftDockOpen(true);
        setLeftDockTab('params');
        const exBtn = document.getElementById('try-example-trip-btn');
        if (exBtn) exBtn.click();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [started]);

  // Sidebar item selection handler
  const handleSelectSidebarItem = useCallback(
    (itemId) => {
      if (itemId === 'params') {
        setIsLeftDockOpen(true);
        setLeftDockTab('params');
      } else if (itemId === 'recent') {
        setIsLeftDockOpen(true);
        setLeftDockTab('recent');
      } else if (itemId === 'routes') {
        setIsRightDockOpen(true);
        setRightDockTab('routes');
      } else if (itemId === 'weather') {
        setIsRightDockOpen(true);
        setRightDockTab('weather');
        setHasUnviewedWeather(false);
      } else if (itemId === 'info') {
        setIsAttributionOpen((prev) => !prev);
      }

      if (!isSidebarPinned) {
        setIsSidebarOpen(false);
      }
    },
    [isSidebarPinned]
  );

  const handleTripSubmit = async (formData) => {
    if (inFlightControllerRef.current) {
      inFlightControllerRef.current.abort();
    }

    const controller = new AbortController();
    inFlightControllerRef.current = controller;

    setIsLoadingAnalysis(true);
    setAnalysisError('');
    setAnalysisProgressHint('');
    setLastTripParams(formData);
    setIsInputsChanged(false);
    setShowHero(false);

    try {
      const data = await analyzeTrip(formData, {
        signal: controller.signal,
        onProgressiveRoutes: (fastData) => {
          setTripResults(fastData);
          const initialSelected = fastData.recommendation?.route_id || fastData.routes?.[0]?.id || null;
          setSelectedRouteId(initialSelected);
          setHasNewResults(true);
          setIsRightDockOpen(true);
          setRightDockTab('routes');
        },
        onWakeupHint: (hint) => {
          setAnalysisProgressHint(hint);
        },
      });

      setTripResults(data);
      const initialSelected = data.recommendation?.route_id || data.routes?.[0]?.id || null;
      setSelectedRouteId(initialSelected);

      // AUTO-OPEN: after analysis finishes, the right dock opens on Route Analysis
      // (Weather Report tab shows a pulse dot until viewed)
      setHasNewResults(true);
      setHasUnviewedWeather(true);
      setIsRightDockOpen(true);
      setRightDockTab('routes');

      // Automatically save trip to Recent Trips in backend
      const origLabel = formData.origin?.label || formData.origin?.address || 'Origin';
      const destLabel = formData.destination?.label || formData.destination?.address || 'Destination';
      saveRecentTrip({
        origin_label: origLabel,
        origin_lat: formData.origin?.lat,
        origin_lon: formData.origin?.lng,
        dest_label: destLabel,
        dest_lat: formData.destination?.lat,
        dest_lon: formData.destination?.lng,
        departure_at: formData.departure_time,
        max_risk_level: data.recommendation?.risk_level ?? null,
      })
        .then(() => {
          setRecentTripsRefreshKey((k) => k + 1);
        })
        .catch(() => {
          // Fail silently on client if recent trips save errors
        });
    } catch (err) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        setAnalysisError(err.message || 'Trip analysis failed.');
      }
    } finally {
      setIsLoadingAnalysis(false);
      setAnalysisProgressHint('');
    }
  };

  const handleFormChange = useCallback(
    (formValues) => {
      setCurrentFormState({
        originCoord: formValues.originCoord,
        destCoord: formValues.destCoord,
        departureTime: formValues.departureTime,
      });

      if (!lastTripParams) {
        setIsInputsChanged(false);
        return;
      }
      const scenarioChanged = formValues.scenario !== lastTripParams.scenario;
      const weightChanged = Number(formValues.loadWeight) !== Number(lastTripParams.load_weight_lb);
      const intervalChanged =
        String(formValues.intervalMiles) !== String(lastTripParams.interval_miles) &&
        formValues.intervalMiles !== 'auto';
      const departureIso = formValues.departureTime ? new Date(formValues.departureTime).toISOString() : '';
      const departureChanged =
        departureIso &&
        Math.abs(new Date(departureIso).getTime() - new Date(lastTripParams.departure_time).getTime()) > 60000;
      const originChanged = formValues.originCoord
        ? Math.abs(formValues.originCoord.lat - (lastTripParams.origin?.lat || 0)) > 0.001 ||
          Math.abs(formValues.originCoord.lng - (lastTripParams.origin?.lng || 0)) > 0.001
        : true;
      const destChanged = formValues.destCoord
        ? Math.abs(formValues.destCoord.lat - (lastTripParams.destination?.lat || 0)) > 0.001 ||
          Math.abs(formValues.destCoord.lng - (lastTripParams.destination?.lng || 0)) > 0.001
        : true;

      const hasChanged =
        scenarioChanged || weightChanged || intervalChanged || departureChanged || originChanged || destChanged;
      setIsInputsChanged(hasChanged);
    },
    [lastTripParams]
  );

  const handleClearRoutes = useCallback(() => {
    setTripResults(null);
    setSelectedRouteId(null);
    setLastTripParams(null);
    setIsInputsChanged(false);
    setHasNewResults(false);
    setHasUnviewedWeather(false);
  }, []);

  const handleSelectRoute = useCallback((routeId) => {
    setSelectedRouteId(routeId);
  }, []);

  const handleToggleHeatmap = useCallback(() => {
    setShowHeatmap((prev) => !prev);
  }, []);

  const handleToggle3D = useCallback(() => {
    setIs3D((prev) => !prev);
  }, []);

  const handleSelectRecentTrip = useCallback((trip) => {
    setPrefillTrip(trip);
    setIsLeftDockOpen(true);
    setLeftDockTab('params');
    const formData = {
      origin: { lat: Number(trip.origin_lat), lng: Number(trip.origin_lon), label: trip.origin_label },
      destination: { lat: Number(trip.dest_lat), lng: Number(trip.dest_lon), label: trip.dest_label },
      departure_time: trip.departure_at ? new Date(trip.departure_at).toISOString() : new Date().toISOString(),
      load_weight_lb: 42000,
      interval_miles: 25,
      scenario: 'live',
    };
    handleTripSubmit(formData);
  }, []);

  if (isUiKit) {
    return (
      <Suspense fallback={<div style={{ padding: 40, color: 'var(--text)' }}>Loading UI Kit...</div>}>
        <UiKitPage />
      </Suspense>
    );
  }

  if (!started) {
    return (
      <Home
        onLaunch={(opts) => {
          if (opts?.exampleTrip) {
            pendingExampleTripRef.current = true;
          }
          setStarted(true);
        }}
      />
    );
  }

  const activeSidebarItem = rightDockTab === 'weather' && isRightDockOpen
    ? 'weather'
    : isRightDockOpen
    ? 'routes'
    : leftDockTab === 'recent' && isLeftDockOpen
    ? 'recent'
    : isLeftDockOpen
    ? 'params'
    : null;

  return (
    <div className={`stormlane-app theme-${theme}`} id="stormlane-root">
      {/* Top Bar with Menu Hamburger, Logo, Viewport Controls, Theme Toggle, and Backend Status */}
      <header className="app-topbar" id="app-topbar">
        <div className="topbar-left">
          {/* Menu button: 40px icon button at the far left */}
          <button
            type="button"
            className="icon-btn header-menu-btn"
            id="header-menu-toggle-btn"
            onClick={() => setIsSidebarOpen((v) => !v)}
            aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isSidebarOpen}
            title="Toggle Menu (Press '[')"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <Logo size="small" showWordmark={true} />
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="topbar-chip-btn"
            onClick={() => setStarted(false)}
            id="topbar-home-btn"
            title="Return to Home Landing"
            aria-label="Return to Home"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className="chip-tag">Home</span>
          </button>

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
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span className="chip-tag">Overview</span>
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

          {/* Theme Toggle Button (Phase 6): 44px circular glass button */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={handleToggleTheme}
            id="theme-toggle-btn"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={theme === 'light'}
          >
            <span className={`theme-icon-wrap ${theme}`}>
              {theme === 'dark' ? (
                <svg
                  className="theme-svg sun-icon"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="12" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg
                  className="theme-svg moon-icon"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </span>
          </button>
        </div>
      </header>

      {/* Main App Body: Sidebar Drawer + Docks + Full Viewport Map */}
      <div className="app-main-layout" id="app-main-layout">
        {/* Rebuilt NavRail Floating Card (Step 2) */}
        <NavRail
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          isPinned={isSidebarPinned}
          onTogglePin={handleTogglePin}
          activeItem={activeSidebarItem}
          onSelectItem={handleSelectSidebarItem}
          hasNewResults={hasNewResults}
          hasUnviewedWeather={hasUnviewedWeather}
          showHeatmap={showHeatmap}
          onToggleHeatmap={handleToggleHeatmap}
        />

        {/* Two-Dock Layout Stage (Phase 1) */}
        {/* LEFT DOCK: Trip Parameters & Recent Trips */}

        {isLeftDockOpen && (
          <aside className="dock-container left-dock" id="left-dock" aria-label="Trip Parameters & Recent Trips">
            <div className="dock-header">
              <SegmentedControl
                value={leftDockTab}
                onChange={setLeftDockTab}
                options={[
                  { id: 'params', label: 'Trip Parameters', icon: <Icon name="sliders" size={16} /> },
                  { id: 'recent', label: 'Recent Trips', icon: <Icon name="clock" size={16} /> },
                ]}
                ariaLabel="Left Dock Tabs"
                className="dock-tabs-control"
              />
              <IconButton
                icon={<Icon name="close" size={18} />}
                ariaLabel="Collapse Left Dock"
                title="Collapse [Esc]"
                onClick={() => setIsLeftDockOpen(false)}
                className="dock-close-btn"
              />
            </div>

            <div className="dock-body">
              {leftDockTab === 'params' ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 16 }}>
                  <TripForm
                    onSubmit={handleTripSubmit}
                    isLoading={isLoadingAnalysis}
                    onFormChange={handleFormChange}
                    onClearRoutes={handleClearRoutes}
                    prefillTrip={prefillTrip}
                  />

                  {analysisProgressHint && (
                    <div className="alert-hint" id="server-wakeup-hint" style={{ marginTop: 12 }}>
                      <span className="hint-text">{analysisProgressHint}</span>
                    </div>
                  )}

                  {analysisError && (
                    <div className="alert-error" id="analysis-error-banner" style={{ marginTop: 12 }}>
                      <span className="error-text">{analysisError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <RecentTripsPanel
                  onSelectTrip={handleSelectRecentTrip}
                  onClose={() => setIsLeftDockOpen(false)}
                  refreshKey={recentTripsRefreshKey}
                />
              )}
            </div>
          </aside>
        )}

        {/* RIGHT DOCK: Route Analysis & Weather Report */}
        {isRightDockOpen && (
          <aside className="dock-container right-dock" id="right-dock" aria-label="Route Analysis & Driver Brief">
            <div className="dock-header">
              <SegmentedControl
                value={rightDockTab}
                onChange={(tab) => {
                  setRightDockTab(tab);
                  if (tab === 'weather') setHasUnviewedWeather(false);
                }}
                options={[
                  { id: 'routes', label: 'Route Analysis', icon: <Icon name="route" size={16} /> },
                  { id: 'weather', label: 'Driver Brief', icon: <Icon name="cloud" size={16} /> },
                ]}
                ariaLabel="Right Dock Tabs"
                className="dock-tabs-control"
              />
              {rightDockTab === 'weather' && (
                <SegmentedControl
                  value={units}
                  onChange={handleUnitsChange}
                  options={[
                    { id: 'imperial', label: '°F' },
                    { id: 'metric', label: '°C' },
                  ]}
                  ariaLabel="Units System"
                  className="dock-units-control"
                />
              )}
              <IconButton
                icon={<Icon name="close" size={18} />}
                ariaLabel="Collapse Right Dock"
                title="Collapse"
                onClick={() => setIsRightDockOpen(false)}
                className="dock-close-btn"
              />
            </div>

            <div className="dock-body">
              {rightDockTab === 'routes' ? (
                isLoadingAnalysis ? (
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} id="loading-skeletons">
                    <div className="sl-skeleton" style={{ height: 48, borderRadius: 14 }} />
                    <div className="sl-skeleton" style={{ height: 120, borderRadius: 14 }} />
                    <div className="sl-skeleton" style={{ height: 120, borderRadius: 14 }} />
                    <div className="sl-skeleton" style={{ height: 120, borderRadius: 14 }} />
                  </div>
                ) : tripResults ? (
                  <div className={`results-wrapper ${isInputsChanged ? 'is-stale' : ''}`} id="results-wrapper" style={{ padding: 16 }}>
                    {isInputsChanged && (
                      <div className="inputs-changed-banner" id="inputs-changed-notice">
                        <Icon name="alert-triangle" size={16} />
                        <span>Inputs changed. Press Analyze to update.</span>
                      </div>
                    )}
                    {(tripResults.partial_weather || tripResults.weather_unavailable || (tripResults.warnings && tripResults.warnings.some(w => w.toLowerCase().includes('weather')))) && (
                      <div className="weather-degraded-banner" id="weather-degraded-notice" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'rgba(234, 179, 8, 0.12)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        color: '#facc15',
                        marginBottom: '12px',
                        fontSize: '13px',
                        fontWeight: 500
                      }}>
                        <Icon name="alert-triangle" size={16} />
                        <span>Some weather data unavailable. Displaying best available route details.</span>
                      </div>
                    )}
                    <div className="results-computed-for" id="results-computed-for" style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Results for: </span>
                      <span className="computed-tag">{computeResultsMeta(lastTripParams)}</span>
                    </div>
                    <RouteCards
                      routes={tripResults.routes}
                      recommendation={tripResults.recommendation}
                      selectedRouteId={selectedRouteId}
                      onSelectRoute={handleSelectRoute}
                    />
                    <Suspense
                      fallback={
                        <div className="chart-loading-placeholder" style={{ padding: '1rem', color: '#94a3b8', textAlign: 'center' }}>
                          Loading elevation &amp; weather profile...
                        </div>
                      }
                    >
                      <RiskProfileChart
                        route={
                          tripResults.routes?.find((r) => r.id === selectedRouteId) ||
                          tripResults.routes?.[0] ||
                          null
                        }
                      />
                    </Suspense>
                  </div>
                ) : (
                  <div style={{ padding: 24 }} id="empty-state-prompt">
                    <EmptyState
                      icon="route"
                      title="Ready for Route Analysis"
                      description="Enter origin and destination in Trip Parameters, or load the preset corridor below:"
                      action={
                        <Button
                          variant="secondary"
                          size="md"
                          id="quick-sample-chicago-dallas"
                          onClick={() => {
                            setIsLeftDockOpen(true);
                            setLeftDockTab('params');
                            const exBtn = document.getElementById('try-example-trip-btn');
                            if (exBtn) exBtn.click();
                          }}
                        >
                          Try Sample (Chicago → Dallas)
                        </Button>
                      }
                    />
                  </div>
                )
              ) : (
                <WeatherReportPanel
                  origin={lastTripParams?.origin || currentFormState.originCoord}
                  destination={lastTripParams?.destination || currentFormState.destCoord}
                  departureTime={lastTripParams?.departure_time || currentFormState.departureTime}
                  tripResults={tripResults}
                  selectedRouteId={selectedRouteId}
                  units={units}
                  onUnitsChange={handleUnitsChange}
                  focusedStop={focusedStop}
                  onSelectStop={setFocusedStop}
                  onClose={() => setIsRightDockOpen(false)}
                />
              )}
            </div>
          </aside>
        )}


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
            isLeftDockOpen={isLeftDockOpen}
            isRightDockOpen={isRightDockOpen}
            theme={theme}
            isAttributionOpen={isAttributionOpen}
            onToggleAttribution={(isOpen) =>
              setIsAttributionOpen(typeof isOpen === 'boolean' ? isOpen : !isAttributionOpen)
            }
            isRailOpen={isSidebarOpen}
            isRailPinned={isSidebarPinned}
            onCloseRail={() => setIsSidebarOpen(false)}
            units={units}
            focusedStop={focusedStop}
            onSelectStop={setFocusedStop}
          />


          {/* Hero Banner Modal/Overlay (dismissable) */}
          {showHero && (
            <Hero
              onPlanTripClick={() => {
                setShowHero(false);
                setIsLeftDockOpen(true);
                setLeftDockTab('params');
              }}
              onClose={() => setShowHero(false)}
              isVisible={showHero}
            />
          )}
        </main>
      </div>
    </div>
  );
}
