import { useState, useCallback, useEffect, useRef } from 'react';

function formatSliderTimestamp(startTimeIso, hour) {
  if (!startTimeIso) return '';
  try {
    const baseMs = new Date(startTimeIso).getTime();
    const targetDate = new Date(baseMs + hour * 3600 * 1000);

    const weekday = targetDate.toLocaleDateString(undefined, { weekday: 'short' });
    const day = targetDate.getDate();
    const month = targetDate.toLocaleDateString(undefined, { month: 'short' });
    const time = targetDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    return `${weekday}, ${month} ${day}, ${time} (${tz})`;
  } catch {
    return `Hour +${hour}h`;
  }
}

export default function ForecastSlider({
  startTimeIso,
  hoursCount = 49,
  onHourChange,
  showHeatmap,
  onToggleHeatmap,
  isLoadingHeatmap,
  heatmapError,
  onRetryHeatmap,
}) {
  const [currentHour, setCurrentHour] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef(null);

  const handleSliderInput = useCallback((e) => {
    const val = Number(e.target.value);
    setCurrentHour(val);
    if (onHourChange) {
      onHourChange(val);
    }
  }, [onHourChange]);

  const stepHour = useCallback((delta) => {
    setCurrentHour((prev) => {
      const next = Math.max(0, Math.min(hoursCount - 1, prev + delta));
      if (onHourChange) {
        onHourChange(next);
      }
      return next;
    });
  }, [hoursCount, onHourChange]);

  // Auto-play animation through 48 hours
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentHour((prev) => {
        const next = prev >= hoursCount - 1 ? 0 : prev + 1;
        if (onHourChange) {
          onHourChange(next);
        }
        return next;
      });
    }, 450);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, hoursCount, onHourChange]);

  return (
    <div className="forecast-slider-panel" id="forecast-slider-panel">
      <div className="slider-top-row">
        <div className="toggle-group">
          <label className="toggle-label" htmlFor="heatmap-layer-toggle">
            <input
              id="heatmap-layer-toggle"
              type="checkbox"
              checked={showHeatmap}
              onChange={onToggleHeatmap}
              className="toggle-checkbox"
            />
            <span className="toggle-title">Corridor Weather Heatmap (0&ndash;48h)</span>
          </label>

          {isLoadingHeatmap && (
            <span className="heatmap-status-pill loading" id="heatmap-loading-pill">
              <span className="spinner-mini" /> Loading 48h forecast...
            </span>
          )}

          {heatmapError && (
            <span className="heatmap-status-pill error" id="heatmap-error-pill">
              Failed to load heatmap
              <button
                type="button"
                className="btn-retry-mini"
                onClick={onRetryHeatmap}
                id="retry-heatmap-btn"
              >
                Retry
              </button>
            </span>
          )}
        </div>

        {showHeatmap && !isLoadingHeatmap && !heatmapError && startTimeIso && (
          <div className="slider-time-badge" id="slider-current-time">
            <span className="hour-offset-tag">+{currentHour}h</span>
            <span className="timestamp-tag">{formatSliderTimestamp(startTimeIso, currentHour)}</span>
          </div>
        )}
      </div>

      {showHeatmap && !isLoadingHeatmap && !heatmapError && startTimeIso && (
        <div className="slider-controls-wrap">
          <div className="playback-actions">
            <button
              type="button"
              className="btn-step"
              onClick={() => stepHour(-1)}
              title="Previous Hour"
              id="slider-prev-hour-btn"
            >
              &larr; -1h
            </button>
            <button
              type="button"
              className={`btn-play ${isPlaying ? 'active' : ''}`}
              onClick={() => setIsPlaying((p) => !p)}
              id="slider-play-pause-btn"
              title={isPlaying ? 'Pause animation' : 'Play 48h animation'}
            >
              {isPlaying ? '&#10074;&#10074; Pause' : '&#9658; Animate'}
            </button>
            <button
              type="button"
              className="btn-step"
              onClick={() => stepHour(1)}
              title="Next Hour"
              id="slider-next-hour-btn"
            >
              +1h &rarr;
            </button>
          </div>

          <div className="slider-track-wrap">
            <input
              type="range"
              id="forecast-hour-slider"
              min={0}
              max={hoursCount - 1}
              step={1}
              value={currentHour}
              onInput={handleSliderInput}
              onChange={handleSliderInput}
              className="time-slider"
            />
            <div className="slider-ticks">
              <span>0h (Departure)</span>
              <span>12h</span>
              <span>24h</span>
              <span>36h</span>
              <span>48h</span>
            </div>
          </div>

          <div className="slider-legend-hint">
            <span className="hint-pill">&#9432; Hour 0 = Scheduled Departure Time</span>
          </div>
        </div>
      )}
    </div>
  );
}
