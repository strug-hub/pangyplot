"""Tests for skeleton geometry simplification algorithms."""

import math
import pytest

from pangyplot.preprocess.skeleton.skeleton_geometry import (
    _perpendicular_distance,
    grid_simplify,
    rdp_simplify,
)


# ---------------------------------------------------------------------------
# _perpendicular_distance
# ---------------------------------------------------------------------------

class TestPerpendicularDistance:

    def test_point_on_line_returns_zero(self):
        assert _perpendicular_distance((0.5, 0), (0, 0), (1, 0)) == 0.0

    def test_point_above_horizontal_line(self):
        assert math.isclose(
            _perpendicular_distance((0.5, 3), (0, 0), (1, 0)), 3.0)

    def test_point_above_vertical_line(self):
        assert math.isclose(
            _perpendicular_distance((4, 0.5), (0, 0), (0, 1)), 4.0)

    def test_degenerate_line_returns_euclidean(self):
        """When start == end, returns distance to that point."""
        assert math.isclose(
            _perpendicular_distance((3, 4), (0, 0), (0, 0)), 5.0)

    def test_point_beyond_segment_start(self):
        """Projection clamps to t=0, so distance is to start."""
        assert math.isclose(
            _perpendicular_distance((-1, 0), (0, 0), (2, 0)), 1.0)

    def test_point_beyond_segment_end(self):
        """Projection clamps to t=1, so distance is to end."""
        assert math.isclose(
            _perpendicular_distance((3, 0), (0, 0), (2, 0)), 1.0)

    def test_collinear_point_past_end(self):
        """A collinear point beyond the segment end gets distance to end."""
        assert math.isclose(
            _perpendicular_distance((5, 0), (0, 0), (3, 0)), 2.0)

    def test_diagonal_line(self):
        # Point (1, 0) to line (0,0)→(1,1): perpendicular distance = sqrt(2)/2
        assert math.isclose(
            _perpendicular_distance((1, 0), (0, 0), (1, 1)),
            math.sqrt(2) / 2)


# ---------------------------------------------------------------------------
# rdp_simplify
# ---------------------------------------------------------------------------

class TestRdpSimplify:

    def test_single_point(self):
        assert rdp_simplify([(0, 0)], 1.0) == [(0, 0)]

    def test_two_points(self):
        line = [(0, 0), (10, 10)]
        assert rdp_simplify(line, 1.0) == line

    def test_collinear_reduces_to_endpoints(self):
        line = [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)]
        assert rdp_simplify(line, 0.1) == [(0, 0), (4, 0)]

    def test_l_shape_preserves_corner(self):
        line = [(0, 0), (5, 0), (5, 5)]
        result = rdp_simplify(line, 0.1)
        assert result == [(0, 0), (5, 0), (5, 5)]

    def test_large_epsilon_flattens(self):
        line = [(0, 0), (1, 5), (2, -5), (3, 5), (4, 0)]
        result = rdp_simplify(line, 100.0)
        assert result == [(0, 0), (4, 0)]

    def test_epsilon_zero_keeps_noncollinear(self):
        """Epsilon=0 keeps all points with nonzero distance from the line."""
        line = [(0, 0), (1, 1), (2, 3), (3, 2), (4, 0)]
        result = rdp_simplify(line, 0.0)
        assert result == line

    def test_zigzag(self):
        # Zigzag: points alternate above/below x-axis by amplitude 2
        line = [(i, 2 * ((-1) ** i)) for i in range(10)]
        result = rdp_simplify(line, 1.0)
        # All zigzag points deviate by 2 from the start→end line,
        # which exceeds epsilon=1, so most points should be kept
        assert len(result) > 2
        # Endpoints always preserved
        assert result[0] == line[0]
        assert result[-1] == line[-1]

    def test_result_is_subset_of_input(self):
        line = [(0, 0), (1, 2), (2, 0.5), (3, 3), (4, 1), (5, 0)]
        result = rdp_simplify(line, 0.5)
        for pt in result:
            assert pt in line


# ---------------------------------------------------------------------------
# grid_simplify
# ---------------------------------------------------------------------------

class TestGridSimplify:

    def test_basic_snapping(self):
        polylines = [[(0.3, 0.7), (10.2, 10.4)]]
        result = grid_simplify(polylines, 1.0)
        assert result == [[(0.0, 1.0), (10.0, 10.0)]]

    def test_consecutive_duplicates_removed(self):
        # Two points that snap to the same cell followed by a distinct one
        polylines = [[(0.1, 0.1), (0.2, 0.2), (10.0, 10.0)]]
        result = grid_simplify(polylines, 1.0)
        assert result == [[(0.0, 0.0), (10.0, 10.0)]]

    def test_collapsed_polyline_removed(self):
        # All points snap to the same cell
        polylines = [[(0.1, 0.1), (0.2, 0.2), (0.3, 0.3)]]
        result = grid_simplify(polylines, 1.0)
        assert result == []

    def test_without_chain_ids_returns_list(self):
        polylines = [[(0, 0), (10, 10)]]
        result = grid_simplify(polylines, 1.0)
        assert isinstance(result, list)

    def test_with_chain_ids_returns_tuple(self):
        polylines = [[(0, 0), (10, 10)]]
        result = grid_simplify(polylines, 1.0, chain_ids=[42])
        assert isinstance(result, tuple)
        assert len(result) == 2
        pls, ids = result
        assert pls == [[(0, 0), (10, 10)]]
        assert ids == [42]

    def test_chain_ids_filtered_in_sync(self):
        polylines = [
            [(0.1, 0.1), (0.2, 0.2)],   # collapses → removed
            [(0, 0), (100, 100)],          # survives
            [(0.3, 0.3), (0.4, 0.4)],     # collapses → removed
        ]
        pls, ids = grid_simplify(polylines, 1.0, chain_ids=[10, 20, 30])
        assert len(pls) == 1
        assert ids == [20]

    def test_empty_input(self):
        assert grid_simplify([], 1.0) == []

    def test_empty_input_with_chain_ids(self):
        pls, ids = grid_simplify([], 1.0, chain_ids=[])
        assert pls == []
        assert ids == []

    def test_large_cell_size(self):
        polylines = [[(5, 5), (15, 5), (25, 5)]]
        result = grid_simplify(polylines, 100.0)
        # All snap to (0, 0) → collapses
        assert result == []

    def test_multiple_polylines_mixed(self):
        polylines = [
            [(0, 0), (50, 50)],           # survives
            [(1, 1), (2, 2)],             # collapses at cell_size=10
            [(100, 0), (100, 100)],        # survives
        ]
        result = grid_simplify(polylines, 10.0)
        assert len(result) == 2
        assert result[0] == [(0, 0), (50, 50)]
        assert result[1] == [(100, 0), (100, 100)]


# ---------------------------------------------------------------------------
# Real data: DRB1 fixture
# ---------------------------------------------------------------------------

class TestDRB1Simplification:
    """Run simplification on real polylines built from DRB1 chain centroids."""

    REFERENCE = "gi|568815592"

    @pytest.fixture(scope="class")
    def drb1_polylines(self, fixtures_dir, tmp_path_factory):
        """Build the DRB1 pipeline and extract polylines from chain centroids."""
        import tempfile
        import shutil
        from pangyplot.preprocess.parser.parse_gfa import parse_gfa
        from pangyplot.preprocess.parser.parse_layout import parse_layout
        import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
        from pangyplot.db.indexes.GFAIndex import GFAIndex
        from pangyplot.db.indexes.StepIndex import StepIndex
        from pangyplot.db.indexes.BubbleIndex import BubbleIndex

        tmpdir = tempfile.mkdtemp()
        gfa_path = str(fixtures_dir / "DRB1-3123.gfa")
        layout_path = str(fixtures_dir / "DRB1-3123.lay.tsv")
        layout_coords = parse_layout(layout_path)

        path_idx, segment_idx, link_idx = parse_gfa(
            gfa_file=gfa_path, ref=self.REFERENCE, path=None,
            ref_offset=0, path_sep=None,
            layout_coords=layout_coords, dir=tmpdir,
        )
        bubble_gun.shoot(segment_idx, link_idx, tmpdir, self.REFERENCE)

        gfa_index = GFAIndex(tmpdir)
        bubble_index = BubbleIndex(tmpdir, gfa_index)

        polylines = []
        chain_ids = []
        for chain in bubble_index.get_top_level_bubbles_by_layout(
                float('-inf'), float('inf'), as_chains=True):
            pts = []
            for bubble in chain.bubbles:
                for seg_id in bubble.source_segments:
                    if seg_id < len(segment_idx.x1) and segment_idx.valid[seg_id]:
                        cx = (segment_idx.x1[seg_id] + segment_idx.x2[seg_id]) / 2
                        cy = (segment_idx.y1[seg_id] + segment_idx.y2[seg_id]) / 2
                        pts.append((cx, cy))
                        break
            if len(pts) >= 2:
                polylines.append(pts)
                chain_ids.append(chain.id)

        yield polylines, chain_ids
        shutil.rmtree(tmpdir)

    def test_has_polylines(self, drb1_polylines):
        polylines, _ = drb1_polylines
        assert len(polylines) > 0

    def test_rdp_reduces_point_count(self, drb1_polylines):
        polylines, _ = drb1_polylines
        total_before = sum(len(pl) for pl in polylines)
        total_after = sum(len(rdp_simplify(pl, 1.0)) for pl in polylines)
        assert total_after <= total_before

    def test_rdp_preserves_endpoints(self, drb1_polylines):
        polylines, _ = drb1_polylines
        for pl in polylines:
            result = rdp_simplify(pl, 1.0)
            assert result[0] == pl[0]
            assert result[-1] == pl[-1]

    def test_grid_simplify_reduces_polylines(self, drb1_polylines):
        polylines, chain_ids = drb1_polylines
        result_pls, result_ids = grid_simplify(
            polylines, 50.0, chain_ids=chain_ids)
        assert len(result_pls) <= len(polylines)
        assert len(result_pls) == len(result_ids)

    def test_grid_coarser_produces_fewer(self, drb1_polylines):
        polylines, _ = drb1_polylines
        fine = grid_simplify(polylines, 10.0)
        coarse = grid_simplify(polylines, 100.0)
        fine_pts = sum(len(pl) for pl in fine)
        coarse_pts = sum(len(pl) for pl in coarse)
        assert coarse_pts <= fine_pts
