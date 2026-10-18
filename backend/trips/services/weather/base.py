"""Base weather data model and abstract provider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import List, Tuple, Dict, Optional


@dataclass(frozen=True)
class Weather:
    """Represents weather metrics at a specific location and hour."""
    wind_mph: float       # Sustained wind speed (wind_speed_10m)
    gust_mph: float       # Wind gusts (wind_gusts_10m)
    rain_in_hr: float     # Total rainfall (rain + showers) in inches/hr
    snow_in_hr: float     # Snowfall in inches/hr
    temp_f: Optional[float] = None  # Air temperature in Fahrenheit
    humidity_pct: Optional[float] = None  # Relative humidity percentage (None if unavailable)
    condition: Optional[str] = None       # Weather condition description (None if unavailable)


class WeatherError(Exception):
    """Base exception for weather services."""
    pass


class WeatherUnavailable(WeatherError):
    """Raised when weather provider fails, times out, or is unreachable."""
    pass


class WeatherProvider(ABC):
    """Abstract interface for weather forecast providers."""

    @abstractmethod
    def get_hourly(
        self,
        points: List[Tuple[float, float]],
        start_utc: datetime,
        end_utc: datetime,
    ) -> Dict[Tuple[float, float], Dict[datetime, Weather]]:
        """
        Fetch hourly weather forecast for a list of (lat, lng) points between start_utc and end_utc.

        Returns a dictionary mapping (lat, lng) to a dictionary of {hour_timestamp_utc: Weather}.
        """
        pass
