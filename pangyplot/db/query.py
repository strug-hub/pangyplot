from collections import Counter
from types import SimpleNamespace
from pangyplot.preprocess.skeleton.graph_simplify import rdp_simplify


def _build_chain_polyline(chain, stepidx, seg_index):
    """Build an RDP-simplified polyline for a chain.

    For ref-path chains (bubbles have range_inclusive), walks reference steps
    at adaptive stride. For non-ref chains, falls back to bubble centroids.
    """
    if not chain.bubbles:
        return None

    min_step = None
    max_step = None
    total_length = 0
    subtype_counter = Counter()
    for b in chain.bubbles:
        total_length += b.length
        subtype_counter[b.subtype] += 1
        for rs, re in b.range_inclusive:
            if min_step is None or rs < min_step:
                min_step = rs
            if max_step is None or re > max_step:
                max_step = re

    # Ref-path walk when we have step coordinates
    if min_step is not None and max_step is not None:
        total_steps = max_step - min_step + 1
        stride = max(1, total_steps // 200)
        raw_polyline = []

        step = min_step
        while step <= max_step:
            if step < len(stepidx.segments):
                sid = stepidx.segments[step]
                if sid < len(seg_index.valid) and seg_index.valid[sid]:
                    cx = (seg_index.x1[sid] + seg_index.x2[sid]) / 2.0
                    cy = (seg_index.y1[sid] + seg_index.y2[sid]) / 2.0
                    raw_polyline.append((cx, cy))
            step += stride

        # Always include the endpoint
        if max_step < len(stepidx.segments):
            sid = stepidx.segments[max_step]
            if sid < len(seg_index.valid) and seg_index.valid[sid]:
                cx = (seg_index.x1[sid] + seg_index.x2[sid]) / 2.0
                cy = (seg_index.y1[sid] + seg_index.y2[sid]) / 2.0
                last = (cx, cy)
                if not raw_polyline or raw_polyline[-1] != last:
                    raw_polyline.append(last)
    else:
        # Non-ref chain: use bubble centroids from ODGI layout
        raw_polyline = []
        for b in chain.bubbles:
            cx = (b.x1 + b.x2) / 2.0
            cy = (b.y1 + b.y2) / 2.0
            raw_polyline.append((cx, cy))

    if len(raw_polyline) < 2:
        # Single-point chain: use bubble bbox corners as a short segment
        if len(chain.bubbles) == 1:
            b = chain.bubbles[0]
            p1 = ((b.x1 + b.x2) / 2.0 - 0.5, (b.y1 + b.y2) / 2.0)
            p2 = ((b.x1 + b.x2) / 2.0 + 0.5, (b.y1 + b.y2) / 2.0)
            raw_polyline = [p1, p2]
        else:
            return None

    span = max(abs(raw_polyline[-1][0] - raw_polyline[0][0]),
                abs(raw_polyline[-1][1] - raw_polyline[0][1]))
    epsilon = max(0.5, span / 500)
    polyline = rdp_simplify(raw_polyline, epsilon)

    return {
        "id": f"c{chain.id}",
        "polyline": [[round(x, 1), round(y, 1)] for x, y in polyline],
        "length": total_length,
        "n_bubbles": len(chain.bubbles),
        "subtype": subtype_counter.most_common(1)[0][0],
        "source_segs": chain.bubbles[0].source_segments,
        "sink_segs": chain.bubbles[-1].sink_segments,
    }


def _bubble_layout_span(bubble):
    """Layout coordinate extent (max of x and y span)."""
    return max(abs(bubble.x2 - bubble.x1), abs(bubble.y2 - bubble.y1))


def _decompose_chain(chain, expand_threshold, bubbleidx, stepidx, seg_index, depth, max_depth):
    """Decompose a chain by replacing it with the child chains inside its bubbles.

    The expand_threshold gates whether to decompose the chain at all
    (any bubble must exceed it). Once triggered, the parent chain is fully
    replaced by the child chains nested inside its bubbles. Leaf bubbles
    (no children) don't produce output — the skeleton layer shows that structure.
    """
    # No expansion: return chain as-is
    if expand_threshold is None or depth >= max_depth:
        entry = _build_chain_polyline(chain, stepidx, seg_index)
        if entry is None:
            return []
        entry["depth"] = depth
        return [entry]

    # Gate: does any bubble in this chain exceed the threshold?
    should_decompose = any(
        b.children and _bubble_layout_span(b) > expand_threshold
        for b in chain.bubbles
    )

    if not should_decompose:
        entry = _build_chain_polyline(chain, stepidx, seg_index)
        if entry is None:
            return []
        entry["depth"] = depth
        return [entry]

    # Replace the parent chain with child chains from all its bubbles
    result = []
    for b in chain.bubbles:
        if not b.children:
            continue
        child_bubbles = [bubbleidx[cid] for cid in b.children]
        child_chains = bubbleidx.create_chains(child_bubbles, parent_bubble=b)
        for cc in child_chains:
            result.extend(_decompose_chain(
                cc, expand_threshold, bubbleidx, stepidx, seg_index,
                depth + 1, max_depth))

    return result


def get_chains(indexes, genome, chrom, start, end, expand_threshold=None):
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None:
        raise ValueError(f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    chains = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)

    seg_index = gfaidx.segment_index

    result = []
    for chain in chains:
        result.extend(_decompose_chain(
            chain, expand_threshold, bubbleidx, stepidx, seg_index,
            depth=0, max_depth=3))

    return {"chains": result}


def get_bubble_graph(indexes, genome, chrom, start, end):

    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None:
        raise ValueError(f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    bubbles = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=False)

    boundary_segs = set()
    for b in bubbles:
        boundary_segs.update(b.source_segments + b.sink_segments)

    _, links = gfaidx.get_subgraph(boundary_segs, stepidx)

    return {
        "nodes": [b.serialize() for b in bubbles],
        "links": [l.serialize() for l in links],
    }

def pop_bubble(indexes, id, genome, chrom):
    if id.startswith("s"):
        return {"source_segs": [], "sink_segs": [], "child_bubbles": [], "nodes": [], "links": []}

    id = int(id.replace("b", ""))

    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]

    subgraph = bubbleidx.get_popped_subgraph(id, stepidx)

    return {
        "source_segs": subgraph["source_segs"],
        "sink_segs": subgraph["sink_segs"],
        "child_bubbles": subgraph["child_bubbles"],
        "nodes": [node.serialize() for node in subgraph["nodes"]] +
                 [b.serialize() for b in subgraph["child_bubble_objects"]],
        "links": [link.serialize() for link in subgraph["links"]],
    }

def get_path(indexes, genome, chrom, start, end, sample):
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index[chrom]

    start_segment, end_segment = stepidx.query_segment_id_from_coordinates(start, end)

    gfaidx = indexes.gfa_index[chrom]
    paths = gfaidx.get_paths(sample)

    all_subpaths = []
    for path in paths:
        subpaths = path.subset_path(start_segment, end_segment, gfaidx=gfaidx)
        all_subpaths.extend(subpaths)

    return [p.serialize(bubbleidx) for p in all_subpaths]

def get_path_order(indexes, genome, chrom):
    gfaidx = indexes.gfa_index[chrom]
    return gfaidx.get_sample_idx()
