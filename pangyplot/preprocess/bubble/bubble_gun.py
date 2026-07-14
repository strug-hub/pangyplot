import os

import BubbleGun.Node as BubbleGunNode
import BubbleGun.Graph as BubbleGunGraph
import BubbleGun.find_bubbles as BubbleGunFindBubbles
import BubbleGun.connect_bubbles as BubbleGunConnectBubbles
import BubbleGun.find_parents as BubbleGunFindParents
import pangyplot.preprocess.bubble.compact_graph as compacter
import pangyplot.preprocess.bubble.construct_bubble_index as indexer
import pangyplot.preprocess.bubble.construct_bubble_index_flat as flat_indexer
import pangyplot.preprocess.bubble.flat_bubbles as flat_bubbles
import pangyplot.preprocess.bubble.flat_chains as flat_chains
import pangyplot.preprocess.bubble.flat_graph as flat_graph
from pangyplot.preprocess import log

def to_bubblegun_obj(segment_idx, link_idx):

    nodes = dict()
    NodeClass = BubbleGunNode.Node

    for segment in segment_idx:
        sid = str(segment.id)
        node = NodeClass(sid)
        node.seq = segment.seq
        node.seq_len = segment.length
        node.optional_info = {
            "gc_count": segment.gc_count,
            "n_count": segment.n_count,
            "x1": segment.x1,
            "x2": segment.x2,
            "y1": segment.y1,
            "y2": segment.y2,
            "compacted": []
        }
        nodes[sid] = node

    # Pre-convert all link IDs to strings in bulk and cache local refs
    for link in link_idx:
        fid = str(link.from_id)
        tid = str(link.to_id)
        from_node = nodes[fid]
        to_node = nodes[tid]

        from_start = (link.from_strand == "-")
        to_end = (link.to_strand == "-")

        if not from_start and not to_end:  #  + +
            from_node.end.add((tid, 0, 0))
            to_node.start.add((fid, 1, 0))
        elif not from_start and to_end:  # + -
            from_node.end.add((tid, 1, 0))
            to_node.end.add((fid, 1, 0))
        elif from_start and not to_end:  # - +
            from_node.start.add((tid, 0, 0))
            to_node.start.add((fid, 0, 0))
        else:  # - -
            from_node.start.add((tid, 1, 0))
            to_node.end.add((fid, 0, 0))

    return nodes

def use_flat():
    """Whether to run bubble detection on the flat arrays instead of BubbleGun.

    Off by default while the two are being diffed. Set PANGYPLOT_FLAT_BUBBLES=1
    to build a datastore with the flat path, then compare the two with
    tools/fingerprint_bubbles.py -- they must be identical.
    """
    return os.environ.get("PANGYPLOT_FLAT_BUBBLES", "").lower() in ("1", "true", "yes")


def shoot_flat(segment_idx, link_idx, chr_path, ref):
    """Bubble detection over FlatGraph. Same bubbles.db, ~20x less memory."""
    with log.section("Finding bubbles."):
        with log.step("🔫", "Building graph"):
            g = flat_graph.build_flat_graph(segment_idx, link_idx)

        with log.step("🗜️ ", "Compacting graph"):
            before = g.n
            g = flat_graph.compact(g)
            after = g.n
        log.summary(f"{before - after} segments were compacted.")

        with log.step("⛓️ ", "Finding bubbles and chains"):
            fb = flat_bubbles.find_bubbles(g)
            fc = flat_chains.connect_bubbles(g, fb)
            flat_chains.find_parents(g, fb)

        # over the CHAINED bubbles, matching Graph.bubble_number(): bubbles in
        # chains that add_chain dropped are not counted, and are not indexed either
        kinds = [int(fb.kind[b]) for c in range(len(fc)) for b in fc.bubbles_of(c)]
        log.summary(
            f"Simple Bubbles: {kinds.count(flat_bubbles.SIMPLE)}, "
            f"Superbubbles: {kinds.count(flat_bubbles.SUPER)}, "
            f"Insertions: {kinds.count(flat_bubbles.INSERTION)}"
        )

        with log.step("💾", "Indexing bubbles"):
            flat_indexer.construct_bubble_index(link_idx, g, fb, fc, chr_path, ref)

    return g


def shoot(segment_idx, link_idx, chr_path, ref):
    if use_flat():
        return shoot_flat(segment_idx, link_idx, chr_path, ref)

    with log.section("Finding bubbles."):
        graph = BubbleGunGraph.Graph()

        with log.step("🔫", "Loading BubbleGun"):
            graph.nodes = to_bubblegun_obj(segment_idx, link_idx)

        with log.step("🗜️ ", "Compacting graph"):
            before = len(graph.nodes)
            compacter.compact_graph(graph)
            after = len(graph.nodes)
        log.summary(f"{before - after} segments were compacted.")

        # Free sequence strings — only seq_len and optional_info are needed from here on
        for node in graph.nodes.values():
            node.seq = ""

        with log.step("⛓️ ", "Finding bubbles and chains"):
            BubbleGunFindBubbles.find_bubbles(graph)
            BubbleGunConnectBubbles.connect_bubbles(graph)
            BubbleGunFindParents.find_parents(graph)

        bubbleCount = graph.bubble_number()
        log.summary(f"Simple Bubbles: {bubbleCount[0]}, Superbubbles: {bubbleCount[1]}, Insertions: {bubbleCount[2]}")

        with log.step("💾", "Indexing bubbles"):
            indexer.construct_bubble_index(link_idx, graph, chr_path, ref)

    return graph