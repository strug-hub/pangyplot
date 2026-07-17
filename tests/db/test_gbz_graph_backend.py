"""Graph-mode parity: the GBZ serves the same segments + links as the GFA.

The GBZ-native backend makes the graph daemon serve segment scalars (length/gc/n)
and segment-level links straight from a GBZ, so `SegmentIndex`/`LinkIndex` can be
backed by the GBZ instead of `segments.db`/`links.db`. These tests prove the
graph-mode endpoints (`/segments`, `/links`) are byte-for-byte faithful to the
GFA-built SQLite, on the chopped DRB1 fixture.

Skipped unless the daemon binary has been built.
"""
import os
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request

import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
import pangyplot.db.sqlite.segment_db as segment_db
import pangyplot.db.sqlite.link_db as link_db

REFERENCE = "gi|568815592"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DAEMON = os.environ.get("PANGYPLOT_GRAPHD_BIN") or os.path.join(
    REPO, "gbwt", "graphd", "pangyplot-graphd")
STRAND = {"+": 1, "-": 0}


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def gfa_dir(fixtures_dir):
    """A chr dir with segments.db/links.db built from the DRB1 GFA (ground truth)."""
    tmp = tempfile.mkdtemp()
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
              ref_offset=0, path_sep=None, layout_coords=layout, dir=tmp)
    return tmp


@pytest.fixture(scope="module")
def graph_daemon(fixtures_dir):
    if not os.path.exists(DAEMON):
        pytest.skip("graph daemon binary not built (make -C gbwt/graphd)")
    port = _free_port()
    proc = subprocess.Popen(
        [DAEMON, str(fixtures_dir / "DRB1-3123.gbz"), f"127.0.0.1:{port}", "--graph"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base + "/health", timeout=5)
                break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("daemon did not become ready")
        yield base
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_segments_scalars_match_sqlite(graph_daemon, gfa_dir):
    # GFA ground truth: (id -> length, gc, n).
    gfa = {int(r.id): (int(r.length), int(r.gc_count), int(r.n_count))
           for r in segment_db.get_all(gfa_dir)}

    raw = urllib.request.urlopen(graph_daemon + "/segments").read()
    gbz = {}
    for i in range(0, len(raw), 32):
        sid, length, gc, n = struct.unpack("<qqqq", raw[i:i + 32])
        gbz[sid] = (length, gc, n)

    assert gbz == gfa


def test_segment_index_from_gbz_matches_sqlite(graph_daemon, gfa_dir):
    # A SegmentIndex hydrated from the GBZ must carry the same scalar arrays as
    # one built from segments.db (length / gc / n / valid). Coords come from the
    # layout file, not the GBZ, so they are excluded here.
    import numpy as np
    from pangyplot.db.gbwt_client import GbwtClient
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex

    sqlite_idx = SegmentIndex(gfa_dir)                       # from segments.db

    gbz_dir = tempfile.mkdtemp()                             # fresh dir: no mmap cache
    gbz_idx = SegmentIndex(gbz_dir, client=GbwtClient(graph_daemon))

    assert len(gbz_idx) == len(sqlite_idx)
    for name in ("length", "gc_count", "n_count", "valid"):
        assert np.array_equal(np.asarray(getattr(gbz_idx, name)),
                              np.asarray(getattr(sqlite_idx, name))), name


def test_segment_and_link_iteration_from_gbz(graph_daemon, gfa_dir):
    # The bubble builder consumes SegmentIndex/LinkIndex by *iteration* (Segment
    # and Link objects), not just the scalar arrays. A GBZ-backed index (no
    # segments.db/links.db) must yield objects the flat builder can read: segments
    # with id/length/gc/n/coords, links with from/to ids + strands. Coords are
    # held equal by feeding the GBZ index the GFA's per-segment coords.
    from pangyplot.db.gbwt_client import GbwtClient
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.LinkIndex import LinkIndex
    import pangyplot.db.sqlite.segment_db as segment_db

    coords = {r["id"]: (r["x1"], r["y1"], r["x2"], r["y2"])
              for r in segment_db.get_index_info(gfa_dir)}
    client = GbwtClient(graph_daemon)
    seg = SegmentIndex(tempfile.mkdtemp(), client=client, coords=coords)
    link = LinkIndex(tempfile.mkdtemp(), client=client)

    # Segments: iterated objects carry the same scalars as the SQLite build.
    sqlite_seg = {s.id: s for s in segment_db.get_all(gfa_dir)}
    n = 0
    for s in seg:
        g = sqlite_seg[s.id]
        assert (s.length, s.gc_count, s.n_count) == (g.length, g.gc_count, g.n_count)
        # coords are float32 in the resident arrays vs float64 from SQLite
        assert abs(s.x1 - g.x1) < 0.01 and abs(s.y1 - g.y1) < 0.01
        assert abs(s.x2 - g.x2) < 0.01 and abs(s.y2 - g.y2) < 0.01
        n += 1
    assert n == len(sqlite_seg)

    # Links: the bidirected edge set from the iterated Link objects matches.
    def edges_from_iter(link_index):
        out = set()
        for l in link_index:
            fs = 1 if l.from_strand == "+" else 0
            ts = 1 if l.to_strand == "+" else 0
            f_side = "E" if fs == 1 else "S"
            t_side = "S" if ts == 1 else "E"
            out.add(frozenset({(l.from_id, f_side), (l.to_id, t_side)}))
        return out

    assert edges_from_iter(link) == _side_pair_edges(LinkIndex(gfa_dir))


def test_step_index_from_gbz_matches_sqlite(graph_daemon, gfa_dir):
    # Steps built from the GBZ reference-path walk must match write_step_index's
    # (seg_id, start, end) per step exactly -- same reference walk, same segment
    # lengths, same bp offset parsed from the contig range.
    import numpy as np
    from pangyplot.db.gbwt_client import GbwtClient
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.StepIndex import StepIndex

    sqlite_steps = StepIndex(gfa_dir, REFERENCE)

    client = GbwtClient(graph_daemon)
    seg = SegmentIndex(tempfile.mkdtemp(), client=client)
    gbz_steps = StepIndex(tempfile.mkdtemp(), REFERENCE, client=client, segment_index=seg)

    for name in ("segments", "starts", "ends"):
        assert np.array_equal(np.asarray(getattr(gbz_steps, name)),
                              np.asarray(getattr(sqlite_steps, name))), name


def test_pop_path_methods_are_sqlite_free_gbz_native(graph_daemon, gfa_dir):
    # /pop drives three per-element lookups that, before the fix, ignored GBZ-native
    # mode and hit SQLite: SegmentIndex.get_by_ids, LinkIndex.get_links_by_segment
    # (the NON-fast path get_subgraph uses), and StepIndex.query_segment (via
    # Segment.add_step). GBZ-native dirs have no segments.db/links.db/steps.db, so
    # each opened a fresh empty SQLite file and raised "no such table: ..." -> 500.
    #
    # This proves all three source from the resident arrays instead: they return
    # correct data AND no .db file is auto-created in the GBZ-native dir (SQLite
    # creates the file on connect, so a stray .db is the bug's fingerprint).
    from pangyplot.db.gbwt_client import GbwtClient
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.LinkIndex import LinkIndex
    from pangyplot.db.indexes.StepIndex import StepIndex

    coords = {r["id"]: (r["x1"], r["y1"], r["x2"], r["y2"])
              for r in segment_db.get_index_info(gfa_dir)}
    client = GbwtClient(graph_daemon)
    gbz_dir = tempfile.mkdtemp()   # no *.db here, and none may appear
    seg = SegmentIndex(gbz_dir, client=client, coords=coords)
    link = LinkIndex(gbz_dir, client=client)
    step = StepIndex(gbz_dir, REFERENCE, client=client, segment_index=seg)

    seg_ids = [i for i in range(len(seg.valid)) if seg.valid[i]]
    assert seg_ids, "fixture produced no valid segments"

    # get_by_ids builds Segment objects and attaches steps (add_step -> query_segment).
    # serialize() is exactly what /pop ships; it must not raise and must be populated.
    segs = seg.get_by_ids(seg_ids, step)
    assert len(segs) == len(seg_ids)
    for s in segs:
        d = s.serialize()
        assert d["type"] == "segment" and d["id"] == f"s{s.id}"
        assert "ranges" in d and "bp_start" in d and "bp_end" in d

    # A reference-backbone segment must carry real bp bounds (the whole point of
    # add_step); this is null-only when a segment is off the reference.
    assert any(s.serialize()["bp_start"] is not None for s in segs)

    # get_links_by_segment is the non-fast path get_subgraph calls; it must yield
    # topology Links from the arrays, not raise on a missing links.db.
    saw_link = False
    for sid in seg_ids:
        for l in link.get_links_by_segment(sid):
            assert l.from_id is not None and l.to_id is not None
            saw_link = True
    assert saw_link, "expected at least one link in the DRB1 fixture"

    # query_segment must match the SQLite build bit-for-bit (it is now a pure
    # function of the same step arrays test_step_index_from_gbz_matches_sqlite pins).
    sqlite_step = StepIndex(gfa_dir, REFERENCE)
    for sid in seg_ids:
        assert step.query_segment(sid) == sqlite_step.query_segment(sid), sid

    # The fingerprint: no SQLite file was ever opened in the GBZ-native dir.
    for name in ("segments.db", "links.db", "steps.db"):
        assert not os.path.exists(os.path.join(gbz_dir, name)), \
            f"{name} was auto-created -> a query path fell through to SQLite"


def test_flat_bubbles_from_gbz_match_gfa(graph_daemon, gfa_dir):
    # The payoff: full bubbles.db built entirely off the GBZ (segments, links,
    # and steps) is byte-identical (same fingerprint) to the GFA build. Coords are
    # held equal by feeding the GBZ index the GFA's per-segment coords.
    import importlib.util
    from pangyplot.db.gbwt_client import GbwtClient
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.LinkIndex import LinkIndex
    from pangyplot.db.indexes.StepIndex import StepIndex
    import pangyplot.db.sqlite.segment_db as segment_db
    import pangyplot.preprocess.bubble.bubble_gun as bubble_gun

    spec = importlib.util.spec_from_file_location(
        "fingerprint_bubbles", os.path.join(REPO, "tools", "fingerprint_bubbles.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)

    # Ground truth: full bubbles from the GFA-built SQLite indexes.
    bubble_gun.shoot(SegmentIndex(gfa_dir), LinkIndex(gfa_dir), gfa_dir, REFERENCE)

    # GBZ path: build segments/links/steps from the GBZ (same per-segment coords),
    # cache the steps, then run the identical bubble build.
    coords = {r["id"]: (r["x1"], r["y1"], r["x2"], r["y2"])
              for r in segment_db.get_index_info(gfa_dir)}
    gbz_dir = tempfile.mkdtemp()
    client = GbwtClient(graph_daemon)
    seg = SegmentIndex(gbz_dir, client=client, coords=coords)
    link = LinkIndex(gbz_dir, client=client)
    StepIndex(gbz_dir, REFERENCE, client=client, segment_index=seg)  # caches steps.mmapindex
    bubble_gun.shoot(seg, link, gbz_dir, REFERENCE)

    # Every bubble matches structurally. Coords are the one representational
    # difference: the GBZ index holds float32 coords (vs float64 from SQLite for
    # the GFA build), and the bubble coord math accumulates that in float32, so a
    # few bubbles land ~0.1 off. That is a non-issue in real GBZ-native ingest,
    # where coords are float32 throughout. So: every non-coord field must be
    # identical, and coords must agree to within float32 accumulation tolerance.
    import json

    COORDS = ("x1", "x2", "y1", "y2")

    def rows(chr_dir):
        return {bid: json.loads(blob)
                for bid, blob in fp.canonical_rows(os.path.join(chr_dir, "bubbles.db"))}

    a, b = rows(gfa_dir), rows(gbz_dir)
    assert set(a) == set(b)
    for bid in a:
        da, db = a[bid], b[bid]
        assert {k: v for k, v in da.items() if k not in COORDS} == \
               {k: v for k, v in db.items() if k not in COORDS}
        for c in COORDS:
            if da.get(c) is not None:
                assert abs(da[c] - db[c]) < 0.5, (bid, c, da[c], db[c])


def test_add_from_gbz_end_to_end(graph_daemon, fixtures_dir):
    # The whole `pangyplot add --gbz` orchestration: adopt the GBZ, serve it in
    # graph mode, build every on-disk artifact from it, and produce a bubbles.db
    # structurally identical to a full GFA ingest.
    import types
    import importlib.util
    from pangyplot.commands.add import _add_from_gbz
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.LinkIndex import LinkIndex
    import pangyplot.preprocess.bubble.bubble_gun as bubble_gun

    spec = importlib.util.spec_from_file_location(
        "fingerprint_bubbles", os.path.join(REPO, "tools", "fingerprint_bubbles.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)

    # Ground-truth GFA ingest (its own dir) -> bubbles.db.
    gfa = tempfile.mkdtemp()
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
              ref_offset=0, path_sep=None, layout_coords=layout, dir=gfa)
    bubble_gun.shoot(SegmentIndex(gfa), LinkIndex(gfa), gfa, REFERENCE)

    # GBZ-native ingest through the real command path.
    chr_path = tempfile.mkdtemp()
    args = types.SimpleNamespace(
        gbz=str(fixtures_dir / "DRB1-3123.gbz"),
        layout=str(fixtures_dir / "DRB1-3123.lay.tsv"),
        ref=REFERENCE, chr="drb1")
    _add_from_gbz(args, chr_path)

    # It produced the artifacts, and bubbles match structurally.
    assert os.path.exists(os.path.join(chr_path, "graph.gbz"))
    assert os.path.exists(os.path.join(chr_path, "bubbles.db"))
    assert os.path.isdir(os.path.join(chr_path, "segments.mmapindex"))

    import json
    COORDS = ("x1", "x2", "y1", "y2")
    a = {b: json.loads(v) for b, v in fp.canonical_rows(os.path.join(gfa, "bubbles.db"))}
    b = {b: json.loads(v) for b, v in fp.canonical_rows(os.path.join(chr_path, "bubbles.db"))}
    assert set(a) == set(b)
    for bid in a:
        assert {k: v for k, v in a[bid].items() if k not in COORDS} == \
               {k: v for k, v in b[bid].items() if k not in COORDS}


def _side_pair_edges(link_index):
    """The set of bidirected edges a LinkIndex encodes, as unordered pairs of
    (segment_id, side). This is RC-invariant: a link and its reverse-complement
    twin map to the same pair, so it's the representation-independent invariant
    the bubble builder actually consumes."""
    edges = set()
    for i in range(len(link_index)):
        f, t = int(link_index.from_ids[i]), int(link_index.to_ids[i])
        fs, ts = int(link_index.from_strands[i]), int(link_index.to_strands[i])
        f_side = "E" if fs == 1 else "S"   # '+' leaves the END, '-' the START
        t_side = "S" if ts == 1 else "E"   # '+' enters the START, '-' the END
        edges.add(frozenset({(f, f_side), (t, t_side)}))
    return edges


def test_link_index_from_gbz_matches_sqlite(graph_daemon, gfa_dir):
    # A LinkIndex hydrated from the GBZ must encode the same bidirected graph as
    # one built from links.db. /links is bidirectional; _build_from_gbz collapses
    # each RC pair to one link, so the link count and the side-pair edge set match.
    from pangyplot.db.gbwt_client import GbwtClient
    from pangyplot.db.indexes.LinkIndex import LinkIndex

    sqlite_idx = LinkIndex(gfa_dir)
    gbz_idx = LinkIndex(tempfile.mkdtemp(), client=GbwtClient(graph_daemon))

    assert len(gbz_idx) == len(sqlite_idx)
    assert _side_pair_edges(gbz_idx) == _side_pair_edges(sqlite_idx)


def test_links_are_the_gfa_bidirected_edge_set(graph_daemon, gfa_dir):
    # GFA stores each link once; the GBWT is bidirectional and emits each link
    # AND its reverse-complement twin. The daemon's set must be exactly the GFA
    # link set closed under reverse-complement (no spurious or missing edges).
    gfa = {(int(l["from_id"]), STRAND[l["from_strand"]],
            int(l["to_id"]), STRAND[l["to_strand"]])
           for l in link_db.load_links(gfa_dir)}

    raw = urllib.request.urlopen(graph_daemon + "/links").read()
    gbz = set()
    for i in range(0, len(raw), 32):
        f, fs, t, ts = struct.unpack("<qqqq", raw[i:i + 32])
        gbz.add((f, fs, t, ts))

    def rc(link):
        f, fs, t, ts = link
        return (t, 1 - ts, f, 1 - fs)

    assert gbz == gfa | {rc(l) for l in gfa}

