"""
Route tests for /cytoband and /chromosomes endpoints.
Uses a minimal Flask app with test fixture data (see routes/conftest.py).
"""


class TestCytobandEndpoint:
    def test_all_cytobands(self, client):
        resp = client.get("/cytoband")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "chromosome" in data
        assert "order" in data
        assert set(data["chromosome"].keys()) == {"chr1", "chr2"}
        assert data["order"] == ["chr1", "chr2"]

    def test_single_chromosome(self, client):
        resp = client.get("/cytoband?chromosome=chr1")
        assert resp.status_code == 200
        bands = resp.get_json()
        assert isinstance(bands, list)
        assert len(bands) == 3

    def test_missing_chromosome_404(self, client):
        resp = client.get("/cytoband?chromosome=chrZ")
        assert resp.status_code == 404


class TestChromosomesEndpoint:
    def test_canonical(self, client):
        resp = client.get("/chromosomes")
        assert resp.get_json() == ["chr1", "chr2"]

    def test_noncanonical(self, client):
        resp = client.get("/chromosomes?noncanonical=true")
        result = resp.get_json()
        assert "chr1" not in result
        assert "chr2" not in result
        assert "chrUn_1" in result
        assert "chrM" in result
