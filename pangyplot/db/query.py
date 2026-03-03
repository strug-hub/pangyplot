from collections import Counter
from types import SimpleNamespace
from pangyplot.objects.Chain import Chain
from pangyplot.preprocess.skeleton.graph_simplify import rdp_simplify


def _seg_centroid(sid, seg_index):
    """Return (cx, cy) for a segment id, or None if invalid."""
    if sid < len(seg_index.valid) and seg_index.valid[sid]:
        return ((seg_index.x1[sid] + seg_index.x2[sid]) / 2.0,
                (seg_index.y1[sid] + seg_index.y2[sid]) / 2.0)
    return None


def _build_chain_polyline(chain, stepidx, seg_index):
    """Build an RDP-simplified polyline for a chain.

    For ref-path chains (bubbles have range_inclusive), walks reference steps
    at adaptive stride. For non-ref chains, falls back to bubble centroids.

    Per-bubble fractional positions along the chain are returned in
    ``bubble_positions``.
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
                pt = _seg_centroid(sid, seg_index)
                if pt and (not raw_polyline or raw_polyline[-1] != pt):
                    raw_polyline.append(pt)
            step += stride

        # Always include the endpoint
        if max_step < len(stepidx.segments):
            sid = stepidx.segments[max_step]
            pt = _seg_centroid(sid, seg_index)
            if pt and (not raw_polyline or raw_polyline[-1] != pt):
                raw_polyline.append(pt)
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

    # Bubble positions: fractional t along chain for each leaf bubble
    bubble_positions = []
    step_span = (max_step - min_step) if (min_step is not None and max_step is not None and max_step > min_step) else 0
    if step_span > 0:
        for b in chain.bubbles:
            if b.children:
                continue
            # Midpoint step of this bubble's range_inclusive
            mid_step = None
            for rs, re in b.range_inclusive:
                mid_step = (rs + re) / 2.0
                break
            if mid_step is None:
                continue
            t = (mid_step - min_step) / step_span
            t = max(0.0, min(1.0, t))
            bubble_positions.append({
                "t": round(t, 4),
                "subtype": b.subtype,
                "length": b.length,
                "id": f"b{b.id}",
                "pos": b.chain_step,
            })

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
        "bubble_positions": bubble_positions,
    }


def _bubble_layout_span(bubble):
    """Layout coordinate extent (max of x and y span)."""
    return max(abs(bubble.x2 - bubble.x1), abs(bubble.y2 - bubble.y1))


def _build_connector(parent_chain, leaf_bubbles, stepidx, seg_index,
                     connector_idx, depth):
    """Build a connector polyline from a run of leaf bubbles."""
    sub_chain = Chain(
        chain_id=f"{parent_chain.id}_r{connector_idx}",
        bubbles=leaf_bubbles)
    entry = _build_chain_polyline(sub_chain, stepidx, seg_index)
    if entry is None:
        return None
    entry["id"] = f"c{parent_chain.id}_r{connector_idx}"
    entry["depth"] = depth
    entry["connector"] = True
    entry["bubble_ids"] = [b.id for b in leaf_bubbles]
    return entry


def _decompose_chain(chain, expand_threshold, bubble_threshold,
                     bubbleidx, stepidx, seg_index, depth, max_depth):
    """Decompose a chain into sub-chains or individual bubbles.

    Two thresholds control progressive detail:
    - expand_threshold: if any bubble exceeds this, replace the chain
      with child chains from inside its bubbles (one level).
    - bubble_threshold: if the chain's layout span exceeds this (and it
      wasn't decomposed into sub-chains), expose individual bubbles.
    """
    # No expansion: return chain as-is or expose bubbles
    if expand_threshold is None or depth >= max_depth:
        return _chain_or_bubbles(chain, bubble_threshold, stepidx, seg_index, depth)

    # Gate: does any bubble in this chain exceed the threshold?
    should_decompose = any(
        b.children and _bubble_layout_span(b) > expand_threshold
        for b in chain.bubbles
    )

    if not should_decompose:
        return _chain_or_bubbles(chain, bubble_threshold, stepidx, seg_index, depth)

    # Replace the parent chain with child chains from all its bubbles.
    # Only decompose one level: child chains are returned as-is (or as bubbles).
    # Runs of leaf bubbles between expanded superbubbles become connectors.
    chains = []
    bubbles = []

    # Collect child chains from inside expanded superbubbles
    for b in chain.bubbles:
        if not b.children:
            continue
        child_bubbles = [bubbleidx[cid] for cid in b.children]
        child_chains = bubbleidx.create_chains(child_bubbles, parent_bubble=b)
        for cc in child_chains:
            r = _chain_or_bubbles(cc, bubble_threshold, stepidx, seg_index, depth + 1)
            chains.extend(r["chains"])
            bubbles.extend(r["bubbles"])

    # Build connector polylines from runs of leaf bubbles
    leaf_run = []
    connector_idx = 0
    for b in chain.bubbles:
        if b.children:
            if len(leaf_run) >= 2:
                connector = _build_connector(
                    chain, leaf_run, stepidx, seg_index, connector_idx, depth)
                if connector:
                    chains.append(connector)
                    connector_idx += 1
            leaf_run = []
        else:
            leaf_run.append(b)
    # Trailing run
    if len(leaf_run) >= 2:
        connector = _build_connector(
            chain, leaf_run, stepidx, seg_index, connector_idx, depth)
        if connector:
            chains.append(connector)

    return {"chains": chains, "bubbles": bubbles}


def _chain_or_bubbles(chain, bubble_threshold, stepidx, seg_index, depth):
    """Return a chain as a polyline with inline bubble_positions."""
    entry = _build_chain_polyline(chain, stepidx, seg_index)
    if entry is None:
        return {"chains": [], "bubbles": []}
    entry["depth"] = depth
    return {"chains": [entry], "bubbles": []}


def _expose_chain_bubbles(chain):
    """Return individual bubbles from a chain as point features.

    Skips superbubbles with children — those are intermediate hierarchy
    nodes that will be decomposed into child chains on further zoom.
    Only leaf bubbles (no children) are exposed as visible features.
    """
    bubbles = []
    for b in chain.bubbles:
        if b.children:
            continue
        cx = (b.x1 + b.x2) / 2.0
        cy = (b.y1 + b.y2) / 2.0
        rx = abs(b.x2 - b.x1) / 2.0
        ry = abs(b.y2 - b.y1) / 2.0
        bubbles.append({
            "id": f"b{b.id}",
            "x": round(cx, 1),
            "y": round(cy, 1),
            "rx": round(max(rx, 0.5), 1),
            "ry": round(max(ry, 0.5), 1),
            "subtype": b.subtype,
            "length": b.length,
            "chain": f"c{chain.id}",
        })
    return bubbles


def _chain_layout_span(chain):
    """Layout span of a chain from its bubbles' bounding boxes."""
    if not chain.bubbles:
        return 0
    min_x = min(b.x1 for b in chain.bubbles)
    max_x = max(b.x2 for b in chain.bubbles)
    min_y = min(b.y1 for b in chain.bubbles)
    max_y = max(b.y2 for b in chain.bubbles)
    return max(max_x - min_x, max_y - min_y)


def get_chains(indexes, genome, chrom, start, end, expand_threshold=None,
               bubble_threshold=None):
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None:
        raise ValueError(f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    chains = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)

    seg_index = gfaidx.segment_index

    chain_results = []
    bubble_results = []
    for chain in chains:
        r = _decompose_chain(
            chain, expand_threshold, bubble_threshold,
            bubbleidx, stepidx, seg_index, depth=0, max_depth=3)
        chain_results.extend(r["chains"])
        bubble_results.extend(r["bubbles"])

    return {"chains": chain_results, "bubbles": bubble_results}


def _bubbles_to_subgraph(bubbles, bubbleidx, gfaidx, stepidx):
    """Build a hybrid subgraph from a list of bubbles.

    Leaf bubbles (no children) stay as bubble nodes, hiding their
    internal segments.  Superbubbles (have children) are auto-popped
    one level: their naked internal segments become visible nodes and
    their child bubbles become bubble nodes.

    Links are redirected like core pangyplot's viewState: segment
    endpoints hidden inside a bubble redirect to that bubble node.
    """
    # seg_id → bubble_id for segments hidden inside a bubble node
    seg_to_bubble = {}
    bubble_nodes = []
    visible_seg_ids = set()
    all_seg_ids = set()

    for b in bubbles:
        b_segs = set(b.source_segments + b.sink_segments) | b.inside
        all_seg_ids.update(b_segs)

        if not b.children:
            # Leaf bubble: keep as node, map all its segments for redirection
            bubble_nodes.append(b)
            for sid in b_segs:
                seg_to_bubble[sid] = b.id
        else:
            # Superbubble: pop one level
            child_seg_set = set()
            for cid in b.children:
                child = bubbleidx[cid]
                bubble_nodes.append(child)
                c_segs = set(child.source_segments + child.sink_segments) | child.inside
                for sid in c_segs:
                    seg_to_bubble[sid] = child.id
                child_seg_set.update(c_segs)

            # Children's segments must be in all_seg_ids so get_subgraph
            # discovers links between them (parent's inside is empty).
            all_seg_ids.update(child_seg_set)

            # Naked segments = parent's segments minus everything owned by children
            visible_seg_ids.update(b_segs - child_seg_set)

    # Fetch full subgraph for link discovery
    segments, raw_links = gfaidx.get_subgraph(all_seg_ids, stepidx)
    visible_segments = [s for s in segments if s.id in visible_seg_ids]

    # Redirect links: segment inside bubble → bubble node
    seen = set()
    result_links = []
    for link in raw_links:
        if link.from_id not in all_seg_ids or link.to_id not in all_seg_ids:
            continue

        from_bub = seg_to_bubble.get(link.from_id)
        to_bub = seg_to_bubble.get(link.to_id)

        # Skip internal links (both endpoints in same bubble)
        if from_bub is not None and to_bub is not None and from_bub == to_bub:
            continue

        new_link = link.clone()
        if from_bub is not None:
            new_link.from_type = 'b'
            new_link.from_id = from_bub
        if to_bub is not None:
            new_link.to_type = 'b'
            new_link.to_id = to_bub

        # Deduplicate (multiple segment links may collapse to same b→b)
        lid = new_link.id()
        if lid not in seen:
            seen.add(lid)
            result_links.append(new_link)

    return {
        "nodes": [b.serialize() for b in bubble_nodes] +
                 [s.serialize() for s in visible_segments],
        "links": [l.serialize() for l in result_links],
    }


def get_chain_graph(indexes, chain_id, genome, chrom, start_pos=None, end_pos=None):
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None or gfaidx is None:
        raise ValueError(f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    from pangyplot.db.sqlite import bubble_db as db

    if start_pos is not None and end_pos is not None:
        # Partial: fetch only bubbles in the given chain_step range
        bubble_ids = db.get_bubble_ids_from_chain(
            bubbleidx.dir, chain_id, start_pos, end_pos)
    else:
        # Full chain (existing behavior)
        chain_ends = bubbleidx.get_chain_ends(chain_id)
        if chain_ends is None:
            return {"nodes": [], "links": []}

        (_, min_step), (_, max_step) = chain_ends
        bubble_ids = db.get_bubble_ids_from_chain(
            bubbleidx.dir, chain_id, min_step, max_step)

    bubbles = [bubbleidx[bid] for bid in bubble_ids]

    return _bubbles_to_subgraph(bubbles, bubbleidx, gfaidx, stepidx)


def get_bubbles_subgraph(indexes, bubble_ids, genome, chrom):
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None or gfaidx is None:
        raise ValueError(f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    bubbles = [bubbleidx[bid] for bid in bubble_ids]

    return _bubbles_to_subgraph(bubbles, bubbleidx, gfaidx, stepidx)


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
