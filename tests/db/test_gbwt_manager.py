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
