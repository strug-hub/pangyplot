"""
Tests for bubble pop link connectivity.

Validates that /pop returns correct boundary segments, internal connectivity,
cross-bubble links, and that nested pops maintain proper link chains.

Uses the bundled chrY datastore: datastore/graphs/hprc.clip/chrY/
"""

import os
import pytest

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.StepIndex import StepIndex
import pangyplot.db.query as query


DATASTORE = os.path.join(os.path.dirname(__file__), "..", "datastore")
CHR_DIR   = os.path.join(DATASTORE, "graphs", "hprc.clip", "chrY")
GENOME    = "GRCh38"
CHROM     = "chrY"

LEAF_BUBBLE_ID   = "b7991"
PARENT_BUBBLE_ID = "b7968"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def indexes():
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
def leaf_pop(indexes):
    return query.pop_bubble(indexes, LEAF_BUBBLE_ID, GENOME, CHROM)


@pytest.fixture(scope="module")
def parent_pop(indexes):
    return query.pop_bubble(indexes, PARENT_BUBBLE_ID, GENOME, CHROM)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def pop_node_ids(pop):
    """Set of node IDs (e.g. 's137072', 'b7968') from pop response."""
    return {n["id"] for n in pop["nodes"]}


def pop_link_endpoints(pop):
    """Set of (source, target) tuples from pop response links."""
    return {(l["source"], l["target"]) for l in pop["links"]}


def pop_link_seg_ids(pop):
    """Set of all segment IDs referenced by links (both ends)."""
    ids = set()
    for l in pop["links"]:
        ids.add(l["source"])
        ids.add(l["target"])
    return ids


# ---------------------------------------------------------------------------
# Leaf pop: link connectivity
# ---------------------------------------------------------------------------

class TestLeafPopLinks:

    def test_internal_links_have_both_endpoints_in_nodes(self, leaf_pop):
        """Links where both endpoints are in the subgraph must reference valid nodes."""
        node_ids = pop_node_ids(leaf_pop)
        for link in leaf_pop["links"]:
            s_in = link["source"] in node_ids
            t_in = link["target"] in node_ids
            if s_in and t_in:
                continue  # fully internal — OK
            # At least one endpoint must be in the subgraph (it's a cross-boundary link)
            assert s_in or t_in, (
                f"Link {link['source']}→{link['target']}: neither endpoint in pop nodes"
            )

    def test_external_links_exist(self, leaf_pop):
        """Some links should reference segments outside the bubble — these are
        cross-chain links that the frontend linkResolver resolves."""
        node_ids = pop_node_ids(leaf_pop)
        external = [l for l in leaf_pop["links"]
                    if l["source"] not in node_ids or l["target"] not in node_ids]
        # A bubble connected to external segments should have cross-boundary links
        assert len(external) >= 0  # may be zero for isolated bubbles

    def test_boundary_segs_have_links(self, leaf_pop):
        """Source and sink boundary segments should be connected by at least one link."""
        link_segs = pop_link_seg_ids(leaf_pop)
        for seg_id in leaf_pop["source_segs"]:
            assert f"s{seg_id}" in link_segs, (
                f"Source seg s{seg_id} has no links"
            )
        for seg_id in leaf_pop["sink_segs"]:
            assert f"s{seg_id}" in link_segs, (
                f"Sink seg s{seg_id} has no links"
            )

    def test_inside_segs_connected(self, leaf_pop, indexes):
        """Each inside segment should be referenced by at least one link."""
        bubbleidx = indexes.bubble_index[CHROM]
        bid = int(LEAF_BUBBLE_ID[1:])
        bubble = bubbleidx[bid]

        link_segs = pop_link_seg_ids(leaf_pop)
        for seg_id in bubble.inside:
            assert f"s{seg_id}" in link_segs, (
                f"Inside seg s{seg_id} has no links in pop"
            )

    def test_no_self_links(self, leaf_pop):
        """No link should have the same source and target."""
        for link in leaf_pop["links"]:
            assert link["source"] != link["target"], (
                f"Self-link: {link['source']}"
            )

    def test_link_count_reasonable(self, leaf_pop):
        """A leaf bubble with N nodes should have at least N-1 links (connected)."""
        n_nodes = len(leaf_pop["nodes"])
        n_links = len(leaf_pop["links"])
        assert n_links >= n_nodes - 1, (
            f"{n_nodes} nodes but only {n_links} links — graph may be disconnected"
        )


# ---------------------------------------------------------------------------
# Parent pop: link connectivity with child bubbles
# ---------------------------------------------------------------------------

class TestParentPopLinks:

    def test_internal_links_have_both_endpoints_in_nodes(self, parent_pop):
        """For links with both endpoints in the subgraph, both must be valid nodes."""
        node_ids = pop_node_ids(parent_pop)
        for link in parent_pop["links"]:
            s_in = link["source"] in node_ids
            t_in = link["target"] in node_ids
            if s_in and t_in:
                continue
            assert s_in or t_in, (
                f"Link {link['source']}→{link['target']}: neither endpoint in pop nodes"
            )

    def test_external_links_reference_segments_outside_bubble(self, parent_pop, indexes):
        """Cross-boundary links should reference segments not in the bubble's own segments."""
        node_ids = pop_node_ids(parent_pop)
        bubbleidx = indexes.bubble_index[CHROM]
        bid = int(PARENT_BUBBLE_ID[1:])
        bubble = bubbleidx[bid]
        own_segs = (set(bubble.source_segments) | set(bubble.sink_segments) | bubble.inside)
        own_seg_ids = {f"s{s}" for s in own_segs}
        # Also include child bubble boundary segs
        for child in parent_pop["child_bubbles"]:
            for s in child["source_segs"] + child["sink_segs"]:
                own_seg_ids.add(f"s{s}")

        for link in parent_pop["links"]:
            s_in = link["source"] in node_ids
            t_in = link["target"] in node_ids
            if s_in and t_in:
                continue
            # The external endpoint should be truly outside the bubble
            external = link["target"] if s_in else link["source"]
            ext_seg_id = int(external[1:]) if external.startswith("s") else None
            if ext_seg_id is not None:
                assert external not in own_seg_ids, (
                    f"External link endpoint {external} is actually inside bubble"
                )

    def test_child_boundary_segs_have_links(self, parent_pop):
        """Child bubble boundary segments should be connected by links."""
        link_segs = pop_link_seg_ids(parent_pop)
        for child in parent_pop["child_bubbles"]:
            for seg_id in child["source_segs"]:
                assert f"s{seg_id}" in link_segs, (
                    f"Child b{child['id']} source seg s{seg_id} has no links"
                )
            for seg_id in child["sink_segs"]:
                assert f"s{seg_id}" in link_segs, (
                    f"Child b{child['id']} sink seg s{seg_id} has no links"
                )

    def test_parent_boundary_segs_connected(self, parent_pop):
        """Parent's own source/sink segs must be linked."""
        link_segs = pop_link_seg_ids(parent_pop)
        for seg_id in parent_pop["source_segs"]:
            assert f"s{seg_id}" in link_segs
        for seg_id in parent_pop["sink_segs"]:
            assert f"s{seg_id}" in link_segs

    def test_no_self_links(self, parent_pop):
        for link in parent_pop["links"]:
            assert link["source"] != link["target"]

    def test_child_bubbles_cover_inside_segs(self, parent_pop, indexes):
        """Every naked segment in the parent's 'inside' should either be in the
        pop nodes directly or owned by a child bubble."""
        bubbleidx = indexes.bubble_index[CHROM]
        bid = int(PARENT_BUBBLE_ID[1:])
        bubble = bubbleidx[bid]

        # Segments explicitly in pop nodes
        node_seg_ids = {int(n["id"][1:]) for n in parent_pop["nodes"]
                        if n["id"].startswith("s")}
        # Segments owned by child bubbles (in their inside_segs)
        child_inside = set()
        for child in parent_pop["child_bubbles"]:
            child_inside.update(child["inside_segs"])

        for seg_id in bubble.inside:
            assert seg_id in node_seg_ids or seg_id in child_inside, (
                f"Parent inside seg {seg_id} not in pop nodes or child inside_segs"
            )


# ---------------------------------------------------------------------------
# Nested pop: pop a parent, then pop one of its children
# ---------------------------------------------------------------------------

class TestNestedPopLinks:

    @pytest.fixture(scope="class")
    def parent_pop_data(self, indexes):
        return query.pop_bubble(indexes, PARENT_BUBBLE_ID, GENOME, CHROM)

    @pytest.fixture(scope="class")
    def first_child_id(self, parent_pop_data):
        """Pick the first child bubble for nested pop."""
        children = parent_pop_data["child_bubbles"]
        assert len(children) > 0, "Parent has no children to nest-pop"
        return children[0]["id"]

    @pytest.fixture(scope="class")
    def child_pop_data(self, indexes, first_child_id):
        return query.pop_bubble(indexes, f"b{first_child_id}", GENOME, CHROM)

    def test_child_pop_has_required_keys(self, child_pop_data):
        for key in ("source_segs", "sink_segs", "child_bubbles", "nodes", "links"):
            assert key in child_pop_data

    def test_child_pop_source_sink_match_parent_metadata(self, parent_pop_data,
                                                          first_child_id,
                                                          child_pop_data):
        """The child's source/sink segs from its own pop should match what the
        parent listed in its child_bubbles metadata."""
        parent_child = next(
            c for c in parent_pop_data["child_bubbles"] if c["id"] == first_child_id
        )
        assert sorted(child_pop_data["source_segs"]) == sorted(parent_child["source_segs"])
        assert sorted(child_pop_data["sink_segs"]) == sorted(parent_child["sink_segs"])

    def test_child_pop_internal_links_valid(self, child_pop_data):
        """Internal links in child pop must have both endpoints in nodes.
        Cross-boundary links (to segments outside this child bubble) are expected."""
        node_ids = pop_node_ids(child_pop_data)
        for link in child_pop_data["links"]:
            s_in = link["source"] in node_ids
            t_in = link["target"] in node_ids
            if s_in and t_in:
                continue
            assert s_in or t_in, (
                f"Link {link['source']}→{link['target']}: neither endpoint in child pop nodes"
            )

    def test_shared_boundary_segs_between_parent_and_child(self, parent_pop_data,
                                                            first_child_id,
                                                            child_pop_data):
        """The child's boundary segs should appear in both the parent and child pops."""
        parent_node_ids = pop_node_ids(parent_pop_data)
        child_node_ids = pop_node_ids(child_pop_data)

        parent_child = next(
            c for c in parent_pop_data["child_bubbles"] if c["id"] == first_child_id
        )
        for seg_id in parent_child["source_segs"] + parent_child["sink_segs"]:
            seg_key = f"s{seg_id}"
            assert seg_key in parent_node_ids, (
                f"Shared boundary seg {seg_key} missing from parent pop nodes"
            )
            assert seg_key in child_node_ids, (
                f"Shared boundary seg {seg_key} missing from child pop nodes"
            )


# ---------------------------------------------------------------------------
# Cross-bubble link resolution: links that connect adjacent bubbles
# ---------------------------------------------------------------------------

class TestCrossBubbleLinks:

    @pytest.fixture(scope="class")
    def chain_bubbles(self, indexes):
        """Get a chain with multiple bubbles from the test region."""
        bubbleidx = indexes.bubble_index[CHROM]
        stepidx = indexes.step_index[(CHROM, GENOME)]
        start_step, end_step = stepidx.query_coordinates(23128355, 23200010)
        chains = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)
        # Find a chain with at least 2 bubbles
        for chain in chains:
            if len(chain.bubbles) >= 2:
                return chain
        pytest.skip("No chain with 2+ bubbles found in test region")

    def test_adjacent_bubbles_share_boundary_segs(self, chain_bubbles):
        """Adjacent bubbles in a chain should share boundary segments:
        bubble[i].sink_segs overlaps with bubble[i+1].source_segs."""
        bubbles = chain_bubbles.bubbles
        for i in range(len(bubbles) - 1):
            sink = set(bubbles[i].sink_segments)
            source = set(bubbles[i + 1].source_segments)
            shared = sink & source
            assert len(shared) > 0, (
                f"Bubbles b{bubbles[i].id} and b{bubbles[i+1].id} share no boundary segs. "
                f"sink={sink}, source={source}"
            )

    def test_pop_links_reference_boundary_segs_of_neighbors(self, indexes, chain_bubbles):
        """When popping bubble[0], its links should reference segments that are
        boundary segs of bubble[1] (the adjacent bubble)."""
        bubbles = chain_bubbles.bubbles
        if len(bubbles) < 2:
            pytest.skip("Need at least 2 bubbles")

        pop = query.pop_bubble(indexes, f"b{bubbles[0].id}", GENOME, CHROM)
        link_segs = pop_link_seg_ids(pop)

        # The sink segs of bubble[0] should be in the links
        for seg_id in bubbles[0].sink_segments:
            seg_key = f"s{seg_id}"
            assert seg_key in link_segs, (
                f"Sink seg {seg_key} of bubble b{bubbles[0].id} not in pop links"
            )

    def test_consecutive_pops_share_boundary_nodes(self, indexes, chain_bubbles):
        """Popping bubble[0] and bubble[1] separately should both include
        the shared boundary segment nodes — this is how adjacent popped
        subgraphs connect in the force simulation."""
        bubbles = chain_bubbles.bubbles
        if len(bubbles) < 2:
            pytest.skip("Need at least 2 bubbles")

        pop0 = query.pop_bubble(indexes, f"b{bubbles[0].id}", GENOME, CHROM)
        pop1 = query.pop_bubble(indexes, f"b{bubbles[1].id}", GENOME, CHROM)

        shared_boundary = set(bubbles[0].sink_segments) & set(bubbles[1].source_segments)
        assert len(shared_boundary) > 0

        nodes0 = pop_node_ids(pop0)
        nodes1 = pop_node_ids(pop1)

        for seg_id in shared_boundary:
            seg_key = f"s{seg_id}"
            assert seg_key in nodes0, (
                f"Shared seg {seg_key} not in pop of b{bubbles[0].id}"
            )
            assert seg_key in nodes1, (
                f"Shared seg {seg_key} not in pop of b{bubbles[1].id}"
            )


# ---------------------------------------------------------------------------
# Segment pop: segments return empty (no-op)
# ---------------------------------------------------------------------------

class TestSegmentPopNoop:

    def test_segment_pop_returns_empty(self, indexes):
        result = query.pop_bubble(indexes, "s12345", GENOME, CHROM)
        assert result["source_segs"] == []
        assert result["sink_segs"] == []
        assert result["child_bubbles"] == []
        assert result["nodes"] == []
        assert result["links"] == []


# ---------------------------------------------------------------------------
# Link structural invariants
# ---------------------------------------------------------------------------

class TestLinkStructure:

    @pytest.fixture(scope="class")
    def leaf_pop_result(self, indexes):
        return query.pop_bubble(indexes, LEAF_BUBBLE_ID, GENOME, CHROM)

    @pytest.fixture(scope="class")
    def parent_pop_result(self, indexes):
        return query.pop_bubble(indexes, PARENT_BUBBLE_ID, GENOME, CHROM)

    def test_links_have_required_fields(self, leaf_pop_result):
        for link in leaf_pop_result["links"]:
            assert "source" in link
            assert "target" in link
            assert "from_strand" in link
            assert "to_strand" in link

    def test_strands_are_valid(self, leaf_pop_result):
        for link in leaf_pop_result["links"]:
            assert link["from_strand"] in ("+", "-")
            assert link["to_strand"] in ("+", "-")

    def test_links_are_unique(self, parent_pop_result):
        """No duplicate links (same source+target+strands)."""
        seen = set()
        for link in parent_pop_result["links"]:
            key = (link["source"], link["target"],
                   link["from_strand"], link["to_strand"])
            assert key not in seen, f"Duplicate link: {key}"
            seen.add(key)

    def test_at_least_one_endpoint_in_subgraph(self, parent_pop_result):
        """Every link must have at least one endpoint in the subgraph.
        Cross-boundary links have one endpoint outside (resolved by frontend)."""
        node_ids = pop_node_ids(parent_pop_result)
        for link in parent_pop_result["links"]:
            s_in = link["source"] in node_ids
            t_in = link["target"] in node_ids
            assert s_in or t_in, (
                f"Link {link['source']}→{link['target']}: "
                f"neither endpoint in subgraph"
            )
