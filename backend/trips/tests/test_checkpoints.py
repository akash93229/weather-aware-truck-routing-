"""Tests for checkpoint sampling, spacing, attributed miles, and ETAs."""

from datetime import datetime, timezone
import pytest
from trips.services.geo import cumulative_distances
from trips.services.checkpoints import generate_checkpoints


@pytest.fixture
def sample_route():
    # Long straight line along longitude ~-75 from lat 38.0 to 40.0 (~138 miles)
    return [
        [38.0, -75.0],
        [39.0, -75.0],
        [40.0, -75.0],
    ]


class TestCheckpoints:
    @pytest.mark.parametrize('interval', [10.0, 25.0, 50.0])
    def test_checkpoint_spacing_and_endpoints(self, sample_route, interval):
        departure = datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc)
        duration_s = 7200.0  # 2 hours

        checkpoints = generate_checkpoints(sample_route, duration_s, departure, interval_miles=interval)
        cum = cumulative_distances(sample_route)
        total_len = cum[-1]

        assert len(checkpoints) >= 2
        # First point is mile 0
        assert checkpoints[0]['mile_mark'] == 0.0
        assert checkpoints[0]['coordinate'] == [38.0, -75.0]

        # Last point is destination
        assert pytest.approx(checkpoints[-1]['mile_mark'], rel=1e-5) == total_len
        assert pytest.approx(checkpoints[-1]['coordinate'][0], rel=1e-5) == 40.0
        assert pytest.approx(checkpoints[-1]['coordinate'][1], rel=1e-5) == -75.0

        # Spacing for intermediate checkpoints
        for i in range(1, len(checkpoints) - 1):
            assert pytest.approx(checkpoints[i]['mile_mark'], rel=1e-5) == i * interval

    def test_attributed_miles_sum_to_route_length(self, sample_route):
        departure = datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc)
        duration_s = 7200.0

        for interval in [10.0, 25.0, 50.0]:
            checkpoints = generate_checkpoints(sample_route, duration_s, departure, interval_miles=interval)
            cum = cumulative_distances(sample_route)
            total_len = cum[-1]

            attributed_sum = sum(cp['attributed_miles'] for cp in checkpoints)
            assert pytest.approx(attributed_sum, rel=1e-5) == total_len

    def test_etas_increase(self, sample_route):
        departure = datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc)
        duration_s = 7200.0

        checkpoints = generate_checkpoints(sample_route, duration_s, departure, interval_miles=25.0)

        # First ETA is departure
        assert checkpoints[0]['eta'] == departure

        # Last ETA is departure + total duration
        assert (checkpoints[-1]['eta'] - departure).total_seconds() == pytest.approx(duration_s, rel=1e-5)

        # Each ETA is strictly greater than or equal to the previous
        for i in range(1, len(checkpoints)):
            assert checkpoints[i]['eta'] > checkpoints[i - 1]['eta']

    def test_single_point_route(self):
        departure = datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc)
        checkpoints = generate_checkpoints([[40.0, -75.0]], 0.0, departure, 25.0)
        assert len(checkpoints) == 1
        assert checkpoints[0]['mile_mark'] == 0.0
        assert checkpoints[0]['attributed_miles'] == 0.0
        assert checkpoints[0]['eta'] == departure
