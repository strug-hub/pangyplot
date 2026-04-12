from pangyplot.db.chain_polyline import (
    decompose_chain, find_junction_graph,
    _seg_centroid,
)
from pangyplot.db.sqlite import bubble_db as db


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
        return {"source_segs": [], "sink_segs": [], "nodes": [], "links": []}

    id = int(id.replace("b", ""))

    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]

    subgraph = bubbleidx.get_popped_subgraph(id, stepidx)

    return {
        "source_segs": subgraph["source_segs"],
        "sink_segs": subgraph["sink_segs"],
        "nodes": [node.serialize() for node in subgraph["nodes"]],
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


def get_path_meta(indexes, chrom, sample):
    """Return metadata for a sample's paths with precomputed bp ranges."""
    gfaidx = indexes.gfa_index[chrom]
    return gfaidx.path_index.get_path_meta_with_bp(sample)


def get_path_raw(indexes, chrom, sample, file_index):
    """Return raw compressed bytes for a specific path file."""
    gfaidx = indexes.gfa_index[chrom]
    return gfaidx.path_index.get_path_raw(sample, file_index)


def get_bubble_meta(indexes, genome, chrom, raw_chain_id):
    """Return lightweight per-bubble metadata for a chain.

    raw_chain_id is the frontend chain ID: 'c42' or 'c42:5-10' (connector).
    Returns a list of dicts with id, t, length, gc_count, size, subtype,
    bp_start, bp_end, is_ref for each leaf bubble.
    """
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    if stepidx is None or bubbleidx is None:
        raise ValueError(f"Genome '{genome}' or chromosome '{chrom}' not found.")

    # Parse chain ID: "c42" or "c42:5-10"
    stripped = raw_chain_id.lstrip('c')
    if ':' in stripped:
        parts = stripped.split(':')
        chain_id = int(parts[0])
        step_range = parts[1].split('-')
        start_step, end_step = int(step_range[0]), int(step_range[1])
        bubble_ids = db.get_bubble_ids_from_chain(
            bubbleidx.dir, chain_id, start_step, end_step)
    else:
        chain_id = int(stripped)
        chain_ends = bubbleidx.get_chain_ends(chain_id)
        if chain_ends is None:
            return []
        (_, min_step), (_, max_step) = chain_ends
        bubble_ids = db.get_bubble_ids_from_chain(
            bubbleidx.dir, chain_id, min_step, max_step)

    if not bubble_ids:
        return []

    # Load bubble objects (uses FIFO cache in BubbleIndex)
    bubbles = [bubbleidx[bid] for bid in bubble_ids]

    n = len(bubbles)

    result = []
    for idx, b in enumerate(bubbles):
        t = round(idx / max(1, n - 1), 4) if n > 1 else 0.5

        # Convert step ranges to bp coordinates
        bp_start = None
        bp_end = None
        for rs, re in b.range_inclusive:
            if rs < len(stepidx.starts):
                s = stepidx.starts[rs]
                if bp_start is None or s < bp_start:
                    bp_start = s
            if re < len(stepidx.ends):
                e = stepidx.ends[re]
                if bp_end is None or e > bp_end:
                    bp_end = e

        result.append({
            "id": f"b{b.id}",
            "t": round(t, 4),
            "length": b.length,
            "gc_count": b.gc_count,
            "size": len(b.inside),
            "subtype": b.subtype,
            "bp_start": bp_start,
            "bp_end": bp_end,
            "is_ref": len(b.range_inclusive) > 0,
            "source_segs": b.source_segments,
            "sink_segs": b.sink_segments,
        })

    return result


def generate_gfa(indexes, genome, chrom, bubble_ids, segment_ids=None):
    """Build GFA 1.0 lines for the subgraph defined by bubble and/or segment IDs.

    Resolves bubbles → segments (recursive via get_descendant_ids),
    merges in any explicitly requested segment IDs, fetches full
    Segment objects with sequences, discovers links, and extracts
    P-lines from haplotype paths.

    All data is fetched eagerly (requires app context), then yields
    formatted lines so Flask can stream the response.
    """
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None or gfaidx is None:
        raise ValueError(
            f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    # 1. Resolve bubble IDs → segment IDs
    seg_ids = set()
    for bid in bubble_ids:
        bubble = bubbleidx[bid]
        if bubble is None:
            print(f"[GFA export] WARNING: bubble {bid} not found in index, skipping")
            continue
        seg_ids.update(bubbleidx.get_descendant_ids(bubble))

    # 1b. Add explicitly requested segment IDs
    if segment_ids:
        seg_ids.update(segment_ids)

    if not seg_ids:
        return iter([])

    # 2. Fetch segments (with sequences) and links — eager, needs app context
    segments, raw_links = gfaidx.get_subgraph(seg_ids, stepidx)

    # 3. Filter + deduplicate links
    seen_links = set()
    links = []
    for link in raw_links:
        if link.from_id not in seg_ids or link.to_id not in seg_ids:
            continue
        key = (link.from_id, link.from_strand, link.to_id, link.to_strand)
        if key not in seen_links:
            seen_links.add(key)
            links.append(link)

    # 4. Collect P-line data from haplotype paths — eager, reads JSON files
    p_lines = []
    for sample in gfaidx.get_samples():
        for path in gfaidx.get_paths(sample):
            current_run = []
            for seg_id, strand in path:
                if seg_id in seg_ids:
                    current_run.append(f"{seg_id}{strand}")
                else:
                    if current_run:
                        name = f"{path.sample}#{path.hap or '0'}#{path.contig}"
                        p_lines.append(f"P\t{name}\t{','.join(current_run)}\t*\n")
                        current_run = []
            if current_run:
                name = f"{path.sample}#{path.hap or '0'}#{path.contig}"
                p_lines.append(f"P\t{name}\t{','.join(current_run)}\t*\n")

    # 5. Yield formatted GFA lines (no app context needed from here)
    def _lines():
        yield "H\tVN:Z:1.0\n"
        for seg in segments:
            yield f"S\t{seg.id}\t{seg.seq or '*'}\n"
        for link in links:
            yield f"L\t{link.from_id}\t{link.from_strand}\t{link.to_id}\t{link.to_strand}\t0M\n"
        yield from p_lines

    return _lines()


CANONICAL_EXPAND_THRESHOLD = 100  # fixed layout-unit decomposition level



def get_detail_tile(indexes, genome, chrom, start, end, ppbp,
                    expand_threshold=None,
                    layout_min_x=None, layout_max_x=None):
    """Single-request detail tile: chains + inline subgraphs for popped chains.

    Requires a precomputed PolychainIndex and layout viewport coordinates.
    Uses precomputed chain decompositions for fast lookup.

    ``expand_threshold`` is accepted for API compatibility but ignored;
    the canonical ``CANONICAL_EXPAND_THRESHOLD`` is always used to ensure
    stable chain IDs across different viewport sizes.
    """
    import time as _time
    _t = {}
    _t['start'] = _time.perf_counter()

    expand_threshold = CANONICAL_EXPAND_THRESHOLD
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    gfaidx = indexes.gfa_index.get(chrom, None)
    polychainidx = getattr(indexes, 'polychain_index', {}).get(chrom, None)

    if stepidx is None or bubbleidx is None or gfaidx is None:
        raise ValueError(
            f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")
    if polychainidx is None or layout_min_x is None or layout_max_x is None:
        raise ValueError(
            "detail-tiles requires polychain_index and layout_min_x/layout_max_x.")

    seg_index = gfaidx.segment_index

    # --- Decompose chains from precomputed PolychainIndex ---

    merged = polychainidx.get_chains_in_layout_range(layout_min_x, layout_max_x)
    chain_results = merged["chains"]
    bubble_results = merged["bubbles"]
    bypass_links = merged["bypass_links"]
    bypass_seg_ids = merged["bypass_seg_ids"]
    bypass_gfa_links = merged["bypass_gfa_links"]
    decomposed_bubbles = merged["decomposed_bubbles"]
    chain_result = {"chains": chain_results, "bubbles": bubble_results}



    _t['decompose'] = _time.perf_counter()

    # --- Strip internal fields ---
    result_chains = []
    for chain_data in chain_result["chains"]:
        chain_data.pop("_layout_span", None)
        chain_data["popped"] = False
        chain_data["graph"] = None
        result_chains.append(chain_data)



    _t['strip'] = _time.perf_counter()

    # --- Junction graph BFS ---
    junction_nodes, junction_links, naked_visited = find_junction_graph(
        result_chains, gfaidx, bubbleidx, seg_index,
        decomposed_bubbles=decomposed_bubbles)

    _t['junction_bfs'] = _time.perf_counter()

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

    _t['bypass_merge'] = _time.perf_counter()

    # --- Serialize junction graph (full Segment/Link objects for physics) ---
    # Exclude chain endpoint segments — their geometry overlaps chain polylines
    # and creates stray lines when chains are popped.
    chain_endpoint_segs = set()
    for cd in result_chains:
        chain_endpoint_segs.update(cd.get("source_segs") or [])
        chain_endpoint_segs.update(cd.get("sink_segs") or [])
    all_junction_seg_ids = (naked_visited | bypass_seg_ids) - chain_endpoint_segs

    # Filter junction segments to viewport x-range (with 20% buffer).
    # Uses mmap arrays — no SQLite.  Reduces 28K→~500 segments and
    # shrinks the payload from ~20MB to <1MB.
    if all_junction_seg_ids and layout_min_x is not None and layout_max_x is not None:
        x_span = layout_max_x - layout_min_x
        buf = x_span * 0.2
        vp_min = layout_min_x - buf
        vp_max = layout_max_x + buf
        all_junction_seg_ids = {
            sid for sid in all_junction_seg_ids
            if sid < len(seg_index.x1) and
               seg_index.x2[sid] >= vp_min and seg_index.x1[sid] <= vp_max
        }

    if all_junction_seg_ids:
        jg_segments, jg_links = gfaidx.get_subgraph(
            all_junction_seg_ids, stepidx, fast=True)
        # Strip seq and n_count from junction nodes — only used for
        # hover tooltips, not rendering or physics.
        jg_nodes = []
        for s in jg_segments:
            d = s.serialize()
            d.pop("seq", None)
            d.pop("n_count", None)
            jg_nodes.append(d)
        junction_graph = {
            "nodes": jg_nodes,
            "links": [l.serialize() for l in jg_links],
        }
    else:
        junction_graph = {"nodes": [], "links": []}

    _t['junction_serialize'] = _time.perf_counter()

    # Strip remaining internal fields before sending to frontend
    for cd in result_chains:
        cd.pop("_start_seg", None)
        cd.pop("_end_seg", None)
        cd.pop("_min_step", None)
        cd.pop("_max_step", None)
        cd.pop("_pl_x_min", None)
        cd.pop("_pl_x_max", None)

    _t['end'] = _time.perf_counter()
    _s = _t['start']
    print(f"    ⏱ decompose={_t['decompose']-_s:.3f}s"
          f"  strip={_t['strip']-_t['decompose']:.3f}s"
          f"  junction_bfs={_t['junction_bfs']-_t['strip']:.3f}s"
          f"  bypass_merge={_t['bypass_merge']-_t['junction_bfs']:.3f}s"
          f"  junction_ser={_t['junction_serialize']-_t['bypass_merge']:.3f}s"
          f"  total={_t['end']-_s:.3f}s")

    result = {
        "tile_start": start,
        "tile_end": end,
        "chains": result_chains,
        "bubbles": chain_result.get("bubbles", []),
        "junction_nodes": junction_nodes,
        "junction_links": junction_links,
        "junction_graph": junction_graph,
    }

    import json as _json
    _sizes = {}
    for k, v in result.items():
        _sizes[k] = len(_json.dumps(v, default=str)) / 1024
    _sorted = sorted(_sizes.items(), key=lambda x: -x[1])
    print(f"    📦 payload breakdown: " + "  ".join(f"{k}={v:.0f}KB" for k, v in _sorted))

    return result
