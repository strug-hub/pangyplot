"""Tests for the grid-varint skeleton binary encoding (skeleton_pipeline)."""

import gzip
import json
import struct

import numpy as np
import pytest

from pangyplot.preprocess.skeleton import skeleton_pipeline as sp
from pangyplot.preprocess.skeleton.skeleton_geometry import grid_simplify


# ---------------------------------------------------------------------------
# varint / zigzag primitives
# ---------------------------------------------------------------------------

def _read_uvarint(buf, pos):
    result = shift = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, pos
        shift += 7


class TestVarintPrimitives:

    @pytest.mark.parametrize("value", [0, 1, 127, 128, 255, 300, 16384, 1_000_000])
    def test_uvarint_round_trip(self, value):
        buf = bytearray()
        sp._append_uvarint(buf, value)
        got, pos = _read_uvarint(buf, 0)
        assert got == value
        assert pos == len(buf)

    def test_small_values_are_one_byte(self):
        for v in range(128):
            buf = bytearray()
            sp._append_uvarint(buf, v)
            assert len(buf) == 1

    @pytest.mark.parametrize("value", [0, -1, 1, -2, 2, -1000, 1000, 2**20, -(2**20)])
    def test_zigzag_round_trip(self, value):
        u = int(sp._zigzag(np.array([value]))[0])
        assert u >= 0
        # unzigzag
        back = (u >> 1) ^ -(u & 1)
        assert back == value

    def test_zigzag_keeps_small_magnitudes_small(self):
        u = sp._zigzag(np.array([-1, 1, -2, 2]))
        assert list(u) == [1, 2, 3, 4]


# ---------------------------------------------------------------------------
# level encoding
# ---------------------------------------------------------------------------

def _decode_level_varint(data, num_pl, cell):
    """Reference decoder mirroring skeleton-decoder.js:decodeLevelVarint."""
    pos = 0
    point_counts = []
    for _ in range(num_pl):
        v, pos = _read_uvarint(data, pos)
        point_counts.append(v + 2)

    def _svarint(pos):
        u, pos = _read_uvarint(data, pos)
        return ((u >> 1) ^ -(u & 1)), pos

    chain_ids = []
    prev = 0
    for _ in range(num_pl):
        d, pos = _svarint(pos)
        prev += d
        chain_ids.append(prev)

    polylines = []
    for c in point_counts:
        sx, pos = _svarint(pos)
        sy, pos = _svarint(pos)
        x, y = sx * cell, sy * cell
        pl = [(x, y)]
        for _ in range(c - 1):
            dx, pos = _svarint(pos)
            dy, pos = _svarint(pos)
            x += dx * cell
            y += dy * cell
            pl.append((x, y))
        polylines.append(pl)
    return point_counts, chain_ids, polylines, pos


class TestEncodeLevelVarint:

    def test_round_trip_matches_input(self):
        cell = 100
        # two polylines, all coords multiples of cell
        point_counts = [3, 2]
        chain_ids = [5, -1]
        # flat delta coords: pl0 abs (200,300) then +100,-200 then +0,+100;
        #                    pl1 abs (-400,500) then +200,+0
        coords = np.array([200, 300, 100, -200, 0, 100,
                           -400, 500, 200, 0], dtype=np.int32)
        enc = sp._encode_level_varint(point_counts, chain_ids, coords, cell)
        pc, cids, pls, pos = _decode_level_varint(enc, len(point_counts), cell)
        assert pos == len(enc)
        assert pc == point_counts
        assert cids == chain_ids
        # reconstruct absolute coords from the same deltas for comparison
        assert pls[0] == [(200, 300), (300, 100), (300, 200)]
        assert pls[1] == [(-400, 500), (-200, 500)]

    def test_rejects_non_multiple_of_cell(self):
        with pytest.raises(ValueError):
            sp._encode_level_varint([2], [-1],
                                    np.array([150, 0, 100, 0], dtype=np.int32), 100)

    def test_empty_level(self):
        enc = sp._encode_level_varint([], [], np.empty(0, dtype=np.int32), 100)
        assert enc == b""


# ---------------------------------------------------------------------------
# full export_binary round-trip
# ---------------------------------------------------------------------------

class TestExportBinary:

    def _synth(self, seed=0, n=40):
        rng = np.random.default_rng(seed)
        polylines, chain_ids = [], []
        for _ in range(n):
            m = int(rng.integers(2, 25))
            x, y = rng.uniform(0, 60000), rng.uniform(0, 60000)
            pts = [(x, y)]
            for _ in range(m - 1):
                x += rng.uniform(-800, 800)
                y += rng.uniform(-800, 800)
                pts.append((x, y))
            polylines.append(pts)
            chain_ids.append(int(rng.integers(-1, 30)))
        return polylines, chain_ids

    def test_writes_grid_varint_with_byte_lengths(self, tmp_path):
        polylines, chain_ids = self._synth()
        meta_p = tmp_path / "meta.json.gz"
        bin_p = tmp_path / "polylines.bin.gz"
        sp.export_binary([1, 2, 3], list(range(len(polylines))),
                         list(range(500)), list(range(600)), polylines,
                         sp.VIEWER_GRID_SIZES, str(meta_p), str(bin_p),
                         chromosome="chrT", chain_ids=chain_ids)

        meta = json.load(gzip.open(meta_p, "rt"))
        blob = gzip.open(bin_p, "rb").read()
        assert meta["meta"]["encoding"] == "grid-varint"
        assert all("byteLength" in L for L in meta["levels"])
        assert sum(L["byteLength"] for L in meta["levels"]) == len(blob)

    def test_decodes_to_grid_simplify_output(self, tmp_path):
        polylines, chain_ids = self._synth(seed=3)
        meta_p = tmp_path / "meta.json.gz"
        bin_p = tmp_path / "polylines.bin.gz"
        sp.export_binary([1, 2, 3], list(range(len(polylines))),
                         list(range(500)), list(range(600)), polylines,
                         sp.VIEWER_GRID_SIZES, str(meta_p), str(bin_p),
                         chromosome="chrT", chain_ids=chain_ids)

        meta = json.load(gzip.open(meta_p, "rt"))
        blob = gzip.open(bin_p, "rb").read()

        pos = 0
        for L in meta["levels"]:
            n, cell = L["numPolylines"], L["gridSize"]
            level_bytes = blob[pos:pos + L["byteLength"]]
            pos += L["byteLength"]
            _, dec_cids, dec_pls, consumed = _decode_level_varint(
                level_bytes, n, cell)
            assert consumed == len(level_bytes)

            # reference: grid_simplify then drop <2-point polylines and round
            ref_pls, ref_cids = grid_simplify(polylines, cell,
                                              chain_ids=chain_ids)
            ref = [([(round(x), round(y)) for x, y in pl], int(c))
                   for pl, c in zip(ref_pls, ref_cids) if len(pl) >= 2]
            assert len(ref) == len(dec_pls)
            for (rpl, rc), dpl, dc in zip(ref, dec_pls, dec_cids):
                assert rpl == dpl
                assert rc == dc
        assert pos == len(blob)
