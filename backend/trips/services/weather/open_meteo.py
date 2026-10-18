"""Open-Meteo weather provider implementation with chunking, retries, and caching."""

import logging
import requests
import time
import concurrent.futures
from datetime import datetime, timezone
from typing import List, Tuple, Dict, Optional
from django.core.cache import cache

from trips.services.weather.base import (
    Weather,
    WeatherProvider,
    WeatherUnavailable,
)
from trips.services.weather.report import WMO_DESCRIPTIONS

logger = logging.getLogger(__name__)

CHUNK_SIZE = 50
CACHE_TTL_SECONDS = 600  # 10 minutes
REQUEST_TIMEOUT = (5, 12)  # 5s connect, 12s read

# Shared requests.Session for HTTP keep-alive connection reuse across queries
_shared_session = requests.Session()


def _http_get(*args, **kwargs):
    """
    Execute GET using shared requests.Session for connection reuse and performance.
    If requests.get is mocked (e.g. in unit tests), dispatches to the mock.
    """
    if hasattr(requests.get, 'assert_called') or getattr(requests.get, '__module__', None) != 'requests.api':
        return requests.get(*args, **kwargs)
    return _shared_session.get(*args, **kwargs)


def make_cache_key(lat: float, lng: float, date_str: str, end_date_str: Optional[str] = None) -> str:
    """Build a deterministic cache key with coordinates rounded to 1 decimal (~11km / 7 mi) + date."""
    return f'openmeteo:{round(lat, 1):.1f}:{round(lng, 1):.1f}:{date_str}'


class OpenMeteoProvider(WeatherProvider):
    """
    Fetches hourly weather forecasts from Open-Meteo API.
    Supports location chunking (up to 50 locations per request), parallel requests (max 4 threads),
    1 automatic retry with short backoff, and 10-minute caching.
    """

    def __init__(self, base_url: str = 'https://api.open-meteo.com/v1/forecast'):
        self.base_url = base_url
        self.has_partial_weather: bool = False
        self.is_weather_unavailable: bool = False

    def _fetch_chunk(
        self,
        chunk_points: List[Tuple[float, float]],
        forecast_days: Optional[int] = 3,
        start_date_str: Optional[str] = None,
        end_date_str: Optional[str] = None,
    ) -> List[dict]:
        """Fetch weather data for a chunk of up to 50 locations with 1 retry."""
        lats = ','.join(f'{pt[0]:.4f}' for pt in chunk_points)
        lngs = ','.join(f'{pt[1]:.4f}' for pt in chunk_points)

        params = {
            'latitude': lats,
            'longitude': lngs,
            'hourly': 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,rain,showers,snowfall',
            'wind_speed_unit': 'mph',
            'precipitation_unit': 'inch',
            'temperature_unit': 'fahrenheit',
            'timezone': 'GMT',
        }
        if forecast_days:
            params['forecast_days'] = forecast_days
        else:
            if start_date_str:
                params['start_date'] = start_date_str
            if end_date_str:
                params['end_date'] = end_date_str

        last_error = None
        for attempt in range(2):  # initial attempt + 1 retry
            if attempt > 0:
                time.sleep(0.5)
            t0 = time.perf_counter()
            try:
                response = _http_get(
                    self.base_url,
                    params=params,
                    timeout=REQUEST_TIMEOUT,
                )
                elapsed = time.perf_counter() - t0
                logger.info(
                    '[TIMING] open_meteo_chunk (%d locations, attempt=%d) took %.3fs (status=%s)',
                    len(chunk_points),
                    attempt + 1,
                    elapsed,
                    response.status_code,
                )
                if response.status_code == 200:
                    data = response.json()
                    # Open-Meteo returns a single dict if 1 location, or a list of dicts if multiple
                    if isinstance(data, list):
                        return data
                    return [data]
                else:
                    last_error = f'HTTP {response.status_code}: {response.text[:150]}'
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)

        logger.error('Open-Meteo failed after retries: %s', last_error)
        raise WeatherUnavailable(f'Open-Meteo weather service unavailable after retry: {last_error}')

    def get_hourly(
        self,
        points: List[Tuple[float, float]],
        start_utc: datetime,
        end_utc: datetime,
    ) -> Dict[Tuple[float, float], Dict[datetime, Weather]]:
        """
        Fetch hourly weather for given points between start_utc and end_utc.
        Points are rounded to 0.1 deg (~7 mi) for deduplication, cache lookup, and batching.
        """
        if not points:
            return {}

        # Reset degradation flags
        self.has_partial_weather = False
        self.is_weather_unavailable = False

        # Normalize UTC datetimes
        if start_utc.tzinfo is None:
            start_utc = start_utc.replace(tzinfo=timezone.utc)
        else:
            start_utc = start_utc.astimezone(timezone.utc)

        if end_utc.tzinfo is None:
            end_utc = end_utc.replace(tzinfo=timezone.utc)
        else:
            end_utc = end_utc.astimezone(timezone.utc)

        start_date_str = start_utc.strftime('%Y-%m-%d')
        end_date_str = end_utc.strftime('%Y-%m-%d')
        date_key = start_date_str
        trip_days = (end_utc.date() - start_utc.date()).days + 1
        if trip_days > 3:
            forecast_days = None
        else:
            forecast_days = min(3, max(1, trip_days))

        results: Dict[Tuple[float, float], Dict[datetime, Weather]] = {}
        missing_points: List[Tuple[float, float]] = []

        # Check Django cache (10 min TTL)
        for pt in points:
            cache_key = make_cache_key(pt[0], pt[1], date_key)
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                results[pt] = cached_data
            else:
                missing_points.append(pt)

        if not missing_points:
            return results

        # Deduplicate missing points by rounding lat/lon to 0.1 deg (~7 mi)
        unique_missing: List[Tuple[float, float]] = []
        seen = set()
        for pt in missing_points:
            rounded_pt = (round(pt[0], 1), round(pt[1], 1))
            if rounded_pt not in seen:
                seen.add(rounded_pt)
                unique_missing.append(pt)

        # Process in chunks of up to 50 locations
        t_weather = time.perf_counter()
        chunks = [unique_missing[i:i + CHUNK_SIZE] for i in range(0, len(unique_missing), CHUNK_SIZE)]

        chunk_results: List[Tuple[List[Tuple[float, float]], List[dict]]] = []
        chunk_failed = False

        if len(chunks) == 1:
            try:
                chunk_data = self._fetch_chunk(
                    chunks[0],
                    forecast_days=forecast_days,
                    start_date_str=start_date_str,
                    end_date_str=end_date_str,
                )
                chunk_results.append((chunks[0], chunk_data))
            except Exception as exc:
                logger.warning('Single chunk Open-Meteo fetch failed: %s', exc)
                chunk_failed = True
                if not results:
                    self.is_weather_unavailable = True
                    raise
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(chunks))) as executor:
                future_to_chunk = {
                    executor.submit(
                        self._fetch_chunk,
                        chunk,
                        forecast_days,
                        start_date_str,
                        end_date_str,
                    ): chunk
                    for chunk in chunks
                }
                for future in concurrent.futures.as_completed(future_to_chunk):
                    chunk = future_to_chunk[future]
                    try:
                        chunk_data = future.result()
                        chunk_results.append((chunk, chunk_data))
                    except Exception as exc:
                        logger.warning('Chunk fetch failed: %s', exc)
                        chunk_failed = True

        if chunk_failed:
            if not chunk_results and not results:
                logger.error('All Open-Meteo chunks failed.')
                self.is_weather_unavailable = True
                raise WeatherUnavailable('All weather forecast requests failed.')
            self.has_partial_weather = True

        for chunk, chunk_data in chunk_results:
            for pt, loc_data in zip(chunk, chunk_data):
                hourly = loc_data.get('hourly', {})
                times = hourly.get('time', [])
                winds = hourly.get('wind_speed_10m', [])
                gusts = hourly.get('wind_gusts_10m', [])
                rains = hourly.get('rain', [])
                showers = hourly.get('showers', [])
                snows = hourly.get('snowfall', [])
                temps = hourly.get('temperature_2m', [])
                humidities = hourly.get('relative_humidity_2m', [])
                weather_codes = hourly.get('weather_code', [])

                location_weather: Dict[datetime, Weather] = {}
                for idx, t_str in enumerate(times):
                    dt = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
                    w_mph = float(winds[idx]) if idx < len(winds) and winds[idx] is not None else 0.0
                    g_mph = float(gusts[idx]) if idx < len(gusts) and gusts[idx] is not None else w_mph
                    r_in = float(rains[idx]) if idx < len(rains) and rains[idx] is not None else 0.0
                    s_in = float(showers[idx]) if idx < len(showers) and showers[idx] is not None else 0.0
                    sn_in = float(snows[idx]) if idx < len(snows) and snows[idx] is not None else 0.0
                    t_f = float(temps[idx]) if idx < len(temps) and temps[idx] is not None else 65.0
                    h_pct = float(humidities[idx]) if idx < len(humidities) and humidities[idx] is not None else 50.0
                    code = int(weather_codes[idx]) if idx < len(weather_codes) and weather_codes[idx] is not None else 0
                    cond = WMO_DESCRIPTIONS.get(code, 'Clear')

                    # Total rain intensity = rain + showers
                    total_rain = r_in + s_in

                    location_weather[dt] = Weather(
                        wind_mph=w_mph,
                        gust_mph=g_mph,
                        rain_in_hr=total_rain,
                        snow_in_hr=sn_in,
                        temp_f=t_f,
                        humidity_pct=h_pct,
                        condition=cond,
                    )

                cache_key = make_cache_key(pt[0], pt[1], date_key)
                cache.set(cache_key, location_weather, timeout=CACHE_TTL_SECONDS)

                # Store for all points matching this location (~0.1 deg)
                for req_pt in points:
                    if round(req_pt[0], 1) == round(pt[0], 1) and round(req_pt[1], 1) == round(pt[1], 1):
                        results[req_pt] = location_weather

        # For any requested point that didn't get exact match, reuse nearest result
        if results:
            available_pts = list(results.keys())
            for req_pt in points:
                if req_pt not in results:
                    nearest_pt = min(available_pts, key=lambda p: (p[0] - req_pt[0])**2 + (p[1] - req_pt[1])**2)
                    results[req_pt] = results[nearest_pt]

        weather_duration = time.perf_counter() - t_weather
        num_chunks = (len(unique_missing) + CHUNK_SIZE - 1) // CHUNK_SIZE
        logger.info(
            '[TIMING] weather_total (%d points requested, %d unique missing, %d chunks) took %.3fs',
            len(points),
            len(unique_missing),
            num_chunks,
            weather_duration,
        )

        return results
