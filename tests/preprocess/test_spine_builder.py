"""Tests for spine_builder using the DRB1-3123 fixture.

The reference spine maps layout (x, y) coordinates to basepair positions
along the reference path. DRB1 has 1488 steps.
"""

import gzip
import json
import os
import tempfile

import pytest

from pangyplot.preprocess.spine.spine_builder import (
    build_reference_spine,
    export_spine,
    spine_filename,
)


@pytest.fixture(scope="module")
def drb1_indexes(fixtures_dir):
    """Build segment + step indexes from DRB1 fixture."""
    import shutil
    from pangyplot.preprocess.parser.parse_gfa import parse_gfa
    from pangyplot.preprocess.parser.parse_layout import parse_layout
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.StepIndex import StepIndex

    tmpdir = tempfile.mkdtemp()
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(
        str(fixtures_dir / "DRB1-3123.gfa"), "gi|568815592",
        None, 0, None, layout, tmpdir,
    )
    si = SegmentIndex(tmpdir)
    sti = StepIndex(tmpdir, "gi|568815592")
    yield si, sti
    shutil.rmtree(tmpdir)


# ---------------------------------------------------------------------------
# spine_filename
# ---------------------------------------------------------------------------

class TestSpineFilename:

    def test_format(self):
        assert spine_filename("GRCh38") == "spine.GRCh38.json.gz"


# ---------------------------------------------------------------------------
# build_reference_spine
# ---------------------------------------------------------------------------

class TestBuildReferenceSpine:

    @pytest.fixture(scope="class")
    def spine(self, drb1_indexes):
        seg_idx, step_idx = drb1_indexes
        return build_reference_spine(step_idx, seg_idx, stride=50)

    def test_non_empty(self, spine):
        assert len(spine) > 0

    def test_points_are_triples(self, spine):
        for pt in spine:
            assert len(pt) == 3

    def test_bp_non_decreasing(self, spine):
        for i in range(1, len(spine)):
            assert spine[i][2] >= spine[i - 1][2], (
                f"bp decreased at index {i}: {spine[i-1][2]} → {spine[i][2]}")

    def test_stride_downsamples(self, drb1_indexes):
        seg_idx, step_idx = drb1_indexes
        coarse = build_reference_spine(step_idx, seg_idx, stride=50)
        fine = build_reference_spine(step_idx, seg_idx, stride=1)
        assert len(fine) > len(coarse)

    def test_last_point_included(self, drb1_indexes):
        seg_idx, step_idx = drb1_indexes
        spine = build_reference_spine(step_idx, seg_idx, stride=50)
        # Build unsampled to get the true last point
        full = build_reference_spine(step_idx, seg_idx, stride=1)
        assert spine[-1] == full[-1]

    def test_xy_rounded(self, spine):
        for pt in spine:
            x_str = str(pt[0])
            y_str = str(pt[1])
            if '.' in x_str:
                assert len(x_str.split('.')[1]) <= 1
            if '.' in y_str:
                assert len(y_str.split('.')[1]) <= 1

    def test_bp_is_integer(self, spine):
        for pt in spine:
            assert isinstance(pt[2], int)


# ---------------------------------------------------------------------------
# export_spine
# ---------------------------------------------------------------------------

class TestExportSpine:

    def test_round_trip(self, drb1_indexes):
        seg_idx, step_idx = drb1_indexes
        spine = build_reference_spine(step_idx, seg_idx, stride=100)

        with tempfile.NamedTemporaryFile(suffix=".json.gz", delete=False) as f:
            path = f.name
        try:
            export_spine(spine, path)
            with gzip.open(path, 'rt') as f:
                data = json.load(f)
            assert data["spine"] == spine
        finally:
            os.remove(path)

    def test_has_meta_version(self, drb1_indexes):
        seg_idx, step_idx = drb1_indexes
        spine = build_reference_spine(step_idx, seg_idx, stride=100)

        with tempfile.NamedTemporaryFile(suffix=".json.gz", delete=False) as f:
            path = f.name
        try:
            export_spine(spine, path)
            with gzip.open(path, 'rt') as f:
                data = json.load(f)
            assert "meta" in data
            assert "version" in data["meta"]
        finally:
            os.remove(path)
