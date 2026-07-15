"""Ingest -> serve loop for the GBWT path engine (Stage 3).

Proves that a GBZ *built by the ingest module* (`vg gbwt`, not a checked-in
fixture) serves walks byte-identical to the binpaths built from the same GFA.
This closes the loop the fixture-based parity test can't: it exercises the actual
`pangyplot add` GBZ production path.

Skipped unless both vg and the sidecar binary are available.
"""
import os
import shutil
import socket
import subprocess
import tempfile
import time

import numpy as np
import pytest

from pangyplot.preprocess import gbz as gbz_build
from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.db.indexes.PathIndex import PathIndex
from pangyplot.db.gbwt_client import GbwtClient
from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

REFERENCE = "gi|568815592"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR = os.path.join(REPO, "tools", "gbwt-sidecar", "target", "release", "gbwt-sidecar")


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _walks_from_index(index):
    walks = set()
    for sample in index.get_samples():
        for i, _ in enumerate(index.get_path_meta(sample)):
            c = index.get_path_combined(sample, i)
            walks.add(tuple(int(x) for x in c.tolist()))
    return walks


@pytest.mark.skipif(shutil.which("vg") is None, reason="vg not installed")
@pytest.mark.skipif(not os.path.exists(SIDECAR), reason="gbwt-sidecar not built")
def test_built_gbz_serves_binpath_identical_walks(fixtures_dir):
    chr_dir = tempfile.mkdtemp()

    # Binpaths from the GFA (the engine we must match).
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
              ref_offset=0, path_sep=None, layout_coords=layout, dir=chr_dir)
    binpath_walks = _walks_from_index(PathIndex(chr_dir))

    # GBZ built by the ingest module from the same GFA, dropped as graph.gbz.
    out = gbz_build.build_gbz_from_gfa(str(fixtures_dir / "DRB1-3123.gfa"), chr_dir)
    assert out == gbz_build.gbz_path(chr_dir)
    assert os.path.exists(out)

    # Serve it and compare walk sets.
    port = _free_port()
    proc = subprocess.Popen([SIDECAR, out, f"127.0.0.1:{port}"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        client = GbwtClient(f"http://127.0.0.1:{port}")
        for _ in range(100):
            if client.health():
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("sidecar did not become ready")

        gbwt_walks = _walks_from_index(GbwtPathIndex(client))
        assert gbwt_walks == binpath_walks
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_adopt_gbz_copies_to_graph_gbz(fixtures_dir):
    chr_dir = tempfile.mkdtemp()
    out = gbz_build.adopt_gbz(str(fixtures_dir / "DRB1-3123.gbz"), chr_dir)
    assert out == gbz_build.gbz_path(chr_dir)
    assert os.path.exists(out)
    # Identical bytes to the source.
    assert (open(out, "rb").read()
            == open(str(fixtures_dir / "DRB1-3123.gbz"), "rb").read())


def test_build_gbz_missing_vg_raises(fixtures_dir):
    chr_dir = tempfile.mkdtemp()
    with pytest.raises(RuntimeError, match="not found"):
        gbz_build.build_gbz_from_gfa(str(fixtures_dir / "DRB1-3123.gfa"),
                                     chr_dir, vg_bin="definitely-not-vg-binary")
