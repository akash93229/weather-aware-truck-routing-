import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getHealth, getRoute } from './api/client';
import './App.css';

// Helper component to auto-fit map view to route bounds
function RouteBoundsUpdater({ geometry }) {
  const map = useMap();

  useEffect(() => {
    if (geometry && geometry.length > 0) {
      map.fitBounds(geometry, { padding: [40, 40] });
    }
  }, [geometry, map]);

  return null;
}

// Custom leaflet div icons for Start and End points
const startPinIcon = L.divIcon({
  className: 'custom-pin pin-start',
  html: 'A',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const endPinIcon = L.divIcon({
  className: 'custom-pin pin-end',
  html: 'B',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'ok' | 'unavailable'
  const [backendError, setBackendError] = useState('');

  // Coordinate form inputs (default: Heidelberg -> Mannheim)
  const [startLat, setStartLat] = useState('49.41461');
  const [startLng, setStartLng] = useState('8.681495');
  const [endLat, setEndLat] = useState('49.487459');
  const [endLng, setEndLng] = useState('8.466039');

  // Route state
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [routeError, setRouteError] = useState('');

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

  const handleCalculateRoute = async (e) => {
    e.preventDefault();
    setRouteError('');
    setIsLoadingRoute(true);

    const sLat = parseFloat(startLat);
    const sLng = parseFloat(startLng);
    const eLat = parseFloat(endLat);
    const eLng = parseFloat(endLng);

    if (Number.isNaN(sLat) || Number.isNaN(sLng) || Number.isNaN(eLat) || Number.isNaN(eLng)) {
      setRouteError('Please enter valid numeric coordinates.');
      setIsLoadingRoute(false);
      return;
    }

    try {
      const data = await getRoute({ lat: sLat, lng: sLng }, { lat: eLat, lng: eLng });
      setRouteData(data);
    } catch (err) {
      setRouteError(err.message || 'Failed to calculate route.');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleLoadDemoRoute = () => {
    setStartLat('49.41461');
    setStartLng('8.681495');
    setEndLat('49.487459');
    setEndLng('8.466039');
    setRouteError('');
  };

  const mapCenter = routeData && routeData.geometry && routeData.geometry.length > 0
    ? routeData.geometry[0]
    : [49.45, 8.57];

  return (
    <div className="app-card">
      <header className="app-header">
        <h1 className="app-title">Weather-Aware Truck Routing</h1>
        <p className="app-subtitle">
          Phase 2: OpenRouteService HGV Truck Routing Integration
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

      <form className="route-form" onSubmit={handleCalculateRoute}>
        <div className="form-grid">
          <div className="form-group">
            <span className="group-title">Origin (Point A)</span>
            <div className="coord-row">
              <div className="coord-field">
                <label htmlFor="start-lat">Latitude</label>
                <input
                  id="start-lat"
                  type="text"
                  value={startLat}
                  onChange={(e) => setStartLat(e.target.value)}
                  placeholder="49.4146"
                  required
                />
              </div>
              <div className="coord-field">
                <label htmlFor="start-lng">Longitude</label>
                <input
                  id="start-lng"
                  type="text"
                  value={startLng}
                  onChange={(e) => setStartLng(e.target.value)}
                  placeholder="8.6815"
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <span className="group-title">Destination (Point B)</span>
            <div className="coord-row">
              <div className="coord-field">
                <label htmlFor="end-lat">Latitude</label>
                <input
                  id="end-lat"
                  type="text"
                  value={endLat}
                  onChange={(e) => setEndLat(e.target.value)}
                  placeholder="49.4875"
                  required
                />
              </div>
              <div className="coord-field">
                <label htmlFor="end-lng">Longitude</label>
                <input
                  id="end-lng"
                  type="text"
                  value={endLng}
                  onChange={(e) => setEndLng(e.target.value)}
                  placeholder="8.4660"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={isLoadingRoute || backendStatus === 'unavailable'}
            id="calculate-route-btn"
          >
            {isLoadingRoute ? 'Calculating Route...' : 'Calculate Truck Route'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleLoadDemoRoute}
            disabled={isLoadingRoute}
          >
            Load Demo Coordinates
          </button>
        </div>
      </form>

      {routeError && (
        <div className="error-banner" id="route-error-banner">
          {routeError}
        </div>
      )}

      {routeData && (
        <section className="results-strip" id="route-results-strip">
          <div className="stat-card">
            <span className="stat-label">Driving Distance</span>
            <span className="stat-value">{routeData.distance_km} km</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Estimated Travel Time</span>
            <span className="stat-value">{routeData.duration_min} min</span>
          </div>
        </section>
      )}

      <div className="map-wrapper" id="map-container">
        <MapContainer
          center={mapCenter}
          zoom={10}
          scrollWheelZoom={false}
          className="leaflet-container"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {routeData && routeData.geometry && (
            <>
              <Polyline
                positions={routeData.geometry}
                pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85 }}
              />
              <RouteBoundsUpdater geometry={routeData.geometry} />
            </>
          )}

          {parseFloat(startLat) && parseFloat(startLng) && (
            <Marker position={[parseFloat(startLat), parseFloat(startLng)]} icon={startPinIcon}>
              <Popup>Start: [{startLat}, {startLng}]</Popup>
            </Marker>
          )}

          {parseFloat(endLat) && parseFloat(endLng) && (
            <Marker position={[parseFloat(endLat), parseFloat(endLng)]} icon={endPinIcon}>
              <Popup>Destination: [{endLat}, {endLng}]</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
