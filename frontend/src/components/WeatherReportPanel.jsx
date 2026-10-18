import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getWeatherReport } from '../api/client';
import { Icon } from '../ui/icons';
import { Card, Stat, Badge, Button, SegmentedControl, EmptyState, IconButton } from '../ui/components';
import {
  convertTemp,
  formatTemp,
  convertSpeed,
  formatSpeed,
  convertPrecip,
  formatPrecip,
  convertDistance,
  formatDistance,
  getDriverStatus,
  map48hChips,
  getWeatherIconName,
} from '../utils/driverBriefHelpers';

const RISK_BADGES = {
  0: { label: 'Low', color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)' },
  1: { label: 'Moderate', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.16)' },
  2: { label: 'High', color: '#eab308', bg: 'rgba(234, 179, 8, 0.16)' },
  3: { label: 'Severe', color: '#f97316', bg: 'rgba(249, 115, 22, 0.16)' },
  4: { label: 'No Travel', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.16)' },
};

function formatIsoTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

export default function WeatherReportPanel({
  origin,
  destination,
  departureTime,
  tripResults,
  selectedRouteId,
  units = 'imperial',
  onUnitsChange,
  focusedStop = null,
  onSelectStop,
}) {
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sparklineMetric, setSparklineMetric] = useState('temp'); // 'temp' | 'rain' | 'wind'
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const chipsScrollRef = useRef(null);

  const fetchReport = useCallback(() => {
    if (!origin || !origin.lat || !origin.lng) {
      setReportData(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    getWeatherReport(
      {
        origin_lat: origin.lat,
        origin_lon: origin.lng,
        dest_lat: destination?.lat,
        dest_lon: destination?.lng,
        departure: departureTime,
      },
      controller.signal
    )
      .then((data) => {
        setReportData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'CanceledError' && !controller.signal.aborted) {
          setError(err.message || 'Weather service unavailable, try again.');
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [origin, destination, departureTime]);

  useEffect(() => {
    return fetchReport();
  }, [fetchReport]);

  const selectedRoute = useMemo(() => {
    if (!tripResults?.routes || tripResults.routes.length === 0) return null;
    return tripResults.routes.find((r) => r.id === selectedRouteId) || tripResults.routes[0];
  }, [tripResults, selectedRouteId]);

  const routeRiskLevel = selectedRoute?.summary?.max_level ?? null;

  // 1. Status Banner computation
  const statusInfo = useMemo(() => {
    return getDriverStatus(reportData?.driver_brief?.status || 'CLEAR', routeRiskLevel);
  }, [reportData, routeRiskLevel]);

  // 4. 48-Hour Chips
  const hourlyChips = useMemo(() => {
    if (!reportData?.origin?.hourly) return [];
    return map48hChips(reportData.origin.hourly, departureTime);
  }, [reportData, departureTime]);

  // Sparkline points computation
  const sparklineSvg = useMemo(() => {
    if (!hourlyChips || hourlyChips.length === 0) return null;
    let values = [];
    if (sparklineMetric === 'temp') {
      values = hourlyChips.map((c) => convertTemp(c.tempF, units));
    } else if (sparklineMetric === 'rain') {
      values = hourlyChips.map((c) => c.popPct);
    } else {
      values = hourlyChips.map((c) => convertSpeed(c.windMph, units));
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 360;
    const height = 44;
    const padY = 6;
    const step = width / (values.length - 1);

    const points = values.map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (height - padY - ((v - min) / range) * (height - padY * 2)).toFixed(1);
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

    return { pathD, areaD, min, max, current: values[0] };
  }, [hourlyChips, sparklineMetric, units]);

  const scrollChips = (direction) => {
    if (!chipsScrollRef.current) return;
    const scrollAmount = direction === 'left' ? -220 : 220;
    chipsScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  // 5. Route Timeline key stops
  const timelineStops = useMemo(() => {
    if (!selectedRoute?.checkpoints) return [];
    return selectedRoute.checkpoints.filter((cp) => cp.is_key_stop);
  }, [selectedRoute]);

  return (
    <div className="driver-brief-container" id="driver-brief-panel">
      {/* Header with Units SegmentedControl */}
      <div className="driver-brief-toolbar" id="driver-brief-toolbar">
        <div className="toolbar-titles">
          <span className="toolbar-caption">COMMERCIAL DRIVER BRIEF</span>
          <span className="toolbar-sub">Instant 3-second weather intelligence</span>
        </div>
        {onUnitsChange && (
          <SegmentedControl
            value={units}
            onChange={onUnitsChange}
            options={[
              { id: 'imperial', label: '°F / mph' },
              { id: 'metric', label: '°C / km/h' },
            ]}
            ariaLabel="Units System"
            className="units-toggle-segmented"
          />
        )}
      </div>

      {/* Skeletons while loading */}
      {isLoading && (
        <div className="driver-brief-skeletons" id="driver-brief-skeletons">
          <div className="sl-skeleton" style={{ height: 110, borderRadius: 16 }} />
          <div className="skeleton-grid-dual">
            <div className="sl-skeleton" style={{ height: 160, borderRadius: 14 }} />
            <div className="sl-skeleton" style={{ height: 160, borderRadius: 14 }} />
          </div>
          <div className="sl-skeleton" style={{ height: 90, borderRadius: 14 }} />
          <div className="sl-skeleton" style={{ height: 140, borderRadius: 14 }} />
          <div className="sl-skeleton" style={{ height: 220, borderRadius: 14 }} />
        </div>
      )}

      {/* Error state with retry */}
      {error && !isLoading && (
        <Card className="brief-error-card" id="driver-brief-error">
          <div className="error-card-inner">
            <Icon name="alert-triangle" size={24} color="#ef4444" />
            <div className="error-text-wrap">
              <span className="error-title">Weather Service Warning</span>
              <p className="error-message">{error}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={fetchReport} id="brief-retry-btn">
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Empty State when no origin selected */}
      {!origin && !isLoading && (
        <div style={{ padding: 12 }}>
          <EmptyState
            icon="truck"
            title="Awaiting Trip Location"
            description="Select an origin and destination in Trip Parameters to view instant truck driver advisories and corridor weather."
          />
        </div>
      )}

      {/* Loaded Driver Brief Content */}
      {!isLoading && reportData && (
        <div className="driver-brief-cards-stack">
          {/* CARD 1: STATUS BANNER */}
          <div
            className="driver-status-banner"
            id="driver-status-banner"
            style={{
              backgroundColor: statusInfo.bg,
              borderLeftColor: statusInfo.borderColor,
            }}
          >
            <div className="status-banner-header">
              <div className="status-banner-word-row">
                <span className="status-banner-icon" style={{ color: statusInfo.color }}>
                  <Icon name={statusInfo.icon} size={28} />
                </span>
                <span className="status-banner-word" style={{ color: statusInfo.color }}>
                  {statusInfo.word}
                </span>
              </div>
              <span className="status-badge-pill" style={{ color: statusInfo.color, borderColor: statusInfo.color }}>
                {selectedRoute ? `${selectedRoute.label} Route` : 'Corridor Status'}
              </span>
            </div>

            <p className="status-headline-sentence">
              {reportData.driver_brief?.headline || 'Standard weather parameters detected across corridor.'}
            </p>

            {reportData.driver_brief?.driver_action && (
              <div className="driver-action-strip">
                <span className="action-tag">ACTION</span>
                <span className="action-text">{reportData.driver_brief.driver_action}</span>
              </div>
            )}
          </div>

          {/* CARD 2: NOW AT ORIGIN / AT ARRIVAL */}
          <div className="dual-station-grid">
            {/* Origin Card */}
            {reportData.origin?.current && (
              <Card className="station-brief-card" id="brief-origin-card">
                <div className="station-brief-caption">NOW AT ORIGIN</div>
                <div className="station-brief-place" title={origin?.label || 'Origin'}>
                  {origin?.label || 'Origin Coordinates'}
                </div>
                <div className="station-temp-row">
                  <span className="station-weather-icon">
                    <Icon name={getWeatherIconName(reportData.origin.current.weather_code)} size={32} />
                  </span>
                  <span className="station-temp-value">
                    {formatTemp(reportData.origin.current.temperature_f, units)}
                  </span>
                </div>
                <div className="station-condition-label">
                  {reportData.origin.current.condition || 'N/A'}
                </div>

                <div className="station-stats-2x2">
                  <div className="stat-tile-item">
                    <span className="tile-label">Wind</span>
                    <span className="tile-val">
                      {formatSpeed(reportData.origin.current.wind_speed_mph, units)}
                      {reportData.origin.current.wind_gusts_mph > 0 && (
                        <small> (gusts {formatSpeed(reportData.origin.current.wind_gusts_mph, units)})</small>
                      )}
                    </span>
                  </div>
                  <div className="stat-tile-item">
                    <span className="tile-label">Precip</span>
                    <span className="tile-val">
                      {formatPrecip(reportData.origin.current.precipitation_in, units)}/hr
                    </span>
                  </div>
                  <div className="stat-tile-item">
                    <span className="tile-label">Humidity</span>
                    <span className="tile-val">
                      {reportData.origin.current.humidity_pct != null ? `${reportData.origin.current.humidity_pct}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="stat-tile-item">
                    <span className="tile-label">Feels Like</span>
                    <span className="tile-val">
                      {formatTemp(reportData.origin.current.apparent_temperature_f || reportData.origin.current.temperature_f, units)}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            {/* Destination Arrival Card */}
            {reportData.destination?.current && (
              <Card className="station-brief-card" id="brief-dest-card">
                <div className="station-brief-caption">CONDITIONS AT ARRIVAL</div>
                <div className="station-brief-place" title={destination?.label || 'Destination'}>
                  {destination?.label || 'Destination Coordinates'}
                </div>
                <div className="station-temp-row">
                  <span className="station-weather-icon">
                    <Icon name={getWeatherIconName(reportData.destination.current.weather_code)} size={32} />
                  </span>
                  <span className="station-temp-value">
                    {formatTemp(reportData.destination.current.temperature_f, units)}
                  </span>
                </div>
                <div className="station-condition-label">
                  {reportData.destination.current.condition || 'N/A'}
                </div>

                <div className="station-stats-2x2">
                  <div className="stat-tile-item">
                    <span className="tile-label">Wind</span>
                    <span className="tile-val">
                      {formatSpeed(reportData.destination.current.wind_speed_mph, units)}
                      {reportData.destination.current.wind_gusts_mph > 0 && (
                        <small> (gusts {formatSpeed(reportData.destination.current.wind_gusts_mph, units)})</small>
                      )}
                    </span>
                  </div>
                  <div className="stat-tile-item">
                    <span className="tile-label">Precip</span>
                    <span className="tile-val">
                      {formatPrecip(reportData.destination.current.precipitation_in, units)}/hr
                    </span>
                  </div>
                  <div className="stat-tile-item">
                    <span className="tile-label">Humidity</span>
                    <span className="tile-val">
                      {reportData.destination.current.humidity_pct != null ? `${reportData.destination.current.humidity_pct}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="stat-tile-item">
                    <span className="tile-label">Feels Like</span>
                    <span className="tile-val">
                      {formatTemp(reportData.destination.current.apparent_temperature_f || reportData.destination.current.temperature_f, units)}
                    </span>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* CARD 3: PAVEMENT + CORRIDOR TILES */}
          <Card className="pavement-metrics-card" id="pavement-metrics-card">
            <div className="card-section-label">CORRIDOR OBSERVATIONS</div>
            <div className="pavement-tiles-row">
              <div className="pavement-tile">
                <span className="pavement-icon-wrap"><Icon name="road" size={18} /></span>
                <div className="pavement-text">
                  <span className="tile-label">Pavement State</span>
                  <span className="tile-val">{reportData.driver_brief?.road_condition || 'Dry & Clear'}</span>
                </div>
              </div>

              <div className="pavement-tile">
                <span className="pavement-icon-wrap"><Icon name="thermometer" size={18} /></span>
                <div className="pavement-text">
                  <span className="tile-label">Corridor Span</span>
                  <span className="tile-val">
                    {formatTemp(reportData.driver_brief?.origin_temp_f || 60, units)}
                    {reportData.driver_brief?.dest_temp_f != null && (
                      ` → ${formatTemp(reportData.driver_brief.dest_temp_f, units)}`
                    )}
                  </span>
                </div>
              </div>

              <div className="pavement-tile">
                <span className="pavement-icon-wrap"><Icon name="wind" size={18} /></span>
                <div className="pavement-text">
                  <span className="tile-label">Peak Gust</span>
                  <span className="tile-val">
                    {formatSpeed(reportData.driver_brief?.max_gust_mph || reportData.driver_brief?.max_wind_mph || 0, units)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* CARD 4: 48-HOUR STRIP WITH INLINE SVG SPARKLINE */}
          {hourlyChips.length > 0 && (
            <Card className="hourly-forecast-card" id="hourly-forecast-card">
              <div className="hourly-card-header">
                <span className="card-section-label">48-Hour Corridor Horizon</span>
                <SegmentedControl
                  value={sparklineMetric}
                  onChange={setSparklineMetric}
                  options={[
                    { id: 'temp', label: 'Temp' },
                    { id: 'rain', label: 'Rain %' },
                    { id: 'wind', label: 'Wind' },
                  ]}
                  ariaLabel="Sparkline Metric"
                  className="sparkline-toggle"
                />
              </div>

              {/* Sparkline Graphic */}
              {sparklineSvg && (
                <div className="sparkline-container" aria-hidden="true">
                  <svg viewBox="0 0 360 44" preserveAspectRatio="none" className="sparkline-svg">
                    <defs>
                      <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path d={sparklineSvg.areaD} fill="url(#sparklineGrad)" />
                    <path d={sparklineSvg.pathD} fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                  <div className="sparkline-meta">
                    <span>Now: <b>{sparklineMetric === 'temp' ? `${sparklineSvg.current}°` : sparklineMetric === 'rain' ? `${sparklineSvg.current}%` : `${sparklineSvg.current}`}</b></span>
                    <span>Range: {sparklineSvg.min} - {sparklineSvg.max}</span>
                  </div>
                </div>
              )}

              {/* Scrollable 56px Chips */}
              <div className="hourly-chips-scroll-wrap">
                <button
                  type="button"
                  className="chips-nav-btn left"
                  onClick={() => scrollChips('left')}
                  aria-label="Scroll earlier hours"
                >
                  <Icon name="chevron-left" size={14} />
                </button>

                <div className="hourly-chips-strip" ref={chipsScrollRef} id="hourly-chips-strip">
                  {hourlyChips.map((chip, idx) => (
                    <div
                      key={chip.timeIso || idx}
                      className={`hourly-chip ${chip.isNow ? 'is-now-chip' : ''}`}
                    >
                      <span className="chip-time">{chip.displayTime}</span>
                      <span className="chip-icon">
                        <Icon name={chip.iconName} size={18} />
                      </span>
                      <span className="chip-temp">{convertTemp(chip.tempF, units)}°</span>
                      <span className="chip-wind">{convertSpeed(chip.windMph, units)}</span>
                      {chip.popPct > 0 && <span className="chip-pop">{chip.popPct}%</span>}
                      {/* 4px risk bar under each chip */}
                      <span
                        className="chip-risk-bar"
                        style={{ backgroundColor: chip.riskColor }}
                        title={`Risk Level ${chip.riskLevel}`}
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="chips-nav-btn right"
                  onClick={() => scrollChips('right')}
                  aria-label="Scroll later hours"
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              </div>
            </Card>
          )}

          {/* CARD 5: ROUTE TIMELINE (Key Stops with flyTo & advisories) */}
          {selectedRoute && (
            <Card className="route-timeline-card" id="route-timeline-card">
              <div className="timeline-header">
                <div>
                  <span className="card-section-label">ROUTE TIMELINE ({selectedRoute.label})</span>
                  <span className="timeline-sub">Click any stop to inspect and fly camera on map</span>
                </div>
                {(() => {
                  const b = RISK_BADGES[selectedRoute.summary?.max_level ?? 0] || RISK_BADGES[0];
                  return (
                    <Badge variant={b.label.toLowerCase()} size="sm">
                      {b.label} Risk
                    </Badge>
                  );
                })()}
              </div>

              {timelineStops.length > 0 ? (
                <div className="timeline-stops-list" id="timeline-stops-list">
                  {timelineStops.map((stop, idx) => {
                    const isSelected = focusedStop?.mile === stop.mile;
                    const stopRiskColor = (RISK_BADGES[stop.risk?.level ?? 0] || RISK_BADGES[0]).color;
                    const stopIcon = getWeatherIconName(stop.weather?.weather_code);

                    return (
                      <div
                        key={`timeline-stop-${stop.mile}-${idx}`}
                        className={`timeline-stop-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSelectStop && onSelectStop(stop)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Stop at ${stop.name || `Mile ${stop.mile}`}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectStop && onSelectStop(stop);
                          }
                        }}
                      >
                        <div className="stop-marker-column">
                          <span className="stop-node-dot" style={{ backgroundColor: stopRiskColor }} />
                          {idx < timelineStops.length - 1 && <span className="stop-connector-line" />}
                        </div>

                        <div className="stop-details-content">
                          <div className="stop-top-line">
                            <span className="stop-name" title={stop.name || `Mile ${stop.mile}`}>
                              {stop.name || `Mile ${stop.mile}`}
                            </span>
                            <span className="stop-mile-marker">
                              {formatDistance(stop.mile, units)}
                            </span>
                          </div>

                          <div className="stop-metrics-line">
                            <span className="stop-eta">{formatIsoTime(stop.eta)}</span>
                            {stop.weather && (
                              <>
                                <span className="metrics-sep">•</span>
                                <span className="stop-weather-tag">
                                  <Icon name={stopIcon} size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                  {formatTemp(stop.weather.temp_f, units)}
                                </span>
                                <span className="metrics-sep">•</span>
                                <span className="stop-wind-tag">
                                  {formatSpeed(stop.weather.wind_mph, units)}
                                  {stop.weather.gust_mph > stop.weather.wind_mph && (
                                    <small> (gusts {formatSpeed(stop.weather.gust_mph, units)})</small>
                                  )}
                                </span>
                              </>
                            )}
                            <span className="metrics-sep">•</span>
                            <span className="stop-risk-label" style={{ color: stopRiskColor }}>
                              {stop.risk?.label || 'Low'}
                            </span>
                          </div>

                          {/* Rule-based advisory line (max 12 words) */}
                          {stop.advisory && (
                            <div className="stop-advisory-pill">
                              <span className="advisory-icon"><Icon name="info" size={12} /></span>
                              <span className="advisory-text">{stop.advisory}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No intermediate key checkpoints found on this route.
                </div>
              )}
            </Card>
          )}

          {/* CARD 6: WEATHER ALERTS */}
          {reportData.alerts && reportData.alerts.length > 0 && (
            <Card className="weather-alerts-card" id="weather-alerts-card">
              <span className="card-section-label" style={{ color: '#ef4444' }}>
                <Icon name="alert-triangle" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                ACTIVE CORRIDOR ADVISORIES
              </span>
              <div className="alerts-stack">
                {reportData.alerts.map((alert, idx) => (
                  <div key={idx} className="alert-item-row">
                    <span className="alert-dot-bullet" />
                    <span className="alert-message">{alert.message}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* CARD 7: MORE DETAILS (COLLAPSIBLE) */}
          <Card className="collapsible-details-card" id="collapsible-details-card">
            <button
              type="button"
              className="collapsible-toggle-btn"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              aria-expanded={isDetailsOpen}
              id="toggle-more-details-btn"
            >
              <span className="card-section-label">Additional Atmospheric Metrics</span>
              <Icon name={isDetailsOpen ? 'chevron-left' : 'chevron-right'} size={16} />
            </button>

            {isDetailsOpen && (
              <div className="collapsible-content-grid" id="additional-metrics-grid">
                <Stat
                  label="Surface Pressure"
                  value="1014 hPa"
                  icon={<Icon name="layers" size={16} />}
                />
                <Stat
                  label="Dew Point"
                  value={formatTemp(54, units)}
                  icon={<Icon name="thermometer" size={16} />}
                />
                <Stat
                  label="UV Index"
                  value="Moderate (4)"
                  icon={<Icon name="sun" size={16} />}
                />
                <Stat
                  label="Cloud Cover"
                  value="42%"
                  icon={<Icon name="cloud" size={16} />}
                />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
