"""M3 node-order contract: gbz2layout's .lay.tsv order vs pangyplot's ingest order.

`gbz2layout` (a sibling tool, ~/projects/gbz2layout) computes a 2D layout
directly from a GBZ and writes an odgi-compatible `.lay.tsv`. PangyPlot ingests
that layout positionally: `layout_coords_by_id` (graphd.py) assigns
`coords[seg_ids[i]] = layout[i]`, where `seg_ids = client.segments()[:, 0]`.
That is only correct if the two tools enumerate the graph in the same order.

These tests prove the *current* behavior of that coupling on the chopped DRB1
fixture (they do not fix it — see the limitation asserted below):

  1. The enumeration ORDER agrees. gbz2layout walks `GBWTGraph::for_each_handle`
     at NODE granularity (one layout row per node); graphd's `segments()` walks
     the same order but at SEGMENT granularity (chop-runs collapsed via the
     node->segment translation). Collapse gbz2layout's consecutive chop-run
     duplicates and the two segment sequences are identical.

  2. Raw POSITIONAL alignment breaks on a chopped GBZ. Because a chopped segment
     spans several nodes, `layout[i]` (node i) and `seg_ids[i]` (segment i)
     diverge at the first chopped node, so `layout_coords_by_id` would misassign
     every segment past that point. This is the known limitation: the positional
     contract holds only for an UNCHOPPED GBZ (node == segment), which is
     PangyPlot's own native `graph.gbwt` format.

Skipped unless both binaries are available: the graph daemon
(`gbwt/graphd/pangyplot-graphd`) and `gbz2layout` (`GBZ2LAYOUT_BIN`, or the
sibling `~/projects/gbz2layout/build/gbz2layout`).
"""
import os
import subprocess
import tempfile

import pytest

from pangyplot.preprocess.graphd import serve_graph

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DAEMON = os.environ.get("PANGYPLOT_GRAPHD_BIN") or os.path.join(
    REPO, "gbwt", "graphd", "pangyplot-graphd")
GBZ2LAYOUT = os.environ.get("GBZ2LAYOUT_BIN") or os.path.expanduser(
    "~/projects/gbz2layout/build/gbz2layout")


def _read_meta_order(meta_path):
    """gbz2layout --emit-meta writes `rank<TAB>is_ref<TAB>segment_name`, one row
    per node in for_each_handle order. Return the segment names in that order."""
    names = []
    with open(meta_path) as f:
        next(f)  # header
        for line in f:
            cols = line.rstrip("\n").split("\t")
            names.append(cols[2])
    return names


def _collapse_runs(seq):
    """Collapse consecutive duplicates (a chopped segment's node run)."""
    out = []
    for s in seq:
        if not out or out[-1] != s:
            out.append(s)
    return out


@pytest.fixture(scope="module")
def gbz2layout_meta(fixtures_dir):
    """Run gbz2layout on the DRB1 GBZ and return its node-order segment names."""
    if not os.path.exists(GBZ2LAYOUT):
        pytest.skip(f"gbz2layout binary not found ({GBZ2LAYOUT}); set GBZ2LAYOUT_BIN")
    tmp = tempfile.mkdtemp()
    prefix = os.path.join(tmp, "drb1")
    # --iter 1: we only need the emitted node order (meta.tsv), not a good layout.
    subprocess.run(
        [GBZ2LAYOUT, str(fixtures_dir / "DRB1-3123.gbz"), "-o", prefix,
         "--emit-meta", "--iter", "1"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return _read_meta_order(prefix + ".meta.tsv")


@pytest.fixture(scope="module")
def graphd_segments(fixtures_dir):
    """graphd's segment enumeration for the same GBZ (the ingest-side order)."""
    if not os.path.exists(DAEMON):
        pytest.skip("graph daemon binary not built (make -C gbwt/graphd)")
    with serve_graph(str(fixtures_dir / "DRB1-3123.gbz"), repo_root=REPO) as client:
        return [str(s) for s in client.segments()[:, 0].tolist()]


def test_collapsed_node_order_matches_graphd_segment_order(gbz2layout_meta, graphd_segments):
    # The ordering contract: both enumerate for_each_handle / segment-id order.
    # gbz2layout is per-node; collapse chop-runs and it must equal graphd's
    # per-segment order exactly.
    collapsed = _collapse_runs(gbz2layout_meta)
    assert len(collapsed) == len(graphd_segments)
    assert collapsed == graphd_segments


def test_chopping_breaks_raw_positional_alignment(gbz2layout_meta, graphd_segments):
    # Known limitation on a chopped GBZ: node-granularity layout rows outnumber
    # segments, so raw positional alignment (what layout_coords_by_id does)
    # diverges at the first chopped node and misassigns everything after it.
    assert len(gbz2layout_meta) > len(graphd_segments)  # DRB1 is chopped

    first_diff = next(
        (i for i, (a, b) in enumerate(zip(gbz2layout_meta, graphd_segments)) if a != b),
        None)
    assert first_diff is not None, (
        "raw node order matched segment order end-to-end -- fixture is no longer "
        "chopped; the positional-misalignment limitation this test documents is gone")
    # Everything before the first chop lines up; the break is exactly the chop.
    assert gbz2layout_meta[:first_diff] == graphd_segments[:first_diff]
