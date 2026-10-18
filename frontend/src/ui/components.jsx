import React from 'react';
import { Icon } from './icons';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon = null,
  className = '',
  disabled = false,
  type = 'button',
  onClick,
  ...props
}) {
  return (
    <button
      type={type}
      className={`sl-btn variant-${variant} size-${size} ${className}`.trim()}
      disabled={disabled || isLoading}
      onClick={onClick}
      {...props}
    >
      {isLoading ? (
        <span className="sl-spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="sl-btn-icon" aria-hidden="true">{icon}</span>
      ) : null}
      <span className="sl-btn-text">{children}</span>
    </button>
  );
}

export function IconButton({
  icon,
  size = 40,
  ariaLabel,
  title,
  tooltip,
  active = false,
  disabled = false,
  onClick,
  className = '',
  id,
  type = 'button',
  style = {},
  ...props
}) {
  const iconSize = Math.max(14, Math.round(size * 0.5));
  const iconNode = typeof icon === 'string' ? <Icon name={icon} size={iconSize} /> : icon;
  return (
    <button
      type={type}
      id={id}
      className={`sl-icon-btn ${active ? 'active' : ''} ${className}`.trim()}
      aria-label={ariaLabel || title || tooltip}
      title={title || ariaLabel || tooltip}
      data-tooltip={tooltip}
      disabled={disabled}
      onClick={onClick}
      style={{ width: size, height: size, minWidth: size, minHeight: size, ...style }}
      {...props}
    >
      {iconNode}
    </button>
  );
}

export function Switch({
  checked = false,
  onChange,
  ariaLabel,
  id,
  disabled = false,
  className = '',
}) {
  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange?.(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange?.(!checked);
      }}
      onKeyDown={handleKeyDown}
      className={`sl-switch ${className}`.trim()}
    >
      <span className="sl-switch-thumb" aria-hidden="true" />
    </button>
  );
}

export function SegmentedControl({
  options = [],
  value,
  onChange,
  ariaLabel = 'Navigation tabs',
  className = '',
}) {
  return (
    <div className={`sl-segmented-control ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            id={`tab-${opt.id}`}
            aria-selected={isActive}
            className={`segmented-tab-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.icon && <span style={{ marginRight: 6 }}>{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Card({
  children,
  className = '',
  interactive = false,
  selected = false,
  onClick,
  ...props
}) {
  return (
    <div
      className={`sl-card ${interactive ? 'interactive' : ''} ${selected ? 'selected' : ''} ${className}`.trim()}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  icon = null,
  size = 'default',
  unit = null,
  className = '',
}) {
  return (
    <div className={`sl-stat ${className}`.trim()}>
      <span className="sl-stat-label">
        {icon && <span className="sl-stat-icon" aria-hidden="true">{icon}</span>}
        {label}
      </span>
      <span className={`sl-stat-value ${size} tabular-nums`}>
        {value}
        {unit && <small style={{ fontSize: '0.75em', marginLeft: 3, opacity: 0.8 }}>{unit}</small>}
      </span>
    </div>
  );
}

const RISK_MAP = {
  0: { label: 'Low', class: 'risk-low', icon: 'check-circle' },
  1: { label: 'Moderate', class: 'risk-moderate', icon: 'info' },
  2: { label: 'High', class: 'risk-high', icon: 'alert-triangle' },
  3: { label: 'Severe', class: 'risk-severe', icon: 'alert-triangle' },
  4: { label: 'No Travel', class: 'risk-notravel', icon: 'close' },
};

export function Badge({
  riskLevel = 0,
  label,
  icon = null,
  className = '',
}) {
  const meta = RISK_MAP[riskLevel] || RISK_MAP[0];
  const displayLabel = label || meta.label;
  const iconName = icon || meta.icon;

  return (
    <span className={`sl-badge ${meta.class} ${className}`.trim()}>
      <Icon name={iconName} size={12} strokeWidth={2} />
      <span>{displayLabel}</span>
    </span>
  );
}

export function Skeleton({ width = '100%', height = '20px', radius, className = '' }) {
  return (
    <div
      className={`sl-skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius: radius || undefined,
      }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  icon = 'info',
  title = 'No Data',
  description = '',
  action = null,
  className = '',
}) {
  return (
    <div className={`sl-empty-state ${className}`.trim()}>
      <div className="sl-empty-icon" aria-hidden="true">
        <Icon name={icon} size={22} strokeWidth={1.8} />
      </div>
      <h3 className="sl-empty-title">{title}</h3>
      {description && <p className="sl-empty-desc">{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
  className = '',
}) {
  return (
    <div className={`sl-error-state ${className}`.trim()}>
      <div className="sl-error-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alert-triangle" size={16} strokeWidth={2} />
          <span>{message || title}</span>
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function Divider({ className = '' }) {
  return <hr className={`sl-divider ${className}`.trim()} aria-hidden="true" />;
}

export function SectionTitle({ children, className = '' }) {
  return <h4 className={`sl-section-title ${className}`.trim()}>{children}</h4>;
}

export function Tooltip({ text, children, className = '' }) {
  return (
    <span data-tooltip={text} className={`sl-tooltip-wrapper ${className}`.trim()}>
      {children}
    </span>
  );
}

