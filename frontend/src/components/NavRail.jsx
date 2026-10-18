import React from 'react';
import { Icon } from '../ui/icons';
import { IconButton, Switch, Divider } from '../ui/components';
import pkg from '../../package.json';

/**
 * Rebuilt NavRail (Step 2)
 * Floating card: top 12px, left 12px, width 280px, radius 18, surface, border, shadow.
 * Slides in from left with translateX(-16px) + fade, 220ms.
 * Every item is an identical 52px horizontal flex row.
 */
export default function NavRail({
  isOpen = false,
  onClose,
  isPinned = false,
  onTogglePin,
  activeItem,
  onSelectItem,
  hasNewResults = false,
  hasUnviewedWeather = false,
  showHeatmap = true,
  onToggleHeatmap,
}) {
  const version = pkg?.version || '0.1.0';

  const items = [
    {
      id: 'params',
      label: 'Trip Parameters',
      icon: 'sliders',
      isActive: activeItem === 'params',
      hasPulse: false,
    },
    {
      id: 'weather',
      label: 'Driver Brief',
      icon: 'cloud',
      isActive: activeItem === 'weather',
      hasPulse: hasUnviewedWeather && activeItem !== 'weather',
    },
    {
      id: 'routes',
      label: 'Route Analysis',
      icon: 'route',
      isActive: activeItem === 'routes',
      hasPulse: hasNewResults && activeItem !== 'routes',
    },
    {
      id: 'heatmap',
      label: 'Corridor Heatmap',
      icon: 'layers',
      isActive: showHeatmap,
      isSwitch: true,
    },
    {
      id: 'recent',
      label: 'Recent Trips',
      icon: 'clock',
      isActive: activeItem === 'recent',
      hasPulse: false,
    },
    {
      id: 'info',
      label: 'Map Info & Credits',
      icon: 'info',
      isActive: activeItem === 'info',
      hasPulse: false,
      hasDividerBefore: true,
    },
  ];

  const handleRowClick = (item) => {
    if (item.isSwitch) {
      onToggleHeatmap?.();
    } else {
      onSelectItem?.(item.id);
    }
  };

  return (
    <aside
      className={`sl-nav-rail ${isOpen ? 'open' : ''} ${isPinned ? 'pinned' : ''}`}
      id="sl-nav-rail"
      aria-label="Navigation Menu"
      aria-hidden={!isOpen}
    >
      {/* Header row: 52px */}
      <div className="sl-nav-rail-header">
        <span className="sl-nav-rail-title">Navigation</span>
        <div className="sl-nav-rail-actions">
          <IconButton
            icon={<Icon name="pin-toggle" size={18} color={isPinned ? 'var(--accent)' : 'currentColor'} />}
            ariaLabel={isPinned ? 'Unpin navigation rail' : 'Pin navigation rail'}
            title={isPinned ? 'Unpin menu (closes after click)' : 'Pin menu open'}
            active={isPinned}
            onClick={onTogglePin}
            id="nav-rail-pin-btn"
          />
          <IconButton
            icon={<Icon name="close" size={18} />}
            ariaLabel="Close navigation [Esc]"
            title="Close navigation [Esc]"
            onClick={onClose}
            id="nav-rail-close-btn"
          />
        </div>
      </div>

      {/* Navigation rows */}
      <nav className="sl-nav-rail-body" aria-label="Menu Items">
        {items.map((item) => (
          <React.Fragment key={item.id}>
            {item.hasDividerBefore && <Divider className="sl-nav-divider" />}
            <button
              type="button"
              className={`sl-nav-rail-row ${item.isActive ? 'active' : ''}`}
              id={`nav-rail-item-${item.id}`}
              onClick={() => handleRowClick(item)}
              aria-current={item.isActive && !item.isSwitch ? 'page' : undefined}
            >
              <div className="sl-nav-rail-row-icon" aria-hidden="true">
                <Icon name={item.icon} size={24} />
              </div>

              <span className="sl-nav-rail-row-label">{item.label}</span>

              <div className="sl-nav-rail-row-right">
                {item.isSwitch ? (
                  <Switch
                    checked={showHeatmap}
                    onChange={onToggleHeatmap}
                    ariaLabel="Toggle Corridor Heatmap"
                    id="nav-rail-heatmap-switch"
                  />
                ) : item.hasPulse ? (
                  <span className="sl-pulse-dot" aria-label="New update" />
                ) : (
                  <Icon name="chevron-right" size={16} color="var(--text-muted)" />
                )}
              </div>
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Footer: StormLane v + version */}
      <div className="sl-nav-rail-footer">
        <span>StormLane v{version}</span>
      </div>
    </aside>
  );
}
