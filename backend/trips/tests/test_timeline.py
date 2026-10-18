"""
Tests for route timeline enrichment: advisory generator and key-stop limiter.
"""

from django.test import SimpleTestCase
from trips.services.timeline import (
    generate_stop_advisory,
    select_key_stops,
    enrich_checkpoints_with_stops,
)


class TimelineTests(SimpleTestCase):
    def test_advisory_generator_max_words(self):
        """Verify that generate_stop_advisory produces strict <= 12 word advisories under all conditions."""
        test_cases = [
            # (weather, risk)
            ({'wind_mph': 10, 'gust_mph': 12, 'rain_in_hr': 0, 'snow_in_hr': 0}, {'level': 0}),
            ({'wind_mph': 22, 'gust_mph': 25, 'rain_in_hr': 0, 'snow_in_hr': 0}, {'level': 1}),
            ({'wind_mph': 15, 'gust_mph': 20, 'rain_in_hr': 0.05, 'snow_in_hr': 0}, {'level': 1}),
            ({'wind_mph': 28, 'gust_mph': 38, 'rain_in_hr': 0.1, 'snow_in_hr': 0}, {'level': 2}),
            ({'wind_mph': 20, 'gust_mph': 25, 'rain_in_hr': 0.35, 'snow_in_hr': 0}, {'level': 2}),
            ({'wind_mph': 18, 'gust_mph': 22, 'rain_in_hr': 0, 'snow_in_hr': 0.2}, {'level': 2}),
            ({'wind_mph': 40, 'gust_mph': 55, 'rain_in_hr': 0.2, 'snow_in_hr': 0}, {'level': 3}),
            ({'wind_mph': 25, 'gust_mph': 30, 'rain_in_hr': 0, 'snow_in_hr': 0.5}, {'level': 3}),
            ({'wind_mph': 55, 'gust_mph': 70, 'rain_in_hr': 0.8, 'snow_in_hr': 0}, {'level': 4}),
            (None, None),
        ]

        for w, r in test_cases:
            advisory = generate_stop_advisory(w, r)
            self.assertIsInstance(advisory, str)
            word_count = len(advisory.split())
            self.assertLessEqual(word_count, 12, f"Advisory exceeded 12 words ({word_count}): '{advisory}'")
            self.assertGreater(len(advisory), 0)

    def test_select_key_stops_limiter(self):
        """Verify that select_key_stops limits stops to 6-10 and always includes endpoints."""
        # Case 1: 50 checkpoints
        dummy_cps_50 = [
            {'mile': i * 10, 'lat': 40.0 + i * 0.1, 'lng': -80.0 - i * 0.1, 'risk': {'level': 0}}
            for i in range(50)
        ]
        # Inject a severe risk checkpoint
        dummy_cps_50[22]['risk']['level'] = 3

        stops = select_key_stops(dummy_cps_50, min_stops=6, max_stops=10)
        self.assertGreaterEqual(len(stops), 6)
        self.assertLessEqual(len(stops), 10)
        self.assertIn(0, stops)
        self.assertIn(49, stops)
        self.assertIn(22, stops)  # Severe risk checkpoint must be included

        # Case 2: small route (4 checkpoints)
        dummy_cps_4 = [
            {'mile': i * 10, 'lat': 40.0 + i * 0.1, 'lng': -80.0 - i * 0.1, 'risk': {'level': 0}}
            for i in range(4)
        ]
        stops_4 = select_key_stops(dummy_cps_4, min_stops=6, max_stops=10)
        self.assertEqual(len(stops_4), 4)
        self.assertEqual(stops_4, [0, 1, 2, 3])

    def test_enrich_checkpoints_with_stops(self):
        """Verify that enrich_checkpoints_with_stops adds advisory, is_key_stop, and names."""
        dummy_cps = [
            {
                'mile': i * 25.0,
                'lat': 41.8781 - i * 0.2,
                'lng': -87.6298 - i * 0.2,
                'weather': {'wind_mph': 15.0, 'gust_mph': 20.0, 'rain_in_hr': 0.0, 'snow_in_hr': 0.0, 'temp_f': 62.0},
                'risk': {'level': 0 if i != 5 else 3, 'label': 'Low' if i != 5 else 'Severe'},
            }
            for i in range(20)
        ]

        enriched = enrich_checkpoints_with_stops(dummy_cps, origin_name="Chicago, IL", dest_name="Dallas, TX")
        self.assertEqual(len(enriched), 20)

        key_stops = [cp for cp in enriched if cp['is_key_stop']]
        self.assertGreaterEqual(len(key_stops), 6)
        self.assertLessEqual(len(key_stops), 10)

        # Origin and destination check
        self.assertEqual(enriched[0]['name'], "Chicago, IL")
        self.assertEqual(enriched[-1]['name'], "Dallas, TX")
        self.assertTrue(enriched[0]['is_key_stop'])
        self.assertTrue(enriched[-1]['is_key_stop'])

        # Non-key stops should have name=None
        non_key_stops = [cp for cp in enriched if not cp['is_key_stop']]
        for cp in non_key_stops:
            self.assertIsNone(cp['name'])

        # All stops have advisories <= 12 words
        for cp in enriched:
            self.assertIn('advisory', cp)
            self.assertLessEqual(len(cp['advisory'].split()), 12)
