"""Tests for geographic distance calculations and polyline interpolation."""

import pytest
from trips.services.geo import (
    haversine_distance,
    cumulative_distances,
    point_at_distance,
)


class TestHaversineDistance:
    def test_same_point(self):
        coord = [40.7128, -74.0060]
        assert haversine_distance(coord, coord) == 0.0

    def test_known_distance_nyc_philly(self):
        # NYC (40.7128, -74.0060) to Philadelphia (39.9526, -75.1652) is ~80.5 miles
        nyc = [40.7128, -74.0060]
        philly = [39.9526, -75.1652]
        dist = haversine_distance(nyc, philly)
        assert 79.0 < dist < 82.0

    def test_symmetry(self):
        p1 = [51.5074, -0.1278]  # London
        p2 = [48.8566, 2.3522]   # Paris
        assert pytest.approx(haversine_distance(p1, p2), rel=1e-6) == haversine_distance(p2, p1)


class TestCumulativeDistances:
    def test_empty_and_single(self):
        assert cumulative_distances([]) == []
        assert cumulative_distances([[0, 0]]) == [0.0]

    def test_multi_segment(self):
        polyline = [
            [0.0, 0.0],
            [0.0, 1.0],  # ~69.17 miles along equator
            [0.0, 2.0],  # ~138.34 miles
        ]
        cum = cumulative_distances(polyline)
        assert len(cum) == 3
        assert cum[0] == 0.0
        assert cum[1] > 68.0
        assert cum[2] > cum[1]
        assert pytest.approx(cum[2], rel=1e-3) == cum[1] * 2


class TestPointAtDistance:
    @pytest.fixture
    def straight_line(self):
        # 1 degree of latitude is ~69.05 miles
        return [
            [40.0, -75.0],
            [41.0, -75.0],
        ]

    def test_start_and_end_boundaries(self, straight_line):
        cum = cumulative_distances(straight_line)
        total = cum[-1]

        start_pt = point_at_distance(straight_line, 0.0, cum)
        assert start_pt == (40.0, -75.0)

        negative_pt = point_at_distance(straight_line, -10.0, cum)
        assert negative_pt == (40.0, -75.0)

        end_pt = point_at_distance(straight_line, total, cum)
        assert end_pt == (41.0, -75.0)

        overshoot_pt = point_at_distance(straight_line, total + 50.0, cum)
        assert overshoot_pt == (41.0, -75.0)

    def test_midpoint_interpolation(self, straight_line):
        cum = cumulative_distances(straight_line)
        total = cum[-1]
        mid_pt = point_at_distance(straight_line, total / 2.0, cum)

        assert pytest.approx(mid_pt[0], abs=1e-4) == 40.5
        assert pytest.approx(mid_pt[1], abs=1e-4) == -75.0
