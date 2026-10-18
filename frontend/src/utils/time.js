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
export function getTimezoneForCoordinate(lat, lng, label) {
  const l = (label || '').toLowerCase();
  if (l.includes('chicago') || l.includes('dallas') || l.includes('houston') || l.includes('st. louis') || l.includes('saint louis')) return 'America/Chicago';
  if (l.includes('vegas') || l.includes('los angeles') || l.includes('francisco') || l.includes('seattle')) return 'America/Los_Angeles';
  if (l.includes('denver') || l.includes('phoenix')) return 'America/Denver';
  if (l.includes('miami') || l.includes('new york') || l.includes('boston')) return 'America/New_York';
  if (l.includes('delhi') || l.includes('mumbai') || l.includes('bhopal') || l.includes('indore')) return 'Asia/Kolkata';
  if (l.includes('london')) return 'Europe/London';
  if (l.includes('paris')) return 'Europe/Paris';
  if (l.includes('tokyo') || l.includes('osaka')) return 'Asia/Tokyo';
  if (l.includes('dubai') || l.includes('abu dhabi')) return 'Asia/Dubai';
  if (l.includes('sao paulo') || l.includes('são paulo') || l.includes('rio')) return 'America/Sao_Paulo';
  if (l.includes('fairbanks') || l.includes('prudhoe')) return 'America/Anchorage';
  if (l.includes('honolulu')) return 'Pacific/Honolulu';

  if (lat != null && lng != null) {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isNaN(nLat) && !Number.isNaN(nLng)) {
      if (nLat > 52 && nLng < -130) return 'America/Anchorage';
      if (nLat >= 18 && nLat <= 23 && nLng >= -161 && nLng <= -154) return 'Pacific/Honolulu';
      if (nLat >= 24 && nLat <= 50) {
        if (nLng < -114.5) return 'America/Los_Angeles';
        if (nLng < -102.0) return 'America/Denver';
        if (nLng < -85.5) return 'America/Chicago';
        if (nLng < -65.0) return 'America/New_York';
      }
      if (nLat >= 49 && nLat <= 61 && nLng >= -11 && nLng <= 2) return 'Europe/London';
      if (nLat >= 42 && nLat <= 55 && nLng >= 0 && nLng <= 15) return 'Europe/Paris';
      if (nLat >= 6 && nLat <= 38 && nLng >= 68 && nLng <= 98) return 'Asia/Kolkata';
      if (nLat >= 30 && nLat <= 46 && nLng >= 128 && nLng <= 146) return 'Asia/Tokyo';
      if (nLat >= 22 && nLat <= 27 && nLng >= 51 && nLng <= 57) return 'Asia/Dubai';
      if (nLat >= -35 && nLat <= 5 && nLng >= -75 && nLng <= -34) return 'America/Sao_Paulo';
    }
  }
  return 'UTC';
}

export function getTimezoneAbbr(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: timeZone || 'UTC',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : timeZone;
  } catch {
    return timeZone || 'UTC';
  }
}

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
 * Formats slider badge display: e.g. ", 3:58 PM (CDT)"
 */
export function formatSliderBadge(startTimeIso, hour, timeZone) {
  if (!startTimeIso) return '';
  try {
    const baseMs = new Date(startTimeIso).getTime();
    if (Number.isNaN(baseMs)) return '';

    const targetMs = baseMs + Number(hour) * 3600 * 1000;
    const targetDate = new Date(targetMs);
    const tz = timeZone || (typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : 'UTC');
    const timeStr = targetDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    });
    const tzAbbr = getTimezoneAbbr(targetDate, tz);
    return `, ${timeStr} (${tzAbbr})`;
  } catch {
    return '';
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
