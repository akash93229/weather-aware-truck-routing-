"""
Weather report service querying Open-Meteo for origin and destination forecast data.
Cached for 10 minutes (600s) with 8s timeouts and error handling.
"""

import logging
import time
import requests
from typing import Dict, Any, Optional
from django.core.cache import cache

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 8
WEATHER_CACHE_TTL = 600  # 10 minutes

# WMO Weather interpretation codes (WW)
WMO_DESCRIPTIONS = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
}


def get_weather_report_point(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fetch current and hourly forecast for a single coordinate."""
    cache_key = f'wx_report:{round(lat, 2)}:{round(lon, 2)}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    url = 'https://api.open-meteo.com/v1/forecast'
    params = {
        'latitude': f'{lat:.4f}',
        'longitude': f'{lon:.4f}',
        'current': 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m,wind_gusts_10m',
        'hourly': 'temperature_2m,precipitation_probability,precipitation,rain,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,visibility',
        'temperature_unit': 'fahrenheit',
        'wind_speed_unit': 'mph',
        'precipitation_unit': 'inch',
        'timezone': 'GMT',
        'forecast_days': 3,
    }

    t0 = time.perf_counter()
    try:
        response = requests.get(url, params=params, timeout=TIMEOUT_SECONDS)
        elapsed = time.perf_counter() - t0
        logger.info("[TIMING] open_meteo_report (%f, %f) took %.3fs (status=%s)", lat, lon, elapsed, response.status_code)
        if response.status_code == 200:
            data = response.json()
            curr = data.get('current', {})
            hourly = data.get('hourly', {})

            weather_code = curr.get('weather_code', 0)
            condition_text = WMO_DESCRIPTIONS.get(weather_code, 'Clear')

            result = {
                'lat': lat,
                'lon': lon,
                'current': {
                    'temperature_f': round(float(curr.get('temperature_2m', 0)), 1),
                    'apparent_temperature_f': round(float(curr.get('apparent_temperature', 0)), 1),
                    'humidity_pct': int(curr.get('relative_humidity_2m', 0)),
                    'wind_speed_mph': round(float(curr.get('wind_speed_10m', 0)), 1),
                    'wind_gusts_mph': round(float(curr.get('wind_gusts_10m', 0)), 1),
                    'precipitation_in': round(float(curr.get('precipitation', 0)), 2),
                    'snowfall_in': round(float(curr.get('snowfall', 0)), 2),
                    'weather_code': weather_code,
                    'condition': condition_text,
                },
                'hourly': {
                    'time': hourly.get('time', [])[:48],
                    'temperature_f': hourly.get('temperature_2m', [])[:48],
                    'precipitation_prob': hourly.get('precipitation_probability', [])[:48],
                    'precipitation_in': hourly.get('precipitation', [])[:48],
                    'wind_speed_mph': hourly.get('wind_speed_10m', [])[:48],
                    'wind_gusts_mph': hourly.get('wind_gusts_10m', [])[:48],
                    'weather_code': hourly.get('weather_code', [])[:48],
                    'visibility_miles': [round(v / 1609.34, 1) for v in hourly.get('visibility', [])[:48]] if hourly.get('visibility') else [],
                }
            }
            cache.set(cache_key, result, timeout=WEATHER_CACHE_TTL)
            return result
        return None
    except requests.exceptions.RequestException as exc:
        logger.error('Open-Meteo weather report error: %s', exc)
        return None


def compute_driver_brief(
    origin_data: Optional[Dict[str, Any]],
    dest_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Computes an instant 3-second 'Driver Brief' for commercial truck drivers.
    Evaluates wind speed, gusts, precipitation, snow, visibility, and freezing temps
    using real Open-Meteo observations.
    """
    if not origin_data or not origin_data.get('current'):
        return {
            'status': 'UNKNOWN',
            'status_label': 'DATA PENDING',
            'status_color': '#94a3b8',
            'headline': 'Select an origin to view instant weather briefing.',
            'primary_concern': 'NONE',
            'road_condition': 'Unknown',
            'max_wind_mph': 0,
            'max_gust_mph': 0,
            'driver_action': 'Awaiting corridor parameters.',
        }

    orig_curr = origin_data['current']
    dest_curr = (dest_data or {}).get('current', {})

    orig_wind = float(orig_curr.get('wind_speed_mph', 0))
    dest_wind = float(dest_curr.get('wind_speed_mph', 0)) if dest_curr else 0.0
    orig_gust = float(orig_curr.get('wind_gusts_mph', 0))
    dest_gust = float(dest_curr.get('wind_gusts_mph', 0)) if dest_curr else 0.0

    max_wind = round(max(orig_wind, dest_wind), 1)
    max_gust = round(max(orig_gust, dest_gust), 1)

    orig_precip = float(orig_curr.get('precipitation_in', 0))
    dest_precip = float(dest_curr.get('precipitation_in', 0)) if dest_curr else 0.0
    max_precip = round(max(orig_precip, dest_precip), 2)

    orig_snow = float(orig_curr.get('snowfall_in', 0))
    dest_snow = float(dest_curr.get('snowfall_in', 0)) if dest_curr else 0.0
    max_snow = round(max(orig_snow, dest_snow), 2)

    orig_temp = float(orig_curr.get('temperature_f', 50))
    dest_temp = float(dest_curr.get('temperature_f', 50)) if dest_curr else orig_temp
    min_temp = round(min(orig_temp, dest_temp), 1)

    orig_code = orig_curr.get('weather_code', 0)
    dest_code = dest_curr.get('weather_code', 0) if dest_curr else 0

    # Determine road surface state
    if max_snow > 0.05 or orig_code in (71, 73, 75, 77, 85, 86) or dest_code in (71, 73, 75, 77, 85, 86):
        road_condition = 'Snow / Slush Accumulation'
    elif min_temp <= 32 and max_precip > 0:
        road_condition = 'Freezing Rain / Black Ice Risk'
    elif max_precip >= 0.05 or orig_code in (51, 53, 55, 61, 63, 65, 80, 81, 82) or dest_code in (51, 53, 55, 61, 63, 65, 80, 81, 82):
        road_condition = 'Wet Pavement'
    else:
        road_condition = 'Dry & Clear'

    # Risk level determination
    # Severe: Gusts >= 45mph, snow >= 0.4 in, freezing rain, thunderstorm
    if max_gust >= 45 or max_wind >= 35 or max_snow >= 0.4 or (min_temp <= 32 and max_precip > 0.05) or orig_code in (95, 96, 99) or dest_code in (95, 96, 99):
        status = 'HAZARD'
        status_label = 'SEVERE WEATHER ALERT'
        status_color = '#ef4444'
        if max_gust >= 45:
            primary_concern = 'HIGH CROSSWINDS'
            headline = f'DANGEROUS GUSTS: Peak winds {max_gust} mph. Empty & high-profile trailers at rollover risk.'
            driver_action = 'Reduce speed immediately. Light trailers should consider staging until winds subside.'
        elif max_snow >= 0.4 or (min_temp <= 32 and max_precip > 0.05):
            primary_concern = 'WINTER DRIVING'
            headline = f'WINTER HAZARD: {road_condition} with pavement temps near {min_temp}°F.'
            driver_action = 'Avoid engine braking on slippery decks. Increase following distance to 10+ seconds.'
        else:
            primary_concern = 'SEVERE STORMS'
            headline = 'THUNDERSTORMS: Heavy downpours and lightning active along corridor.'
            driver_action = 'Expect localized ponding and sudden cross-buffeting. Keep low beams active.'

    # Caution: Gusts >= 28mph, rain >= 0.15 in, fog, temp <= 34
    elif max_gust >= 28 or max_wind >= 22 or max_precip >= 0.15 or orig_code in (45, 48) or dest_code in (45, 48) or min_temp <= 34:
        status = 'CAUTION'
        status_label = 'CAUTION ADVISED'
        status_color = '#eab308'
        if max_gust >= 28:
            primary_concern = 'GUSTY WINDS'
            headline = f'MODERATE CROSSWINDS: Gusts up to {max_gust} mph detected.'
            driver_action = 'Maintain firm two-handed grip on open highway and exposed bridges.'
        elif orig_code in (45, 48) or dest_code in (45, 48):
            primary_concern = 'REDUCED VISIBILITY'
            headline = 'FOG ADVISORY: Dense fog patches reducing forward sight lines.'
            driver_action = 'Reduce speed, use low beams, avoid sudden stops.'
        elif min_temp <= 34:
            primary_concern = 'NEAR FREEZING'
            headline = f'CHILL WARNING: Air temp {min_temp}°F near freezing point.'
            driver_action = 'Watch bridge overpasses and shaded turns for early ice formation.'
        else:
            primary_concern = 'WET HIGHWAYS'
            headline = f'RAIN SHOWERS: Wet pavement with {max_precip} in/hr rainfall.'
            driver_action = 'Maintain 6-second following distance and watch for tire spray.'

    else:
        status = 'CLEAR'
        status_label = 'ALL CLEAR — SAFE TO ROLL'
        status_color = '#10b981'
        headline = f'CLEAR ROADS: Gentle winds ({max_wind} mph) and dry pavement from origin to destination.'
        primary_concern = 'NONE'
        driver_action = 'Normal highway cruising speeds permissible.'

    return {
        'status': status,
        'status_label': status_label,
        'status_color': status_color,
        'headline': headline,
        'primary_concern': primary_concern,
        'road_condition': road_condition,
        'max_wind_mph': max_wind,
        'max_gust_mph': max_gust,
        'origin_temp_f': orig_curr.get('temperature_f'),
        'dest_temp_f': dest_curr.get('temperature_f') if dest_curr else None,
        'driver_action': driver_action,
    }


def get_full_weather_report(
    origin_lat: float,
    origin_lon: float,
    dest_lat: Optional[float] = None,
    dest_lon: Optional[float] = None,
    departure_iso: Optional[str] = None
) -> Dict[str, Any]:
    """Generates structured weather report for origin and optional destination."""
    origin_data = get_weather_report_point(origin_lat, origin_lon)
    dest_data = None
    if dest_lat is not None and dest_lon is not None:
        dest_data = get_weather_report_point(dest_lat, dest_lon)

    alerts = []
    if origin_data and origin_data.get('current'):
        curr = origin_data['current']
        if curr.get('wind_speed_mph', 0) >= 35 or curr.get('wind_gusts_mph', 0) >= 45:
            alerts.append({'type': 'high_wind', 'message': f"High wind advisory at origin ({curr['wind_speed_mph']} mph, gusts {curr['wind_gusts_mph']} mph)"})
        if curr.get('precipitation_in', 0) >= 0.25:
            alerts.append({'type': 'heavy_rain', 'message': f"Heavy rain at origin ({curr['precipitation_in']} in/hr)"})
        if curr.get('snowfall_in', 0) >= 0.5:
            alerts.append({'type': 'snow_ice', 'message': f"Snow accumulation at origin ({curr['snowfall_in']} in/hr)"})
        if curr.get('weather_code') in (95, 96, 99):
            alerts.append({'type': 'thunderstorm', 'message': "Thunderstorm reported in corridor vicinity"})
        if curr.get('weather_code') in (45, 48):
            alerts.append({'type': 'fog', 'message': "Dense fog reducing corridor visibility"})

    driver_brief = compute_driver_brief(origin_data, dest_data)

    return {
        'origin': origin_data,
        'destination': dest_data,
        'departure_time': departure_iso,
        'alerts': alerts,
        'driver_brief': driver_brief,
    }
