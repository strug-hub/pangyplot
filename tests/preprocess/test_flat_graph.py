"""FlatGraph must be structurally identical to the BubbleGun object graph.

The flat representation exists to cut ~1 KB/node of Python container overhead
down to ~57 B. That is only worth anything if the graph it describes is the
same one, edge for edge, both before and after compaction -- so this compares
the two implementations directly on a real pangenome graph rather than checking
the flat one against its own assumptions.
"""
import tempfile
import shutil

import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.preprocess.bubble.bubble_gun import to_bubblegun_obj
from pangyplot.preprocess.bubble.compact_graph import compact_graph
from pangyplot.preprocess.bubble.flat_graph import build_flat_graph, compact, START, END
import BubbleGun.Graph as BubbleGunGraph

REFERENCE = "gi|568815592"


@pytest.fixture(scope="module")
def graphs(fixtures_dir):
    """The DRB1 graph built both ways, before and after compaction."""
    tmpdir = tempfile.mkdtemp()
    try:
        layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
        _, segment_idx, link_idx = parse_gfa(
            gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
            ref_offset=0, path_sep=None, layout_coords=layout, dir=tmpdir,
        )

        legacy = BubbleGunGraph.Graph()
        legacy.nodes = to_bubblegun_obj(segment_idx, link_idx)
        flat = build_flat_graph(segment_idx, link_idx)

        raw = (_legacy_view(legacy), _flat_view(flat))

        compact_graph(legacy)
        flat = compact(flat)

        yield {"raw": raw, "compacted": (_legacy_view(legacy), _flat_view(flat)),
               "flat": flat, "legacy": legacy}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _legacy_view(graph):
    """{segment_id: {"start": {(nbr_id, side)}, "end": {...}, "compacted": [...]}}"""
    return {
        int(node.id): {
            "start": {(int(x[0]), x[1]) for x in node.start},
            "end": {(int(x[0]), x[1]) for x in node.end},
            "compacted": sorted(int(c.id) for c in node.optional_info.get("compacted", [])),
        }
        for node in graph.nodes.values()
    }


def _flat_view(g):
    view = {}
    for i in range(g.n):
        sides = {}
        for name, s in (("start", START), ("end", END)):
            nbrs, nsides = g.adj(i, s)
            sides[name] = {(int(g.seg_id[j]), int(sj))
                           for j, sj in zip(nbrs.tolist(), nsides.tolist())}
        sides["compacted"] = sorted(g.compacted(i))
        view[int(g.seg_id[i])] = sides
    return view


@pytest.mark.parametrize("stage", ["raw", "compacted"])
def test_same_nodes(graphs, stage):
    legacy, flat = graphs[stage]
    assert set(flat) == set(legacy)


@pytest.mark.parametrize("stage", ["raw", "compacted"])
def test_same_adjacency(graphs, stage):
    legacy, flat = graphs[stage]
    mismatched = {
        sid: {"legacy": legacy[sid], "flat": flat[sid]}
        for sid in legacy
        if legacy[sid]["start"] != flat[sid]["start"]
        or legacy[sid]["end"] != flat[sid]["end"]
    }
    assert not mismatched, f"{len(mismatched)} nodes differ, e.g. {list(mismatched.items())[:2]}"


def test_compaction_actually_fired(graphs):
    """Guard the guard: if nothing compacts, the compaction test proves nothing."""
    legacy, _ = graphs["compacted"]
    raw_legacy, _ = graphs["raw"]
    assert len(legacy) < len(raw_legacy), "no nodes were compacted on this fixture"


@pytest.mark.parametrize("stage", ["raw", "compacted"])
def test_same_compacted_members(graphs, stage):
    legacy, flat = graphs[stage]
    for sid in legacy:
        assert flat[sid]["compacted"] == legacy[sid]["compacted"], f"node {sid}"


def test_neighbors_keeps_duplicates(graphs):
    """`Node.neighbors()` concatenates two lists, so a node reachable from both
    sides appears twice. `Bubble._classify` compares those lists, so the flat
    version must not deduplicate."""
    g = graphs["flat"]
    legacy = graphs["legacy"]
    for i in range(g.n):
        sid = str(int(g.seg_id[i]))
        expected = sorted(int(x) for x in legacy.nodes[sid].neighbors())
        actual = [int(g.seg_id[j]) for j in g.neighbors(i)]
        assert sorted(actual) == expected, f"node {sid}"
