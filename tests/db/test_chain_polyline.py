"""Tests for chain_polyline.py — polyline building, chain decomposition, junction graph.

Synthetic tests for pure helpers; DRB1 integration for the full pipeline.

DRB1 chain examples:
  - Chain 18 (src=[3041], snk=[2184]): 193 bubbles, 15 superbubbles, long chain
  - Chain 114 (src=[640], snk=[229]): 108 bubbles, 11 superbubbles, decomposes to 24 sub-chains
  - Chain 78 (src=[80], snk=[75]): single bubble
"""

from array import array

import pytest

from pangyplot.db.chain_polyline import (
    _seg_centroid,
    _bubble_layout_span,
    build_chain_polyline,
    decompose_chain,
    find_junction_graph,
)
from pangyplot.objects.Bubble import Bubble
from pangyplot.objects.Chain import Chain
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

REFERENCE = "gi|568815592"


# ---------------------------------------------------------------------------
# Helpers for synthetic tests
# ---------------------------------------------------------------------------

class _FakeSegIndex:
    def __init__(self):
        self.x1 = array('f', [0.0, 10.0, 20.0])
        self.y1 = array('f', [0.0, 5.0, 10.0])
        self.x2 = array('f', [0.0, 14.0, 24.0])
        self.y2 = array('f', [0.0, 9.0, 14.0])
        self.valid = array('B', [0, 1, 1])
        self.length = array('I', [0, 100, 200])


def _make_bubble(id, chain_step, source=None, sink=None,
                 x1=0, x2=10, y1=0, y2=5, children=None,
                 range_inclusive=None):
    b = Bubble()
    b.id = id
    b.chain_step = chain_step
    b.source_segments = source or [id * 10]
    b.sink_segments = sink or [id * 10 + 1]
    b.x1, b.x2, b.y1, b.y2 = x1, x2, y1, y2
    b.children = children or []
    b.range_inclusive = range_inclusive or [[chain_step, chain_step]]
    b.length = 50
    b.gc_count = 10
    b.subtype = "simple"
    b.chain = 1
    return b


# ---------------------------------------------------------------------------
# Pure / synthetic tests
# ---------------------------------------------------------------------------

class TestSegCentroid:

    def test_valid_segment(self):
        seg = _FakeSegIndex()
        cx, cy = _seg_centroid(1, seg)
        assert cx == 12.0  # (10 + 14) / 2
        assert cy == 7.0   # (5 + 9) / 2

    def test_invalid_segment(self):
        seg = _FakeSegIndex()
        assert _seg_centroid(0, seg) is None  # valid[0] == 0

    def test_oob_segment(self):
        seg = _FakeSegIndex()
        assert _seg_centroid(999, seg) is None


class TestBubbleLayoutSpan:

    def test_returns_max_span(self):
        b = _make_bubble(1, 0, x1=0, x2=10, y1=0, y2=20)
        assert _bubble_layout_span(b) == 20  # y-span > x-span

    def test_reversed_coords(self):
        b = _make_bubble(1, 0, x1=10, x2=0, y1=5, y2=0)
        assert _bubble_layout_span(b) == 10  # abs(0 - 10)


class TestBuildChainPolylineSynthetic:

    def test_empty_chain_returns_none(self):
        chain = Chain(1, [])
        seg = _FakeSegIndex()
        si = type('SI', (), {'starts': array('I', []), 'ends': array('I', [])})()
        assert build_chain_polyline(chain, si, seg) is None

    def test_bubble_t_three_bubbles(self):
        # Distinct positions so arc-length projection gives meaningful t
        b1 = _make_bubble(1, 0, source=[1], sink=[2], x1=0, x2=2, y1=0, y2=1)
        b2 = _make_bubble(2, 1, source=[1], sink=[2], x1=10, x2=12, y1=0, y2=1)
        b3 = _make_bubble(3, 2, source=[1], sink=[2], x1=20, x2=22, y1=0, y2=1)
        chain = Chain(1, [b1, b2, b3])
        seg = _FakeSegIndex()
        si = type('SI', (), {
            'starts': array('I', [100, 200, 300]),
            'ends': array('I', [199, 299, 399]),
        })()
        result = build_chain_polyline(chain, si, seg)
        bt = result["bubble_t"]
        assert len(bt) == 3
        assert bt[0] == 0.0
        assert bt[2] == 1.0
        assert bt[0] < bt[1] < bt[2]


class TestDecomposeChainSynthetic:

    def _make_simple_chain(self):
        """Chain with 3 leaf bubbles using valid segment IDs."""
        bubbles = [
            _make_bubble(1, 0, source=[1], sink=[2], x1=10, x2=14, y1=5, y2=9),
            _make_bubble(2, 1, source=[2], sink=[1], x1=15, x2=19, y1=6, y2=10),
            _make_bubble(3, 2, source=[1], sink=[2], x1=20, x2=24, y1=10, y2=14),
        ]
        return Chain(1, bubbles)

    def _make_indexes(self):
        seg = _FakeSegIndex()
        si = type('SI', (), {
            'starts': array('I', [100, 200, 300]),
            'ends': array('I', [199, 299, 399]),
        })()
        return si, seg

    def test_no_superbubbles_single_chain(self):
        chain = self._make_simple_chain()
        si, seg = self._make_indexes()
        r = decompose_chain(chain, 50, None, None, si, seg, None, depth=0, max_depth=3)
        assert len(r["chains"]) == 1
        assert r["chains"][0]["id"] == "c1"

    def test_max_depth_stops_recursion(self):
        chain = self._make_simple_chain()
        si, seg = self._make_indexes()
        r = decompose_chain(chain, 50, None, None, si, seg, None, depth=5, max_depth=3)
        assert len(r["chains"]) == 1


# ---------------------------------------------------------------------------
# DRB1 integration tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def drb1(drb1_dir):
    gfa = GFAIndex(drb1_dir)
    si = StepIndex(drb1_dir, REFERENCE)
    bi = BubbleIndex(drb1_dir, gfa)
    return gfa, si, bi


@pytest.fixture(scope="module")
def drb1_chains(drb1):
    _, _, bi = drb1
    return bi.get_top_level_bubbles_by_layout(float('-inf'), float('inf'), as_chains=True)


def _find_chain(chains, src_seg):
    """Find a chain by its first bubble's source segment."""
    for c in chains:
        if c.bubbles and src_seg in c.bubbles[0].source_segments:
            return c
    pytest.fail(f"No chain with source seg {src_seg}")


class TestBuildChainPolylineDRB1:

    def test_long_chain_has_required_keys(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 3041)  # chain 18, 193 bubbles
        result = build_chain_polyline(chain, si, gfa.segment_index)
        for key in ("id", "polyline", "length", "n_bubbles", "source_segs",
                    "sink_segs", "bubble_t", "bp_span"):
            assert key in result

    def test_long_chain_rdp_shortens(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 3041)
        result = build_chain_polyline(chain, si, gfa.segment_index)
        assert len(result["polyline"]) < len(chain.bubbles)

    def test_long_chain_bubble_t_range(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 3041)
        result = build_chain_polyline(chain, si, gfa.segment_index)
        assert result["bubble_t"][0] == 0.0
        assert result["bubble_t"][-1] == 1.0

    def test_single_bubble_chain(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 80)  # chain 78, 1 bubble
        result = build_chain_polyline(chain, si, gfa.segment_index)
        assert result is not None
        assert len(result["polyline"]) >= 2
        assert result["n_bubbles"] == 1

    def test_source_sink_match_chain(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 3041)
        result = build_chain_polyline(chain, si, gfa.segment_index)
        assert result["source_segs"] == chain.bubbles[0].source_segments
        assert result["sink_segs"] == chain.bubbles[-1].sink_segments


class TestDecomposeChainDRB1:

    def test_no_decompose_at_high_threshold(self, drb1, drb1_chains):
        """Chain 114 stays as one chain when threshold exceeds all spans."""
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 640)
        r = decompose_chain(chain, 50, None, bi, si, gfa.segment_index, gfa,
                            depth=0, max_depth=3)
        assert len(r["chains"]) == 1

    def test_decompose_at_low_threshold(self, drb1, drb1_chains):
        """Chain 114 decomposes into 24 sub-chains at threshold=1."""
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 640)
        r = decompose_chain(chain, 1, None, bi, si, gfa.segment_index, gfa,
                            depth=0, max_depth=3)
        assert len(r["chains"]) == 24

    def test_decomposed_has_connectors_and_children(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 640)
        r = decompose_chain(chain, 1, None, bi, si, gfa.segment_index, gfa,
                            depth=0, max_depth=3)
        ids = [c["id"] for c in r["chains"]]
        connectors = [i for i in ids if ':' in i]
        children = [i for i in ids if ':' not in i]
        assert len(connectors) > 0
        assert len(children) > 0

    def test_decomposed_has_bypass_segs(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 640)
        r = decompose_chain(chain, 1, None, bi, si, gfa.segment_index, gfa,
                            depth=0, max_depth=3)
        assert len(r.get("bypass_seg_ids", set())) == 41

    def test_result_has_required_keys(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 640)
        r = decompose_chain(chain, 1, None, bi, si, gfa.segment_index, gfa,
                            depth=0, max_depth=3)
        for key in ("chains", "bubbles"):
            assert key in r


class TestFindJunctionGraphDRB1:

    @pytest.fixture(scope="class")
    def junction_result(self, drb1, drb1_chains):
        gfa, si, bi = drb1
        chain = _find_chain(drb1_chains, 640)
        r = decompose_chain(chain, 1, None, bi, si, gfa.segment_index, gfa,
                            depth=0, max_depth=3)
        nodes, links, naked = find_junction_graph(
            r["chains"], gfa, bi, gfa.segment_index)
        return nodes, links

    def test_has_junction_links(self, junction_result):
        _, links = junction_result
        assert len(links) > 0

    def test_junction_links_are_coordinate_pairs(self, junction_result):
        _, links = junction_result
        for link in links:
            # Each link is [coord_a, coord_b, seg_id_a, seg_id_b]
            assert len(link) == 4
            assert len(link[0]) == 2  # [x, y]
            assert len(link[1]) == 2

    def test_no_duplicate_links(self, junction_result):
        _, links = junction_result
        seen = set()
        for link in links:
            key = frozenset([tuple(link[0]), tuple(link[1])])
            assert key not in seen, f"Duplicate junction link: {link}"
            seen.add(key)
