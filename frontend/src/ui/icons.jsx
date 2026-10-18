import React from 'react';

/**
 * Single, unified SVG Icon library for StormLane design system.
 * All icons: strokeWidth 1.75, round caps and joins, flex-shrink 0.
 */
export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className = '',
  color = 'currentColor',
  ariaHidden = true,
  ...props
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: `sl-icon sl-icon-${name} ${className}`.trim(),
    'aria-hidden': ariaHidden ? 'true' : undefined,
    style: { flexShrink: 0 },
    ...props,
  };

  switch (name) {
    case 'wind':
      return (
        <svg {...common}>
          <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
          <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
          <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
        </svg>
      );

    case 'gust':
      return (
        <svg {...common}>
          <path d="M4 12h12a3 3 0 1 0-3-3" />
          <path d="M2 16h15a3 3 0 1 1-3 3" />
          <path d="M7 8h6a2 2 0 1 0-2-2" />
        </svg>
      );

    case 'rain-drop':
      return (
        <svg {...common}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );

    case 'thermometer':
      return (
        <svg {...common}>
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
          <circle cx="11.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'road':
      return (
        <svg {...common}>
          <path d="M4 19L8 5" />
          <path d="M20 19l-4-14" />
          <path d="M12 5v2.5" />
          <path d="M12 11v2.5" />
          <path d="M12 17v2.5" />
        </svg>
      );

    case 'eye':
      return (
        <svg {...common}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );

    case 'humidity':
      return (
        <svg {...common}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          <path d="M9 13a3 3 0 0 0 6 0" />
        </svg>
      );

    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 15" />
        </svg>
      );

    case 'pin':
      return (
        <svg {...common}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );

    case 'route':
      return (
        <svg {...common}>
          <circle cx="6" cy="19" r="3" />
          <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H7a4.5 4.5 0 0 1 0-9H15" />
          <circle cx="18" cy="5" r="3" />
        </svg>
      );

    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );

    case 'cloud':
      return (
        <svg {...common}>
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      );

    case 'cloud-rain':
      return (
        <svg {...common}>
          <path d="M16 13v6" />
          <path d="M8 13v6" />
          <path d="M12 15v6" />
          <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
        </svg>
      );

    case 'cloud-lightning':
      return (
        <svg {...common}>
          <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
          <polyline points="13 11 9 17 15 17 11 23" />
        </svg>
      );

    case 'snowflake':
      return (
        <svg {...common}>
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="3.34" y1="7" x2="20.66" y2="17" />
          <line x1="3.34" y1="17" x2="20.66" y2="7" />
          <line x1="10" y1="4" x2="12" y2="6" />
          <line x1="14" y1="4" x2="12" y2="6" />
          <line x1="10" y1="20" x2="12" y2="18" />
          <line x1="14" y1="20" x2="12" y2="18" />
        </svg>
      );

    case 'fog':
      return (
        <svg {...common}>
          <line x1="4" y1="8" x2="20" y2="8" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="4" y1="16" x2="20" y2="16" />
          <line x1="6" y1="20" x2="18" y2="20" />
        </svg>
      );

    case 'alert-triangle':
      return (
        <svg {...common}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );

    case 'check-circle':
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );

    case 'chevron-right':
      return (
        <svg {...common}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );

    case 'chevron-left':
      return (
        <svg {...common}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      );

    case 'close':
      return (
        <svg {...common}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );

    case 'menu':
      return (
        <svg {...common}>
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      );

    case 'pin-toggle':
      return (
        <svg {...common}>
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14l-2-6V4h1V2H6v2h1v7l-2 6z" />
        </svg>
      );

    case 'crosshair':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="22" y1="12" x2="18" y2="12" />
          <line x1="6" y1="12" x2="2" y2="12" />
          <line x1="12" y1="6" x2="12" y2="2" />
          <line x1="12" y1="22" x2="12" y2="18" />
        </svg>
      );

    case 'layers':
      return (
        <svg {...common}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );

    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );

    case 'sliders':
      return (
        <svg {...common}>
          <line x1="4" y1="6" x2="20" y2="6" />
          <circle cx="8" cy="6" r="2.5" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <circle cx="16" cy="12" r="2.5" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="10" cy="18" r="2.5" />
        </svg>
      );

    case 'play':
      return (
        <svg {...common} fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );

    case 'pause':
      return (
        <svg {...common} fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      );

    case 'truck':
      return (
        <svg {...common}>
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}
