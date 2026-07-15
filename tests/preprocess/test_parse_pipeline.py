"""
Integration tests for the full preprocessing pipeline using the mini_p.gfa
fixture (P-line format). These tests run parse_gfa() end-to-end into a temp
directory and then query the resulting indexes, verifying that the pipeline
produces correct on-disk structures.

Graph topology (mini_p.gfa)::

         2 (TTTT)
        /         +
  1 --              -- 4 -- 5   <- GRCh38 reference path (segments 1,2,4,5)
        +         /
         3 (CCCC)               HG001 uses segments 1,3,4,6 instead

All segments are 4 bp. Reference path start offset = 0.

Expected StepIndex for GRCh38 (1-based coordinates):
  step 0: seg 1, start=1,  end=4
  step 1: seg 2, start=5,  end=8
  step 2: seg 4, start=9,  end=12
  step 3: seg 5, start=13, end=16
"""
import os
import tempfile
import shutil
import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.db.indexes.StepIndex import StepIndex


REFERENCE = "GRCh38"


@pytest.fixture(scope="module")
def pipeline_output(fixtures_dir):
    """
    Run the full parse_gfa pipeline once for the module and yield the output
    directory. Cleans up on exit.
    """
    tmpdir = tempfile.mkdtemp()
    try:
        gfa_path = str(fixtures_dir / "mini_p.gfa")
        layout_path = str(fixtures_dir / "mini.odgi.tsv")
        layout_coords = parse_layout(layout_path)

        path_idx, segment_idx, link_idx = parse_gfa(
            gfa_file=gfa_path,
            ref=REFERENCE,
            path=None,
            ref_offset=0,
            path_sep=None,
            layout_coords=layout_coords,
            dir=tmpdir,
        )
        yield {
            "dir": tmpdir,
            "path_idx": path_idx,
            "segment_idx": segment_idx,
            "link_idx": link_idx,
        }
    finally:
        shutil.rmtree(tmpdir)


# ---------------------------------------------------------------------------
# Segment index
# ---------------------------------------------------------------------------

class TestSegmentIndex:
    def test_segment_count(self, pipeline_output):
        assert len(pipeline_output["segment_idx"]) == 6

    def test_segment_lengths(self, pipeline_output):
        idx = pipeline_output["segment_idx"]
        for seg_id in [1, 2, 3, 4, 5, 6]:
            assert idx.segment_length(seg_id) == 4

    def test_gc_content_of_pure_gc_segment(self, pipeline_output):
        # Seg 3 = "CCCC" → gc_count=4, n_count=0
        seg = pipeline_output["segment_idx"][3]
        assert seg.gc_count == 4
        assert seg.n_count == 0

    def test_gc_content_of_pure_at_segment(self, pipeline_output):
        # Seg 2 = "TTTT" → gc_count=0
        seg = pipeline_output["segment_idx"][2]
        assert seg.gc_count == 0

    def test_layout_coords_assigned(self, pipeline_output):
        # Seg 1 from odgi layout row pair 0,1: x1=0.0, x2=10.0
        seg = pipeline_output["segment_idx"][1]
        assert seg.x1 == pytest.approx(0.0)
        assert seg.x2 == pytest.approx(10.0)


# ---------------------------------------------------------------------------
# Link index
# ---------------------------------------------------------------------------

class TestLinkIndex:
    def test_link_count(self, pipeline_output):
        # 6 L-lines in mini_p.gfa
        assert len(pipeline_output["link_idx"]) == 6

    def test_links_from_segment_1(self, pipeline_output):
        # Seg 1 connects to seg 2 and seg 3
        links = pipeline_output["link_idx"][1]
        neighbor_ids = {link.from_id if link.from_id != 1 else link.to_id for link in links}
        assert neighbor_ids == {2, 3}

    def test_links_from_segment_4(self, pipeline_output):
        # link_idx[seg] returns all links touching that segment (bidirectional).
        # Seg 4 has incoming links from 2 and 3, and outgoing links to 5 and 6.
        links = pipeline_output["link_idx"][4]
        all_neighbor_ids = {link.from_id if link.from_id != 4 else link.to_id
                            for link in links}
        assert all_neighbor_ids == {2, 3, 5, 6}
        # Outgoing only
        outgoing = [l for l in links if l.from_id == 4]
        assert {l.to_id for l in outgoing} == {5, 6}

    def test_link_frequency_single_sample(self, pipeline_output):
        # Link 1→2 appears in 1 of 2 samples → frequency 0.5
        links = pipeline_output["link_idx"][1]
        link_to_2 = next(l for l in links if (l.from_id == 1 and l.to_id == 2) or
                                              (l.to_id == 1 and l.from_id == 2))
        assert link_to_2.frequency == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# Step index (coordinate mapping for the reference path)
# ---------------------------------------------------------------------------

class TestStepIndex:
    @pytest.fixture(scope="class")
    def step_index(self, pipeline_output):
        return StepIndex(pipeline_output["dir"], REFERENCE)

    def test_step_count(self, step_index):
        # Reference path has 4 segments → 4 steps
        assert len(step_index.starts) == 4

    def test_step_to_segment_mapping(self, step_index):
        # steps 0..3 should map to segments 1, 2, 4, 5
        assert step_index[0] == 1
        assert step_index[1] == 2
        assert step_index[2] == 4
        assert step_index[3] == 5

    def test_coordinate_start_is_one_based(self, step_index):
        # First segment starts at position 1 (not 0)
        assert step_index.starts[0] == 1

    def test_coordinate_boundaries(self, step_index):
        # Each 4-bp segment occupies [start, end] inclusive
        assert (step_index.starts[0], step_index.ends[0]) == (1, 4)
        assert (step_index.starts[1], step_index.ends[1]) == (5, 8)
        assert (step_index.starts[2], step_index.ends[2]) == (9, 12)
        assert (step_index.starts[3], step_index.ends[3]) == (13, 16)

    def test_query_coordinates_mid_region(self, step_index):
        # bp 5–9 spans steps 1 and 2 (segs 2 and 4)
        start_step, end_step = step_index.query_coordinates(5, 9)
        assert start_step == 1
        assert end_step == 2

    def test_query_coordinates_full_range(self, step_index):
        start_step, end_step = step_index.query_coordinates(1, 16)
        assert start_step == 0
        assert end_step == 3

    def test_query_coordinates_single_segment(self, step_index):
        # Any position within seg 4 (bp 9–12) should resolve to step 2
        start_step, end_step = step_index.query_coordinates(9, 12)
        assert start_step == 2
        assert end_step == 2


# ---------------------------------------------------------------------------
# Path index
# ---------------------------------------------------------------------------

class TestPathIndex:
    def test_samples_present(self, pipeline_output):
        # get_samples() returns sample_name(), which includes haplotype when
        # present: "GRCh38#0" and "HG001#1" from the #-separated path names.
        samples = pipeline_output["path_idx"].get_samples()
        assert "GRCh38#0" in samples
        assert "HG001#1" in samples

    def test_sample_count(self, pipeline_output):
        samples = pipeline_output["path_idx"].get_samples()
        assert len(samples) == 2
