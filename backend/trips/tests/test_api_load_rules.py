"""API-level tests for wind and truck load rules through POST /api/trips/analyze/."""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest

from trips.services.routing.base import Route


@pytest.fixture
def mock_fixture_routes():
    """Mock routing provider returning a single deterministic fixture route."""
    pts = [(41.8 + i * 0.1, -87.6 - i * 0.1) for i in range(5)]
    fixture_route = Route(
        id='route_fixture_1',
        label='Fastest',
        points=pts,
        distance_mi=50.0,
        duration_s=3600.0,
    )
    with patch('trips.api.views.get_routes') as mock_get:
        mock_get.return_value = {
            'routes': [fixture_route],
            'provider_used': 'fixture',
            'notes': [],
        }
        yield mock_get


@pytest.mark.django_db
class TestApiLoadRules:
    """
    Assert checkpoint risk.level and risk.load_rule across all required test combinations:
    - wind 55, load 1,000 lb -> No Travel (4)
    - wind 50, load 30,001 lb -> No Travel (4), load_rule set
    - wind 50, load 30,000 lb -> Severe (3), load_rule null
    - wind 40, load 40,001 lb -> Severe (3), load_rule set
    - wind 40, load 40,000 lb -> High (2), load_rule null
    """

    @pytest.mark.parametrize(
        'wind_mph,load_lb,expected_level,expect_load_rule',
        [
            (55.0, 1000.0, 4, True),
            (50.0, 30001.0, 4, True),
            (50.0, 30000.0, 3, False),
            (40.0, 40001.0, 3, True),
            (40.0, 40000.0, 2, False),
        ],
    )
    def test_checkpoint_load_rules_through_analyze_api(
        self,
        mock_fixture_routes,
        client,
        wind_mph,
        load_lb,
        expected_level,
        expect_load_rule,
    ):
        dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        payload = {
            'origin': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago, IL'},
            'destination': {'lat': 42.3314, 'lng': -83.0458, 'label': 'Detroit, MI'},
            'departure_time': dep_time,
            'load_weight_lb': load_lb,
            'interval_miles': 25,
            'scenario': 'constant_wind',
            'constant_wind_mph': wind_mph,
        }

        resp = client.post('/api/trips/analyze/', payload, content_type='application/json')
        assert resp.status_code == 200
        data = resp.json()

        assert len(data['routes']) >= 1
        cps = data['routes'][0]['checkpoints']
        assert len(cps) >= 1

        for cp in cps:
            assert cp['risk']['level'] == expected_level
            if expect_load_rule:
                assert cp['risk']['load_rule'] is not None
                assert len(cp['risk']['load_rule']) > 0
            else:
                assert cp['risk']['load_rule'] is None
