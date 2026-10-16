"""Tests for corridor weather heatmap and 0-48h risk computation."""

from datetime import datetime, timedelta, timezone
import pytest
from django.core.cache import cache
from rest_framework.test import APIRequestFactory

from trips.services.heatmap import build_corridor_grid, generate_heatmap
from trips.services.risk import RiskLevel, checkpoint_risk
from trips.services.weather.base import Weather, WeatherProvider
from trips.services.weather.fixture import FixtureWeatherProvider
from trips.services.routing.base import Route, RoutingProvider
from trips.api.views import heatmap_view, analyze_trip_view


class MockWeatherProvider(WeatherProvider):
    def __init__(self, hourly_fn):
        self.hourly_fn = hourly_fn
        self.call_count = 0

    def get_hourly(self, points, start_utc, end_utc):
        self.call_count += 1
        return self.hourly_fn(points, start_utc, end_utc)


class MockRoutingProvider(RoutingProvider):
    def __init__(self, routes):
        self._routes = routes
        self.call_count = 0

    def calculate_routes(self, origin, destination, load_weight_lb=None, max_alternatives=2):
        self.call_count += 1
        return self._routes


@pytest.fixture(autouse=True)
def clear_django_cache():
    cache.clear()
    yield
    cache.clear()


def test_grid_dedupe_and_cap():
    """Verify corridor grid deduplicates by 0.25 deg and strictly respects max_points cap."""
    route_geom = [
        [41.8781, -87.6298],
        [40.0, -89.0],
        [38.0, -91.0],
        [35.0, -94.0],
        [32.7767, -96.7970],
    ]
    routes = [{'geometry': route_geom}]

    # Test with small max_points
    small_cap = 10
    grid_small = build_corridor_grid(routes, interval_miles=15.0, offset_miles=18.0, max_points=small_cap)
    assert len(grid_small) <= small_cap

    # Test default cap
    grid_default = build_corridor_grid(routes, interval_miles=15.0, offset_miles=18.0, max_points=250)
    assert len(grid_default) <= 250
    assert len(grid_default) > 0

    # Ensure all coordinates are rounded to 0.25 grid multiples
    for lat, lng in grid_default:
        assert round(lat * 4) == pytest.approx(lat * 4, abs=1e-3)
        assert round(lng * 4) == pytest.approx(lng * 4, abs=1e-3)

    # Ensure no duplicates
    assert len(grid_default) == len(set(grid_default))


def test_points_include_offset_points():
    """Verify points include sideways perpendicular offset points to both sides."""
    # North-South line
    polyline = [
        [40.0, -90.0],
        [42.0, -90.0],
    ]
    routes = [{'geometry': polyline}]
    grid = build_corridor_grid(routes, interval_miles=20.0, offset_miles=18.0, grid_deg=0.25, max_points=50)

    # Centerline has lng=-90.0. Offset points should have lng != -90.0
    lngs = [pt[1] for pt in grid]
    west_offsets = [lng for lng in lngs if lng < -90.0]
    east_offsets = [lng for lng in lngs if lng > -90.0]

    assert len(west_offsets) > 0, 'Grid must include left/west offset points'
    assert len(east_offsets) > 0, 'Grid must include right/east offset points'


def test_hourly_arrays_length_49():
    """Verify that hourly levels array for each point has length exactly 49."""
    dep_time = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
    routes = [{'geometry': [[41.0, -87.0], [40.0, -88.0]]}]
    provider = FixtureWeatherProvider.calm()

    result = generate_heatmap(
        routes=routes,
        departure_time=dep_time,
        load_weight_lb=42000,
        weather_provider=provider,
    )

    assert result['hours'] == 49
    assert len(result['points']) > 0
    for pt in result['points']:
        assert len(pt['levels']) == 49
        assert all(isinstance(lvl, int) and 0 <= lvl <= 4 for lvl in pt['levels'])


def test_levels_match_checkpoint_risk_known_weather():
    """Verify computed levels strictly match checkpoint_risk logic for known weather and load rules."""
    dep_time = datetime(2026, 10, 15, 14, 0, tzinfo=timezone.utc)
    routes = [{'geometry': [[41.0, -87.0], [40.0, -88.0]]}]

    # Weather with wind=48 mph (Severe base).
    # With load=42,000 lb (> 30,000 lb and wind 45-55 mph), load rule escalates risk to NO_TRAVEL (4).
    test_weather = Weather(wind_mph=48.0, gust_mph=60.0, rain_in_hr=0.0, snow_in_hr=0.0)
    provider = FixtureWeatherProvider(default_weather=test_weather)

    expected_risk = checkpoint_risk(
        {'wind_speed_mph': 48.0, 'rain_in_hr': 0.0, 'snow_in_hr': 0.0},
        load_lb=42000.0,
    )
    assert expected_risk['level'] == RiskLevel.NO_TRAVEL

    result = generate_heatmap(
        routes=routes,
        departure_time=dep_time,
        load_weight_lb=42000.0,
        weather_provider=provider,
    )

    for pt in result['points']:
        for lvl in pt['levels']:
            assert lvl == int(RiskLevel.NO_TRAVEL)


def test_fixture_storm_only_at_hour_6():
    """Verify a storm occurring only at hour 6 causes level > 0 exclusively at index 6."""
    dep_time = datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc)
    storm_hour = dep_time + timedelta(hours=6)

    storm_weather = Weather(wind_mph=52.0, gust_mph=70.0, rain_in_hr=0.75, snow_in_hr=0.0)
    provider = FixtureWeatherProvider.storm_at_hour(
        target_hour_utc=storm_hour,
        storm_weather=storm_weather,
    )

    routes = [{'geometry': [[41.8781, -87.6298], [40.0, -89.0], [38.0, -91.0]]}]
    result = generate_heatmap(
        routes=routes,
        departure_time=dep_time,
        load_weight_lb=42000.0,
        weather_provider=provider,
    )

    assert result['hours'] == 49
    assert len(result['points']) > 0

    for pt in result['points']:
        # At hour index 6, storm conditions must trigger risk > 0
        assert pt['levels'][6] > 0, f"Hour 6 should have elevated risk, got {pt['levels'][6]}"
        # For all other hours, weather is calm (level 0)
        for h in range(49):
            if h != 6:
                assert pt['levels'][h] == 0, f"Hour {h} should be calm (0), got {pt['levels'][h]}"


def test_one_weather_call_in_total():
    """Verify generate_heatmap issues exactly ONE batched weather provider call."""
    dep_time = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
    routes = [
        {'geometry': [[41.0, -87.0], [40.0, -88.0]]},
        {'geometry': [[41.0, -87.0], [39.0, -89.0]]},
    ]

    mock_prov = MockWeatherProvider(
        lambda points, start, end: {pt: {} for pt in points}
    )

    generate_heatmap(
        routes=routes,
        departure_time=dep_time,
        load_weight_lb=42000,
        weather_provider=mock_prov,
    )

    assert mock_prov.call_count == 1, f"Expected 1 weather call, got {mock_prov.call_count}"


def test_heatmap_endpoint_uses_cached_routes():
    """Verify POST /api/heatmap reuses cached routes from prior analyze call without re-querying routing provider."""
    factory = APIRequestFactory()

    dummy_routes = [
        Route(
            id='route_1',
            label='Route 1',
            distance_mi=150.0,
            duration_s=7200.0,
            points=[[41.8781, -87.6298], [41.0, -88.0], [40.0, -89.0]],
        ),
        Route(
            id='route_2',
            label='Route 2',
            distance_mi=160.0,
            duration_s=7500.0,
            points=[[41.8781, -87.6298], [40.5, -88.2], [40.0, -89.0]],
        ),
    ]

    mock_routing = MockRoutingProvider(dummy_routes)
    mock_weather = FixtureWeatherProvider.calm()

    body = {
        'origin': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago'},
        'destination': {'lat': 40.0, 'lng': -89.0, 'label': 'Illinois'},
        'departure_time': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        'load_weight_lb': 42000,
        'interval_miles': 25,
        'scenario': 'calm',
    }

    # 1. First call: /api/trips/analyze populates route cache
    req_analyze = factory.post('/api/trips/analyze', body, format='json')
    res_analyze = analyze_trip_view(req_analyze, routing_provider=mock_routing, weather_provider=mock_weather)
    assert res_analyze.status_code == 200
    assert mock_routing.call_count == 1

    # 2. Second call: /api/heatmap with same body
    req_heatmap = factory.post('/api/heatmap', body, format='json')
    res_heatmap = heatmap_view(req_heatmap, routing_provider=mock_routing, weather_provider=mock_weather)
    assert res_heatmap.status_code == 200

    # mock_routing call_count MUST still be 1 (hit cache!)
    assert mock_routing.call_count == 1, 'Routing provider should NOT be called again when cache exists'

    data = res_heatmap.data
    assert data['hours'] == 49
    assert len(data['points']) > 0
    assert len(data['points'][0]['levels']) == 49
