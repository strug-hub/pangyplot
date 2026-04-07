"""Tests for LinkIndex using the DRB1-3123 fixture."""

import os
import pytest

from pangyplot.db.indexes.LinkIndex import LinkIndex


# ---------------------------------------------------------------------------
# Basic properties
# ---------------------------------------------------------------------------

class TestLinkIndexProperties:

    def test_length(self, drb1_link_index):
        assert len(drb1_link_index) == 4380

    def test_from_to_arrays_same_length(self, drb1_link_index):
        li = drb1_link_index
        assert len(li.from_ids) == len(li.to_ids)

    def test_strand_arrays_same_length(self, drb1_link_index):
        li = drb1_link_index
        assert len(li.from_strands) == len(li.to_strands) == len(li.from_ids)

    def test_strands_are_binary(self, drb1_link_index):
        li = drb1_link_index
        for i in range(len(li.from_ids)):
            assert li.from_strands[i] in (0, 1)
            assert li.to_strands[i] in (0, 1)


# ---------------------------------------------------------------------------
# Segment-to-link mapping
# ---------------------------------------------------------------------------

class TestLinksBySegment:

    def _segment_with_links(self, li):
        """Find a segment ID that has at least one link."""
        for sid in range(len(li.seg_index_offsets)):
            if li.seg_index_counts[sid] > 0:
                return sid
        pytest.fail("No segment with links found")

    def test_returns_links_for_connected_segment(self, drb1_link_index):
        sid = self._segment_with_links(drb1_link_index)
        links = drb1_link_index.get_links_by_segment(sid)
        assert len(links) > 0

    def test_returned_links_involve_segment(self, drb1_link_index):
        sid = self._segment_with_links(drb1_link_index)
        links = drb1_link_index.get_links_by_segment(sid)
        for link in links:
            assert link.from_id == sid or link.to_id == sid, (
                f"Link {link.from_id}->{link.to_id} does not involve segment {sid}")

    def test_negative_seg_id(self, drb1_link_index):
        assert drb1_link_index.get_links_by_segment(-1) == []

    def test_out_of_bounds_seg_id(self, drb1_link_index):
        big_id = len(drb1_link_index.seg_index_offsets) + 100
        assert drb1_link_index.get_links_by_segment(big_id) == []


# ---------------------------------------------------------------------------
# Fast path (in-memory only)
# ---------------------------------------------------------------------------

class TestLinksFastPath:

    def _segment_with_links(self, li):
        for sid in range(len(li.seg_index_offsets)):
            if li.seg_index_counts[sid] > 0:
                return sid
        pytest.fail("No segment with links found")

    def test_fast_link_has_from_to(self, drb1_link_index):
        link = drb1_link_index.get_link_by_index_fast(0)
        assert hasattr(link, 'from_id')
        assert hasattr(link, 'to_id')
        assert link.from_id == drb1_link_index.from_ids[0]
        assert link.to_id == drb1_link_index.to_ids[0]

    def test_fast_link_has_strands(self, drb1_link_index):
        link = drb1_link_index.get_link_by_index_fast(0)
        assert link.from_strand in ('+', '-')
        assert link.to_strand in ('+', '-')

    def test_fast_by_segment_matches_count(self, drb1_link_index):
        sid = self._segment_with_links(drb1_link_index)
        fast = drb1_link_index.get_links_by_segment_fast(sid)
        regular = drb1_link_index.get_links_by_segment(sid)
        assert len(fast) == len(regular)

    def test_fast_by_segment_same_topology(self, drb1_link_index):
        """Fast and regular return the same from/to pairs."""
        sid = self._segment_with_links(drb1_link_index)
        fast = drb1_link_index.get_links_by_segment_fast(sid)
        regular = drb1_link_index.get_links_by_segment(sid)
        fast_pairs = {(l.from_id, l.to_id) for l in fast}
        regular_pairs = {(l.from_id, l.to_id) for l in regular}
        assert fast_pairs == regular_pairs

    def test_fast_out_of_bounds(self, drb1_link_index):
        big_id = len(drb1_link_index.seg_index_offsets) + 100
        assert drb1_link_index.get_links_by_segment_fast(big_id) == []


# ---------------------------------------------------------------------------
# Tuple lookup
# ---------------------------------------------------------------------------

class TestLinkTupleLookup:

    def test_existing_link(self, drb1_link_index):
        li = drb1_link_index
        from_id = int(li.from_ids[0])
        to_id = int(li.to_ids[0])
        results = li[(from_id, to_id)]
        assert len(results) >= 1
        assert results[0].from_id == from_id
        assert results[0].to_id == to_id

    def test_nonexistent_link(self, drb1_link_index):
        # Two segment IDs that are extremely unlikely to be linked
        results = drb1_link_index[(0, 0)]
        assert results == []

    def test_int_key_returns_links(self, drb1_link_index):
        li = drb1_link_index
        sid = int(li.from_ids[0])
        results = li[sid]
        assert len(results) > 0


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

class TestLinkIndexSerialization:

    def test_serialize_has_expected_keys(self, drb1_link_index):
        data = drb1_link_index.serialize()
        expected = {"from_ids", "to_ids", "from_strands", "to_strands",
                    "seg_index_offsets", "seg_index_counts", "seg_index_flat"}
        assert set(data.keys()) == expected

    def test_mmap_roundtrip(self, drb1_dir):
        li1 = LinkIndex(drb1_dir)
        assert len(li1) == 4380

        mmap_dir = os.path.join(drb1_dir, "links.mmapindex")
        assert os.path.isdir(mmap_dir)

        li2 = LinkIndex(drb1_dir)
        assert len(li2) == len(li1)
