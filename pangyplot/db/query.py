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
    # Track which segment produced each polyline endpoint.
    polyline_start_seg = None
    polyline_end_seg = None

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
                    if polyline_start_seg is None:
                        polyline_start_seg = sid
                    polyline_end_seg = sid
            step += stride

        # Always include the endpoint
        if max_step < len(stepidx.segments):
            sid = stepidx.segments[max_step]
            pt = _seg_centroid(sid, seg_index)
            if pt and (not raw_polyline or raw_polyline[-1] != pt):
                raw_polyline.append(pt)
                polyline_end_seg = sid
    else:
        # Non-ref chain: use bubble centroids from ODGI layout.
        # Polyline follows bubble order (source→sink).
        raw_polyline = []
        for b in chain.bubbles:
            cx = (b.x1 + b.x2) / 2.0
            cy = (b.y1 + b.y2) / 2.0
            raw_polyline.append((cx, cy))
        if chain.bubbles[0].source_segments:
            polyline_start_seg = chain.bubbles[0].source_segments[0]
        if chain.bubbles[-1].sink_segments:
            polyline_end_seg = chain.bubbles[-1].sink_segments[0]

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

    # BP span on the reference path (for screen-width LOD decisions)
    if min_step is not None and max_step is not None \
       and min_step < len(stepidx.starts) and max_step < len(stepidx.ends):
        bp_span = stepidx.ends[max_step] - stepidx.starts[min_step]
    else:
        bp_span = total_length

    span = max(abs(raw_polyline[-1][0] - raw_polyline[0][0]),
                abs(raw_polyline[-1][1] - raw_polyline[0][1]))
    epsilon = max(0.5, span / 500)
    polyline = rdp_simplify(raw_polyline, epsilon)

    return {
        "id": f"c{chain.id}",
        "polyline": [[round(x, 1), round(y, 1)] for x, y in polyline],
        "length": total_length,
        "bp_span": bp_span,
        "n_bubbles": len(chain.bubbles),
        "subtype": subtype_counter.most_common(1)[0][0],
        "source_segs": chain.bubbles[0].source_segments,
        "sink_segs": chain.bubbles[-1].sink_segments,
        "bubble_positions": bubble_positions,
        # Internal fields for inline popping (stripped before JSON response)
        "_bubble_ids": [b.id for b in chain.bubbles],
        "_layout_span": span,  # layout-coordinate extent for screen-size estimate
        # Segment IDs at polyline endpoints (for junction graph wiring)
        "_start_seg": polyline_start_seg,
        "_end_seg": polyline_end_seg,
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
    entry["parent_chain"] = f"c{parent_chain.id}"
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
    # Recurse into child chains up to max_depth.
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
            r = _decompose_chain(cc, expand_threshold, bubble_threshold,
                                 bubbleidx, stepidx, seg_index, depth + 1, max_depth)
            for c in r["chains"]:
                c["parent_chain"] = f"c{chain.id}"
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


def _find_junction_graph(chains_data, gfaidx, bubbleidx, seg_index):
    """Find naked GFA segments forming junction graphs between chains.

    BFS from each chain's endpoint segs through segments not owned by any
    bubble. Collects all visited naked segment centroids as junction nodes
    and GFA links between them (or to chain endpoint segs) as junction links.

    Returns (junction_nodes, junction_links) — the raw graph topology at
    inter-chain junction areas.
    """
    from collections import deque
    MAX_HOPS = 8

    # Map: seg_id → chain_id (for ALL endpoint segs: source + sink)
    # Also: seg_id → [x, y] polyline coordinate.
    # Uses _start_seg/_end_seg (the actual segment IDs at each polyline end)
    # to build an exact mapping — no orientation guessing needed.
    endpoint_seg_to_chain = {}
    endpoint_polyline_coord = {}  # seg_id → [x, y] from chain polyline
    for cd in chains_data:
        pl = cd.get("polyline")
        for sid in (cd.get("source_segs") or []):
            endpoint_seg_to_chain[sid] = cd["id"]
        for sid in (cd.get("sink_segs") or []):
            endpoint_seg_to_chain[sid] = cd["id"]
        # Map the segments that actually produced polyline[0] and polyline[-1]
        if pl and len(pl) >= 2:
            start_seg = cd.get("_start_seg")
            end_seg = cd.get("_end_seg")
            if start_seg is not None:
                endpoint_polyline_coord[start_seg] = pl[0]
            if end_seg is not None:
                endpoint_polyline_coord[end_seg] = pl[-1]

    # Collect naked segment IDs visited during BFS
    naked_visited = set()
    # Also track which endpoint segs were reached (for endpoint→naked links)
    endpoint_reached = set()
    # Chain adjacency discovered during BFS
    chain_adj = {}  # chain_id → set of chain_ids

    for cd in chains_data:
        chain_id = cd["id"]
        all_endpoints = (
            list(cd.get("source_segs") or []) +
            list(cd.get("sink_segs") or [])
        )

        for start_seg in all_endpoints:
            queue = deque([(start_seg, 0)])  # (seg_id, hops)
            visited = {start_seg}

            while queue:
                cur, hops = queue.popleft()
                if hops > MAX_HOPS:
                    continue

                for nxt in gfaidx.get_neighbors(cur):
                    if nxt in visited:
                        continue

                    # Reached another chain's endpoint — record adjacency
                    if nxt in endpoint_seg_to_chain:
                        other_chain = endpoint_seg_to_chain[nxt]
                        if other_chain != chain_id:
                            chain_adj.setdefault(chain_id, set()).add(other_chain)
                            chain_adj.setdefault(other_chain, set()).add(chain_id)
                        endpoint_reached.add(nxt)
                        if cur in endpoint_seg_to_chain:
                            endpoint_reached.add(cur)
                        continue

                    # Only traverse naked segments (not owned by any bubble)
                    if bubbleidx.segment_in_bubble(nxt) is not None:
                        continue

                    visited.add(nxt)
                    naked_visited.add(nxt)
                    queue.append((nxt, hops + 1))

    # Build junction nodes: centroid of each naked segment
    junction_nodes = []
    naked_centroids = {}  # seg_id → [x, y]
    for sid in naked_visited:
        pt = _seg_centroid(sid, seg_index)
        if pt:
            coord = [round(pt[0], 1), round(pt[1], 1)]
            naked_centroids[sid] = coord
            junction_nodes.append(coord)

    # Cache coordinates for endpoint segs (for links to/from them).
    # Prefer the chain polyline endpoint coordinate over the segment centroid,
    # because child chains (depth > 0) have polyline endpoints that diverge
    # significantly from segment centroids.
    # Endpoint segs that are naked (not owned by any bubble) also get added
    # to junction_nodes — they're visual hubs even though they're chain ends.
    endpoint_centroids = {}
    for sid in endpoint_reached | set(endpoint_seg_to_chain.keys()):
        if sid not in naked_centroids:
            # Prefer polyline coordinate (matches visual chain position)
            if sid in endpoint_polyline_coord:
                plpt = endpoint_polyline_coord[sid]
                coord = [round(plpt[0], 1), round(plpt[1], 1)]
            else:
                pt = _seg_centroid(sid, seg_index)
                if not pt:
                    continue
                coord = [round(pt[0], 1), round(pt[1], 1)]
            endpoint_centroids[sid] = coord
            if bubbleidx.segment_in_bubble(sid) is None:
                junction_nodes.append(coord)

    # Build junction links from GFA edges (visual only — adjacency already
    # captured in chain_adj during BFS above)
    junction_links = []
    link_seen = set()

    # Helper to get centroid from either map
    def _centroid(sid):
        return naked_centroids.get(sid) or endpoint_centroids.get(sid)

    # Links from naked segments
    for sid in naked_visited:
        if sid not in naked_centroids:
            continue
        for nxt in gfaidx.get_neighbors(sid):
            nxt_pt = _centroid(nxt)
            if not nxt_pt:
                continue
            key = frozenset([sid, nxt])
            if key in link_seen:
                continue
            link_seen.add(key)
            junction_links.append([naked_centroids[sid], nxt_pt])

    # Links between endpoint segs (direct GFA neighbors, no naked seg between)
    for sid in endpoint_reached:
        if sid not in endpoint_centroids:
            continue
        for nxt in gfaidx.get_neighbors(sid):
            if nxt not in endpoint_centroids or nxt == sid:
                continue
            if endpoint_seg_to_chain.get(sid) == endpoint_seg_to_chain.get(nxt):
                continue  # same chain
            key = frozenset([sid, nxt])
            if key in link_seen:
                continue
            link_seen.add(key)
            junction_links.append([endpoint_centroids[sid], endpoint_centroids[nxt]])

    # Serialize adjacency as {chain_id: [neighbor_ids...]}
    chain_adjacency = {k: sorted(v) for k, v in chain_adj.items()}

    return junction_nodes, junction_links, chain_adjacency


def _find_sibling_connectors(chains_data, gfaidx, bubbleidx):
    """Find gap-filler lines between sibling chains connected through the parent bubble.

    For each sibling endpoint, BFS through segments owned by the same parent
    bubble (up to a few hops) to find other sibling endpoints.  Returns a list
    of [[x1,y1],[x2,y2]] pairs using polyline endpoint coordinates.
    """
    from collections import defaultdict, deque
    MAX_HOPS = 4

    # Group chains by parent
    by_parent = defaultdict(list)
    for cd in chains_data:
        parent = cd.get("parent_chain")
        if parent:
            by_parent[parent].append(cd)

    if not by_parent:
        return []

    # Build seg → polyline coordinate for all endpoint segs
    seg_to_coord = {}
    for cd in chains_data:
        pl = cd.get("polyline")
        if not pl or len(pl) < 2:
            continue
        start_seg = cd.get("_start_seg")
        end_seg = cd.get("_end_seg")
        if start_seg is not None:
            seg_to_coord[start_seg] = pl[0]
        if end_seg is not None:
            seg_to_coord[end_seg] = pl[-1]

    connectors = []
    seen = set()  # frozenset of (chain_id_a, endpoint_seg_a, chain_id_b, endpoint_seg_b)
    sibling_adj = {}  # chain_id → set of chain_ids

    for siblings in by_parent.values():
        # Build seg → chain_id for this family's endpoint segs
        ep_seg_to_chain = {}
        for cd in siblings:
            for sid in (cd.get("source_segs") or []) + (cd.get("sink_segs") or []):
                ep_seg_to_chain[sid] = cd["id"]

        # BFS from each endpoint through the parent bubble's segments
        for cd in siblings:
            for start_sid in (cd.get("source_segs") or []) + (cd.get("sink_segs") or []):
                if start_sid not in seg_to_coord:
                    continue
                start_bub = bubbleidx.segment_in_bubble(start_sid)

                queue = deque([(start_sid, 0)])
                visited = {start_sid}

                while queue:
                    cur, hops = queue.popleft()
                    if hops > MAX_HOPS:
                        continue
                    for nxt in gfaidx.get_neighbors(cur):
                        if nxt in visited:
                            continue
                        # Reached another sibling's endpoint?
                        if nxt in ep_seg_to_chain and ep_seg_to_chain[nxt] != cd["id"]:
                            other_chain = ep_seg_to_chain[nxt]
                            sibling_adj.setdefault(cd["id"], set()).add(other_chain)
                            sibling_adj.setdefault(other_chain, set()).add(cd["id"])
                            if nxt in seg_to_coord:
                                key = frozenset([start_sid, nxt])
                                if key not in seen:
                                    seen.add(key)
                                    connectors.append([seg_to_coord[start_sid],
                                                       seg_to_coord[nxt]])
                            continue
                        # Only traverse segments in the same parent bubble
                        if bubbleidx.segment_in_bubble(nxt) != start_bub:
                            continue
                        visited.add(nxt)
                        queue.append((nxt, hops + 1))

    return connectors, sibling_adj


def get_detail_tile(indexes, genome, chrom, start, end, ppbp,
                    expand_threshold=None,
                    layout_min_x=None, layout_max_x=None):
    """Single-request detail tile: chains + inline subgraphs for popped chains.

    The backend decides which chains to pop based on screen width.
    Uses ``_layout_span`` (layout-coordinate extent) converted to pixels
    via a global bp→layout ratio, so chains without reference coordinates
    (e.g. child chains from decomposed superbubbles) are handled correctly.

    When ``layout_min_x``/``layout_max_x`` are provided, top-level bubbles
    are queried by layout x-coordinate instead of bp→step conversion, which
    catches child chains whose parent superbubble step range is outside the
    viewport.
    """
    POP_THRESHOLD_PX = 30

    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None or gfaidx is None:
        raise ValueError(
            f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    # Compute pixels-per-layout-unit from ppbp using global bp↔layout ratio.
    # This lets us estimate screen size for ALL chains (including non-ref ones
    # that lack bp_span) from their layout-coordinate extent.
    seg_index = gfaidx.segment_index
    total_bp = stepidx.ends[-1] - stepidx.starts[0] if len(stepidx.ends) > 0 else 1
    first_sid = stepidx.segments[0] if len(stepidx.segments) > 0 else 0
    last_sid = stepidx.segments[-1] if len(stepidx.segments) > 0 else 0
    x_first = (seg_index.x1[first_sid] + seg_index.x2[first_sid]) / 2.0
    x_last = (seg_index.x1[last_sid] + seg_index.x2[last_sid]) / 2.0
    total_layout_x = abs(x_last - x_first) or 1.0
    pplp = ppbp * total_bp / total_layout_x  # pixels per layout unit

    if layout_min_x is not None and layout_max_x is not None:
        # Layout-based query: catches bubbles whose step range is outside
        # the bp viewport but whose layout coordinates are on-screen.
        chains = bubbleidx.get_top_level_bubbles_by_layout(
            layout_min_x, layout_max_x, as_chains=True)
        chain_results = []
        bubble_results = []
        for chain in chains:
            r = _decompose_chain(
                chain, expand_threshold, None,
                bubbleidx, stepidx, seg_index, depth=0, max_depth=3)
            chain_results.extend(r["chains"])
            bubble_results.extend(r["bubbles"])
        chain_result = {"chains": chain_results, "bubbles": bubble_results}
    else:
        chain_result = get_chains(indexes, genome, chrom, start, end,
                                  expand_threshold=expand_threshold)

    result_chains = []
    for chain_data in chain_result["chains"]:
        # Use layout span for screen-size estimate (works for all chains)
        layout_span = chain_data.pop("_layout_span", 0)
        screen_width = layout_span * pplp

        # Extract internal bubble IDs (already loaded during get_chains)
        # and strip from the response — connector chains keep their public
        # "bubble_ids" field, regular chains had only the internal one.
        bubble_ids = chain_data.pop("_bubble_ids", None)
        if bubble_ids is None:
            # Connector chains store IDs under "bubble_ids"
            bubble_ids = chain_data.get("bubble_ids", [])

        if screen_width >= POP_THRESHOLD_PX and chain_data["n_bubbles"] > 0:
            try:
                bubbles = [bubbleidx[bid] for bid in bubble_ids]
                graph = _bubbles_to_subgraph(
                    bubbles, bubbleidx, gfaidx, stepidx)
                chain_data["popped"] = True
                chain_data["graph"] = graph
            except Exception as e:
                print(f"  Inline pop failed for {chain_data['id']}: {e}")
                chain_data["popped"] = False
                chain_data["graph"] = None
        else:
            chain_data["popped"] = False
            chain_data["graph"] = None

        result_chains.append(chain_data)

    junction_nodes, junction_links, junction_adj = \
        _find_junction_graph(
            result_chains, gfaidx, bubbleidx, seg_index)
    sibling_connectors, sibling_adj = \
        _find_sibling_connectors(result_chains, gfaidx, bubbleidx)

    # Merge junction + sibling adjacency into one map
    chain_adjacency = {}
    for src in (junction_adj, sibling_adj):
        for k, v in src.items():
            chain_adjacency.setdefault(k, set()).update(v)
    chain_adjacency = {k: sorted(v) for k, v in chain_adjacency.items()}

    return {
        "tile_start": start,
        "tile_end": end,
        "chains": result_chains,
        "bubbles": chain_result.get("bubbles", []),
        "junction_nodes": junction_nodes,
        "junction_links": junction_links,
        "chain_adjacency": chain_adjacency,
        "sibling_connectors": sibling_connectors,
    }
