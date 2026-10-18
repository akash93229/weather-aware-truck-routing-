const RISK_PALETTE = [
  { level: 0, label: 'Low', color: '#10b981', desc: '<25 mph wind, <0.10 in/hr rain' },
  { level: 1, label: 'Moderate', color: '#0ea5e9', desc: '>=25 mph wind, >=0.10 in/hr rain' },
  { level: 2, label: 'High', color: '#eab308', desc: '>=35 mph wind, >=0.25 in/hr rain' },
  { level: 3, label: 'Severe', color: '#f97316', desc: '>=45 mph wind, >=0.50 in/hr rain' },
  { level: 4, label: 'No Travel', color: '#ef4444', desc: '>=55 mph wind, >1.00 in/hr rain' },
];

const ROUTE_LEGEND = [
  { label: 'Fastest', color: '#38bdf8' },
  { label: 'Alternative 1', color: '#a855f7' },
  { label: 'Alternative 2', color: '#f97316' },
];

export { RISK_PALETTE, ROUTE_LEGEND };

export default function RiskLegend({ isLeftPanelOpen = false }) {
  return (
    <div className={`risk-legend ${isLeftPanelOpen ? 'offset-panel-open' : ''}`} id="risk-legend">
      <div className="legend-group">
        <span className="legend-title">Routes</span>
        <div className="legend-items">
          {ROUTE_LEGEND.map((r) => (
            <div key={r.label} className="legend-item" title={`${r.label} route line`}>
              <span className="legend-route-line" style={{ backgroundColor: r.color }} />
              <span className="legend-label">{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legend-group-divider" />

      <div className="legend-group">
        <span className="legend-title">Risk Scale</span>
        <div className="legend-items">
          {RISK_PALETTE.map((item) => (
            <div key={item.level} className="legend-item" title={item.desc}>
              <span
                className="legend-dot"
                style={{ backgroundColor: item.color }}
              />
              <span className="legend-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
