import { useState, useEffect, useRef, useCallback } from 'react';
import { getGeocode, reverseGeocode } from '../api/client';
import { Icon } from '../ui/icons';

/**
 * Returns default departure time string formatted for datetime-local input (now + 1 hour).
 */
function getDefaultDepartureLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

const TZ_DISPLAY = typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : 'UTC';

export default function TripForm({ onSubmit, isLoading, onFormChange, onClearRoutes, prefillTrip }) {
  // Autocomplete state for Origin
  const [originQuery, setOriginQuery] = useState('');
  const [originCoord, setOriginCoord] = useState(null); // { lat, lng, display_name }
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [isLoadingOrigin, setIsLoadingOrigin] = useState(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [originHighlightedIndex, setOriginHighlightedIndex] = useState(-1);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [originError, setOriginError] = useState('');

  // Autocomplete state for Destination
  const [destQuery, setDestQuery] = useState('');
  const [destCoord, setDestCoord] = useState(null); // { lat, lng, display_name }
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [isLoadingDest, setIsLoadingDest] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [destHighlightedIndex, setDestHighlightedIndex] = useState(-1);
  const [destError, setDestError] = useState('');

  // Form parameters
  const [departureTime, setDepartureTime] = useState(getDefaultDepartureLocal);
  const [loadWeight, setLoadWeight] = useState(42000);
  const [intervalMiles, setIntervalMiles] = useState(25);
  const [scenario, setScenario] = useState('live');

  // General validation error state
  const [formError, setFormError] = useState('');

  // Refs for tracking outside clicks and elements
  const originWrapperRef = useRef(null);
  const destWrapperRef = useRef(null);
  const originInputRef = useRef(null);
  const destInputRef = useRef(null);

  // Notify parent component of form parameter changes or clearing
  useEffect(() => {
    if (!originQuery.trim() || !destQuery.trim()) {
      onClearRoutes?.();
    }
    onFormChange?.({
      originQuery,
      originCoord,
      destQuery,
      destCoord,
      departureTime,
      loadWeight,
      intervalMiles,
      scenario,
    });
  }, [
    originQuery,
    originCoord,
    destQuery,
    destCoord,
    departureTime,
    loadWeight,
    intervalMiles,
    scenario,
    onFormChange,
    onClearRoutes,
  ]);

  // Click outside listener to close dropdowns
  useEffect(() => {
    function handleClickOutside(e) {
      if (originWrapperRef.current && !originWrapperRef.current.contains(e.target)) {
        setShowOriginDropdown(false);
      }
      if (destWrapperRef.current && !destWrapperRef.current.contains(e.target)) {
        setShowDestDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle prefilling form from Recent Trips
  useEffect(() => {
    if (!prefillTrip) return;
    if (prefillTrip.origin_label) {
      setOriginQuery(prefillTrip.origin_label);
      setOriginCoord({
        lat: Number(prefillTrip.origin_lat),
        lng: Number(prefillTrip.origin_lon),
        display_name: prefillTrip.origin_label,
      });
      setOriginError('');
    }
    if (prefillTrip.dest_label) {
      setDestQuery(prefillTrip.dest_label);
      setDestCoord({
        lat: Number(prefillTrip.dest_lat),
        lng: Number(prefillTrip.dest_lon),
        display_name: prefillTrip.dest_label,
      });
      setDestError('');
    }
    if (prefillTrip.departure_at) {
      try {
        const d = new Date(prefillTrip.departure_at);
        const pad = (n) => String(n).padStart(2, '0');
        const yyyy = d.getFullYear();
        const MM = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const hh = pad(d.getHours());
        const mm = pad(d.getMinutes());
        setDepartureTime(`${yyyy}-${MM}-${dd}T${hh}:${mm}`);
      } catch {}
    }
    setFormError('');
  }, [prefillTrip]);

  // Debounced Origin Geocoding
  useEffect(() => {
    if (!originQuery || originQuery.trim().length < 3 || (originCoord && originCoord.display_name === originQuery)) {
      setOriginSuggestions([]);
      setIsLoadingOrigin(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingOrigin(true);
    const timer = setTimeout(() => {
      getGeocode(originQuery, controller.signal)
        .then((items) => {
          setOriginSuggestions(items.slice(0, 6));
          setShowOriginDropdown(items.length > 0);
          setOriginHighlightedIndex(-1);
          setIsLoadingOrigin(false);
        })
        .catch((err) => {
          if (err.name !== 'CanceledError' && !controller.signal.aborted) {
            setOriginSuggestions([]);
            setIsLoadingOrigin(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [originQuery, originCoord]);

  // Debounced Destination Geocoding
  useEffect(() => {
    if (!destQuery || destQuery.trim().length < 3 || (destCoord && destCoord.display_name === destQuery)) {
      setDestSuggestions([]);
      setIsLoadingDest(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingDest(true);
    const timer = setTimeout(() => {
      getGeocode(destQuery, controller.signal)
        .then((items) => {
          setDestSuggestions(items.slice(0, 6));
          setShowDestDropdown(items.length > 0);
          setDestHighlightedIndex(-1);
          setIsLoadingDest(false);
        })
        .catch((err) => {
          if (err.name !== 'CanceledError' && !controller.signal.aborted) {
            setDestSuggestions([]);
            setIsLoadingDest(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destQuery, destCoord]);

  // "Use my current location" handler with HTML5 geolocation & reverse geocoding
  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoError('');
    setOriginError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const rev = await reverseGeocode(latitude, longitude);
          const label = rev?.label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setOriginQuery(label);
          setOriginCoord({
            lat: latitude,
            lng: longitude,
            display_name: label,
          });
          setShowOriginDropdown(false);
        } catch (err) {
          const fallbackLabel = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
          setOriginQuery(fallbackLabel);
          setOriginCoord({
            lat: latitude,
            lng: longitude,
            display_name: fallbackLabel,
          });
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setGeoError('Location permission denied. Please search your origin above.');
        } else if (err.code === 2) {
          setGeoError('Location unavailable. Please enter your origin manually.');
        } else if (err.code === 3) {
          setGeoError('Location request timed out. Please try again.');
        } else {
          setGeoError('Could not retrieve your location. Please enter manually.');
        }
      },
      {
        timeout: 10000,
        enableHighAccuracy: false,
      }
    );
  }, []);

  const handleExampleTrip = () => {
    setOriginQuery('Chicago, IL');
    setOriginCoord({
      lat: 41.8781,
      lng: -87.6298,
      display_name: 'Chicago, IL',
    });
    setOriginError('');

    setDestQuery('Dallas, TX');
    setDestCoord({
      lat: 32.7767,
      lng: -96.797,
      display_name: 'Dallas, TX',
    });
    setDestError('');

    setFormError('');
    setGeoError('');
    setShowOriginDropdown(false);
    setShowDestDropdown(false);
  };

  const handleOriginKeyDown = (e) => {
    if (!showOriginDropdown || originSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOriginHighlightedIndex((prev) => (prev < originSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOriginHighlightedIndex((prev) => (prev > 0 ? prev - 1 : originSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (originHighlightedIndex >= 0 && originSuggestions[originHighlightedIndex]) {
        e.preventDefault();
        const item = originSuggestions[originHighlightedIndex];
        setOriginQuery(item.display_name);
        setOriginCoord(item);
        setOriginError('');
        setShowOriginDropdown(false);
      }
    } else if (e.key === 'Escape') {
      setShowOriginDropdown(false);
    }
  };

  const handleDestKeyDown = (e) => {
    if (!showDestDropdown || destSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestHighlightedIndex((prev) => (prev < destSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestHighlightedIndex((prev) => (prev > 0 ? prev - 1 : destSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (destHighlightedIndex >= 0 && destSuggestions[destHighlightedIndex]) {
        e.preventDefault();
        const item = destSuggestions[destHighlightedIndex];
        setDestQuery(item.display_name);
        setDestCoord(item);
        setDestError('');
        setShowDestDropdown(false);
      }
    } else if (e.key === 'Escape') {
      setShowDestDropdown(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    setOriginError('');
    setDestError('');

    let hasValidationError = false;

    // Inline validation without native browser bubbles
    if (!originQuery.trim()) {
      setOriginError('Choose an origin from the suggestions');
      originInputRef.current?.focus();
      hasValidationError = true;
    } else if (!originCoord) {
      setOriginError('Please select a valid place from the suggestions dropdown');
      originInputRef.current?.focus();
      hasValidationError = true;
    }

    if (!destQuery.trim()) {
      setDestError('Choose a destination from the suggestions');
      if (!hasValidationError) destInputRef.current?.focus();
      hasValidationError = true;
    } else if (!destCoord) {
      setDestError('Please select a valid place from the suggestions dropdown');
      if (!hasValidationError) destInputRef.current?.focus();
      hasValidationError = true;
    }

    if (hasValidationError) return;

    if (
      Math.abs(originCoord.lat - destCoord.lat) < 0.001 &&
      Math.abs(originCoord.lng - destCoord.lng) < 0.001
    ) {
      setFormError('Origin and destination cannot be the same location.');
      return;
    }

    const weight = Number(loadWeight);
    if (Number.isNaN(weight) || weight < 1 || weight > 80000) {
      setFormError('Load weight must be between 1 and 80,000 lbs.');
      return;
    }

    if (!departureTime) {
      setFormError('Please specify a departure date and time.');
      return;
    }

    const departureDate = new Date(departureTime);
    if (Number.isNaN(departureDate.getTime())) {
      setFormError('Invalid departure date/time format.');
      return;
    }

    const departureIso = departureDate.toISOString();

    let computedInterval = Number(intervalMiles);
    if (intervalMiles === 'auto' || Number.isNaN(computedInterval)) {
      const dlat = (destCoord.lat - originCoord.lat) * 69.0;
      const dlng = (destCoord.lng - originCoord.lng) * 53.0;
      const straightMiles = Math.sqrt(dlat * dlat + dlng * dlng);
      computedInterval = straightMiles < 150 ? 10 : straightMiles < 600 ? 25 : 50;
    }

    onSubmit({
      origin: {
        lat: originCoord.lat,
        lng: originCoord.lng,
        label: originCoord.display_name,
      },
      destination: {
        lat: destCoord.lat,
        lng: destCoord.lng,
        label: destCoord.display_name,
      },
      departure_time: departureIso,
      load_weight_lb: weight,
      interval_miles: computedInterval,
      scenario,
    });
  };

  return (
    <form className="trip-form" onSubmit={handleSubmit} id="trip-analysis-form" noValidate>
      <div className="form-header-row">
        <h3 className="form-section-title">Route</h3>
        <button
          type="button"
          className="btn-example"
          onClick={handleExampleTrip}
          disabled={isLoading}
          id="try-example-trip-btn"
        >
          Try example trip (Chicago → Dallas)
        </button>
      </div>

      <div className="form-grid">
        {/* Origin Autocomplete */}
        <div className="form-field autocomplete-field" ref={originWrapperRef}>
          <label htmlFor="origin-input">
            Origin Location
            {originCoord && (
              <span className="coord-badge">• {originCoord.lat.toFixed(4)}, {originCoord.lng.toFixed(4)}</span>
            )}
          </label>

          <div className="input-wrapper">
            <input
              ref={originInputRef}
              id="origin-input"
              type="text"
              className={`form-text-input ${originError ? 'has-error' : ''}`}
              placeholder="e.g. Indore, India (type 3+ chars)"
              value={originQuery}
              onChange={(e) => {
                const val = e.target.value;
                setOriginQuery(val);
                setOriginCoord(null);
                setOriginError('');
                if (val.trim().length < 3) {
                  setOriginSuggestions([]);
                  setShowOriginDropdown(false);
                }
              }}
              onFocus={() => originSuggestions.length > 0 && setShowOriginDropdown(true)}
              onKeyDown={handleOriginKeyDown}
              autoComplete="off"
            />

            <div className="input-actions-group">
              {originQuery && (
                <button
                  type="button"
                  className="icon-btn btn-clear-input"
                  onClick={() => {
                    setOriginQuery('');
                    setOriginCoord(null);
                    setOriginSuggestions([]);
                    setShowOriginDropdown(false);
                    setOriginError('');
                    originInputRef.current?.focus();
                  }}
                  title="Clear origin"
                  aria-label="Clear origin"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}

              <button
                type="button"
                className="icon-btn btn-locate-inline"
                onClick={handleUseCurrentLocation}
                disabled={isLocating || isLoading}
                title="Use my current location"
                aria-label="Use my current location"
              >
                {isLocating ? (
                  <span className="spinner-mini" aria-hidden="true" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="crosshair-icon" aria-hidden="true">
                    <circle cx="12" cy="12" r="7" />
                    <line x1="12" y1="2" x2="12" y2="5" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="5" y2="12" />
                    <line x1="19" y1="12" x2="22" y2="12" />
                  </svg>
                )}
              </button>
            </div>

            {isLoadingOrigin && <span className="input-spinner" />}
          </div>

          {originError && (
            <p className="field-error-text" role="alert" id="origin-error-msg">
              {originError}
            </p>
          )}

          {geoError && (
            <p className="inline-geo-error" role="alert">
              {geoError}
            </p>
          )}

          {showOriginDropdown && originSuggestions.length > 0 && (
            <ul className="suggestions-dropdown" id="origin-suggestions" role="listbox">
              {originSuggestions.map((item, idx) => (
                <li
                  key={`${item.lat}-${item.lng}-${idx}`}
                  className={`suggestion-item ${originHighlightedIndex === idx ? 'highlighted' : ''}`}
                  onClick={() => {
                    setOriginQuery(item.display_name);
                    setOriginCoord(item);
                    setOriginError('');
                    setShowOriginDropdown(false);
                  }}
                  role="option"
                  aria-selected={originHighlightedIndex === idx}
                >
                  <span className="suggestion-name">{item.display_name}</span>
                  <span className="suggestion-coords">({item.lat.toFixed(3)}, {item.lng.toFixed(3)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Destination Autocomplete */}
        <div className="form-field autocomplete-field" ref={destWrapperRef}>
          <label htmlFor="destination-input">
            Destination Location
            {destCoord && (
              <span className="coord-badge">• {destCoord.lat.toFixed(4)}, {destCoord.lng.toFixed(4)}</span>
            )}
          </label>

          <div className="input-wrapper">
            <input
              ref={destInputRef}
              id="destination-input"
              type="text"
              className={`form-text-input ${destError ? 'has-error' : ''}`}
              placeholder="e.g. Mumbai, India (type 3+ chars)"
              value={destQuery}
              onChange={(e) => {
                const val = e.target.value;
                setDestQuery(val);
                setDestCoord(null);
                setDestError('');
                if (val.trim().length < 3) {
                  setDestSuggestions([]);
                  setShowDestDropdown(false);
                }
              }}
              onFocus={() => destSuggestions.length > 0 && setShowDestDropdown(true)}
              onKeyDown={handleDestKeyDown}
              autoComplete="off"
            />

            <div className="input-actions-group">
              {destQuery && (
                <button
                  type="button"
                  className="icon-btn btn-clear-input"
                  onClick={() => {
                    setDestQuery('');
                    setDestCoord(null);
                    setDestSuggestions([]);
                    setShowDestDropdown(false);
                    setDestError('');
                    destInputRef.current?.focus();
                  }}
                  title="Clear destination"
                  aria-label="Clear destination"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {isLoadingDest && <span className="input-spinner" />}
          </div>

          {destError && (
            <p className="field-error-text" role="alert" id="dest-error-msg">
              {destError}
            </p>
          )}

          {showDestDropdown && destSuggestions.length > 0 && (
            <ul className="suggestions-dropdown" id="destination-suggestions" role="listbox">
              {destSuggestions.map((item, idx) => (
                <li
                  key={`${item.lat}-${item.lng}-${idx}`}
                  className={`suggestion-item ${destHighlightedIndex === idx ? 'highlighted' : ''}`}
                  onClick={() => {
                    setDestQuery(item.display_name);
                    setDestCoord(item);
                    setDestError('');
                    setShowDestDropdown(false);
                  }}
                  role="option"
                  aria-selected={destHighlightedIndex === idx}
                >
                  <span className="suggestion-name">{item.display_name}</span>
                  <span className="suggestion-coords">({item.lat.toFixed(3)}, {item.lng.toFixed(3)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Departure and load Section */}
        <div className="form-section-divider" style={{ gridColumn: '1 / -1', margin: '8px 0 4px 0' }}>
          <h3 className="form-section-title">Departure and load</h3>
        </div>

        {/* Departure DateTime */}
        <div className="form-field">
          <label htmlFor="departure-time-input">
            Departure Date & Time
            <span className="field-hint">({TZ_DISPLAY})</span>
          </label>
          <input
            id="departure-time-input"
            type="datetime-local"
            className="form-text-input"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
          />
        </div>

        {/* Load Weight (lb) */}
        <div className="form-field">
          <label htmlFor="load-weight-input">
            Load Weight (lbs)
            <span className="field-hint">(1 – 80,000 lbs)</span>
          </label>
          <input
            id="load-weight-input"
            type="number"
            className="form-text-input"
            min="1"
            max="80000"
            step="100"
            value={loadWeight}
            onChange={(e) => setLoadWeight(e.target.value)}
          />
        </div>

        {/* Checkpoint Interval */}
        <div className="form-field">
          <label htmlFor="interval-select">Weather Sampling Interval</label>
          <select
            id="interval-select"
            className="form-select-input"
            value={intervalMiles}
            onChange={(e) => {
              const val = e.target.value;
              setIntervalMiles(val === 'auto' ? 'auto' : Number(val));
            }}
          >
            <option value="auto">Auto (Smart adaptation based on trip distance)</option>
            <option value={10}>Every 10 miles (High resolution)</option>
            <option value={25}>Every 25 miles (Recommended)</option>
            <option value={50}>Every 50 miles (Fast overview)</option>
          </select>
        </div>

        {/* Weather source Section */}
        <div className="form-section-divider" style={{ gridColumn: '1 / -1', margin: '8px 0 4px 0' }}>
          <h3 className="form-section-title">Weather source</h3>
        </div>

        {/* Scenario Select */}
        <div className="form-field">
          <label htmlFor="scenario-select">Weather Simulation Source</label>
          <select
            id="scenario-select"
            className="form-select-input"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >

            <option value="live">Live forecast (Open-Meteo)</option>
            <option value="storm">Demo: Severe Storm (Phase 4)</option>
            <option value="calm">Demo: Calm Weather (Phase 4)</option>
          </select>
        </div>
      </div>

      {formError && (
        <div className="form-error-banner" id="form-validation-error" role="alert">
          <span className="error-icon" aria-hidden="true"><Icon name="close" size={14} /></span>
          <span>{formError}</span>
        </div>
      )}

      <div className="form-submit-row">
        <button
          type="submit"
          className="btn-submit"
          disabled={isLoading}
          id="analyze-trip-btn"
        >
          {isLoading ? (
            <span className="btn-loading-content">
              <span className="spinner-inline" aria-hidden="true" />
              Analyzing Weather & Safety Across 3 Routes...
            </span>
          ) : (
            'Analyze Routes & Weather Risk'
          )}
        </button>
      </div>
    </form>
  );
}
