"""Parity: the GBWT sidecar's path walks == PangyPlot's custom binpath storage.

This is the load-bearing correctness test for the GBWT path-engine migration:
serving paths from a GBZ must return byte-identical walks to the binpath format
it replaces. It caught a real bug (vg chops long segments on GFA->GBZ, so raw
node ids != segment ids; the sidecar must use the node->segment translation).

Integration test: builds PangyPlot binpaths from the DRB1 fixture GFA, starts the
Rust sidecar on the matching DRB1 GBZ fixture, and compares the full set of walks.
Skipped if the sidecar binary hasn't been built (e.g. CI without a Rust toolchain).
"""
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request

import numpy as np
import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.db.indexes.PathIndex import PathIndex

REFERENCE = "gi|568815592"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR = os.path.join(REPO, "tools", "gbwt-sidecar", "target", "release", "gbwt-sidecar")


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _get(url, binary=False):
    with urllib.request.urlopen(url, timeout=10) as r:
        return r.read() if binary else json.load(r)


@pytest.fixture(scope="module")
def sidecar(fixtures_dir):
    if not os.path.exists(SIDECAR):
        pytest.skip("gbwt-sidecar binary not built "
                    "(cargo build --release --manifest-path tools/gbwt-sidecar/Cargo.toml)")
    gbz = str(fixtures_dir / "DRB1-3123.gbz")
    port = _free_port()
    proc = subprocess.Popen([SIDECAR, gbz, f"127.0.0.1:{port}"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                _get(base + "/health", binary=True)
                break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("sidecar did not become ready")
        yield base
    finally:
        proc.terminate()
        proc.wait(timeout=5)


@pytest.fixture(scope="module")
def pangyplot_paths(fixtures_dir):
    tmp = tempfile.mkdtemp()
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
              ref_offset=0, path_sep=None, layout_coords=layout, dir=tmp)
    return PathIndex(tmp)


def _gbz_walks(base):
    meta = _get(base + "/meta")
    walks = set()
    for p in meta["path_list"]:
        raw = _get(base + f"/walk?path={p['id']}", binary=True)
        walks.add(tuple(np.frombuffer(raw, dtype="<i8").tolist()))
    return walks, meta


def _pangyplot_walks(pi):
    walks = set()
    for sample in pi.get_samples():
        for i, _ in enumerate(pi.get_path_meta(sample)):
            walks.add(tuple(int(x) for x in pi.get_path_combined(sample, i).tolist()))
    return walks


class TestGbzBinpathParity:
    def test_walks_are_identical(self, sidecar, pangyplot_paths):
        gbz_walks, meta = _gbz_walks(sidecar)
        pp_walks = _pangyplot_walks(pangyplot_paths)
        assert gbz_walks, "no walks from GBZ"
        assert pp_walks, "no walks from PangyPlot"
        # The set of decoded walks must match exactly — same segment ids, same
        # orientation, same order. This is what "GBZ replaces binpaths" means.
        assert gbz_walks == pp_walks, (
            f"walks differ: only in GBZ={len(gbz_walks - pp_walks)}, "
            f"only in PangyPlot={len(pp_walks - gbz_walks)}"
        )

    def test_chopped_gbz_uses_translation(self, sidecar):
        # The DRB1 GBZ is chopped (has a node->segment translation); parity above
        # therefore proves the sidecar collapses chopped nodes via segment_path.
        _, meta = _gbz_walks(sidecar)
        assert meta["has_translation"] is True

    def test_python_path_source_matches_binpaths(self, sidecar, pangyplot_paths):
        # Route through the real Python stack: GbwtClient -> GbwtPathIndex ->
        # get_path_combined, exactly as serving will. Walk set must still match.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        gpi = GbwtPathIndex(GbwtClient(sidecar))
        gbwt_walks = set()
        for sample in gpi.get_samples():
            for i, _ in enumerate(gpi.get_path_meta(sample)):
                c = gpi.get_path_combined(sample, i)
                gbwt_walks.add(tuple(int(x) for x in c.tolist()))

        pp_walks = _pangyplot_walks(pangyplot_paths)
        assert gbwt_walks == pp_walks
