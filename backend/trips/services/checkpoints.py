"""Checkpoint sampling and ETA calculation along route polylines."""

from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Sequence

from trips.services.geo import (
    cumulative_distances,
    point_at_distance,
)


def generate_checkpoints(
    polyline: List[Sequence[float]],
    total_duration_seconds: float,
    departure_time: datetime,
    interval_miles: float = 25.0,
) -> List[Dict[str, Any]]:
    """
    Generate checkpoints along a polyline at mile 0, every interval_miles, and destination.

    Args:
        polyline: List of [lat, lng] coordinates.
        total_duration_seconds: Total route duration in seconds.
        departure_time: Trip departure timestamp (datetime, converted to UTC).
        interval_miles: Distance interval for checkpoints (typically 10, 25, or 50).

    Returns:
        List of checkpoint dicts, each with:
          - index: int
          - coordinate: [lat, lng]
          - mile_mark: float (distance from route start)
          - attributed_miles: float (length of corridor owned by this checkpoint)
          - eta: datetime (UTC)
          - eta_iso: str
    """
    if not polyline:
        return []

    # Ensure departure_time is UTC-aware
    if departure_time.tzinfo is None:
        departure_time = departure_time.replace(tzinfo=timezone.utc)
    else:
        departure_time = departure_time.astimezone(timezone.utc)

    cum_distances = cumulative_distances(polyline)
    total_miles = cum_distances[-1] if cum_distances else 0.0

    if total_miles <= 1e-6 or len(polyline) == 1:
        return [
            {
                'index': 0,
                'coordinate': [float(polyline[0][0]), float(polyline[0][1])],
                'mile_mark': 0.0,
                'attributed_miles': total_miles,
                'eta': departure_time,
                'eta_iso': departure_time.isoformat(),
            }
        ]

    # Generate mile marks: 0, interval, 2*interval, ..., total_miles
    interval = float(interval_miles)
    mile_marks = [0.0]
    current = interval
    while current < total_miles - 1e-4:
        mile_marks.append(current)
        current += interval

    # Always include destination point
    if abs(mile_marks[-1] - total_miles) > 1e-4:
        mile_marks.append(total_miles)

    num_checkpoints = len(mile_marks)

    # Compute attributed miles for each checkpoint (Voronoi 1D ownership halfway to neighbors)
    attributed_miles_list: List[float] = []
    if num_checkpoints == 1:
        attributed_miles_list = [total_miles]
    elif num_checkpoints == 2:
        midpoint = total_miles / 2.0
        attributed_miles_list = [midpoint, total_miles - midpoint]
    else:
        for i in range(num_checkpoints):
            if i == 0:
                # First checkpoint starts at 0, goes halfway to next
                attr = (mile_marks[0] + mile_marks[1]) / 2.0
            elif i == num_checkpoints - 1:
                # Last checkpoint starts halfway from previous, goes to route end
                prev_mid = (mile_marks[i - 1] + mile_marks[i]) / 2.0
                attr = total_miles - prev_mid
            else:
                # Intermediate checkpoint: halfway to prev to halfway to next
                prev_mid = (mile_marks[i - 1] + mile_marks[i]) / 2.0
                next_mid = (mile_marks[i] + mile_marks[i + 1]) / 2.0
                attr = next_mid - prev_mid
            attributed_miles_list.append(attr)

    # Construct checkpoint data
    checkpoints: List[Dict[str, Any]] = []
    for i, mark in enumerate(mile_marks):
        coord = point_at_distance(polyline, mark, cum_distances)

        fraction = (mark / total_miles) if total_miles > 0 else 0.0
        elapsed_sec = total_duration_seconds * fraction
        eta = departure_time + timedelta(seconds=elapsed_sec)

        checkpoints.append({
            'index': i,
            'coordinate': [coord[0], coord[1]],
            'mile_mark': mark,
            'attributed_miles': attributed_miles_list[i],
            'eta': eta,
            'eta_iso': eta.isoformat(),
        })

    return checkpoints
