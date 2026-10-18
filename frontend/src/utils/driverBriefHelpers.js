/**
 * Helpers for Driver Brief: Unit conversion, 48h chip mapping, and status mapping.
 */

export function fahrenheitToCelsius(f) {
  if (typeof f !== 'number' || isNaN(f)) return 0;
  return ((f - 32) * 5) / 9;
}

export function celsiusToFahrenheit(c) {
  if (typeof c !== 'number' || isNaN(c)) return 32;
  return (c * 9) / 5 + 32;
}

export function convertTemp(f, unit = 'imperial') {
  if (typeof f !== 'number' || isNaN(f)) return 0;
  return unit === 'metric' ? Math.round(fahrenheitToCelsius(f)) : Math.round(f);
}

export function formatTemp(f, unit = 'imperial') {
  if (f == null || isNaN(f)) return 'N/A';
  const val = convertTemp(f, unit);
  return `${val}°${unit === 'metric' ? 'C' : 'F'}`;
}

export function convertSpeed(mph, unit = 'imperial') {
  if (typeof mph !== 'number' || isNaN(mph)) return 0;
  return unit === 'metric' ? Math.round(mph * 1.60934) : Math.round(mph);
}

export function formatSpeed(mph, unit = 'imperial') {
  if (mph == null || isNaN(mph)) return 'N/A';
  const val = convertSpeed(mph, unit);
  return `${val} ${unit === 'metric' ? 'km/h' : 'mph'}`;
}

export function convertPrecip(inches, unit = 'imperial') {
  if (typeof inches !== 'number' || isNaN(inches)) return 0;
  return unit === 'metric' ? Number((inches * 25.4).toFixed(1)) : Number(inches.toFixed(2));
}

export function formatPrecip(inches, unit = 'imperial') {
  if (inches == null || isNaN(inches)) return 'N/A';
  const val = convertPrecip(inches, unit);
  return `${val} ${unit === 'metric' ? 'mm' : 'in'}`;
}

export function convertDistance(miles, unit = 'imperial') {
  if (typeof miles !== 'number' || isNaN(miles)) return 0;
  return unit === 'metric' ? Number((miles * 1.60934).toFixed(1)) : Number(miles.toFixed(1));
}

export function formatDistance(miles, unit = 'imperial') {
  const val = convertDistance(miles, unit);
  return `${val} ${unit === 'metric' ? 'km' : 'mi'}`;
}

export function getWeatherIconName(weatherCode) {
  if (weatherCode == null) return 'sun';
  const c = Number(weatherCode);
  if (c === 0 || c === 1) return 'sun';
  if (c === 2 || c === 3) return 'cloud';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'cloud-rain';
  if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return 'snowflake';
  if (c >= 95 && c <= 99) return 'cloud-lightning';
  return 'cloud';
}

/**
 * Maps backend status + route risk to one of the 5 canonical driver status words:
 * GO / CAUTION / SLOW DOWN / DANGEROUS / DO NOT TRAVEL
 */
export function getDriverStatus(backendStatus = 'CLEAR', routeRiskLevel = null) {
  const lvl = routeRiskLevel != null ? Number(routeRiskLevel) : null;

  if (lvl === 4) {
    return {
      word: 'DO NOT TRAVEL',
      color: '#ef4444',
      icon: 'slash',
      bg: 'rgba(239, 68, 68, 0.14)',
      borderColor: '#ef4444',
    };
  }
  if (lvl === 3) {
    return {
      word: 'DANGEROUS',
      color: '#f97316',
      icon: 'alert-triangle',
      bg: 'rgba(249, 115, 22, 0.14)',
      borderColor: '#f97316',
    };
  }
  if (lvl === 2) {
    return {
      word: 'SLOW DOWN',
      color: '#eab308',
      icon: 'alert-circle',
      bg: 'rgba(234, 179, 8, 0.14)',
      borderColor: '#eab308',
    };
  }
  if (lvl === 1) {
    return {
      word: 'CAUTION',
      color: '#0ea5e9',
      icon: 'info',
      bg: 'rgba(14, 165, 233, 0.14)',
      borderColor: '#0ea5e9',
    };
  }
  if (lvl === 0) {
    return {
      word: 'GO',
      color: '#10b981',
      icon: 'check-circle',
      bg: 'rgba(16, 185, 129, 0.14)',
      borderColor: '#10b981',
    };
  }

  // Fallback to backend status string if route risk is not provided
  const statusStr = String(backendStatus).toUpperCase();
  if (statusStr.includes('HAZARD') || statusStr.includes('DANGER') || statusStr.includes('ALERT')) {
    return {
      word: 'DANGEROUS',
      color: '#ef4444',
      icon: 'alert-triangle',
      bg: 'rgba(239, 68, 68, 0.14)',
      borderColor: '#ef4444',
    };
  }
  if (statusStr.includes('CAUTION')) {
    return {
      word: 'CAUTION',
      color: '#eab308',
      icon: 'alert-circle',
      bg: 'rgba(234, 179, 8, 0.14)',
      borderColor: '#eab308',
    };
  }
  return {
    word: 'GO',
    color: '#10b981',
    icon: 'check-circle',
    bg: 'rgba(16, 185, 129, 0.14)',
    borderColor: '#10b981',
  };
}

/**
 * Calculates hourly risk level (0-4) and color for the 4px risk bar under each chip.
 */
export function calculateHourRisk(tempF, windMph, gustMph, precipIn, snowIn, weatherCode) {
  const g = gustMph || windMph || 0;
  const w = windMph || 0;
  const p = precipIn || 0;
  const s = snowIn || 0;
  const c = weatherCode || 0;

  if (g >= 45 || w >= 35 || s >= 0.4 || (tempF <= 32 && p > 0.05) || (c >= 95 && c <= 99)) {
    return { level: 3, color: '#f97316' };
  }
  if (g >= 28 || w >= 22 || p >= 0.15 || s > 0 || (tempF <= 34 && p > 0) || c === 45 || c === 48) {
    return { level: 2, color: '#eab308' };
  }
  if (w >= 18 || p > 0) {
    return { level: 1, color: '#0ea5e9' };
  }
  return { level: 0, color: '#10b981' };
}

/**
 * Maps 48-hour arrays from Open-Meteo into structured chip items.
 */
export function map48hChips(hourlyData, departureIso = null) {
  if (!hourlyData || !Array.isArray(hourlyData.time) || hourlyData.time.length === 0) {
    return [];
  }

  const times = hourlyData.time;
  const temps = hourlyData.temperature_f || [];
  const winds = hourlyData.wind_speed_mph || [];
  const gusts = hourlyData.wind_gusts_mph || [];
  const pops = hourlyData.precipitation_prob || [];
  const precips = hourlyData.precipitation_in || [];
  const codes = hourlyData.weather_code || [];

  const depDate = departureIso ? new Date(departureIso) : new Date();
  const depHourMs = depDate.getTime();

  return times.slice(0, 48).map((timeStr, idx) => {
    const itemDate = new Date(timeStr);
    const diffHours = Math.round((itemDate.getTime() - depHourMs) / 3600000);
    const isNow = Math.abs(diffHours) === 0 || idx === 0;

    let hourLabel = '';
    if (isNow) {
      hourLabel = 'Now';
    } else {
      const h = itemDate.getHours();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      hourLabel = `${h12}${ampm}`;
    }

    const t = temps[idx] != null ? Number(temps[idx]) : 65;
    const w = winds[idx] != null ? Number(winds[idx]) : 5;
    const g = gusts[idx] != null ? Number(gusts[idx]) : w;
    const pop = pops[idx] != null ? Number(pops[idx]) : 0;
    const p = precips[idx] != null ? Number(precips[idx]) : 0;
    const code = codes[idx] != null ? Number(codes[idx]) : 0;

    const risk = calculateHourRisk(t, w, g, p, 0, code);

    return {
      timeIso: timeStr,
      displayTime: hourLabel,
      isNow,
      tempF: t,
      windMph: w,
      gustMph: g,
      popPct: pop,
      precipIn: p,
      weatherCode: code,
      iconName: getWeatherIconName(code),
      riskLevel: risk.level,
      riskColor: risk.color,
    };
  });
}
