"""Tests for the dyadic floor-snap cascade (skeleton_geometry, skeleton_pipeline).

The cascade builds the finest level from the skeleton once, then derives each
coarser level from the previous. It must produce exactly what a per-level
rebuild (floor-snap each cell from the original) produces — that equivalence is
the whole reason the cascade is a valid optimization.
"""

import math

import numpy as np
import pytest

from pangyplot.preprocess.skeleton import skeleton_geometry as geo
from pangyplot.preprocess.skeleton.skeleton_geometry import (
    grid_simplify_cascade, _finest_edge_hist, _trace_edge_hist, _floor_snap)
from pangyplot.preprocess.skeleton import skeleton_pipeline as sp


DYADIC = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600]


def _synth_polylines(seed=0, n=60):
    rng = np.random.default_rng(seed)
    pls, cids = [], []
    for _ in range(n):
        m = int(rng.integers(2, 30))
        x, y = rng.uniform(0, 80000), rng.uniform(0, 80000)
        pts = [(x, y)]
        for _ in range(m - 1):
            x += rng.uniform(-1200, 1200)
            y += rng.uniform(-1200, 1200)
            pts.append((x, y))
        pls.append(pts)
        cids.append(int(rng.integers(-1, 40)))
    return pls, cids


def _rebuild_level(polylines, cell, chain_ids):
    """Independent per-level floor-snap rebuild (no cascade) for comparison."""
    hist = _finest_edge_hist(polylines, cell, chain_ids)
    return _trace_edge_hist(hist, chain_ids is not None)


class TestFloorSnap:

    def test_snaps_to_lower_left_multiple(self):
        assert _floor_snap(150, 299, 100) == (100, 200)
        assert _floor_snap(-1, -1, 100) == (-100, -100)
        assert _floor_snap(0, 0, 100) == (0, 0)

    def test_nested_grids_are_exact(self):
        # floor to C then to 2C equals floor straight to 2C (dyadic nesting)
        for v in range(-1000, 1000, 7):
            once = math.floor(v / 200) * 200
            twice = math.floor((math.floor(v / 100) * 100) / 200) * 200
            assert once == twice


class TestCascadeExactness:

    @pytest.mark.parametrize("seed", [0, 1, 2, 7])
    def test_cascade_equals_per_level_rebuild(self, seed):
        polylines, chain_ids = _synth_polylines(seed=seed)
        cascade = grid_simplify_cascade(polylines, DYADIC, chain_ids=chain_ids)
        assert [c for c, _, _ in cascade] == DYADIC
        for cell, casc_pls, casc_cids in cascade:
            reb_pls, reb_cids = _rebuild_level(polylines, cell, chain_ids)
            # same polylines (as sets of edge-tuples; trace order may differ)
            assert _edgeset(casc_pls) == _edgeset(reb_pls)
            # same chain label per identical polyline
            assert _labelled(casc_pls, casc_cids) == _labelled(reb_pls, reb_cids)

    def test_coords_are_multiples_of_cell(self):
        polylines, chain_ids = _synth_polylines(seed=3)
        for cell, pls, _ in grid_simplify_cascade(polylines, DYADIC,
                                                  chain_ids=chain_ids):
            for pl in pls:
                for x, y in pl:
                    assert x % cell == 0 and y % cell == 0

    def test_coarser_levels_simplify(self):
        polylines, chain_ids = _synth_polylines(seed=1)
        cascade = grid_simplify_cascade(polylines, DYADIC, chain_ids=chain_ids)
        # edge count is the true simplification metric (point totals double-count
        # shared junctions); coarsening only drops/merges edges, never adds.
        edges = [len(_edgeset(pls)) for _, pls, _ in cascade]
        assert all(a >= b for a, b in zip(edges, edges[1:]))


def _edgeset(polylines):
    """Set of canonical edges across all polylines — geometry independent of
    trace direction / polyline splitting."""
    edges = set()
    for pl in polylines:
        for a, b in zip(pl, pl[1:]):
            edges.add((a, b) if a <= b else (b, a))
    return edges


def _labelled(polylines, chain_ids):
    """Map each canonical edge to the chain label of its polyline. Cascade and
    rebuild trace into the same polylines, so per-edge labels must agree."""
    out = {}
    for pl, cid in zip(polylines, chain_ids):
        for a, b in zip(pl, pl[1:]):
            out[(a, b) if a <= b else (b, a)] = cid
    return out


class TestDyadicLadder:

    def test_default_ladder_is_dyadic(self):
        s = sp.VIEWER_GRID_SIZES
        assert all(b == 2 * a for a, b in zip(s, s[1:]))

    def test_compute_grid_sizes_stays_dyadic(self):
        # small extent -> finer levels prepended, still each 2x the previous
        class _Seg:
            valid = np.array([True, True])
            x1 = np.array([0.0, 300.0]); x2 = np.array([50.0, 350.0])
            y1 = np.array([0.0, 120.0]); y2 = np.array([40.0, 160.0])
            def __len__(self): return 2
        sizes = sp.compute_grid_sizes(_Seg())
        assert sizes[-len(sp.VIEWER_GRID_SIZES):] == sp.VIEWER_GRID_SIZES
        assert all(b == 2 * a for a, b in zip(sizes, sizes[1:]))
        assert all(float(x).is_integer() for x in sizes)
