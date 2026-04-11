import BubbleGun.Node as BubbleGunNode
import BubbleGun.Graph as BubbleGunGraph
import BubbleGun.find_bubbles as BubbleGunFindBubbles
import BubbleGun.connect_bubbles as BubbleGunConnectBubbles
import BubbleGun.find_parents as BubbleGunFindParents
import pangyplot.preprocess.bubble.compact_graph as compacter
import pangyplot.preprocess.bubble.construct_bubble_index as indexer
import time

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
    print("→ Finding bubbles.")

    graph = BubbleGunGraph.Graph()

    print("   🔫 Loading BubbleGun...", end="", flush=True)
    start_time = time.time()
    graph.nodes = to_bubblegun_obj(segment_idx, link_idx)
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")

    print("   🗜️  Compacting graph...", end="", flush=True)
    start_time = time.time()
    before = len(graph.nodes)
    compacter.compact_graph(graph)
    after = len(graph.nodes)
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")
    print(f"      {before - after} segments were compacted.")

    # Free sequence strings — only seq_len and optional_info are needed from here on
    for node in graph.nodes.values():
        node.seq = ""

    print("   ⛓️  Finding bubbles and chains...", end="", flush=True)
    start_time = time.time()
    BubbleGunFindBubbles.find_bubbles(graph)
    BubbleGunConnectBubbles.connect_bubbles(graph)
    BubbleGunFindParents.find_parents(graph)
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")

    bubbleCount = graph.bubble_number()
    print("   🔘 Simple Bubbles: {}, Superbubbles: {}, Insertions: {}".format(bubbleCount[0], bubbleCount[1], bubbleCount[2]))    

    print("   💾 Indexing bubbles...", end="", flush=True)
    start_time = time.time()
    indexer.construct_bubble_index(link_idx, graph, chr_path, ref)
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")

    return graph