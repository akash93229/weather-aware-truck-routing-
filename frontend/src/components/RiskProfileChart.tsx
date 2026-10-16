import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { RouteOption, Checkpoint } from '../types/trip';

interface RiskProfileChartProps {
  route: RouteOption | null;
}

const RISK_LEVEL_LABELS: Record<number, string> = {
  0: 'Low (0)',
  1: 'Moderate (1)',
  2: 'High (2)',
  3: 'Severe (3)',
  4: 'No Travel (4)',
};

const RISK_COLORS: Record<number, string> = {
  0: '#10B981',
  1: '#38BDF8',
  2: '#EAB308',
  3: '#F97316',
  4: '#EF4444',
};

export const RiskProfileChart: React.FC<RiskProfileChartProps> = ({ route }) => {
  if (!route || !route.checkpoints || route.checkpoints.length === 0) {
    return null;
  }

  const chartData = route.checkpoints.map((cp: Checkpoint) => ({
    mile: Math.round(cp.mile_marker),
    riskLevel: cp.level,
    levelName: cp.level_name,
    wind: Math.round(cp.weather?.wind_speed_mph || 0),
    gusts: Math.round(cp.weather?.wind_gusts_mph || 0),
    rain: Number((cp.weather?.rain_in_hr || 0).toFixed(2)),
    snow: Number((cp.weather?.snow_in_hr || 0).toFixed(2)),
    eta: cp.eta_iso ? new Date(cp.eta_iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    loadRule: cp.load_rule || '',
  }));

  return (
    <div className="risk-chart-card" style={{
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '20px',
      marginTop: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F1F5F9', letterSpacing: '0.01em' }}>
            Route Hazard Profile — {route.label} ({route.distance_mi} mi)
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94A3B8' }}>
            Risk severity (0-4) and sustained wind speed (mph) sampled along the corridor
          </p>
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          padding: '4px 10px',
          borderRadius: '999px',
          background: 'rgba(56, 189, 248, 0.15)',
          color: '#38BDF8',
          border: '1px solid rgba(56, 189, 248, 0.3)',
        }}>
          Recharts Interactive
        </span>
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.6} />
                <stop offset="50%" stopColor="#EAB308" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
            <XAxis
              dataKey="mile"
              stroke="#64748B"
              fontSize={11}
              tickFormatter={(v) => `mi ${v}`}
            />
            <YAxis
              yAxisId="risk"
              domain={[0, 4]}
              ticks={[0, 1, 2, 3, 4]}
              stroke="#64748B"
              fontSize={11}
              tickFormatter={(v) => ['Low', 'Mod', 'High', 'Sev', 'Stop'][v] || v}
            />
            <YAxis
              yAxisId="wind"
              orientation="right"
              stroke="#64748B"
              fontSize={11}
              tickFormatter={(v) => `${v} mph`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                const color = RISK_COLORS[d.riskLevel] || '#94A3B8';
                return (
                  <div style={{
                    background: '#0F172A',
                    border: `1px solid ${color}`,
                    borderRadius: '8px',
                    padding: '10px 14px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    color: '#F8FAFC',
                    fontSize: '12px',
                    lineHeight: '1.4',
                  }}>
                    <div style={{ fontWeight: 700, color, marginBottom: '4px' }}>
                      Mile {d.mile} — {d.levelName} Risk (Level {d.riskLevel})
                    </div>
                    <div><strong>ETA:</strong> {d.eta}</div>
                    <div><strong>Wind:</strong> {d.wind} mph (gusts: {d.gusts} mph)</div>
                    {d.rain > 0 && <div><strong>Rain:</strong> {d.rain} in/hr</div>}
                    {d.snow > 0 && <div><strong>Snow:</strong> {d.snow} in/hr</div>}
                    {d.loadRule && (
                      <div style={{ color: '#F87171', marginTop: '4px', fontSize: '11px' }}>
                        ⚠️ {d.loadRule}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              payload={[
                { value: 'Risk Level (0-4)', type: 'rect', color: '#F97316' },
                { value: 'Sustained Wind (mph)', type: 'line', color: '#38BDF8' },
              ]}
            />
            <Area
              yAxisId="risk"
              type="monotone"
              dataKey="riskLevel"
              stroke="#F97316"
              strokeWidth={2}
              fill="url(#riskGradient)"
            />
            <Line
              yAxisId="wind"
              type="monotone"
              dataKey="wind"
              stroke="#38BDF8"
              strokeWidth={2}
              dot={{ r: 2, fill: '#38BDF8' }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RiskProfileChart;
