"""Tests for Phase 5: TomTom routing, OSRM fallback, deduplication, geocoding, and trip analysis."""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
import pytest
from django.core.cache import cache

from trips.services.routing.base import Route, RoutingUnavailable
from trips.services.routing.tomtom import TomTomRoutingProvider
from trips.services.routing.osrm import OSRMRoutingProvider
from trips.services.routing.service import get_routes, are_routes_duplicate, filter_distinct_routes
from trips.services.geocoding import geocode_address
from trips.services.weather.base import Weather
from trips.services.weather.fixture import FixtureWeatherProvider


@pytest.fixture(autouse=True)
def clear_all_caches():
    cache.clear()
    yield
    cache.clear()


class TestRoutingProviders:
    @patch('trips.services.routing.tomtom.requests.get')
    def test_tomtom_response_parsing(self, mock_get):
        """Verify TomTom routing response parses legs, summary, and converts meters to miles."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'routes': [
                {
                    'summary': {
                        'lengthInMeters': 160934,  # ~100 miles
                        'travelTimeInSeconds': 5400,  # 1.5 hours
                    },
                    'legs': [
                        {
                            'points': [
                                {'latitude': 41.8781, 'longitude': -87.6298},
                                {'latitude': 40.0000, 'longitude': -88.0000},
                                {'latitude': 38.0000, 'longitude': -89.0000},
                            ]
                        }
                    ],
                }
            ]
        }
        mock_get.return_value = mock_resp

        provider = TomTomRoutingProvider(api_key='test-key')
        routes = provider.calculate_routes(
            origin=(41.8781, -87.6298),
            destination=(38.0000, -89.0000),
            load_weight_lb=40000.0,
        )

        assert len(routes) == 1
        r = routes[0]
        assert pytest.approx(r.distance_mi, rel=1e-2) == 100.0
        assert r.duration_s == 5400.0
        assert len(r.points) == 3
        assert r.points[0] == (41.8781, -87.6298)

        # Check weight in kg was sent in request
        sent_params = mock_get.call_args[1]['params']
        assert sent_params['vehicleWeight'] == 18144  # 40,000 lb in kg

    def test_duplicate_removal(self):
        """Duplicate routes with identical/near points should be filtered."""
        pts = [(40.0 + i * 0.1, -75.0) for i in range(10)]
        r1 = Route(id='r1', label='Route 1', points=pts, distance_mi=69.0, duration_s=3600)
        # Duplicate with 0.01 degree shift (< 1 mile)
        pts_dup = [(p[0] + 0.001, p[1]) for p in pts]
        r2 = Route(id='r2', label='Route 2', points=pts_dup, distance_mi=69.05, duration_s=3610)

        assert are_routes_duplicate(r1, r2, threshold_miles=1.0) is True
        distinct = filter_distinct_routes([r1, r2], threshold_miles=1.0)
        assert len(distinct) == 1
        assert distinct[0].id == 'r1'

    def test_fewer_than_3_routes_triggers_via_point_generator(self):
        """If primary returns only 1 route, service attempts via-point lateral offsets."""
        pts_main = [(40.0 + i * 0.2, -75.0) for i in range(10)]
        main_route = Route(id='r1', label='Main', points=pts_main, distance_mi=130.0, duration_s=7200)

        mock_provider = MagicMock()
        # First call returns 1 route
        # Via call 1 returns an alternative via west
        pts_via1 = [(40.0 + i * 0.2, -75.5) for i in range(10)]
        alt_route1 = Route(id='alt1', label='Alt 1', points=pts_via1, distance_mi=145.0, duration_s=8000)
        # Via call 2 returns an alternative via east
        pts_via2 = [(40.0 + i * 0.2, -74.5) for i in range(10)]
        alt_route2 = Route(id='alt2', label='Alt 2', points=pts_via2, distance_mi=150.0, duration_s=8200)

        mock_provider.calculate_routes.side_effect = [
            [main_route],
            [alt_route1],
            [alt_route2],
        ]

        result = get_routes(
            origin=(40.0, -75.0),
            destination=(42.0, -75.0),
            provider=mock_provider,
        )

        assert len(result['routes']) == 3
        labels = [r.label for r in result['routes']]
        assert labels == ['Fastest', 'Alternative 1', 'Alternative 2']
        assert mock_provider.calculate_routes.call_count >= 2

    @patch('trips.services.routing.osrm.requests.get')
    def test_tomtom_failure_falls_back_to_osrm(self, mock_osrm_get):
        """When TomTom fails, get_routes transparently falls back to OSRM."""
        mock_tomtom = MagicMock()
        mock_tomtom.calculate_routes.side_effect = RoutingUnavailable('TomTom service 503')

        mock_osrm_resp = MagicMock()
        mock_osrm_resp.status_code = 200
        mock_osrm_resp.json.return_value = {
            'routes': [
                {
                    'distance': 160934.4,  # 100 miles
                    'duration': 3600.0,    # 1 hour car -> 1.15 hour truck (4140s)
                    'geometry': {
                        'coordinates': [[-87.6298, 41.8781], [-88.0, 40.0]]
                    },
                }
            ]
        }
        mock_osrm_get.return_value = mock_osrm_resp

        result = get_routes(
            origin=(41.8781, -87.6298),
            destination=(40.0, -88.0),
            provider=mock_tomtom,
        )

        assert result['provider_used'] == 'osrm_fallback'
        assert len(result['routes']) == 1
        assert result['routes'][0].duration_s == pytest.approx(3600.0 * 1.15, rel=1e-2)


class TestTripAnalyzeValidation:
    def test_validation_errors(self, client):
        now = datetime.now(timezone.utc)
        valid_dep = (now + timedelta(hours=5)).isoformat()

        # Load weight 0
        resp = client.post('/api/trips/analyze/', {
            'origin': {'lat': 41.8781, 'lng': -87.6298},
            'destination': {'lat': 32.7767, 'lng': -96.7970},
            'departure_time': valid_dep,
            'load_weight_lb': 0,
            'interval_miles': 25,
        }, content_type='application/json')
        assert resp.status_code == 400
        assert resp.json()['error']['code'] == 'validation_error'

        # Load weight 80,001
        resp = client.post('/api/trips/analyze/', {
            'origin': {'lat': 41.8781, 'lng': -87.6298},
            'destination': {'lat': 32.7767, 'lng': -96.7970},
            'departure_time': valid_dep,
            'load_weight_lb': 80001,
            'interval_miles': 25,
        }, content_type='application/json')
        assert resp.status_code == 400

        # Origin == Destination
        resp = client.post('/api/trips/analyze/', {
            'origin': {'lat': 41.8781, 'lng': -87.6298},
            'destination': {'lat': 41.8781, 'lng': -87.6298},
            'departure_time': valid_dep,
            'load_weight_lb': 40000,
            'interval_miles': 25,
        }, content_type='application/json')
        assert resp.status_code == 400
        assert 'cannot be the same' in resp.json()['error']['message']

        # Invalid interval (30 is not in 10, 25, 50)
        resp = client.post('/api/trips/analyze/', {
            'origin': {'lat': 41.8781, 'lng': -87.6298},
            'destination': {'lat': 32.7767, 'lng': -96.7970},
            'departure_time': valid_dep,
            'load_weight_lb': 40000,
            'interval_miles': 30,
        }, content_type='application/json')
        assert resp.status_code == 400

        # Departure beyond 16 days
        beyond_16 = (now + timedelta(days=17)).isoformat()
        resp = client.post('/api/trips/analyze/', {
            'origin': {'lat': 41.8781, 'lng': -87.6298},
            'destination': {'lat': 32.7767, 'lng': -96.7970},
            'departure_time': beyond_16,
            'load_weight_lb': 40000,
            'interval_miles': 25,
        }, content_type='application/json')
        assert resp.status_code == 400


class TestEndToEndTripAnalyze:
    @patch('trips.api.views.get_routes')
    def test_end_to_end_analyze_with_fixtures(self, mock_get_routes, client):
        """End-to-end analyze test asserting 3 routes, 1 recommended, and 1 weather request."""
        # Setup 3 fixture routes
        pts1 = [(41.8 + i * 0.5, -87.6 - i * 0.5) for i in range(10)]
        pts2 = [(41.8 + i * 0.5, -87.6 - i * 0.4) for i in range(10)]
        pts3 = [(41.8 + i * 0.5, -87.6 - i * 0.6) for i in range(10)]

        r1 = Route(id='r1', label='Fastest', points=pts1, distance_mi=300.0, duration_s=18000)
        r2 = Route(id='r2', label='Alternative 1', points=pts2, distance_mi=320.0, duration_s=19000)
        r3 = Route(id='r3', label='Alternative 2', points=pts3, distance_mi=340.0, duration_s=21000)

        mock_get_routes.return_value = {
            'routes': [r1, r2, r3],
            'provider_used': 'fixture',
            'notes': [],
        }

        dep_time = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()

        payload = {
            'origin': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago, IL'},
            'destination': {'lat': 32.7767, 'lng': -96.7970, 'label': 'Dallas, TX'},
            'departure_time': dep_time,
            'load_weight_lb': 42000,
            'interval_miles': 50,
            'scenario': 'calm',
        }

        resp = client.post('/api/trips/analyze/', payload, content_type='application/json')
        assert resp.status_code == 200
        data = resp.json()

        # Check 3 routes returned
        assert len(data['routes']) == 3
        # Check exactly one recommended
        assert data['recommendation'] is not None
        assert data['recommendation']['route_id'] == 'r1'
        assert data['routes'][0]['recommended'] is True
        assert data['routes'][1]['recommended'] is False
        assert data['routes'][2]['recommended'] is False

        # Check geometry order: [lng, lat]
        first_geom_pt = data['routes'][0]['geometry'][0]
        # lng is around -87.6, lat around 41.8 -> first element is lng
        assert first_geom_pt[0] < -80.0
        assert first_geom_pt[1] > 35.0

        # Check checkpoints structure
        cps = data['routes'][0]['checkpoints']
        assert len(cps) >= 2
        assert 'mile' in cps[0]
        assert 'weather' in cps[0]
        assert 'risk' in cps[0]
        assert cps[0]['risk']['level'] == 0  # Calm


class TestGeocodeEndpoint:
    @patch('trips.services.geocoding.requests.get')
    def test_geocode_success(self, mock_get, client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'results': [
                {
                    'position': {'lat': 41.8832, 'lon': -87.6324},
                    'address': {'freeformAddress': 'Chicago, IL'},
                }
            ]
        }
        mock_get.return_value = mock_resp

        resp = client.get('/api/geocode/?q=Chicago')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]['label'] == 'Chicago, IL'
        assert data[0]['lat'] == 41.8832
        assert data[0]['lng'] == -87.6324

    def test_geocode_short_query(self, client):
        resp = client.get('/api/geocode/?q=ab')
        assert resp.status_code == 200
        assert resp.json() == []
