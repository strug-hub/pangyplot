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
SIDECAR = os.path.join(REPO, "gbwt", "target", "release", "gbwt-sidecar")


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
                    "(cargo build --release --manifest-path gbwt/Cargo.toml)")
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

    def test_region_slice_parity_through_query(self, sidecar, drb1_gfa_index,
                                               drb1_step_index, drb1_bubble_index):
        # The Flask seam: query.get_path_region_raw must yield identical region
        # slices whether paths come from binpaths or the GBWT sidecar. Topology
        # (steps/bubbles) is the compact GFA; only the path source is swapped.
        from pangyplot.db import query
        from pangyplot.db.path_codec import decode_combined
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        CHROM, GENOME = "drb1", REFERENCE

        def make_indexes(gfa):
            idx = type("Idx", (), {})()
            idx.gfa_index = {CHROM: gfa}
            idx.step_index = {(CHROM, GENOME): drb1_step_index}
            idx.bubble_index = {CHROM: drb1_bubble_index}
            return idx

        start = int(min(drb1_step_index.starts))
        end = (start + int(max(drb1_step_index.ends))) // 2

        def region_slices(path_index):
            idx = make_indexes(drb1_gfa_index)
            out = set()
            for s in path_index.get_samples():
                for i, _ in enumerate(path_index.get_path_meta(s)):
                    raw = query.get_path_region_raw(idx, GENOME, CHROM, s, i, start, end)
                    out.add(tuple(decode_combined(raw).tolist()))
            return out

        binpath_slices = region_slices(drb1_gfa_index.path_index)

        orig = drb1_gfa_index.path_index
        drb1_gfa_index.path_index = GbwtPathIndex(GbwtClient(sidecar))
        try:
            gbwt_slices = region_slices(drb1_gfa_index.path_index)
        finally:
            drb1_gfa_index.path_index = orig

        assert binpath_slices == gbwt_slices

    def test_bp_ranges_match_binpaths(self, sidecar, pangyplot_paths, drb1_step_index):
        # compute_bp_ranges must yield the same (bp_start, bp_end) per subpath
        # whether the walk comes from binpaths or the GBWT sidecar -- both read
        # the identical walk and the identical StepIndex, so /path-meta labels and
        # region windows agree across the two engines.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        pangyplot_paths.compute_bp_ranges(drb1_step_index)
        gpi = GbwtPathIndex(GbwtClient(sidecar))
        gpi.compute_bp_ranges(drb1_step_index)

        # Compare the multiset of bp ranges (sample keying differs between the
        # engines; the set of subpath windows must not).
        def ranges_of(index):
            out = []
            for s in index.get_samples():
                for e in index.get_path_meta_with_bp(s):
                    out.append((e["bp_start"], e["bp_end"]))
            return sorted(out, key=lambda r: (r[0] is None, r))

        assert ranges_of(gpi) == ranges_of(pangyplot_paths)

    def test_sample_idx_is_a_stable_bijection(self, sidecar):
        # /pathorder needs a sample -> contiguous index map. Every sample present
        # gets exactly one index, and the indices are 0..N-1 with no gaps.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        gpi = GbwtPathIndex(GbwtClient(sidecar))
        idx = gpi.get_sample_idx()
        assert set(idx.keys()) == set(gpi.get_samples())
        assert sorted(idx.values()) == list(range(len(gpi.get_samples())))

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
