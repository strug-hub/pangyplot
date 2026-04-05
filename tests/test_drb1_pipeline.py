"""
Integration test for the full preprocessing pipeline using the DRB1-3123 GFA
fixture — a real pangenome graph from the HLA-DRB1 locus with 12 haplotypes.

Graph stats:
  - 3214 segments, 4380 links, 12 P-line paths
  - Reference path: gi|568815592:32578768-32589835
  - ~600 simple bubbles, ~230 superbubbles, ~40 insertions
  - 583 top-level bubbles visible in the bubble index

This tests the complete add pipeline: GFA parsing → layout → bubble detection
→ index construction, and then verifies the resulting indexes are queryable.
"""
import os
import tempfile
import shutil
import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.PolychainIndex import PolychainIndex
from pangyplot.preprocess.meta import compute_meta

REFERENCE = "gi|568815592"


@pytest.fixture(scope="module")
def drb1_indexes(fixtures_dir):
    """
    Run the full pipeline (parse_gfa → bubble_gun → index construction) once
    for the module and yield the resulting indexes. Cleans up on exit.
    """
    tmpdir = tempfile.mkdtemp()
    try:
        gfa_path = str(fixtures_dir / "DRB1-3123.gfa")
        layout_path = str(fixtures_dir / "DRB1-3123.lay.tsv")
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

        bubble_gun.shoot(segment_idx, link_idx, tmpdir, REFERENCE)

        gfa_index = GFAIndex(tmpdir)
        step_index = StepIndex(tmpdir, REFERENCE)
        bubble_index = BubbleIndex(tmpdir, gfa_index)
        polychain_index = PolychainIndex(tmpdir, bubble_index, gfa_index, step_index, REFERENCE)

        yield {
            "dir": tmpdir,
            "path_idx": path_idx,
            "segment_idx": segment_idx,
            "link_idx": link_idx,
            "gfa_index": gfa_index,
            "step_index": step_index,
            "bubble_index": bubble_index,
            "polychain_index": polychain_index,
        }
    finally:
        shutil.rmtree(tmpdir)


# ---------------------------------------------------------------------------
# GFA parsing: segments, links, paths
# ---------------------------------------------------------------------------

class TestGFAParsing:
    def test_segment_count(self, drb1_indexes):
        assert len(drb1_indexes["segment_idx"]) == 3214

    def test_link_count(self, drb1_indexes):
        assert len(drb1_indexes["link_idx"]) == 4380

    def test_sample_count(self, drb1_indexes):
        samples = drb1_indexes["path_idx"].get_samples()
        assert len(samples) == 12

    def test_reference_in_samples(self, drb1_indexes):
        samples = drb1_indexes["path_idx"].get_samples()
        assert any(REFERENCE in s for s in samples)

    def test_segments_have_layout_coords(self, drb1_indexes):
        seg = drb1_indexes["segment_idx"][1]
        assert seg.x1 is not None
        assert seg.x2 is not None


# ---------------------------------------------------------------------------
# Step index (reference coordinate mapping)
# ---------------------------------------------------------------------------

class TestStepIndex:
    def test_step_count(self, drb1_indexes):
        assert len(drb1_indexes["step_index"].starts) == 1488

    def test_coordinates_monotonically_increase(self, drb1_indexes):
        starts = drb1_indexes["step_index"].starts
        for i in range(1, len(starts)):
            assert starts[i] > starts[i - 1]

    def test_query_returns_valid_range(self, drb1_indexes):
        si = drb1_indexes["step_index"]
        start_step, end_step = si.query_coordinates(
            si.starts[0], si.ends[-1]
        )
        assert start_step == 0
        assert end_step == len(si.starts) - 1


# ---------------------------------------------------------------------------
# Bubble index
# ---------------------------------------------------------------------------

class TestBubbleIndex:
    def test_top_level_bubble_count(self, drb1_indexes):
        assert len(drb1_indexes["bubble_index"].ids) == 583

    def test_bubble_has_source_and_sink(self, drb1_indexes):
        bi = drb1_indexes["bubble_index"]
        bubble = bi[bi.ids[0]]
        assert len(bubble.source_segments) > 0
        assert len(bubble.sink_segments) > 0

    def test_bubble_source_sink_differ(self, drb1_indexes):
        bi = drb1_indexes["bubble_index"]
        bubble = bi[bi.ids[0]]
        assert bubble.source_segments != bubble.sink_segments

    def test_bubble_has_inside_segments(self, drb1_indexes):
        bi = drb1_indexes["bubble_index"]
        bubble = bi[bi.ids[0]]
        assert len(bubble.inside) > 0

    def test_bubbles_have_chain_ids(self, drb1_indexes):
        bi = drb1_indexes["bubble_index"]
        chain_ids = set()
        for bid in bi.ids[:20]:
            bubble = bi[bid]
            if bubble.chain is not None:
                chain_ids.add(bubble.chain)
        assert len(chain_ids) > 0

    def test_range_query_returns_bubbles(self, drb1_indexes):
        si = drb1_indexes["step_index"]
        bi = drb1_indexes["bubble_index"]
        mid = len(si.starts) // 2
        bubbles = bi.get_top_level_bubbles(mid - 50, mid + 50)
        assert len(bubbles) > 0


# ---------------------------------------------------------------------------
# GFA index (subgraph queries)
# ---------------------------------------------------------------------------

class TestGFAIndex:
    def test_segment_lookup(self, drb1_indexes):
        gfa = drb1_indexes["gfa_index"]
        seg = gfa.segment_index[1]
        assert seg.length > 0

    def test_link_lookup(self, drb1_indexes):
        gfa = drb1_indexes["gfa_index"]
        links = gfa.link_index[1]
        assert len(links) > 0

    def test_bfs_from_segment_1(self, drb1_indexes):
        gfa = drb1_indexes["gfa_index"]
        visited = gfa.bfs(1, max_steps=2)
        assert 1 in visited
        assert len(visited) > 1


# ---------------------------------------------------------------------------
# Database files on disk
# ---------------------------------------------------------------------------

class TestDiskArtifacts:
    def test_segment_db_exists(self, drb1_indexes):
        assert os.path.isfile(os.path.join(drb1_indexes["dir"], "segments.db"))

    def test_link_db_exists(self, drb1_indexes):
        assert os.path.isfile(os.path.join(drb1_indexes["dir"], "links.db"))

    def test_bubble_db_exists(self, drb1_indexes):
        assert os.path.isfile(os.path.join(drb1_indexes["dir"], "bubbles.db"))

    def test_step_index_exists(self, drb1_indexes):
        found = (
            os.path.isfile(os.path.join(drb1_indexes["dir"], "steps.mmapindex"))
            or os.path.isfile(os.path.join(drb1_indexes["dir"], "step_index.db"))
        )
        assert found

    def test_bubble_index_exists(self, drb1_indexes):
        found = (
            os.path.isfile(os.path.join(drb1_indexes["dir"], "bubbles.mmapindex"))
            or os.path.isfile(os.path.join(drb1_indexes["dir"], "bubbles.db"))
        )
        assert found


# ---------------------------------------------------------------------------
# Polychain index (chain decomposition)
# ---------------------------------------------------------------------------

class TestPolychainIndex:
    def test_chain_count(self, drb1_indexes):
        """All top-level chains are decomposed, including non-reference ones."""
        pi = drb1_indexes["polychain_index"]
        assert len(pi.chain_ids) == 34

    def test_includes_non_reference_chains(self, drb1_indexes):
        """Chains with no segments on the reference path are still included."""
        pi = drb1_indexes["polychain_index"]
        chain_ids = set(int(x) for x in pi.chain_ids)
        # Chain 89 has 59 bubbles but zero segments on the reference
        assert 89 in chain_ids

    def test_layout_query_covers_all(self, drb1_indexes):
        """Layout-based query with infinite range returns all chains."""
        bi = drb1_indexes["bubble_index"]
        chains = bi.get_top_level_bubbles_by_layout(
            float('-inf'), float('inf'), as_chains=True)
        assert len(chains) == 34

    def test_step_query_misses_nonref(self, drb1_indexes):
        """Step-based query misses non-reference chains (documents the gap)."""
        si = drb1_indexes["step_index"]
        bi = drb1_indexes["bubble_index"]
        max_step = len(si.starts) - 1
        step_chains = bi.get_top_level_bubbles(0, max_step, as_chains=True)
        layout_chains = bi.get_top_level_bubbles_by_layout(
            float('-inf'), float('inf'), as_chains=True)
        assert len(step_chains) < len(layout_chains)

    def test_decomposition_has_polyline(self, drb1_indexes):
        pi = drb1_indexes["polychain_index"]
        decomp = pi.get_decomposition(int(pi.chain_ids[0]))
        assert decomp is not None
        assert len(decomp["chains"]) > 0
        assert len(decomp["chains"][0].get("polyline", [])) >= 2


# ---------------------------------------------------------------------------
# Graph metadata
# ---------------------------------------------------------------------------

class TestGraphMeta:
    def test_meta_has_required_fields(self, drb1_indexes):
        meta = compute_meta(drb1_indexes["dir"], REFERENCE, "DRB1")
        assert meta["total_segments"] == 3214
        assert meta["total_links"] == 4380
        assert meta["sample_count"] == 12

    def test_median_link_distance(self, drb1_indexes):
        meta = compute_meta(drb1_indexes["dir"], REFERENCE, "DRB1")
        assert 5 < meta["median_link_distance"] < 10

    def test_layout_bbox(self, drb1_indexes):
        meta = compute_meta(drb1_indexes["dir"], REFERENCE, "DRB1")
        bbox = meta["layout_bbox"]
        assert bbox["min_x"] < bbox["max_x"]
        assert bbox["min_y"] < bbox["max_y"]

    def test_bubble_stats(self, drb1_indexes):
        meta = compute_meta(drb1_indexes["dir"], REFERENCE, "DRB1")
        assert meta["total_bubbles"] > 800
        assert meta["max_bubble_depth"] >= 2

    def test_bp_range(self, drb1_indexes):
        meta = compute_meta(drb1_indexes["dir"], REFERENCE, "DRB1")
        bp = meta["bp_range"]
        assert bp["start"] > 32_000_000
        assert bp["end"] > bp["start"]
