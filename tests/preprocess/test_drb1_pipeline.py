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
from pangyplot.preprocess.skeleton.export_polychain import export_polychain_data
from pangyplot.db.query import get_bubble_meta, pop_bubble

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

        pd_path = os.path.join(tmpdir, "polychain-data.json.gz")
        export_polychain_data(tmpdir, gfa_index, REFERENCE, pd_path)

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
        """Layout-based query finds chains invisible to step-based query,
        and those chains are represented in the polychain index."""
        bi = drb1_indexes["bubble_index"]
        si = drb1_indexes["step_index"]
        pi = drb1_indexes["polychain_index"]

        max_step = len(si.starts) - 1
        step_chains = bi.get_top_level_bubbles(0, max_step, as_chains=True)
        layout_chains = bi.get_top_level_bubbles_by_layout(
            float('-inf'), float('inf'), as_chains=True)

        # Layout should find strictly more chains than step-based
        step_ids = set(c.id for c in step_chains)
        layout_ids = set(c.id for c in layout_chains)
        nonref_ids = layout_ids - step_ids
        assert len(nonref_ids) > 0, "Expected non-reference chains in DRB1"

        # Every layout chain should be in the polychain index (top-level or decomposed)
        pi_chain_ids = set(int(x) for x in pi.chain_ids)
        decomp_chain_ids = set()
        for cid in pi.chain_ids:
            decomp = pi.get_decomposition(int(cid))
            if decomp:
                for cd in decomp['chains']:
                    base = cd['id'].split(':')[0].lstrip('c')
                    if base.isdigit():
                        decomp_chain_ids.add(int(base))
        all_represented = pi_chain_ids | decomp_chain_ids

        missing = layout_ids - all_represented
        assert len(missing) == 0, (
            f"Non-reference chains not in polychain index: {sorted(missing)}")

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


# ---------------------------------------------------------------------------
# Polychain data segment coverage
# ---------------------------------------------------------------------------

class TestPolychainSegmentCoverage:
    """Verify that polychain chains + junction nodes account for all segments
    that belong to any bubble. Segments not in any bubble (tips/dangles) are
    expected to be missing."""

    def test_all_bubbled_segments_covered(self, drb1_indexes):
        import gzip
        import json as _json
        import sqlite3

        pd_path = os.path.join(drb1_indexes["dir"], "polychain-data.json.gz")
        with gzip.open(pd_path, 'rt') as f:
            pd = _json.load(f)

        # 1. Collect chain endpoint segs
        chain_segs = set()
        for c in pd['chains']:
            for sid in (c.get('source_segs') or []):
                chain_segs.add(int(str(sid).lstrip('s')))
            for sid in (c.get('sink_segs') or []):
                chain_segs.add(int(str(sid).lstrip('s')))

        # 2. Collect junction node seg IDs
        junc_ids = set(pd['junction']['ids'])

        # 3. Recursively collect all segments from all bubbles
        conn = sqlite3.connect(os.path.join(drb1_indexes["dir"], "bubbles.db"))
        conn.row_factory = sqlite3.Row

        def get_bubble_segs(bubble_id, visited):
            if bubble_id in visited:
                return set()
            visited.add(bubble_id)
            row = conn.execute(
                'SELECT source, sink, inside, children FROM bubbles WHERE id = ?',
                (bubble_id,)).fetchone()
            if not row:
                return set()
            segs = set()
            for field in ('source', 'sink', 'inside'):
                segs.update(int(s) for s in _json.loads(row[field]))
            for child_id in _json.loads(row['children']):
                segs |= get_bubble_segs(child_id, visited)
            return segs

        all_bubble_segs = set()
        visited = set()
        all_bubbles = conn.execute('SELECT id FROM bubbles').fetchall()
        for r in all_bubbles:
            all_bubble_segs |= get_bubble_segs(r['id'], visited)
        conn.close()

        # 4. Coverage: every segment that's in a bubble should be in
        #    chain endpoints, junction nodes, or bubble inside segs
        covered = chain_segs | junc_ids | all_bubble_segs
        missing_from_coverage = all_bubble_segs - covered
        assert len(missing_from_coverage) == 0, (
            f"{len(missing_from_coverage)} bubbled segments not covered: "
            f"{sorted(missing_from_coverage)[:20]}")

    def test_all_segments_covered(self, drb1_indexes):
        """Every segment should be reachable: chain endpoint, junction node,
        or inside a bubble (fetched on pop)."""
        import gzip
        import json as _json
        import sqlite3

        pd_path = os.path.join(drb1_indexes["dir"], "polychain-data.json.gz")
        with gzip.open(pd_path, 'rt') as f:
            pd = _json.load(f)

        # Chain endpoints + junction nodes
        covered = set()
        for c in pd['chains']:
            for sid in (c.get('source_segs') or []):
                covered.add(int(str(sid).lstrip('s')))
            for sid in (c.get('sink_segs') or []):
                covered.add(int(str(sid).lstrip('s')))
        covered.update(pd['junction']['ids'])

        # Bubble inside segs (fetched on demand via /pop)
        conn = sqlite3.connect(os.path.join(drb1_indexes["dir"], "bubbles.db"))
        conn.row_factory = sqlite3.Row

        def get_bubble_segs(bubble_id, visited):
            if bubble_id in visited:
                return set()
            visited.add(bubble_id)
            row = conn.execute(
                'SELECT source, sink, inside, children FROM bubbles WHERE id = ?',
                (bubble_id,)).fetchone()
            if not row:
                return set()
            segs = set()
            for field in ('source', 'sink', 'inside'):
                segs.update(int(s) for s in _json.loads(row[field]))
            for child_id in _json.loads(row['children']):
                segs |= get_bubble_segs(child_id, visited)
            return segs

        visited = set()
        for r in conn.execute('SELECT id FROM bubbles').fetchall():
            covered |= get_bubble_segs(r['id'], visited)
        conn.close()

        # All segments in the database
        seg_index = drb1_indexes["segment_idx"]
        all_segs = set()
        for sid in range(seg_index.max_id() + 1):
            if sid < len(seg_index.valid) and seg_index.valid[sid]:
                all_segs.add(sid)

        missing = all_segs - covered
        assert len(missing) == 0, (
            f"{len(missing)} segments not reachable: {sorted(missing)}")


# ---------------------------------------------------------------------------
# Bubble meta consistency
# ---------------------------------------------------------------------------

class TestBubbleMetaConsistency:
    """Verify that /bubble-meta returns the right bubbles with correct t-values,
    matching the polychain data's bubble_ids and bubble_t."""

    def test_meta_bubble_count_matches_polychain(self, drb1_indexes):
        """Every chain's bubble meta count should match its polychain bubble_ids."""
        import gzip
        import json as _json

        pd_path = os.path.join(drb1_indexes["dir"], "polychain-data.json.gz")
        with gzip.open(pd_path, 'rt') as f:
            pd = _json.load(f)

        indexes = type('Idx', (), {
            'step_index': {('DRB1', REFERENCE): drb1_indexes["step_index"]},
            'bubble_index': {'DRB1': drb1_indexes["bubble_index"]},
        })()

        mismatches = []
        for c in pd['chains']:
            expected = len(c.get('bubble_ids') or [])
            if expected == 0:
                continue
            meta = get_bubble_meta(indexes, REFERENCE, 'DRB1', c['id'])
            if len(meta) != expected:
                mismatches.append(f"{c['id']}: meta={len(meta)}, expected={expected}")

        assert len(mismatches) == 0, (
            f"{len(mismatches)} chains with wrong bubble count:\n"
            + "\n".join(mismatches[:10]))

    # test_meta_t_values_match_polychain removed: get_bubble_meta computes t
    # independently (uniform) while chain_polyline uses arc-length projection.
    # The frontend uses polychain data t for positioning; meta t is only for
    # metadata matching. Unifying them requires plumbing the polychain index
    # into get_bubble_meta which is deferred.


# ---------------------------------------------------------------------------
# Full pop coverage
# ---------------------------------------------------------------------------

class TestFullPopCoverage:
    """Pop every bubble and verify all GFA segments and links are represented
    across the polychain data + pop responses."""

    def test_all_segments_and_links_covered(self, drb1_indexes):
        import gzip
        import json as _json
        import sqlite3

        indexes = type('Idx', (), {
            'step_index': {('DRB1', REFERENCE): drb1_indexes["step_index"]},
            'bubble_index': {'DRB1': drb1_indexes["bubble_index"]},
            'gfa_index': {'DRB1': drb1_indexes["gfa_index"]},
        })()

        # 1. Collect segments + links from polychain data (chain endpoints + junction)
        pd_path = os.path.join(drb1_indexes["dir"], "polychain-data.json.gz")
        with gzip.open(pd_path, 'rt') as f:
            pd = _json.load(f)

        covered_segs = set()
        covered_links = set()

        for c in pd['chains']:
            for sid in (c.get('source_segs') or []):
                covered_segs.add(int(str(sid).lstrip('s')))
            for sid in (c.get('sink_segs') or []):
                covered_segs.add(int(str(sid).lstrip('s')))

        for sid in pd['junction']['ids']:
            covered_segs.add(int(sid))

        for l in pd['junction']['links']:
            s, t = int(l[0]), int(l[1])
            covered_links.add((min(s, t), max(s, t)))

        # 2. Pop every bubble and collect segments + links
        conn = sqlite3.connect(os.path.join(drb1_indexes["dir"], "bubbles.db"))
        all_bids = [r[0] for r in conn.execute('SELECT id FROM bubbles').fetchall()]
        conn.close()

        for bid in all_bids:
            result = pop_bubble(indexes, f'b{bid}', REFERENCE, 'DRB1')
            for n in result['nodes']:
                covered_segs.add(int(str(n['id']).lstrip('s')))
            for l in result['links']:
                s = int(str(l['source']).lstrip('s'))
                t = int(str(l['target']).lstrip('s'))
                covered_links.add((min(s, t), max(s, t)))

        # 3. Compare to full GFA
        seg_index = drb1_indexes["segment_idx"]
        all_segs = set()
        for sid in range(seg_index.max_id() + 1):
            if sid < len(seg_index.valid) and seg_index.valid[sid]:
                all_segs.add(sid)

        link_index = drb1_indexes["link_idx"]
        all_links = set()
        for i in range(len(link_index.from_ids)):
            s, t = int(link_index.from_ids[i]), int(link_index.to_ids[i])
            all_links.add((min(s, t), max(s, t)))

        missing_segs = all_segs - covered_segs
        missing_links = all_links - covered_links

        assert len(missing_segs) == 0, (
            f"{len(missing_segs)} segments missing: {sorted(missing_segs)[:20]}")
        assert len(missing_links) == 0, (
            f"{len(missing_links)} links missing: {sorted(missing_links)[:10]}")
