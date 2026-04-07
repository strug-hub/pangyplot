"""Tests for the Path domain object."""

from pangyplot.objects.Path import Path
from pangyplot.objects.Bubble import Bubble


def _make_path(steps=None, sample="SAMPLE", hap="1", start=0):
    p = Path()
    p.full_id = f"{sample}#{hap}"
    p.sample = sample
    p.hap = hap
    p.start = start
    p.length = 100
    if steps:
        for sid, d in steps:
            p.add_step(sid, d)
    return p


# ---------------------------------------------------------------------------
# Basics
# ---------------------------------------------------------------------------

class TestPathBasics:

    def test_sample_name_with_hap(self):
        p = _make_path(sample="HG002", hap="1")
        assert p.sample_name() == "HG002#1"

    def test_sample_name_without_hap(self):
        p = _make_path(sample="HG002", hap=None)
        assert p.sample_name() == "HG002"

    def test_getitem_parses_step(self):
        p = _make_path(steps=[(123, "+"), (456, "-")])
        assert p[0] == (123, "+")
        assert p[1] == (456, "-")

    def test_len(self):
        p = _make_path(steps=[(1, "+"), (2, "+"), (3, "+")])
        assert len(p) == 3

    def test_add_step(self):
        p = _make_path()
        p.add_step(42, "+")
        assert p.path == ["42+"]

    def test_iter(self):
        p = _make_path(steps=[(10, "+"), (20, "-")])
        assert list(p) == [(10, "+"), (20, "-")]


# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------

class TestClone:

    def test_clone_copies_fields(self):
        p = _make_path(steps=[(1, "+"), (2, "+")], sample="X", hap="2")
        c = p.clone()
        assert c.sample == "X"
        assert c.hap == "2"
        assert c.full_id == p.full_id
        assert c.is_ref == p.is_ref
        assert c.path == p.path

    def test_clone_is_independent(self):
        p = _make_path(steps=[(1, "+")])
        c = p.clone()
        c.add_step(2, "+")
        assert len(p) == 1
        assert len(c) == 2

    def test_clone_no_path(self):
        p = _make_path(steps=[(1, "+"), (2, "+")], start=500)
        c = p.clone(no_path=True)
        assert c.path == []
        assert c.start is None
        assert c.length is None
        assert c.sample == p.sample


# ---------------------------------------------------------------------------
# subset_path
# ---------------------------------------------------------------------------

class TestSubsetPath:

    def test_flush_on_gap(self):
        """A subset is flushed when the out-of-range gap exceeds the buffer."""
        # In-range block, then >10 out-of-range steps to trigger flush
        steps = [(i, "+") for i in range(1, 6)]          # in range
        steps += [(100 + i, "+") for i in range(15)]      # out of range, exceeds buffer=10
        steps += [(i, "+") for i in range(6, 11)]         # in range again
        p = _make_path(steps=steps, start=0)
        subsets = p.subset_path(1, 10, buffer=10)
        assert len(subsets) >= 1
        ids = [s[0] for s in subsets[0]]
        assert ids == [1, 2, 3, 4, 5]

    def test_no_flush_without_gap(self):
        """If all steps are in range, nothing is flushed (no gap to trigger it)."""
        p = _make_path(steps=[(5, "+"), (10, "+"), (15, "+")])
        subsets = p.subset_path(5, 15)
        assert subsets == []

    def test_excludes_out_of_range_steps(self):
        """Out-of-range steps are not included in flushed subsets."""
        steps = [(5, "+"), (10, "+")]                      # in range
        steps += [(100 + i, "+") for i in range(15)]       # out of range
        p = _make_path(steps=steps, start=0)
        subsets = p.subset_path(5, 10, buffer=10)
        assert len(subsets) == 1
        ids = [s[0] for s in subsets[0]]
        assert all(5 <= i <= 10 for i in ids)


# ---------------------------------------------------------------------------
# construct_bubble_path
# ---------------------------------------------------------------------------

class TestConstructBubblePath:

    def _make_bubble_index(self):
        """Minimal mock that maps seg 5 → bubble 100, seg 10 → bubble 200."""
        class FakeBubbleIndex:
            def segment_in_bubble(self, sid):
                return {5: 100, 10: 200}.get(sid)
            def parent_of_bubble(self, bid):
                return {200: 300}.get(bid)  # bubble 200 has parent 300
        return FakeBubbleIndex()

    def test_segment_in_bubble(self):
        p = _make_path(steps=[(5, "+")])
        bi = self._make_bubble_index()
        result = p.construct_bubble_path(bi)
        assert len(result) == 1
        assert result[0][0] == "s5+"
        assert result[0][1] == ["b100"]

    def test_segment_not_in_bubble(self):
        p = _make_path(steps=[(1, "+")])
        bi = self._make_bubble_index()
        result = p.construct_bubble_path(bi)
        assert result[0][1] == []

    def test_nested_bubble_chain(self):
        """Seg 10 is in bubble 200 whose parent is 300."""
        p = _make_path(steps=[(10, "-")])
        bi = self._make_bubble_index()
        result = p.construct_bubble_path(bi)
        assert result[0][0] == "s10-"
        assert result[0][1] == ["b200", "b300"]
