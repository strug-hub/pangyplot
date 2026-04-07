"""Tests for PolychainIndex using the DRB1-3123 fixture.

DRB1 has 34 layout-based chains. The PolychainIndex precomputes chain
decompositions and stores them as gzipped JSON files with mmap'd lookup arrays.
"""

import os

import pytest

from pangyplot.db.indexes.PolychainIndex import PolychainIndex, MMAP_DIR, DECOMP_DIR


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------

class TestPolychainIndexProperties:

    def test_chain_count(self, drb1_polychain_index):
        assert len(drb1_polychain_index.chain_ids) == 34

    def test_chain_x1_sorted(self, drb1_polychain_index):
        x1 = drb1_polychain_index.chain_x1
        for i in range(1, len(x1)):
            assert x1[i] >= x1[i - 1]

    def test_prefix_max_non_decreasing(self, drb1_polychain_index):
        pm = drb1_polychain_index.prefix_max_x2
        for i in range(1, len(pm)):
            assert pm[i] >= pm[i - 1]

    def test_arrays_same_length(self, drb1_polychain_index):
        pi = drb1_polychain_index
        n = len(pi.chain_ids)
        assert len(pi.chain_x1) == n
        assert len(pi.chain_x2) == n
        assert len(pi.prefix_max_x2) == n


# ---------------------------------------------------------------------------
# get_decomposition
# ---------------------------------------------------------------------------

class TestGetDecomposition:

    def test_valid_chain_returns_dict(self, drb1_polychain_index):
        chain_id = int(drb1_polychain_index.chain_ids[0])
        decomp = drb1_polychain_index.get_decomposition(chain_id)
        assert decomp is not None
        for key in ("chains", "bubbles", "adjacency"):
            assert key in decomp

    def test_sub_chains_have_polylines(self, drb1_polychain_index):
        chain_id = int(drb1_polychain_index.chain_ids[0])
        decomp = drb1_polychain_index.get_decomposition(chain_id)
        for cd in decomp["chains"]:
            pl = cd.get("polyline", [])
            assert len(pl) >= 2, f"Chain {cd['id']} has polyline with < 2 points"

    def test_invalid_chain_returns_none(self, drb1_polychain_index):
        assert drb1_polychain_index.get_decomposition(999999) is None

    def test_shallow_copy(self, drb1_polychain_index):
        chain_id = int(drb1_polychain_index.chain_ids[0])
        d1 = drb1_polychain_index.get_decomposition(chain_id)
        d2 = drb1_polychain_index.get_decomposition(chain_id)
        # Different dict objects
        assert d1 is not d2
        assert d1["chains"] is not d2["chains"]
        # But same data
        assert len(d1["chains"]) == len(d2["chains"])


# ---------------------------------------------------------------------------
# get_chains_in_layout_range
# ---------------------------------------------------------------------------

class TestGetChainsInLayoutRange:

    def test_full_range_returns_all(self, drb1_polychain_index):
        result = drb1_polychain_index.get_chains_in_layout_range(
            float('-inf'), float('inf'))
        # Should return sub-chains from all 34 top-level chains
        assert len(result["chains"]) > 0

    def test_narrow_range_returns_fewer(self, drb1_polychain_index):
        full = drb1_polychain_index.get_chains_in_layout_range(
            float('-inf'), float('inf'))
        # Use the midpoint of the layout range
        x1 = drb1_polychain_index.chain_x1
        mid = (float(x1[0]) + float(x1[-1])) / 2
        span = float(x1[-1]) - float(x1[0])
        narrow = drb1_polychain_index.get_chains_in_layout_range(
            mid - span * 0.1, mid + span * 0.1)
        assert len(narrow["chains"]) < len(full["chains"])

    def test_empty_range(self, drb1_polychain_index):
        # Query far outside any chain's layout range
        result = drb1_polychain_index.get_chains_in_layout_range(
            -1e9, -1e9 + 1)
        assert result["chains"] == []

    def test_result_has_merge_keys(self, drb1_polychain_index):
        result = drb1_polychain_index.get_chains_in_layout_range(
            float('-inf'), float('inf'))
        for key in ("chains", "bubbles", "adjacency", "bypass_links",
                    "bypass_seg_ids", "bypass_gfa_links", "decomposed_bubbles"):
            assert key in result

    def test_returned_chains_overlap_range(self, drb1_polychain_index):
        x1 = drb1_polychain_index.chain_x1
        mid = (float(x1[0]) + float(x1[-1])) / 2
        span = float(x1[-1]) - float(x1[0])
        qmin = mid - span * 0.1
        qmax = mid + span * 0.1
        result = drb1_polychain_index.get_chains_in_layout_range(qmin, qmax)
        for cd in result["chains"]:
            pl_min = cd.get("_pl_x_min")
            pl_max = cd.get("_pl_x_max")
            if pl_min is not None and pl_max is not None:
                assert pl_max >= qmin and pl_min <= qmax, (
                    f"Chain {cd['id']} polyline [{pl_min}, {pl_max}] "
                    f"outside query [{qmin}, {qmax}]")


# ---------------------------------------------------------------------------
# Mmap roundtrip
# ---------------------------------------------------------------------------

class TestMmapRoundtrip:

    def test_mmap_files_exist(self, drb1_dir):
        mmap_dir = os.path.join(drb1_dir, MMAP_DIR)
        assert os.path.isdir(mmap_dir)
        assert os.path.isdir(os.path.join(mmap_dir, DECOMP_DIR))
        assert os.path.exists(os.path.join(mmap_dir, "meta.json"))

    def test_reload_matches(self, drb1_dir, drb1_polychain_index):
        """Loading from mmap produces the same chain count."""
        pi2 = PolychainIndex.__new__(PolychainIndex)
        pi2.dir = drb1_dir
        pi2._mmap_dir = os.path.join(drb1_dir, MMAP_DIR)
        pi2._decomp_dir = os.path.join(pi2._mmap_dir, DECOMP_DIR)
        pi2._decompositions = None
        assert pi2._load_mmap_index() is True
        assert len(pi2.chain_ids) == len(drb1_polychain_index.chain_ids)
