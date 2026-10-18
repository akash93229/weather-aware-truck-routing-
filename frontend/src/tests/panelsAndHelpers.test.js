import test from 'node:test';
import assert from 'node:assert/strict';

// Helper: Panels state toggle reducer
function togglePanelState(prev, panelId, isWideScreen = true) {
  const isCurrentlyOpen = Boolean(prev[panelId]);
  if (panelId === 'heatmap') {
    return { ...prev, heatmap: !isCurrentlyOpen };
  }
  if (isWideScreen) {
    return { ...prev, [panelId]: !isCurrentlyOpen };
  }
  return {
    params: false,
    weather: false,
    routes: false,
    heatmap: false,
    recent: false,
    info: false,
    [panelId]: !isCurrentlyOpen,
  };
}

// Helper: Relative time formatter for Recent Trips
function formatRelativeTime(dateIso, nowMs = Date.now()) {
  if (!dateIso) return '';
  const past = new Date(dateIso).getTime();
  const diffSec = Math.floor((nowMs - past) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// Helper: Theme resolver
function resolveInitialTheme(savedTheme, prefersLight) {
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return prefersLight ? 'light' : 'dark';
}

test('togglePanelState on wide screens allows multiple open panels', () => {
  const initial = { params: true, weather: false, routes: false };
  const next = togglePanelState(initial, 'routes', true);
  assert.equal(next.params, true);
  assert.equal(next.routes, true);
  assert.equal(next.weather, false);
});

test('togglePanelState on small screens keeps only one panel open', () => {
  const initial = { params: true, weather: false, routes: false };
  const next = togglePanelState(initial, 'weather', false);
  assert.equal(next.params, false);
  assert.equal(next.weather, true);
  assert.equal(next.routes, false);
});

test('togglePanelState closing an active panel toggles it to false', () => {
  const initial = { params: true, routes: false };
  const next = togglePanelState(initial, 'params', true);
  assert.equal(next.params, false);
});

test('formatRelativeTime formats durations correctly', () => {
  const baseTime = 1700000000000;
  assert.equal(formatRelativeTime(new Date(baseTime - 30000).toISOString(), baseTime), 'Just now');
  assert.equal(formatRelativeTime(new Date(baseTime - 120000).toISOString(), baseTime), '2m ago');
  assert.equal(formatRelativeTime(new Date(baseTime - 7200000).toISOString(), baseTime), '2h ago');
  assert.equal(formatRelativeTime(new Date(baseTime - 172800000).toISOString(), baseTime), '2d ago');
});

// Helper: Dock switching logic
function switchDockTab(currentDockTab, newTab) {
  return newTab;
}

// Helper: Form inline validation logic
function validateTripInputs(origin, destination, originCoord, destCoord) {
  const errors = {};
  if (!origin || !origin.trim()) {
    errors.origin = 'Choose an origin from the suggestions';
  } else if (!originCoord) {
    errors.origin = 'Please select a valid place from the suggestions dropdown';
  }

  if (!destination || !destination.trim()) {
    errors.destination = 'Choose a destination from the suggestions';
  } else if (!destCoord) {
    errors.destination = 'Please select a valid place from the suggestions dropdown';
  }

  if (!errors.origin && !errors.destination && originCoord && destCoord) {
    if (Math.abs(originCoord.lat - destCoord.lat) < 0.001 && Math.abs(originCoord.lng - destCoord.lng) < 0.001) {
      errors.general = 'Origin and destination cannot be the same location.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Helper: Panel title and subtitle formatting
function formatPanelHeader(title, subtitle) {
  return {
    title: String(title).toUpperCase(),
    subtitle: subtitle ? String(subtitle).trim() : null,
  };
}

test('resolveInitialTheme respects saved preference or defaults', () => {
  assert.equal(resolveInitialTheme('light', false), 'light');
  assert.equal(resolveInitialTheme('dark', true), 'dark');
  assert.equal(resolveInitialTheme(null, true), 'light');
  assert.equal(resolveInitialTheme(null, false), 'dark');
});

test('switchDockTab handles dock swapping correctly', () => {
  assert.equal(switchDockTab('params', 'recent'), 'recent');
  assert.equal(switchDockTab('routes', 'weather'), 'weather');
});

test('validateTripInputs catches missing inputs inline without native bubble', () => {
  const emptyRes = validateTripInputs('', '', null, null);
  assert.equal(emptyRes.isValid, false);
  assert.equal(emptyRes.errors.origin, 'Choose an origin from the suggestions');
  assert.equal(emptyRes.errors.destination, 'Choose a destination from the suggestions');

  const unselectedRes = validateTripInputs('Chicago', 'Dallas', null, null);
  assert.equal(unselectedRes.isValid, false);
  assert.equal(unselectedRes.errors.origin, 'Please select a valid place from the suggestions dropdown');

  const sameRes = validateTripInputs('Chicago', 'Chicago', { lat: 41.8781, lng: -87.6298 }, { lat: 41.8781, lng: -87.6298 });
  assert.equal(sameRes.isValid, false);
  assert.equal(sameRes.errors.general, 'Origin and destination cannot be the same location.');

  const validRes = validateTripInputs('Indore', 'Mumbai', { lat: 22.7196, lng: 75.8577 }, { lat: 19.0760, lng: 72.8777 });
  assert.equal(validRes.isValid, true);
  assert.deepEqual(validRes.errors, {});
});

test('formatPanelHeader keeps title uppercase and separates subtitle', () => {
  const header = formatPanelHeader('Weather Report', 'Chicago, IL -> Dallas, TX');
  assert.equal(header.title, 'WEATHER REPORT');
  assert.equal(header.subtitle, 'Chicago, IL -> Dallas, TX');
});
