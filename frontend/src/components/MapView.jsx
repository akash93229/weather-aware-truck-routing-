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
}) {
  const mapRef = useRef(null);
  const [cursor, setCursor] = useState('auto');
  const [activePopup, setActivePopup] = useState(null);

  // Mutable features array reference for zero-re-render slider updates
  const heatmapFeaturesRef = useRef([]);
  const rafIdRef = useRef(null);

  // Fit bounds when routes change
  useEffect(() => {
    if (!routes || routes.length === 0 || !mapRef.current) return;

    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    let pointCount = 0;

    routes.forEach((r) => {
      if (r.geometry && r.geometry.length) {
        r.geometry.forEach(([lng, lat]) => {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          pointCount++;
        });
      }
    });

    if (pointCount > 0 && mapRef.current) {
      try {
        mapRef.current.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 50, duration: 800 }
        );
      } catch {
        // Map may still be loading tiles
      }
    }
  }, [routes]);

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
        >
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

          {/* Routes Lines Layer */}
          {routesGeoJson && routesGeoJson.features.length > 0 && (
            <Source id="routes-source" type="geojson" data={routesGeoJson}>
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
                    <span className="load-rule-icon">&#9888;</span>
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
