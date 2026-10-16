"""TomTom Geocoding service with query caching."""

import logging
import requests
import time
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

    cache_key = f'geocode:{clean_query.lower()}'
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
