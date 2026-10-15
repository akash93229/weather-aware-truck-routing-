"""High-level routing service: multi-route generation, deduplication, via-point expansion, and caching."""

import math
import logging
from typing import List, Tuple, Optional, Dict, Any
from django.core.cache import cache

from trips.services.geo import haversine_distance, cumulative_distances, point_at_distance
from trips.services.routing.base import Route, RoutingProvider, RoutingUnavailable, NoRouteFound
from trips.services.routing.tomtom import TomTomRoutingProvider
from trips.services.routing.osrm import OSRMRoutingProvider

logger = logging.getLogger(__name__)

CACHE_TTL_ROUTING = 900  # 15 minutes


def are_routes_duplicate(r1: Route, r2: Route, threshold_miles: float = 1.0) -> bool:
    """
    Check if two routes are practically identical.
    Routes are duplicate if all sampled points of r1 lie within threshold_miles of r2.
    """
    if not r1.points or not r2.points:
        return False

    # Quick check on length difference
    if abs(r1.distance_mi - r2.distance_mi) > 3.0:
        return False

    # Sample up to 25 points along r1
    step = max(1, len(r1.points) // 25)
    sampled_r1 = r1.points[::step]

    # For each sample in r1, check if closest point in r2 is within threshold
    for p1 in sampled_r1:
        min_dist = min(haversine_distance(p1, p2) for p2 in r2.points[::step])
        if min_dist > threshold_miles:
            return False

    return True


def filter_distinct_routes(routes: List[Route], threshold_miles: float = 1.0) -> List[Route]:
    """Filter out duplicate routes preserving order."""
    distinct: List[Route] = []
    for r in routes:
        is_dup = False
        for d in distinct:
            if are_routes_duplicate(r, d, threshold_miles=threshold_miles):
                is_dup = True
                break
        if not is_dup:
            distinct.append(r)
    return distinct


def calculate_sideways_offset(
    midpoint: Tuple[float, float],
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    offset_miles: float,
) -> Tuple[float, float]:
    """Calculate a point offset sideways (perpendicular to trip corridor) by offset_miles."""
    dlat = destination[0] - origin[0]
    dlng = destination[1] - origin[1]
    length = math.sqrt(dlat * dlat + dlng * dlng)

    if length < 1e-6:
        return midpoint[0] + (offset_miles / 69.0), midpoint[1]

    # Unit vector perpendicular to corridor
    perp_lat = -dlng / length
    perp_lng = dlat / length

    # 1 degree of latitude is ~69 miles
    lat_deg = (offset_miles / 69.0) * perp_lat
    # 1 degree of longitude is ~69 * cos(lat) miles
    cos_lat = math.cos(math.radians(midpoint[0]))
    if abs(cos_lat) < 0.1:
        cos_lat = 0.1
    lng_deg = (offset_miles / (69.0 * cos_lat)) * perp_lng

    return midpoint[0] + lat_deg, midpoint[1] + lng_deg


def get_routes(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    provider: Optional[RoutingProvider] = None,
    load_weight_lb: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Retrieve up to 3 distinct truck routes between origin and destination.
    Uses TomTom (with OSRM fallback), deduplicates, and expands via lateral waypoints if needed.
    """
    cache_key = (
        f'routes:{round(origin[0], 3):.3f}:{round(origin[1], 3):.3f}:'
        f'{round(destination[0], 3):.3f}:{round(destination[1], 3):.3f}:'
        f'{int(load_weight_lb or 0)}'
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    active_provider = provider or TomTomRoutingProvider()
    fallback_provider = OSRMRoutingProvider()

    routes: List[Route] = []
    provider_used = 'tomtom'

    try:
        routes = active_provider.calculate_routes(
            origin=origin,
            destination=destination,
            load_weight_lb=load_weight_lb,
            max_alternatives=2,
        )
    except RoutingUnavailable as exc:
        logger.warning('Primary routing provider unavailable (%s). Falling back to OSRM.', exc)
        try:
            routes = fallback_provider.calculate_routes(
                origin=origin,
                destination=destination,
                load_weight_lb=load_weight_lb,
                max_alternatives=2,
            )
            provider_used = 'osrm_fallback'
        except Exception as osrm_exc:
            raise RoutingUnavailable(f'All routing providers failed. {exc} / {osrm_exc}') from osrm_exc

    distinct_routes = filter_distinct_routes(routes)

    # If fewer than 3 distinct routes remain, generate via-points sideways
    notes = []
    if len(distinct_routes) < 3 and distinct_routes:
        main_route = distinct_routes[0]
        cum_dist = cumulative_distances(main_route.points)
        mid_pt = point_at_distance(main_route.points, cum_dist[-1] / 2.0, cum_dist)

        # Offsets to try: +30, -30, +45, -45 miles (capped at 4 extra calls)
        offsets = [30.0, -30.0, 45.0, -45.0]
        extra_calls = 0

        for offset in offsets:
            if len(distinct_routes) >= 3 or extra_calls >= 4:
                break
            extra_calls += 1
            via = calculate_sideways_offset(mid_pt, origin, destination, offset)

            try:
                via_routes = active_provider.calculate_routes(
                    origin=origin,
                    destination=destination,
                    load_weight_lb=load_weight_lb,
                    via_points=[via],
                )
            except Exception:
                try:
                    via_routes = fallback_provider.calculate_routes(
                        origin=origin,
                        destination=destination,
                        load_weight_lb=load_weight_lb,
                        via_points=[via],
                    )
                except Exception:
                    continue

            for vr in via_routes:
                if not any(are_routes_duplicate(vr, existing) for existing in distinct_routes):
                    distinct_routes.append(vr)
                    if len(distinct_routes) >= 3:
                        break

    if len(distinct_routes) < 3:
        notes.append(f'Only {len(distinct_routes)} distinct sensible route(s) found between these locations.')

    # Sort routes by travel duration
    distinct_routes.sort(key=lambda r: r.duration_s)

    # Label routes
    labels = ['Fastest', 'Alternative 1', 'Alternative 2']
    final_routes: List[Route] = []
    for idx, r in enumerate(distinct_routes[:3]):
        label = labels[idx] if idx < len(labels) else f'Alternative {idx}'
        r.label = label
        r.id = f'route_{idx + 1}'
        final_routes.append(r)

    result = {
        'routes': final_routes,
        'provider_used': provider_used,
        'notes': notes,
    }

    cache.set(cache_key, result, timeout=CACHE_TTL_ROUTING)
    return result
