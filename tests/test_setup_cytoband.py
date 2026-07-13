"""
Tests for app.setup_cytoband(), the bridge between .env and the ideogram.

Covers the ORGANISM=none escape hatch (which used to crash on open(None)) and
the ORGANISM=custom path that the pseudo-cytoband generator feeds.
"""
from types import SimpleNamespace

import pytest

from pangyplot.app import setup_cytoband
from pangyplot.preprocess import cytoband_generator
import pangyplot.organisms as organisms


@pytest.fixture
def env(monkeypatch):
    """Start from a clean slate -- a developer's real .env must not leak in."""
    for var in ("ORGANISM", "CYTOBAND_PATH", "CANONICAL_PATH"):
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


@pytest.fixture
def custom_cytoband(tmp_path):
    """A generated pseudo-cytoband, as `pangyplot cytoband` would produce."""
    lengths = [("chr1", 12_000_000), ("chr2", 8_500_000)]
    return cytoband_generator.write_cytoband(lengths, str(tmp_path), "myOrg")


class TestNoOrganism:
    def test_none_boots_with_empty_cytoband(self, env):
        # Regression: this used to reach parse_chromosome_list(None) -> TypeError.
        env.setenv("ORGANISM", organisms.NO_ORGANISM)

        app = SimpleNamespace()
        setup_cytoband(app)

        assert app.cytoband["organism"] == organisms.NO_ORGANISM
        assert app.cytoband["genome"] is None
        assert app.cytoband["chromosomes"] == []
        assert app.cytoband["cytobands"] == {}

    def test_unrecognized_organism_degrades_to_none(self, env):
        env.setenv("ORGANISM", "axolotl")

        app = SimpleNamespace()
        setup_cytoband(app)

        assert app.cytoband["organism"] == organisms.NO_ORGANISM
        assert app.cytoband["chromosomes"] == []


class TestBuiltinOrganism:
    def test_default_organism_loads_bundled_files(self, env):
        app = SimpleNamespace()
        setup_cytoband(app)

        assert app.cytoband["organism"] == organisms.DEFAULT_ORGANISM
        assert "chr1" in app.cytoband["chromosomes"]
        assert app.cytoband["cytobands"]["chr1"]


class TestCustomOrganism:
    def test_custom_loads_generated_cytoband(self, env, custom_cytoband):
        cytoband_path, canonical_path = custom_cytoband
        env.setenv("ORGANISM", organisms.CUSTOM_ORGANISM)
        env.setenv("CYTOBAND_PATH", cytoband_path)
        env.setenv("CANONICAL_PATH", canonical_path)

        app = SimpleNamespace()
        setup_cytoband(app)

        assert app.cytoband["organism"] == organisms.CUSTOM_ORGANISM
        assert app.cytoband["chromosomes"] == ["chr1", "chr2"]
        assert max(b["end"] for b in app.cytoband["cytobands"]["chr1"]) == 12_000_000

    def test_custom_without_paths_falls_back_to_default(self, env):
        env.setenv("ORGANISM", organisms.CUSTOM_ORGANISM)

        app = SimpleNamespace()
        setup_cytoband(app)

        assert app.cytoband["organism"] == organisms.DEFAULT_ORGANISM
        assert app.cytoband["chromosomes"]

    def test_custom_with_missing_files_degrades_to_none(self, env, tmp_path):
        env.setenv("ORGANISM", organisms.CUSTOM_ORGANISM)
        env.setenv("CYTOBAND_PATH", str(tmp_path / "nope.cytoBand.txt"))
        env.setenv("CANONICAL_PATH", str(tmp_path / "nope.canonical.txt"))

        app = SimpleNamespace()
        setup_cytoband(app)

        assert app.cytoband["organism"] == organisms.NO_ORGANISM
        assert app.cytoband["chromosomes"] == []
