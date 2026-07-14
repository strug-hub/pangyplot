"""A bubble's length must count the bases of nodes that compaction absorbed.

`merge_node` moves an absorbed node's edges into its absorber but not its bases,
so the absorber's seq_len still describes only itself. `construct_bubble_index`
nonetheless puts the absorbed segment's id into `bubble.inside`. Summing seq_len
over the surviving nodes alone therefore reported a length that contradicted the
bubble's own segment list.

The DRB1 fixture cannot catch this -- it compacts 4 nodes, none of which land
inside a bubble -- so this uses a graph built to trigger it:

    1 --> 2 -------> 5     branch A: one node, 5 bp
      \-> 3 --> 4 -> 5     branch B: a unary path; 3 (3 bp) absorbs 4 (100 bp)

On HPRC v2 chrY the unfixed code understated 937 bubbles, the worst by ~77x.
"""
import sqlite3
import json
import tempfile
import shutil

import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun

# node 2 (TTTTT) + node 3 (CCC) + node 4 (100x G)
EXPECTED_LENGTH = 5 + 3 + 100
EXPECTED_GC = 0 + 3 + 100     # C x3, G x100
EXPECTED_INSIDE = [2, 3, 4]


@pytest.fixture(scope="module")
def built(fixtures_dir):
    tmpdir = tempfile.mkdtemp()
    try:
        layout = parse_layout(str(fixtures_dir / "mini_compacted_bubble.lay.tsv"))
        _, segment_idx, link_idx = parse_gfa(
            gfa_file=str(fixtures_dir / "mini_compacted_bubble.gfa"), ref="GRCh38",
            path=None, ref_offset=0, path_sep=None, layout_coords=layout, dir=tmpdir,
        )
        graph = bubble_gun.shoot(segment_idx, link_idx, tmpdir, "GRCh38")

        conn = sqlite3.connect(f"{tmpdir}/bubbles.db")
        conn.row_factory = sqlite3.Row
        rows = [dict(r) for r in conn.execute("SELECT * FROM bubbles")]
        conn.close()
        yield {"rows": rows, "graph": graph}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_compaction_fired_inside_the_bubble(built):
    """Guard the guard: if node 4 is never absorbed, the rest proves nothing."""
    absorbed = {
        int(c.id)
        for node in built["graph"].nodes.values()
        for c in node.optional_info.get("compacted", [])
    }
    assert 4 in absorbed, "fixture no longer triggers compaction inside a bubble"


def test_inside_lists_the_absorbed_segment(built):
    (bubble,) = built["rows"]
    assert sorted(json.loads(bubble["inside"])) == EXPECTED_INSIDE


def test_length_counts_absorbed_bases(built):
    (bubble,) = built["rows"]
    assert bubble["length"] == EXPECTED_LENGTH


def test_gc_count_counts_absorbed_bases(built):
    (bubble,) = built["rows"]
    assert bubble["gc_count"] == EXPECTED_GC


def test_length_agrees_with_inside(built):
    """The invariant the bug broke: length must describe exactly the segments
    that bubble.inside claims are in the bubble."""
    (bubble,) = built["rows"]
    seg_len = {2: 5, 3: 3, 4: 100}
    inside = json.loads(bubble["inside"])
    assert bubble["length"] == sum(seg_len[s] for s in inside)
