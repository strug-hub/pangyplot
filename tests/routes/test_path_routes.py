"""Route tests for /pathorder, /path-meta, /path-data, /samples using DRB1."""

import shutil
import tempfile

import pytest
from flask import Flask

from pangyplot.routes import bp as routes_bp
from pangyplot.db.db_utils import NumpyJSONEncoder
from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

REFERENCE = "gi|568815592"
CHROM = "DRB1"
START = 32580000
END = 32585000


@pytest.fixture(scope="module")
def app(fixtures_dir):
    tmpdir = tempfile.mkdtemp()
    layout = parse_layout(str(fixtures_dir / "DRB1-3123.lay.tsv"))
    parse_gfa(
        str(fixtures_dir / "DRB1-3123.gfa"), REFERENCE,
        None, 0, None, layout, tmpdir,
    )
    bubble_gun.shoot(
        GFAIndex(tmpdir).segment_index,
        GFAIndex(tmpdir).link_index,
        tmpdir, REFERENCE,
    )

    gfaidx = GFAIndex(tmpdir)
    stepidx = StepIndex(tmpdir, REFERENCE)
    bubbleidx = BubbleIndex(tmpdir, gfaidx)

    app = Flask(__name__)
    app.json.default = NumpyJSONEncoder().default
    app.step_index = {(CHROM, REFERENCE): stepidx}
    app.bubble_index = {CHROM: bubbleidx}
    app.gfa_index = {CHROM: gfaidx}
    app.chromosomes = [CHROM]
    app.register_blueprint(routes_bp)

    yield app
    shutil.rmtree(tmpdir)


@pytest.fixture(scope="module")
def client(app):
    return app.test_client()


@pytest.fixture(scope="module")
def first_sample(app):
    with app.app_context():
        return app.gfa_index[CHROM].get_samples()[0]


# ---------------------------------------------------------------------------
# /samples
# ---------------------------------------------------------------------------

class TestSamplesRoute:

    def test_returns_200(self, client):
        resp = client.get("/samples")
        assert resp.status_code == 200

    def test_has_12_samples(self, client):
        resp = client.get("/samples")
        data = resp.get_json()
        assert len(data) == 12


# ---------------------------------------------------------------------------
# /pathorder
# ---------------------------------------------------------------------------

class TestPathOrderRoute:

    def test_returns_200(self, client):
        resp = client.get(
            f"/pathorder?genome={REFERENCE}&chromosome={CHROM}")
        assert resp.status_code == 200

    def test_has_12_entries(self, client):
        resp = client.get(
            f"/pathorder?genome={REFERENCE}&chromosome={CHROM}")
        data = resp.get_json()
        assert len(data) == 12


# ---------------------------------------------------------------------------
# /path (the GET route was removed -- no frontend caller, and it 500'd under the
# GBWT engine; the export seam get_paths is covered by test_gbz_parity, and the
# get_path query helper by test_query_functions)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# /path-meta
# ---------------------------------------------------------------------------

class TestPathMetaRoute:

    def test_returns_200(self, client, first_sample):
        resp = client.get(
            f"/path-meta?chromosome={CHROM}&sample={first_sample}")
        assert resp.status_code == 200

    def test_has_required_fields(self, client, first_sample):
        resp = client.get(
            f"/path-meta?chromosome={CHROM}&sample={first_sample}")
        data = resp.get_json()
        assert len(data) >= 1
        for entry in data:
            assert "file" in entry
            assert "full_id" in entry
            assert "contig" in entry
            assert "start" in entry

    def test_invalid_sample_empty(self, client):
        resp = client.get(
            f"/path-meta?chromosome={CHROM}&sample=NOSUCHSAMPLE")
        data = resp.get_json()
        assert data == []


# ---------------------------------------------------------------------------
# /path-data
# ---------------------------------------------------------------------------

class TestPathDataRoute:

    def test_returns_binary(self, client, first_sample):
        resp = client.get(
            f"/path-data?chromosome={CHROM}&sample={first_sample}&index=0")
        assert resp.status_code == 200
        assert len(resp.data) > 0

    def test_invalid_sample_404(self, client):
        resp = client.get(
            f"/path-data?chromosome={CHROM}&sample=NOSUCHSAMPLE&index=0")
        assert resp.status_code == 404
