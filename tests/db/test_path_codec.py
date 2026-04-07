"""Tests for the delta-zigzag-varint path codec (.binpath format)."""

import json
import os

import pytest

from pangyplot.db.path_codec import (
    encode_steps, decode_steps,
    write_binpath, read_binpath, read_binpath_raw,
    write_path_index, read_path_index, path_index_version,
    _zigzag_encode, _zigzag_decode,
    _combine, _uncombine,
)
from pangyplot.db.sqlite import path_db


# -------------------------------------------------------------------
# Zigzag encoding
# -------------------------------------------------------------------

class TestZigzag:
    @pytest.mark.parametrize("n", [0, 1, -1, 2, -2, 127, -128, 100000, -100000])
    def test_roundtrip(self, n):
        assert _zigzag_decode(_zigzag_encode(n)) == n

    def test_small_values_encode_small(self):
        assert _zigzag_encode(0) == 0
        assert _zigzag_encode(-1) == 1
        assert _zigzag_encode(1) == 2
        assert _zigzag_encode(-2) == 3
        assert _zigzag_encode(2) == 4


# -------------------------------------------------------------------
# Combine / uncombine
# -------------------------------------------------------------------

class TestCombine:
    def test_forward(self):
        assert _combine(500, '+') == 1000
        assert _uncombine(1000) == (500, '+')

    def test_reverse(self):
        assert _combine(500, '-') == 1001
        assert _uncombine(1001) == (500, '-')

    def test_zero(self):
        assert _combine(0, '+') == 0
        assert _uncombine(0) == (0, '+')


# -------------------------------------------------------------------
# Step encode / decode round-trip
# -------------------------------------------------------------------

class TestStepCodec:
    def test_empty(self):
        assert decode_steps(encode_steps([])) == []

    def test_single_forward(self):
        steps = ["42+"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_single_reverse(self):
        steps = ["42-"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_sequential_forward(self):
        steps = ["1+", "2+", "3+", "4+", "5+"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_sequential_reverse(self):
        steps = ["500-", "499-", "498-", "497-"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_mixed_directions(self):
        steps = ["10+", "11+", "12-", "13+", "14-"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_large_gap(self):
        steps = ["1+", "100000+", "2-"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_direction_flip_same_segment(self):
        steps = ["500+", "500-"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_non_sequential_ids(self):
        steps = ["500+", "200-", "700+", "300-", "100+"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_large_path(self):
        import random
        random.seed(42)
        steps = []
        seg_id = 1
        for _ in range(10000):
            direction = "+" if random.random() > 0.3 else "-"
            steps.append(f"{seg_id}{direction}")
            seg_id += random.choice([1, 1, 1, 2, -1, 5, 100])
            seg_id = max(0, seg_id)
        assert decode_steps(encode_steps(steps)) == steps

    def test_compression_ratio(self):
        steps = [f"{i}+" for i in range(1, 10001)]
        encoded = encode_steps(steps)
        json_size = sum(len(s) + 4 for s in steps)
        assert len(encoded) < json_size / 5


# -------------------------------------------------------------------
# .binpath file I/O (pure binary, no header)
# -------------------------------------------------------------------

class TestBinpathFile:
    def test_roundtrip(self, tmp_path):
        filepath = str(tmp_path / "test.binpath")
        steps = ["1+", "2+", "3+", "100-", "99-"]
        write_binpath(filepath, steps)
        assert read_binpath(filepath) == steps

    def test_empty_path(self, tmp_path):
        filepath = str(tmp_path / "empty.binpath")
        write_binpath(filepath, [])
        assert read_binpath(filepath) == []

    def test_read_raw(self, tmp_path):
        filepath = str(tmp_path / "test.binpath")
        steps = ["1+", "2+", "3+"]
        write_binpath(filepath, steps)
        raw = read_binpath_raw(filepath)
        assert isinstance(raw, bytes)
        assert decode_steps(raw) == steps

    def test_file_is_smaller_than_json(self, tmp_path):
        steps = [f"{i}+" for i in range(1, 1001)]

        binpath = str(tmp_path / "test.binpath")
        write_binpath(binpath, steps)

        json_path = str(tmp_path / "test.json")
        with open(json_path, "w") as f:
            json.dump(steps, f)

        assert os.path.getsize(binpath) < os.path.getsize(json_path) / 3


# -------------------------------------------------------------------
# index.json I/O
# -------------------------------------------------------------------

class TestPathIndex:
    def test_roundtrip(self, tmp_path):
        paths_dir = str(tmp_path)
        entries = {
            "HG00621#1": [
                {"file": "HG00621#1__1.binpath", "full_id": "HG00621#1#chrY", "contig": "chrY",
                 "start": 0, "length": None, "is_ref": False},
            ],
            "GRCh38": [
                {"file": "GRCh38__1.binpath", "full_id": "GRCh38#chrY", "contig": "chrY",
                 "start": 0, "length": None, "is_ref": True},
            ],
        }
        write_path_index(paths_dir, entries)
        index = read_path_index(paths_dir)

        assert "version" in index
        assert len(index["paths"]["HG00621#1"]) == 1
        assert index["paths"]["GRCh38"][0]["is_ref"] is True

    def test_version_check(self, tmp_path):
        paths_dir = str(tmp_path)
        write_path_index(paths_dir, {})
        from pangyplot.version import __version__
        assert path_index_version(paths_dir) == __version__

    def test_missing_index(self, tmp_path):
        assert path_index_version(str(tmp_path)) is None


# -------------------------------------------------------------------
# Integration with DRB1 fixture (full pipeline round-trip)
# -------------------------------------------------------------------

REFERENCE = "gi|568815592"


class TestDRB1Integration:
    def test_binpath_files_created(self, drb1_dir):
        paths_dir = os.path.join(drb1_dir, "paths")
        assert os.path.isdir(paths_dir)

        binpath_files = [f for f in os.listdir(paths_dir) if f.endswith(".binpath")]
        json_files = [f for f in os.listdir(paths_dir)
                      if f.endswith(".json") and "__" in f]

        assert len(binpath_files) > 0
        assert len(json_files) == 0

    def test_index_json_created(self, drb1_dir):
        paths_dir = os.path.join(drb1_dir, "paths")
        index_path = os.path.join(paths_dir, "index.json")
        assert os.path.exists(index_path)

        index = read_path_index(paths_dir)
        assert "version" in index
        assert "paths" in index
        assert len(index["paths"]) > 0

    def test_retrieve_reference_path(self, drb1_dir):
        paths = path_db.retrieve_paths(drb1_dir, REFERENCE)
        assert len(paths) >= 1

        ref = paths[0]
        assert ref.is_ref is True
        assert len(ref.path) > 0
        for step in ref.path:
            assert step[-1] in ('+', '-')
            int(step[:-1])

    def test_retrieve_nonref_path(self, drb1_dir):
        summary = path_db.summarize(drb1_dir)
        non_ref = [s for s in summary if s != REFERENCE]
        assert len(non_ref) > 0

        paths = path_db.retrieve_paths(drb1_dir, non_ref[0])
        assert len(paths) >= 1
        assert len(paths[0].path) > 0

    def test_all_samples_retrievable(self, drb1_dir):
        summary = path_db.summarize(drb1_dir)
        for sample in summary:
            paths = path_db.retrieve_paths(drb1_dir, sample)
            assert len(paths) >= 1

    def test_retrieve_path_meta(self, drb1_dir):
        meta = path_db.retrieve_path_meta(drb1_dir, REFERENCE)
        assert len(meta) >= 1
        assert "contig" in meta[0]
        assert "file" in meta[0]

    def test_retrieve_path_raw(self, drb1_dir):
        raw = path_db.retrieve_path_raw(drb1_dir, REFERENCE, 0)
        assert raw is not None
        steps = decode_steps(raw)
        assert len(steps) > 0
