"""Weather and truck load risk assessment engine."""

from enum import IntEnum
from typing import Dict, Any, List, Optional, Tuple


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


# Configuration dictionary for all weather thresholds
# Edge rule: lower bound inclusive, upper bound exclusive (except where specified)
RISK_THRESHOLDS: Dict[str, Any] = {
    'wind': [
        (0.0, 25.0, RiskLevel.LOW),
        (25.0, 35.0, RiskLevel.MODERATE),
        (35.0, 45.0, RiskLevel.HIGH),
        (45.0, 55.0, RiskLevel.SEVERE),
        (55.0, float('inf'), RiskLevel.NO_TRAVEL),
    ],
    'rain': [
        (0.0, 0.10, RiskLevel.LOW),
        (0.10, 0.25, RiskLevel.MODERATE),
        (0.25, 0.50, RiskLevel.HIGH),
        (0.50, 1.00, RiskLevel.SEVERE),     # <= 1.00 is Severe
        (1.00, float('inf'), RiskLevel.NO_TRAVEL),  # > 1.00 is No Travel
    ],
    'snow': [
        (0.0, 0.50, RiskLevel.LOW),
        (0.50, 1.00, RiskLevel.MODERATE),
        (1.00, 2.00, RiskLevel.HIGH),
        (2.00, 3.00, RiskLevel.SEVERE),     # <= 3.00 is Severe
        (3.00, float('inf'), RiskLevel.NO_TRAVEL),  # > 3.00 is No Travel
    ],
}


def wind_level(speed_mph: float) -> RiskLevel:
    """
    Calculate wind risk level based on sustained wind speed in mph.
    <25: Low, 25-34.99: Moderate, 35-44.99: High, 45-54.99: Severe, >=55: No Travel.
    """
    if speed_mph < 25.0:
        return RiskLevel.LOW
    elif speed_mph < 35.0:
        return RiskLevel.MODERATE
    elif speed_mph < 45.0:
        return RiskLevel.HIGH
    elif speed_mph < 55.0:
        return RiskLevel.SEVERE
    else:
        return RiskLevel.NO_TRAVEL


def rain_level(precip_in_hr: float) -> RiskLevel:
    """
    Calculate rain risk level in in/hr.
    <0.10: Low, >=0.10: Moderate, >=0.25: High, >=0.50: Severe, >1.00: No Travel.
    Exactly 1.00 is Severe.
    """
    if precip_in_hr < 0.10:
        return RiskLevel.LOW
    elif precip_in_hr < 0.25:
        return RiskLevel.MODERATE
    elif precip_in_hr < 0.50:
        return RiskLevel.HIGH
    elif precip_in_hr <= 1.00:
        return RiskLevel.SEVERE
    else:
        return RiskLevel.NO_TRAVEL


def snow_level(snow_in_hr: float) -> RiskLevel:
    """
    Calculate snow risk level in in/hr.
    <0.5: Low, >=0.5: Moderate, >=1.0: High, >=2.0: Severe, >3.0: No Travel.
    Exactly 3.0 is Severe.
    """
    if snow_in_hr < 0.5:
        return RiskLevel.LOW
    elif snow_in_hr < 1.0:
        return RiskLevel.MODERATE
    elif snow_in_hr < 2.0:
        return RiskLevel.HIGH
    elif snow_in_hr <= 3.0:
        return RiskLevel.SEVERE
    else:
        return RiskLevel.NO_TRAVEL


def evaluate_load_rules(wind_speed_mph: float, load_lb: float) -> Tuple[Optional[RiskLevel], Optional[str]]:
    """
    Evaluate load weight and wind rules. Loads use strictly '>'.
    Returns (minimum_risk_level, rule_description) if triggered, else (None, None).
    """
    if wind_speed_mph >= 55.0:
        return RiskLevel.NO_TRAVEL, 'Wind >= 55 mph: No Travel for any load'
    elif 45.0 <= wind_speed_mph < 55.0 and load_lb > 30000.0:
        return RiskLevel.NO_TRAVEL, 'Wind 45-54 mph and load > 30,000 lb: No Travel'
    elif 35.0 <= wind_speed_mph < 45.0 and load_lb > 40000.0:
        return RiskLevel.SEVERE, 'Wind 35-44 mph and load > 40,000 lb: at least Severe'
    return None, None


def checkpoint_risk(weather: Dict[str, float], load_lb: float = 0.0) -> Dict[str, Any]:
    """
    Calculate combined checkpoint risk level based on weather and truck load weight.

    Args:
        weather: Dict containing wind, rain, and snow measurements.
                 Accepts keys 'wind_speed_mph' (or 'wind'), 'rain_in_hr' (or 'rain'),
                 'snow_in_hr' (or 'snow').
        load_lb: Total truck load weight in pounds.

    Returns:
        Dict with keys:
          - level: RiskLevel (IntEnum 0-4)
          - drivers: List of strings ('wind', 'rain', 'snow') that caused the highest level
          - load_rule: description string if a load rule fired, else None
          - components: Dict of individual RiskLevel values for wind, rain, snow
    """
    wind_val = float(weather.get('wind_speed_mph', weather.get('wind', 0.0)))
    rain_val = float(weather.get('rain_in_hr', weather.get('rain', 0.0)))
    snow_val = float(weather.get('snow_in_hr', weather.get('snow', 0.0)))

    base_wind = wind_level(wind_val)
    rain = rain_level(rain_val)
    snow = snow_level(snow_val)

    # Apply load rules (can only make risk worse)
    load_min_level, load_rule = evaluate_load_rules(wind_val, load_lb)
    adjusted_wind = max(base_wind, load_min_level) if load_min_level is not None else base_wind

    # Overall level is max of parts
    overall_level = max(adjusted_wind, rain, snow)

    # Determine which drivers caused the final level
    drivers: List[str] = []
    if adjusted_wind == overall_level and overall_level > RiskLevel.LOW:
        drivers.append('wind')
    if rain == overall_level and overall_level > RiskLevel.LOW:
        drivers.append('rain')
    if snow == overall_level and overall_level > RiskLevel.LOW:
        drivers.append('snow')

    # If all parts were LOW (overall is LOW), no dangerous drivers
    if overall_level == RiskLevel.LOW:
        drivers = []

    return {
        'level': overall_level,
        'drivers': drivers,
        'load_rule': load_rule,
        'components': {
            'wind_base': base_wind,
            'wind': adjusted_wind,
            'rain': rain,
            'snow': snow,
        },
    }
