"""Native GBWT builder -> serve loop (GBWT migration Stage 3).

Proves the vg-free path: PangyPlot emits a pathdata intermediate from the paths
it parsed, the native Rust `gbwt-build` turns it into a compact graph.gbwt, and
the sidecar serves walks byte-identical to the binpaths. node = segment, no
translation (asserted), no vg anywhere.

Skipped unless both binaries are built (gbwt-build + gbwt-sidecar).
"""
import os
import socket
import subprocess
import tempfile
import time

import numpy as np
import pytest

from pangyplot.preprocess import gbwt_build
from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.db.indexes.PathIndex import PathIndex
from pangyplot.db.gbwt_client import GbwtClient
from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

REFERENCE = "gi|568815592"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR = os.path.join(REPO, "gbwt", "target", "release", "gbwt-sidecar")
BUILDER = os.path.join(REPO, "gbwt", "target", "release", "gbwt-build")

pytestmark = [
    pytest.mark.skipif(not os.path.exists(SIDECAR), reason="gbwt-sidecar not built"),
    pytest.mark.skipif(not os.path.exists(BUILDER), reason="gbwt-build not built"),
]


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


@pytest.fixture
def drb1_chr_dir(fixtures_dir):
    """A chr dir with binpaths parsed from the DRB1 GFA."""
    chr_dir = tempfile.mkdtemp()
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(gfa_file=str(fixtures_dir / "DRB1-3123.gfa"), ref=REFERENCE, path=None,
              ref_offset=0, path_sep=None, layout_coords=layout, dir=chr_dir)
    return chr_dir


def test_native_gbwt_serves_binpath_identical_walks(drb1_chr_dir):
    binpath_walks = _walks_from_index(PathIndex(drb1_chr_dir))

    out = gbwt_build.build_gbwt(drb1_chr_dir, builder_bin=BUILDER)
    assert out == gbwt_build.gbwt_path(drb1_chr_dir)
    assert os.path.exists(out)
    # The transient intermediate must be cleaned up.
    assert not os.path.exists(os.path.join(drb1_chr_dir, gbwt_build.PATHDATA_NAME))

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

        meta = client.meta()
        # Native build is compact: node = segment, so NO translation.
        assert meta["has_translation"] is False
        assert meta["paths"] > 0

        gbwt_walks = _walks_from_index(GbwtPathIndex(client))
        assert gbwt_walks == binpath_walks
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_native_metadata_matches_legacy(drb1_chr_dir):
    # Metadata parity: the native GBWT-backed index must expose the same sample
    # keys and per-subpath metadata (contig, start, length, bp ranges) as the
    # legacy PathIndex for the same data.
    from pangyplot.db.indexes.StepIndex import StepIndex

    step_index = StepIndex(drb1_chr_dir, REFERENCE)

    legacy = PathIndex(drb1_chr_dir)
    legacy.compute_bp_ranges(step_index)

    out = gbwt_build.build_gbwt(drb1_chr_dir, builder_bin=BUILDER)
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

        gbwt = GbwtPathIndex(client)
        gbwt.compute_bp_ranges(step_index)

        # Same sample keys (order-independent).
        assert set(gbwt.get_samples()) == set(legacy.get_samples())

        # Same per-subpath metadata for every sample.
        def norm(entry):
            return (entry.get("contig"), entry.get("start"), entry.get("length"),
                    entry.get("bp_start"), entry.get("bp_end"))

        for sample in legacy.get_samples():
            leg = [norm(e) for e in legacy.get_path_meta_with_bp(sample)]
            gb = [norm(e) for e in gbwt.get_path_meta_with_bp(sample)]
            assert gb == leg, f"metadata mismatch for {sample}: {gb} != {leg}"
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_emit_pathdata_roundtrips_counts(drb1_chr_dir):
    # The intermediate should list exactly the parsed subpaths.
    pi = PathIndex(drb1_chr_dir)
    n_subpaths = sum(len(pi.get_path_meta(s)) for s in pi.get_samples())

    out, n = gbwt_build.emit_pathdata(drb1_chr_dir)
    try:
        assert n == n_subpaths
        assert os.path.exists(out)
        assert open(out, "rb").read(4) == b"PPGB"
    finally:
        os.remove(out)
