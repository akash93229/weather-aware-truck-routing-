"""Tests verifying routing provider priority and fallback behavior."""

from unittest.mock import patch, MagicMock
from django.core.cache import cache
from django.test import override_settings

from trips.services.routing.service import get_routes
from trips.services.routing.base import Route, RoutingUnavailable


class TestRoutingProviderOrder:
    def setup_method(self):
        cache.clear()

    @override_settings(TOMTOM_API_KEY='dummy-tomtom-key', HERE_API_KEY='', ROUTING_PROVIDER='')
    @patch('trips.services.routing.service.TomTomRoutingProvider')
    @patch('trips.services.routing.service.HERERoutingProvider')
    @patch('trips.services.routing.service.OSRMRoutingProvider')
    def test_tomtom_called_first_when_api_key_set(self, mock_osrm_cls, mock_here_cls, mock_tomtom_cls):
        """When TOMTOM_API_KEY is configured, TomTom is the primary provider."""
        mock_tomtom = MagicMock()
        mock_tomtom.calculate_routes.return_value = [
            Route(id='r1', label='R1', points=[(41.88, -87.63), (32.78, -96.80)], distance_mi=950.0, duration_s=50000.0),
            Route(id='r2', label='R2', points=[(41.88, -87.63), (35.0, -90.0), (32.78, -96.80)], distance_mi=970.0, duration_s=52000.0),
            Route(id='r3', label='R3', points=[(41.88, -87.63), (36.0, -89.0), (32.78, -96.80)], distance_mi=990.0, duration_s=54000.0),
        ]
        mock_tomtom_cls.return_value = mock_tomtom

        res = get_routes(origin=(41.88, -87.63), destination=(32.78, -96.80))

        assert res['provider_used'] == 'tomtom'
        assert mock_tomtom.calculate_routes.called
        assert not mock_here_cls.called, 'HERE provider must never be called when HERE_API_KEY is unset'

    @override_settings(TOMTOM_API_KEY='dummy-tomtom-key', HERE_API_KEY='', ROUTING_PROVIDER='')
    @patch('trips.services.routing.service.TomTomRoutingProvider')
    @patch('trips.services.routing.service.HERERoutingProvider')
    @patch('trips.services.routing.service.OSRMRoutingProvider')
    def test_tomtom_failure_falls_back_to_osrm(self, mock_osrm_cls, mock_here_cls, mock_tomtom_cls):
        """When TomTom fails with RoutingUnavailable, service seamlessly falls back to OSRM."""
        mock_tomtom = MagicMock()
        mock_tomtom.calculate_routes.side_effect = RoutingUnavailable('TomTom upstream 503 error')
        mock_tomtom_cls.return_value = mock_tomtom

        mock_osrm = MagicMock()
        mock_osrm.calculate_routes.return_value = [
            Route(id='osrm1', label='OSRM 1', points=[(41.88, -87.63), (32.78, -96.80)], distance_mi=960.0, duration_s=52000.0),
            Route(id='osrm2', label='OSRM 2', points=[(41.88, -87.63), (35.0, -90.0), (32.78, -96.80)], distance_mi=980.0, duration_s=54000.0),
            Route(id='osrm3', label='OSRM 3', points=[(41.88, -87.63), (36.0, -89.0), (32.78, -96.80)], distance_mi=1000.0, duration_s=56000.0),
        ]
        mock_osrm_cls.return_value = mock_osrm

        res = get_routes(origin=(41.88, -87.63), destination=(32.78, -96.80))

        assert res['provider_used'] == 'osrm_fallback'
        assert mock_tomtom.calculate_routes.called
        assert mock_osrm.calculate_routes.called
        assert not mock_here_cls.called, 'HERE provider must not be called during fallback when unset'

    @override_settings(TOMTOM_API_KEY='', HERE_API_KEY='', ROUTING_PROVIDER='')
    @patch('trips.services.routing.service.HERERoutingProvider')
    @patch('trips.services.routing.service.OSRMRoutingProvider')
    def test_here_not_called_when_unset(self, mock_osrm_cls, mock_here_cls):
        """When HERE_API_KEY is unset and no TOMTOM key is present, OSRM is used, never HERE."""
        mock_osrm = MagicMock()
        mock_osrm.calculate_routes.return_value = [
            Route(id='osrm1', label='OSRM 1', points=[(41.88, -87.63), (32.78, -96.80)], distance_mi=960.0, duration_s=52000.0),
        ]
        mock_osrm_cls.return_value = mock_osrm

        res = get_routes(origin=(41.88, -87.63), destination=(32.78, -96.80))

        assert res['provider_used'] == 'osrm_fallback'
        assert not mock_here_cls.called, 'HERE must not be initialized or called'
