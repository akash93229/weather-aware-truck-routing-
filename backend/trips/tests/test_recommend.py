"""Tests for multi-criteria route ranking and recommendation logic."""

import pytest
from trips.services.risk import RiskLevel
from trips.services.recommend import (
    summarize_route_risk,
    recommend_best_route,
)


class TestRouteRecommendation:
    def test_fewer_severe_beats_shorter_time(self):
        # Route 1: Faster (3600s), but has 40 miles of Severe weather
        route_fast = {
            'route_id': 'fast_but_severe',
            'duration_s': 3600,
            'checkpoints': [
                {'attributed_miles': 60.0, 'level': RiskLevel.LOW},
                {'attributed_miles': 40.0, 'level': RiskLevel.SEVERE},
            ],
        }
        # Route 2: Slower (5400s), but 0 Severe miles (only Moderate)
        route_safe = {
            'route_id': 'safe_route',
            'duration_s': 5400,
            'checkpoints': [
                {'attributed_miles': 50.0, 'level': RiskLevel.LOW},
                {'attributed_miles': 50.0, 'level': RiskLevel.MODERATE},
            ],
        }

        res = recommend_best_route([route_fast, route_safe])
        assert res['recommended_route_id'] == 'safe_route'
        assert res['ranked_routes'][0]['route_id'] == 'safe_route'
        assert res['ranked_routes'][1]['route_id'] == 'fast_but_severe'
        assert '0.0 Severe miles vs 40.0 on Fastest' in res['explanation']
        assert '+30 min' in res['explanation']

    def test_equal_severe_fewer_high_wins(self):
        # Both have 0 Severe miles. Route A has 25 High miles (3000s). Route B has 5 High miles (3600s).
        route_a = {
            'route_id': 'route_a',
            'duration_s': 3000,
            'checkpoints': [
                {'attributed_miles': 75.0, 'level': RiskLevel.LOW},
                {'attributed_miles': 25.0, 'level': RiskLevel.HIGH},
            ],
        }
        route_b = {
            'route_id': 'route_b',
            'duration_s': 3600,
            'checkpoints': [
                {'attributed_miles': 95.0, 'level': RiskLevel.LOW},
                {'attributed_miles': 5.0, 'level': RiskLevel.HIGH},
            ],
        }

        res = recommend_best_route([route_a, route_b])
        assert res['recommended_route_id'] == 'route_b'
        assert '5.0 High risk miles vs 25.0 on Fastest' in res['explanation']

    def test_equal_high_lower_avg_risk_wins(self):
        # Both have 0 Severe and 0 High.
        # Route A: 50 miles Moderate (risk 1), 50 miles Low (risk 0) -> avg risk 0.50, duration 3000s
        # Route B: 20 miles Moderate, 80 miles Low -> avg risk 0.20, duration 3400s
        route_a = {
            'route_id': 'route_a',
            'duration_s': 3000,
            'checkpoints': [
                {'attributed_miles': 50.0, 'level': RiskLevel.MODERATE},
                {'attributed_miles': 50.0, 'level': RiskLevel.LOW},
            ],
        }
        route_b = {
            'route_id': 'route_b',
            'duration_s': 3400,
            'checkpoints': [
                {'attributed_miles': 20.0, 'level': RiskLevel.MODERATE},
                {'attributed_miles': 80.0, 'level': RiskLevel.LOW},
            ],
        }

        res = recommend_best_route([route_a, route_b])
        assert res['recommended_route_id'] == 'route_b'
        assert 'Lower overall average risk' in res['explanation']

    def test_equal_risk_shorter_duration_wins(self):
        # Both have identical risk profile. Shorter travel time wins.
        route_fast = {
            'route_id': 'fast_clean',
            'duration_s': 2800,
            'checkpoints': [{'attributed_miles': 100.0, 'level': RiskLevel.LOW}],
        }
        route_slow = {
            'route_id': 'slow_clean',
            'duration_s': 3500,
            'checkpoints': [{'attributed_miles': 100.0, 'level': RiskLevel.LOW}],
        }

        res = recommend_best_route([route_fast, route_slow])
        assert res['recommended_route_id'] == 'fast_clean'
        assert 'fastest option and safest path' in res['explanation']

    def test_no_travel_routes_rank_last(self):
        # Route 1: 1500s (very fast), but has No Travel checkpoint
        route_dangerous = {
            'route_id': 'dangerous',
            'duration_s': 1500,
            'checkpoints': [
                {'attributed_miles': 50.0, 'level': RiskLevel.LOW},
                {'attributed_miles': 10.0, 'level': RiskLevel.NO_TRAVEL},
            ],
        }
        # Route 2: 4500s, but only High risk
        route_tolerable = {
            'route_id': 'tolerable',
            'duration_s': 4500,
            'checkpoints': [
                {'attributed_miles': 50.0, 'level': RiskLevel.HIGH},
            ],
        }

        res = recommend_best_route([route_dangerous, route_tolerable])
        assert res['recommended_route_id'] == 'tolerable'
        assert res['ranked_routes'][-1]['route_id'] == 'dangerous'
        assert 'avoids No Travel zones' in res['explanation']

    def test_all_no_travel_recommends_none(self):
        route1 = {
            'route_id': 'route_1',
            'duration_s': 2000,
            'checkpoints': [{'attributed_miles': 10.0, 'level': RiskLevel.NO_TRAVEL}],
        }
        route2 = {
            'route_id': 'route_2',
            'duration_s': 3000,
            'checkpoints': [{'attributed_miles': 5.0, 'level': RiskLevel.NO_TRAVEL}],
        }

        res = recommend_best_route([route1, route2])
        assert res['recommended_route_id'] is None
        assert res['recommended_route'] is None
        assert 'No route recommended' in res['explanation']
