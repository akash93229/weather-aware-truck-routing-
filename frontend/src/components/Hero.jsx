import Logo from './Logo';

export default function Hero({ onPlanTripClick, onClose, isVisible = true }) {
  if (!isVisible) return null;

  return (
    <section className="hero-section" id="hero-banner">
      <div className="hero-backdrop-glow" />
      {onClose && (
        <button
          type="button"
          className="hero-close-btn"
          onClick={onClose}
          id="hero-close-btn"
          aria-label="Close overview"
        >
          ✕
        </button>
      )}
      <div className="hero-content">
        <div className="hero-logo-row">
          <Logo size="large" showWordmark={false} />
          <h1 className="hero-title">
            <span className="hero-title-first">Storm</span>
            <span className="hero-title-accent">Lane</span>
          </h1>
        </div>

        <p className="hero-tagline">
          Real-time weather intelligence for commercial truck drivers. Balance storm hazards, wind blowover risk, and travel time across 3 distinct routes.
        </p>

        <div className="hero-cta-row">
          <button
            type="button"
            className="hero-primary-btn"
            id="hero-plan-trip-btn"
            onClick={onPlanTripClick}
          >
            Plan a Trip &rarr;
          </button>
        </div>

        <div className="hero-chips-grid">
          <div className="hero-chip" id="chip-routes">
            <span className="chip-icon">🚚</span>
            <div className="chip-text">
              <strong>3 Distinct Truck Routes</strong>
              <span>Fastest & safer alternatives</span>
            </div>
          </div>

          <div className="hero-chip" id="chip-weather">
            <span className="chip-icon">⏱</span>
            <div className="chip-text">
              <strong>Weather at Exact ETA</strong>
              <span>Per-checkpoint forecast sampling</span>
            </div>
          </div>

          <div className="hero-chip" id="chip-heatmap">
            <span className="chip-icon">🌡</span>
            <div className="chip-text">
              <strong>48-Hour Corridor Heatmap</strong>
              <span>Smooth zero-network time slider</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
