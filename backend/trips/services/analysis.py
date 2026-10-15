"""Trip weather risk analysis and multi-route evaluation pipeline."""

from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, Tuple

from trips.services.checkpoints import generate_checkpoints
from trips.services.risk import checkpoint_risk, RiskLevel
from trips.services.recommend import recommend_best_route, summarize_route_risk
from trips.services.weather.base import WeatherProvider, Weather
from trips.services.weather.open_meteo import OpenMeteoProvider

FORECAST_HORIZON_DAYS = 16


def get_nearest_hour_weather(hourly_forecast: Dict[datetime, Weather], eta: datetime) -> Optional[Weather]:
    """Find the weather entry closest to the checkpoint ETA timestamp."""
    if not hourly_forecast:
        return None
    # Pick the timestamp with the minimum absolute time difference
    best_dt = min(hourly_forecast.keys(), key=lambda dt: abs((dt - eta).total_seconds()))
    return hourly_forecast[best_dt]


def analyze_routes(
    routes: List[Dict[str, Any]],
    departure_time: datetime,
    load_lb: float = 0.0,
    weather_provider: Optional[WeatherProvider] = None,
    checkpoint_interval_miles: float = 25.0,
) -> Dict[str, Any]:
    """
    Evaluate weather risk along multiple route options and recommend the safest path.

    Collects checkpoints from ALL routes, issues ONE combined weather request,
    matches hourly forecasts to checkpoint ETAs, and computes comparative rankings.
    """
    if not routes:
        return {
            'recommended_route_id': None,
            'recommended_route': None,
            'ranked_routes': [],
            'warnings': [],
            'explanation': 'No routes provided for analysis.',
        }

    provider = weather_provider or OpenMeteoProvider()

    # Ensure departure_time is UTC
    if departure_time.tzinfo is None:
        departure_time = departure_time.replace(tzinfo=timezone.utc)
    else:
        departure_time = departure_time.astimezone(timezone.utc)

    horizon_cutoff = departure_time + timedelta(days=FORECAST_HORIZON_DAYS)
    warnings: List[str] = []

    # Step 1: Generate checkpoints for each route and collect coordinates for weather query
    all_checkpoints_by_route: Dict[Any, List[Dict[str, Any]]] = {}
    valid_points_set = set()
    valid_etas: List[datetime] = []
    has_beyond_horizon = False

    for route in routes:
        route_id = route['route_id']
        polyline = route['geometry']
        duration_s = float(route['duration_s'])

        checkpoints = generate_checkpoints(
            polyline=polyline,
            total_duration_seconds=duration_s,
            departure_time=departure_time,
            interval_miles=checkpoint_interval_miles,
        )

        for cp in checkpoints:
            eta = cp['eta']
            if eta > horizon_cutoff:
                cp['no_forecast'] = True
                cp['has_forecast'] = False
                has_beyond_horizon = True
            else:
                cp['no_forecast'] = False
                cp['has_forecast'] = True
                # Store (lat, lng) rounded to 4 decimals for weather provider lookup
                pt = (round(cp['coordinate'][0], 4), round(cp['coordinate'][1], 4))
                valid_points_set.add(pt)
                valid_etas.append(eta)

        all_checkpoints_by_route[route_id] = checkpoints

    if has_beyond_horizon:
        warnings.append('One or more checkpoints have ETAs beyond the 16-day forecast horizon and were excluded from risk scoring.')

    # Step 2: Make ONE weather query for all routes combined
    weather_lookup: Dict[Tuple[float, float], Dict[datetime, Weather]] = {}
    if valid_points_set and valid_etas:
        start_utc = min(valid_etas)
        end_utc = max(valid_etas)
        points_list = list(valid_points_set)
        weather_lookup = provider.get_hourly(points_list, start_utc, end_utc)

    # Step 3: Match forecasts to checkpoints and compute risk
    analyzed_routes: List[Dict[str, Any]] = []

    for route in routes:
        route_id = route['route_id']
        checkpoints = all_checkpoints_by_route[route_id]

        active_risk_cps: List[Dict[str, Any]] = []

        for cp in checkpoints:
            if cp.get('no_forecast'):
                cp['weather'] = None
                cp['risk'] = {
                    'level': RiskLevel.LOW,
                    'drivers': [],
                    'load_rule': None,
                }
                cp['level'] = RiskLevel.LOW
            else:
                pt = (round(cp['coordinate'][0], 4), round(cp['coordinate'][1], 4))
                location_forecast = weather_lookup.get(pt, {})
                weather = get_nearest_hour_weather(location_forecast, cp['eta'])

                if weather is not None:
                    cp['weather'] = {
                        'wind_mph': weather.wind_mph,
                        'gust_mph': weather.gust_mph,
                        'rain_in_hr': weather.rain_in_hr,
                        'snow_in_hr': weather.snow_in_hr,
                    }
                    risk_data = checkpoint_risk(
                        {
                            'wind': weather.wind_mph,
                            'rain': weather.rain_in_hr,
                            'snow': weather.snow_in_hr,
                        },
                        load_lb=load_lb,
                    )
                else:
                    cp['weather'] = None
                    risk_data = {
                        'level': RiskLevel.LOW,
                        'drivers': [],
                        'load_rule': None,
                    }

                cp['risk'] = risk_data
                cp['level'] = risk_data['level']
                active_risk_cps.append(cp)

        # Build route object with evaluated checkpoints for ranking
        analyzed_route = {
            'route_id': route_id,
            'duration_s': route['duration_s'],
            'checkpoints': active_risk_cps if active_risk_cps else checkpoints,
            'all_checkpoints': checkpoints,
        }
        analyzed_routes.append(analyzed_route)

    # Step 4: Run ranking and recommendation
    recommendation_result = recommend_best_route(analyzed_routes)

    # Attach all checkpoints and metadata to ranked routes
    detailed_ranked = []
    for ranked_summary in recommendation_result['ranked_routes']:
        r_id = ranked_summary['route_id']
        ranked_summary['checkpoints'] = all_checkpoints_by_route[r_id]
        detailed_ranked.append(ranked_summary)

    return {
        'recommended_route_id': recommendation_result['recommended_route_id'],
        'recommended_route': recommendation_result['recommended_route'],
        'ranked_routes': detailed_ranked,
        'fastest_route': recommendation_result['fastest_route'],
        'explanation': recommendation_result['explanation'],
        'warnings': warnings,
    }
