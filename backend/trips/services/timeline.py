"""
Route timeline enrichment service: rule-based stop advisory generator and key-stop limiter.
Enriches checkpoints with city names (for 6-10 key stops) and concise driving advisories (max 12 words).
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from trips.services.geocoding import reverse_geocode

logger = logging.getLogger(__name__)


def generate_stop_advisory(weather: Optional[Dict[str, Any]], risk: Optional[Dict[str, Any]]) -> str:
    """
    Generates a concise, rule-based truck driver advisory (strictly max 12 words)
    based on real weather and risk data at a specific route checkpoint.
    """
    risk_level = (risk or {}).get('level', 0)
    w = weather or {}
    wind = float(w.get('wind_mph', 0))
    gust = float(w.get('gust_mph', wind))
    rain = float(w.get('rain_in_hr', 0))
    snow = float(w.get('snow_in_hr', 0))

    if risk_level >= 4:
        return "Dangerous conditions. Stage vehicle safely until severe storm passes."
    elif risk_level == 3:
        if gust >= 45 or wind >= 35:
            return "Severe crosswinds. Reduce speed and maintain firm two-handed grip."
        elif snow >= 0.1:
            return "Heavy snow and icing. Avoid sudden braking, increase following space."
        else:
            return "Severe storm conditions. Slow down and maintain maximum caution."
    elif risk_level == 2:
        if gust >= 30 or wind >= 25:
            return "Gusty crosswinds on bridges. Watch for sudden trailer buffeting."
        elif rain >= 0.15:
            return "Heavy rain and ponding. Maintain 8-second following distance."
        elif snow > 0:
            return "Slick winter pavement. Avoid abrupt lane changes or braking."
        else:
            return "Challenging weather. Reduce speed and monitor conditions closely."
    elif risk_level == 1:
        if wind >= 20:
            return "Breezy conditions. Maintain safe cruising speed and lanes."
        elif rain > 0:
            return "Light rain showers. Wet pavement, exercise routine wet caution."
        else:
            return "Minor weather impact. Steady cruising with normal following distance."
    else:
        return "Clear roads and calm winds. Standard highway cruising speeds permissible."


def select_key_stops(checkpoints: List[Dict[str, Any]], min_stops: int = 6, max_stops: int = 10) -> List[int]:
    """
    Selects 6 to 10 key stop indices along the route for reverse-geocoding place names.
    Always includes origin (0) and destination (-1), prioritizes high-risk checkpoints,
    and evenly distributes remaining slots along the route distance.
    """
    n = len(checkpoints)
    if n <= max_stops:
        return list(range(n))

    selected = {0, n - 1}

    # Add highest risk checkpoints (levels 2, 3, 4)
    high_risk_indices = []
    for idx, cp in enumerate(checkpoints):
        lvl = (cp.get('risk') or {}).get('level', 0)
        if lvl >= 2:
            high_risk_indices.append((lvl, idx))

    # Sort by risk level descending
    high_risk_indices.sort(key=lambda x: x[0], reverse=True)
    for _, idx in high_risk_indices:
        if len(selected) < max_stops - 2:
            selected.add(idx)

    # Evenly fill remaining slots across the route
    target = min(max_stops, max(min_stops, len(selected)))
    step = (n - 1) / (target - 1)
    for i in range(1, target - 1):
        approx_idx = int(round(i * step))
        approx_idx = max(1, min(n - 2, approx_idx))
        selected.add(approx_idx)
        if len(selected) >= max_stops:
            break

    # If still fewer than min_stops and n allows, fill in largest gaps
    result = sorted(selected)
    while len(result) < min(min_stops, n):
        # Find largest gap
        max_gap = -1
        insert_idx = None
        for i in range(len(result) - 1):
            gap = result[i + 1] - result[i]
            if gap > max_gap:
                max_gap = gap
                insert_idx = result[i] + gap // 2
        if insert_idx is not None and insert_idx not in selected:
            selected.add(insert_idx)
            result = sorted(selected)
        else:
            break

    # Trim if over max_stops while preserving endpoints
    if len(result) > max_stops:
        # Keep 0, n-1, and trim middle
        endpoints = {0, n - 1}
        middle = [idx for idx in result if idx not in endpoints]
        result = [0] + middle[:max_stops - 2] + [n - 1]

    return sorted(result)


def enrich_checkpoints_with_stops(
    checkpoints: List[Dict[str, Any]],
    origin_name: Optional[str] = None,
    dest_name: Optional[str] = None,
    place_cache: Optional[Dict[Tuple[float, float], str]] = None,
) -> List[Dict[str, Any]]:
    """
    Enriches checkpoints with city names (for 6-10 key stops) and concise driving advisories.
    Uses optional place_cache to eliminate redundant reverse-geocoding across routes.
    """
    if not checkpoints:
        return []

    local_cache = place_cache if place_cache is not None else {}
    key_stop_indices = set(select_key_stops(checkpoints, min_stops=6, max_stops=10))

    # 1. Initialize advisories and key stop flags
    for idx, cp in enumerate(checkpoints):
        cp['advisory'] = generate_stop_advisory(cp.get('weather'), cp.get('risk'))
        if idx in key_stop_indices:
            cp['is_key_stop'] = True
            if idx == 0 and origin_name:
                cp['name'] = origin_name
            elif idx == len(checkpoints) - 1 and dest_name:
                cp['name'] = dest_name
            else:
                pt_key = (round(cp['lat'], 3), round(cp['lng'], 3))
                if pt_key in local_cache:
                    cp['name'] = local_cache[pt_key]
                else:
                    cp['name'] = None
        else:
            cp['is_key_stop'] = False
            cp['name'] = None

    # 2. Fetch place names for intermediate key stops in parallel
    to_fetch = [idx for idx in key_stop_indices if checkpoints[idx].get('name') is None]
    if to_fetch:
        import concurrent.futures

        def _get_name(idx):
            c = checkpoints[idx]
            pt_key = (round(c['lat'], 3), round(c['lng'], 3))
            if pt_key in local_cache:
                return idx, local_cache[pt_key]
            try:
                res = reverse_geocode(c['lat'], c['lng'])
                label = res.get('label') if res else f"Mile {c.get('mile', 0)}"
                local_cache[pt_key] = label
                return idx, label
            except Exception as exc:
                logger.warning("Reverse geocode failed for checkpoint %d: %s", idx, exc)
                return idx, f"Mile {c.get('mile', 0)}"

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, len(to_fetch))) as executor:
            futures = [executor.submit(_get_name, idx) for idx in to_fetch]
            for f in concurrent.futures.as_completed(futures):
                idx, label = f.result()
                checkpoints[idx]['name'] = label

    return checkpoints
