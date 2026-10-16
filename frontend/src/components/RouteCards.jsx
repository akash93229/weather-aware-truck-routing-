import { useMemo } from 'react';
import { RISK_PALETTE } from './RiskLegend';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

const ROUTE_CANONICAL_ORDER = {
  fastest: 1,
  route_1: 1,
  'alternative 1': 2,
  route_2: 2,
  'alternative 2': 3,
  route_3: 3,
};

const RISK_LABELS = {
  0: 'Low',
  1: 'Moderate',
  2: 'High',
  3: 'Severe',
  4: 'No Travel',
};

function getRiskBadgeClass(level) {
  switch (level) {
    case 0: return 'badge-risk-low';
    case 1: return 'badge-risk-mod';
    case 2: return 'badge-risk-high';
    case 3: return 'badge-risk-severe';
    case 4: return 'badge-risk-notravel';
    default: return '';
  }
}

const LEVEL_KEY_CANDIDATES = {
  0: ['low', '0'],
  1: ['moderate', 'mod', '1'],
  2: ['high', '2'],
  3: ['severe', '3'],
  4: ['no_travel', 'notravel', 'no-travel', '4'],
};

function getBreakdownSegments(milesByLevel, totalMiles) {
  const segments = [];
  let accountedMiles = 0;

  for (const pal of RISK_PALETTE) {
    const keys = LEVEL_KEY_CANDIDATES[pal.level] || [String(pal.level)];
    let miles = 0;
    for (const k of keys) {
      if (milesByLevel && milesByLevel[k] !== undefined && milesByLevel[k] !== null) {
        miles = Number(milesByLevel[k]) || 0;
        break;
      }
    }
    if (miles > 0) {
      segments.push({
        level: pal.level,
        label: pal.label,
        color: pal.color,
        miles,
      });
      accountedMiles += miles;
    }
  }

  // If no hazards or all-low, or accountedMiles == 0, show a full Low-colored bar
  if (segments.length === 0) {
    const fullMiles = totalMiles > 0 ? totalMiles : 1;
    return [
      {
        level: 0,
        label: 'Low',
        color: '#10b981',
        miles: fullMiles,
        pct: 100,
      },
    ];
  }

  const baseMiles = Math.max(accountedMiles, totalMiles, 1);
  return segments.map((s) => ({
    ...s,
    pct: Math.min(100, (s.miles / baseMiles) * 100),
  }));
}

function getRouteColor(route, idx) {
  const norm = (route.label || route.id || '').trim().toLowerCase();
  if (norm.includes('fastest') || norm === 'route_1') return '#38bdf8';
  if (norm.includes('alternative 1') || norm.includes('alt 1') || norm === 'route_2') return '#a855f7';
  if (norm.includes('alternative 2') || norm.includes('alt 2') || norm === 'route_3') return '#f97316';
  const defaults = ['#38bdf8', '#a855f7', '#f97316'];
  return defaults[idx % defaults.length];
}

export default function RouteCards({
  routes = [],
  recommendation = null,
  selectedRouteId,
  onSelectRoute,
}) {
  // Show route cards in consistent order: Fastest, Alternative 1, Alternative 2
  // Do NOT reorder by selection or by recommendation
  const sortedRoutes = useMemo(() => {
    if (!routes || routes.length === 0) return [];
    return [...routes].sort((a, b) => {
      const keyA = (a.label || a.id || '').trim().toLowerCase();
      const keyB = (b.label || b.id || '').trim().toLowerCase();
      const orderA = ROUTE_CANONICAL_ORDER[keyA] ?? 99;
      const orderB = ROUTE_CANONICAL_ORDER[keyB] ?? 99;
      return orderA - orderB;
    });
  }, [routes]);

  if (!routes || routes.length === 0) {
    return null;
  }

  const recommendedRoute = recommendation
    ? routes.find((r) => r.id === recommendation.route_id)
    : null;

  return (
    <section className="route-cards-container" id="route-analysis-results">
      {/* Top Banner: Recommendation or No Safe Route */}
      {recommendation ? (
        <div className="recommendation-banner banner-safe" id="recommendation-safe-banner">
          <div className="banner-icon-col">
            <span className="banner-icon-badge">✓</span>
          </div>
          <div className="banner-text-col">
            <div className="banner-title-row">
              <span className="banner-badge-rec">RECOMMENDED OPTION</span>
              <h3 className="banner-heading">
                {recommendedRoute ? recommendedRoute.label : recommendation.route_id}
              </h3>
            </div>
            {recommendation.reasons && recommendation.reasons.length > 0 && (
              <ul className="banner-reasons-list">
                {recommendation.reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="recommendation-banner banner-blocked" id="recommendation-blocked-banner">
          <div className="banner-icon-col">
            <span className="banner-icon-badge-blocked">⚠</span>
          </div>
          <div className="banner-text-col">
            <h3 className="banner-heading">No safe route at this departure time</h3>
            <p className="banner-subtext">
              All 3 generated routes encounter Severe or No-Travel hazards. Delay departure or reschedule when conditions clear.
            </p>
          </div>
        </div>
      )}

      {/* Cards List in consistent order */}
      <div className="route-cards-grid">
        {sortedRoutes.map((route, idx) => {
          const isSelected = route.id === selectedRouteId;
          const isRecommended = Boolean(route.recommended);
          const isBlocked = Boolean(route.summary?.blocked);
          const milesByLevel = route.summary?.miles_by_level || {};
          const totalMiles = route.distance_mi || 1;
          const routeColor = getRouteColor(route, idx);

          return (
            <div
              key={route.id}
              className={`route-card ${isSelected ? 'selected' : ''} ${isRecommended ? 'is-recommended' : ''} ${isBlocked ? 'is-blocked' : ''}`}
              onClick={() => onSelectRoute(route.id)}
              id={`route-card-${route.id}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelectRoute(route.id);
                }
              }}
            >
              <div className="card-top-row">
                <div className="card-title-wrap">
                  <span
                    className="route-color-chip"
                    style={{ backgroundColor: routeColor }}
                    title={`Map route line color: ${route.label}`}
                    aria-label={`Route color: ${route.label}`}
                  />
                  <h4 className="route-card-title">{route.label}</h4>
                </div>
                <div className="card-badges-wrap">
                  {isRecommended && (
                    <span className="badge-badge badge-rec">Recommended</span>
                  )}
                  {isBlocked && (
                    <span className="badge-badge badge-blocked">Blocked</span>
                  )}
                </div>
              </div>

              <div className="card-stats-row">
                <div className="card-stat">
                  <span className="stat-label">Distance</span>
                  <span className="stat-val">{route.distance_mi?.toFixed(1)} mi</span>
                </div>
                <div className="card-stat">
                  <span className="stat-label">Duration</span>
                  <span className="stat-val">{formatDuration(route.duration_s)}</span>
                </div>
                <div className="card-stat">
                  <span className="stat-label">Avg Risk</span>
                  <span className="stat-val risk-score-val">
                    {route.summary?.avg_risk !== undefined ? route.summary.avg_risk.toFixed(2) : 'N/A'}
                  </span>
                </div>
                <div className="card-stat">
                  <span className="stat-label">Max Risk</span>
                  <span className={`stat-val-badge ${getRiskBadgeClass(route.summary?.max_level)}`}>
                    {RISK_LABELS[route.summary?.max_level] || 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Stacked Risk Bar */}
              {(() => {
                const segments = getBreakdownSegments(milesByLevel, totalMiles);
                return (
                  <div className="stacked-bar-container">
                    <div className="stacked-bar-label-row">
                      <span className="stacked-bar-title">Hazard Exposure Breakdown</span>
                      <span className="stacked-bar-total">{totalMiles.toFixed(0)} miles</span>
                    </div>
                    <div className="stacked-bar">
                      {segments.map((seg) => (
                        <div
                          key={seg.level}
                          className="bar-segment"
                          style={{
                            width: `${seg.pct}%`,
                            backgroundColor: seg.color,
                          }}
                          title={`${seg.label}: ${seg.miles.toFixed(1)} mi (${seg.pct.toFixed(0)}%)`}
                        />
                      ))}
                    </div>
                    <div className="stacked-bar-legend">
                      {segments.map((seg) => (
                        <span key={seg.level} className="legend-chip">
                          <span className="chip-dot" style={{ backgroundColor: seg.color }} />
                          {seg.miles.toFixed(0)} mi {seg.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </section>
  );
}
