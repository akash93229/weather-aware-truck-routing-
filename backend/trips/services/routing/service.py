"""High-level routing service: multi-route generation, deduplication, via-point expansion, and caching."""

import math
import logging
import time
import concurrent.futures
from typing import List, Tuple, Optional, Dict, Any
from django.core.cache import cache

from django.conf import settings
from trips.services.geo import haversine_distance, cumulative_distances, point_at_distance
from trips.services.routing.base import Route, RoutingProvider, RoutingUnavailable, NoRouteFound
from trips.services.routing.here import HERERoutingProvider
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
    fast_mode: bool = False,
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

    if provider is not None:
        active_provider = provider
        raw_name = getattr(provider, 'name', 'custom')
        provider_used = raw_name if isinstance(raw_name, str) else 'mock'
    elif getattr(settings, 'ROUTING_PROVIDER', '').lower() == 'here' and getattr(settings, 'HERE_API_KEY', None):
        active_provider = HERERoutingProvider()
        provider_used = 'here'
    elif getattr(settings, 'TOMTOM_API_KEY', None):
        active_provider = TomTomRoutingProvider()
        provider_used = 'tomtom'
    else:
        active_provider = OSRMRoutingProvider()
        provider_used = 'osrm_fallback'

    # OSRM fallback with truck travel duration 1.15x multiplier
    fallback_provider = OSRMRoutingProvider()

    routes: List[Route] = []

    t_init = time.perf_counter()
    if provider is not None:
        try:
            routes = active_provider.calculate_routes(
                origin=origin,
                destination=destination,
                load_weight_lb=load_weight_lb,
                max_alternatives=2,
            )
        except Exception as exc:
            routes = fallback_provider.calculate_routes(
                origin=origin,
                destination=destination,
                load_weight_lb=load_weight_lb,
                max_alternatives=2,
            )
            provider_used = 'osrm_fallback'
    elif provider_used == 'tomtom':
        # Race TomTom and OSRM concurrently with priority to TomTom if completed under 1.5s
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            future_tomtom = executor.submit(
                active_provider.calculate_routes,
                origin,
                destination,
                load_weight_lb,
                None,
                2,
            )
            future_osrm = executor.submit(
                fallback_provider.calculate_routes,
                origin,
                destination,
                load_weight_lb,
                None,
                2,
            )

            try:
                routes = future_tomtom.result(timeout=1.5)
                provider_used = 'tomtom'
            except (concurrent.futures.TimeoutError, RoutingUnavailable, NoRouteFound, Exception) as exc:
                try:
                    routes = future_osrm.result(timeout=1.8)
                    provider_used = 'osrm_fallback'
                    logger.info('TomTom exceeded 1.5s or failed (%s); used OSRM fallback (took %.3fs)', exc, time.perf_counter() - t_init)
                except NoRouteFound:
                    raise
                except Exception as osrm_exc:
                    if isinstance(exc, concurrent.futures.TimeoutError):
                        try:
                            routes = future_tomtom.result(timeout=1.5)
                            provider_used = 'tomtom'
                        except Exception:
                            raise RoutingUnavailable(f'All routing providers failed. {exc} / {osrm_exc}')
                    elif isinstance(exc, NoRouteFound):
                        raise
                    else:
                        raise RoutingUnavailable(f'All routing providers failed. {exc} / {osrm_exc}')
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
    else:
        try:
            routes = active_provider.calculate_routes(
                origin=origin,
                destination=destination,
                load_weight_lb=load_weight_lb,
                max_alternatives=2,
            )
        except RoutingUnavailable as exc:
            try:
                routes = fallback_provider.calculate_routes(
                    origin=origin,
                    destination=destination,
                    load_weight_lb=load_weight_lb,
                    max_alternatives=2,
                )
                provider_used = 'osrm_fallback'
            except Exception as osrm_exc:
                raise RoutingUnavailable(f'All routing providers failed. {exc} / {osrm_exc}')

    init_duration = time.perf_counter() - t_init
    distinct_routes = filter_distinct_routes(routes)
    logger.info('[TIMING] initial_routing took %.3fs (found %d routes, %d distinct)', init_duration, len(routes), len(distinct_routes))

    # If fewer than 3 distinct routes remain, generate via-points sideways (skip in fast_mode if at least 1 route)
    notes = []
    t_via = time.perf_counter()
    extra_calls = 0
    if not fast_mode and len(distinct_routes) < 3 and distinct_routes:
        main_route = distinct_routes[0]
        cum_dist = cumulative_distances(main_route.points)
        mid_pt = point_at_distance(main_route.points, cum_dist[-1] / 2.0, cum_dist)

        # Offsets to try: +30, -30, +45, -45 miles (capped at 4 extra calls)
        offsets = [30.0, -30.0, 45.0, -45.0]

        def _fetch_via_route(offset_val: float) -> Tuple[float, List[Route]]:
            via_pt = calculate_sideways_offset(mid_pt, origin, destination, offset_val)
            try:
                v_routes = active_provider.calculate_routes(
                    origin=origin,
                    destination=destination,
                    load_weight_lb=load_weight_lb,
                    via_points=[via_pt],
                )
                return offset_val, v_routes
            except Exception:
                try:
                    v_routes = fallback_provider.calculate_routes(
                        origin=origin,
                        destination=destination,
                        load_weight_lb=load_weight_lb,
                        via_points=[via_pt],
                    )
                    return offset_val, v_routes
                except Exception:
                    return offset_val, []

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(offsets)) as executor:
            futures = [executor.submit(_fetch_via_route, off) for off in offsets]
            for future in futures:
                off_val, via_routes = future.result()
                extra_calls += 1
                for vr in via_routes:
                    if not any(are_routes_duplicate(vr, existing) for existing in distinct_routes):
                        distinct_routes.append(vr)
                        if len(distinct_routes) >= 3:
                            break
                if len(distinct_routes) >= 3:
                    break

    via_duration = time.perf_counter() - t_via
    logger.info('[TIMING] via_points_stage took %.3fs (made %d calls, total distinct: %d)', via_duration, extra_calls, len(distinct_routes))

    if len(distinct_routes) < 3:
        notes.append(f'Only {len(distinct_routes)} distinct sensible route(s) found between these locations.')

    # Apply realistic commercial truck speed calibration for live routes
    if provider is None:
        TRUCK_SPEED_CAP_MPH = 60.0
        TRUCK_TARGET_AVG_MPH = 58.5

        for r in distinct_routes:
            if r.distance_mi > 0 and r.duration_s > 0:
                if provider_used == 'tomtom':
                    r.duration_s = round(r.duration_s * 1.15, 1)
                avg_speed = r.distance_mi / (r.duration_s / 3600.0)
                if avg_speed > TRUCK_SPEED_CAP_MPH:
                    r.duration_s = round((r.distance_mi / TRUCK_TARGET_AVG_MPH) * 3600.0, 1)

    # Sort routes deterministically by travel duration, then distance, then ID
    distinct_routes.sort(key=lambda r: (round(r.duration_s, 1), round(r.distance_mi, 2), r.id))

    # Label routes deterministically: Fastest, Alternative 1, Alternative 2
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
