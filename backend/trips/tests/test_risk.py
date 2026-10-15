"""Tests for risk engine boundaries, load rules, and max-of-parts combination."""

import pytest
from trips.services.risk import (
    RiskLevel,
    wind_level,
    rain_level,
    snow_level,
    checkpoint_risk,
)


class TestWindBoundaries:
    @pytest.mark.parametrize(
        'speed,expected',
        [
            (24.9, RiskLevel.LOW),
            (25.0, RiskLevel.MODERATE),
            (34.9, RiskLevel.MODERATE),
            (35.0, RiskLevel.HIGH),
            (44.9, RiskLevel.HIGH),
            (45.0, RiskLevel.SEVERE),
            (54.9, RiskLevel.SEVERE),
            (55.0, RiskLevel.NO_TRAVEL),
            (65.0, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_wind_boundaries(self, speed, expected):
        assert wind_level(speed) == expected


class TestRainBoundaries:
    @pytest.mark.parametrize(
        'precip,expected',
        [
            (0.09, RiskLevel.LOW),
            (0.10, RiskLevel.MODERATE),
            (0.24, RiskLevel.MODERATE),
            (0.25, RiskLevel.HIGH),
            (0.49, RiskLevel.HIGH),
            (0.50, RiskLevel.SEVERE),
            (1.00, RiskLevel.SEVERE),  # Exactly 1.00 is Severe
            (1.01, RiskLevel.NO_TRAVEL),  # > 1.00 is No Travel
        ],
    )
    def test_rain_boundaries(self, precip, expected):
        assert rain_level(precip) == expected


class TestSnowBoundaries:
    @pytest.mark.parametrize(
        'snow,expected',
        [
            (0.49, RiskLevel.LOW),
            (0.50, RiskLevel.MODERATE),
            (0.99, RiskLevel.MODERATE),
            (1.00, RiskLevel.HIGH),
            (1.99, RiskLevel.HIGH),
            (2.00, RiskLevel.SEVERE),
            (3.00, RiskLevel.SEVERE),  # Exactly 3.00 is Severe
            (3.01, RiskLevel.NO_TRAVEL),  # > 3.00 is No Travel
        ],
    )
    def test_snow_boundaries(self, snow, expected):
        assert snow_level(snow) == expected


class TestLoadRules:
    def test_wind_40mph_load_40000(self):
        # Exactly 40,000 does not trigger rule (> 40,000 required) -> Base is High
        res = checkpoint_risk({'wind': 40.0, 'rain': 0.0, 'snow': 0.0}, load_lb=40000.0)
        assert res['level'] == RiskLevel.HIGH
        assert res['load_rule'] is None
        assert res['drivers'] == ['wind']

    def test_wind_40mph_load_40001(self):
        # 40,001 > 40,000 triggers at least Severe
        res = checkpoint_risk({'wind': 40.0, 'rain': 0.0, 'snow': 0.0}, load_lb=40001.0)
        assert res['level'] == RiskLevel.SEVERE
        assert res['load_rule'] == 'Wind 35-44 mph and load > 40,000 lb: at least Severe'
        assert res['drivers'] == ['wind']

    def test_wind_50mph_load_30000(self):
        # Exactly 30,000 does not trigger No Travel -> Base is Severe
        res = checkpoint_risk({'wind': 50.0, 'rain': 0.0, 'snow': 0.0}, load_lb=30000.0)
        assert res['level'] == RiskLevel.SEVERE
        assert res['load_rule'] is None
        assert res['drivers'] == ['wind']

    def test_wind_50mph_load_30001(self):
        # 30,001 > 30,000 triggers No Travel
        res = checkpoint_risk({'wind': 50.0, 'rain': 0.0, 'snow': 0.0}, load_lb=30001.0)
        assert res['level'] == RiskLevel.NO_TRAVEL
        assert res['load_rule'] == 'Wind 45-54 mph and load > 30,000 lb: No Travel'
        assert res['drivers'] == ['wind']

    def test_wind_55mph_load_1000(self):
        # Wind >= 55 is No Travel regardless of load
        res = checkpoint_risk({'wind': 55.0, 'rain': 0.0, 'snow': 0.0}, load_lb=1000.0)
        assert res['level'] == RiskLevel.NO_TRAVEL
        assert res['load_rule'] == 'Wind >= 55 mph: No Travel for any load'
        assert res['drivers'] == ['wind']


class TestMaxOfParts:
    def test_wind_moderate_rain_high(self):
        res = checkpoint_risk({'wind': 26.0, 'rain': 0.30, 'snow': 0.0}, load_lb=20000.0)
        assert res['level'] == RiskLevel.HIGH
        assert res['drivers'] == ['rain']

    def test_multiple_tied_drivers(self):
        res = checkpoint_risk({'wind': 0.0, 'rain': 0.60, 'snow': 2.50}, load_lb=10000.0)
        assert res['level'] == RiskLevel.SEVERE
        assert set(res['drivers']) == {'rain', 'snow'}

    def test_all_calm(self):
        res = checkpoint_risk({'wind': 5.0, 'rain': 0.0, 'snow': 0.0}, load_lb=20000.0)
        assert res['level'] == RiskLevel.LOW
        assert res['drivers'] == []
