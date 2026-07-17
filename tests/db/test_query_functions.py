"""Tests for query.py functions not covered by route tests.

Uses the DRB1 fixture via the shared drb1_dir conftest.
Functions tested: get_path_order, get_path, get_bubble_meta, get_chain_graph.
"""

import pytest

import pangyplot.db.query as query
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

REFERENCE = "gi|568815592"
CHROM = "DRB1"


class _Indexes:
    """Lightweight indexes container matching what query.py expects."""
    def __init__(self, drb1_dir):
        gfaidx = GFAIndex(drb1_dir)
        stepidx = StepIndex(drb1_dir, REFERENCE)
        bubbleidx = BubbleIndex(drb1_dir, gfaidx)
        self.step_index = {(CHROM, REFERENCE): stepidx}
        self.bubble_index = {CHROM: bubbleidx}
        self.gfa_index = {CHROM: gfaidx}


@pytest.fixture(scope="module")
def indexes(drb1_dir):
    return _Indexes(drb1_dir)


# ---------------------------------------------------------------------------
# get_path_order
# ---------------------------------------------------------------------------

class TestGetPathOrder:

    def test_returns_dict_with_12_samples(self, indexes):
        order = query.get_path_order(indexes, REFERENCE, CHROM)
        assert isinstance(order, dict)
        assert len(order) == 12

    def test_reference_sample_present(self, indexes):
        order = query.get_path_order(indexes, REFERENCE, CHROM)
        assert any(REFERENCE in key for key in order)


# ---------------------------------------------------------------------------
# get_path
# ---------------------------------------------------------------------------

class TestGetPath:

    def test_returns_subpaths(self, indexes):
        sample = list(query.get_path_order(indexes, REFERENCE, CHROM).keys())[0]
        paths = query.get_path(indexes, REFERENCE, CHROM, 32580000, 32585000, sample)
        assert len(paths) >= 1

    def test_subpath_has_required_keys(self, indexes):
        sample = list(query.get_path_order(indexes, REFERENCE, CHROM).keys())[0]
        paths = query.get_path(indexes, REFERENCE, CHROM, 32580000, 32585000, sample)
        for p in paths:
            for key in ("sample", "path", "start", "is_ref"):
                assert key in p

    def test_subpath_has_steps(self, indexes):
        sample = list(query.get_path_order(indexes, REFERENCE, CHROM).keys())[0]
        paths = query.get_path(indexes, REFERENCE, CHROM, 32580000, 32585000, sample)
        for p in paths:
            assert len(p["path"]) > 0

    def test_nonexistent_sample_returns_empty(self, indexes):
        paths = query.get_path(indexes, REFERENCE, CHROM, 32580000, 32585000, "NOSUCHSAMPLE")
        assert paths == []


# ---------------------------------------------------------------------------
# get_bubble_meta
# ---------------------------------------------------------------------------

class TestGetBubbleMeta:

    def _find_chain_id(self, indexes):
        """Find a chain ID that has bubbles."""
        bi = indexes.bubble_index[CHROM]
        for bid in bi.ids[:20]:
            b = bi[bid]
            if b.chain is not None:
                return b.chain
        pytest.fail("No chain found")

    def test_returns_bubbles(self, indexes):
        cid = self._find_chain_id(indexes)
        meta = query.get_bubble_meta(indexes, REFERENCE, CHROM, f"c{cid}")
        assert len(meta) > 0

    def test_bubble_has_required_fields(self, indexes):
        cid = self._find_chain_id(indexes)
        meta = query.get_bubble_meta(indexes, REFERENCE, CHROM, f"c{cid}")
        for b in meta:
            for key in ("id", "t", "length", "subtype", "bp_start", "bp_end",
                        "is_ref", "source_segs", "sink_segs"):
                assert key in b

    def test_t_values_range_0_to_1(self, indexes):
        cid = self._find_chain_id(indexes)
        meta = query.get_bubble_meta(indexes, REFERENCE, CHROM, f"c{cid}")
        for b in meta:
            assert 0.0 <= b["t"] <= 1.0

    def test_bp_start_before_end(self, indexes):
        cid = self._find_chain_id(indexes)
        meta = query.get_bubble_meta(indexes, REFERENCE, CHROM, f"c{cid}")
        for b in meta:
            if b["is_ref"] and b["bp_start"] is not None:
                assert b["bp_start"] <= b["bp_end"]

    def test_invalid_chain_returns_empty(self, indexes):
        meta = query.get_bubble_meta(indexes, REFERENCE, CHROM, "c999999")
        assert meta == []


# ---------------------------------------------------------------------------
# get_chain_graph
# ---------------------------------------------------------------------------

class TestGetChainGraph:

    def _find_chain_id(self, indexes):
        bi = indexes.bubble_index[CHROM]
        for bid in bi.ids[:20]:
            b = bi[bid]
            if b.chain is not None:
                return b.chain
        pytest.fail("No chain found")

    def test_returns_nodes_and_links(self, indexes):
        cid = self._find_chain_id(indexes)
        result = query.get_chain_graph(indexes, cid, REFERENCE, CHROM)
        assert "nodes" in result
        assert "links" in result
        assert len(result["nodes"]) > 0

    def test_invalid_chain_returns_empty(self, indexes):
        result = query.get_chain_graph(indexes, 999999, REFERENCE, CHROM)
        assert result["nodes"] == []
        assert result["links"] == []


class TestRegionComplexityGuard:
    """The segment-count guard that turns an OOM-scale region into a 413."""

    def test_small_region_passes(self, indexes):
        # DRB1 is tiny, so a normal /select must stay well under the budget and
        # return a graph rather than raising RegionTooComplex.
        graph = query.get_bubble_graph(indexes, REFERENCE, CHROM, 32580000, 32585000)
        assert isinstance(graph, dict)

    def test_count_sums_inside_source_sink(self):
        class B:
            def __init__(self, inside, src, snk):
                self.inside = set(range(inside))
                self.source_segments = list(range(src))
                self.sink_segments = list(range(snk))
        assert query._region_segment_count([B(10, 2, 3), B(5, 1, 1)]) == 22

    def test_guard_raises_over_budget_and_carries_counts(self):
        class B:
            def __init__(self, n):
                self.inside = set(range(n))
                self.source_segments = []
                self.sink_segments = []
        # Exactly at the limit is allowed (guard is strict >).
        query._guard_region_complexity([B(query.MAX_REGION_SEGMENTS)])
        # One over trips it, and the exception carries the counts for the 413.
        with pytest.raises(query.RegionTooComplex) as ei:
            query._guard_region_complexity([B(query.MAX_REGION_SEGMENTS + 1)])
        assert ei.value.seg_count == query.MAX_REGION_SEGMENTS + 1
        assert ei.value.limit == query.MAX_REGION_SEGMENTS
