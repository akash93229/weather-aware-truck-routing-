"""Tests for Open-Meteo weather provider, chunking, retries, and caching."""

from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
import pytest
import requests
from django.core.cache import cache

from trips.services.weather.base import WeatherUnavailable
from trips.services.weather.open_meteo import OpenMeteoProvider


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


class TestOpenMeteoProvider:
    @patch('trips.services.weather.open_meteo.requests.get')
    def test_rain_plus_showers_sum(self, mock_get):
        """Verify rain_in_hr sums stratiform rain and convective showers."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'hourly': {
                'time': ['2026-10-15T12:00'],
                'wind_speed_10m': [15.0],
                'wind_gusts_10m': [22.0],
                'rain': [0.25],
                'showers': [0.35],
                'snowfall': [0.0],
            }
        }
        mock_get.return_value = mock_response

        provider = OpenMeteoProvider()
        pt = (49.41, 8.68)
        start = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 10, 15, 23, 0, tzinfo=timezone.utc)

        data = provider.get_hourly([pt], start, end)
        weather = data[pt][datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)]

        # rain (0.25) + showers (0.35) = 0.60
        assert pytest.approx(weather.rain_in_hr, abs=1e-4) == 0.60
        assert weather.wind_mph == 15.0
        assert weather.gust_mph == 22.0

    @patch('trips.services.weather.open_meteo.requests.get')
    def test_batching_chunk_count(self, mock_get):
        """120 locations should result in 3 chunks (50, 50, 20)."""
        mock_response = MagicMock()
        mock_response.status_code = 200

        def side_effect(*args, **kwargs):
            lats = kwargs['params']['latitude'].split(',')
            # Return one mock object per coordinate in request
            return MagicMock(
                status_code=200,
                json=lambda: [
                    {
                        'hourly': {
                            'time': ['2026-10-15T00:00'],
                            'wind_speed_10m': [5.0],
                            'wind_gusts_10m': [7.0],
                            'rain': [0.0],
                            'showers': [0.0],
                            'snowfall': [0.0],
                        }
                    }
                    for _ in lats
                ],
            )

        mock_get.side_effect = side_effect

        provider = OpenMeteoProvider()
        # Generate 120 unique points
        pts = [(round(40.0 + i * 0.1, 2), round(-75.0 + i * 0.1, 2)) for i in range(120)]
        start = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 10, 15, 23, 0, tzinfo=timezone.utc)

        provider.get_hourly(pts, start, end)
        assert mock_get.call_count == 3

    @patch('trips.services.weather.open_meteo.requests.get')
    def test_timeout_retry_then_failure(self, mock_get):
        """Should attempt once, retry once, then raise WeatherUnavailable."""
        mock_get.side_effect = requests.exceptions.Timeout('Connection timed out')

        provider = OpenMeteoProvider()
        pt = (49.41, 8.68)
        start = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 10, 15, 23, 0, tzinfo=timezone.utc)

        with pytest.raises(WeatherUnavailable):
            provider.get_hourly([pt], start, end)

        # 1 initial + 1 retry = 2 calls
        assert mock_get.call_count == 2

    @patch('trips.services.weather.open_meteo.requests.get')
    def test_cache_hit_prevents_second_http_call(self, mock_get):
        """Second call for same coordinates and date range should use cache."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'hourly': {
                'time': ['2026-10-15T00:00'],
                'wind_speed_10m': [10.0],
                'wind_gusts_10m': [12.0],
                'rain': [0.0],
                'showers': [0.0],
                'snowfall': [0.0],
            }
        }
        mock_get.return_value = mock_response

        provider = OpenMeteoProvider()
        pt = (49.4146, 8.6815)
        start = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 10, 15, 23, 0, tzinfo=timezone.utc)

        # Call 1: HTTP request is made
        res1 = provider.get_hourly([pt], start, end)
        assert mock_get.call_count == 1
        assert pt in res1

        # Call 2: Cache hit, mock_get not called again
        res2 = provider.get_hourly([pt], start, end)
        assert mock_get.call_count == 1
        assert pt in res2

    @patch('trips.services.weather.open_meteo.requests.get')
    def test_multiday_date_range_requests(self, mock_get):
        """Verify that trips lasting > 3 days pass full start_date and end_date."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'hourly': {
                'time': ['2026-10-15T00:00', '2026-10-20T23:00'],
                'wind_speed_10m': [8.0, 10.0],
                'wind_gusts_10m': [10.0, 12.0],
                'rain': [0.0, 0.0],
                'showers': [0.0, 0.0],
                'snowfall': [0.0, 0.0],
            }
        }
        mock_get.return_value = mock_response

        provider = OpenMeteoProvider()
        pt = (41.8781, -87.6298)
        start = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)
        end = datetime(2026, 10, 20, 18, 0, tzinfo=timezone.utc)  # 5+ day trip

        provider.get_hourly([pt], start, end)

        assert mock_get.call_count == 1
        sent_params = mock_get.call_args[1]['params']
        assert sent_params['start_date'] == '2026-10-15'
        assert sent_params['end_date'] == '2026-10-20'
        assert 'forecast_days' not in sent_params
