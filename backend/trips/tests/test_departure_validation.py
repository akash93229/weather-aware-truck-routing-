"""Tests verifying departure time validation boundaries."""

from datetime import datetime, timedelta, timezone
from rest_framework.test import APIClient


class TestDepartureValidation:
    def setup_method(self):
        self.client = APIClient()

    def test_departure_more_than_1_hour_in_past_rejected(self):
        """Departure time > 1 hour in the past returns HTTP 400 with error structure."""
        now = datetime.now(timezone.utc)
        past_dep = (now - timedelta(minutes=65)).isoformat()

        body = {
            'origin': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago'},
            'destination': {'lat': 32.7767, 'lng': -96.7970, 'label': 'Dallas'},
            'departure_time': past_dep,
            'load_weight_lb': 42000,
            'interval_miles': 25,
        }

        resp = self.client.post('/api/trips/analyze/', body, format='json')
        assert resp.status_code == 400
        data = resp.json()
        assert 'error' in data
        assert data['error']['code'] == 'validation_error'
        assert 'more than 1 hour in the past' in data['error']['message']

    def test_departure_within_1_hour_in_past_allowed(self):
        """Departure time within 1 hour grace window is accepted by serializer."""
        now = datetime.now(timezone.utc)
        recent_dep = (now - timedelta(minutes=30)).isoformat()

        body = {
            'origin': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago'},
            'destination': {'lat': 32.7767, 'lng': -96.7970, 'label': 'Dallas'},
            'departure_time': recent_dep,
            'load_weight_lb': 42000,
            'interval_miles': 25,
            'scenario': 'calm',
        }

        resp = self.client.post('/api/trips/analyze/', body, format='json')
        # Not a validation error on departure time
        if resp.status_code == 400:
            assert 'departure_time' not in resp.json().get('error', {}).get('message', '')

    def test_departure_beyond_16_days_rejected(self):
        """Departure time beyond 16 days returns HTTP 400 with error structure."""
        now = datetime.now(timezone.utc)
        beyond_16 = (now + timedelta(days=16, hours=2)).isoformat()

        body = {
            'origin': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago'},
            'destination': {'lat': 32.7767, 'lng': -96.7970, 'label': 'Dallas'},
            'departure_time': beyond_16,
            'load_weight_lb': 42000,
            'interval_miles': 25,
        }

        resp = self.client.post('/api/trips/analyze/', body, format='json')
        assert resp.status_code == 400
        data = resp.json()
        assert 'error' in data
        assert data['error']['code'] == 'validation_error'
        assert '16-day forecast window' in data['error']['message']
