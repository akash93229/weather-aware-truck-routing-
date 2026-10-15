"""Deterministic fixture weather provider for testing and reproducible demos."""

from datetime import datetime, timedelta, timezone
from typing import List, Tuple, Dict, Optional, Any

from trips.services.weather.base import Weather, WeatherProvider


class FixtureWeatherProvider(WeatherProvider):
    """
    Deterministic provider that generates controlled weather conditions
    for tests and demo scenarios without making external network calls.
    """

    def __init__(
        self,
        default_weather: Optional[Weather] = None,
        rules: Optional[List[Dict[str, Any]]] = None,
    ):
        self.default_weather = default_weather or Weather(
            wind_mph=10.0,
            gust_mph=15.0,
            rain_in_hr=0.0,
            snow_in_hr=0.0,
        )
        # rules: list of dicts with optional keys:
        # 'hour': int (0-23) or datetime
        # 'area': (min_lat, max_lat, min_lng, max_lng)
        # 'weather': Weather instance
        self.rules = rules or []

    @classmethod
    def calm(cls) -> 'FixtureWeatherProvider':
        """All hours and locations have calm Low-risk weather."""
        return cls(
            default_weather=Weather(wind_mph=8.0, gust_mph=12.0, rain_in_hr=0.0, snow_in_hr=0.0)
        )

    @classmethod
    def storm_at_hour(
        cls,
        target_hour_utc: datetime,
        storm_weather: Optional[Weather] = None,
        area: Optional[Tuple[float, float, float, float]] = None,
    ) -> 'FixtureWeatherProvider':
        """
        Creates a scenario where severe storm conditions occur ONLY at a specific UTC hour.
        """
        storm = storm_weather or Weather(
            wind_mph=48.0,      # Severe sustained wind
            gust_mph=65.0,
            rain_in_hr=0.60,    # Severe rain
            snow_in_hr=0.0,
        )
        return cls(
            default_weather=Weather(wind_mph=10.0, gust_mph=15.0, rain_in_hr=0.0, snow_in_hr=0.0),
            rules=[{
                'target_datetime': target_hour_utc,
                'area': area,
                'weather': storm,
            }],
        )

    def _matches_rule(self, pt: Tuple[float, float], dt: datetime, rule: Dict[str, Any]) -> bool:
        # Check time match
        if 'target_datetime' in rule and rule['target_datetime'] is not None:
            rule_dt = rule['target_datetime']
            if rule_dt.tzinfo is None:
                rule_dt = rule_dt.replace(tzinfo=timezone.utc)
            # Match hour
            if (dt.year, dt.month, dt.day, dt.hour) != (rule_dt.year, rule_dt.month, rule_dt.day, rule_dt.hour):
                return False

        if 'hour' in rule and rule['hour'] is not None:
            if dt.hour != rule['hour']:
                return False

        # Check area bounding box (min_lat, max_lat, min_lng, max_lng)
        if 'area' in rule and rule['area'] is not None:
            min_lat, max_lat, min_lng, max_lng = rule['area']
            if not (min_lat <= pt[0] <= max_lat and min_lng <= pt[1] <= max_lng):
                return False

        return True

    def get_hourly(
        self,
        points: List[Tuple[float, float]],
        start_utc: datetime,
        end_utc: datetime,
    ) -> Dict[Tuple[float, float], Dict[datetime, Weather]]:
        if not points:
            return {}

        if start_utc.tzinfo is None:
            start_utc = start_utc.replace(tzinfo=timezone.utc)
        if end_utc.tzinfo is None:
            end_utc = end_utc.replace(tzinfo=timezone.utc)

        # Floor start to top of hour and ceiling end
        cur_hour = start_utc.replace(minute=0, second=0, microsecond=0)
        end_hour = end_utc.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

        hours_list: List[datetime] = []
        t = cur_hour
        while t <= end_hour:
            hours_list.append(t)
            t += timedelta(hours=1)

        result: Dict[Tuple[float, float], Dict[datetime, Weather]] = {}
        for pt in points:
            loc_weather: Dict[datetime, Weather] = {}
            for dt in hours_list:
                selected_weather = self.default_weather
                for rule in self.rules:
                    if self._matches_rule(pt, dt, rule):
                        selected_weather = rule['weather']
                        break
                loc_weather[dt] = selected_weather
            result[pt] = loc_weather

        return result
