"""Tests for the Chain domain object."""

from pangyplot.objects.Bubble import Bubble
from pangyplot.objects.Chain import Chain


def _make_bubble(id, chain_step, source_segs=None, sink_segs=None):
    b = Bubble()
    b.id = id
    b.chain_step = chain_step
    b.source_segments = source_segs or [id * 10]
    b.sink_segments = sink_segs or [id * 10 + 1]
    return b


# ---------------------------------------------------------------------------
# Sorting
# ---------------------------------------------------------------------------

class TestChainSort:

    def test_sorts_by_chain_step(self):
        b1 = _make_bubble(1, chain_step=3)
        b2 = _make_bubble(2, chain_step=1)
        b3 = _make_bubble(3, chain_step=2)
        chain = Chain(100, [b1, b2, b3])
        assert [b.id for b in chain.bubbles] == [2, 3, 1]

    def test_single_bubble(self):
        b = _make_bubble(1, chain_step=0)
        chain = Chain(100, [b])
        assert len(chain) == 1
        assert chain[0].id == 1

    def test_empty_chain(self):
        chain = Chain(100, [])
        assert len(chain) == 0


# ---------------------------------------------------------------------------
# Sibling assignment
# ---------------------------------------------------------------------------

class TestAssignSiblings:

    def test_first_bubble_source_sibling_none(self):
        b1 = _make_bubble(1, chain_step=0)
        b2 = _make_bubble(2, chain_step=1)
        Chain(100, [b1, b2])
        assert b1.siblings[0] is None

    def test_last_bubble_sink_sibling_none(self):
        b1 = _make_bubble(1, chain_step=0)
        b2 = _make_bubble(2, chain_step=1)
        Chain(100, [b1, b2])
        assert b2.siblings[1] is None

    def test_middle_bubble_has_both_siblings(self):
        b1 = _make_bubble(1, chain_step=0)
        b2 = _make_bubble(2, chain_step=1)
        b3 = _make_bubble(3, chain_step=2)
        Chain(100, [b1, b2, b3])
        assert b2.siblings[0] == 1
        assert b2.siblings[1] == 3


# ---------------------------------------------------------------------------
# chain_step_range
# ---------------------------------------------------------------------------

class TestChainStepRange:

    def test_returns_first_and_last_step(self):
        b1 = _make_bubble(1, chain_step=5)
        b2 = _make_bubble(2, chain_step=10)
        b3 = _make_bubble(3, chain_step=20)
        chain = Chain(100, [b1, b2, b3])
        assert chain.chain_step_range() == (5, 20)

    def test_empty_chain(self):
        chain = Chain(100, [])
        assert chain.chain_step_range() == (None, None)


# ---------------------------------------------------------------------------
# get_internal_segment_ids
# ---------------------------------------------------------------------------

class TestGetInternalSegmentIds:

    def test_collects_sink_segments(self):
        b1 = _make_bubble(1, chain_step=0, source_segs=[10], sink_segs=[11])
        b2 = _make_bubble(2, chain_step=1, source_segs=[20], sink_segs=[21])
        b3 = _make_bubble(3, chain_step=2, source_segs=[30], sink_segs=[31])
        chain = Chain(100, [b1, b2, b3])
        # Sink segs of all but last: b1.sink=[11], b2.sink=[21]
        ids = chain.get_internal_segment_ids(include_ends=False)
        assert 11 in ids
        assert 21 in ids
        assert 31 not in ids

    def test_include_ends(self):
        b1 = _make_bubble(1, chain_step=0, source_segs=[10], sink_segs=[11])
        b2 = _make_bubble(2, chain_step=1, source_segs=[20], sink_segs=[21])
        chain = Chain(100, [b1, b2])
        ids = chain.get_internal_segment_ids(include_ends=True)
        assert 10 in ids  # source of first
        assert 21 in ids  # sink of last
        assert 11 in ids  # internal sink

    def test_as_set(self):
        b1 = _make_bubble(1, chain_step=0, source_segs=[10], sink_segs=[11])
        b2 = _make_bubble(2, chain_step=1, source_segs=[20], sink_segs=[21])
        chain = Chain(100, [b1, b2])
        result = chain.get_internal_segment_ids(as_set=True)
        assert isinstance(result, set)


# ---------------------------------------------------------------------------
# Source/sink bubble accessors
# ---------------------------------------------------------------------------

class TestChainAccessors:

    def test_source_and_sink_bubble(self):
        b1 = _make_bubble(1, chain_step=0)
        b2 = _make_bubble(2, chain_step=5)
        chain = Chain(100, [b2, b1])  # deliberately unsorted
        assert chain.source_bubble().id == 1  # sorted to first
        assert chain.sink_bubble().id == 2

    def test_empty_chain_accessors(self):
        chain = Chain(100, [])
        assert chain.source_bubble() is None
        assert chain.sink_bubble() is None
