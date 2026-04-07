"""Tests for StepIndex using the DRB1-3123 fixture.

DRB1 reference path: gi|568815592 (1488 steps, bp range ~32578769–32589836)
"""

import math
import pytest


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------

class TestStepIndexProperties:

    def test_step_count(self, drb1_step_index):
        assert len(drb1_step_index.starts) == 1488

    def test_genome(self, drb1_step_index):
        assert drb1_step_index.get_genome() == "gi|568815592"

    def test_arrays_same_length(self, drb1_step_index):
        si = drb1_step_index
        n = len(si.starts)
        assert len(si.ends) == n
        assert len(si.segments) == n

    def test_starts_strictly_increasing(self, drb1_step_index):
        starts = drb1_step_index.starts
        for i in range(1, len(starts)):
            assert starts[i] > starts[i - 1], (
                f"starts[{i}]={starts[i]} <= starts[{i-1}]={starts[i-1]}")

    def test_end_gte_start(self, drb1_step_index):
        si = drb1_step_index
        for i in range(len(si.starts)):
            assert si.ends[i] >= si.starts[i], (
                f"Step {i}: end {si.ends[i]} < start {si.starts[i]}")


# ---------------------------------------------------------------------------
# __getitem__ lookup
# ---------------------------------------------------------------------------

class TestStepLookup:

    def test_first_step(self, drb1_step_index):
        assert drb1_step_index[0] == 18

    def test_last_step(self, drb1_step_index):
        assert drb1_step_index[1487] == 3025

    def test_negative_oob(self, drb1_step_index):
        assert drb1_step_index[-1] is None

    def test_upper_oob(self, drb1_step_index):
        assert drb1_step_index[1488] is None


# ---------------------------------------------------------------------------
# query_bp (binary search)
# ---------------------------------------------------------------------------

class TestQueryBp:

    def test_exact_boundary(self, drb1_step_index):
        idx, start, end = drb1_step_index.query_bp(32584461)
        assert idx == 744

    def test_exact_boundary_fractional(self, drb1_step_index):
        result = drb1_step_index.query_bp(32584461, exact=True)
        assert math.isclose(result, 744.0)

    def test_mid_step(self, drb1_step_index):
        idx, start, end = drb1_step_index.query_bp(32580952)
        assert idx == 100

    def test_mid_step_fractional(self, drb1_step_index):
        result = drb1_step_index.query_bp(32580952, exact=True)
        assert math.isclose(result, 100.5)

    def test_before_first_clamps(self, drb1_step_index):
        idx, start, end = drb1_step_index.query_bp(0)
        assert idx == 0

    def test_after_last_clamps(self, drb1_step_index):
        idx, start, end = drb1_step_index.query_bp(999999999)
        assert idx == 1487


# ---------------------------------------------------------------------------
# query_coordinates
# ---------------------------------------------------------------------------

class TestQueryCoordinates:

    def test_range_query(self, drb1_step_index):
        start_step, end_step = drb1_step_index.query_coordinates(32580946, 32581520)
        assert start_step == 100
        assert end_step == 200

    def test_range_query_exact(self, drb1_step_index):
        start_step, end_step = drb1_step_index.query_coordinates(
            32580946, 32581520, exact=True)
        assert math.isclose(start_step, 100.0)
        assert math.isclose(end_step, 200.0)

    def test_segment_id_from_coordinates(self, drb1_step_index):
        seg_start, seg_end = drb1_step_index.query_segment_id_from_coordinates(
            32580946, 32581520)
        assert seg_start == 218
        assert seg_end == 386


# ---------------------------------------------------------------------------
# segment_map (reverse lookup)
# ---------------------------------------------------------------------------

class TestSegmentMap:

    def test_segment_18_at_step_0(self, drb1_step_index):
        sm = drb1_step_index.segment_map()
        assert 0 in sm[18]

    def test_every_step_covered(self, drb1_step_index):
        sm = drb1_step_index.segment_map()
        all_steps = set()
        for steps in sm.values():
            all_steps.update(steps)
        assert all_steps == set(range(len(drb1_step_index.starts)))
