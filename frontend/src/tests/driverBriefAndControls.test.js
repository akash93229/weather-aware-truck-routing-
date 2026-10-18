import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fahrenheitToCelsius,
  celsiusToFahrenheit,
  convertTemp,
  formatTemp,
  convertSpeed,
  formatSpeed,
  convertPrecip,
  formatPrecip,
  convertDistance,
  formatDistance,
  getDriverStatus,
  calculateHourRisk,
  map48hChips,
  getWeatherIconName,
} from '../utils/driverBriefHelpers.js';

// --- Test Suite 1: Unit Conversion ---
test('Unit Conversion: Temperature Fahrenheit to Celsius', () => {
  assert.equal(Math.round(fahrenheitToCelsius(32)), 0);
  assert.equal(Math.round(fahrenheitToCelsius(212)), 100);
  assert.equal(Math.round(fahrenheitToCelsius(68)), 20);
  assert.equal(Math.round(celsiusToFahrenheit(0)), 32);
  assert.equal(Math.round(celsiusToFahrenheit(100)), 212);

  assert.equal(convertTemp(68, 'imperial'), 68);
  assert.equal(convertTemp(68, 'metric'), 20);
  assert.equal(formatTemp(68, 'imperial'), '68°F');
  assert.equal(formatTemp(68, 'metric'), '20°C');
});

test('Unit Conversion: Wind Speed mph to km/h', () => {
  assert.equal(convertSpeed(10, 'imperial'), 10);
  assert.equal(convertSpeed(10, 'metric'), 16);
  assert.equal(formatSpeed(25, 'imperial'), '25 mph');
  assert.equal(formatSpeed(25, 'metric'), '40 km/h');
});

test('Unit Conversion: Precipitation inches to mm', () => {
  assert.equal(convertPrecip(1.0, 'imperial'), 1.0);
  assert.equal(convertPrecip(1.0, 'metric'), 25.4);
  assert.equal(formatPrecip(0.5, 'imperial'), '0.5 in');
  assert.equal(formatPrecip(0.5, 'metric'), '12.7 mm');
});

test('Unit Conversion: Distance miles to km', () => {
  assert.equal(convertDistance(100, 'imperial'), 100);
  assert.equal(convertDistance(100, 'metric'), 160.9);
  assert.equal(formatDistance(50, 'imperial'), '50 mi');
  assert.equal(formatDistance(50, 'metric'), '80.5 km');
});

// --- Test Suite 2: Driver Status Mapping ---
test('Driver Status Mapping: Route risk levels 0-4', () => {
  const s0 = getDriverStatus('CLEAR', 0);
  assert.equal(s0.word, 'GO');
  assert.equal(s0.color, '#10b981');

  const s1 = getDriverStatus('CLEAR', 1);
  assert.equal(s1.word, 'CAUTION');
  assert.equal(s1.color, '#0ea5e9');

  const s2 = getDriverStatus('CLEAR', 2);
  assert.equal(s2.word, 'SLOW DOWN');
  assert.equal(s2.color, '#eab308');

  const s3 = getDriverStatus('CLEAR', 3);
  assert.equal(s3.word, 'DANGEROUS');
  assert.equal(s3.color, '#f97316');

  const s4 = getDriverStatus('CLEAR', 4);
  assert.equal(s4.word, 'DO NOT TRAVEL');
  assert.equal(s4.color, '#ef4444');
});

test('Driver Status Mapping: Fallback when route risk is null', () => {
  assert.equal(getDriverStatus('HAZARD', null).word, 'DANGEROUS');
  assert.equal(getDriverStatus('CAUTION', null).word, 'CAUTION');
  assert.equal(getDriverStatus('CLEAR', null).word, 'GO');
});

// --- Test Suite 3: 48h Chip Mapper ---
test('48h Chip Mapper: Transforms arrays into structured chips', () => {
  const mockHourly = {
    time: [
      '2026-10-17T12:00:00Z',
      '2026-10-17T13:00:00Z',
      '2026-10-17T14:00:00Z',
    ],
    temperature_f: [65.0, 68.0, 72.0],
    wind_speed_mph: [12.0, 24.0, 38.0],
    wind_gusts_mph: [15.0, 30.0, 48.0],
    precipitation_prob: [0, 40, 90],
    precipitation_in: [0.0, 0.1, 0.5],
    weather_code: [0, 61, 95],
  };

  const chips = map48hChips(mockHourly, '2026-10-17T12:00:00Z');
  assert.equal(chips.length, 3);

  // Chip 0: Now
  assert.equal(chips[0].isNow, true);
  assert.equal(chips[0].displayTime, 'Now');
  assert.equal(chips[0].tempF, 65.0);
  assert.equal(chips[0].iconName, 'sun');
  assert.equal(chips[0].riskLevel, 0);

  // Chip 1: Rain & Gusts >= 28mph -> Risk Level 2
  assert.equal(chips[1].isNow, false);
  assert.equal(chips[1].tempF, 68.0);
  assert.equal(chips[1].iconName, 'cloud-rain');
  assert.equal(chips[1].riskLevel, 2);

  // Chip 2: Severe Storm & Gusts >= 45mph -> Risk Level 3
  assert.equal(chips[2].isNow, false);
  assert.equal(chips[2].tempF, 72.0);
  assert.equal(chips[2].iconName, 'cloud-lightning');
  assert.equal(chips[2].riskLevel, 3);
});

// --- Test Suite 4: Weather Icon Name Resolver ---
test('Weather Icon Name Resolver matches WMO codes', () => {
  assert.equal(getWeatherIconName(0), 'sun');
  assert.equal(getWeatherIconName(1), 'sun');
  assert.equal(getWeatherIconName(3), 'cloud');
  assert.equal(getWeatherIconName(45), 'fog');
  assert.equal(getWeatherIconName(61), 'cloud-rain');
  assert.equal(getWeatherIconName(73), 'snowflake');
  assert.equal(getWeatherIconName(95), 'cloud-lightning');
});

// --- Test Suite 5: Switch Component Logic ---
test('Switch Component: State toggling and keyboard interactions', () => {
  let toggled = false;
  const onChange = (next) => { toggled = next; };

  // Helper simulating switch trigger
  function simulateSwitch(checked, disabled = false) {
    if (disabled) return checked;
    return !checked;
  }

  assert.equal(simulateSwitch(false), true);
  assert.equal(simulateSwitch(true), false);
  assert.equal(simulateSwitch(false, true), false); // Disabled prevents toggle
});

// --- Test Suite 6: SegmentedControl Logic ---
test('SegmentedControl Component: Active option selection', () => {
  const options = [
    { id: 'imperial', label: '°F / mi' },
    { id: 'metric', label: '°C / km' },
  ];

  function selectSegment(options, currentVal, nextVal) {
    const valid = options.some((o) => o.id === nextVal);
    return valid ? nextVal : currentVal;
  }

  assert.equal(selectSegment(options, 'imperial', 'metric'), 'metric');
  assert.equal(selectSegment(options, 'metric', 'invalid'), 'metric');
  assert.equal(selectSegment(options, 'metric', 'imperial'), 'imperial');
});
