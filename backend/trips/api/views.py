"""API views for health, legacy route, geocoding, and trip risk analysis."""

import math
import logging
import time
from datetime import timedelta
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.core.cache import cache

from trips.api.serializers import RouteRequestSerializer, TripAnalyzeSerializer, TripSearchSerializer
from trips.models import TripSearch
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
from trips.services.geocoding import geocode_address, reverse_geocode
from trips.services.weather.report import get_full_weather_report
from trips.services.analysis import analyze_routes
from trips.services.heatmap import generate_heatmap
from trips.services.weather.open_meteo import OpenMeteoProvider
from trips.services.weather.fixture import FixtureWeatherProvider
from trips.services.weather.base import Weather, WeatherUnavailable
from trips.services.timeline import enrich_checkpoints_with_stops
from trips.services.checkpoints import generate_checkpoints

logger = logging.getLogger(__name__)


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
    t_req_start = time.perf_counter()
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

    # Check analysis cache for identical request
    analysis_cache_key = None
    if routing_provider is None and weather_provider is None:
        analysis_cache_key = (
            f'trip_analysis:{round(orig["lat"], 3):.3f}:{round(orig["lng"], 3):.3f}:'
            f'{round(dest["lat"], 3):.3f}:{round(dest["lng"], 3):.3f}:'
            f'{dep_time.isoformat()}:{int(load_lb)}:{interval_mi}:{scenario}:{data.get("constant_wind_mph")}'
        )
        cached_analysis = cache.get(analysis_cache_key)
        if cached_analysis is not None:
            total_duration = time.perf_counter() - t_req_start
            logger.info('[TIMING] total_analyze_request (cached) took %.3fs', total_duration)
            return Response(cached_analysis)

    stage = request.query_params.get('stage') or data.get('stage')

    # Step 1: Calculate distinct routes
    try:
        routes_result = get_routes(
            origin=(orig['lat'], orig['lng']),
            destination=(dest['lat'], dest['lng']),
            provider=routing_provider,
            load_weight_lb=load_lb,
            fast_mode=(stage == 'routes'),
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

    if stage == 'routes':
        fast_routes = []
        for idx, r in enumerate(computed_routes):
            simplified_geojson = simplify_geometry(r.points, max_points=1000)
            cps = generate_checkpoints(
                polyline=r.points,
                total_duration_seconds=r.duration_s,
                departure_time=dep_time,
                interval_miles=interval_mi,
            )
            initial_cps = [
                {
                    'mile': round(cp['mile_mark'], 1),
                    'lat': round(cp['coordinate'][0], 5),
                    'lng': round(cp['coordinate'][1], 5),
                    'eta': cp['eta_iso'],
                    'weather': None,
                    'risk': {
                        'level': 0,
                        'label': 'Low',
                        'drivers': [],
                        'load_rule': None,
                    },
                    'is_key_stop': False,
                    'name': None,
                    'advisory': None,
                }
                for cp in cps
            ]
            fast_routes.append({
                'id': r.id,
                'label': r.label,
                'distance_mi': r.distance_mi,
                'duration_s': r.duration_s,
                'geometry': simplified_geojson,
                'recommended': idx == 0,
                'summary': {
                    'miles_by_level': {'0': r.distance_mi},
                    'avg_risk': 0.0,
                    'max_level': 0,
                    'blocked': False,
                },
                'checkpoints': initial_cps,
            })

        fast_duration = time.perf_counter() - t_req_start
        logger.info('[TIMING] fast_routes_stage took %.3fs', fast_duration)
        return Response({
            'recommendation': {
                'route_id': fast_routes[0]['id'] if fast_routes else None,
                'reasons': ['Initial route polyline computed (weather hazards calculating...)'],
            },
            'warnings': routes_result.get('notes', []),
            'routes': fast_routes,
            'provider_used': routes_result.get('provider_used', 'unknown'),
            'stage': 'routes',
            'progressive': True,
        })

    # Step 2: Determine weather provider (live vs demo scenario)
    const_wind = data.get('constant_wind_mph')
    if weather_provider is not None:
        active_weather_provider = weather_provider
    elif const_wind is not None or scenario == 'constant_wind':
        wind_speed = float(const_wind if const_wind is not None else 0.0)
        active_weather_provider = FixtureWeatherProvider(
            default_weather=Weather(
                wind_mph=wind_speed,
                gust_mph=wind_speed,
                rain_in_hr=0.0,
                snow_in_hr=0.0,
            )
        )
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

    t_analysis = time.perf_counter()
    try:
        analysis_result = analyze_routes(
            routes=route_input_dicts,
            departure_time=dep_time,
            load_lb=load_lb,
            weather_provider=active_weather_provider,
            checkpoint_interval_miles=interval_mi,
        )
    except WeatherUnavailable as exc:
        logger.warning('Weather unavailable for trip analysis, degrading gracefully: %s', exc)
        fixture_provider = FixtureWeatherProvider.calm()
        analysis_result = analyze_routes(
            routes=route_input_dicts,
            departure_time=dep_time,
            load_lb=load_lb,
            weather_provider=fixture_provider,
            checkpoint_interval_miles=interval_mi,
        )
        analysis_result['weather_unavailable'] = True
        analysis_result['warnings'].append('Weather service is currently unavailable. Displaying routes without weather overlay.')
    except Exception as exc:
        return Response(
            {'error': {'code': 'analysis_error', 'message': f'Analysis error: {exc}'}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    analysis_duration = time.perf_counter() - t_analysis
    logger.info('[TIMING] analysis_stage took %.3fs', analysis_duration)

    # Step 4: Format standardized output response
    t_ser = time.perf_counter()
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
    shared_place_cache = {}

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
                    'temp_f': round(cp['weather']['temp_f'], 1) if cp['weather'].get('temp_f') is not None else None,
                    'humidity_pct': round(float(cp['weather']['humidity_pct']), 0) if cp['weather'].get('humidity_pct') is not None else None,
                    'condition': str(cp['weather']['condition']) if cp['weather'].get('condition') is not None else None,
                } if cp.get('weather') else None,
                'risk': {
                    'level': int(cp['risk']['level']),
                    'label': RiskLevel(cp['risk']['level']).name.replace('_', ' ').title(),
                    'drivers': cp['risk']['drivers'],
                    'load_rule': cp['risk']['load_rule'],
                },
            })

        formatted_cps = enrich_checkpoints_with_stops(
            formatted_cps,
            origin_name=orig.get('label') or orig.get('address'),
            dest_name=dest.get('label') or dest.get('address'),
            place_cache=shared_place_cache,
        )

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

    serialization_duration = time.perf_counter() - t_ser
    logger.info('[TIMING] serialization_stage took %.3fs', serialization_duration)

    all_warnings = analysis_result.get('warnings', []) + routes_result.get('notes', [])
    provider_used = routes_result.get('provider_used', 'unknown')

    total_duration = time.perf_counter() - t_req_start
    logger.info('[TIMING] total_analyze_request took %.3fs (routing_provider=%s)', total_duration, provider_used)

    response_payload = {
        'recommendation': recommendation_payload,
        'warnings': all_warnings,
        'routes': formatted_routes,
        'provider_used': provider_used,
        'partial_weather': bool(analysis_result.get('partial_weather', False)),
        'weather_unavailable': bool(analysis_result.get('weather_unavailable', False)),
    }

    if analysis_cache_key is not None:
        cache.set(analysis_cache_key, response_payload, timeout=900)  # 15 minutes TTL

    return Response(response_payload)


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


@api_view(['GET'])
def reverse_geocode_view(request):
    """
    GET /api/geocode/reverse/?lat=...&lon=...
    Reverse geocodes coordinates to a readable label via TomTom (10 min cache).
    """
    lat_str = request.query_params.get('lat')
    lon_str = request.query_params.get('lon') or request.query_params.get('lng')
    if not lat_str or not lon_str:
        return Response({'error': 'lat and lon query parameters are required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        lat = float(lat_str)
        lon = float(lon_str)
    except ValueError:
        return Response({'error': 'lat and lon must be valid floats.'}, status=status.HTTP_400_BAD_REQUEST)

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return Response({'error': 'lat must be between -90 and 90, lon between -180 and 180.'}, status=status.HTTP_400_BAD_REQUEST)

    res = reverse_geocode(lat, lon)
    return Response(res, status=status.HTTP_200_OK)


@api_view(['GET'])
def weather_report_view(request):
    """
    GET /api/weather/report/?origin_lat=&origin_lon=&dest_lat=&dest_lon=&departure=...
    Returns current conditions and hourly forecast for origin and optional destination.
    """
    orig_lat_str = request.query_params.get('origin_lat')
    orig_lon_str = request.query_params.get('origin_lon')
    if not orig_lat_str or not orig_lon_str:
        return Response({'error': 'origin_lat and origin_lon parameters are required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        orig_lat = float(orig_lat_str)
        orig_lon = float(orig_lon_str)
    except ValueError:
        return Response({'error': 'Coordinates must be valid numbers.'}, status=status.HTTP_400_BAD_REQUEST)

    dest_lat = None
    dest_lon = None
    dest_lat_str = request.query_params.get('dest_lat')
    dest_lon_str = request.query_params.get('dest_lon')
    if dest_lat_str and dest_lon_str:
        try:
            dest_lat = float(dest_lat_str)
            dest_lon = float(dest_lon_str)
        except ValueError:
            pass

    departure = request.query_params.get('departure')
    report = get_full_weather_report(orig_lat, orig_lon, dest_lat, dest_lon, departure)
    return Response(report, status=status.HTTP_200_OK)


def get_client_id(request) -> str:
    """Extract and validate anonymous client id from request headers."""
    client_id = request.headers.get('X-Client-Id') or request.META.get('HTTP_X_CLIENT_ID')
    if not client_id or not client_id.strip():
        return 'anonymous'
    return client_id.strip()[:64]


@api_view(['GET', 'POST', 'DELETE'])
def recent_trips_view(request):
    """
    GET /api/trips/?limit=10 - list recent searches for client_id (deduped origin/dest)
    POST /api/trips/ - save new trip search, auto-capping at 50 records
    DELETE /api/trips/ - clear all searches for client_id
    """
    client_id = get_client_id(request)

    if request.method == 'GET':
        try:
            limit = int(request.query_params.get('limit', 10))
        except (ValueError, TypeError):
            limit = 10
        limit = max(1, min(limit, 50))

        qs = TripSearch.objects.filter(client_id=client_id).order_by('-created_at')

        seen = set()
        deduped = []
        for trip in qs:
            key = (round(trip.origin_lat, 3), round(trip.origin_lon, 3), round(trip.dest_lat, 3), round(trip.dest_lon, 3))
            if key not in seen:
                seen.add(key)
                deduped.append(trip)
            if len(deduped) >= limit:
                break

        serializer = TripSearchSerializer(deduped, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        serializer = TripSearchSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        trip = serializer.save(client_id=client_id)

        # Cap at 50 entries per client_id
        count = TripSearch.objects.filter(client_id=client_id).count()
        if count > 50:
            excess = count - 50
            old_ids = list(TripSearch.objects.filter(client_id=client_id).order_by('created_at').values_list('id', flat=True)[:excess])
            TripSearch.objects.filter(id__in=old_ids).delete()

        return Response(TripSearchSerializer(trip).data, status=status.HTTP_201_CREATED)

    elif request.method == 'DELETE':
        TripSearch.objects.filter(client_id=client_id).delete()
        return Response({'status': 'cleared'}, status=status.HTTP_200_OK)


@api_view(['DELETE'])
def recent_trip_detail_view(request, trip_id):
    """
    DELETE /api/trips/<id>/ - delete single trip search for client_id
    """
    client_id = get_client_id(request)
    try:
        trip = TripSearch.objects.get(id=trip_id, client_id=client_id)
        trip.delete()
        return Response({'status': 'deleted'}, status=status.HTTP_200_OK)
    except TripSearch.DoesNotExist:
        return Response({'error': 'Trip not found.'}, status=status.HTTP_404_NOT_FOUND)


