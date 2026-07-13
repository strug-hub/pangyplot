"""Security regression tests for the file-serving routes.

Guards against path traversal via the ``chromosome``/``ref`` query params on
the five static-file routes, and against unsolicited disk writes via
``/debug-log``. See FEATURE_CATALOG.md §3b (2, 3).

These assert the fix in pangyplot/routes.py: ``_safe_chrom`` (allowlist against
``current_app.chromosomes``), ``_safe_ref`` (token check + ``..`` rejection),
and the debug-mode gate + filename sanitisation on ``/debug-log``.
"""

import gzip
import pathlib

import pytest
from flask import Flask

import pangyplot.routes as routes_module
from pangyplot.routes import bp as routes_bp
from pangyplot.db.db_utils import NumpyJSONEncoder

VALID_CHROM = "chr1"
REF = "testRef"

# Routes that build a filesystem path from the `chromosome` query param.
FILE_ROUTES = [
    "/skeleton",
    "/skeleton-bin",
    "/spine",
    "/polychain-data",
    "/graph-meta",
]

# Values that would escape the datastore if interpolated unchecked. Flask
# url-decodes the query string, so the %2f form arrives as a real separator.
TRAVERSAL_VALUES = [
    "../../../../../../etc/passwd",
    "../../wsgi",
    "..%2f..%2f..%2fetc%2fpasswd",
    "/etc/passwd",
    "chr1/../../../etc/passwd",
]


@pytest.fixture
def app(tmp_path):
    """Flask app whose datastore holds real files only for VALID_CHROM."""
    app = Flask(__name__)
    app.json.default = NumpyJSONEncoder().default
    app.chromosomes = [VALID_CHROM, "chrM"]
    app.genome = REF
    app.debug_mode = False
    app.data_dir = str(tmp_path)
    app.db_name = "testdb"

    chrom_dir = tmp_path / "graphs" / "testdb" / VALID_CHROM
    (chrom_dir / "skeleton").mkdir(parents=True)
    (chrom_dir / "skeleton" / "meta.json.gz").write_bytes(gzip.compress(b'{"levels":[]}'))
    (chrom_dir / "skeleton" / "polylines.bin.gz").write_bytes(gzip.compress(b"\x00\x01"))
    (chrom_dir / "skeleton" / f"spine.{REF}.json.gz").write_bytes(gzip.compress(b'{"points":[]}'))
    (chrom_dir / "polychain-data.json.gz").write_bytes(gzip.compress(b'{"chains":[]}'))
    (chrom_dir / "meta.json").write_text('{"total_segments":1}')

    app.register_blueprint(routes_bp)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# Path traversal is rejected before the filesystem is touched
# ---------------------------------------------------------------------------

class TestFileRouteTraversalBlocked:

    @pytest.mark.parametrize("route", FILE_ROUTES)
    @pytest.mark.parametrize("evil", TRAVERSAL_VALUES)
    def test_traversal_chromosome_400(self, client, route, evil):
        resp = client.get(f"{route}?chromosome={evil}")
        assert resp.status_code == 400, f"{route} accepted {evil!r}"

    @pytest.mark.parametrize("route", FILE_ROUTES)
    def test_unknown_chromosome_400(self, client, route):
        resp = client.get(f"{route}?chromosome=chrDOESNOTEXIST")
        assert resp.status_code == 400

    @pytest.mark.parametrize("route", FILE_ROUTES)
    def test_missing_chromosome_400(self, client, route):
        resp = client.get(route)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Valid chromosomes still pass the guard (fix does not break the happy path)
# ---------------------------------------------------------------------------

class TestFileRouteValidPasses:

    @pytest.mark.parametrize("route", FILE_ROUTES)
    def test_valid_chromosome_not_rejected(self, client, route):
        resp = client.get(f"{route}?chromosome={VALID_CHROM}")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /spine also validates the `ref` param (it is interpolated into a filename)
# ---------------------------------------------------------------------------

class TestSpineRefValidation:

    @pytest.mark.parametrize("evil", [
        "../../../../etc/passwd",
        "..",
        "a/b",
        "foo/../../bar",
    ])
    def test_ref_traversal_400(self, client, evil):
        resp = client.get(f"/spine?chromosome={VALID_CHROM}&ref={evil}")
        assert resp.status_code == 400

    def test_valid_ref_passes(self, client):
        resp = client.get(f"/spine?chromosome={VALID_CHROM}&ref={REF}")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /debug-log: gated on debug mode, and sessionId cannot escape the log dir
# ---------------------------------------------------------------------------

class TestDebugLogGate:

    def test_404_when_not_debug(self, client):
        resp = client.post("/debug-log", json={"sessionId": "abc", "event": "POP"})
        assert resp.status_code == 404

    def test_accepts_when_debug(self, client, monkeypatch, tmp_path):
        log_dir = tmp_path / "logs"
        monkeypatch.setattr(routes_module, "_DEBUG_LOG_DIR", str(log_dir))
        client.application.debug_mode = True

        resp = client.post("/debug-log", json={"sessionId": "abc123", "event": "POP"})
        assert resp.status_code == 200
        assert (log_dir / "session-abc123.jsonl").exists()

    def test_malicious_session_id_stays_contained(self, client, monkeypatch, tmp_path):
        log_dir = tmp_path / "logs"
        monkeypatch.setattr(routes_module, "_DEBUG_LOG_DIR", str(log_dir))
        client.application.debug_mode = True

        resp = client.post(
            "/debug-log",
            json={"sessionId": "../../../../tmp/pwned", "event": "POP"},
        )
        assert resp.status_code == 200

        # Every file written must live directly inside the log dir — nothing
        # escaped via the traversal payload.
        written = list(log_dir.iterdir())
        assert written, "expected a sanitised log file"
        for f in written:
            assert f.parent.resolve() == log_dir.resolve()
            assert ".." not in f.name and "/" not in f.name
        assert not (tmp_path / "tmp" / "pwned.jsonl").exists()
