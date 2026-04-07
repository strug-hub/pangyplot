"""
Backend query tests against the bundled chrY datastore.

Assumes: datastore/graphs/hprc.clip/chrY/ exists (committed to the repo).
Region tested: GRCh38:23128355-23200010  (~187 top-level bubbles)
"""

import os
import pytest

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.StepIndex import StepIndex
import pangyplot.db.query as query


DATASTORE = os.path.join(os.path.dirname(__file__), "..", "..", "datastore")
CHR_DIR   = os.path.join(DATASTORE, "graphs", "hprc.clip", "chrY")
GENOME    = "GRCh38"
CHROM     = "chrY"
START     = 23128355
END       = 23200010

# Known bubble IDs from the test region
LEAF_BUBBLE_ID   = "b7991"   # source=[137072] sink=[137069] inside=[137070,137071] children=[]
PARENT_BUBBLE_ID = "b7968"   # inside=[...] children=[16487..48832] (many children)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def indexes():
    """Load indexes from the chrY datastore, mirroring app.py load_indexes()."""
    if not os.path.isdir(CHR_DIR):
        pytest.skip(f"chrY datastore not found at {CHR_DIR}")

    class Indexes:
        pass

    idx = Indexes()
    gfaidx = GFAIndex(CHR_DIR)
    idx.gfa_index    = {CHROM: gfaidx}
    idx.step_index   = {(CHROM, GENOME): StepIndex(CHR_DIR, GENOME)}
    idx.bubble_index = {CHROM: BubbleIndex(CHR_DIR, gfaidx)}
    return idx


@pytest.fixture(scope="module")
def select_response(indexes):
    return query.get_bubble_graph(indexes, GENOME, CHROM, START, END)


# ---------------------------------------------------------------------------
# /select — structure
# ---------------------------------------------------------------------------

class TestSelectStructure:

    def test_has_nodes(self, select_response):
        assert len(select_response["nodes"]) > 0

    def test_has_links(self, select_response):
        assert "links" in select_response

    def test_nodes_are_all_bubbles(self, select_response):
        """/select returns only bubble nodes — segment nodes are hidden inside bubbles."""
        for node in select_response["nodes"]:
            assert "id" in node
            assert node["type"] == "bubble"

    def test_bubble_nodes_have_boundary_segs(self, select_response):
        bubbles = [n for n in select_response["nodes"] if n["type"] == "bubble"]
        assert len(bubbles) > 0
        for b in bubbles:
            assert isinstance(b["source_segs"], list)
            assert isinstance(b["sink_segs"], list)

    def test_expected_bubble_count(self, select_response):
        bubbles = [n for n in select_response["nodes"] if n["type"] == "bubble"]
        assert len(bubbles) == 187


# ---------------------------------------------------------------------------
# /select — inside_segs correctness
# ---------------------------------------------------------------------------

class TestSelectInsideSegs:

    def test_bubble_nodes_have_inside_segs(self, select_response):
        for node in select_response["nodes"]:
            if node["type"] == "bubble":
                assert isinstance(node["inside_segs"], list)

    def test_inside_segs_disjoint_from_boundary_segs(self, select_response):
        for node in select_response["nodes"]:
            if node["type"] == "bubble":
                boundary = set(node["source_segs"]) | set(node["sink_segs"])
                for sid in node["inside_segs"]:
                    assert sid not in boundary, (
                        f"bubble {node['id']}: inside_seg {sid} also in source/sink"
                    )

    def test_inside_segs_match_index(self, select_response, indexes):
        """inside_segs in each bubble node must exactly match bubble.inside from the index."""
        bubbleidx = indexes.bubble_index[CHROM]
        for node in select_response["nodes"]:
            if node["type"] == "bubble":
                bid = int(node["id"][1:])
                bubble = bubbleidx[bid]
                assert sorted(node["inside_segs"]) == sorted(bubble.inside), (
                    f"bubble {node['id']}: inside_segs mismatch with index"
                )


# ---------------------------------------------------------------------------
# /pop — structure
# ---------------------------------------------------------------------------

class TestPopStructure:

    @pytest.fixture(scope="class")
    def leaf_pop(self, indexes):
        return query.pop_bubble(indexes, LEAF_BUBBLE_ID, GENOME, CHROM)

    @pytest.fixture(scope="class")
    def parent_pop(self, indexes):
        return query.pop_bubble(indexes, PARENT_BUBBLE_ID, GENOME, CHROM)

    def test_pop_has_required_keys(self, leaf_pop):
        for key in ("source_segs", "sink_segs", "nodes", "links"):
            assert key in leaf_pop

    def test_leaf_nodes_are_all_segments(self, leaf_pop):
        for node in leaf_pop["nodes"]:
            assert node["type"] == "segment"

    def test_leaf_boundary_segs_in_nodes(self, leaf_pop):
        node_ids = {n["id"] for n in leaf_pop["nodes"]}
        for seg_id in leaf_pop["source_segs"] + leaf_pop["sink_segs"]:
            assert f"s{seg_id}" in node_ids, f"Boundary seg s{seg_id} not in pop nodes"



# ---------------------------------------------------------------------------
# /detail-tiles inter-chain connectors
#
# Region: GRCh38 24,100,000-24,135,000 on chrY.
# At this location, top-level chains c625, c82, and c371 are returned.
# They share a small junction of naked GFA segments (not owned by any bubble)
# that connect their endpoints in the GFA graph.
# ---------------------------------------------------------------------------

JUNCTION_START = 24_100_000
JUNCTION_END   = 24_135_000


@pytest.mark.skip(reason="Needs rewrite with DRB1 fixture and PolychainIndex")
class TestJunctionGraph:

    @pytest.fixture(scope="class")
    def tile(self, indexes):
        return query.get_detail_tile(
            indexes, GENOME, CHROM, JUNCTION_START, JUNCTION_END,
            ppbp=0.001, expand_threshold=100,
        )

    def test_junction_nodes_key_present(self, tile):
        assert "junction_nodes" in tile

    def test_junction_links_key_present(self, tile):
        assert "junction_links" in tile

    def test_three_base_chains_returned(self, tile):
        """The junction region should include chains rooted in c625, c82, c371.
        Long chains may be split into connectors (c371:55-124, etc.)."""
        chain_ids = {c["id"] for c in tile["chains"]}
        base_ids = {cid.split(":")[0] for cid in chain_ids}
        assert {"c625", "c82", "c371"}.issubset(base_ids)

    def test_at_least_one_junction_node(self, tile):
        assert len(tile["junction_nodes"]) >= 1

    def test_at_least_one_junction_link(self, tile):
        assert len(tile["junction_links"]) >= 1

    def test_no_duplicate_links(self, tile):
        """Each link (unordered endpoint pair) should appear once."""
        seen = set()
        for link in tile["junction_links"]:
            key = frozenset([tuple(link[0]), tuple(link[1])])
            assert key not in seen, f"Duplicate junction link: {link}"
            seen.add(key)

    def test_old_keys_absent(self, tile):
        """Old connector/stub/dot keys should not be in the response."""
        assert "inter_connectors" not in tile
        assert "junction_stubs" not in tile
        assert "junction_dots" not in tile
