from collections import defaultdict
from pangyplot.objects.Bubble import Bubble

def find_parent_children(bubbles):
    bubble_dict = {bubble.id: bubble for bubble in bubbles}

    for bubble in bubbles:
        if bubble.parent:
            bubble_parent = bubble_dict[bubble.parent]
            bubble_parent.add_child(bubble, bubble_dict)

def find_siblings(bubbles):
    segment_to_bubbles = defaultdict(set)
    shared_segments = defaultdict(set)
    bubble_dict = {bubble.id: bubble for bubble in bubbles}

    for bubble in bubbles:
        for sid in bubble.get_sibling_segments():
            segment_to_bubbles[sid].add(bubble)

    for bubble in bubbles:
        for sid in bubble.get_sibling_segments():
            for sibling in segment_to_bubbles[sid]:
                if sibling.id != bubble.id:
                    key = (bubble.id, sibling.id)
                    shared_segments[key].add(sid)

    # Apply sibling relationships
    for (bid, sib_id), shared_sids in shared_segments.items():
        bubble_dict[bid].add_sibling(sib_id, list(shared_sids))
        bubble_dict[sib_id].add_sibling(bid, list(shared_sids))

def find_parent_children(bubbles):
    bubble_dict = {bubble.id: bubble for bubble in bubbles}

    for bubble in bubbles:
        if bubble.parent:
            bubble_parent = bubble_dict[bubble.parent]
            bubble_parent.add_child(bubble, bubble_dict)

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
    bubble._source = int(source_node.id)
    compacted_source_nodes = list(source_node.optional_info.get("compacted", []))
    bubble._compacted_source = [int(node.id) for node in compacted_source_nodes]

    sink_node = raw_bubble.sink
    bubble._sink = int(sink_node.id)
    compacted_sink_nodes = list(sink_node.optional_info.get("compacted", []))
    bubble._compacted_sink = [int(node.id) for node in compacted_sink_nodes]

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
    source_steps = get_steps([int(n.id) for n in [source_node] + compacted_source_nodes])
    sink_steps = get_steps([int(n.id) for n in [sink_node] + compacted_sink_nodes])

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

    bubble._range_exclusive = collapse_ranges(inside_steps)
    bubble._range_inclusive = collapse_ranges(inside_steps.union(source_steps, sink_steps))

    # Length and base content
    bubble.length = sum(n.seq_len for n in nodes)
    bubble.gc_count = sum(n.optional_info.get("gc_count", 0) for n in nodes)
    bubble.n_counts = sum(n.optional_info.get("n_count", 0) for n in nodes)

    return bubble
