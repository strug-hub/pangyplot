from pangyplot.db.chain_polyline import (
    decompose_chain, find_junction_graph,
    _seg_centroid,
)


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
        r = decompose_chain(
            chain, expand_threshold, bubble_threshold,
            bubbleidx, stepidx, seg_index, gfaidx, depth=0, max_depth=3)
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

    # Fetch full subgraph for link discovery (fast=True: in-memory link arrays)
    segments, raw_links = gfaidx.get_subgraph(all_seg_ids, stepidx, fast=True)
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
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None or gfaidx is None:
        raise ValueError(
            f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    seg_index = gfaidx.segment_index

    # --- Decompose chains and collect structural adjacency + bypass links ---
    decomp_adj = {}
    bypass_links = []
    bypass_seg_ids = set()
    bypass_gfa_links = []
    decomposed_bubbles = set()

    if layout_min_x is not None and layout_max_x is not None:
        chains = bubbleidx.get_top_level_bubbles_by_layout(
            layout_min_x, layout_max_x, as_chains=True)
        chain_results = []
        bubble_results = []
        for chain in chains:
            r = decompose_chain(
                chain, expand_threshold, None,
                bubbleidx, stepidx, seg_index, gfaidx, depth=0, max_depth=3)
            chain_results.extend(r["chains"])
            bubble_results.extend(r["bubbles"])
            bypass_links.extend(r.get("bypass_links", []))
            bypass_seg_ids.update(r.get("bypass_seg_ids", set()))
            bypass_gfa_links.extend(r.get("bypass_gfa_links", []))
            decomposed_bubbles.update(r.get("decomposed_bubbles", set()))
            for k, v in r.get("adjacency", {}).items():
                decomp_adj.setdefault(k, set()).update(v)
        chain_result = {"chains": chain_results, "bubbles": bubble_results}
    else:
        # get_chains doesn't propagate adjacency, so decompose directly
        start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
        top_chains = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)
        chain_results = []
        bubble_results = []
        for chain in top_chains:
            r = decompose_chain(
                chain, expand_threshold, None,
                bubbleidx, stepidx, seg_index, gfaidx, depth=0, max_depth=3)
            chain_results.extend(r["chains"])
            bubble_results.extend(r["bubbles"])
            bypass_links.extend(r.get("bypass_links", []))
            bypass_seg_ids.update(r.get("bypass_seg_ids", set()))
            bypass_gfa_links.extend(r.get("bypass_gfa_links", []))
            decomposed_bubbles.update(r.get("decomposed_bubbles", set()))
            for k, v in r.get("adjacency", {}).items():
                decomp_adj.setdefault(k, set()).update(v)
        chain_result = {"chains": chain_results, "bubbles": bubble_results}

    # --- Inline pop (subgraph expansion for all chains with bubbles) ---
    # Save bubble→chain mapping before pop removes _bubble_ids
    _bid_to_chain = {}
    for cd in chain_result["chains"]:
        for bid in (cd.get("_bubble_ids") or cd.get("bubble_ids") or []):
            _bid_to_chain[bid] = cd["id"]

    n_popped = 0
    result_chains = []
    for chain_data in chain_result["chains"]:
        chain_data.pop("_layout_span", None)

        # Extract internal bubble IDs (already loaded during get_chains)
        # and strip from the response — connector chains keep their public
        # "bubble_ids" field, regular chains had only the internal one.
        bubble_ids = chain_data.pop("_bubble_ids", None)
        if bubble_ids is None:
            # Connector chains store IDs under "bubble_ids"
            bubble_ids = chain_data.get("bubble_ids", [])

        if chain_data["n_bubbles"] > 0:
            try:
                bubbles = [bubbleidx[bid] for bid in bubble_ids]
                graph = _bubbles_to_subgraph(
                    bubbles, bubbleidx, gfaidx, stepidx)
                chain_data["popped"] = True
                chain_data["graph"] = graph
                n_popped += 1
            except Exception as e:
                print(f"  Inline pop failed for {chain_data['id']}: {e}")
                chain_data["popped"] = False
                chain_data["graph"] = None
        else:
            chain_data["popped"] = False
            chain_data["graph"] = None

        result_chains.append(chain_data)

    # --- Junction graph BFS ---
    junction_nodes, junction_links, junction_adj, \
        naked_visited, naked_seg_chains = \
        find_junction_graph(
            result_chains, gfaidx, bubbleidx, seg_index,
            decomposed_bubbles=decomposed_bubbles)

    # --- Merge bypass segments into junction nodes/links ---
    if bypass_seg_ids:
        # Build centroid cache for bypass segments
        bypass_centroids = {}  # seg_id → [x, y]
        existing_coords = {tuple(c) for c in junction_nodes}
        for sid in bypass_seg_ids:
            pt = _seg_centroid(sid, seg_index)
            if pt:
                coord = [round(pt[0], 1), round(pt[1], 1)]
                bypass_centroids[sid] = coord
                if tuple(coord) not in existing_coords:
                    junction_nodes.append(coord)
                    existing_coords.add(tuple(coord))

        # Build chain endpoint seg → coordinate map for link targets
        endpoint_coords = {}  # seg_id → [x, y]
        for cd in result_chains:
            pl = cd.get("polyline")
            if not pl or len(pl) < 2:
                continue
            start_seg = cd.get("_start_seg")
            end_seg = cd.get("_end_seg")
            if start_seg is not None:
                endpoint_coords[start_seg] = pl[0]
            if end_seg is not None:
                endpoint_coords[end_seg] = pl[-1]
            # Also map all source/sink segs to nearest polyline endpoint
            for sid in (cd.get("source_segs") or []):
                if sid not in endpoint_coords:
                    endpoint_coords[sid] = pl[0]
            for sid in (cd.get("sink_segs") or []):
                if sid not in endpoint_coords:
                    endpoint_coords[sid] = pl[-1]

        link_seen = set()
        for l in junction_links:
            link_seen.add((tuple(l[0]), tuple(l[1])))
            link_seen.add((tuple(l[1]), tuple(l[0])))

        def _add_link(ca, cb, sid_a, sid_b):
            key = (tuple(ca), tuple(cb))
            if key not in link_seen:
                link_seen.add(key)
                link_seen.add((tuple(cb), tuple(ca)))
                junction_links.append([ca, cb, sid_a, sid_b])

        # Add bypass-to-bypass GFA links
        for from_id, to_id in bypass_gfa_links:
            ca = bypass_centroids.get(from_id)
            cb = bypass_centroids.get(to_id)
            if ca and cb:
                _add_link(ca, cb, from_id, to_id)

        # Add bypass-to-chain-endpoint GFA links
        for sid in bypass_seg_ids:
            ca = bypass_centroids.get(sid)
            if not ca:
                continue
            for nxt in gfaidx.get_neighbors(sid):
                if nxt in bypass_seg_ids:
                    continue  # already handled above
                cb = endpoint_coords.get(nxt)
                if cb:
                    _add_link(ca, cb, sid, nxt)

    # --- Serialize junction graph (full Segment/Link objects for physics) ---
    # Exclude chain endpoint segments — their geometry overlaps chain polylines
    # and creates stray lines when chains are popped.
    chain_endpoint_segs = set()
    for cd in result_chains:
        chain_endpoint_segs.update(cd.get("source_segs") or [])
        chain_endpoint_segs.update(cd.get("sink_segs") or [])
    all_junction_seg_ids = (naked_visited | bypass_seg_ids) - chain_endpoint_segs
    if all_junction_seg_ids:
        jg_segments, jg_links = gfaidx.get_subgraph(
            all_junction_seg_ids, stepidx, fast=True)
        junction_graph = {
            "nodes": [s.serialize() for s in jg_segments],
            "links": [l.serialize() for l in jg_links],
        }
        # Build junction_seg_chains: seg_id → list of chain IDs
        # Merge bypass segs into naked_seg_chains (bypass segs connect to
        # the chains whose source/sink segs are GFA-adjacent)
        ep_to_chain = {}
        for cd in result_chains:
            for sid in (cd.get("source_segs") or []):
                ep_to_chain[sid] = cd["id"]
            for sid in (cd.get("sink_segs") or []):
                ep_to_chain[sid] = cd["id"]
        for sid in bypass_seg_ids:
            for nxt in gfaidx.get_neighbors(sid):
                cid = ep_to_chain.get(nxt)
                if cid:
                    naked_seg_chains.setdefault(sid, set()).add(cid)

        # Map internal bubble segs that appear in junction graph links
        # to their owning chain.  These segs are inside chain bubbles
        # (not naked, not chain endpoints) but have GFA edges to junction
        # nodes.  Without this mapping the frontend linkResolver can't
        # resolve them to the correct chain phantom.
        for link in jg_links:
            for seg_id in (link.from_id, link.to_id):
                if seg_id in all_junction_seg_ids:
                    continue
                if seg_id in chain_endpoint_segs:
                    continue
                if seg_id in naked_seg_chains:
                    continue
                bub_id = bubbleidx.segment_in_bubble(seg_id)
                if bub_id is None:
                    continue
                cid = _bid_to_chain.get(bub_id)
                if cid:
                    naked_seg_chains.setdefault(seg_id, set()).add(cid)

        junction_seg_chains = {
            f"s{k}": sorted(v) for k, v in naked_seg_chains.items()
        }
    else:
        junction_graph = {"nodes": [], "links": []}
        junction_seg_chains = {}

    # --- Merge adjacency ---
    chain_adjacency = {}
    for src in (decomp_adj, junction_adj):
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
        "junction_graph": junction_graph,
        "junction_seg_chains": junction_seg_chains,
        "chain_adjacency": chain_adjacency,
    }
