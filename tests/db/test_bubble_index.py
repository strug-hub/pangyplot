"""Tests for BubbleIndex using the DRB1-3123 fixture.

Bubble IDs are unstable between runs, so all tests look up bubbles
by their source/sink segments rather than by ID.

Example bubbles (anchored to segments):
  - Simple SNP: source=[11], sink=[17], 2 inside segs of length 1
  - Bigger: source=[382], sink=[369], 8 inside segments
  - Nested: source=[141], sink=[133], child with source=[138], sink=[136]
"""

import pytest


def _find_bubble(bi, seg_a, seg_b):
    """Look up a top-level bubble where seg_a and seg_b are source/sink (either order)."""
    for bid in bi.ids:
        b = bi[bid]
        src, snk = set(b.source_segments), set(b.sink_segments)
        if (seg_a in src and seg_b in snk) or (seg_b in src and seg_a in snk):
            return b
    pytest.fail(f"No bubble with endpoints {seg_a}, {seg_b}")


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------

class TestBubbleIndexProperties:

    def test_top_level_count(self, drb1_bubble_index):
        assert len(drb1_bubble_index.ids) == 583

    def test_step_based_chains(self, drb1_bubble_index, drb1_step_index):
        max_step = len(drb1_step_index.starts) - 1
        chains = drb1_bubble_index.get_top_level_bubbles(0, max_step, as_chains=True)
        assert len(chains) == 23

    def test_layout_based_chains(self, drb1_bubble_index):
        chains = drb1_bubble_index.get_top_level_bubbles_by_layout(
            float('-inf'), float('inf'), as_chains=True)
        assert len(chains) == 34


# ---------------------------------------------------------------------------
# Simple SNP bubble (source=[11], sink=[17])
# ---------------------------------------------------------------------------

class TestSimpleBubble:

    @pytest.fixture
    def snp_bubble(self, drb1_bubble_index):
        return _find_bubble(drb1_bubble_index, 11, 17)

    def test_inside_count(self, snp_bubble):
        assert len(snp_bubble.inside) == 2

    def test_inside_are_short_segments(self, snp_bubble, drb1_gfa_index):
        for sid in snp_bubble.inside:
            assert drb1_gfa_index.segment_length(sid) == 1

    def test_no_children(self, snp_bubble):
        assert len(snp_bubble.children) == 0

    def test_source_sink_differ(self, snp_bubble):
        assert snp_bubble.source_segments != snp_bubble.sink_segments

    def test_inside_excludes_boundary(self, snp_bubble):
        boundary = set(snp_bubble.source_segments) | set(snp_bubble.sink_segments)
        assert boundary.isdisjoint(snp_bubble.inside)


# ---------------------------------------------------------------------------
# Bigger bubble (source=[382], sink=[369], 8 inside)
# ---------------------------------------------------------------------------

class TestBiggerBubble:

    @pytest.fixture
    def big_bubble(self, drb1_bubble_index):
        return _find_bubble(drb1_bubble_index, 382, 369)

    def test_inside_count(self, big_bubble):
        assert len(big_bubble.inside) == 8

    def test_no_children(self, big_bubble):
        assert len(big_bubble.children) == 0

    def test_inside_excludes_boundary(self, big_bubble):
        boundary = set(big_bubble.source_segments) | set(big_bubble.sink_segments)
        assert boundary.isdisjoint(big_bubble.inside)


# ---------------------------------------------------------------------------
# Nested bubble (source=[141], sink=[133], child source=[138] sink=[136])
# ---------------------------------------------------------------------------

class TestNestedBubble:

    @pytest.fixture
    def parent_bubble(self, drb1_bubble_index):
        return _find_bubble(drb1_bubble_index, 141, 133)

    def test_has_children(self, parent_bubble):
        assert len(parent_bubble.children) >= 1

    def test_child_has_expected_segments(self, parent_bubble, drb1_bubble_index):
        for child_id in parent_bubble.children:
            child = drb1_bubble_index[child_id]
            endpoints = set(child.source_segments) | set(child.sink_segments)
            if 138 in endpoints and 136 in endpoints:
                return
        pytest.fail("No child with endpoints 138, 136")

    def test_parent_lookup(self, parent_bubble, drb1_bubble_index):
        child_id = list(parent_bubble.children)[0]
        assert drb1_bubble_index.parent_of_bubble(child_id) == parent_bubble.id

    def test_top_level_has_no_parent(self, parent_bubble, drb1_bubble_index):
        assert drb1_bubble_index.parent_of_bubble(parent_bubble.id) is None

    def test_descendants_exceed_inside(self, parent_bubble, drb1_bubble_index):
        descendants = drb1_bubble_index.get_descendant_ids(parent_bubble)
        assert len(descendants) > len(parent_bubble.inside)

    def test_descendants_include_inside(self, parent_bubble, drb1_bubble_index):
        descendants = drb1_bubble_index.get_descendant_ids(parent_bubble)
        for sid in parent_bubble.inside:
            assert sid in descendants


# ---------------------------------------------------------------------------
# segment_in_bubble
# ---------------------------------------------------------------------------

class TestSegmentInBubble:

    def test_inside_segment_returns_bubble(self, drb1_bubble_index):
        # Seg 12 is inside the SNP bubble (source=[11], sink=[17])
        result = drb1_bubble_index.segment_in_bubble(12, include_boundary=False)
        assert result is not None

    def test_source_segment_excluded_without_boundary(self, drb1_bubble_index):
        # Seg 17 is a source/sink boundary segment
        result = drb1_bubble_index.segment_in_bubble(17, include_boundary=False)
        assert result is None

    def test_source_segment_included_with_boundary(self, drb1_bubble_index):
        result = drb1_bubble_index.segment_in_bubble(17, include_boundary=True)
        assert result is not None

    def test_unknown_segment_returns_none(self, drb1_bubble_index):
        result = drb1_bubble_index.segment_in_bubble(99999, include_boundary=False)
        assert result is None


# ---------------------------------------------------------------------------
# Range queries
# ---------------------------------------------------------------------------

class TestRangeQueries:

    def test_step_range_count(self, drb1_bubble_index):
        bubbles = drb1_bubble_index.get_top_level_bubbles(694, 794)
        assert len(bubbles) == 34

    def test_step_range_bubbles_have_structure(self, drb1_bubble_index):
        bubbles = drb1_bubble_index.get_top_level_bubbles(694, 794)
        for b in bubbles:
            assert len(b.source_segments) > 0
            assert len(b.sink_segments) > 0

    def test_layout_full_range(self, drb1_bubble_index):
        chains = drb1_bubble_index.get_top_level_bubbles_by_layout(
            float('-inf'), float('inf'), as_chains=True)
        assert len(chains) == 34

    def test_layout_superset_of_step(self, drb1_bubble_index, drb1_step_index):
        max_step = len(drb1_step_index.starts) - 1
        step_chains = drb1_bubble_index.get_top_level_bubbles(
            0, max_step, as_chains=True)
        layout_chains = drb1_bubble_index.get_top_level_bubbles_by_layout(
            float('-inf'), float('inf'), as_chains=True)
        step_ids = {c.id for c in step_chains}
        layout_ids = {c.id for c in layout_chains}
        assert step_ids <= layout_ids
