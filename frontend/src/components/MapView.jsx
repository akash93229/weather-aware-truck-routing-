import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Map, { Source, Layer, Popup, NavigationControl, Marker } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import RiskLegend from './RiskLegend';
import ForecastSlider from './ForecastSlider';
import { Icon } from '../ui/icons';
import { getTimezoneForCoordinate } from '../utils/time';
import {
  convertTemp,
  formatTemp,
  formatSpeed,
  formatPrecip,
  getWeatherIconName,
} from '../utils/driverBriefHelpers';

// Ensure MapLibre Web Worker loads properly under Vite bundler and dev server
if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreglWorkerUrl);
}

// Zero API Key Vector & Raster Styles
const OPENFREEMAP_BRIGHT_STYLE = 'https://tiles.openfreemap.org/styles/bright';

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
    'esri-places': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
    'esri-roads': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'satellite-tiles',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'satellite-roads',
      type: 'raster',
      source: 'esri-roads',
      minzoom: 4,
      maxzoom: 19,
    },
    {
      id: 'satellite-labels',
      type: 'raster',
      source: 'esri-places',
      minzoom: 1.2,
      maxzoom: 19,
    },
  ],
};

const STANDARD_DARK_STYLE = {
  version: 8,
  sources: {
    'esri-dark-gray-base': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    'esri-dark-gray-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: 'esri-dark-base-tiles',
      type: 'raster',
      source: 'esri-dark-gray-base',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'esri-dark-reference-tiles',
      type: 'raster',
      source: 'esri-dark-gray-labels',
      minzoom: 1.2,
      maxzoom: 19,
    },
  ],
};

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

function getMapPadding(isLeftOpen, isRightOpen) {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const height = typeof window !== 'undefined' ? window.innerHeight : 900;

  if (width < 860) {
    const bottomSheetHeight = Math.min(Math.round(height * 0.45), 360);
    return {
      top: 24,
      bottom: bottomSheetHeight + 20,
      left: 16,
      right: 16,
    };
  }

  return {
    top: 32,
    bottom: 32,
    left: isLeftOpen ? 400 : 32,
    right: isRightOpen ? 420 : 32,
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
  is3D = false,
  onToggle3D,
  isLeftDockOpen = true,
  isRightDockOpen = false,
  theme = 'dark',
  isAttributionOpen = false,
  onToggleAttribution,
  isRailOpen = false,
  isRailPinned = false,
  onCloseRail,
  units = 'imperial',
  focusedStop = null,
  onSelectStop,
  departureTime = null,
  originLocation = null,
}) {

  const mapRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [cursor, setCursor] = useState('auto');
  const [activePopup, setActivePopup] = useState(null);
  const [internalAttributionOpen, setInternalAttributionOpen] = useState(false);

  // Selected route object and key stops for timeline and interactive markers
  const selectedRouteObj = useMemo(() => {
    if (!routes || routes.length === 0) return null;
    return routes.find((r) => r.id === selectedRouteId) || routes[0];
  }, [routes, selectedRouteId]);

  const keyStops = useMemo(() => {
    if (!selectedRouteObj || !Array.isArray(selectedRouteObj.checkpoints)) return [];
    return selectedRouteObj.checkpoints.filter((cp) => cp.is_key_stop);
  }, [selectedRouteObj]);

  const originTz = useMemo(() => {
    const origin = originLocation || selectedRouteObj?.checkpoints?.[0];
    const lat = origin?.lat ?? origin?.coordinate?.[0];
    const lng = origin?.lng ?? origin?.lon ?? origin?.coordinate?.[1];
    const label = origin?.label || origin?.display_name || origin?.name || '';
    return getTimezoneForCoordinate(lat, lng, label);
  }, [originLocation, selectedRouteObj]);

  const effectiveStartTimeIso = departureTime || selectedRouteObj?.checkpoints?.[0]?.eta || heatmapData?.start_time;

  // Fly to focused stop when selected from timeline
  useEffect(() => {
    if (focusedStop && mapRef.current) {
      mapRef.current.flyTo({
        center: [focusedStop.lng, focusedStop.lat],
        zoom: Math.max(mapRef.current.getZoom() || 6, 8.5),
        essential: true,
        duration: 1200,
      });
      setActivePopup({
        lng: focusedStop.lng,
        lat: focusedStop.lat,
        properties: {
          mile: focusedStop.mile,
          risk_level: focusedStop.risk?.level ?? 0,
          risk_label: focusedStop.risk?.label || 'Low',
          eta: focusedStop.eta,
          name: focusedStop.name,
          wind_mph: focusedStop.weather?.wind_mph ?? null,
          gust_mph: focusedStop.weather?.gust_mph ?? null,
          rain_in_hr: focusedStop.weather?.rain_in_hr ?? null,
          snow_in_hr: focusedStop.weather?.snow_in_hr ?? null,
          temp_f: focusedStop.weather?.temp_f ?? null,
          humidity_pct: focusedStop.weather?.humidity_pct ?? null,
          condition: focusedStop.weather?.condition ?? null,
          advisory: focusedStop.advisory,
          drivers: Array.isArray(focusedStop.risk?.drivers)
            ? focusedStop.risk.drivers.join(', ')
            : focusedStop.risk?.drivers || '',
          load_rule: focusedStop.risk?.load_rule,
        },
      });
    }
  }, [focusedStop]);

  // Map style mode: 'satellite' | 'standard'
  const [mapStyleKey, setMapStyleKey] = useState(() => {
    try {
      const saved = sessionStorage.getItem('stormlane-map-style');
      return saved === 'standard' ? 'standard' : 'satellite';
    } catch {
      return 'satellite';
    }
  });

  const effectiveAttributionOpen = onToggleAttribution ? isAttributionOpen : internalAttributionOpen;
  const setAttribution = onToggleAttribution || setInternalAttributionOpen;

  const handleSelectMapStyle = (styleKey) => {
    setMapStyleKey(styleKey);
    try {
      sessionStorage.setItem('stormlane-map-style', styleKey);
    } catch {}
  };

  // Determine active MapLibre style JSON
  const currentMapStyle = useMemo(() => {
    if (mapStyleKey === 'satellite') {
      return SATELLITE_STYLE;
    }
    return theme === 'light' ? OPENFREEMAP_BRIGHT_STYLE : STANDARD_DARK_STYLE;
  }, [mapStyleKey, theme]);

  // Mutable features array reference for zero-re-render slider updates
  const heatmapFeaturesRef = useRef([]);
  const rafIdRef = useRef(null);

  // Fit bounds on ALL 3 routes with padding for panels and bottom bar
  const fitRoutesToBounds = useCallback(() => {
    if (!routes || routes.length === 0 || !mapRef.current) return;

    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    let pointCount = 0;

    routes.forEach((r) => {
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
    const padding = getMapPadding(isLeftDockOpen, isRightDockOpen);

    try {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
      if (map && map.fitBounds) {
        map.fitBounds(bounds, {
          padding,
          pitch: is3D ? 50 : 0,
          duration: 1400,
          maxZoom: 11,
        });
      }
    } catch (err) {
      console.warn('fitBounds error:', err);
    }
  }, [routes, is3D, isLeftDockOpen, isRightDockOpen]);

  // Trigger fit bounds on routes change, 3D toggle, or map load
  useEffect(() => {
    const timer = setTimeout(() => {
      fitRoutesToBounds();
    }, 150);
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

  // Handle container resizing to ensure canvas matches exactly and centers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map) return;

    const container = map.getContainer ? map.getContainer() : null;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, [isMapLoaded]);

  // Trigger map.resize() on dock transitions
  useEffect(() => {
    const timer = setTimeout(() => {
      const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
      map?.resize();
    }, 240);
    return () => clearTimeout(timer);
  }, [isLeftDockOpen, isRightDockOpen]);

  // Idle Globe Rotation before any routes are loaded
  useEffect(() => {
    if (routes && routes.length > 0) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let animId;
    let stopped = false;
    const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!map) return;

    const stopRotation = () => {
      stopped = true;
      cancelAnimationFrame(animId);
    };

    map.on('mousedown', stopRotation);
    map.on('dragstart', stopRotation);
    map.on('wheel', stopRotation);
    map.on('touchstart', stopRotation);

    let lastTime = performance.now();
    const spinGlobe = (now) => {
      if (stopped || !mapRef.current) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      try {
        const center = map.getCenter();
        map.setCenter([center.lng - (3 * dt), 38]);
      } catch {}
      animId = requestAnimationFrame(spinGlobe);
    };

    animId = requestAnimationFrame(spinGlobe);

    return () => {
      cancelAnimationFrame(animId);
      if (map) {
        map.off('mousedown', stopRotation);
        map.off('dragstart', stopRotation);
        map.off('wheel', stopRotation);
        map.off('touchstart', stopRotation);
      }
    };
  }, [routes, isMapLoaded]);

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
          weight: lvl === 0 ? 0 : lvl / 4.0,
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
        f.properties.weight = lvl === 0 ? 0 : lvl / 4.0;
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
            line_opacity: isSelected ? 1.0 : (selectedRouteId ? 0.45 : 0.85),
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
          wind_mph: cp.weather ? cp.weather.wind_mph : null,
          gust_mph: cp.weather ? cp.weather.gust_mph : null,
          rain_in_hr: cp.weather ? cp.weather.rain_in_hr : null,
          snow_in_hr: cp.weather ? cp.weather.snow_in_hr : null,
          temp_f: cp.weather ? cp.weather.temp_f : null,
          humidity_pct: cp.weather ? cp.weather.humidity_pct : null,
          condition: cp.weather ? cp.weather.condition : null,
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
      <div className="map-wrapper" id="map-container">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          cursor={cursor}
          projection="globe"
          renderWorldCopies={false}
          minZoom={1.2}
          maxPitch={70}
          initialViewState={{
            longitude: -98,
            latitude: 38,
            zoom: 1.9,
            pitch: is3D ? 50 : 0,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={currentMapStyle}
          interactiveLayerIds={['routes-layer', 'checkpoints-layer']}
          onClick={handleMapClick}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          attributionControl={false}
          onLoad={() => setIsMapLoaded(true)}
        >
          {/* Corridor Heatmap Layer */}
          {initialHeatmapGeoJson && (
            <Source id="heatmap-source" type="geojson" data={initialHeatmapGeoJson}>
              <Layer
                id="heatmap-glow-layer"
                type="heatmap"
                beforeId={routes && routes.length > 0 ? 'routes-casing-layer' : undefined}
                paint={{
                  'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['get', 'level'],
                    0, 0.0,
                    1, 0.25,
                    2, 0.5,
                    3, 0.75,
                    4, 1.0,
                  ],
                  'heatmap-intensity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 0.6,
                    4, 1.2,
                    7, 2.0,
                    10, 3.2,
                  ],
                  'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(0, 0, 0, 0)',
                    0.2, 'rgba(250, 204, 21, 0.45)',
                    0.4, '#eab308',
                    0.7, '#f97316',
                    1.0, '#ef4444',
                  ],
                  'heatmap-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 30,
                    4, 55,
                    7, 95,
                    10, 150,
                  ],
                  'heatmap-opacity': showHeatmap ? 0.65 : 0,
                }}
              />
            </Source>
          )}

          {/* Routes Lines Layer with Casing for High Contrast on Satellite */}
          {routesGeoJson && routesGeoJson.features.length > 0 && (
            <Source id="routes-source" type="geojson" data={routesGeoJson}>
              {/* Dark casing under route lines */}
              <Layer
                id="routes-casing-layer"
                type="line"
                paint={{
                  'line-color': '#000000',
                  'line-width': ['+', ['get', 'line_width'], 3],
                  'line-opacity': 0.6,
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
              {/* Outer recommended route glow */}
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
              {/* Primary route line */}
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
                  'circle-radius': [
                    'match',
                    ['get', 'risk_level'],
                    0, 3.5,
                    1, 5.0,
                    2, 7.0,
                    3, 7.0,
                    4, 7.0,
                    4.0,
                  ],
                  'circle-opacity': [
                    'match',
                    ['get', 'risk_level'],
                    0, 0.4,
                    1, 0.85,
                    1.0,
                  ],
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
                  'circle-stroke-width': [
                    'match',
                    ['get', 'risk_level'],
                    0, 0.5,
                    1, 1.2,
                    2, 1.8,
                    3, 2.0,
                    4, 2.0,
                    1.0,
                  ],
                  'circle-stroke-color': [
                    'match',
                    ['get', 'risk_level'],
                    0, 'rgba(15, 23, 42, 0.4)',
                    1, '#0f172a',
                    2, '#ffffff',
                    3, '#ffffff',
                    4, '#ffffff',
                    '#ffffff',
                  ],
                  'circle-stroke-opacity': [
                    'match',
                    ['get', 'risk_level'],
                    0, 0.4,
                    1.0,
                  ],
                }}
              />
            </Source>
          )}

          {/* Key Stop Round Badges with Weather Icon + Temp + Risk Ring */}
          {keyStops.map((stop, idx) => {
            const isFocused = focusedStop?.mile === stop.mile;
            const rLvl = stop.risk?.level ?? 0;
            const ringColor = (getRiskBadgeColor(rLvl) || {}).border || '#10b981';
            const iconName = getWeatherIconName(stop.weather?.weather_code);
            const tempVal = convertTemp(stop.weather?.temp_f ?? 65, units);

            return (
              <Marker
                key={`key-stop-marker-${stop.mile}-${idx}`}
                longitude={stop.lng}
                latitude={stop.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent?.stopPropagation();
                  onSelectStop && onSelectStop(stop);
                  setActivePopup({
                    lng: stop.lng,
                    lat: stop.lat,
                    properties: {
                      mile: stop.mile,
                      risk_level: rLvl,
                      risk_label: stop.risk?.label || 'Low',
                      eta: stop.eta,
                      name: stop.name,
                      wind_mph: stop.weather?.wind_mph ?? 0,
                      gust_mph: stop.weather?.gust_mph ?? 0,
                      rain_in_hr: stop.weather?.rain_in_hr ?? 0,
                      snow_in_hr: stop.weather?.snow_in_hr ?? 0,
                      temp_f: stop.weather?.temp_f ?? 65,
                      advisory: stop.advisory,
                      drivers: Array.isArray(stop.risk?.drivers)
                        ? stop.risk.drivers.join(', ')
                        : stop.risk?.drivers || '',
                      load_rule: stop.risk?.load_rule,
                    },
                  });
                }}
              >
                <div
                  className={`key-stop-badge ${isFocused ? 'focused' : ''}`}
                  style={{ borderColor: ringColor }}
                  title={`${stop.name || `Mile ${stop.mile}`}: ${tempVal}°, ${stop.risk?.label || 'Low'} Risk`}
                >
                  <span className="key-stop-icon">
                    <Icon name={iconName} size={13} />
                  </span>
                  <span className="key-stop-temp">{tempVal}°</span>
                </div>
              </Marker>
            );
          })}

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
                  <span className="popup-title">
                    {activePopup.properties.name
                      ? `${activePopup.properties.name} (${formatDistance(Number(activePopup.properties.mile), units)})`
                      : `Mile ${formatDistance(Number(activePopup.properties.mile), units)}`}
                  </span>
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
                  <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--text)' }}>
                    • {activePopup.properties.temp_f != null ? formatTemp(activePopup.properties.temp_f, units) : 'N/A'}
                    {activePopup.properties.condition ? ` (${activePopup.properties.condition})` : ''}
                  </span>
                </div>

                {activePopup.properties.advisory && (
                  <div className="popup-advisory-box">
                    <span className="advisory-icon"><Icon name="info" size={13} /></span>
                    <span className="advisory-text">{activePopup.properties.advisory}</span>
                  </div>
                )}

                <div className="popup-grid">
                  <div className="popup-stat">
                    <span className="popup-stat-label">Sustained Wind</span>
                    <span className="popup-stat-value">{activePopup.properties.wind_mph != null ? formatSpeed(Number(activePopup.properties.wind_mph), units) : 'N/A'}</span>
                  </div>
                  <div className="popup-stat">
                    <span className="popup-stat-label">Wind Gusts</span>
                    <span className="popup-stat-value">{activePopup.properties.gust_mph != null ? formatSpeed(Number(activePopup.properties.gust_mph), units) : 'N/A'}</span>
                  </div>
                  <div className="popup-stat">
                    <span className="popup-stat-label">Precip Rate</span>
                    <span className="popup-stat-value">{activePopup.properties.rain_in_hr != null ? `${formatPrecip(Number(activePopup.properties.rain_in_hr), units)}/hr` : 'N/A'}</span>
                  </div>
                  <div className="popup-stat">
                    <span className="popup-stat-label">Humidity</span>
                    <span className="popup-stat-value">{activePopup.properties.humidity_pct != null ? `${activePopup.properties.humidity_pct}%` : 'N/A'}</span>
                  </div>
                </div>

                {activePopup.properties.drivers && (
                  <div className="popup-drivers">
                    <span className="popup-meta-label">Primary Driver(s):</span>{' '}
                    <span className="popup-drivers-text">{activePopup.properties.drivers}</span>
                  </div>
                )}

                {activePopup.properties.load_rule && (
                  <div className="popup-load-rule">
                    <span className="load-rule-icon"><Icon name="alert-triangle" size={13} /></span>
                    <span>{activePopup.properties.load_rule}</span>
                  </div>
                )}
              </div>
            </Popup>
          )}
        </Map>

        {/* Step 3: Isolated Scrim over map canvas only (map < scrim < legend/controls/docks < rail) */}
        {isRailOpen && !isRailPinned && (
          <div
            className="map-canvas-scrim"
            id="map-canvas-scrim"
            onClick={onCloseRail}
            aria-label="Close navigation"
          />
        )}

        {/* Bottom-Left Legend: Routes + Risk Scale */}

        <RiskLegend isLeftPanelOpen={isLeftDockOpen} />

        {/* Bottom-Center Corridor Weather Heatmap Floating Pill */}
        <ForecastSlider
          startTimeIso={effectiveStartTimeIso}
          originTimezone={originTz}
          hoursCount={heatmapData?.hours_count || 49}
          onHourChange={handleHourChange}
          showHeatmap={showHeatmap}
          onToggleHeatmap={onToggleHeatmap}
          isLoadingHeatmap={isLoadingHeatmap}
          heatmapError={heatmapError}
          onRetryHeatmap={onRetryHeatmap}
          isLeftCollapsed={!isLeftDockOpen}
          isRightCollapsed={!isRightDockOpen}
          isLeftDockOpen={isLeftDockOpen}
          isRightDockOpen={isRightDockOpen}
        />

        {/* Bottom-Right Single Clean Stack (Map Style + 3D + Zoom + Info) */}
        <div className={`map-bottom-right-dock ${isRightDockOpen ? 'offset-right-dock-open' : ''}`} id="map-bottom-right-dock">
          {/* Glass Attribution Popover */}
          {effectiveAttributionOpen && (
            <div className="map-attribution-popover" id="map-attribution-popover" role="dialog" aria-label="Map Data Attribution">
              <div className="attribution-popover-header">
                <span className="popover-title">Map &amp; Weather Data</span>
                <button
                  type="button"
                  className="icon-btn btn-popover-close"
                  onClick={() => setAttribution(false)}
                  aria-label="Close attribution"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="attribution-popover-body">
                <div className="attrib-item">
                  <span className="attrib-label">Satellite Imagery:</span>{' '}
                  <span>Esri, Maxar, Earthstar Geographics</span>
                </div>
                <div className="attrib-item">
                  <span className="attrib-label">Base Map &amp; Layers:</span>{' '}
                  <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>
                  <span className="sep">•</span>
                  <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a>
                  <span className="sep">•</span>
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
                  <span className="sep">•</span>
                  <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri Reference</a>
                </div>
                <div className="attrib-item">
                  <span className="attrib-label">Weather:</span>{' '}
                  <a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a>
                </div>
                <div className="attrib-item">
                  <span className="attrib-label">Commercial Routing:</span>{' '}
                  <a href="https://developer.tomtom.com" target="_blank" rel="noreferrer">TomTom</a>
                </div>
              </div>
            </div>
          )}

          {/* Map Style Segmented Control */}
          <div className="map-style-dock-selector" id="map-style-dock-selector" role="group" aria-label="Map Style Selection">
            <button
              type="button"
              className={`map-style-chip ${mapStyleKey === 'satellite' ? 'active' : ''}`}
              onClick={() => handleSelectMapStyle('satellite')}
              title="Satellite Real Imagery"
              aria-label="Satellite Style"
            >
              Satellite
            </button>
            <button
              type="button"
              className={`map-style-chip ${mapStyleKey === 'standard' ? 'active' : ''}`}
              onClick={() => handleSelectMapStyle('standard')}
              title={theme === 'light' ? 'OpenFreeMap Bright Vector Style' : 'Esri Dark Gray Canvas Style'}
              aria-label="Standard Vector Style"
            >
              Standard
            </button>
          </div>

          {/* 2D / 3D Perspective Toggle Button */}
          <button
            type="button"
            className={`map-action-btn ${is3D ? 'active' : ''}`}
            onClick={onToggle3D}
            id="toggle-3d-btn"
            title={is3D ? 'Switch to 2D Top-Down View' : 'Switch to 3D Angled Perspective'}
            aria-label={is3D ? 'Switch to 2D View' : 'Switch to 3D View'}
          >
            <span className="dimension-tag">{is3D ? '3D' : '2D'}</span>
          </button>

          {/* Zoom In, Zoom Out, Reset Compass group */}
          <div className="maplibregl-ctrl-custom-group">
            <button
              type="button"
              className="map-nav-btn"
              onClick={() => {
                const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
                map?.zoomIn?.();
              }}
              title="Zoom in"
              aria-label="Zoom in"
              id="map-zoom-in-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              className="map-nav-btn"
              onClick={() => {
                const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
                map?.zoomOut?.();
              }}
              title="Zoom out"
              aria-label="Zoom out"
              id="map-zoom-out-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              className="map-nav-btn"
              onClick={() => {
                const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
                map?.resetNorthPitch?.();
              }}
              title="Reset bearing to North"
              aria-label="Reset North"
              id="map-reset-north-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 19 21 12 17 5 21 12 2" fill="rgba(56, 189, 248, 0.3)" />
              </svg>
            </button>
          </div>

          {/* Info & Attribution Button */}
          <button
            type="button"
            className={`map-action-btn ${effectiveAttributionOpen ? 'active' : ''}`}
            onClick={() => setAttribution(!effectiveAttributionOpen)}
            id="map-info-btn"
            title="Map Info & Credits"
            aria-label="Map Information and Credits"
            aria-expanded={effectiveAttributionOpen}
          >
            <span className="info-icon" aria-hidden="true">i</span>
          </button>
        </div>
      </div>
    </div>
  );
}
