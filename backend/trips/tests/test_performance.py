"""Tests for performance optimizations, happy-path sleep elimination, and via-point skipping."""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
import pytest

from trips.services.routing.base import Route
from trips.services.routing.service import get_routes


@pytest.mark.django_db
class TestPerformanceOptimizations:
    def test_via_point_calls_skipped_when_three_distinct_routes_exist(self):
        """When the primary provider returns 3 distinct routes, via-point calls are completely skipped."""
        mock_provider = MagicMock()
        mock_provider.name = 'mock_tomtom'

        pts1 = [(41.88 + i * 0.05, -87.63 - i * 0.05) for i in range(10)]
        pts2 = [(41.88 + i * 0.05, -87.63 - i * 0.08) for i in range(10)]
        pts3 = [(41.88 + i * 0.05, -87.63 - i * 0.12) for i in range(10)]

        r1 = Route(id='r1', label='Fastest', points=pts1, distance_mi=300.0, duration_s=18000)
        r2 = Route(id='r2', label='Alternative 1', points=pts2, distance_mi=320.0, duration_s=19000)
        r3 = Route(id='r3', label='Alternative 2', points=pts3, distance_mi=340.0, duration_s=21000)

        mock_provider.calculate_routes.return_value = [r1, r2, r3]

        # Use unique coordinates to avoid cache hit
        origin = (41.8781, -87.6298)
        dest = (32.7767, -96.7970)

        result = get_routes(origin=origin, destination=dest, provider=mock_provider)

        assert len(result['routes']) == 3
        # Primary provider must have been called exactly once (initial call)
        assert mock_provider.calculate_routes.call_count == 1
        call_kwargs = mock_provider.calculate_routes.call_args.kwargs
        assert call_kwargs.get('via_points') is None

    @patch('time.sleep')
    def test_happy_path_makes_no_sleep_call(self, mock_sleep, client):
        """In the happy path (all network calls succeed 200 on first try), time.sleep is never called."""
        # Setup mock routing returning 3 distinct routes
        pts1 = [(41.88 + i * 0.05, -87.63 - i * 0.05) for i in range(5)]
        pts2 = [(41.88 + i * 0.05, -87.63 - i * 0.08) for i in range(5)]
        pts3 = [(41.88 + i * 0.05, -87.63 - i * 0.12) for i in range(5)]

        r1 = Route(id='r1', label='Fastest', points=pts1, distance_mi=100.0, duration_s=6000)
        r2 = Route(id='r2', label='Alternative 1', points=pts2, distance_mi=110.0, duration_s=6600)
        r3 = Route(id='r3', label='Alternative 2', points=pts3, distance_mi=120.0, duration_s=7200)

        with patch('trips.api.views.get_routes') as mock_get_routes:
            mock_get_routes.return_value = {
                'routes': [r1, r2, r3],
                'provider_used': 'fixture',
                'notes': [],
            }

            dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
            payload = {
                'origin': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago, IL'},
                'destination': {'lat': 39.7392, 'lng': -104.9903, 'label': 'Denver, CO'},
                'departure_time': dep_time,
                'load_weight_lb': 42000,
                'interval_miles': 25,
                'scenario': 'calm',
            }

            resp = client.post('/api/trips/analyze/', payload, content_type='application/json')
            assert resp.status_code == 200

            # Assert time.sleep was never invoked anywhere in happy path
            mock_sleep.assert_not_called()
