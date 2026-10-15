import { useState, useEffect, useRef } from 'react';
import { getGeocode } from '../api/client';

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

// User timezone display derived once at module load
const USER_TIMEZONE = typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : 'UTC';
const TZ_OFFSET_MINUTES = typeof Date !== 'undefined' ? -new Date().getTimezoneOffset() : 0;
const TZ_OFFSET_HOURS = Math.floor(Math.abs(TZ_OFFSET_MINUTES) / 60);
const TZ_OFFSET_MINS = Math.abs(TZ_OFFSET_MINUTES) % 60;
const TZ_OFFSET_SIGN = TZ_OFFSET_MINUTES >= 0 ? '+' : '-';
const TZ_DISPLAY = `${USER_TIMEZONE} (UTC${TZ_OFFSET_SIGN}${String(TZ_OFFSET_HOURS).padStart(2, '0')}:${String(TZ_OFFSET_MINS).padStart(2, '0')})`;

export default function TripForm({ onSubmit, isLoading }) {
  // Autocomplete state for Origin
  const [originQuery, setOriginQuery] = useState('');
  const [originCoord, setOriginCoord] = useState(null); // { lat, lng, display_name }
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [isLoadingOrigin, setIsLoadingOrigin] = useState(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);

  // Autocomplete state for Destination
  const [destQuery, setDestQuery] = useState('');
  const [destCoord, setDestCoord] = useState(null); // { lat, lng, display_name }
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [isLoadingDest, setIsLoadingDest] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  // Form parameters
  const [departureTime, setDepartureTime] = useState(getDefaultDepartureLocal);
  const [loadWeight, setLoadWeight] = useState(42000);
  const [intervalMiles, setIntervalMiles] = useState(25);
  const [scenario, setScenario] = useState('live');

  // Validation error state
  const [formError, setFormError] = useState('');

  // Refs for tracking outside clicks
  const originWrapperRef = useRef(null);
  const destWrapperRef = useRef(null);

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

  // Debounced Origin Geocoding
  useEffect(() => {
    if (!originQuery || originQuery.trim().length < 3 || (originCoord && originCoord.display_name === originQuery)) {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setIsLoadingOrigin(true);
      try {
        const results = await getGeocode(originQuery, controller.signal);
        setOriginSuggestions(results);
        setShowOriginDropdown(results.length > 0);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setOriginSuggestions([]);
          setShowOriginDropdown(false);
        }
      } finally {
        setIsLoadingOrigin(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [originQuery, originCoord]);

  // Debounced Destination Geocoding
  useEffect(() => {
    if (!destQuery || destQuery.trim().length < 3 || (destCoord && destCoord.display_name === destQuery)) {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setIsLoadingDest(true);
      try {
        const results = await getGeocode(destQuery, controller.signal);
        setDestSuggestions(results);
        setShowDestDropdown(results.length > 0);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setDestSuggestions([]);
          setShowDestDropdown(false);
        }
      } finally {
        setIsLoadingDest(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destQuery, destCoord]);

  // Handle example trip (Chicago to Dallas, 42000 lb, 25 mi)
  const handleExampleTrip = () => {
    const chicago = {
      display_name: 'Chicago, Illinois, United States',
      lat: 41.8781,
      lng: -87.6298,
    };
    const dallas = {
      display_name: 'Dallas, Texas, United States',
      lat: 32.7767,
      lng: -96.7970,
    };

    setOriginQuery(chicago.display_name);
    setOriginCoord(chicago);
    setOriginSuggestions([]);
    setShowOriginDropdown(false);

    setDestQuery(dallas.display_name);
    setDestCoord(dallas);
    setDestSuggestions([]);
    setShowDestDropdown(false);

    setLoadWeight(42000);
    setIntervalMiles(25);
    setDepartureTime(getDefaultDepartureLocal());
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!originCoord) {
      setFormError('Please select a valid origin location from the suggestions dropdown.');
      return;
    }

    if (!destCoord) {
      setFormError('Please select a valid destination location from the suggestions dropdown.');
      return;
    }

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

    // Convert local datetime to ISO-8601 string in UTC for the backend
    const departureIso = departureDate.toISOString();

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
      interval_miles: Number(intervalMiles),
      scenario,
    });
  };

  return (
    <form className="trip-form" onSubmit={handleSubmit} id="trip-analysis-form">
      <div className="form-header-row">
        <h2 className="form-section-title">Route Parameters</h2>
        <button
          type="button"
          className="btn-example"
          onClick={handleExampleTrip}
          disabled={isLoading}
          id="try-example-trip-btn"
        >
          Try example trip (Chicago &rarr; Dallas)
        </button>
      </div>

      <div className="form-grid">
        {/* Origin Autocomplete */}
        <div className="form-field autocomplete-field" ref={originWrapperRef}>
          <label htmlFor="origin-input">
            Origin Location
            {originCoord && <span className="coord-badge">&bull; {originCoord.lat.toFixed(4)}, {originCoord.lng.toFixed(4)}</span>}
          </label>
          <div className="input-wrapper">
            <input
              id="origin-input"
              type="text"
              placeholder="e.g. Chicago, IL (type 3+ chars)"
              value={originQuery}
              onChange={(e) => {
                const val = e.target.value;
                setOriginQuery(val);
                setOriginCoord(null);
                if (val.trim().length < 3) {
                  setOriginSuggestions([]);
                  setShowOriginDropdown(false);
                }
              }}
              onFocus={() => originSuggestions.length > 0 && setShowOriginDropdown(true)}
              autoComplete="off"
              required
            />
            {isLoadingOrigin && <span className="input-spinner" />}
          </div>

          {showOriginDropdown && originSuggestions.length > 0 && (
            <ul className="suggestions-dropdown" id="origin-suggestions">
              {originSuggestions.map((item, idx) => (
                <li
                  key={`${item.lat}-${item.lng}-${idx}`}
                  className="suggestion-item"
                  onClick={() => {
                    setOriginQuery(item.display_name);
                    setOriginCoord(item);
                    setShowOriginDropdown(false);
                  }}
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
            {destCoord && <span className="coord-badge">&bull; {destCoord.lat.toFixed(4)}, {destCoord.lng.toFixed(4)}</span>}
          </label>
          <div className="input-wrapper">
            <input
              id="destination-input"
              type="text"
              placeholder="e.g. Dallas, TX (type 3+ chars)"
              value={destQuery}
              onChange={(e) => {
                const val = e.target.value;
                setDestQuery(val);
                setDestCoord(null);
                if (val.trim().length < 3) {
                  setDestSuggestions([]);
                  setShowDestDropdown(false);
                }
              }}
              onFocus={() => destSuggestions.length > 0 && setShowDestDropdown(true)}
              autoComplete="off"
              required
            />
            {isLoadingDest && <span className="input-spinner" />}
          </div>

          {showDestDropdown && destSuggestions.length > 0 && (
            <ul className="suggestions-dropdown" id="destination-suggestions">
              {destSuggestions.map((item, idx) => (
                <li
                  key={`${item.lat}-${item.lng}-${idx}`}
                  className="suggestion-item"
                  onClick={() => {
                    setDestQuery(item.display_name);
                    setDestCoord(item);
                    setShowDestDropdown(false);
                  }}
                >
                  <span className="suggestion-name">{item.display_name}</span>
                  <span className="suggestion-coords">({item.lat.toFixed(3)}, {item.lng.toFixed(3)})</span>
                </li>
              ))}
            </ul>
          )}
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
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            required
          />
        </div>

        {/* Load Weight (lb) */}
        <div className="form-field">
          <label htmlFor="load-weight-input">
            Load Weight (lbs)
            <span className="field-hint">(1 &ndash; 80,000 lbs)</span>
          </label>
          <input
            id="load-weight-input"
            type="number"
            min="1"
            max="80000"
            step="100"
            value={loadWeight}
            onChange={(e) => setLoadWeight(e.target.value)}
            required
          />
        </div>

        {/* Checkpoint Interval */}
        <div className="form-field">
          <label htmlFor="interval-select">Weather Sampling Interval</label>
          <select
            id="interval-select"
            value={intervalMiles}
            onChange={(e) => setIntervalMiles(Number(e.target.value))}
          >
            <option value={10}>Every 10 miles (High resolution)</option>
            <option value={25}>Every 25 miles (Recommended)</option>
            <option value={50}>Every 50 miles (Fast overview)</option>
          </select>
        </div>

        {/* Scenario Select */}
        <div className="form-field">
          <label htmlFor="scenario-select">Weather Simulation Source</label>
          <select
            id="scenario-select"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            <option value="live">Live Forecast (Open-Meteo)</option>
            <option value="storm">Demo scenario: Severe Storm (Phase 4)</option>
            <option value="calm">Demo scenario: Calm Weather (Phase 4)</option>
          </select>
        </div>
      </div>

      {formError && (
        <div className="form-error-banner" id="form-validation-error">
          <span className="error-icon">&times;</span>
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
              <span className="spinner-inline" />
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
