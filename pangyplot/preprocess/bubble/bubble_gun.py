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

    for segment in segment_idx:
        sid = str(segment.id)
        node = BubbleGunNode.Node(sid)
        node.seq = segment.seq
        node.seq_len = segment.length
        info = {
            "gc_count": segment.gc_count,
            "n_count": segment.n_count,
            "x1": segment.x1,
            "x2": segment.x2,
            "y1": segment.y1,
            "y2": segment.y2,
            "compacted": []
        }
        node.optional_info = info
        nodes[sid] = node

    for link in link_idx:
        from_id = str(link.from_id)
        to_id = str(link.to_id)

        from_strand = link.from_strand
        to_strand = link.to_strand

        overlap = 0
        
        from_start = (from_strand == "-")
        to_end = (to_strand == "-")

        if not from_start and not to_end:  #  + +
            nodes[from_id].end.add((to_id, 0, overlap))
            nodes[to_id].start.add((from_id, 1, overlap))
        elif not from_start and to_end:  # + -
            nodes[from_id].end.add((to_id, 1, overlap))
            nodes[to_id].end.add((from_id, 1, overlap))
        elif from_start and not to_end:  # - +
            nodes[from_id].start.add((to_id, 0, overlap))
            nodes[to_id].start.add((from_id, 0, overlap))
        elif from_start and to_end:  # - -
            nodes[from_id].start.add((to_id, 1, overlap))
            nodes[to_id].end.add((from_id, 0, overlap))

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
    indexer.construct_bubble_index(link_idx, graph, chr_path, ref)
    print(f" Done.")

    return graph