"""Tests for the Bubble domain object."""

from pangyplot.objects.Bubble import Bubble


def _make_bubble(id=1, source=None, sink=None, inside=None,
                 range_inclusive=None, range_exclusive=None,
                 chain_step=0):
    b = Bubble()
    b.id = id
    b.source_segments = source or [10]
    b.sink_segments = sink or [20]
    b.inside = inside or set()
    b.range_inclusive = range_inclusive or []
    b.range_exclusive = range_exclusive or []
    b.chain_step = chain_step
    return b


# ---------------------------------------------------------------------------
# Basics
# ---------------------------------------------------------------------------

class TestBubbleBasics:

    def test_serialized_id(self):
        b = _make_bubble(id=123)
        assert b.get_serialized_id() == "b123"

    def test_get_end_segments(self):
        b = _make_bubble(source=[10, 11], sink=[20])
        assert b.get_end_segments() == [10, 11, 20]

    def test_is_chain_end_true(self):
        b = _make_bubble()
        b.siblings = [None, 5]
        assert b.is_chain_end() is True

    def test_is_chain_end_false(self):
        b = _make_bubble()
        b.siblings = [3, 5]
        assert b.is_chain_end() is False


# ---------------------------------------------------------------------------
# Containment / range queries
# ---------------------------------------------------------------------------

class TestContainment:

    def test_is_contained_within_range(self):
        b = _make_bubble(range_inclusive=[[100, 200]])
        assert b.is_contained(50, 250) is True

    def test_is_contained_outside_range(self):
        b = _make_bubble(range_inclusive=[[100, 200]])
        assert b.is_contained(150, 180) is False

    def test_is_contained_strict(self):
        b = _make_bubble(range_exclusive=[[100, 200]], range_inclusive=[[90, 210]])
        assert b.is_contained(100, 200, strict=True) is True
        assert b.is_contained(90, 210, strict=True) is True
        assert b.is_contained(150, 180, strict=True) is False

    def test_contains_ids(self):
        b = _make_bubble(range_exclusive=[[100, 200]])
        assert b.contains(120, 180) is True
        assert b.contains(50, 300) is False

    def test_contains_inclusive(self):
        b = _make_bubble(range_inclusive=[[100, 200]])
        assert b.contains(120, 180, exclusive=False) is True

    def test_is_ref(self):
        b = _make_bubble(range_inclusive=[[100, 200]])
        assert b.is_ref() is True

    def test_is_not_ref(self):
        b = _make_bubble(range_inclusive=[])
        assert b.is_ref() is False

    def test_has_range(self):
        b = _make_bubble(range_exclusive=[[1, 2]], range_inclusive=[[1, 3]])
        assert b.has_range(exclusive=True) is True
        assert b.has_range(exclusive=False) is True

    def test_has_no_range(self):
        b = _make_bubble()
        assert b.has_range(exclusive=True) is False


# ---------------------------------------------------------------------------
# Siblings
# ---------------------------------------------------------------------------

class TestSiblings:

    def test_add_source_sibling(self):
        b = _make_bubble()
        sib = _make_bubble(id=5)
        b.add_source_sibling(sib)
        assert b.siblings[0] == 5

    def test_add_sink_sibling(self):
        b = _make_bubble()
        sib = _make_bubble(id=7)
        b.add_sink_sibling(sib)
        assert b.siblings[1] == 7

    def test_add_none_sibling_ignored(self):
        b = _make_bubble()
        b.siblings = [None, None]
        b.add_source_sibling(None)
        b.add_sink_sibling(None)
        assert b.siblings == [None, None]

    def test_get_siblings(self):
        b = _make_bubble()
        b.siblings = [3, 5]
        assert b.get_siblings() == [3, 5]
        assert b.get_previous_sibling() == 3
        assert b.get_next_sibling() == 5


# ---------------------------------------------------------------------------
# correct_source_sink
# ---------------------------------------------------------------------------

class TestCorrectSourceSink:

    def test_flips_when_sink_overlaps_prev(self):
        """When sink segments are a subset of prev's endpoints, flip."""
        prev = _make_bubble(id=1, source=[10], sink=[20])
        curr = _make_bubble(id=2, source=[30], sink=[20])
        nxt = _make_bubble(id=3, source=[30], sink=[40])
        # sink=[20] is subset of prev's end_segments [10, 20]
        # source=[30] is subset of nxt's end_segments [30, 40]
        curr.correct_source_sink(prev, nxt)
        # Should flip: source becomes [20], sink becomes [30]
        assert curr.source_segments == [20]
        assert curr.sink_segments == [30]

    def test_no_flip_when_correctly_oriented(self):
        prev = _make_bubble(id=1, source=[10], sink=[20])
        curr = _make_bubble(id=2, source=[20], sink=[30])
        nxt = _make_bubble(id=3, source=[30], sink=[40])
        original_source = curr.source_segments.copy()
        original_sink = curr.sink_segments.copy()
        curr.correct_source_sink(prev, nxt)
        # No flip — source/sink stay the same
        assert curr.source_segments == original_source
        assert curr.sink_segments == original_sink

    def test_chain_start_flip(self):
        """At chain start (prev=None), flip check uses None logic."""
        curr = _make_bubble(id=2, source=[30], sink=[20])
        nxt = _make_bubble(id=3, source=[30], sink=[40])
        # prev=None → shouldFlipSource=True
        # source=[30] subset of nxt's endpoints → shouldFlipSink=True
        curr.correct_source_sink(None, nxt)
        assert curr.source_segments == [20]
        assert curr.sink_segments == [30]
