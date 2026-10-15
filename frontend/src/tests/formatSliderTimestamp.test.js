import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSliderTimestamp } from '../utils/time.js';

test('formatSliderTimestamp calculates departure + N hours exactly', () => {
  // Base departure: 2026-10-15 12:00:00 UTC (which is 07:00 AM America/Chicago CDT)
  const departureIso = '2026-10-15T12:00:00.000Z';
  const tz = 'America/Chicago';

  // Hour 0: should be 7:00 AM
  const h0 = formatSliderTimestamp(departureIso, 0, tz);
  assert.match(h0, /Oct 15/);
  assert.match(h0, /7:00\s?AM/);
  assert.match(h0, /\(America\/Chicago\)/);

  // Hour 5: should be 12:00 PM (7 AM + 5 hours)
  const h5 = formatSliderTimestamp(departureIso, 5, tz);
  assert.match(h5, /Oct 15/);
  assert.match(h5, /12:00\s?PM/);

  // Hour 24: should be next day, 7:00 AM (Oct 16)
  const h24 = formatSliderTimestamp(departureIso, 24, tz);
  assert.match(h24, /Oct 16/);
  assert.match(h24, /7:00\s?AM/);

  // Hour 48: should be 2 days later, 7:00 AM (Oct 17)
  const h48 = formatSliderTimestamp(departureIso, 48, tz);
  assert.match(h48, /Oct 17/);
  assert.match(h48, /7:00\s?AM/);
});

test('formatSliderTimestamp UTC timezone formatting', () => {
  const departureIso = '2026-10-15T18:30:00.000Z';
  const h3 = formatSliderTimestamp(departureIso, 3, 'UTC');
  // 18:30 + 3h = 21:30 (9:30 PM)
  assert.match(h3, /9:30\s?PM/);
  assert.match(h3, /\(UTC\)/);
});

test('formatSliderTimestamp handles edge cases gracefully', () => {
  assert.equal(formatSliderTimestamp(null, 0), '');
  assert.equal(formatSliderTimestamp('', 5), '');
  assert.equal(formatSliderTimestamp('invalid-date', 10), 'Hour +10h');
});
