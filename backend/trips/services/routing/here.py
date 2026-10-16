"""HERE Routing API v8 commercial truck routing provider."""

import logging
from typing import List, Tuple, Optional
import requests
from django.conf import settings
import flexpolyline

from trips.services.routing.base import (
    Route,
    RoutingProvider,
    RoutingUnavailable,
    NoRouteFound,
)

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10
METERS_TO_MILES = 1.0 / 1609.344
LB_TO_KG = 0.45359237


class HERERoutingProvider(RoutingProvider):
    """
    HERE Routing API v8 client with commercial truck transport mode,
    flexible polyline decoding, load weight constraints, and alternative route discovery.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = 'https://router.hereapi.com/v8/routes',
    ):
        self.api_key = api_key or getattr(settings, 'HERE_API_KEY', '')
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
        Request up to 3 commercial truck routes from HERE Routing API v8.
        Decodes flexible polylines into (lat, lng) coordinates.
        """
        if not self.api_key:
            raise RoutingUnavailable('HERE_API_KEY is not configured.')

        params = {
            'apiKey': self.api_key,
            'transportMode': 'truck',
            'origin': f'{origin[0]:.5f},{origin[1]:.5f}',
            'destination': f'{destination[0]:.5f},{destination[1]:.5f}',
            'return': 'polyline,summary',
            'alternatives': max_alternatives if not via_points else 0,
        }

        # If lateral via-points are requested, append them
        if via_points:
            for idx, vp in enumerate(via_points):
                params['via'] = f'{vp[0]:.5f},{vp[1]:.5f}'

        # Truck gross weight in kilograms if provided (standard tractor-trailer tare + payload)
        if load_weight_lb and load_weight_lb > 0:
            gross_weight_kg = int(load_weight_lb * LB_TO_KG)
            params['truck[grossWeight]'] = str(gross_weight_kg)

        last_error = None
        for attempt in range(2):
            try:
                response = requests.get(
                    self.base_url,
                    params=params,
                    timeout=TIMEOUT_SECONDS,
                )

                if response.status_code == 200:
                    data = response.json()
                    routes_data = data.get('routes', [])
                    if not routes_data:
                        raise NoRouteFound('HERE Routing API v8 returned no routes for this trip.')

                    parsed_routes: List[Route] = []
                    for idx, r_data in enumerate(routes_data):
                        sections = r_data.get('sections', [])
                        all_points: List[Tuple[float, float]] = []
                        total_dist_meters = 0.0
                        total_duration_seconds = 0.0

                        for section in sections:
                            summary = section.get('summary', {})
                            total_dist_meters += float(summary.get('length', 0))
                            total_duration_seconds += float(summary.get('duration', 0))

                            poly_str = section.get('polyline', '')
                            if poly_str:
                                try:
                                    decoded = flexpolyline.decode(poly_str)
                                    # Flexpolyline returns list of (lat, lng) or (lat, lng, alt)
                                    pts = [(float(pt[0]), float(pt[1])) for pt in decoded]
                                    all_points.extend(pts)
                                except Exception as dec_err:
                                    logger.warning('Failed to decode flexpolyline: %s', dec_err)

                        if not all_points:
                            continue

                        dist_mi = total_dist_meters * METERS_TO_MILES
                        parsed_routes.append(
                            Route(
                                id=f'here_{idx + 1}',
                                label=f'Route {idx + 1}',
                                points=all_points,
                                distance_mi=round(dist_mi, 2),
                                duration_s=round(total_duration_seconds, 1),
                            )
                        )

                    if not parsed_routes:
                        raise NoRouteFound('HERE routes contained no valid coordinates.')

                    return parsed_routes

                elif response.status_code == 404:
                    raise NoRouteFound('No route found between these locations by HERE.')
                elif response.status_code in (401, 403):
                    raise RoutingUnavailable(f'HERE API authentication failed (HTTP {response.status_code}): {response.text[:120]}')
                else:
                    last_error = f'HTTP {response.status_code}: {response.text[:150]}'

            except requests.Timeout:
                last_error = 'HERE API request timed out'
            except requests.RequestException as exc:
                last_error = f'HERE network error: {exc}'

        raise RoutingUnavailable(f'HERE routing service failed: {last_error}')
