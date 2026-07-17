"""Parity: the GBWT graphd's path walks == PangyPlot's custom binpath storage.

This is the load-bearing correctness test for the GBWT path-engine migration:
serving paths from a GBZ must return byte-identical walks to the binpath format
it replaces. It caught a real bug (vg chops long segments on GFA->GBZ, so raw
node ids != segment ids; the graphd must use the node->segment translation).

Integration test: builds PangyPlot binpaths from the DRB1 fixture GFA, starts the
C++ graphd on the matching (chopped) DRB1 GBZ fixture, and compares the full set
of walks. Skipped if the graphd binary hasn't been built.
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
DAEMON = os.environ.get("PANGYPLOT_GRAPHD_BIN") or os.path.join(
    REPO, "gbwt", "graphd", "pangyplot-graphd")


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _get(url, binary=False):
    with urllib.request.urlopen(url, timeout=10) as r:
        return r.read() if binary else json.load(r)


@pytest.fixture(scope="module")
def graphd(fixtures_dir):
    if not os.path.exists(DAEMON):
        pytest.skip("gbwt-graphd binary not built "
                    "(build it: make -C gbwt/graphd)")
    gbz = str(fixtures_dir / "DRB1-3123.gbz")
    port = _free_port()
    proc = subprocess.Popen([DAEMON, gbz, f"127.0.0.1:{port}"],
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
            raise RuntimeError("graphd did not become ready")
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
    def test_walks_are_identical(self, graphd, pangyplot_paths):
        gbz_walks, meta = _gbz_walks(graphd)
        pp_walks = _pangyplot_walks(pangyplot_paths)
        assert gbz_walks, "no walks from GBZ"
        assert pp_walks, "no walks from PangyPlot"
        # The set of decoded walks must match exactly — same segment ids, same
        # orientation, same order. This is what "GBZ replaces binpaths" means.
        assert gbz_walks == pp_walks, (
            f"walks differ: only in GBZ={len(gbz_walks - pp_walks)}, "
            f"only in PangyPlot={len(pp_walks - gbz_walks)}"
        )

    def test_chopped_gbz_uses_translation(self, graphd):
        # The DRB1 GBZ is chopped (has a node->segment translation); parity above
        # therefore proves the graphd collapses chopped nodes via segment_path.
        _, meta = _gbz_walks(graphd)
        assert meta["has_translation"] is True

    def test_get_paths_rebuilds_walks_for_export(self, graphd):
        # get_paths (the GFA/layout export seam) used to raise NotImplementedError
        # under GBWT, which 500'd /gfa, /layout and /path. It now rebuilds Path
        # objects from the graphd walks. Each Path must iterate the exact
        # (seg_id, strand) sequence get_path_combined decodes -- that is what the
        # export writes as P-line steps -- and it must never raise again.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        gpi = GbwtPathIndex(GbwtClient(graphd))
        saw_steps = False
        for sample in gpi.get_samples():
            paths = gpi.get_paths(sample)                    # must not raise
            assert len(paths) == len(gpi.get_path_meta(sample))
            for i, path in enumerate(paths):
                combined = gpi.get_path_combined(sample, i).tolist()
                # combined = (seg_id << 1) | orient, + = 0 / - = 1
                expected = [(c >> 1, '+' if (c & 1) == 0 else '-') for c in combined]
                assert list(path) == expected                # export iterates the walk
                assert path.sample is not None               # P-line name is buildable
                if expected:
                    saw_steps = True
        assert saw_steps, "fixture yielded no path steps"

    def test_region_slice_parity_through_query(self, graphd, drb1_gfa_index,
                                               drb1_step_index, drb1_bubble_index):
        # The Flask seam: query.get_path_region_raw must yield identical region
        # slices whether paths come from binpaths or the GBWT graphd. Topology
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
        drb1_gfa_index.path_index = GbwtPathIndex(GbwtClient(graphd))
        try:
            gbwt_slices = region_slices(drb1_gfa_index.path_index)
        finally:
            drb1_gfa_index.path_index = orig

        assert binpath_slices == gbwt_slices

    def test_bp_ranges_match_binpaths(self, graphd, pangyplot_paths, drb1_step_index):
        # compute_bp_ranges must yield the same (bp_start, bp_end) per subpath
        # whether the walk comes from binpaths or the GBWT graphd -- both read
        # the identical walk and the identical StepIndex, so /path-meta labels and
        # region windows agree across the two engines.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        pangyplot_paths.compute_bp_ranges(drb1_step_index)
        gpi = GbwtPathIndex(GbwtClient(graphd))
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

    def test_bp_ranges_cached_to_disk_and_reused(self, graphd, drb1_step_index, tmp_path):
        # compute_bp_ranges walks every subpath in full, which on a whole-genome
        # v2 datastore was ~1 min per chromosome -- ~25 min of every server start
        # recomputing what add already computed. Cache it, as PathIndex does.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex, BP_RANGES_CACHE

        gpi = GbwtPathIndex(GbwtClient(graphd), str(tmp_path))
        gpi.compute_bp_ranges(drb1_step_index)
        expected = {s: gpi._subpath_bp_ranges[s] for s in gpi.get_samples()}
        assert (tmp_path / BP_RANGES_CACHE).exists()

        # A second index over the same dir must reuse the file, not re-walk. The
        # client is poisoned so any /walk raises -- proving the cache was used
        # rather than merely that the answer came out the same.
        fresh = GbwtPathIndex(GbwtClient(graphd), str(tmp_path))

        def explode(_):
            raise AssertionError("walked despite a valid cache")

        fresh.client.walk = explode
        fresh.compute_bp_ranges(drb1_step_index)
        assert {s: fresh._subpath_bp_ranges[s] for s in fresh.get_samples()} == expected

    def test_stale_bp_ranges_cache_is_rejected(self, graphd, drb1_step_index, tmp_path):
        # A cache written against a different graph would silently mislabel every
        # subpath's coordinates, which is worse than no cache. The signature must
        # catch it and force a recompute.
        import json
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex, BP_RANGES_CACHE

        gpi = GbwtPathIndex(GbwtClient(graphd), str(tmp_path))
        gpi.compute_bp_ranges(drb1_step_index)
        good = {s: gpi._subpath_bp_ranges[s] for s in gpi.get_samples()}

        cache = tmp_path / BP_RANGES_CACHE
        data = json.loads(cache.read_text())
        data["signature"] = {s: n + 1 for s, n in data["signature"].items()}
        data["ranges"] = {s: [[-1, -1] for _ in rr] for s, rr in data["ranges"].items()}
        cache.write_text(json.dumps(data))

        fresh = GbwtPathIndex(GbwtClient(graphd), str(tmp_path))
        fresh.compute_bp_ranges(drb1_step_index)
        assert {s: fresh._subpath_bp_ranges[s] for s in fresh.get_samples()} == good

    def test_no_db_dir_still_computes(self, graphd, drb1_step_index):
        # The dir is optional; without it there is nowhere to cache, and
        # compute_bp_ranges must still work rather than blow up on a None path.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        gpi = GbwtPathIndex(GbwtClient(graphd))
        gpi.compute_bp_ranges(drb1_step_index)
        assert gpi._subpath_bp_ranges

    def test_sample_idx_is_a_stable_bijection(self, graphd):
        # /pathorder needs a sample -> contiguous index map. Every sample present
        # gets exactly one index, and the indices are 0..N-1 with no gaps.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        gpi = GbwtPathIndex(GbwtClient(graphd))
        idx = gpi.get_sample_idx()
        assert set(idx.keys()) == set(gpi.get_samples())
        assert sorted(idx.values()) == list(range(len(gpi.get_samples())))

    def test_python_path_source_matches_binpaths(self, graphd, pangyplot_paths):
        # Route through the real Python stack: GbwtClient -> GbwtPathIndex ->
        # get_path_combined, exactly as serving will. Walk set must still match.
        from pangyplot.db.gbwt_client import GbwtClient
        from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

        gpi = GbwtPathIndex(GbwtClient(graphd))
        gbwt_walks = set()
        for sample in gpi.get_samples():
            for i, _ in enumerate(gpi.get_path_meta(sample)):
                c = gpi.get_path_combined(sample, i)
                gbwt_walks.add(tuple(int(x) for x in c.tolist()))

        pp_walks = _pangyplot_walks(pangyplot_paths)
        assert gbwt_walks == pp_walks
