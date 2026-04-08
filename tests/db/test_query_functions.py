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
