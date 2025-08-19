import os
from pangyplot.db.indexes.StepIndex import StepIndex
import pangyplot.db.sqlite.bubble_db as db

from pangyplot.utils.plot_bubbles import plot_bubbles
from collections import defaultdict
from pangyplot.objects.Bubble import Bubble
from pangyplot.objects.Chain import Chain
from itertools import product
def create_bubble_object(raw_bubble, chain_id, chain_step, step_dict):
    bubble = Bubble()

    bubble.id = raw_bubble.id
    bubble.chain = chain_id
    bubble.chain_step = chain_step

    if raw_bubble.is_insertion():
        bubble.subtype = "insertion"
    elif raw_bubble.is_super():
        bubble.subtype = "super"

    bubble.parent = raw_bubble.parent_sb if raw_bubble.parent_sb else None

    # Source and sink
    source_node = raw_bubble.source
    source_compacted_ids = [int(n.id) for n in source_node.optional_info.get("compacted", [])]
    source_ids = [int(source_node.id)] + source_compacted_ids
    bubble.source_segments = source_ids

    sink_node = raw_bubble.sink
    sink_compacted_ids = [int(n.id) for n in sink_node.optional_info.get("compacted", [])]
    sink_ids = [int(sink_node.id)] + sink_compacted_ids
    bubble.sink_segments = sink_ids

    # Inside nodes + compacted
    nodes = raw_bubble.inside
    compacted_dict = defaultdict(list)
    for node in nodes:
        if node.optional_info.get("compacted"):
            compacted_dict[int(node.id)].extend(node.optional_info["compacted"])
    compacted_nodes = [n for nodes in compacted_dict.values() for n in nodes]

    bubble.inside = {int(n.id) for n in nodes + compacted_nodes}

    # Step range
    def get_steps(seg_ids):
        steps = set()
        for sid in seg_ids:
            steps.update(step_dict.get(sid, []))
        return steps

    inside_steps = get_steps(bubble.inside)
    source_steps = get_steps(source_ids)
    sink_steps = get_steps(sink_ids)

    def collapse_ranges(steps):
        if not steps:
            return []

        sorted_steps = sorted([int(s) for s in steps])
        ranges = []
        start = prev = sorted_steps[0]

        for step in sorted_steps[1:]:
            if step == prev + 1:
                prev = step
            else:
                ranges.append((start, prev))
                start = prev = step

        ranges.append((start, prev))
        return ranges

    bubble.range_exclusive = collapse_ranges(inside_steps)
    bubble.range_inclusive = collapse_ranges(inside_steps.union(source_steps, sink_steps))

    # Length and base content
    bubble.length = sum(n.seq_len for n in nodes)
    bubble.gc_count = sum(n.optional_info.get("gc_count", 0) for n in nodes)
    bubble.n_count = sum(n.optional_info.get("n_count", 0) for n in nodes)

    # Bounding box logic (x1/x2/y1/y2)
    x1s, x2s, y1s, y2s = [], [], [], []
    for node in nodes:
        info = node.optional_info
        if all(k in info for k in ("x1", "x2", "y1", "y2")):
            x1s.append(info["x1"])
            x2s.append(info["x2"])
            y1s.append(info["y1"])
            y2s.append(info["y2"])

    if x1s and x2s and y1s and y2s:
        avgX1 = sum(x1s) / len(x1s)
        avgX2 = sum(x2s) / len(x2s)
        avgY1 = sum(y1s) / len(y1s)
        avgY2 = sum(y2s) / len(y2s)

        bubble.x1 = min(x1s) if avgX1 < avgX2 else max(x1s)
        bubble.x2 = max(x2s) if avgX1 < avgX2 else min(x2s)
        bubble.y1 = min(y1s) if avgY1 < avgY2 else max(y1s)
        bubble.y2 = max(y2s) if avgY1 < avgY2 else min(y2s)

    return bubble

def create_chain_object(raw_chain, step_dict):
    if not raw_chain.sorted: 
        raw_chain.sort()

    chain_id = int(raw_chain.id)
    # note: raw_chain.ends not used (do we need to?)

    chain_bubbles = []
    for chain_step, raw_bubble in enumerate(raw_chain.sorted, start=1):
        bubble = create_bubble_object(raw_bubble, chain_id, chain_step, step_dict)
        chain_bubbles.append(bubble)

    chain = Chain(chain_id, chain_bubbles)

    return chain

def find_children(bubbles):
    bubble_dict = {bubble.id: bubble for bubble in bubbles}

    for bubble in bubbles:
        if bubble.parent:
            bubble_parent = bubble_dict[bubble.parent]
            bubble_parent.add_child(bubble, bubble_dict)


def classify_link(from_bubbles, to_bubbles, parent_child_dict):
    source = 0
    sink = 1
    inside = 2

    
    if from_bubbles and to_bubbles:
        all_pairs = list(product(from_bubbles, to_bubbles))
    else:
        return ["missing"]
    
    types = []
    for pair in all_pairs:
        b1, x1 = list(pair[0])
        b2, x2 = list(pair[1])

        if b1 == b2:
            if {x1, x2} == {inside}:
                # two nodes contained in the same bubble 
                types.append("internal")
                continue
            if x1 == x2:
                types.append("compacted"); continue
            if {x1, x2} == {source, inside}:
                types.append("source-inside"); continue
            if {x1, x2} == {sink, inside}:
                types.append("sink-inside"); continue
            if {x1, x2} == {source, sink}:
                types.append("deletion"); continue
        elif b1 != b2:
            if b1 in parent_child_dict[b2]:
                if inside in {x1, x2}:
                    types.append("parent-child"); continue
                else:
                    types.append("parent-child-ends"); continue

            if {x1, x2} == {source, sink} or {x1, x2} == {source} or {x1, x2} == {sink}:
                types.append("sib-ends"); continue

            if {x1, x2} == {source, inside}:
                types.append("inside-sib-source"); continue
            if {x1, x2} == {sink, inside}:
                types.append("inside-sib-sink"); continue

        types.append("unknown")
    
    print("raw types:", types)

    if "compacted" in types:
        types = ["compacted"]

    if "deletion" in types:
        types = ["deletion"]

    if len(types) > 1:
        types = [t for t in types if t != "parent-child"]
    if len(types) > 1:
        types = [t for t in types if t != "internal"]

    if "inside-sib-sink" in types and "source-inside" in types:
        types = [t for t in types if t not in ["inside-sib-sink", "source-inside"]]
        types.append("end-link")
    if "inside-sib-source" in types and "sink-inside" in types:
        types = [t for t in types if t not in ["inside-sib-source", "sink-inside"]]
        types.append("end-link")

    types.sort()


    return types
    
            

def store_bubble_links(links, bubbles, chr_dir):
    node_to_bubbles = defaultdict(set)
    parent_child_dict = defaultdict(set)
    
    source = 0
    sink = 1
    inside = 2

    for bubble in bubbles:
        if bubble.parent:
            parent_child_dict[bubble.parent].add(bubble.id)
            parent_child_dict[bubble.id].add(bubble.parent)

        #for nid in bubble.inside:
        #    node_to_bubbles[nid].add(bubble.id)
        for nid in bubble.get_source_segments():
            node_to_bubbles[nid].add((bubble.id, source))
        for nid in bubble.get_sink_segments():
            node_to_bubbles[nid].add((bubble.id, sink))
        for nid in bubble.inside:
            node_to_bubbles[nid].add((bubble.id, inside))

    internal_links = []
    external_links = []
    counts = defaultdict(int)

    for key, link in links.items():
        link_id = link.id()

        from_id, to_id = key
        from_bubbles = node_to_bubbles.get(from_id)
        to_bubbles = node_to_bubbles.get(to_id)

        link_type = classify_link(from_bubbles, to_bubbles, parent_child_dict)
        counts[";".join(link_type)] += 1

        print(f"Processing link {link_id} with bubbles {from_bubbles} -> {to_bubbles}... {link_type}")
        if ";".join(link_type) == "inside-sib-source;parent-child-ends;source-inside":
            input("Press Enter to continue...")


        if from_bubbles is None and to_bubbles is None:
            continue
        
        #if from_bubble == to_bubble:
        #    internal_links.append((from_bubble, link_id))
        #    internal_links.append((to_bubble, link_id))
        #else:
        #    external_links.append((from_bubble, link_id))
        #    external_links.append((to_bubble, link_id))

    for key,count in counts.items():
        print(f"{key}: {count}")

    input("Press Enter to continue...")

    db.insert_internal_links(chr_dir, internal_links)
    db.insert_external_links(chr_dir, external_links)

    
def construct_bubble_index(segments, links, graph, chr_dir, ref, plot=False):
    step_index = StepIndex(chr_dir, ref)
    step_dict = step_index.segment_map()

    db.create_bubble_tables(chr_dir)

    bubbles = []

    for raw_chain in graph.b_chains:
        chain = create_chain_object(raw_chain, step_dict)
        bubbles.extend(chain.bubbles)

    find_children(bubbles)

    db.insert_bubbles(chr_dir, bubbles)
    store_bubble_links(links, bubbles, chr_dir)
    
    if plot:
        plot_path = os.path.join(chr_dir, "bubbles.plot.svg")
        plot_bubbles(bubbles, output_path=plot_path)

