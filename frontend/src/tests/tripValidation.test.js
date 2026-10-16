import test from 'node:test';
import assert from 'node:assert/strict';

function validateTripParams({ origin, destination, loadWeight, departureTime }) {
  if (!origin || !origin.lat || !origin.lng) {
    return 'Please select a valid origin location.';
  }
  if (!destination || !destination.lat || !destination.lng) {
    return 'Please select a valid destination location.';
  }
  if (
    Math.abs(origin.lat - destination.lat) < 0.001 &&
    Math.abs(origin.lng - destination.lng) < 0.001
  ) {
    return 'Origin and destination cannot be the same location.';
  }
  const weight = Number(loadWeight);
  if (Number.isNaN(weight) || weight < 1 || weight > 80000) {
    return 'Load weight must be between 1 and 80,000 lbs.';
  }
  if (!departureTime) {
    return 'Please specify a departure date and time.';
  }
  return null;
}

test('validateTripParams rejects identical coordinates', () => {
  const err = validateTripParams({
    origin: { lat: 41.8781, lng: -87.6298 },
    destination: { lat: 41.8781, lng: -87.6298 },
    loadWeight: 42000,
    departureTime: '2026-10-16T12:00',
  });
  assert.equal(err, 'Origin and destination cannot be the same location.');
});

test('validateTripParams rejects invalid load weights', () => {
  assert.equal(
    validateTripParams({
      origin: { lat: 41.8781, lng: -87.6298 },
      destination: { lat: 32.7767, lng: -96.7970 },
      loadWeight: 0,
      departureTime: '2026-10-16T12:00',
    }),
    'Load weight must be between 1 and 80,000 lbs.'
  );

  assert.equal(
    validateTripParams({
      origin: { lat: 41.8781, lng: -87.6298 },
      destination: { lat: 32.7767, lng: -96.7970 },
      loadWeight: 85000,
      departureTime: '2026-10-16T12:00',
    }),
    'Load weight must be between 1 and 80,000 lbs.'
  );
});

test('validateTripParams passes for valid inputs', () => {
  const err = validateTripParams({
    origin: { lat: 41.8781, lng: -87.6298 },
    destination: { lat: 32.7767, lng: -96.7970 },
    loadWeight: 42000,
    departureTime: '2026-10-16T12:00',
  });
  assert.equal(err, null);
});
