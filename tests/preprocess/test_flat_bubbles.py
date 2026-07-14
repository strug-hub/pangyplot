"""Flat bubble detection must find exactly the bubbles BubbleGun finds.

Compares the two implementations directly on the DRB1 graph: the same bubbles,
with the same source/sink orientation, the same interiors, and the same
simple/insertion/super classification.

Orientation is the subtle one. Legacy stores bubbles into `graph.bubbles[key]`
keyed on the (source, sink) pair, so reaching the same bubble from its other end
overwrites the entry and swaps its source and sink -- the surviving orientation
is whichever was found last. Getting that wrong flips bubbles without changing
their count, which is exactly the kind of bug a count-only test waves through.
"""
import tempfile
import shutil

import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.preprocess.bubble.bubble_gun import to_bubblegun_obj
from pangyplot.preprocess.bubble.compact_graph import compact_graph
from pangyplot.preprocess.bubble.flat_graph import build_flat_graph, compact
from pangyplot.preprocess.bubble.flat_bubbles import (
    find_bubbles as flat_find_bubbles, SIMPLE, INSERTION, SUPER,
)
import BubbleGun.find_bubbles as bg_find
import BubbleGun.Graph as BubbleGunGraph

REFERENCE = "gi|568815592"
KIND_NAME = {SIMPLE: "simple", INSERTION: "insertion", SUPER: "super"}


@pytest.fixture(scope="module")
def bubbles(fixtures_dir):
    """DRB1 bubbles from both implementations, keyed by (source, sink) segment ids."""
    tmpdir = tempfile.mkdtemp()
    try:
        layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
        _, segment_idx, link_idx = parse_gfa(
            gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
            ref_offset=0, path_sep=None, layout_coords=layout, dir=tmpdir,
        )

        legacy_graph = BubbleGunGraph.Graph()
        legacy_graph.nodes = to_bubblegun_obj(segment_idx, link_idx)
        compact_graph(legacy_graph)
        bg_find.find_bubbles(legacy_graph)

        legacy = {}
        for b in legacy_graph.bubbles.values():
            kind = "insertion" if b.is_insertion() else ("super" if b.is_super() else "simple")
            legacy[(int(b.source.id), int(b.sink.id))] = {
                "inside": sorted(int(n.id) for n in b.inside),
                "kind": kind,
            }

        g = compact(build_flat_graph(segment_idx, link_idx))
        fb = flat_find_bubbles(g)
        flat = {}
        for i in range(len(fb)):
            flat[(int(g.seg_id[fb.source[i]]), int(g.seg_id[fb.sink[i]]))] = {
                "inside": sorted(int(g.seg_id[j]) for j in fb.inside_of(i)),
                "kind": KIND_NAME[int(fb.kind[i])],
            }

        # Not Graph.bubble_number(): that counts via b_chains, which connect_bubbles
        # fills in later. Count the bubbles themselves, which is the like-for-like
        # comparison at this stage.
        legacy_counts = tuple(
            sum(1 for v in legacy.values() if v["kind"] == k)
            for k in ("simple", "super", "insertion")
        )
        yield {"legacy": legacy, "flat": flat, "counts": fb.counts(),
               "legacy_counts": legacy_counts}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_found_any(bubbles):
    """Guard the guard: an empty result would pass every other test here."""
    assert len(bubbles["legacy"]) > 100


def test_same_bubbles_with_same_orientation(bubbles):
    legacy, flat = bubbles["legacy"], bubbles["flat"]
    assert set(flat) == set(legacy), (
        f"only in flat: {sorted(set(flat) - set(legacy))[:5]}, "
        f"only in legacy: {sorted(set(legacy) - set(flat))[:5]}"
    )


def test_same_interiors(bubbles):
    legacy, flat = bubbles["legacy"], bubbles["flat"]
    bad = {k: (legacy[k]["inside"], flat[k]["inside"])
           for k in legacy if legacy[k]["inside"] != flat[k]["inside"]}
    assert not bad, f"{len(bad)} differ, e.g. {list(bad.items())[:2]}"


def test_same_classification(bubbles):
    legacy, flat = bubbles["legacy"], bubbles["flat"]
    bad = {k: (legacy[k]["kind"], flat[k]["kind"])
           for k in legacy if legacy[k]["kind"] != flat[k]["kind"]}
    assert not bad, f"{len(bad)} differ, e.g. {list(bad.items())[:3]}"


def test_same_counts(bubbles):
    """(simple, super, insertion), the ordering Graph.bubble_number() reports."""
    assert bubbles["counts"] == bubbles["legacy_counts"]
    # the numbers the pipeline prints for this fixture, pinned so a change is loud
    assert bubbles["counts"] == (599, 234, 41)
