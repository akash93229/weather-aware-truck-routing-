/**
 * Time and date formatting utilities for trip routing and forecast timestamps.
 */

/**
 * Calculates and formats exact departure + N hours timestamp.
 * Defaults to the departure timezone (or system timezone).
 *
 * @param {string} startTimeIso - ISO string of departure time
 * @param {number} hour - Hour offset (0-48)
 * @param {string} [timeZone] - Optional IANA timezone identifier
 * @returns {string} Formatted timestamp string
 */
export function formatSliderTimestamp(startTimeIso, hour, timeZone) {
  if (!startTimeIso) return '';
  try {
    const baseMs = new Date(startTimeIso).getTime();
    if (Number.isNaN(baseMs)) return `Hour +${hour}h`;

    const targetMs = baseMs + Number(hour) * 3600 * 1000;
    const targetDate = new Date(targetMs);

    const tz = timeZone || (typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : 'UTC');

    const weekday = targetDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
    const month = targetDate.toLocaleDateString('en-US', { month: 'short', timeZone: tz });
    const day = targetDate.toLocaleDateString('en-US', { day: 'numeric', timeZone: tz });
    const time = targetDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });

    return `${weekday}, ${month} ${day}, ${time} (${tz})`;
  } catch {
    return `Hour +${hour}h`;
  }
}

/**
 * Formats checkpoint ETA ISO string to localized human-readable string.
 */
export function formatEta(isoStr) {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const tzPart = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return `${datePart}, ${timePart} (${tzPart})`;
  } catch {
    return isoStr;
  }
}
