"""Tests for analysis pipeline: nearest-hour selection, temporal storm avoidance, horizons, and batching."""

from datetime import datetime, timezone
from unittest.mock import MagicMock

from trips.services.risk import RiskLevel
from trips.services.weather.base import Weather
from trips.services.weather.fixture import FixtureWeatherProvider
from trips.services.analysis import (
    analyze_routes,
    get_nearest_hour_weather,
)


class TestAnalysisPipeline:
    def test_nearest_hour_selection(self):
        """Verifies picking the closest forecast hour to checkpoint ETA."""
        dt_14 = datetime(2026, 10, 15, 14, 0, tzinfo=timezone.utc)
        dt_15 = datetime(2026, 10, 15, 15, 0, tzinfo=timezone.utc)

        w_14 = Weather(wind_mph=10, gust_mph=15, rain_in_hr=0, snow_in_hr=0)
        w_15 = Weather(wind_mph=45, gust_mph=60, rain_in_hr=0.5, snow_in_hr=0)

        forecast = {dt_14: w_14, dt_15: w_15}

        # ETA 14:20 is closer to 14:00
        eta_1420 = datetime(2026, 10, 15, 14, 20, tzinfo=timezone.utc)
        assert get_nearest_hour_weather(forecast, eta_1420) == w_14

        # ETA 14:40 is closer to 15:00
        eta_1440 = datetime(2026, 10, 15, 14, 40, tzinfo=timezone.utc)
        assert get_nearest_hour_weather(forecast, eta_1440) == w_15

    def test_storm_at_1500_temporal_avoidance(self):
        """
        A route whose truck hits the checkpoint at 15:00 UTC encounters a Severe storm.
        The exact same route departing 4 hours later arrives at 19:00 UTC and avoids the storm.
        """
        storm_time = datetime(2026, 10, 15, 15, 0, tzinfo=timezone.utc)
        provider = FixtureWeatherProvider.storm_at_hour(
            target_hour_utc=storm_time,
            storm_weather=Weather(wind_mph=48.0, gust_mph=65.0, rain_in_hr=0.6, snow_in_hr=0.0),
        )

        # Route takes 2 hours (7200 seconds) along a 100-mile stretch
        route_def = {
            'route_id': 'corridor_route',
            'geometry': [
                [39.0, -75.0],
                [39.5, -75.0],
                [40.0, -75.0],
            ],
            'duration_s': 7200.0,  # 2 hours
        }

        # Case 1: Departure at 13:00 UTC -> destination ETA is 15:00 UTC (during storm)
        dep_1300 = datetime(2026, 10, 15, 13, 0, tzinfo=timezone.utc)
        res_storm = analyze_routes([route_def], dep_1300, weather_provider=provider, checkpoint_interval_miles=50.0)

        route_storm = res_storm['ranked_routes'][0]
        # At 15:00 UTC, the storm triggers SEVERE risk
        assert route_storm['max_level'] == RiskLevel.SEVERE
        assert route_storm['miles_by_level']['severe'] > 0

        # Case 2: Departure 4 hours later at 17:00 UTC -> destination ETA is 19:00 UTC (after storm)
        dep_1700 = datetime(2026, 10, 15, 17, 0, tzinfo=timezone.utc)
        res_calm = analyze_routes([route_def], dep_1700, weather_provider=provider, checkpoint_interval_miles=50.0)

        route_calm = res_calm['ranked_routes'][0]
        # Storm has passed; route is all LOW risk
        assert route_calm['max_level'] == RiskLevel.LOW
        assert route_calm['miles_by_level']['severe'] == 0.0

    def test_no_forecast_beyond_16_day_horizon(self):
        """Checkpoints with ETAs > 16 days are marked no_forecast, excluded from risk, and flagged."""
        provider = FixtureWeatherProvider.calm()

        # Departure now, but route duration is 18 days
        dep = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
        route_long = {
            'route_id': 'epic_route',
            'geometry': [
                [35.0, -75.0],
                [40.0, -75.0],
            ],
            'duration_s': 18 * 86400.0,  # 18 days
        }

        res = analyze_routes([route_long], dep, weather_provider=provider, checkpoint_interval_miles=100.0)
        route_summary = res['ranked_routes'][0]
        checkpoints = route_summary['checkpoints']

        # Last checkpoint is at 18 days -> must be beyond horizon
        last_cp = checkpoints[-1]
        assert last_cp['no_forecast'] is True
        assert last_cp['has_forecast'] is False

        # Warning should be reported
        assert len(res['warnings']) > 0
        assert 'beyond the 16-day forecast horizon' in res['warnings'][0]

    def test_one_weather_call_for_multiple_routes(self):
        """Verifies all checkpoints from all routes are aggregated into a single weather request."""
        mock_provider = MagicMock()
        mock_provider.get_hourly.return_value = {}

        routes = [
            {'route_id': 'r1', 'geometry': [[40.0, -75.0], [40.5, -75.0]], 'duration_s': 3600},
            {'route_id': 'r2', 'geometry': [[41.0, -75.0], [41.5, -75.0]], 'duration_s': 4200},
            {'route_id': 'r3', 'geometry': [[42.0, -75.0], [42.5, -75.0]], 'duration_s': 5000},
        ]
        dep = datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc)

        analyze_routes(routes, dep, weather_provider=mock_provider, checkpoint_interval_miles=25.0)

        # Provider must be called exactly once
        assert mock_provider.get_hourly.call_count == 1
        call_args = mock_provider.get_hourly.call_args[0]
        points_requested = call_args[0]

        # Points list contains points from all 3 routes combined
        assert len(points_requested) >= 6
