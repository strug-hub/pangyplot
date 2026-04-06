import pathlib
import pytest
from flask import Flask

from pangyplot.routes import bp as routes_bp
from pangyplot.preprocess.parser.parse_cytoband import (
    parse_chromosome_list,
    parse_cytoband,
)
from pangyplot.db.db_utils import NumpyJSONEncoder

CYTOBAND_FIXTURES = pathlib.Path(__file__).parent.parent / "fixtures" / "cytoband"


@pytest.fixture
def app():
    """Minimal Flask app with cytoband data loaded from test fixtures."""
    app = Flask(__name__)
    app.json.default = NumpyJSONEncoder().default

    cytoband_file = CYTOBAND_FIXTURES / "test.cytoBand.txt"
    canonical_file = CYTOBAND_FIXTURES / "test.canonical.txt"

    chromosomes = parse_chromosome_list(canonical_file)
    app.cytoband = {
        "organism": "test",
        "genome": "testGenome",
        "chromosomes": chromosomes,
        "cytobands": parse_cytoband(cytoband_file, chromosomes),
    }
    # Simulate app.chromosomes (all loaded chroms, including non-canonical)
    app.chromosomes = chromosomes + ["chrUn_1", "chrM"]

    app.register_blueprint(routes_bp)
    return app


@pytest.fixture
def client(app):
    return app.test_client()
