"""Route tests for /genes and /search endpoints.

Uses the synthetic DRB1-region GFF3 fixture (chr6, 32578000–32590000)
with a DRB1 step index for coordinate conversion.
"""

import shutil
import tempfile

import pytest
from flask import Flask

from pangyplot.routes import bp as routes_bp
from pangyplot.db.db_utils import NumpyJSONEncoder
from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.preprocess.parser.parse_gff3 import parse_gff3
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.AnnotationIndex import AnnotationIndex

REFERENCE = "gi|568815592"
CHROM = "DRB1"
ANN_CHROM = "chr6"  # chrom in the GFF3 fixture


@pytest.fixture(scope="module")
def app(fixtures_dir):
    """Flask app with DRB1 step index and annotation index loaded."""
    tmpdir = tempfile.mkdtemp()
    ann_dir = tempfile.mkdtemp()

    # Build step index from DRB1
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(
        str(fixtures_dir / "DRB1-3123.gfa"), REFERENCE,
        None, 0, None, layout, tmpdir,
    )
    stepidx = StepIndex(tmpdir, REFERENCE)

    # Build annotation index from synthetic GFF3
    parse_gff3(str(fixtures_dir / "drb1_annotations.gff3"), ann_dir)
    annidx = AnnotationIndex("test", ann_dir)

    app = Flask(__name__)
    app.json.default = NumpyJSONEncoder().default
    app.step_index = {(CHROM, REFERENCE): stepidx, (ANN_CHROM, REFERENCE): stepidx}
    app.annotation_index = {REFERENCE: annidx}
    app.genome = REFERENCE
    app.register_blueprint(routes_bp)

    yield app
    shutil.rmtree(tmpdir)
    shutil.rmtree(ann_dir)


@pytest.fixture(scope="module")
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# /genes
# ---------------------------------------------------------------------------

class TestGenesRoute:

    def test_returns_200(self, client):
        resp = client.get(
            f"/genes?genome={REFERENCE}&chromosome={ANN_CHROM}"
            f"&start=32578000&end=32590000")
        assert resp.status_code == 200

    def test_finds_drb1_and_tiny(self, client):
        resp = client.get(
            f"/genes?genome={REFERENCE}&chromosome={ANN_CHROM}"
            f"&start=32578000&end=32590000")
        data = resp.get_json()
        names = {g["gene"] for g in data["genes"]}
        assert "HLA-DRB1" in names
        assert "TINY1" in names

    def test_mane_only(self, client):
        resp = client.get(
            f"/genes?genome={REFERENCE}&chromosome={ANN_CHROM}"
            f"&start=32578000&end=32590000&mane_only=true")
        data = resp.get_json()
        names = {g["gene"] for g in data["genes"]}
        assert "HLA-DRB1" in names
        assert "TINY1" not in names

    def test_narrow_range_excludes_tiny(self, client):
        # TINY1 is at 32588000-32589500
        resp = client.get(
            f"/genes?genome={REFERENCE}&chromosome={ANN_CHROM}"
            f"&start=32578000&end=32587500")
        data = resp.get_json()
        names = {g["gene"] for g in data["genes"]}
        assert "TINY1" not in names

    def test_missing_genome_404(self, client):
        resp = client.get(
            f"/genes?genome=INVALID&chromosome={CHROM}"
            f"&start=32578000&end=32590000")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /search
# ---------------------------------------------------------------------------

class TestSearchRoute:

    def test_search_finds_drb1(self, client):
        resp = client.get("/search?type=gene&query=DRB")
        data = resp.get_json()
        names = {r["gene"] for r in data}
        assert "HLA-DRB1" in names

    def test_search_case_insensitive(self, client):
        resp = client.get("/search?type=gene&query=drb")
        data = resp.get_json()
        names = {r["gene"] for r in data}
        assert "HLA-DRB1" in names

    def test_search_no_match(self, client):
        resp = client.get("/search?type=gene&query=zzzzz")
        data = resp.get_json()
        assert len(data) == 0
