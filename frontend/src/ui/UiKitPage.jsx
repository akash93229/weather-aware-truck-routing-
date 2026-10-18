import React, { useState, useEffect } from 'react';
import {
  Button,
  IconButton,
  Switch,
  SegmentedControl,
  Card,
  Stat,
  Badge,
  Tooltip,
  Skeleton,
  EmptyState,
  ErrorState,
  Divider,
  SectionTitle,
} from './components';
import { Icon } from './icons';

const ALL_ICONS = [
  'wind', 'gust', 'rain-drop', 'thermometer', 'road', 'eye', 'humidity',
  'clock', 'pin', 'route', 'sun', 'cloud', 'cloud-rain', 'cloud-lightning',
  'snowflake', 'fog', 'alert-triangle', 'check-circle', 'chevron-right',
  'close', 'menu', 'pin-toggle', 'crosshair', 'layers', 'info', 'sliders',
  'play', 'pause', 'truck'
];

export default function UiKitPage() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const [switchVal, setSwitchVal] = useState(true);
  const [activeTab, setActiveTab] = useState('first');
  const [cardSelected, setCardSelected] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      padding: '32px 24px',
      fontFamily: 'Inter, system-ui, sans-serif',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
        
        {/* Header & Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--font-xl)', fontWeight: 'var(--weight-bold)' }}>
              StormLane Design System Kit
            </h1>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
              Dev-only preview (#ui-kit) • Current Theme: <strong style={{ textTransform: 'uppercase' }}>{theme}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button variant="secondary" size="md" onClick={toggleTheme} icon={<Icon name={theme === 'dark' ? 'sun' : 'cloud'} size={18} />}>
              Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { window.location.hash = ''; window.location.reload(); }}>
              Exit #ui-kit
            </Button>
          </div>
        </div>

        {/* Section: Typography & Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionTitle>Risk Badges (Icon + Word + Tint)</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Badge riskLevel={0} label="Low Risk (0)" />
            <Badge riskLevel={1} label="Moderate (1)" />
            <Badge riskLevel={2} label="High Risk (2)" />
            <Badge riskLevel={3} label="Severe (3)" />
            <Badge riskLevel={4} label="No Travel (4)" />
          </div>
        </div>

        {/* Section: Buttons & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionTitle>Buttons & Switches</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <Button variant="primary" size="md" icon={<Icon name="route" size={18} />}>Primary MD</Button>
            <Button variant="primary" size="sm">Primary SM</Button>
            <Button variant="primary" size="md" isLoading>Loading</Button>
            <Button variant="secondary" size="md" icon={<Icon name="sliders" size={18} />}>Secondary MD</Button>
            <Button variant="secondary" size="sm">Secondary SM</Button>
            <Button variant="ghost" size="md" icon={<Icon name="crosshair" size={18} />}>Ghost MD</Button>
            <Button variant="ghost" size="sm">Ghost SM</Button>
            
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
              <IconButton icon={<Icon name="menu" size={20} />} ariaLabel="Menu" />
              <IconButton icon={<Icon name="pin" size={20} />} ariaLabel="Pin" active />
              <IconButton icon={<Icon name="close" size={20} />} ariaLabel="Close" />
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 'var(--font-sm)', fontWeight: 'var(--weight-semibold)' }}>Switch:</span>
              <Switch checked={switchVal} onChange={setSwitchVal} ariaLabel="Demo switch" />
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{switchVal ? 'ON' : 'OFF'}</span>
            </div>
          </div>
        </div>

        {/* Section: Segmented Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionTitle>Segmented Control (Role Tablist)</SectionTitle>
          <div style={{ maxWidth: 420 }}>
            <SegmentedControl
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { id: 'first', label: 'Trip Parameters', icon: <Icon name="route" size={16} /> },
                { id: 'second', label: 'Recent Trips', icon: <Icon name="clock" size={16} /> },
                { id: 'third', label: 'Brief', icon: <Icon name="cloud" size={16} /> },
              ]}
            />
          </div>
        </div>

        {/* Section: Cards & Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionTitle>Cards & Stat Tiles (Label Above Value)</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <Card interactive selected={cardSelected} onClick={() => setCardSelected(!cardSelected)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-sm)', fontWeight: 'var(--weight-bold)' }}>Fastest Route</div>
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Via I-80 E (Interactive)</div>
                </div>
                <Badge riskLevel={0} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Stat label="Duration" value="12h 45m" icon={<Icon name="clock" size={14} />} />
                <Stat label="Distance" value="792" unit="mi" icon={<Icon name="route" size={14} />} />
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 'var(--font-sm)', fontWeight: 'var(--weight-bold)' }}>Now at Origin</span>
                <Icon name="sun" size={24} color="var(--accent)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Stat label="Temperature" value="68°F" icon={<Icon name="thermometer" size={14} />} size="lg" />
                <Stat label="Wind Speed" value="12.4" unit="mph" icon={<Icon name="wind" size={14} />} size="lg" />
                <Stat label="Rain Chance" value="10%" icon={<Icon name="rain-drop" size={14} />} />
                <Stat label="Visibility" value="10.0" unit="mi" icon={<Icon name="eye" size={14} />} />
              </div>
            </Card>

            <Card>
              <SectionTitle>Tooltips & States</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                <Tooltip text="Corridor weather risk heatmap (0-48h)">
                  <span style={{ cursor: 'pointer', textDecoration: 'underline dotted', fontSize: 'var(--font-sm)' }}>
                    Hover here to view Tooltip
                  </span>
                </Tooltip>
                <Divider />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Skeleton Loaders:</span>
                  <Skeleton width="100%" height="16px" radius="6px" />
                  <Skeleton width="70%" height="16px" radius="6px" />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Section: Empty & Error States */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <EmptyState
            icon="clock"
            title="No Recent Trips"
            description="Your analyzed routes and driver briefs will be preserved here."
          />
          <ErrorState
            title="Failed to fetch forecast"
            message="Weather API rate limit reached. Upstream provider unavailable."
            onRetry={() => alert('Retrying...')}
          />
        </div>

        {/* Section: Complete SVG Icon Set (All 28) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionTitle>All 29 SVG Icons (Round caps, strokeWidth 1.75, zero emoji)</SectionTitle>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: 12,
            background: 'var(--surface)',
            padding: 16,
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--border)'
          }}>
            {ALL_ICONS.map((name) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 8px',
                  borderRadius: 'var(--radius-ctrl)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)'
                }}
              >
                <Icon name={name} size={22} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', wordBreak: 'break-all' }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
