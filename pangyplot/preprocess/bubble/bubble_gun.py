import BubbleGun.Node as BubbleGunNode
import BubbleGun.Graph as BubbleGunGraph
import BubbleGun.find_bubbles as BubbleGunFindBubbles
import BubbleGun.connect_bubbles as BubbleGunConnectBubbles
import BubbleGun.find_parents as BubbleGunFindParents
import pangyplot.preprocess.bubble.compact_graph as compacter
import pangyplot.preprocess.bubble.construct_bubble_index as indexer
import time

def to_bubblegun_obj(segments, links):

    nodes = dict()

    for sid in segments:
        segment = segments[sid]
        sid = str(sid)
        node = BubbleGunNode.Node(sid)
        node.seq = segment.seq
        node.seq_len = segment.length
        info = {
            "gc_count": segment.gc_count,
            "n_count": segment.n_count,
            "compacted": []
        }
        node.optional_info = info
        nodes[sid] = node

    for from_id, to_id in links:
        link = links[(from_id, to_id)]
        from_id = str(from_id)
        to_id = str(to_id)

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

def shoot(segments, links, chr_path, ref):
    print("→ Finding bubbles.")

    graph = BubbleGunGraph.Graph()

    print("   🔫 Loading BubbleGun...", end="")
    start_time = time.time()
    graph.nodes = to_bubblegun_obj(segments, links)
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")
    print(f"      {len(graph.nodes)} segments total.")

    print("   🗜️ Compacting graph...")
    before = len(graph.nodes)
    compacter.compact_graph(graph)
    after = len(graph.nodes)
    print(f"      {before - after} segments were compacted.")

    print("   ⛓️  Finding bubbles and chains...", end="")
    start_time = time.time()
    BubbleGunFindBubbles.find_bubbles(graph)
    BubbleGunConnectBubbles.connect_bubbles(graph)
    BubbleGunFindParents.find_parents(graph)
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")

    bubbleCount = graph.bubble_number()
    print("   🔘 Simple Bubbles: {}, Superbubbles: {}, Insertions: {}".format(bubbleCount[0], bubbleCount[1], bubbleCount[2]))    

    print("   💾  Indexing bubbles...", end="")
    indexer.construct_bubble_index(graph, chr_path, ref)
    print(f" Done.")

    return graph