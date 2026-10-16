"""API views for health, legacy route, geocoding, and trip risk analysis."""

import math
from datetime import timedelta
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from trips.api.serializers import RouteRequestSerializer, TripAnalyzeSerializer
from trips.services.risk import (
    RiskLevel,
)
from trips.services.ors import (
    OpenRouteServiceClient,
    ORSConfigError,
    ORSRouteNotFoundError,
    ORSRateLimitError,
    ORSUpstreamError,
    ORSValidationError,
    ORSError,
)
from trips.services.routing.service import get_routes
from trips.services.routing.base import RoutingUnavailable, NoRouteFound
from trips.services.geocoding import geocode_address
from trips.services.analysis import analyze_routes
from trips.services.heatmap import generate_heatmap
from trips.services.weather.open_meteo import OpenMeteoProvider
from trips.services.weather.fixture import FixtureWeatherProvider
from trips.services.weather.base import Weather, WeatherUnavailable


def simplify_geometry(points: list, max_points: int = 1000) -> list:
    """Simplify polyline to ~1000 points and convert to GeoJSON [lng, lat] order."""
    if not points:
        return []
    step = max(1, math.ceil(len(points) / max_points))
    sampled = points[::step]
    if points[-1] != sampled[-1]:
        sampled.append(points[-1])
    return [[round(float(p[1]), 5), round(float(p[0]), 5)] for p in sampled]


@api_view(['GET'])
def health_check(request):
    """Health check endpoint returning system status."""
    return Response({
        'status': 'ok',
        'service': 'weather-aware-truck-routing-api',
    })


@api_view(['GET'])
def geocode_view(request):
    """
    GET /api/geocode?q=...
    Geocode search query using TomTom, cached for 24 hours.
    """
    query = request.query_params.get('q', '').strip()
    if len(query) < 3:
        return Response([])

    results = geocode_address(query)
    return Response(results)


@api_view(['POST'])
def generate_route(request):
    """
    POST /api/route/
    Legacy endpoint: calculates single truck route (driving-hgv) via ORS.
    """
    serializer = RouteRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {
                'error': 'Invalid request parameters.',
                'details': serializer.errors,
                'code': 'invalid_input',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    validated = serializer.validated_data
    ors_client = OpenRouteServiceClient()

    try:
        route_data = ors_client.get_route(
            start_lat=validated['start_lat'],
            start_lng=validated['start_lng'],
            end_lat=validated['end_lat'],
            end_lng=validated['end_lng'],
        )
        return Response(route_data, status=status.HTTP_200_OK)

    except ORSValidationError as exc:
        return Response(
            {'error': str(exc), 'code': 'invalid_coordinates'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except ORSRouteNotFoundError as exc:
        return Response(
            {'error': str(exc), 'code': 'route_not_found'},
            status=status.HTTP_404_NOT_FOUND,
        )
    except ORSRateLimitError as exc:
        return Response(
            {'error': str(exc), 'code': 'rate_limit_exceeded'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    except ORSConfigError as exc:
        return Response(
            {'error': str(exc), 'code': 'service_misconfigured'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except ORSUpstreamError as exc:
        return Response(
            {'error': str(exc), 'code': 'upstream_unavailable'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except ORSError as exc:
        return Response(
            {'error': str(exc), 'code': 'routing_error'},
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(['POST'])
def analyze_trip_view(request, routing_provider=None, weather_provider=None):
    """
    POST /api/trips/analyze
    Analyzes up to 3 distinct truck routes with time-aware weather risk scoring.
    """
    serializer = TripAnalyzeSerializer(data=request.data)
    if not serializer.is_valid():
        first_field = next(iter(serializer.errors))
        first_err = serializer.errors[first_field]
        if isinstance(first_err, list) and first_err:
            msg = f'{first_field}: {first_err[0]}'
        else:
            msg = f'{first_field}: {first_err}'

        return Response(
            {
                'error': {
                    'code': 'validation_error',
                    'message': msg,
                    'details': serializer.errors,
                }
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    orig = data['origin']
    dest = data['destination']
    dep_time = data['departure_time']
    load_lb = data['load_weight_lb']
    interval_mi = data['interval_miles']
    scenario = data.get('scenario', 'live')

    # Step 1: Calculate distinct routes
    try:
        routes_result = get_routes(
            origin=(orig['lat'], orig['lng']),
            destination=(dest['lat'], dest['lng']),
            provider=routing_provider,
            load_weight_lb=load_lb,
        )
    except NoRouteFound as exc:
        return Response(
            {'error': {'code': 'no_route_found', 'message': str(exc)}},
            status=status.HTTP_404_NOT_FOUND,
        )
    except RoutingUnavailable as exc:
        return Response(
            {'error': {'code': 'routing_unavailable', 'message': str(exc)}},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as exc:
        return Response(
            {'error': {'code': 'routing_error', 'message': f'Routing error: {exc}'}},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    computed_routes = routes_result.get('routes', [])
    if not computed_routes:
        return Response(
            {'error': {'code': 'no_route_found', 'message': 'No routes found for the given locations.'}},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Step 2: Determine weather provider (live vs demo scenario)
    if weather_provider is not None:
        active_weather_provider = weather_provider
    elif scenario == 'calm':
        active_weather_provider = FixtureWeatherProvider.calm()
    elif scenario == 'storm':
        # Storm centered 2 hours after departure
        storm_time = dep_time + timedelta(hours=2)
        active_weather_provider = FixtureWeatherProvider.storm_at_hour(
            target_hour_utc=storm_time,
            storm_weather=Weather(wind_mph=52.0, gust_mph=70.0, rain_in_hr=0.75, snow_in_hr=0.0),
        )
    else:
        active_weather_provider = OpenMeteoProvider()

    # Step 3: Run pipeline analysis
    route_input_dicts = [
        {
            'route_id': r.id,
            'label': r.label,
            'geometry': r.points,
            'duration_s': r.duration_s,
            'distance_mi': r.distance_mi,
        }
        for r in computed_routes
    ]

    try:
        analysis_result = analyze_routes(
            routes=route_input_dicts,
            departure_time=dep_time,
            load_lb=load_lb,
            weather_provider=active_weather_provider,
            checkpoint_interval_miles=interval_mi,
        )
    except WeatherUnavailable as exc:
        return Response(
            {'error': {'code': 'weather_unavailable', 'message': str(exc)}},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as exc:
        return Response(
            {'error': {'code': 'analysis_error', 'message': f'Analysis error: {exc}'}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Step 4: Format standardized output response
    recommended_id = analysis_result.get('recommended_route_id')
    explanation = analysis_result.get('explanation', '')

    recommendation_payload = None
    if recommended_id:
        recommendation_payload = {
            'route_id': recommended_id,
            'reasons': [explanation] if explanation else [],
        }

    formatted_routes = []
    # Map from route_id to original computed route object for geometry
    orig_routes_by_id = {r.id: r for r in computed_routes}

    for summary in analysis_result.get('ranked_routes', []):
        r_id = summary['route_id']
        orig_r = orig_routes_by_id.get(r_id)
        raw_points = orig_r.points if orig_r else []
        simplified_geojson = simplify_geometry(raw_points, max_points=1000)

        formatted_cps = []
        for cp in summary.get('checkpoints', []):
            formatted_cps.append({
                'mile': round(cp['mile_mark'], 1),
                'lat': round(cp['coordinate'][0], 5),
                'lng': round(cp['coordinate'][1], 5),
                'eta': cp['eta_iso'],
                'weather': {
                    'wind_mph': round(cp['weather']['wind_mph'], 1),
                    'gust_mph': round(cp['weather']['gust_mph'], 1),
                    'rain_in_hr': round(cp['weather']['rain_in_hr'], 2),
                    'snow_in_hr': round(cp['weather']['snow_in_hr'], 2),
                } if cp.get('weather') else None,
                'risk': {
                    'level': int(cp['risk']['level']),
                    'label': RiskLevel(cp['risk']['level']).name.replace('_', ' ').title(),
                    'drivers': cp['risk']['drivers'],
                    'load_rule': cp['risk']['load_rule'],
                },
            })

        formatted_routes.append({
            'id': r_id,
            'label': orig_r.label if orig_r else r_id,
            'distance_mi': summary['total_miles'],
            'duration_s': summary['duration_s'],
            'geometry': simplified_geojson,
            'recommended': r_id == recommended_id,
            'summary': {
                'miles_by_level': summary['miles_by_level'],
                'avg_risk': summary['rank_avg_risk'],
                'max_level': int(summary['max_level']),
                'blocked': summary['has_no_travel'] == 1,
            },
            'checkpoints': formatted_cps,
        })

    all_warnings = analysis_result.get('warnings', []) + routes_result.get('notes', [])

    return Response({
        'recommendation': recommendation_payload,
        'warnings': all_warnings,
        'routes': formatted_routes,
    })


@api_view(['POST'])
def heatmap_view(request, routing_provider=None, weather_provider=None):
    """
    POST /api/heatmap
    Generates 0-48h weather risk heatmap along the corridor.
    Reuses cached routes and cached weather where available.
    """
    serializer = TripAnalyzeSerializer(data=request.data)
    if not serializer.is_valid():
        first_err = next(iter(serializer.errors.items()))
        msg = f'{first_err[0]}: {first_err[1][0]}' if isinstance(first_err[1], list) else str(serializer.errors)
        return Response(
            {
                'error': {
                    'code': 'invalid_input',
                    'message': msg,
                }
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    orig = data['origin']
    dest = data['destination']
    dep_time = data['departure_time']
    load_lb = data['load_weight_lb']
    interval_mi = data.get('interval_miles', 25)
    scenario = data.get('scenario', 'live')

    # Step 1: Retrieve routes (hits cache if already computed by /api/trips/analyze)
    try:
        routes_result = get_routes(
            origin=(orig['lat'], orig['lng']),
            destination=(dest['lat'], dest['lng']),
            provider=routing_provider,
            load_weight_lb=load_lb,
        )
    except NoRouteFound as exc:
        return Response(
            {'error': {'code': 'no_route_found', 'message': str(exc)}},
            status=status.HTTP_404_NOT_FOUND,
        )
    except RoutingUnavailable as exc:
        return Response(
            {'error': {'code': 'routing_unavailable', 'message': str(exc)}},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as exc:
        return Response(
            {'error': {'code': 'routing_error', 'message': f'Routing error: {exc}'}},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    computed_routes = routes_result.get('routes', [])
    if not computed_routes:
        return Response(
            {'error': {'code': 'no_route_found', 'message': 'No routes found for the given locations.'}},
            status=status.HTTP_404_NOT_FOUND,
        )

    route_dicts = [
        {
            'route_id': r.id,
            'label': r.label,
            'geometry': r.points,
            'duration_s': r.duration_s,
            'distance_mi': r.distance_mi,
        }
        for r in computed_routes
    ]

    try:
        heatmap_data = generate_heatmap(
            routes=route_dicts,
            departure_time=dep_time,
            load_weight_lb=load_lb,
            weather_provider=weather_provider,
            scenario=scenario,
            grid_interval_miles=float(interval_mi),
            grid_offset_miles=18.0,
            grid_deg=0.25,
            max_points=250,
        )
    except WeatherUnavailable as exc:
        return Response(
            {'error': {'code': 'weather_unavailable', 'message': str(exc)}},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as exc:
        return Response(
            {'error': {'code': 'heatmap_error', 'message': f'Heatmap error: {exc}'}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(heatmap_data, status=status.HTTP_200_OK)

