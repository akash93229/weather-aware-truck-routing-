"""Geographic utilities for route polylines and distances."""

import math
from typing import List, Tuple, Sequence

# Earth radius in statute miles
EARTH_RADIUS_MILES = 3958.7613


def haversine_distance(
    coord1: Sequence[float],
    coord2: Sequence[float],
) -> float:
    """
    Calculate the great circle distance between two points on the earth in miles.
    Coordinates are passed as [latitude, longitude].
    """
    lat1, lng1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lng2 = math.radians(coord2[0]), math.radians(coord2[1])

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return EARTH_RADIUS_MILES * c


def cumulative_distances(polyline: List[Sequence[float]]) -> List[float]:
    """
    Calculate the cumulative distances in miles along a polyline.
    Returns a list of distances of the same length as polyline, starting with 0.0.
    """
    if not polyline:
        return []
    if len(polyline) == 1:
        return [0.0]

    cum = [0.0]
    total = 0.0
    for i in range(len(polyline) - 1):
        dist = haversine_distance(polyline[i], polyline[i + 1])
        total += dist
        cum.append(total)

    return cum


def point_at_distance(
    polyline: List[Sequence[float]],
    target_miles: float,
    cum_distances: List[float] = None,
) -> Tuple[float, float]:
    """
    Find the [lat, lng] point at a specific distance along a polyline.
    Interpolates linearly between polyline vertices.
    """
    if not polyline:
        raise ValueError('Polyline cannot be empty.')
    if len(polyline) == 1 or target_miles <= 0.0:
        return float(polyline[0][0]), float(polyline[0][1])

    if cum_distances is None:
        cum_distances = cumulative_distances(polyline)

    total_miles = cum_distances[-1]
    if target_miles >= total_miles:
        return float(polyline[-1][0]), float(polyline[-1][1])

    # Find the segment containing target_miles
    for i in range(len(cum_distances) - 1):
        start_dist = cum_distances[i]
        end_dist = cum_distances[i + 1]

        if start_dist <= target_miles <= end_dist:
            segment_length = end_dist - start_dist
            if segment_length == 0.0:
                return float(polyline[i][0]), float(polyline[i][1])

            fraction = (target_miles - start_dist) / segment_length
            lat = polyline[i][0] + fraction * (polyline[i + 1][0] - polyline[i][0])
            lng = polyline[i][1] + fraction * (polyline[i + 1][1] - polyline[i][1])
            return float(lat), float(lng)

    return float(polyline[-1][0]), float(polyline[-1][1])
