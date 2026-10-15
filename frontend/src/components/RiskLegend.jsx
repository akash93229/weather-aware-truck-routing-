const RISK_PALETTE = [
  { level: 0, label: 'Low', color: '#10b981', desc: '<25 mph wind, <0.10 in/hr rain' },
  { level: 1, label: 'Moderate', color: '#0ea5e9', desc: '>=25 mph wind, >=0.10 in/hr rain' },
  { level: 2, label: 'High', color: '#eab308', desc: '>=35 mph wind, >=0.25 in/hr rain' },
  { level: 3, label: 'Severe', color: '#f97316', desc: '>=45 mph wind, >=0.50 in/hr rain' },
  { level: 4, label: 'No Travel', color: '#ef4444', desc: '>=55 mph wind, >1.00 in/hr rain' },
];

export { RISK_PALETTE };

export default function RiskLegend() {
  return (
    <div className="risk-legend" id="risk-legend">
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
  );
}
