"""Corridor weather heatmap generator across 0-48 hour forecast horizon."""

import math
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Tuple, Optional

from trips.services.geo import cumulative_distances, point_at_distance
from trips.services.risk import checkpoint_risk
from trips.services.analysis import get_nearest_hour_weather
from trips.services.weather.base import WeatherProvider, Weather
from trips.services.weather.open_meteo import OpenMeteoProvider
from trips.services.weather.fixture import FixtureWeatherProvider


def build_corridor_grid(
    routes: List[Dict[str, Any]],
    interval_miles: float = 25.0,
    offset_miles: float = 18.0,
    grid_deg: float = 0.25,
    max_points: int = 250,
) -> List[Tuple[float, float]]:
    """
    Generate corridor grid points along routes with perpendicular sideways offsets.
    De-duplicates points by rounding to grid_deg (default 0.25 degrees) and caps at max_points.
    """
    raw_points: List[Tuple[float, float]] = []

    for route in routes:
        polyline = route.get('geometry') or []
        if not polyline:
            continue
        cum_dist = cumulative_distances(polyline)
        total_miles = cum_dist[-1] if cum_dist else 0.0
        if total_miles <= 0:
            raw_points.append((float(polyline[0][0]), float(polyline[0][1])))
            continue

        m = 0.0
        while m <= total_miles + 1e-4:
            target_m = min(m, total_miles)
            center = point_at_distance(polyline, target_m, cum_dist)
            raw_points.append(center)

            # Perpendicular sideways offsets (15-20 miles to each side)
            m_prev = max(0.0, target_m - 2.0)
            m_next = min(total_miles, target_m + 2.0)
            p_prev = point_at_distance(polyline, m_prev, cum_dist)
            p_next = point_at_distance(polyline, m_next, cum_dist)

            dlat = p_next[0] - p_prev[0]
            dlng = p_next[1] - p_prev[1]
            length = math.hypot(dlat, dlng)

            if length > 1e-6:
                perp_lat = -dlng / length
                perp_lng = dlat / length

                lat_deg = (offset_miles / 69.0) * perp_lat
                cos_lat = max(0.1, math.cos(math.radians(center[0])))
                lng_deg = (offset_miles / (69.0 * cos_lat)) * perp_lng

                raw_points.append((center[0] + lat_deg, center[1] + lng_deg))
                raw_points.append((center[0] - lat_deg, center[1] - lng_deg))

            if m >= total_miles:
                break
            m += interval_miles

    # De-duplicate by snapping to grid_deg
    seen = set()
    grid_points: List[Tuple[float, float]] = []
    for pt in raw_points:
        r_lat = round(round(pt[0] / grid_deg) * grid_deg, 4)
        r_lng = round(round(pt[1] / grid_deg) * grid_deg, 4)
        key = (r_lat, r_lng)
        if key not in seen:
            seen.add(key)
            grid_points.append(key)
            if len(grid_points) >= max_points:
                break

    return grid_points


def generate_heatmap(
    routes: List[Dict[str, Any]],
    departure_time: datetime,
    load_weight_lb: float = 0.0,
    weather_provider: Optional[WeatherProvider] = None,
    scenario: str = 'live',
    grid_interval_miles: float = 25.0,
    grid_offset_miles: float = 18.0,
    grid_deg: float = 0.25,
    max_points: int = 250,
) -> Dict[str, Any]:
    """
    Generate weather risk heatmap across the 0-48 hour forecast horizon for a corridor.

    Args:
        routes: List of route dicts, each with 'geometry' polyline [ [lat, lng], ... ].
        departure_time: Trip departure datetime.
        load_weight_lb: Truck load weight in pounds.
        weather_provider: Optional weather provider override (for tests/injection).
        scenario: Weather scenario ('live', 'calm', 'storm').
        grid_interval_miles: Spacing along routes (miles).
        grid_offset_miles: Perpendicular sideways offset distance (miles).
        grid_deg: Grid deduplication resolution (degrees).
        max_points: Hard cap on number of grid points.

    Returns:
        Dict:
          start_time: UTC ISO string (hour 0)
          hours: 49
          points: [
            {
              lat: float,
              lng: float,
              levels: [49 ints, 0-4]
            },
            ...
          ]
    """
    # Ensure departure_time is UTC and floored to top of the hour
    if departure_time.tzinfo is None:
        departure_time = departure_time.replace(tzinfo=timezone.utc)
    else:
        departure_time = departure_time.astimezone(timezone.utc)

    start_utc = departure_time.replace(minute=0, second=0, microsecond=0)
    end_utc = start_utc + timedelta(hours=48)

    # Determine weather provider
    if weather_provider is not None:
        active_provider = weather_provider
    elif scenario == 'calm':
        active_provider = FixtureWeatherProvider.calm()
    elif scenario == 'storm':
        # Default fixture storm: 2 hours after departure
        storm_time = start_utc + timedelta(hours=2)
        active_provider = FixtureWeatherProvider.storm_at_hour(
            target_hour_utc=storm_time,
            storm_weather=Weather(wind_mph=52.0, gust_mph=70.0, rain_in_hr=0.75, snow_in_hr=0.0),
        )
    else:
        active_provider = OpenMeteoProvider()

    # Step 1: Generate corridor grid
    grid_points = build_corridor_grid(
        routes=routes,
        interval_miles=grid_interval_miles,
        offset_miles=grid_offset_miles,
        grid_deg=grid_deg,
        max_points=max_points,
    )

    if not grid_points:
        return {
            'start_time': start_utc.isoformat(),
            'hours': 49,
            'points': [],
        }

    # Step 2: One batched weather query for all grid points across 49 hours
    weather_data = active_provider.get_hourly(grid_points, start_utc, end_utc)

    # Step 3: Compute risk levels for each point across each of the 49 hours
    result_points: List[Dict[str, Any]] = []

    for pt in grid_points:
        hourly_map = weather_data.get(pt, {})
        levels: List[int] = []

        for h in range(49):
            target_dt = start_utc + timedelta(hours=h)
            w = get_nearest_hour_weather(hourly_map, target_dt)

            if w is None:
                levels.append(0)
            else:
                risk_res = checkpoint_risk(
                    weather={
                        'wind_speed_mph': w.wind_mph,
                        'rain_in_hr': w.rain_in_hr,
                        'snow_in_hr': w.snow_in_hr,
                    },
                    load_lb=load_weight_lb,
                )
                levels.append(int(risk_res['level']))

        result_points.append({
            'lat': pt[0],
            'lng': pt[1],
            'levels': levels,
        })

    return {
        'start_time': start_utc.isoformat(),
        'hours': 49,
        'points': result_points,
    }
