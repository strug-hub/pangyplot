"""Tests for the delta-zigzag-varint path codec (.binpath format)."""

import os
import tempfile

import pytest

from pangyplot.db.path_codec import (
    encode_steps, decode_steps,
    write_binpath, read_binpath,
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
        # Zigzag should map small magnitudes to small unsigned values
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
        """Path visiting segments in non-sorted order (unsorted graph)."""
        steps = ["500+", "200-", "700+", "300-", "100+"]
        assert decode_steps(encode_steps(steps)) == steps

    def test_large_path(self):
        """Simulate a realistic path with ~10k steps."""
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
        """Verify we get meaningful compression on sequential data."""
        steps = [f"{i}+" for i in range(1, 10001)]
        encoded = encode_steps(steps)
        json_size = sum(len(s) + 4 for s in steps)  # rough JSON array size
        assert len(encoded) < json_size / 5  # at least 5x compression


# -------------------------------------------------------------------
# .binpath file I/O
# -------------------------------------------------------------------

class TestBinpathFile:
    def test_roundtrip(self, tmp_path):
        filepath = os.path.join(str(tmp_path), "test.binpath")
        metadata = {
            "full_id": "HG00621#1#chrY#0#57227415",
            "sample": "HG00621",
            "hap": "1",
            "contig": "chrY",
            "start": 0,
            "length": 57227415,
            "is_ref": False,
        }
        steps = ["1+", "2+", "3+", "100-", "99-"]

        write_binpath(filepath, metadata, steps)
        meta_out, steps_out = read_binpath(filepath)

        assert steps_out == steps
        assert meta_out["full_id"] == metadata["full_id"]
        assert meta_out["sample"] == metadata["sample"]
        assert meta_out["hap"] == metadata["hap"]
        assert meta_out["contig"] == metadata["contig"]
        assert meta_out["start"] == metadata["start"]
        assert meta_out["length"] == metadata["length"]
        assert meta_out["is_ref"] == metadata["is_ref"]
        assert meta_out["v"] == 1

    def test_path_field_stripped(self, tmp_path):
        """If metadata has a 'path' key, it should be stripped from the header."""
        filepath = os.path.join(str(tmp_path), "test.binpath")
        metadata = {"sample": "test", "path": ["should", "be", "removed"]}
        steps = ["1+"]

        write_binpath(filepath, metadata, steps)
        meta_out, _ = read_binpath(filepath)

        assert "path" not in meta_out

    def test_empty_path(self, tmp_path):
        filepath = os.path.join(str(tmp_path), "empty.binpath")
        write_binpath(filepath, {"sample": "test"}, [])
        meta_out, steps_out = read_binpath(filepath)
        assert steps_out == []

    def test_file_is_smaller_than_json(self, tmp_path):
        """Binpath file should be much smaller than equivalent JSON."""
        import json

        steps = [f"{i}+" for i in range(1, 1001)]
        metadata = {"sample": "test", "contig": "chr1"}

        binpath = os.path.join(str(tmp_path), "test.binpath")
        write_binpath(binpath, metadata, steps)

        json_path = os.path.join(str(tmp_path), "test.json")
        with open(json_path, "w") as f:
            json.dump({**metadata, "path": steps}, f)

        bin_size = os.path.getsize(binpath)
        json_size = os.path.getsize(json_path)
        assert bin_size < json_size / 3


# -------------------------------------------------------------------
# Integration with DRB1 fixture (full pipeline round-trip)
# -------------------------------------------------------------------

REFERENCE = "gi|568815592"


class TestDRB1Integration:
    """Verify paths survive the full parse_gfa → store → retrieve pipeline."""

    def test_binpath_files_created(self, drb1_dir):
        """parse_gfa should produce .binpath files, not .json."""
        paths_dir = os.path.join(drb1_dir, "paths")
        assert os.path.isdir(paths_dir)

        binpath_files = [f for f in os.listdir(paths_dir) if f.endswith(".binpath")]
        json_files = [f for f in os.listdir(paths_dir)
                      if f.endswith(".json") and "__" in f]

        assert len(binpath_files) > 0, "No .binpath files produced"
        assert len(json_files) == 0, "Legacy .json path files should not exist"

    def test_retrieve_reference_path(self, drb1_dir):
        """Reference path should load correctly from .binpath."""
        paths = path_db.retrieve_paths(drb1_dir, REFERENCE)
        assert len(paths) >= 1

        ref = paths[0]
        assert ref.sample == REFERENCE
        assert ref.is_ref is True
        assert len(ref.path) > 0
        # Every step should be "ID+/-"
        for step in ref.path:
            assert step[-1] in ('+', '-')
            int(step[:-1])  # should not raise

    def test_retrieve_nonref_path(self, drb1_dir):
        """A non-reference sample path should also round-trip."""
        summary = path_db.summarize(drb1_dir)
        non_ref = [s for s in summary if s != REFERENCE]
        assert len(non_ref) > 0, "Expected at least one non-reference sample"

        paths = path_db.retrieve_paths(drb1_dir, non_ref[0])
        assert len(paths) >= 1
        assert len(paths[0].path) > 0

    def test_all_samples_retrievable(self, drb1_dir):
        """Every sample in the summary should be retrievable."""
        summary = path_db.summarize(drb1_dir)
        for sample in summary:
            paths = path_db.retrieve_paths(drb1_dir, sample)
            assert len(paths) >= 1, f"No paths found for {sample}"
