"""Tests for region-scoped path slicing (GBWT migration Stage 2).

Covers:
  * region_segment_ids — the position-safe segment set for a bp window
  * get_path_region_raw — slicing a subpath to that set + re-encoding
  * a NON-MONOTONIC-ID regression guard: segment ids that are not ordered by
    genomic position must still slice correctly (this is the guard for a
    GBZ-native importer that skips ``odgi sort``).
"""
import numpy as np

from pangyplot.db import query
from pangyplot.db.path_codec import decode_combined

CHROM = "drb1"


class _Indexes:
    """Minimal stand-in for the app object query.* reads index dicts off of."""
    def __init__(self, gfa, step, bubble, genome):
        self.gfa_index = {CHROM: gfa}
        self.step_index = {(CHROM, genome): step}
        self.bubble_index = {CHROM: bubble}


# ---------------------------------------------------------------------------
# Integration: real DRB1 indexes
# ---------------------------------------------------------------------------

REFERENCE = "gi|568815592"


def _indexes(drb1_gfa_index, drb1_step_index, drb1_bubble_index):
    return _Indexes(drb1_gfa_index, drb1_step_index, drb1_bubble_index, REFERENCE)


def _full_span(step_index):
    return int(min(step_index.starts)), int(max(step_index.ends))


class TestRegionSegmentIds:
    def test_subwindow_is_subset_of_full(self, drb1_gfa_index, drb1_step_index,
                                         drb1_bubble_index):
        idx = _indexes(drb1_gfa_index, drb1_step_index, drb1_bubble_index)
        start, end = _full_span(drb1_step_index)
        full = query.region_segment_ids(idx, REFERENCE, CHROM, start, end)
        mid = (start + end) // 2
        sub = query.region_segment_ids(idx, REFERENCE, CHROM, start, mid)
        assert sub, "sub-window should contain some segments"
        assert sub <= full, "sub-window segment set must be contained in the full span"

    def test_reference_backbone_included(self, drb1_gfa_index, drb1_step_index,
                                         drb1_bubble_index):
        idx = _indexes(drb1_gfa_index, drb1_step_index, drb1_bubble_index)
        start, end = _full_span(drb1_step_index)
        region = query.region_segment_ids(idx, REFERENCE, CHROM, start, end)
        # every reference step's segment must be in the full-span region set
        ref_segs = {int(s) for s in drb1_step_index.segments}
        assert ref_segs <= region


class TestGetPathRegionRaw:
    def _ref_sample(self, gfa):
        for sample in gfa.path_index.get_samples():
            for meta in gfa.path_index.get_path_meta(sample):
                if meta.get("is_ref"):
                    return sample
        return gfa.path_index.get_samples()[0]

    def test_region_slice_is_subset_of_whole(self, drb1_gfa_index,
                                             drb1_step_index, drb1_bubble_index):
        idx = _indexes(drb1_gfa_index, drb1_step_index, drb1_bubble_index)
        sample = self._ref_sample(drb1_gfa_index)
        start, end = _full_span(drb1_step_index)
        mid = (start + end) // 2

        full = drb1_gfa_index.path_index.get_path_combined(sample, 0)
        raw = query.get_path_region_raw(idx, REFERENCE, CHROM, sample, 0, start, mid)
        region = decode_combined(raw)

        full_segs = set((full >> 1).tolist())
        region_segs = set((region >> 1).tolist())
        assert region_segs <= full_segs
        assert len(region) <= len(full)
        # every sliced segment is in the window's segment set
        rset = query.region_segment_ids(idx, REFERENCE, CHROM, start, mid)
        assert region_segs <= rset

    def test_full_span_keeps_reference_walk(self, drb1_gfa_index,
                                            drb1_step_index, drb1_bubble_index):
        idx = _indexes(drb1_gfa_index, drb1_step_index, drb1_bubble_index)
        sample = self._ref_sample(drb1_gfa_index)
        start, end = _full_span(drb1_step_index)

        full = drb1_gfa_index.path_index.get_path_combined(sample, 0)
        raw = query.get_path_region_raw(idx, REFERENCE, CHROM, sample, 0, start, end)
        region = decode_combined(raw)
        # the reference walks only reference-backbone segments, all in-span
        assert len(region) == len(full)


# ---------------------------------------------------------------------------
# Regression: non-monotonic segment IDs (the GBZ-no-sort guard)
# ---------------------------------------------------------------------------

class _FakeStep:
    """query_coordinates treats its inputs as step indices directly."""
    def __init__(self, segments):
        self.segments = segments

    def query_coordinates(self, start, end):
        return (start, end)


class _FakeBubble:
    def get_top_level_bubbles(self, min_step, max_step):
        return []

    def get_descendant_ids(self, bubble):
        return set()


class _FakePathIndex:
    def __init__(self, combined):
        self._combined = combined

    def get_path_combined(self, sample, file_index):
        return self._combined


class _FakeGfa:
    def __init__(self, path_index):
        self.path_index = path_index


class TestNonMonotonicIds:
    # steps 0..3 map to segment ids that are NOT ordered by position
    SEGMENTS = [30, 10, 40, 20]

    def _idx(self, combined=None):
        step = _FakeStep(list(self.SEGMENTS))
        bubble = _FakeBubble()
        gfa = _FakeGfa(_FakePathIndex(combined))
        return _Indexes(gfa, step, bubble, "g")

    def test_region_set_is_by_position_not_id_range(self):
        idx = self._idx()
        # window = steps 1..2 → segments {10, 40}
        region = query.region_segment_ids(idx, "g", CHROM, 1, 2)
        assert region == {10, 40}
        # the trap: a naive `id BETWEEN 10 AND 40` would wrongly pull in 20 and
        # 30 (they satisfy the id range but sit OUTSIDE the positional window).
        assert 10 <= 20 <= 40 and 10 <= 30 <= 40      # inside the naive id range
        assert 20 not in region and 30 not in region  # correctly excluded

    def test_path_slice_respects_position_not_id_range(self):
        # path visits segments [30, 10, 40, 20] (all '+'): combined = seg << 1
        combined = np.array([s << 1 for s in [30, 10, 40, 20]], dtype=np.int64)
        idx = self._idx(combined)
        raw = query.get_path_region_raw(idx, "g", CHROM, "s", 0, 1, 2)
        sliced = (decode_combined(raw) >> 1).tolist()
        # only the in-window segments, in original path order
        assert sliced == [10, 40]
