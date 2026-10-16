"""Tests for HERE Routing API v8 provider, flexpolyline decoding, and fallback integration."""

from unittest.mock import patch, MagicMock
import pytest
import flexpolyline

from trips.services.routing.here import HERERoutingProvider
from trips.services.routing.base import RoutingUnavailable, NoRouteFound


class TestHERERoutingProvider:
    def test_missing_api_key_raises_routing_unavailable(self):
        provider = HERERoutingProvider(api_key='')
        with pytest.raises(RoutingUnavailable) as exc:
            provider.calculate_routes(origin=(41.8781, -87.6298), destination=(32.7767, -96.7970))
        assert 'HERE_API_KEY is not configured' in str(exc.value)

    @patch('trips.services.routing.here.requests.get')
    def test_successful_here_route_decoding(self, mock_get):
        # Create a real flexible polyline
        sample_coords = [(41.8781, -87.6298), (41.5, -88.0), (32.7767, -96.7970)]
        encoded_poly = flexpolyline.encode(sample_coords)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'routes': [
                {
                    'sections': [
                        {
                            'summary': {'length': 160934.4, 'duration': 7200},  # 100 miles, 2 hours
                            'polyline': encoded_poly,
                        }
                    ]
                }
            ]
        }
        mock_get.return_value = mock_resp

        provider = HERERoutingProvider(api_key='test-key')
        routes = provider.calculate_routes(
            origin=(41.8781, -87.6298),
            destination=(32.7767, -96.7970),
            load_weight_lb=42000,
        )

        assert len(routes) == 1
        r = routes[0]
        assert r.distance_mi == pytest.approx(100.0, rel=1e-2)
        assert r.duration_s == 7200.0
        assert len(r.points) == 3
        assert r.points[0] == pytest.approx((41.8781, -87.6298), rel=1e-4)

    @patch('trips.services.routing.here.requests.get')
    def test_here_empty_routes_raises_no_route(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'routes': []}
        mock_get.return_value = mock_resp

        provider = HERERoutingProvider(api_key='test-key')
        with pytest.raises(NoRouteFound):
            provider.calculate_routes(origin=(41.8781, -87.6298), destination=(32.7767, -96.7970))

    @patch('trips.services.routing.here.requests.get')
    def test_here_service_error_raises_routing_unavailable(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mock_resp.text = 'Service Unavailable'
        mock_get.return_value = mock_resp

        provider = HERERoutingProvider(api_key='test-key')
        with pytest.raises(RoutingUnavailable):
            provider.calculate_routes(origin=(41.8781, -87.6298), destination=(32.7767, -96.7970))
