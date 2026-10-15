export default function Logo({ size = 'medium', showWordmark = true }) {
  const iconSizes = {
    small: { width: 28, height: 28 },
    medium: { width: 34, height: 34 },
    large: { width: 44, height: 44 },
  };

  const { width, height } = iconSizes[size] || iconSizes.medium;

  return (
    <div className={`stormlane-logo-container size-${size}`} id="stormlane-logo">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        width={width}
        height={height}
        fill="none"
        aria-hidden="true"
        className="logo-icon-svg"
      >
        <defs>
          <linearGradient id="logoShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="45%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="logoBoltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="50%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <linearGradient id="logoGlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        {/* Pin Body / Fleet Shield */}
        <path
          d="M24 3C13.5 3 5 11.5 5 22c0 13.5 17.2 22.8 18.1 23.3.5.3 1.3.3 1.8 0C25.8 44.8 43 35.5 43 22 43 11.5 34.5 3 24 3z"
          fill="url(#logoGlowGrad)"
          stroke="url(#logoShieldGrad)"
          strokeWidth="2.75"
        />

        {/* Semi Truck Cab Silhouette */}
        <path
          d="M13 29h12.5v-9h-7l-3.5 4.5V29zm14.5-9v9h7v-4.5c0-.8-.7-1.5-1.5-1.5H31v-3h-3.5z"
          fill="#cbd5e1"
        />

        {/* Wheel Hubs */}
        <circle cx="17.5" cy="29.5" r="2.6" fill="#38bdf8" />
        <circle cx="17.5" cy="29.5" r="1.1" fill="#0f172a" />
        <circle cx="31" cy="29.5" r="2.6" fill="#10b981" />
        <circle cx="31" cy="29.5" r="1.1" fill="#0f172a" />

        {/* Dynamic Storm Lightning Arrow */}
        <path
          d="M27.5 7.5l-6.5 9.5h5.5l-3.5 8.5 9-11h-5.5l3.5-7z"
          fill="url(#logoBoltGrad)"
          filter="drop-shadow(0 0 3px rgba(249, 115, 22, 0.6))"
        />
      </svg>

      {showWordmark && (
        <div className="wordmark-group">
          <span className="brand-title">
            <span className="brand-first">Storm</span>
            <span className="brand-accent">Lane</span>
          </span>
          <span className="brand-subtitle">Weather-Aware Truck Routing</span>
        </div>
      )}
    </div>
  );
}
