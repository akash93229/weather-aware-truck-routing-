"""TomTom Geocoding service with query caching."""

import logging
import requests
import time
import threading
from urllib.parse import quote
from typing import List, Dict, Any, Optional
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

GEOCODE_CACHE_TTL = 86400  # 24 hours
TIMEOUT_SECONDS = 8


def geocode_address(query: str, api_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Geocode an address or city query using TomTom Search API v2.
    Returns list of dicts: [{'label': str, 'lat': float, 'lng': float}].
    Minimum query length is 3 characters. Results cached for 24 hours.
    """
    clean_query = query.strip()
    if len(clean_query) < 3:
        return []

    import hashlib
    query_hash = hashlib.md5(clean_query.lower().encode('utf-8')).hexdigest()
    cache_key = f'geocode:{query_hash}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    key = api_key or getattr(settings, 'TOMTOM_API_KEY', '')
    if not key:
        logger.warning('TOMTOM_API_KEY is not configured for geocoding.')
        return []

    url = f'https://api.tomtom.com/search/2/geocode/{quote(clean_query)}.json'
    params = {'key': key, 'limit': 5}

    t0 = time.perf_counter()
    try:
        response = requests.get(url, params=params, timeout=TIMEOUT_SECONDS)
        elapsed = time.perf_counter() - t0
        logger.info("[TIMING] geocode query='%s' took %.3fs (status=%s)", clean_query[:20], elapsed, response.status_code)
        if response.status_code == 200:
            data = response.json()
            results: List[Dict[str, Any]] = []
            for item in data.get('results', []):
                pos = item.get('position', {})
                address_info = item.get('address', {})
                label = address_info.get('freeformAddress') or clean_query
                lat = pos.get('lat')
                lon = pos.get('lon')
                if lat is not None and lon is not None:
                    results.append({
                        'label': label,
                        'display_name': label,
                        'lat': float(lat),
                        'lng': float(lon),
                    })

            cache.set(cache_key, results, timeout=GEOCODE_CACHE_TTL)
            return results
        else:
            logger.warning('TomTom geocoding returned HTTP %s: %s', response.status_code, response.text[:100])
            return []
    except requests.exceptions.RequestException as exc:
        logger.error('TomTom geocoding network error: %s', exc)
        return []


# Rate Limiter: Max 4 QPS -> 0.25s minimum interval between TomTom requests
_rate_limit_lock = threading.Lock()
_last_request_timestamp = 0.0
_MIN_INTERVAL_SECONDS = 0.25

# In-flight de-duplication
_inflight_lock = threading.Lock()
_inflight_events: Dict[str, threading.Event] = {}
_inflight_results: Dict[str, Optional[Dict[str, Any]]] = {}


def _wait_for_rate_limit():
    global _last_request_timestamp
    with _rate_limit_lock:
        now = time.perf_counter()
        elapsed = now - _last_request_timestamp
        if elapsed < _MIN_INTERVAL_SECONDS:
            time.sleep(_MIN_INTERVAL_SECONDS - elapsed)
        _last_request_timestamp = time.perf_counter()


def reverse_geocode(lat: float, lon: float, api_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Reverse geocode latitude and longitude into a readable location label using TomTom Reverse Geocode API.
    Features in-flight de-duplication and a 4 QPS rate limiter.
    Never caches empty results, 429s, or network failures.
    Results cached for 10 minutes (600 seconds) ONLY on valid successful 200 OK responses with address data.
    """
    coord_key = f"{round(lat, 3):.3f}:{round(lon, 3):.3f}"
    cache_key = f"revgeo:{coord_key}"

    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # In-flight de-duplication: if another thread is already querying this coordinate, wait for its result
    is_first_caller = False
    with _inflight_lock:
        if coord_key in _inflight_events:
            evt = _inflight_events[coord_key]
        else:
            evt = threading.Event()
            _inflight_events[coord_key] = evt
            is_first_caller = True

    if not is_first_caller:
        evt.wait(timeout=TIMEOUT_SECONDS + 2)
        with _inflight_lock:
            res = _inflight_results.get(coord_key)
        if res is not None:
            return res
        return {'label': f'{lat:.4f}, {lon:.4f}', 'lat': float(lat), 'lng': float(lon)}

    # First caller performs the rate-limited request
    result = None
    try:
        _wait_for_rate_limit()
        key = api_key or getattr(settings, 'TOMTOM_API_KEY', '')
        if not key:
            logger.warning('TOMTOM_API_KEY is not configured for reverse geocoding.')
            return {'label': f'{lat:.4f}, {lon:.4f}', 'lat': float(lat), 'lng': float(lon)}

        url = f'https://api.tomtom.com/search/2/reverseGeocode/{lat:.6f},{lon:.6f}.json'
        params = {'key': key}

        t0 = time.perf_counter()
        response = requests.get(url, params=params, timeout=TIMEOUT_SECONDS)
        elapsed = time.perf_counter() - t0
        logger.info("[TIMING] reverse_geocode (%f, %f) took %.3fs (status=%s)", lat, lon, elapsed, response.status_code)

        if response.status_code == 200:
            data = response.json()
            addresses = data.get('addresses', [])
            if addresses:
                addr_info = addresses[0].get('address', {})
                label = addr_info.get('freeformAddress')
                if not label:
                    municipality = addr_info.get('municipality', '')
                    country = addr_info.get('country', '')
                    label = f"{municipality}, {country}".strip(', ')
                if label:
                    result = {'label': label, 'lat': float(lat), 'lng': float(lon)}
                    # Only cache valid successful non-empty results
                    cache.set(cache_key, result, timeout=600)
        elif response.status_code == 429:
            logger.warning('TomTom reverse geocoding rate limited (429) - NOT caching.')
        else:
            logger.warning('TomTom reverse geocoding returned HTTP %s - NOT caching.', response.status_code)

    except requests.exceptions.RequestException as exc:
        logger.error('TomTom reverse geocoding network error: %s - NOT caching.', exc)
    finally:
        fallback_res = result or {'label': f'{lat:.4f}, {lon:.4f}', 'lat': float(lat), 'lng': float(lon)}
        with _inflight_lock:
            _inflight_results[coord_key] = fallback_res
            evt.set()
            _inflight_events.pop(coord_key, None)
            _inflight_results.pop(coord_key, None)

    return fallback_res
