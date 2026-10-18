"""TomTom routing client with truck travel mode, weight support, retries, and error mapping."""

import logging
import requests
import time
from typing import List, Tuple, Optional
from django.conf import settings

from trips.services.routing.base import (
    Route,
    RoutingProvider,
    RoutingUnavailable,
    NoRouteFound,
)

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 2.0
METERS_TO_MILES = 1.0 / 1609.344


class TomTomRoutingProvider(RoutingProvider):
    """Routing provider using TomTom Routing API v1."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = 'https://api.tomtom.com/routing/1/calculateRoute',
    ):
        self.api_key = api_key or getattr(settings, 'TOMTOM_API_KEY', '')
        self.base_url = base_url.rstrip('/')

    def calculate_routes(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        load_weight_lb: Optional[float] = None,
        via_points: Optional[List[Tuple[float, float]]] = None,
        max_alternatives: int = 2,
    ) -> List[Route]:
        """
        Request routes from TomTom Routing API v1 for truck travel mode.
        """
        if not self.api_key:
            raise RoutingUnavailable('TOMTOM_API_KEY is not configured.')

        loc_parts = [f'{origin[0]:.5f},{origin[1]:.5f}']
        if via_points:
            for vp in via_points:
                loc_parts.append(f'{vp[0]:.5f},{vp[1]:.5f}')
        loc_parts.append(f'{destination[0]:.5f},{destination[1]:.5f}')

        locations_str = ':'.join(loc_parts)
        endpoint = f'{self.base_url}/{locations_str}/json'

        params = {
            'key': self.api_key,
            'travelMode': 'truck',
            'maxAlternatives': 0 if via_points else max_alternatives,
            'routeRepresentation': 'polyline',
            'computeTravelTimeFor': 'all',
            'vehicleCommercial': 'true',
        }

        if load_weight_lb and load_weight_lb > 0:
            weight_kg = int(round(float(load_weight_lb) * 0.45359237))
            params['vehicleWeight'] = weight_kg

        last_error = None
        for attempt in range(2):  # initial attempt + 1 retry
            t0 = time.perf_counter()
            try:
                response = requests.get(
                    endpoint,
                    params=params,
                    timeout=TIMEOUT_SECONDS,
                )
                elapsed = time.perf_counter() - t0
                logger.info(
                    '[TIMING] tomtom_call (attempt=%d, via_points=%s) took %.3fs (status=%s)',
                    attempt + 1,
                    bool(via_points),
                    elapsed,
                    response.status_code,
                )
                if response.status_code == 200:
                    data = response.json()
                    routes_data = data.get('routes', [])
                    if not routes_data:
                        raise NoRouteFound('TomTom returned 0 routes.')

                    parsed_routes: List[Route] = []
                    for idx, r in enumerate(routes_data):
                        summary = r.get('summary', {})
                        dist_mi = summary.get('lengthInMeters', 0) * METERS_TO_MILES
                        duration_s = float(summary.get('travelTimeInSeconds', 0))

                        points: List[Tuple[float, float]] = []
                        for leg in r.get('legs', []):
                            for pt in leg.get('points', []):
                                points.append((float(pt['latitude']), float(pt['longitude'])))

                        if not points:
                            continue

                        parsed_routes.append(
                            Route(
                                id=f'route_{idx + 1}',
                                label=f'Route {idx + 1}',
                                points=points,
                                distance_mi=round(dist_mi, 2),
                                duration_s=round(duration_s, 1),
                            )
                        )

                    if not parsed_routes:
                        raise NoRouteFound('TomTom routes contain no polyline points.')

                    return parsed_routes

                elif response.status_code == 404:
                    raise NoRouteFound('No truck route found between specified locations.')
                elif response.status_code == 400:
                    try:
                        err_json = response.json()
                        err_msg = err_json.get('detailedError', {}).get('message', response.text[:150])
                    except Exception:
                        err_msg = response.text[:150]
                    raise NoRouteFound(f'Route calculation rejected by TomTom: {err_msg}')
                elif response.status_code in (401, 403):
                    raise RoutingUnavailable(f'TomTom authentication failed (HTTP {response.status_code}).')
                elif response.status_code == 429:
                    raise RoutingUnavailable('TomTom rate limit reached (HTTP 429).')
                else:
                    last_error = f'HTTP {response.status_code}: {response.text[:150]}'

            except (NoRouteFound, RoutingUnavailable):
                raise
            except requests.exceptions.Timeout as exc:
                last_error = str(exc)
                logger.warning('TomTom routing timed out (attempt %d): %s', attempt + 1, exc)
                break  # Fail fast to OSRM fallback
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)

        logger.error('TomTom routing failed after 1 retry: %s', last_error)
        raise RoutingUnavailable(f'TomTom routing service unavailable: {last_error}')
