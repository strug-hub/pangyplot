"""Build RDP-simplified polylines for chains, connectors, and decomposed chains.

Chains are sequences of bubbles. The polyline follows:
  source_seg centroid → bubble centroids → sink_seg centroid

This is reference-path independent — coordinates come from the ODGI layout.

Decomposition splits a parent chain into child chains from superbubbles
and .N connector sub-runs from leaf bubble runs.  Adjacency between
consecutive groups is emitted from the interleaving order.
"""

from collections import Counter, defaultdict, deque
from pangyplot.objects.Chain import Chain
from pangyplot.preprocess.skeleton.graph_simplify import rdp_simplify


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def _seg_centroid(sid, seg_index):
    """Return (cx, cy) for a segment id, or None if invalid."""
    if sid < len(seg_index.valid) and seg_index.valid[sid]:
        return ((seg_index.x1[sid] + seg_index.x2[sid]) / 2.0,
                (seg_index.y1[sid] + seg_index.y2[sid]) / 2.0)
    return None


def _bubble_layout_span(bubble):
    """Layout coordinate extent (max of x and y span)."""
    return max(abs(bubble.x2 - bubble.x1), abs(bubble.y2 - bubble.y1))


def _find_bypass(superbubble, bubbleidx, gfaidx, seg_index):
    """Find all bypass segments through a superbubble's naked internals.

    When a superbubble is decomposed, some haplotypes skip all child bubbles
    via internal segments that connect source directly to sink (deletion allele).

    Returns a dict with:
      - "polyline": [[x,y], ...] one representative path for rendering
      - "seg_ids": set of ALL naked internal segment IDs found
      - "links": [(from_id, to_id)] GFA links between naked internals
    Or None if no naked internal segments exist.
    """
    # Collect segments owned by children
    child_segs = set()
    for cid in superbubble.children:
        cb = bubbleidx[cid]
        child_segs.update(cb.source_segments + cb.sink_segments)
        child_segs.update(cb.inside)

    # Naked internal = parent's segments not owned by any child
    parent_segs = set(superbubble.source_segments + superbubble.sink_segments) \
                  | superbubble.inside
    naked_internal = parent_segs - child_segs

    if not naked_internal:
        return None

    sink_set = set(superbubble.sink_segments)

    # Flood fill: collect ALL reachable naked internal segments from sources
    all_visited = set()
    first_path = None  # first source-to-sink path for the polyline

    for src in superbubble.source_segments:
        if src not in naked_internal:
            continue
        queue = deque([(src, [src])])
        visited = {src}
        while queue:
            cur, path = queue.popleft()
            for nxt in gfaidx.get_neighbors(cur):
                if nxt in visited or nxt not in naked_internal:
                    continue
                visited.add(nxt)
                new_path = path + [nxt]
                if nxt in sink_set and first_path is None:
                    first_path = new_path
                queue.append((nxt, new_path))
        all_visited.update(visited)

    if not all_visited:
        return None

    # Build representative polyline from first path (or all visited if no path)
    path_for_polyline = first_path or sorted(all_visited)
    pts = []
    for sid in path_for_polyline:
        pt = _seg_centroid(sid, seg_index)
        if pt:
            pts.append([round(pt[0], 1), round(pt[1], 1)])

    # Collect GFA links between naked internals
    bypass_links = []
    for sid in all_visited:
        for nxt in gfaidx.get_neighbors(sid):
            if nxt in all_visited and sid < nxt:
                bypass_links.append((sid, nxt))

    return {
        "polyline": pts if len(pts) >= 2 else None,
        "seg_ids": all_visited,
        "links": bypass_links,
    }


# ---------------------------------------------------------------
# Polyline building
# ---------------------------------------------------------------

def build_chain_polyline(chain, stepidx, seg_index):
    """Build an RDP-simplified polyline for a chain.

    Returns a dict with polyline, metadata, and internal fields for
    junction wiring (_start_seg, _end_seg) and inline popping
    (_bubble_ids, _layout_span).  Returns None if the chain can't
    produce a valid polyline.
    """
    if not chain.bubbles:
        return None

    total_length = 0
    subtype_counter = Counter()
    raw_polyline = []

    # Start with source segment centroid (chain entry point)
    polyline_start_seg = None
    polyline_end_seg = None
    if chain.bubbles[0].source_segments:
        polyline_start_seg = chain.bubbles[0].source_segments[0]
        pt = _seg_centroid(polyline_start_seg, seg_index)
        if pt:
            raw_polyline.append(pt)

    # Bubble centroids
    for b in chain.bubbles:
        total_length += b.length
        subtype_counter[b.subtype] += 1
        cx = (b.x1 + b.x2) / 2.0
        cy = (b.y1 + b.y2) / 2.0
        if not raw_polyline or raw_polyline[-1] != (cx, cy):
            raw_polyline.append((cx, cy))

    # End with sink segment centroid (chain exit point)
    if chain.bubbles[-1].sink_segments:
        polyline_end_seg = chain.bubbles[-1].sink_segments[0]
        pt = _seg_centroid(polyline_end_seg, seg_index)
        if pt and (not raw_polyline or raw_polyline[-1] != pt):
            raw_polyline.append(pt)

    if len(raw_polyline) < 2:
        if len(chain.bubbles) == 1:
            b = chain.bubbles[0]
            p1 = ((b.x1 + b.x2) / 2.0 - 0.5, (b.y1 + b.y2) / 2.0)
            p2 = ((b.x1 + b.x2) / 2.0 + 0.5, (b.y1 + b.y2) / 2.0)
            raw_polyline = [p1, p2]
        else:
            return None

    # Bubble positions: fractional t along chain by index
    bubble_positions = []
    n_bubbles = len(chain.bubbles)
    for idx, b in enumerate(chain.bubbles):
        if b.children:
            continue
        t = idx / max(1, n_bubbles - 1) if n_bubbles > 1 else 0.5
        bubble_positions.append({
            "t": round(t, 4),
            "subtype": b.subtype,
            "length": b.length,
            "id": f"b{b.id}",
            "pos": b.chain_step,
        })

    # BP span from reference path (for LOD decisions)
    min_step = None
    max_step = None
    for b in chain.bubbles:
        for rs, re in b.range_inclusive:
            if min_step is None or rs < min_step:
                min_step = rs
            if max_step is None or re > max_step:
                max_step = re

    if min_step is not None and max_step is not None \
       and min_step < len(stepidx.starts) and max_step < len(stepidx.ends):
        bp_span = stepidx.ends[max_step] - stepidx.starts[min_step]
    else:
        bp_span = total_length

    # RDP simplification
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
        "_bubble_ids": [b.id for b in chain.bubbles],
        "_layout_span": span,
        "_start_seg": polyline_start_seg,
        "_end_seg": polyline_end_seg,
        "step_count": (max_step - min_step) if min_step is not None and max_step is not None else 0,
        "_min_step": min_step if min_step is not None else 0,
        "_max_step": max_step if max_step is not None else 0,
    }


def build_connector(parent_chain, leaf_bubbles, stepidx, seg_index, depth):
    """Build a connector polyline from a run of leaf bubbles.

    Connectors are the sub-runs between expanded superbubbles
    within a decomposed parent chain.  IDs use step ranges: c{id}:{min}-{max}.
    """
    sub_chain = Chain(
        chain_id=f"{parent_chain.id}_conn",
        bubbles=leaf_bubbles)
    entry = build_chain_polyline(sub_chain, stepidx, seg_index)
    if entry is None:
        return None
    min_step = entry["_min_step"]
    max_step = entry["_max_step"]
    entry["id"] = f"c{parent_chain.id}:{min_step}-{max_step}"
    entry["depth"] = depth
    entry["connector"] = True
    entry["bubble_ids"] = [b.id for b in leaf_bubbles]
    entry["parent_chain"] = f"c{parent_chain.id}"
    return entry


# ---------------------------------------------------------------
# Decomposition
# ---------------------------------------------------------------

def decompose_chain(chain, expand_threshold, bubble_threshold,
                    bubbleidx, stepidx, seg_index, gfaidx, depth, max_depth):
    """Decompose a chain into sub-chains or individual bubbles.

    Returns {"chains": [...], "bubbles": [...], "adjacency": {...}}
    where adjacency maps chain_id → set of adjacent chain_ids discovered
    from the interleaving of connectors and superbubble children.

    Two thresholds control progressive detail:
    - expand_threshold: if any bubble exceeds this, replace the chain
      with child chains from inside its bubbles (one level).
    - bubble_threshold: if the chain's layout span exceeds this (and it
      wasn't decomposed into sub-chains), expose individual bubbles.
    """
    if expand_threshold is None or depth >= max_depth:
        return _chain_as_polyline(chain, bubble_threshold, stepidx, seg_index, depth)

    should_decompose = any(
        b.children and _bubble_layout_span(b) > expand_threshold
        for b in chain.bubbles
    )

    if not should_decompose:
        return _chain_as_polyline(chain, bubble_threshold, stepidx, seg_index, depth)

    # --- Single pass: interleave connectors and child chain groups ---
    # Each group is {'chains': [chain_data...], 'super': bubble_or_None}
    # Connector groups have super=None; children groups store the superbubble.
    groups = []
    all_chains = []
    all_bubbles = []
    all_adj = {}  # accumulated adjacency from recursive decompositions
    all_bypasses = []  # [[x1,y1],[x2,y2]] bypass polylines (deletion alleles)
    all_bypass_seg_ids = set()  # segment IDs from bypass flood fills
    all_bypass_links = []  # (from_id, to_id) GFA links between bypass segs
    all_decomposed_bubbles = set()  # bubble IDs that were decomposed into child chains

    leaf_run = []

    def _flush_leaf_run(run):
        """Flush a leaf run as one or more connectors, splitting if too large."""
        if not run:
            return
        chunks = _split_balanced(run, MAX_BUBBLES_PER_CHAIN)
        group_conns = []
        for chunk in chunks:
            conn = build_connector(
                chain, chunk, stepidx, seg_index, depth)
            if conn:
                all_chains.append(conn)
                group_conns.append(conn)
        # Wire consecutive chunks as adjacent
        for i in range(len(group_conns) - 1):
            a_id = group_conns[i]["id"]
            b_id = group_conns[i + 1]["id"]
            all_adj.setdefault(a_id, set()).add(b_id)
            all_adj.setdefault(b_id, set()).add(a_id)
        if group_conns:
            groups.append({'chains': group_conns, 'super': None})

    for b in chain.bubbles:
        if b.children:
            # Flush leaf run as connector(s)
            _flush_leaf_run(leaf_run)
            leaf_run = []

            # Recurse into superbubble's children
            all_decomposed_bubbles.add(b.id)
            child_bubbles = [bubbleidx[cid] for cid in b.children]
            child_chains_obj = bubbleidx.create_chains(child_bubbles, parent_bubble=b)
            group_chains = []
            for cc in child_chains_obj:
                r = decompose_chain(cc, expand_threshold, bubble_threshold,
                                    bubbleidx, stepidx, seg_index, gfaidx,
                                    depth + 1, max_depth)
                for c in r["chains"]:
                    c["parent_chain"] = f"c{chain.id}"
                    c["parent_bubble"] = f"b{b.id}"
                    c["parent_subtype"] = b.subtype
                group_chains.extend(r["chains"])
                all_bubbles.extend(r["bubbles"])
                all_bypasses.extend(r.get("bypass_links", []))
                all_bypass_seg_ids.update(r.get("bypass_seg_ids", set()))
                all_bypass_links.extend(r.get("bypass_gfa_links", []))
                # Merge child adjacency and decomposed bubbles
                for k, v in r.get("adjacency", {}).items():
                    all_adj.setdefault(k, set()).update(v)
                all_decomposed_bubbles.update(r.get("decomposed_bubbles", set()))

            # Check for bypass path (deletion allele) through superbubble
            bypass = _find_bypass(b, bubbleidx, gfaidx, seg_index)
            if bypass:
                if bypass["polyline"]:
                    all_bypasses.append(bypass["polyline"])
                all_bypass_seg_ids.update(bypass["seg_ids"])
                all_bypass_links.extend(bypass["links"])

            all_chains.extend(group_chains)
            groups.append({'chains': group_chains, 'super': b})
        else:
            leaf_run.append(b)

    # Trailing leaf run
    _flush_leaf_run(leaf_run)

    # --- Connect consecutive groups via shared boundary segments ---
    # Consecutive bubbles in a chain share boundary segments:
    #   bubble[i].sink_segments == bubble[i+1].source_segments
    # So a connector's sink_segs overlap with the next superbubble's
    # entry child chains' source_segs, and vice versa.
    #
    # For consecutive children groups (no connector between them, leaf
    # run of 0-1), we bridge through the superbubble boundaries:
    # exit chains touch super.sink_segments, entry chains touch
    # super.source_segments.
    for i in range(len(groups) - 1):
        g_a = groups[i]
        g_b = groups[i + 1]

        a_exits = _group_exit_chains(g_a)
        b_entries = _group_entry_chains(g_b)

        for ca_id in a_exits:
            for cb_id in b_entries:
                all_adj.setdefault(ca_id, set()).add(cb_id)
                if ca_id != cb_id:
                    all_adj.setdefault(cb_id, set()).add(ca_id)

    return {"chains": all_chains, "bubbles": all_bubbles, "adjacency": all_adj,
            "bypass_links": all_bypasses,
            "bypass_seg_ids": all_bypass_seg_ids,
            "bypass_gfa_links": all_bypass_links,
            "decomposed_bubbles": all_decomposed_bubbles}


def _group_exit_chains(group):
    """Chain IDs at the exit side of a group."""
    if group['super'] is None:
        # Connector group — the connector itself is the exit
        return [c['id'] for c in group['chains']]
    else:
        # Children group — chains whose sink_segs touch super's sink
        bridge = set(group['super'].sink_segments)
        return [c['id'] for c in group['chains']
                if set(c.get('sink_segs', [])) & bridge]


def _group_entry_chains(group):
    """Chain IDs at the entry side of a group."""
    if group['super'] is None:
        # Connector group — the connector itself is the entry
        return [c['id'] for c in group['chains']]
    else:
        # Children group — chains whose source_segs touch super's source
        bridge = set(group['super'].source_segments)
        return [c['id'] for c in group['chains']
                if set(c.get('source_segs', [])) & bridge]


MAX_BUBBLES_PER_CHAIN = 100


def _split_balanced(items, max_size):
    """Split a list into balanced chunks of at most max_size.

    Uses ceil(n/ceil(n/max_size)) to avoid tiny remainders.
    E.g. n=103, max=100 → 2 chunks of 52+51 (not 100+3).
    Returns the original list in a single-element list if no split needed.
    """
    from math import ceil
    n = len(items)
    if n <= max_size:
        return [items]
    k = ceil(n / max_size)
    chunk_size = ceil(n / k)
    return [items[i:i + chunk_size] for i in range(0, n, chunk_size)]


def _chain_as_polyline(chain, bubble_threshold, stepidx, seg_index, depth):
    """Return a chain as a single polyline (base case, no decomposition).

    If the chain has more than MAX_BUBBLES_PER_CHAIN bubbles, split it into
    balanced sub-runs using the .N connector system.  This avoids extremely
    long polylines that are slow to render and interact with.
    """
    n = len(chain.bubbles)

    if n > MAX_BUBBLES_PER_CHAIN:
        chunks = _split_balanced(chain.bubbles, MAX_BUBBLES_PER_CHAIN)

        chains = []
        adj = {}
        for chunk in chunks:
            conn = build_connector(chain, chunk, stepidx, seg_index, depth)
            if conn:
                chains.append(conn)

        # Wire consecutive chunks as adjacent
        for i in range(len(chains) - 1):
            a_id = chains[i]["id"]
            b_id = chains[i + 1]["id"]
            adj.setdefault(a_id, set()).add(b_id)
            adj.setdefault(b_id, set()).add(a_id)

        return {"chains": chains, "bubbles": [], "adjacency": adj}

    entry = build_chain_polyline(chain, stepidx, seg_index)
    if entry is None:
        return {"chains": [], "bubbles": [], "adjacency": {}}
    entry["depth"] = depth
    return {"chains": [entry], "bubbles": [], "adjacency": {}}


# ---------------------------------------------------------------
# Inter-chain connectivity (junction BFS, sibling BFS)
# ---------------------------------------------------------------

def find_junction_graph(chains_data, gfaidx, bubbleidx, seg_index,
                        max_hops=None, decomposed_bubbles=None):
    """Find naked GFA segments forming junction graphs between chains.

    BFS from each chain's endpoint segs through segments not owned by any
    bubble. Collects all visited naked segment centroids as junction nodes
    and GFA links between them (or to chain endpoint segs) as junction links.

    max_hops limits BFS depth (None = unlimited).
    decomposed_bubbles: set of bubble IDs that were decomposed into child
        chains.  Segments owned by these bubbles are treated as naked
        (traversable) since the bubble no longer exists as a visible node.

    Returns (junction_nodes, junction_links, chain_adjacency,
             naked_visited, naked_seg_chains).
    naked_visited: set of naked segment IDs found during BFS.
    naked_seg_chains: dict mapping naked seg ID → set of adjacent chain IDs.
    """

    # Map: seg_id → chain_id (for ALL endpoint segs: source + sink)
    # Also: seg_id → [x, y] polyline coordinate.
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

    # Segments owned by decomposed bubbles are effectively naked
    _decomposed = decomposed_bubbles or set()

    def _is_naked(seg_id):
        owner = bubbleidx.segment_in_bubble(seg_id)
        return owner is None or owner in _decomposed

    # Collect naked segment IDs visited during BFS
    naked_visited = set()
    naked_seg_chains = {}  # naked seg_id → set of adjacent chain IDs
    endpoint_reached = set()
    chain_adj = {}  # chain_id → set of chain_ids

    for cd in chains_data:
        chain_id = cd["id"]
        all_endpoints = (
            list(cd.get("source_segs") or []) +
            list(cd.get("sink_segs") or [])
        )

        for start_seg in all_endpoints:
            # If the chain's own boundary seg is naked, record it as a
            # junction node adjacent to this chain.
            if _is_naked(start_seg):
                naked_visited.add(start_seg)
                naked_seg_chains.setdefault(start_seg, set()).add(chain_id)

            queue = deque([(start_seg, 0)])
            visited = {start_seg}

            while queue:
                cur, hops = queue.popleft()
                if max_hops is not None and hops > max_hops:
                    continue

                for nxt in gfaidx.get_neighbors(cur):
                    if nxt in visited:
                        continue

                    # Reached a chain's endpoint — record adjacency
                    # (includes self-links for deletion alleles)
                    if nxt in endpoint_seg_to_chain:
                        other_chain = endpoint_seg_to_chain[nxt]
                        chain_adj.setdefault(chain_id, set()).add(other_chain)
                        if other_chain != chain_id:
                            chain_adj.setdefault(other_chain, set()).add(chain_id)
                        endpoint_reached.add(nxt)
                        if cur in endpoint_seg_to_chain:
                            endpoint_reached.add(cur)
                        # Tag naked segs that led here as adjacent to both chains
                        if cur in naked_visited:
                            naked_seg_chains.setdefault(cur, set()).add(chain_id)
                            naked_seg_chains.setdefault(cur, set()).add(other_chain)
                        # If the endpoint itself is naked, also register it as
                        # a junction node so it gets activated alongside the
                        # junction segs that link to it.
                        if _is_naked(nxt):
                            naked_visited.add(nxt)
                            naked_seg_chains.setdefault(nxt, set()).add(chain_id)
                            naked_seg_chains.setdefault(nxt, set()).add(other_chain)
                        continue

                    # Only traverse naked segments (not owned by any bubble,
                    # or owned by a decomposed bubble)
                    if not _is_naked(nxt):
                        continue

                    visited.add(nxt)
                    naked_visited.add(nxt)
                    # This naked seg is reachable from chain_id's endpoint
                    naked_seg_chains.setdefault(nxt, set()).add(chain_id)
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
    endpoint_centroids = {}
    for sid in endpoint_reached | set(endpoint_seg_to_chain.keys()):
        if sid not in naked_centroids:
            if sid in endpoint_polyline_coord:
                plpt = endpoint_polyline_coord[sid]
                coord = [round(plpt[0], 1), round(plpt[1], 1)]
            else:
                pt = _seg_centroid(sid, seg_index)
                if not pt:
                    continue
                coord = [round(pt[0], 1), round(pt[1], 1)]
            endpoint_centroids[sid] = coord
            if _is_naked(sid):
                junction_nodes.append(coord)

    # Build junction links from GFA edges
    junction_links = []
    link_seen = set()

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

    chain_adjacency = {k: sorted(v) for k, v in chain_adj.items()}
    return (junction_nodes, junction_links, chain_adjacency,
            naked_visited, naked_seg_chains)


def find_sibling_connectors(chains_data, gfaidx, bubbleidx):
    """Find gap-filler lines between sibling chains connected through the parent bubble.

    For each sibling endpoint, BFS through segments owned by any bubble
    (up to a few hops) to find other sibling endpoints.  Returns a list
    of [[x1,y1],[x2,y2]] pairs using polyline endpoint coordinates.

    Adjacency between siblings is now primarily computed during
    decomposition; this function focuses on the visual connector lines.
    """
    MAX_HOPS = 6

    # Group chains by parent
    by_parent = defaultdict(list)
    for cd in chains_data:
        parent = cd.get("parent_chain")
        if parent:
            by_parent[parent].append(cd)

    if not by_parent:
        return [], {}

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
    seen = set()
    sibling_adj = {}  # chain_id → set of chain_ids

    for siblings in by_parent.values():
        # Build seg → chain_id for this family's endpoint segs
        ep_seg_to_chain = {}
        for cd in siblings:
            for sid in (cd.get("source_segs") or []) + (cd.get("sink_segs") or []):
                ep_seg_to_chain[sid] = cd["id"]

        # BFS from each endpoint through bubble-owned segments
        for cd in siblings:
            for start_sid in (cd.get("source_segs") or []) + (cd.get("sink_segs") or []):
                if start_sid not in seg_to_coord:
                    continue

                queue = deque([(start_sid, 0)])
                visited = {start_sid}

                while queue:
                    cur, hops = queue.popleft()
                    if hops > MAX_HOPS:
                        continue
                    for nxt in gfaidx.get_neighbors(cur):
                        if nxt in visited:
                            continue
                        # Reached a sibling's endpoint (or self for deletion alleles)?
                        if nxt in ep_seg_to_chain:
                            other_chain = ep_seg_to_chain[nxt]
                            sibling_adj.setdefault(cd["id"], set()).add(other_chain)
                            if other_chain != cd["id"]:
                                sibling_adj.setdefault(other_chain, set()).add(cd["id"])
                            if nxt in seg_to_coord:
                                key = frozenset([start_sid, nxt])
                                if key not in seen:
                                    seen.add(key)
                                    connectors.append([seg_to_coord[start_sid],
                                                       seg_to_coord[nxt]])
                            continue
                        # Allow traversal through any bubble-owned segment
                        if bubbleidx.segment_in_bubble(nxt) is None:
                            continue
                        visited.add(nxt)
                        queue.append((nxt, hops + 1))

    return connectors, sibling_adj


# ---------------------------------------------------------------
# Bubble exposure
# ---------------------------------------------------------------

def expose_chain_bubbles(chain):
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
