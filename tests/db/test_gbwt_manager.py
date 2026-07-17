"""GbwtManager: graphd lifecycle for the GBWT path engine (Stage 3 plumbing).

Verifies the opt-in switch and the spawn/health-check/terminate cycle against the
real graphd binary (skipped if it isn't built). GBWT mode is off by default, so
these tests set PANGYPLOT_GBWT explicitly and restore the environment after.
"""
import os
import shutil

import pytest

from pangyplot.db.gbwt_manager import GbwtManager

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DAEMON = os.environ.get("PANGYPLOT_GRAPHD_BIN") or os.path.join(
    REPO, "gbwt", "graphd", "pangyplot-graphd")


@pytest.fixture
def clean_env(monkeypatch):
    for k in ("PANGYPLOT_GBWT", "PANGYPLOT_GBWT_BIN",
              "PANGYPLOT_GBWT_GBZ", "PANGYPLOT_GBWT_URLS"):
        monkeypatch.delenv(k, raising=False)
    return monkeypatch


def test_disabled_by_default(clean_env):
    mgr = GbwtManager(repo_root=REPO)
    assert mgr.enabled is False
    assert mgr.client_for_chrom("chrTest", "/nonexistent") is None


def test_enabled_but_missing_gbz_falls_back(clean_env, tmp_path):
    clean_env.setenv("PANGYPLOT_GBWT", "1")
    mgr = GbwtManager(repo_root=REPO)
    assert mgr.enabled is True
    # No graph.gbz in the dir -> warn and keep the legacy engine (None), no crash.
    assert mgr.client_for_chrom("chrTest", str(tmp_path)) is None


def test_spawns_and_serves(clean_env, tmp_path, fixtures_dir):
    if not os.path.exists(DAEMON):
        pytest.skip("gbwt-graphd binary not built")
    clean_env.setenv("PANGYPLOT_GBWT", "1")

    chr_dir = tmp_path / "chrDRB1"
    chr_dir.mkdir()
    shutil.copy(str(fixtures_dir / "DRB1-3123.gbz"), str(chr_dir / "graph.gbz"))

    mgr = GbwtManager(repo_root=REPO)
    try:
        client = mgr.client_for_chrom("chrDRB1", str(chr_dir))
        assert client is not None
        assert client.health() is True
        meta = client.meta()
        assert meta["paths"] > 0
    finally:
        mgr.shutdown()


class TestOneDaemonManyGraphs:
    """One daemon serves every chromosome; sharding is the opt-in.

    The old shape was a daemon per chromosome, so a 25-chr datastore meant 25
    processes and 25 ports. These pin the new default and the escape hatch.
    """

    def _datastore(self, tmp_path, fixtures_dir, chroms):
        for c in chroms:
            d = tmp_path / c
            d.mkdir()
            shutil.copy(str(fixtures_dir / "DRB1-3123.gbz"), str(d / "graph.gbz"))
        return tmp_path

    def test_one_process_serves_every_chromosome(self, clean_env, tmp_path, fixtures_dir):
        if not os.path.exists(DAEMON):
            pytest.skip("gbwt-graphd binary not built")
        clean_env.setenv("PANGYPLOT_GBWT", "1")
        root = self._datastore(tmp_path, fixtures_dir, ["chrA", "chrB", "chrC"])

        mgr = GbwtManager(repo_root=REPO, graph_path=str(root))
        try:
            clients = {c: mgr.client_for_chrom(c, str(root / c))
                       for c in ("chrA", "chrB", "chrC")}
            assert all(v is not None for v in clients.values())

            # The point: three chromosomes, ONE process, ONE port.
            assert len(mgr._procs) == 1
            assert len({c.base_url for c in clients.values()}) == 1

            # ...and each client is bound to its own graph, and works.
            assert {c: cl.graph for c, cl in clients.items()} == {
                "chrA": "chrA", "chrB": "chrB", "chrC": "chrC"}
            for cl in clients.values():
                assert cl.meta()["paths"] > 0
        finally:
            mgr.shutdown()

    def test_meta_advertises_the_graphs(self, clean_env, tmp_path, fixtures_dir):
        if not os.path.exists(DAEMON):
            pytest.skip("gbwt-graphd binary not built")
        clean_env.setenv("PANGYPLOT_GBWT", "1")
        root = self._datastore(tmp_path, fixtures_dir, ["chrA", "chrB"])

        mgr = GbwtManager(repo_root=REPO, graph_path=str(root))
        try:
            client = mgr.client_for_chrom("chrA", str(root / "chrA"))
            assert sorted(client.meta()["graphs"]) == ["chrA", "chrB"]
        finally:
            mgr.shutdown()

    def test_chromosome_without_an_index_keeps_the_legacy_engine(
            self, clean_env, tmp_path, fixtures_dir):
        if not os.path.exists(DAEMON):
            pytest.skip("gbwt-graphd binary not built")
        clean_env.setenv("PANGYPLOT_GBWT", "1")
        root = self._datastore(tmp_path, fixtures_dir, ["chrA"])
        (root / "chrNoIndex").mkdir()   # a chr dir with no graph.gbz

        mgr = GbwtManager(repo_root=REPO, graph_path=str(root))
        try:
            assert mgr.client_for_chrom("chrA", str(root / "chrA")) is not None
            # Not in the daemon, so no client -- a warning, not a crash.
            assert mgr.client_for_chrom("chrNoIndex", str(root / "chrNoIndex")) is None
        finally:
            mgr.shutdown()

    def test_external_url_shards_a_chromosome_away_from_the_daemon(
            self, clean_env, tmp_path, fixtures_dir):
        # PANGYPLOT_GBWT_URLS is the sharding opt-in: the named chromosome is
        # served by its own daemon elsewhere, and gets a client with NO selector
        # (that daemon holds one graph), while the rest use the shared one.
        if not os.path.exists(DAEMON):
            pytest.skip("gbwt-graphd binary not built")
        import json as _json
        clean_env.setenv("PANGYPLOT_GBWT", "1")
        root = self._datastore(tmp_path, fixtures_dir, ["chrA", "chrShard"])

        # Stand up the "external" single-graph daemon the way a shard would be run.
        shard = GbwtManager(repo_root=REPO, graph_path=str(root))
        try:
            probe = shard.client_for_chrom("chrA", str(root / "chrA"))
            assert probe is not None
            clean_env.setenv("PANGYPLOT_GBWT_URLS",
                             _json.dumps({"chrShard": probe.base_url}))

            mgr = GbwtManager(repo_root=REPO, graph_path=str(root))
            try:
                sharded = mgr.client_for_chrom("chrShard", str(root / "chrShard"))
                assert sharded is not None
                assert sharded.base_url == probe.base_url
                assert sharded.graph is None      # single-graph daemon: implied
                assert not mgr._procs             # nothing spawned for it
            finally:
                mgr.shutdown()
        finally:
            shard.shutdown()
