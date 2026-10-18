import { useState, useCallback, useEffect, useRef } from 'react';
import { formatSliderTimestamp, formatSliderBadge } from '../utils/time';
import { Icon } from '../ui/icons';
import { Switch, IconButton, Button, Tooltip } from '../ui/components';

export default function ForecastSlider({
  startTimeIso,
  originTimezone,
  hoursCount = 49,
  onHourChange,
  showHeatmap,
  onToggleHeatmap,
  isLoadingHeatmap,
  heatmapError,
  onRetryHeatmap,
  isLeftDockOpen = true,
  isRightDockOpen = false,
}) {
  const [currentHour, setCurrentHour] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const intervalRef = useRef(null);

  // If user turns heatmap ON, make sure it is not collapsed
  useEffect(() => {
    if (showHeatmap) {
      setIsCollapsed(false);
    }
  }, [showHeatmap]);

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

  const isExpanded = showHeatmap && !isCollapsed;

  return (
    <div
      className={`forecast-slider-container ${isExpanded ? 'is-expanded' : 'is-pill'} ${isLeftDockOpen ? 'left-dock-open' : 'left-dock-closed'} ${isRightDockOpen ? 'right-dock-open' : ''}`}
      id="forecast-slider-panel"
      role="region"
      aria-label="Corridor Weather Heatmap Controls"
    >
      {!isExpanded ? (
        /* ================= COMPACT PILL (44px) ================= */
        <div className="heatmap-pill-content">
          <Switch
            id="heatmap-layer-toggle"
            checked={Boolean(showHeatmap)}
            onChange={onToggleHeatmap}
            aria-label="Toggle Corridor Weather Heatmap"
          />
          <span
            className="heatmap-pill-title"
            onClick={onToggleHeatmap}
            title="Toggle Corridor Weather Heatmap"
          >
            Corridor Weather Heatmap (0–48h)
          </span>

          {isLoadingHeatmap && (
            <span className="heatmap-status-pill loading" id="heatmap-loading-pill">
              <span className="spinner-mini" /> Loading...
            </span>
          )}

          {heatmapError && (
            <span className="heatmap-status-pill error" id="heatmap-error-pill">
              Failed
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetryHeatmap}
                id="retry-heatmap-btn"
                style={{ padding: '2px 8px', height: 24, fontSize: 11 }}
              >
                Retry
              </Button>
            </span>
          )}

          {showHeatmap && (
            <div className="heatmap-pill-right">
              <span className="hour-offset-tag">+{currentHour}h</span>
              <IconButton
                icon="sliders"
                size={32}
                onClick={() => setIsCollapsed(false)}
                tooltip="Expand controls"
                ariaLabel="Expand heatmap slider"
                id="expand-heatmap-btn"
              />
            </div>
          )}
        </div>
      ) : (
        /* ================= EXPANDED COMPACT CARD (~96px) ================= */
        <div className="heatmap-expanded-card">
          <div className="slider-header-row">
            <div className="slider-header-left">
              <Switch
                id="heatmap-layer-toggle-expanded"
                checked={Boolean(showHeatmap)}
                onChange={onToggleHeatmap}
                aria-label="Toggle Corridor Weather Heatmap"
              />
              <span className="slider-header-title">Corridor Heatmap</span>
            </div>

            <div className="playback-actions">
              <IconButton
                icon={isPlaying ? 'pause' : 'play'}
                size={32}
                onClick={() => setIsPlaying((p) => !p)}
                id="slider-play-pause-btn"
                ariaLabel={isPlaying ? 'Pause 48h animation' : 'Play 48h animation'}
                tooltip={isPlaying ? 'Pause' : 'Play animation'}
                active={isPlaying}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => stepHour(-1)}
                id="slider-prev-hour-btn"
                style={{ height: 30, padding: '0 8px', fontSize: 12 }}
                aria-label="Previous hour"
              >
                -1h
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => stepHour(1)}
                id="slider-next-hour-btn"
                style={{ height: 30, padding: '0 8px', fontSize: 12 }}
                aria-label="Next hour"
              >
                +1h
              </Button>

              <div className="slider-time-badge" id="slider-current-time">
                <span className="hour-offset-tag">+{currentHour}h</span>
                <span className="timestamp-tag">{formatSliderBadge(startTimeIso, currentHour, originTimezone)}</span>
              </div>
            </div>

            <div className="slider-header-right">
              <Tooltip content="Hour 0 = Scheduled Departure Time" position="top">
                <span className="slider-hint-icon" aria-label="Hour 0 = Scheduled Departure Time">
                  <Icon name="info" size={15} />
                </span>
              </Tooltip>
              <IconButton
                icon="close"
                size={28}
                onClick={() => setIsCollapsed(true)}
                tooltip="Collapse to pill"
                ariaLabel="Collapse heatmap controls to pill"
                id="collapse-heatmap-btn"
              />
            </div>
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
              aria-label="Forecast hour slider"
            />
            <div className="slider-ticks">
              <span>0h (Dep)</span>
              <span>12h</span>
              <span>24h</span>
              <span>36h</span>
              <span>48h</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
