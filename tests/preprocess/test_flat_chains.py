"""Flat chain assembly must reproduce BubbleGun's chains and its exact numbering.

This is the stage that assigns bubble.id and chain.id, and those ids are the
primary keys of bubbles.db and are referenced by parent/children/siblings. So
"same chains" is not enough: the ids themselves must match, or every row in the
datastore is renumbered even though the graph is unchanged.

Ordering here goes through segment ids, not node indices. Legacy sorts on
int(node.id), which is the segment id; node indices are a different numbering
and using them would silently renumber every chain.
"""
import tempfile
import shutil

import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.preprocess.bubble.bubble_gun import to_bubblegun_obj
from pangyplot.preprocess.bubble.compact_graph import compact_graph
from pangyplot.preprocess.bubble.flat_graph import build_flat_graph, compact
from pangyplot.preprocess.bubble.flat_bubbles import find_bubbles as flat_find_bubbles
from pangyplot.preprocess.bubble.flat_chains import (
    connect_bubbles as flat_connect, find_parents as flat_find_parents,
)
import BubbleGun.find_bubbles as bg_find
import BubbleGun.connect_bubbles as bg_connect
import BubbleGun.find_parents as bg_parents
import BubbleGun.Graph as BubbleGunGraph

REFERENCE = "gi|568815592"


@pytest.fixture(scope="module")
def both(fixtures_dir):
    tmpdir = tempfile.mkdtemp()
    try:
        layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
        _, segment_idx, link_idx = parse_gfa(
            gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
            ref_offset=0, path_sep=None, layout_coords=layout, dir=tmpdir,
        )

        lg = BubbleGunGraph.Graph()
        lg.nodes = to_bubblegun_obj(segment_idx, link_idx)
        compact_graph(lg)
        bg_find.find_bubbles(lg)
        bg_connect.connect_bubbles(lg)
        bg_parents.find_parents(lg)

        # legacy: bubble id -> its facts, and chain id -> ordered bubble ids
        legacy_bubbles, legacy_chains = {}, {}
        for chain in lg.b_chains:
            legacy_chains[int(chain.id)] = [int(b.id) for b in chain.sorted]
            for b in chain.sorted:
                legacy_bubbles[int(b.id)] = {
                    "chain": int(b.chain_id),
                    "source": int(b.source.id),
                    "sink": int(b.sink.id),
                    "inside": sorted(int(n.id) for n in b.inside),
                    "parent": int(b.parent_sb),
                }

        g = compact(build_flat_graph(segment_idx, link_idx))
        fb = flat_find_bubbles(g)
        fc = flat_connect(g, fb)
        flat_find_parents(g, fb)

        flat_bubbles, flat_chains = {}, {}
        for c in range(len(fc)):
            members = [int(x) for x in fc.bubbles_of(c)]
            chain_id = int(fb.chain_id[members[0]])
            flat_chains[chain_id] = [int(fb.id[b]) for b in members]
            for b in members:
                flat_bubbles[int(fb.id[b])] = {
                    "chain": int(fb.chain_id[b]),
                    "source": int(g.seg_id[fb.source[b]]),
                    "sink": int(g.seg_id[fb.sink[b]]),
                    "inside": sorted(int(g.seg_id[n]) for n in fb.inside_of(b)),
                    "parent": int(fb.parent_sb[b]),
                }

        yield {"legacy_bubbles": legacy_bubbles, "flat_bubbles": flat_bubbles,
               "legacy_chains": legacy_chains, "flat_chains": flat_chains}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_found_chains(both):
    """Guard the guard: empty results would satisfy every comparison below."""
    assert len(both["legacy_chains"]) > 10
    assert len(both["legacy_bubbles"]) > 100


def test_same_chain_ids(both):
    assert sorted(both["flat_chains"]) == sorted(both["legacy_chains"])


def test_same_chain_membership_and_order(both):
    legacy, flat = both["legacy_chains"], both["flat_chains"]
    bad = {c: (legacy[c], flat[c]) for c in legacy if legacy[c] != flat[c]}
    assert not bad, f"{len(bad)} chains differ, e.g. {list(bad.items())[:2]}"


def test_same_bubble_ids(both):
    assert sorted(both["flat_bubbles"]) == sorted(both["legacy_bubbles"])


def test_same_bubble_facts(both):
    """Same id -> same chain, source, sink, interior, and parent superbubble."""
    legacy, flat = both["legacy_bubbles"], both["flat_bubbles"]
    bad = {b: (legacy[b], flat[b]) for b in legacy if legacy[b] != flat[b]}
    assert not bad, f"{len(bad)} bubbles differ, e.g. {list(bad.items())[:2]}"


def test_parents_were_actually_assigned(both):
    """Otherwise test_same_bubble_facts would pass with parent=0 everywhere."""
    assigned = sum(1 for v in both["legacy_bubbles"].values() if v["parent"])
    assert assigned > 0, "no bubble got a parent; the parent comparison is vacuous"
