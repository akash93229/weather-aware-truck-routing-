"""OSRM keyless routing provider fallback with truck duration scaling."""

import logging
import requests
import time
from typing import List, Tuple, Optional

from trips.services.routing.base import (
    Route,
    RoutingProvider,
    RoutingUnavailable,
    NoRouteFound,
)

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 8
METERS_TO_MILES = 1.0 / 1609.344
TRUCK_DURATION_SCALE = 1.15  # 15% increase from passenger car to commercial truck


class OSRMRoutingProvider(RoutingProvider):
    """
    Keyless fallback routing provider using Open Source Routing Machine (OSRM).
    Scales passenger car travel duration by 1.15x for heavy truck estimation.
    """

    def __init__(self, base_url: str = 'https://router.project-osrm.org/route/v1/driving'):
        self.base_url = base_url.rstrip('/')

    def calculate_routes(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        load_weight_lb: Optional[float] = None,
        via_points: Optional[List[Tuple[float, float]]] = None,
        max_alternatives: int = 2,
    ) -> List[Route]:
        # OSRM expects coordinates in {longitude},{latitude} order
        coord_pairs = [f'{origin[1]:.5f},{origin[0]:.5f}']
        if via_points:
            for vp in via_points:
                coord_pairs.append(f'{vp[1]:.5f},{vp[0]:.5f}')
        coord_pairs.append(f'{destination[1]:.5f},{destination[0]:.5f}')

        coords_str = ';'.join(coord_pairs)
        endpoint = f'{self.base_url}/{coords_str}'

        params = {
            'overview': 'full',
            'geometries': 'geojson',
            'alternatives': 'true' if not via_points else 'false',
            'steps': 'false',
        }

        last_error = None
        for attempt in range(2):
            t0 = time.perf_counter()
            try:
                response = requests.get(
                    endpoint,
                    params=params,
                    timeout=TIMEOUT_SECONDS,
                )
                elapsed = time.perf_counter() - t0
                logger.info(
                    '[TIMING] osrm_call (attempt=%d, via_points=%s) took %.3fs (status=%s)',
                    attempt + 1,
                    bool(via_points),
                    elapsed,
                    response.status_code,
                )
                if response.status_code == 200:
                    data = response.json()
                    routes_data = data.get('routes', [])
                    if not routes_data:
                        raise NoRouteFound('OSRM returned no routes.')

                    parsed_routes: List[Route] = []
                    for idx, r in enumerate(routes_data):
                        dist_mi = float(r.get('distance', 0)) * METERS_TO_MILES
                        raw_duration = float(r.get('duration', 0))
                        truck_duration = raw_duration * TRUCK_DURATION_SCALE

                        # Coordinates in GeoJSON are [lng, lat] -> convert to (lat, lng)
                        geom = r.get('geometry', {}).get('coordinates', [])
                        points = [(float(c[1]), float(c[0])) for c in geom]

                        if not points:
                            continue

                        parsed_routes.append(
                            Route(
                                id=f'osrm_{idx + 1}',
                                label=f'Route {idx + 1}',
                                points=points,
                                distance_mi=round(dist_mi, 2),
                                duration_s=round(truck_duration, 1),
                            )
                        )

                    if not parsed_routes:
                        raise NoRouteFound('OSRM route contains no points.')

                    return parsed_routes

                elif response.status_code in (400, 404):
                    try:
                        err_data = response.json()
                        err_code = err_data.get('code')
                        err_msg = err_data.get('message', '')
                        if err_code in ('NoRoute', 'NoSegment') or 'Impossible route' in err_msg:
                            raise NoRouteFound(f'OSRM: {err_msg or "No route found between points."}')
                    except (ValueError, KeyError):
                        pass
                    if response.status_code == 404:
                        raise NoRouteFound('No route found by OSRM.')
                    last_error = f'HTTP {response.status_code}: {response.text[:150]}'
                else:
                    last_error = f'HTTP {response.status_code}: {response.text[:150]}'

            except (NoRouteFound, RoutingUnavailable):
                raise
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)

        logger.error('OSRM fallback routing failed after retry: %s', last_error)
        raise RoutingUnavailable(f'OSRM routing fallback unavailable: {last_error}')
