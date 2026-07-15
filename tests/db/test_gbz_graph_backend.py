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
