"""Open-Meteo weather provider implementation with chunking, retries, and caching."""

import logging
import requests
import time
import concurrent.futures
from datetime import datetime, timezone
from typing import List, Tuple, Dict
from django.core.cache import cache

from trips.services.weather.base import (
    Weather,
    WeatherProvider,
    WeatherUnavailable,
)

logger = logging.getLogger(__name__)

CHUNK_SIZE = 50
CACHE_TTL_SECONDS = 1800  # 30 minutes
REQUEST_TIMEOUT_SECONDS = 20


def make_cache_key(lat: float, lng: float, start_date_str: str, end_date_str: str) -> str:
    """Build a deterministic cache key with coordinates rounded to 2 decimals."""
    return f'openmeteo:{round(lat, 2):.2f}:{round(lng, 2):.2f}:{start_date_str}:{end_date_str}'


class OpenMeteoProvider(WeatherProvider):
    """
    Fetches hourly weather forecasts from Open-Meteo API.
    Supports location chunking (up to 50 locations per request), 1 automatic retry,
    and 30-minute caching.
    """

    def __init__(self, base_url: str = 'https://api.open-meteo.com/v1/forecast'):
        self.base_url = base_url

    def _fetch_chunk(self, chunk_points: List[Tuple[float, float]], start_date_str: str, end_date_str: str) -> List[dict]:
        """Fetch weather data for a chunk of up to 50 locations with 1 retry."""
        lats = ','.join(f'{pt[0]:.4f}' for pt in chunk_points)
        lngs = ','.join(f'{pt[1]:.4f}' for pt in chunk_points)

        params = {
            'latitude': lats,
            'longitude': lngs,
            'hourly': 'wind_speed_10m,wind_gusts_10m,rain,showers,snowfall',
            'wind_speed_unit': 'mph',
            'precipitation_unit': 'inch',
            'timezone': 'GMT',
            'start_date': start_date_str,
            'end_date': end_date_str,
        }

        last_error = None
        for attempt in range(2):  # initial attempt + 1 retry
            if attempt > 0:
                time.sleep(1.0)
            t0 = time.perf_counter()
            try:
                response = requests.get(
                    self.base_url,
                    params=params,
                    timeout=REQUEST_TIMEOUT_SECONDS,
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
        Points are rounded to 2 decimals for cache lookup and batching.
        """
        if not points:
            return {}

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

        results: Dict[Tuple[float, float], Dict[datetime, Weather]] = {}
        missing_points: List[Tuple[float, float]] = []

        # Check cache first
        for pt in points:
            cache_key = make_cache_key(pt[0], pt[1], start_date_str, end_date_str)
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                results[pt] = cached_data
            else:
                missing_points.append(pt)

        if not missing_points:
            return results

        # Deduplicate missing points while preserving unique locations for requests
        unique_missing: List[Tuple[float, float]] = []
        seen = set()
        for pt in missing_points:
            rounded_pt = (round(pt[0], 2), round(pt[1], 2))
            if rounded_pt not in seen:
                seen.add(rounded_pt)
                unique_missing.append(pt)

        # Process in chunks of up to 50 locations
        t_weather = time.perf_counter()
        chunks = [unique_missing[i:i + CHUNK_SIZE] for i in range(0, len(unique_missing), CHUNK_SIZE)]

        chunk_results: List[Tuple[List[Tuple[float, float]], List[dict]]] = []
        if len(chunks) <= 1:
            for chunk in chunks:
                chunk_data = self._fetch_chunk(chunk, start_date_str, end_date_str)
                chunk_results.append((chunk, chunk_data))
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(chunks))) as executor:
                future_to_chunk = {
                    executor.submit(self._fetch_chunk, chunk, start_date_str, end_date_str): chunk
                    for chunk in chunks
                }
                for future in concurrent.futures.as_completed(future_to_chunk):
                    chunk = future_to_chunk[future]
                    chunk_data = future.result()
                    chunk_results.append((chunk, chunk_data))

        for chunk, chunk_data in chunk_results:
            for pt, loc_data in zip(chunk, chunk_data):
                hourly = loc_data.get('hourly', {})
                times = hourly.get('time', [])
                winds = hourly.get('wind_speed_10m', [])
                gusts = hourly.get('wind_gusts_10m', [])
                rains = hourly.get('rain', [])
                showers = hourly.get('showers', [])
                snows = hourly.get('snowfall', [])

                location_weather: Dict[datetime, Weather] = {}
                for idx, t_str in enumerate(times):
                    dt = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
                    w_mph = float(winds[idx]) if idx < len(winds) and winds[idx] is not None else 0.0
                    g_mph = float(gusts[idx]) if idx < len(gusts) and gusts[idx] is not None else w_mph
                    r_in = float(rains[idx]) if idx < len(rains) and rains[idx] is not None else 0.0
                    s_in = float(showers[idx]) if idx < len(showers) and showers[idx] is not None else 0.0
                    sn_in = float(snows[idx]) if idx < len(snows) and snows[idx] is not None else 0.0

                    # Total rain intensity = rain + showers
                    total_rain = r_in + s_in

                    location_weather[dt] = Weather(
                        wind_mph=w_mph,
                        gust_mph=g_mph,
                        rain_in_hr=total_rain,
                        snow_in_hr=sn_in,
                    )

                cache_key = make_cache_key(pt[0], pt[1], start_date_str, end_date_str)
                cache.set(cache_key, location_weather, timeout=CACHE_TTL_SECONDS)

                # Store for all points matching this location
                for req_pt in points:
                    if round(req_pt[0], 2) == round(pt[0], 2) and round(req_pt[1], 2) == round(pt[1], 2):
                        results[req_pt] = location_weather

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
