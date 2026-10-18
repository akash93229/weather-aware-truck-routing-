import { useState, useEffect, useRef } from 'react';
import './home.css';

const RISK_LEVELS = [
  { level: 0, label: 'Low', color: '#10b981' },
  { level: 1, label: 'Moderate', color: '#0ea5e9' },
  { level: 2, label: 'High', color: '#eab308' },
  { level: 3, label: 'Severe', color: '#f97316' },
  { level: 4, label: 'No Travel', color: '#ef4444' },
];

export default function Home({ onLaunch }) {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef(null);
  const launchedRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Initialize video volume and muted state on mount via ref
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.defaultMuted = true;
      videoRef.current.volume = 0.5;
    }
  }, []);

  // Check prefers-reduced-motion and Save-Data on mount
  useEffect(() => {
    const isReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const isSaveData = Boolean(
      navigator.connection && (navigator.connection.saveData || navigator.connection.effectiveType === '2g')
    );

    if (isReducedMotion || isSaveData) {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }
  }, []);

  // Pause video when tab is hidden, resume when tab is active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!videoRef.current) return;
      if (document.hidden) {
        videoRef.current.pause();
      } else {
        const isReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (!isReducedMotion && !launchedRef.current) {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {});
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Continuous playback watchdog: resumes playback on stall/pause if tab is visible and not launched
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleStallOrPause = () => {
      if (document.hidden || launchedRef.current) return;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (!document.hidden && !launchedRef.current && video.paused) {
          const p = video.play();
          if (p !== undefined) p.catch(() => {});
        }
      }, 100);
    };

    video.addEventListener('pause', handleStallOrPause);
    video.addEventListener('stalled', handleStallOrPause);
    video.addEventListener('waiting', handleStallOrPause);
    video.addEventListener('suspend', handleStallOrPause);

    return () => {
      video.removeEventListener('pause', handleStallOrPause);
      video.removeEventListener('stalled', handleStallOrPause);
      video.removeEventListener('waiting', handleStallOrPause);
      video.removeEventListener('suspend', handleStallOrPause);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Ensure audio and playback are stopped upon component unmount
  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      if (videoEl) {
        videoEl.pause();
        videoEl.muted = true;
      }
    };
  }, []);

  // Sound toggle handler: controls muted state strictly via DOM ref
  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!isAudioOn) {
      // Toggle ON
      setSoundBlocked(false);
      video.muted = false;
      video.volume = 0.5;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsAudioOn(true);
          })
          .catch(() => {
            // Browser policy blocked unmuted playback: fall back to muted and notify user
            video.muted = true;
            video.play().catch(() => {});
            setIsAudioOn(false);
            setSoundBlocked(true);
            setTimeout(() => setSoundBlocked(false), 3500);
          });
      } else {
        setIsAudioOn(true);
      }
    } else {
      // Toggle OFF
      video.muted = true;
      setIsAudioOn(false);
      setSoundBlocked(false);
    }
  };

  // Launch transition handler: pauses and mutes video before starting planner
  const handleLaunch = (opts) => {
    launchedRef.current = true;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.muted = true;
    }
    onLaunch?.(opts);
  };

  // Keyboard shortcut: Pressing Enter on the page triggers Launch Planner
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleLaunch();
    }
  };

  return (
    <div
      className="sl-home"
      id="stormlane-home"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="StormLane Welcome Page"
    >
      {/* Background Storm Video (watermark cropped via CSS transform scale & origin) */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        className={`sl-home-video ${videoLoaded ? 'loaded' : ''}`}
        onCanPlay={() => setVideoLoaded(true)}
      >
        <source src="/videos/weather.mp4" type="video/mp4" />
      </video>

      {/* Centered Readability & Contrast Gradient Overlay */}
      <div className="sl-home-overlay" aria-hidden="true" />

      {/* Main Liquid-Glass Stage (3 Clear Visual Layers) */}
      <div className="sl-home-stage">
        {/* Layer 1: Top Header */}
        <header className="sl-header">
          <div className="sl-brand">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
              className="sl-logo-svg"
            >
              <defs>
                <linearGradient id="slLogoShield" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="45%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="slLogoBolt" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fde047" />
                  <stop offset="50%" stopColor="#fb923c" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
                <linearGradient id="slLogoBg" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <path
                d="M24 3C13.5 3 5 11.5 5 22c0 13.5 17.2 22.8 18.1 23.3.5.3 1.3.3 1.8 0C25.8 44.8 43 35.5 43 22 43 11.5 34.5 3 24 3z"
                fill="url(#slLogoBg)"
                stroke="url(#slLogoShield)"
                strokeWidth="2.75"
              />
              <path
                d="M13 29h12.5v-9h-7l-3.5 4.5V29zm14.5-9v9h7v-4.5c0-.8-.7-1.5-1.5-1.5H31v-3h-3.5z"
                fill="#cbd5e1"
              />
              <circle cx="17.5" cy="29.5" r="2.6" fill="#38bdf8" />
              <circle cx="17.5" cy="29.5" r="1.1" fill="#0f172a" />
              <circle cx="31" cy="29.5" r="2.6" fill="#10b981" />
              <circle cx="31" cy="29.5" r="1.1" fill="#0f172a" />
              <path
                d="M27.5 7.5l-6.5 9.5h5.5l-3.5 8.5 9-11h-5.5l3.5-7z"
                fill="url(#slLogoBolt)"
              />
            </svg>
            <div className="sl-brand-info">
              <span className="sl-brand-name">StormLane</span>
              <span className="sl-brand-caption">WEATHER-AWARE TRUCK ROUTING</span>
            </div>
          </div>

          {/* Sound Toggle Button */}
          <button
            type="button"
            className="sl-sound-btn"
            onClick={toggleSound}
            aria-label={isAudioOn ? 'Turn sound off' : 'Turn sound on'}
            aria-pressed={isAudioOn}
            id="home-sound-toggle-btn"
          >
            <div className="sl-sound-icons" aria-hidden="true">
              {/* Speaker Waves (Active when sound is on) */}
              <svg
                className={`sl-sound-icon sl-sound-icon-on ${isAudioOn ? 'active' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              {/* Speaker Muted (Active when sound is off) */}
              <svg
                className={`sl-sound-icon sl-sound-icon-off ${!isAudioOn ? 'active' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            </div>
            <span className="sl-sound-tooltip" role="tooltip">
              {soundBlocked
                ? 'Sound blocked by browser, click again'
                : isAudioOn
                ? 'Sound off'
                : 'Sound on'}
            </span>
          </button>
        </header>

        {/* Layer 2: Centered Hero Block */}
        <main className="sl-hero">
          <div className="sl-glass-chip sl-hero-chip">
            <span>Weather-Aware Routing</span>
          </div>

          <h1 className="sl-h1">
            <span className="sl-line-mask">
              <span className="sl-line sl-line-1">Route smarter</span>
            </span>
            <span className="sl-line-mask">
              <span className="sl-line sl-line-2">around the weather</span>
            </span>
          </h1>

          <p className="sl-blurb">
            Compare the fastest and alternative truck routes with live weather along the whole corridor.
            See risk from Low to No Travel for the next 48 hours before you ever leave the yard.
          </p>

          <div className="sl-hero-buttons">
            <button
              type="button"
              className="sl-btn sl-btn-primary"
              onClick={() => handleLaunch()}
              id="home-hero-launch-btn"
              aria-label="Launch Route Planner"
            >
              <span>Launch Planner</span>
              <svg
                className="sl-btn-arrow"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4.167 10h11.666m-4.166-4.167L15.833 10l-4.166 4.167"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className="sl-btn sl-btn-ghost"
              onClick={() => handleLaunch({ exampleTrip: true })}
              id="home-try-example-btn"
              aria-label="Try example trip from Chicago to Dallas"
            >
              <span>Try example trip (Chicago → Dallas)</span>
            </button>
          </div>
        </main>

        {/* Layer 3: Bottom Information Group */}
        {/* Feature Row (3 compact glass cards) */}
        <section className="sl-features" aria-label="Key Capabilities">
          <ul className="sl-features-row">
            {/* Feature 1 */}
            <li className="sl-glass-card sl-feature-card sl-sheen">
              <div className="sl-feature-icon-wrap" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="sl-feature-icon"
                >
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  <path d="M7 19v2M12 19v2M17 19v2" />
                </svg>
              </div>
              <div className="sl-feature-content">
                <h2 className="sl-feature-title">Corridor Weather Heatmap</h2>
                <p className="sl-feature-sub">0–48h along your route</p>
              </div>
            </li>

            {/* Feature 2 */}
            <li className="sl-glass-card sl-feature-card sl-sheen">
              <div className="sl-feature-icon-wrap" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="sl-feature-icon"
                >
                  <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
                  <path d="m13 11-4 6h6l-4 6" />
                </svg>
              </div>
              <div className="sl-feature-content">
                <h2 className="sl-feature-title">Live Forecast</h2>
                <p className="sl-feature-sub">Open-Meteo, sampled every 25 miles</p>
              </div>
            </li>

            {/* Feature 3 */}
            <li className="sl-glass-card sl-feature-card sl-sheen">
              <div className="sl-feature-icon-wrap" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="sl-feature-icon"
                >
                  <circle cx="6" cy="19" r="3" />
                  <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H7a4.5 4.5 0 0 1 0-9H15" />
                  <circle cx="18" cy="5" r="3" />
                </svg>
              </div>
              <div className="sl-feature-content">
                <h2 className="sl-feature-title">Smart Routing</h2>
                <p className="sl-feature-sub">TomTom: fastest + 2 alternatives, scored for weather</p>
              </div>
            </li>
          </ul>
        </section>

        {/* Risk Scale Pill (Single slim element) */}
        <section className="sl-risk-section" aria-label="Hazard Risk Scale">
          <div className="sl-risk-pill">
            <span className="sl-risk-pill-caption">RISK SCALE</span>
            {RISK_LEVELS.map((item) => (
              <div key={item.level} className="sl-risk-item" title={`${item.label} Hazard Risk`}>
                <span
                  className="sl-risk-dot"
                  style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}` }}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Footer Credit Line */}
        <footer className="sl-footer">
          <span>Map data: OpenStreetMap · OpenFreeMap · Esri | Weather: Open-Meteo | Routing: TomTom</span>
        </footer>
      </div>
    </div>
  );
}
