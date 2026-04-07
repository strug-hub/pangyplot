"""Tests for GFAIndex using the DRB1-3123 fixture.

Two complementary example segments:
  - Segment 1: graph start node, forward-only (no backward links), length 722
  - Segment 2: mid-graph junction, 2 forward + 2 backward neighbors, length 10
"""

import pytest


# ---------------------------------------------------------------------------
# get_neighbors
# ---------------------------------------------------------------------------

class TestGetNeighbors:

    def test_seg1_has_two_neighbors(self, drb1_gfa_index):
        assert sorted(drb1_gfa_index.get_neighbors(1)) == [76, 77]

    def test_seg1_forward_only(self, drb1_gfa_index):
        assert sorted(drb1_gfa_index.get_neighbors(1, '+')) == [76, 77]
        assert drb1_gfa_index.get_neighbors(1, '-') == []

    def test_seg2_bidirectional(self, drb1_gfa_index):
        assert sorted(drb1_gfa_index.get_neighbors(2, '+')) == [3, 4]
        assert sorted(drb1_gfa_index.get_neighbors(2, '-')) == [5, 6]

    def test_seg2_all_neighbors(self, drb1_gfa_index):
        all_nbrs = sorted(drb1_gfa_index.get_neighbors(2))
        assert all_nbrs == [3, 4, 5, 6]

    def test_negative_seg_id(self, drb1_gfa_index):
        assert drb1_gfa_index.get_neighbors(-1) == []

    def test_out_of_bounds_seg_id(self, drb1_gfa_index):
        big_id = drb1_gfa_index.max_segment_id() + 100
        assert drb1_gfa_index.get_neighbors(big_id) == []

    def test_neighbors_are_linked(self, drb1_gfa_index):
        """Every reported neighbor of seg 2 should have a link back to seg 2."""
        for nbr in drb1_gfa_index.get_neighbors(2):
            nbr_neighbors = drb1_gfa_index.get_neighbors(nbr)
            assert 2 in nbr_neighbors, (
                f"Segment {nbr} is a neighbor of 2 but 2 is not a neighbor of {nbr}")


# ---------------------------------------------------------------------------
# bfs
# ---------------------------------------------------------------------------

class TestBFS:

    def test_zero_steps_returns_start(self, drb1_gfa_index):
        assert drb1_gfa_index.bfs(1, 0) == {1}

    def test_seg1_two_hops(self, drb1_gfa_index):
        assert drb1_gfa_index.bfs(1, 2) == {1, 76, 77, 78}

    def test_seg2_two_hops(self, drb1_gfa_index):
        assert drb1_gfa_index.bfs(2, 2) == {2, 3, 4, 5, 6, 7, 11}

    def test_monotonic_growth(self, drb1_gfa_index):
        bfs1 = drb1_gfa_index.bfs(1, 1)
        bfs2 = drb1_gfa_index.bfs(1, 2)
        bfs3 = drb1_gfa_index.bfs(1, 3)
        assert bfs1 <= bfs2 <= bfs3

    def test_start_always_included(self, drb1_gfa_index):
        for steps in range(4):
            assert 2 in drb1_gfa_index.bfs(2, steps)


# ---------------------------------------------------------------------------
# traverse (greedy, always takes first neighbor)
# ---------------------------------------------------------------------------

class TestTraverse:

    def test_seg1_forward(self, drb1_gfa_index):
        path = drb1_gfa_index.traverse(1, max_steps=5, direction='+')
        assert path == [1, 76, 78, 79, 84, 83]

    def test_seg1_backward_is_dead_end(self, drb1_gfa_index):
        path = drb1_gfa_index.traverse(1, max_steps=5, direction='-')
        assert path == [1]

    def test_seg2_forward(self, drb1_gfa_index):
        path = drb1_gfa_index.traverse(2, max_steps=5, direction='+')
        assert path == [2, 3, 7, 8, 10, 14]

    def test_seg2_backward(self, drb1_gfa_index):
        path = drb1_gfa_index.traverse(2, max_steps=5, direction='-')
        assert path == [2, 5, 11, 12, 17, 18]

    def test_path_length_bounded(self, drb1_gfa_index):
        for steps in [1, 3, 10]:
            path = drb1_gfa_index.traverse(1, max_steps=steps)
            assert len(path) <= steps + 1

    def test_consecutive_pairs_linked(self, drb1_gfa_index):
        """Each consecutive pair in a traversal should share a link."""
        path = drb1_gfa_index.traverse(2, max_steps=5)
        for i in range(len(path) - 1):
            nbrs = drb1_gfa_index.get_neighbors(path[i])
            assert path[i + 1] in nbrs, (
                f"No link from {path[i]} to {path[i+1]}")


# ---------------------------------------------------------------------------
# get_subgraph
# ---------------------------------------------------------------------------

class TestGetSubgraph:

    def test_returns_correct_segments(self, drb1_gfa_index):
        ids = {1, 76, 77}
        segments, links = drb1_gfa_index.get_subgraph(ids, step_index=None)
        returned_ids = {s.id for s in segments}
        assert returned_ids == ids

    def test_links_connect_included_segments(self, drb1_gfa_index):
        ids = {1, 76, 77, 78}
        segments, links = drb1_gfa_index.get_subgraph(ids, step_index=None)
        for link in links:
            assert link.from_id in ids or link.to_id in ids

    def test_fast_mode_same_topology(self, drb1_gfa_index):
        ids = {2, 3, 4, 5, 6}
        _, links_regular = drb1_gfa_index.get_subgraph(ids, step_index=None, fast=False)
        _, links_fast = drb1_gfa_index.get_subgraph(ids, step_index=None, fast=True)
        regular_pairs = {(l.from_id, l.to_id) for l in links_regular}
        fast_pairs = {(l.from_id, l.to_id) for l in links_fast}
        assert regular_pairs == fast_pairs

    def test_empty_input(self, drb1_gfa_index):
        segments, links = drb1_gfa_index.get_subgraph(set(), step_index=None)
        assert segments == []
        assert links == []
