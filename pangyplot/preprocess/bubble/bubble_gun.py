import BubbleGun.Node as BubbleGunNode
import BubbleGun.Graph as BubbleGunGraph
import BubbleGun.find_bubbles as BubbleGunFindBubbles
import BubbleGun.connect_bubbles as BubbleGunConnectBubbles
import BubbleGun.find_parents as BubbleGunFindParents
import pangyplot.preprocess.bubble.compact_graph as compacter
import pangyplot.preprocess.bubble.construct_bubble_index as indexer
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

def shoot(segment_idx, link_idx, chr_path, ref):
    log.header("Finding bubbles.")

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
    log.info("🔘", f"Simple Bubbles: {bubbleCount[0]}, Superbubbles: {bubbleCount[1]}, Insertions: {bubbleCount[2]}")

    with log.step("💾", "Indexing bubbles"):
        indexer.construct_bubble_index(link_idx, graph, chr_path, ref)

    return graph