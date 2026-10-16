"""Route risk summarization, multi-criteria ranking, and plain-English recommendation."""

from typing import List, Dict, Any, Optional, Tuple
from trips.services.risk import RiskLevel


def summarize_route_risk(route: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate risk metrics and level breakdowns for a single route.

    Route dict expected keys:
      - route_id: Any identifier
      - duration_s: float (route travel duration in seconds)
      - checkpoints: list of dicts, each with 'attributed_miles' (float) and 'level' (RiskLevel or int)
    """
    checkpoints = route.get('checkpoints', [])
    duration_s = float(route.get('duration_s', 0.0))

    miles_by_level = {
        RiskLevel.LOW: 0.0,
        RiskLevel.MODERATE: 0.0,
        RiskLevel.HIGH: 0.0,
        RiskLevel.SEVERE: 0.0,
        RiskLevel.NO_TRAVEL: 0.0,
    }

    total_miles = 0.0
    weighted_risk_sum = 0.0
    max_level = RiskLevel.LOW
    worst_cp = None

    for cp in checkpoints:
        attr_miles = float(cp.get('attributed_miles', 0.0))
        level = RiskLevel(cp.get('level', RiskLevel.LOW))

        miles_by_level[level] += attr_miles
        total_miles += attr_miles
        weighted_risk_sum += attr_miles * int(level)

        if level >= max_level:
            max_level = level
            worst_cp = cp

    avg_risk_raw = (weighted_risk_sum / total_miles) if total_miles > 0 else 0.0
    has_no_travel = 1 if max_level >= RiskLevel.NO_TRAVEL else 0

    return {
        'route_id': route.get('route_id'),
        'duration_s': duration_s,
        'total_miles': round(total_miles, 2),
        'miles_by_level': {
            'low': round(miles_by_level[RiskLevel.LOW], 2),
            'moderate': round(miles_by_level[RiskLevel.MODERATE], 2),
            'high': round(miles_by_level[RiskLevel.HIGH], 2),
            'severe': round(miles_by_level[RiskLevel.SEVERE], 2),
            'no_travel': round(miles_by_level[RiskLevel.NO_TRAVEL], 2),
        },
        'max_level': max_level,
        'worst_checkpoint': worst_cp,
        'has_no_travel': has_no_travel,
        # Rounded ranking components
        'rank_no_travel_miles': round(miles_by_level[RiskLevel.NO_TRAVEL], 1),
        'rank_severe_miles': round(miles_by_level[RiskLevel.SEVERE], 1),
        'rank_high_miles': round(miles_by_level[RiskLevel.HIGH], 1),
        'rank_avg_risk': round(avg_risk_raw, 2),
    }


def route_ranking_key(summary: Dict[str, Any]) -> Tuple[int, float, float, float, float, float]:
    """
    Ranking key (smaller is better):
    (has_no_travel, no_travel_miles, severe_miles, high_miles, avg_risk, duration_s)
    """
    return (
        summary['has_no_travel'],
        summary['rank_no_travel_miles'],
        summary['rank_severe_miles'],
        summary['rank_high_miles'],
        summary['rank_avg_risk'],
        float(summary['duration_s']),
    )


def generate_recommendation_explanation(
    recommended: Optional[Dict[str, Any]],
    fastest: Optional[Dict[str, Any]],
    all_no_travel: bool,
) -> str:
    """Generate a clear, human-readable rationale with deltas vs the fastest route."""
    if all_no_travel or not recommended:
        return 'No safe route at this departure time. No route recommended: all available routes exceed safety limits with No Travel conditions.'

    rec_id = recommended['route_id']
    fast_id = fastest['route_id'] if fastest else None

    if rec_id == fast_id:
        sev = recommended['rank_severe_miles']
        avg = recommended['rank_avg_risk']
        return f'Recommended route ({rec_id}) is the fastest option and safest path with {sev} Severe miles and {avg:.2f} average risk.'

    # Compute deltas vs fastest
    rec_sev = recommended['rank_severe_miles']
    fast_sev = fastest['rank_severe_miles']
    rec_high = recommended['rank_high_miles']
    fast_high = fastest['rank_high_miles']
    rec_dur = recommended['duration_s']
    fast_dur = fastest['duration_s']

    delta_min = round((rec_dur - fast_dur) / 60.0)
    time_str = f'+{delta_min} min' if delta_min >= 0 else f'{delta_min} min'

    if fastest['has_no_travel'] and not recommended['has_no_travel']:
        return f'Recommended {rec_id} avoids No Travel zones present on Fastest ({fast_id}), {time_str}.'

    if rec_sev < fast_sev:
        return f'{rec_sev} Severe miles vs {fast_sev} on Fastest ({fast_id}), {time_str}.'
    elif rec_high < fast_high:
        return f'{rec_high} High risk miles vs {fast_high} on Fastest ({fast_id}), {time_str}.'
    else:
        rec_avg = recommended['rank_avg_risk']
        fast_avg = fastest['rank_avg_risk']
        return f'Lower overall average risk ({rec_avg:.2f} vs {fast_avg:.2f} on Fastest), {time_str}.'


def recommend_best_route(routes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluate and rank route options, returning the best route recommendation and explanation.

    Args:
        routes: List of route dicts containing checkpoints and duration_s.

    Returns:
        Dict with keys:
          - recommended_route_id: Optional[Any]
          - recommended_route: Optional[Dict[str, Any]]
          - ranked_routes: List of route summaries ordered best-to-worst
          - fastest_route: Dict of fastest route summary
          - explanation: str
    """
    if not routes:
        return {
            'recommended_route_id': None,
            'recommended_route': None,
            'ranked_routes': [],
            'fastest_route': None,
            'explanation': 'No routes provided for evaluation.',
        }

    summaries = [summarize_route_risk(r) for r in routes]

    # Identify fastest route (by shortest duration_s)
    fastest = min(summaries, key=lambda s: s['duration_s'])

    # Rank routes: smaller ranking key is better
    ranked = sorted(summaries, key=route_ranking_key)

    # If every route has No Travel, recommend none
    all_no_travel = all(s['has_no_travel'] == 1 for s in ranked)

    if all_no_travel:
        recommended = None
        rec_id = None
    else:
        recommended = ranked[0]
        rec_id = recommended['route_id']

    explanation = generate_recommendation_explanation(recommended, fastest, all_no_travel)

    return {
        'recommended_route_id': rec_id,
        'recommended_route': recommended,
        'ranked_routes': ranked,
        'fastest_route': fastest,
        'explanation': explanation,
    }
