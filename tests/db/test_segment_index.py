"""Tests for SegmentIndex using the DRB1-3123 fixture."""

import os
import pytest

from pangyplot.db.indexes.SegmentIndex import SegmentIndex


# ---------------------------------------------------------------------------
# Basic properties
# ---------------------------------------------------------------------------

class TestSegmentIndexProperties:

    def test_length(self, drb1_segment_index):
        assert len(drb1_segment_index) == 3214

    def test_max_id(self, drb1_segment_index):
        assert drb1_segment_index.max_id() >= 3214

    def test_valid_count_matches_length(self, drb1_segment_index):
        valid_count = sum(1 for v in drb1_segment_index.valid if v)
        assert valid_count == len(drb1_segment_index)

    def test_arrays_same_size(self, drb1_segment_index):
        si = drb1_segment_index
        n = len(si.valid)
        assert len(si.length) == n
        assert len(si.x1) == n
        assert len(si.y1) == n
        assert len(si.x2) == n
        assert len(si.y2) == n


# ---------------------------------------------------------------------------
# Array lookups
# ---------------------------------------------------------------------------

class TestSegmentIndexLookups:

    def _first_valid_id(self, si):
        for i, v in enumerate(si.valid):
            if v:
                return i
        pytest.fail("No valid segments found")

    def test_segment_length_valid_id(self, drb1_segment_index):
        sid = self._first_valid_id(drb1_segment_index)
        assert drb1_segment_index.segment_length(sid) > 0

    def test_segment_length_invalid_id(self, drb1_segment_index):
        # Slot 0 is typically unused in GFA (IDs start at 1)
        if not drb1_segment_index.valid[0]:
            assert drb1_segment_index.segment_length(0) == 0

    def test_segment_length_out_of_bounds(self, drb1_segment_index):
        big_id = len(drb1_segment_index.length) + 100
        assert drb1_segment_index.segment_length(big_id) == 0

    def test_valid_segments_have_positive_length(self, drb1_segment_index):
        si = drb1_segment_index
        for i, v in enumerate(si.valid):
            if v:
                assert si.length[i] > 0, f"Segment {i} is valid but has length 0"

    def test_valid_segments_have_layout_coords(self, drb1_segment_index):
        si = drb1_segment_index
        sid = self._first_valid_id(si)
        # At least one coordinate pair should be nonzero
        assert not (si.x1[sid] == 0 and si.y1[sid] == 0
                    and si.x2[sid] == 0 and si.y2[sid] == 0)

    def test_gc_count_returns_list(self, drb1_segment_index):
        sid = self._first_valid_id(drb1_segment_index)
        result = drb1_segment_index.segment_gc_n_count(sid)
        assert isinstance(result, list)
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Batch operations
# ---------------------------------------------------------------------------

class TestSegmentIndexBatch:

    def test_get_by_ids(self, drb1_segment_index):
        si = drb1_segment_index
        valid_ids = [i for i, v in enumerate(si.valid) if v][:10]
        results = si.get_by_ids(valid_ids)
        assert len(results) == 10

    def test_get_by_ids_filters_invalid(self, drb1_segment_index):
        si = drb1_segment_index
        invalid_id = 0 if not si.valid[0] else len(si.valid) + 1
        valid_id = next(i for i, v in enumerate(si.valid) if v)
        results = si.get_by_ids([invalid_id, valid_id])
        assert len(results) == 1

    def test_get_by_ids_empty(self, drb1_segment_index):
        assert drb1_segment_index.get_by_ids([]) == []


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

class TestSegmentIndexSerialization:

    def test_serialize_has_expected_keys(self, drb1_segment_index):
        data = drb1_segment_index.serialize()
        expected = {"length", "gc_count", "n_count", "x1", "y1", "x2", "y2", "valid"}
        assert set(data.keys()) == expected

    def test_serialize_arrays_same_length(self, drb1_segment_index):
        data = drb1_segment_index.serialize()
        lengths = {k: len(v) for k, v in data.items()}
        assert len(set(lengths.values())) == 1

    def test_mmap_roundtrip(self, drb1_dir):
        """Load from mmap, verify it matches a fresh SQLite build."""
        si1 = SegmentIndex(drb1_dir)
        assert len(si1) == 3214

        # The mmap files should exist now
        mmap_dir = os.path.join(drb1_dir, "segments.mmapindex")
        assert os.path.isdir(mmap_dir)

        # Load again — this time from mmap
        si2 = SegmentIndex(drb1_dir)
        assert len(si2) == len(si1)
        assert si2.max_id() == si1.max_id()
