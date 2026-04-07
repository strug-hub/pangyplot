"""Route tests for /select, /pop, /chains, and /detail-tiles using DRB1-3123.

Specific pop test cases anchored to segments:
  - Simple SNP: endpoints 11/17, inside [12, 13], 4 nodes, 8 links
  - Nested: endpoints 141/133, 1 child (endpoints 138/136), 7 nodes
"""

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
from pangyplot.db.indexes.PolychainIndex import PolychainIndex

REFERENCE = "gi|568815592"
CHROM = "DRB1"
START = 32580000
END = 32585000
# Layout range covering all DRB1 chains (x1: ~1007, x2: ~13861)
LAYOUT_MIN_X = 1000
LAYOUT_MAX_X = 14000


@pytest.fixture(scope="module")
def drb1_app(fixtures_dir):
    """Flask app with DRB1 indexes loaded, including PolychainIndex."""
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
    polychainidx = PolychainIndex(tmpdir, bubbleidx, gfaidx, stepidx, REFERENCE)

    app = Flask(__name__)
    app.json.default = NumpyJSONEncoder().default
    app.step_index = {(CHROM, REFERENCE): stepidx}
    app.bubble_index = {CHROM: bubbleidx}
    app.gfa_index = {CHROM: gfaidx}
    app.polychain_index = {CHROM: polychainidx}
    app.register_blueprint(routes_bp)

    yield app, bubbleidx
    shutil.rmtree(tmpdir)


@pytest.fixture(scope="module")
def client(drb1_app):
    app, _ = drb1_app
    return app.test_client()


@pytest.fixture(scope="module")
def bubble_index(drb1_app):
    _, bi = drb1_app
    return bi


def _find_bubble_id(bi, seg_a, seg_b):
    """Find a top-level bubble by its source/sink segments (either order)."""
    for bid in bi.ids:
        b = bi[bid]
        endpoints = set(b.source_segments) | set(b.sink_segments)
        if seg_a in endpoints and seg_b in endpoints:
            return bid
    pytest.fail(f"No bubble with endpoints {seg_a}, {seg_b}")


# ---------------------------------------------------------------------------
# /select
# ---------------------------------------------------------------------------

class TestSelectRoute:

    def test_returns_200(self, client):
        resp = client.get(
            f"/select?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        assert resp.status_code == 200

    def test_has_nodes_and_links(self, client):
        resp = client.get(
            f"/select?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        data = resp.get_json()
        assert "nodes" in data
        assert "links" in data
        assert len(data["nodes"]) > 0

    def test_nodes_have_required_fields(self, client):
        resp = client.get(
            f"/select?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        data = resp.get_json()
        for node in data["nodes"]:
            assert "id" in node
            assert "type" in node

    def test_links_have_source_target(self, client):
        resp = client.get(
            f"/select?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        data = resp.get_json()
        for link in data["links"]:
            assert "source" in link
            assert "target" in link

    def test_invalid_genome_404(self, client):
        resp = client.get(
            f"/select?genome=INVALID&chromosome={CHROM}&start={START}&end={END}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /pop — generic
# ---------------------------------------------------------------------------

class TestPopRouteGeneric:

    def test_segment_pop_returns_empty(self, client):
        resp = client.get(
            f"/pop?id=s12345&genome={REFERENCE}&chromosome={CHROM}")
        data = resp.get_json()
        assert data["nodes"] == []
        assert data["links"] == []

    def test_pop_has_required_keys(self, client, bubble_index):
        bid = _find_bubble_id(bubble_index, 11, 17)
        resp = client.get(
            f"/pop?id=b{bid}&genome={REFERENCE}&chromosome={CHROM}")
        data = resp.get_json()
        for key in ("source_segs", "sink_segs", "nodes", "links"):
            assert key in data


# ---------------------------------------------------------------------------
# /pop — simple SNP (segments 11/17, inside [12, 13])
# ---------------------------------------------------------------------------

class TestPopSimpleSNP:

    @pytest.fixture(scope="class")
    def pop_result(self, client, bubble_index):
        bid = _find_bubble_id(bubble_index, 11, 17)
        resp = client.get(
            f"/pop?id=b{bid}&genome={REFERENCE}&chromosome={CHROM}")
        return resp.get_json()

    def test_node_ids(self, pop_result):
        node_ids = {n["id"] for n in pop_result["nodes"]}
        assert node_ids == {"s11", "s12", "s13", "s17"}

    def test_boundary_segs(self, pop_result):
        src = set(pop_result["source_segs"])
        snk = set(pop_result["sink_segs"])
        assert (11 in src or 11 in snk)
        assert (17 in src or 17 in snk)

    def test_link_count(self, pop_result):
        assert len(pop_result["links"]) == 8


# ---------------------------------------------------------------------------
# /pop — nested bubble (segments 141/133, child 138/136)
# ---------------------------------------------------------------------------

class TestPopNested:

    @pytest.fixture(scope="class")
    def pop_result(self, client, bubble_index):
        bid = _find_bubble_id(bubble_index, 141, 133)
        resp = client.get(
            f"/pop?id=b{bid}&genome={REFERENCE}&chromosome={CHROM}")
        return resp.get_json()

    def test_node_count(self, pop_result):
        assert len(pop_result["nodes"]) == 7

    def test_parent_inside_in_nodes(self, pop_result, bubble_index):
        bid = _find_bubble_id(bubble_index, 141, 133)
        b = bubble_index[bid]
        node_ids = {n["id"] for n in pop_result["nodes"]}
        for sid in b.inside:
            assert f"s{sid}" in node_ids

    def test_child_inside_in_nodes(self, pop_result, bubble_index):
        bid = _find_bubble_id(bubble_index, 141, 133)
        b = bubble_index[bid]
        node_ids = {n["id"] for n in pop_result["nodes"]}
        for child_id in b.children:
            child = bubble_index[child_id]
            for sid in child.inside:
                assert f"s{sid}" in node_ids


# ---------------------------------------------------------------------------
# /chains
# ---------------------------------------------------------------------------

class TestChainsRoute:

    def test_returns_200(self, client):
        resp = client.get(
            f"/chains?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        assert resp.status_code == 200

    def test_has_chains_and_bubbles(self, client):
        resp = client.get(
            f"/chains?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        data = resp.get_json()
        assert "chains" in data
        assert "bubbles" in data

    def test_chain_count(self, client):
        resp = client.get(
            f"/chains?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        data = resp.get_json()
        assert len(data["chains"]) == 16

    def test_chains_have_required_fields(self, client):
        resp = client.get(
            f"/chains?genome={REFERENCE}&chromosome={CHROM}&start={START}&end={END}")
        data = resp.get_json()
        for chain in data["chains"]:
            assert "id" in chain
            assert "polyline" in chain
            assert "source_segs" in chain
            assert "sink_segs" in chain
            assert len(chain["polyline"]) >= 2

    def test_invalid_genome_404(self, client):
        resp = client.get(
            f"/chains?genome=INVALID&chromosome={CHROM}&start={START}&end={END}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /detail-tiles
# ---------------------------------------------------------------------------

class TestDetailTilesRoute:

    def test_returns_200(self, client):
        resp = client.get(
            f"/detail-tiles?genome={REFERENCE}&chromosome={CHROM}"
            f"&start={START}&end={END}&ppbp=0.01"
            f"&layout_min_x={LAYOUT_MIN_X}&layout_max_x={LAYOUT_MAX_X}")
        assert resp.status_code == 200

    def test_has_expected_keys(self, client):
        resp = client.get(
            f"/detail-tiles?genome={REFERENCE}&chromosome={CHROM}"
            f"&start={START}&end={END}&ppbp=0.01"
            f"&layout_min_x={LAYOUT_MIN_X}&layout_max_x={LAYOUT_MAX_X}")
        data = resp.get_json()
        for key in ("chains", "junction_nodes", "junction_links",
                    "junction_graph", "chain_adjacency"):
            assert key in data

    def test_full_range_chain_count(self, client):
        resp = client.get(
            f"/detail-tiles?genome={REFERENCE}&chromosome={CHROM}"
            f"&start={START}&end={END}&ppbp=0.01"
            f"&layout_min_x={LAYOUT_MIN_X}&layout_max_x={LAYOUT_MAX_X}")
        data = resp.get_json()
        assert len(data["chains"]) == 63

    def test_has_junction_graph(self, client):
        resp = client.get(
            f"/detail-tiles?genome={REFERENCE}&chromosome={CHROM}"
            f"&start={START}&end={END}&ppbp=0.01"
            f"&layout_min_x={LAYOUT_MIN_X}&layout_max_x={LAYOUT_MAX_X}")
        data = resp.get_json()
        jg = data["junction_graph"]
        assert len(jg["nodes"]) > 0
        assert len(jg["links"]) > 0

    def test_narrow_range_fewer_chains(self, client):
        resp = client.get(
            f"/detail-tiles?genome={REFERENCE}&chromosome={CHROM}"
            f"&start={START}&end={END}&ppbp=0.01"
            f"&layout_min_x=3000&layout_max_x=5000")
        data = resp.get_json()
        assert len(data["chains"]) < 63

    def test_invalid_genome_404(self, client):
        resp = client.get(
            f"/detail-tiles?genome=INVALID&chromosome={CHROM}"
            f"&start={START}&end={END}&ppbp=0.01"
            f"&layout_min_x={LAYOUT_MIN_X}&layout_max_x={LAYOUT_MAX_X}")
        assert resp.status_code == 404
