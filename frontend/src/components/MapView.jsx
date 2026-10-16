import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import RiskLegend from './RiskLegend';
import ForecastSlider from './ForecastSlider';

// Ensure MapLibre Web Worker loads properly under Vite bundler and dev server
if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreglWorkerUrl);
}

const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Distinct colors for routes
const ROUTE_PALETTES = [
  { stroke: '#38bdf8', glow: 'rgba(56, 189, 248, 0.35)' }, // Sky blue
  { stroke: '#a855f7', glow: 'rgba(168, 85, 247, 0.35)' }, // Purple
  { stroke: '#f97316', glow: 'rgba(249, 115, 22, 0.35)' },  // Warm orange
];

function formatEta(isoStr) {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const tzPart = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return `${datePart}, ${timePart} (${tzPart})`;
  } catch {
    return isoStr;
  }
}

function getRiskBadgeColor(level) {
  switch (level) {
    case 0: return { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399', border: '#10b981' };
    case 1: return { bg: 'rgba(14, 165, 233, 0.2)', text: '#38bdf8', border: '#0ea5e9' };
    case 2: return { bg: 'rgba(234, 179, 8, 0.2)', text: '#fde047', border: '#eab308' };
    case 3: return { bg: 'rgba(249, 115, 22, 0.2)', text: '#fb923c', border: '#f97316' };
    case 4: return { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171', border: '#ef4444' };
    default: return { bg: '#334155', text: '#cbd5e1', border: '#64748b' };
  }
}

function getMapPadding() {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const height = typeof window !== 'undefined' ? window.innerHeight : 900;

  // Phone (< 768px): bottom sheet covers bottom portion of screen
  if (width < 768) {
    const bottomSheetHeight = Math.min(Math.round(height * 0.45), 360);
    return {
      top: 60,
      bottom: bottomSheetHeight + 20,
      left: 20,
      right: 20,
    };
  }

  // Tablet (768px - 1024px): left panel ~300px, right panel ~320px
  if (width <= 1024) {
    return {
      top: 70,
      bottom: 100,
      left: 310,
      right: 330,
    };
  }

  // Small desktop (1024px - 1366px): left panel 350px, right panel 380px
  if (width <= 1366) {
    return {
      top: 75,
      bottom: 110,
      left: 370,
      right: 400,
    };
  }

  // Desktop (1440px):
  if (width <= 1600) {
    return {
      top: 80,
      bottom: 120,
      left: 380,
      right: 420,
    };
  }

  // Large desktop (1920px+):
  return {
    top: 90,
    bottom: 130,
    left: 420,
    right: 450,
  };
}

export default function MapView({
  routes = [],
  selectedRouteId,
  onSelectRoute,
  heatmapData = null,
  showHeatmap = true,
  onToggleHeatmap,
  isLoadingHeatmap = false,
  heatmapError = null,
  onRetryHeatmap,
  is3D = true,
  onToggle3D,
}) {
  const mapRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [cursor, setCursor] = useState('auto');
  const [activePopup, setActivePopup] = useState(null);

  // Mutable features array reference for zero-re-render slider updates
  const heatmapFeaturesRef = useRef([]);
  const rafIdRef = useRef(null);

  // Fit bounds on ALL 3 routes with padding for panels and bottom bar
  const fitRoutesToBounds = useCallback(() => {
    if (!routes || routes.length === 0 || !mapRef.current) return;

    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    let pointCount = 0;

    routes.forEach((r) => {
      // Coordinates can be directly in r.geometry (array of [lng, lat]) or r.geometry.coordinates
      const coords = Array.isArray(r.geometry)
        ? r.geometry
        : (r.geometry && Array.isArray(r.geometry.coordinates) ? r.geometry.coordinates : []);

      coords.forEach((coord) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          const [lng, lat] = coord;
          if (typeof lng === 'number' && typeof lat === 'number') {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            pointCount++;
          }
        }
      });

      // Also incorporate checkpoints if any
      if (r.checkpoints && Array.isArray(r.checkpoints)) {
        r.checkpoints.forEach((cp) => {
          if (typeof cp.lng === 'number' && typeof cp.lat === 'number') {
            if (cp.lng < minLng) minLng = cp.lng;
            if (cp.lng > maxLng) maxLng = cp.lng;
            if (cp.lat < minLat) minLat = cp.lat;
            if (cp.lat > maxLat) maxLat = cp.lat;
            pointCount++;
          }
        });
      }
    });

    if (pointCount === 0) return;

    const bounds = [[minLng, minLat], [maxLng, maxLat]];
    const padding = getMapPadding();

    try {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
      if (map && map.fitBounds) {
        map.fitBounds(bounds, {
          padding,
          pitch: is3D ? 45 : 0,
          duration: 1200,
          maxZoom: 11,
        });
      }
    } catch (err) {
      console.warn('fitBounds error:', err);
    }
  }, [routes, is3D]);

  // Trigger fit bounds on routes change, 3D toggle, or map load
  useEffect(() => {
    const timer = setTimeout(() => {
      fitRoutesToBounds();
    }, 120);
    return () => clearTimeout(timer);
  }, [fitRoutesToBounds, isMapLoaded]);

  // Smooth pitch transition when toggling 2D/3D mode
  useEffect(() => {
    if (!mapRef.current) return;
    try {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
      if (map && map.easeTo) {
        map.easeTo({ pitch: is3D ? 50 : 0, duration: 800 });
      }
    } catch {
      // ignore
    }
  }, [is3D]);

  // Build initial GeoJSON representation when heatmapData changes
  const initialHeatmapGeoJson = useMemo(() => {
    if (!heatmapData || !heatmapData.points || heatmapData.points.length === 0) {
      return null;
    }

    const feats = heatmapData.points.map((p, idx) => {
      const lvl = p.levels?.[0] ?? 0;
      return {
        type: 'Feature',
        id: idx,
        geometry: {
          type: 'Point',
          coordinates: [p.lng, p.lat],
        },
        properties: {
          id: idx,
          levels: p.levels,
          level: lvl,
          weight: lvl / 4.0,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features: feats,
    };
  }, [heatmapData]);

  // Synchronize heatmapFeaturesRef and update MapLibre source
  useEffect(() => {
    heatmapFeaturesRef.current = initialHeatmapGeoJson ? initialHeatmapGeoJson.features : [];
    if (initialHeatmapGeoJson && mapRef.current) {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
      if (map && map.getSource) {
        const source = map.getSource('heatmap-source');
        if (source) {
          source.setData(initialHeatmapGeoJson);
        }
      }
    }
  }, [initialHeatmapGeoJson]);

  // Throttled slider callback: updates source.setData via requestAnimationFrame with NO React re-render
  const handleHourChange = useCallback((hour) => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      if (!heatmapFeaturesRef.current || heatmapFeaturesRef.current.length === 0) return;
      const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
      if (!map || !map.getSource) return;
      const source = map.getSource('heatmap-source');
      if (!source) return;

      const feats = heatmapFeaturesRef.current;
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const lvl = f.properties.levels?.[hour] ?? 0;
        f.properties.level = lvl;
        f.properties.weight = lvl / 4.0;
      }

      source.setData({
        type: 'FeatureCollection',
        features: feats,
      });
    });
  }, []);

  // Build GeoJSON for all 3 routes
  const routesGeoJson = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: routes.map((r, idx) => {
        const isSelected = r.id === selectedRouteId;
        const palette = ROUTE_PALETTES[idx % ROUTE_PALETTES.length];
        return {
          type: 'Feature',
          id: r.id,
          properties: {
            route_id: r.id,
            label: r.label,
            is_selected: isSelected,
            is_recommended: Boolean(r.recommended),
            color: palette.stroke,
            line_width: isSelected ? 6.5 : (r.recommended ? 4.5 : 3.5),
            line_opacity: isSelected ? 1.0 : (selectedRouteId ? 0.35 : 0.8),
          },
          geometry: {
            type: 'LineString',
            coordinates: r.geometry || [],
          },
        };
      }),
    };
  }, [routes, selectedRouteId]);

  // Checkpoints for the active/selected route
  const checkpointsGeoJson = useMemo(() => {
    const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
    if (!activeRoute || !activeRoute.checkpoints) return null;

    return {
      type: 'FeatureCollection',
      features: activeRoute.checkpoints.map((cp, idx) => ({
        type: 'Feature',
        id: idx,
        geometry: {
          type: 'Point',
          coordinates: [cp.lng, cp.lat],
        },
        properties: {
          id: idx,
          mile: cp.mile,
          lat: cp.lat,
          lng: cp.lng,
          eta: cp.eta,
          risk_level: cp.risk ? cp.risk.level : 0,
          risk_label: cp.risk ? cp.risk.label : 'Low',
          drivers: cp.risk && cp.risk.drivers && cp.risk.drivers.length ? cp.risk.drivers.join(', ') : 'None',
          load_rule: cp.risk && cp.risk.load_rule ? cp.risk.load_rule : '',
          wind_mph: cp.weather ? cp.weather.wind_mph : 0,
          gust_mph: cp.weather ? cp.weather.gust_mph : 0,
          rain_in_hr: cp.weather ? cp.weather.rain_in_hr : 0,
          snow_in_hr: cp.weather ? cp.weather.snow_in_hr : 0,
        },
      })),
    };
  }, [routes, selectedRouteId]);

  // Interactive click handler
  const handleMapClick = useCallback((e) => {
    if (!e.features || e.features.length === 0) {
      setActivePopup(null);
      return;
    }

    const checkpointFeature = e.features.find((f) => f.layer.id === 'checkpoints-layer');
    if (checkpointFeature) {
      const coords = checkpointFeature.geometry.coordinates;
      setActivePopup({
        lng: coords[0],
        lat: coords[1],
        properties: checkpointFeature.properties,
      });
      return;
    }

    const routeFeature = e.features.find((f) => f.layer.id === 'routes-layer');
    if (routeFeature && onSelectRoute) {
      onSelectRoute(routeFeature.properties.route_id);
      setActivePopup(null);
    }
  }, [onSelectRoute]);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor('auto'), []);

  return (
    <div className="map-view-container">
      {/* 0-48h Forecast Slider & Heatmap Controls */}
      <ForecastSlider
        startTimeIso={heatmapData?.start_time}
        hoursCount={heatmapData?.hours || 49}
        onHourChange={handleHourChange}
        showHeatmap={showHeatmap}
        onToggleHeatmap={onToggleHeatmap}
        isLoadingHeatmap={isLoadingHeatmap}
        heatmapError={heatmapError}
        onRetryHeatmap={onRetryHeatmap}
      />

      <div className="map-wrapper" id="map-container">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          cursor={cursor}
          initialViewState={{
            longitude: -95.7129,
            latitude: 37.0902,
            zoom: 3.8,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={CARTO_DARK_STYLE}
          interactiveLayerIds={['routes-layer', 'checkpoints-layer']}
          onClick={handleMapClick}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          attributionControl={false}
          onLoad={() => setIsMapLoaded(true)}
        >
          <div className="map-custom-controls">
            <button
              type="button"
              className={`btn-map-3d ${is3D ? 'active' : ''}`}
              onClick={onToggle3D}
              id="toggle-3d-btn"
              title={is3D ? 'Switch to 2D Top-Down View' : 'Switch to 3D Angled Perspective'}
            >
              <span className="dimension-tag">{is3D ? '3D' : '2D'}</span>
            </button>
          </div>
          <NavigationControl position="top-right" />

          {/* Corridor Heatmap Layer (Weight = level / 4) */}
          {initialHeatmapGeoJson && (
            <Source id="heatmap-source" type="geojson" data={initialHeatmapGeoJson}>
              <Layer
                id="heatmap-glow-layer"
                type="heatmap"
                paint={{
                  'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['get', 'level'],
                    0, 0.05,
                    1, 0.25,
                    2, 0.5,
                    3, 0.75,
                    4, 1.0,
                  ],
                  'heatmap-intensity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 1,
                    6, 2.5,
                    9, 4,
                  ],
                  'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(0, 0, 0, 0)',
                    0.2, '#10b981', // Low: Emerald
                    0.4, '#0ea5e9', // Moderate: Sky blue
                    0.6, '#eab308', // High: Golden yellow
                    0.8, '#f97316', // Severe: Orange
                    1.0, '#ef4444', // No Travel: Crimson
                  ],
                  'heatmap-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 18,
                    5, 30,
                    8, 50,
                  ],
                  'heatmap-opacity': showHeatmap ? 0.8 : 0,
                }}
              />
            </Source>
          )}

          {/* Routes Lines Layer with Recommended Glow */}
          {routesGeoJson && routesGeoJson.features.length > 0 && (
            <Source id="routes-source" type="geojson" data={routesGeoJson}>
              <Layer
                id="routes-glow-layer"
                type="line"
                filter={['==', ['get', 'is_recommended'], true]}
                paint={{
                  'line-color': '#38bdf8',
                  'line-width': 14,
                  'line-blur': 6,
                  'line-opacity': 0.45,
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
              <Layer
                id="routes-layer"
                type="line"
                paint={{
                  'line-color': ['get', 'color'],
                  'line-width': ['get', 'line_width'],
                  'line-opacity': ['get', 'line_opacity'],
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
            </Source>
          )}

          {/* 3D Buildings Extrusion Layer at High Zoom (minzoom 15) */}
          <Layer
            id="3d-buildings"
            source="carto"
            source-layer="building"
            type="fill-extrusion"
            minzoom={15}
            paint={{
              'fill-extrusion-color': '#1e293b',
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15, 0,
                16, ['coalesce', ['get', 'render_height'], ['get', 'height'], 20],
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15, 0,
                16, ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
              ],
              'fill-extrusion-opacity': 0.65,
            }}
          />

          {/* Checkpoints Circle Layer */}
          {checkpointsGeoJson && checkpointsGeoJson.features.length > 0 && (
            <Source id="checkpoints-source" type="geojson" data={checkpointsGeoJson}>
              <Layer
                id="checkpoints-layer"
                type="circle"
                paint={{
                  'circle-radius': 6.5,
                  'circle-color': [
                    'match',
                    ['get', 'risk_level'],
                    0, '#10b981',
                    1, '#0ea5e9',
                    2, '#eab308',
                    3, '#f97316',
                    4, '#ef4444',
                    '#94a3b8',
                  ],
                  'circle-stroke-width': 1.5,
                  'circle-stroke-color': '#0f172a',
                }}
              />
            </Source>
          )}

          {/* Checkpoint Detail Popup */}
          {activePopup && (
            <Popup
              longitude={activePopup.lng}
              latitude={activePopup.lat}
              anchor="bottom"
              onClose={() => setActivePopup(null)}
              closeOnClick={false}
              className="checkpoint-popup"
            >
              <div className="popup-card">
                <div className="popup-header">
                  <span className="popup-title">Mile {Number(activePopup.properties.mile).toFixed(1)}</span>
                  {(() => {
                    const badge = getRiskBadgeColor(Number(activePopup.properties.risk_level));
                    return (
                      <span
                        className="popup-risk-badge"
                        style={{
                          backgroundColor: badge.bg,
                          color: badge.text,
                          borderColor: badge.border,
                        }}
                      >
                        {activePopup.properties.risk_label}
                      </span>
                    );
                  })()}
                </div>

                <div className="popup-eta">
                  <span className="popup-meta-label">ETA:</span> {formatEta(activePopup.properties.eta)}
                </div>

                <div className="popup-grid">
                  <div className="popup-stat">
                    <span className="popup-stat-label">Sustained Wind</span>
                    <span className="popup-stat-value">{Number(activePopup.properties.wind_mph).toFixed(1)} mph</span>
                  </div>
                  <div className="popup-stat">
                    <span className="popup-stat-label">Wind Gusts</span>
                    <span className="popup-stat-value">{Number(activePopup.properties.gust_mph).toFixed(1)} mph</span>
                  </div>
                  <div className="popup-stat">
                    <span className="popup-stat-label">Rain Rate</span>
                    <span className="popup-stat-value">{Number(activePopup.properties.rain_in_hr).toFixed(2)} in/hr</span>
                  </div>
                  <div className="popup-stat">
                    <span className="popup-stat-label">Snow Rate</span>
                    <span className="popup-stat-value">{Number(activePopup.properties.snow_in_hr).toFixed(2)} in/hr</span>
                  </div>
                </div>

                <div className="popup-drivers">
                  <span className="popup-meta-label">Primary Driver(s):</span>{' '}
                  <span className="popup-drivers-text">{activePopup.properties.drivers}</span>
                </div>

                {activePopup.properties.load_rule && (
                  <div className="popup-load-rule">
                    <span className="load-rule-icon">⚠</span>
                    <span>{activePopup.properties.load_rule}</span>
                  </div>
                )}
              </div>
            </Popup>
          )}
        </Map>

        <RiskLegend />
      </div>
    </div>
  );
}
