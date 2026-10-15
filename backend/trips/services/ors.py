"""OpenRouteService client service for route directions."""

import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class ORSError(Exception):
    """Base exception for OpenRouteService errors."""
    pass


class ORSConfigError(ORSError):
    """Raised when ORS credentials or configuration are invalid (401/403)."""
    pass


class ORSRouteNotFoundError(ORSError):
    """Raised when no route is found between points (404)."""
    pass


class ORSRateLimitError(ORSError):
    """Raised when ORS rate limit is exceeded (429)."""
    pass


class ORSUpstreamError(ORSError):
    """Raised when ORS upstream service fails or times out."""
    pass


class ORSValidationError(ORSError):
    """Raised when input parameters are rejected by ORS (400)."""
    pass


class OpenRouteServiceClient:
    """Client for querying the OpenRouteService Directions API."""

    def __init__(self, api_key=None, base_url=None, timeout=10):
        self.api_key = api_key or getattr(settings, 'ORS_API_KEY', '')
        self.base_url = (base_url or getattr(settings, 'ORS_BASE_URL', 'https://api.heigit.org/openrouteservice')).rstrip('/')
        self.timeout = timeout

    def get_route(self, start_lat, start_lng, end_lat, end_lng, profile='driving-hgv'):
        """
        Request driving directions between start and end coordinates.

        Coordinates are passed as (lat, lng), which are converted to ORS GeoJSON format [lng, lat].
        Returns a dictionary containing:
          - geometry: list of [lat, lng]
          - distance_km: float
          - duration_min: float
        """
        if not self.api_key:
            raise ORSConfigError('OpenRouteService API key is missing. Please configure ORS_API_KEY.')

        endpoint = f'{self.base_url}/v2/directions/{profile}/geojson'
        headers = {
            'Authorization': self.api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        payload = {
            'coordinates': [
                [float(start_lng), float(start_lat)],
                [float(end_lng), float(end_lat)],
            ]
        }

        try:
            response = requests.post(
                endpoint,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout as exc:
            logger.error('ORS request timed out after %s seconds', self.timeout)
            raise ORSUpstreamError('OpenRouteService request timed out. Upstream service is unavailable.') from exc
        except requests.exceptions.RequestException as exc:
            logger.error('ORS network connection error: %s', exc)
            raise ORSUpstreamError('Failed to connect to OpenRouteService upstream.') from exc

        status = response.status_code

        if status == 200:
            try:
                data = response.json()
                features = data.get('features', [])
                if not features:
                    raise ORSRouteNotFoundError('No route found between the specified coordinates.')

                feature = features[0]
                summary = feature.get('properties', {}).get('summary', {})
                coords = feature.get('geometry', {}).get('coordinates', [])

                if not coords:
                    raise ORSRouteNotFoundError('Route contains no geometry coordinates.')

                # Convert GeoJSON [lng, lat] back to [lat, lng] for frontend/Leaflet
                lat_lng_geometry = [[c[1], c[0]] for c in coords]
                distance_km = round(summary.get('distance', 0) / 1000.0, 2)
                duration_min = round(summary.get('duration', 0) / 60.0, 2)

                return {
                    'geometry': lat_lng_geometry,
                    'distance_km': distance_km,
                    'duration_min': duration_min,
                }
            except (ValueError, KeyError, IndexError) as exc:
                raise ORSUpstreamError('Failed to parse OpenRouteService response payload.') from exc

        if status in (401, 403):
            raise ORSConfigError('Authentication failed with OpenRouteService. Verify ORS_API_KEY.')
        elif status == 404:
            raise ORSRouteNotFoundError('No route found between the specified coordinates.')
        elif status == 429:
            raise ORSRateLimitError('OpenRouteService rate limit exceeded. Please try again later.')
        elif status == 400:
            try:
                err_detail = response.json().get('error', response.text[:200])
            except Exception:
                err_detail = response.text[:200]
            raise ORSValidationError(f'Invalid coordinates or parameters for routing: {err_detail}')
        elif status >= 500:
            raise ORSUpstreamError(f'OpenRouteService server error (HTTP {status}). Upstream unavailable.')
        else:
            raise ORSUpstreamError(f'Unexpected response from OpenRouteService (HTTP {status}).')
