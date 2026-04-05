"""Build RDP-simplified polylines for chains, connectors, and decomposed chains.

Chains are sequences of bubbles. The polyline follows:
  source_seg centroid → bubble centroids → sink_seg centroid

This is reference-path independent — coordinates come from the ODGI layout.

Decomposition splits a parent chain into child chains from superbubbles
and .N connector sub-runs from leaf bubble runs.  Adjacency between
consecutive groups is emitted from the interleaving order.
"""

import math
from bisect import bisect_right
from collections import Counter, defaultdict, deque
from pangyplot.objects.Chain import Chain
from pangyplot.preprocess.skeleton.skeleton_geometry import rdp_simplify


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
# Polychain resampling
# ---------------------------------------------------------------

MIN_POLYCHAIN_NODES = 2


def resample_polychain(polyline, bp_span, bubble_positions):
    """Resample a polyline with node count ~ log10(bp)² and density-weighted by bubbles.

    Returns list of [x, y] sample points (always includes first and last).
    """
    if len(polyline) < 2:
        return polyline

    log_bp = math.log10(max(bp_span, 10))
    n_target = max(MIN_POLYCHAIN_NODES, round(log_bp * log_bp * 2))

    # Cumulative arc lengths
    cum_len = [0.0]
    for i in range(1, len(polyline)):
        dx = polyline[i][0] - polyline[i - 1][0]
        dy = polyline[i][1] - polyline[i - 1][1]
        cum_len.append(cum_len[-1] + math.hypot(dx, dy))
    total_len = cum_len[-1]
    if total_len == 0:
        return polyline

    n_interior = n_target - 2
    if n_interior <= 0:
        return [polyline[0], polyline[-1]]

    # Build density-weighted t values from bubble positions
    if bubble_positions and len(bubble_positions) >= 2 and n_interior >= 2:
        n_bins = 200
        density = [0.5] * n_bins  # base uniform density
        sigma = 1.0 / (n_bins * 0.5)
        for bp in bubble_positions:
            center = bp["t"]
            for b in range(n_bins):
                bt = (b + 0.5) / n_bins
                d = (bt - center) / sigma
                density[b] += math.exp(-0.5 * d * d)

        # Build CDF
        cdf = [0.0] * (n_bins + 1)
        for b in range(n_bins):
            cdf[b + 1] = cdf[b] + density[b]
        total_cdf = cdf[n_bins]

        # Invert CDF for equally-spaced quantiles
        t_values = []
        for i in range(n_interior):
            target = total_cdf * (i + 1) / (n_interior + 1)
            lo, hi = 0, n_bins
            while lo < hi:
                mid = (lo + hi) // 2
                if cdf[mid + 1] < target:
                    lo = mid + 1
                else:
                    hi = mid
            t_values.append((lo + 0.5) / n_bins)
    else:
        # Uniform spacing
        t_values = [(i + 1) / (n_interior + 1) for i in range(n_interior)]

    # Interpolate at arc-length positions
    def _interp(t):
        d = t * total_len
        if d <= 0:
            return list(polyline[0])
        if d >= total_len:
            return list(polyline[-1])
        idx = bisect_right(cum_len, d) - 1
        idx = min(idx, len(polyline) - 2)
        seg_len = cum_len[idx + 1] - cum_len[idx]
        frac = (d - cum_len[idx]) / seg_len if seg_len > 0 else 0
        return [
            round(polyline[idx][0] + frac * (polyline[idx + 1][0] - polyline[idx][0]), 1),
            round(polyline[idx][1] + frac * (polyline[idx + 1][1] - polyline[idx][1]), 1),
        ]

    samples = [list(polyline[0])]
    for t in t_values:
        samples.append(_interp(t))
    samples.append(list(polyline[-1]))
    return samples


# ---------------------------------------------------------------
# Polyline building
# ---------------------------------------------------------------

def build_chain_polyline(chain, stepidx, seg_index):
    """Build an RDP-simplified polyline for a chain.

    Returns a dict with polyline, metadata, and internal fields for
    junction wiring (_start_seg, _end_seg) and inline popping
    (bubble_ids, _layout_span).  Returns None if the chain can't
    produce a valid polyline.
    """
    if not chain.bubbles:
        return None

    total_length = 0
    total_gc = 0
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

    # Bubble centroids + boundary segment lengths
    counted_boundary_segs = set()
    for b in chain.bubbles:
        total_length += b.length
        total_gc += b.gc_count
        # Add unique boundary segment lengths (shared between adjacent bubbles)
        for sid in b.source_segments + b.sink_segments:
            if sid not in counted_boundary_segs:
                counted_boundary_segs.add(sid)
                if sid < len(seg_index.length) and seg_index.valid[sid]:
                    total_length += seg_index.length[sid]
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

    # Bubble t-values: fractional position along chain by index
    bubble_t = []
    n_bubbles = len(chain.bubbles)
    for idx, b in enumerate(chain.bubbles):
        t = idx / max(1, n_bubbles - 1) if n_bubbles > 1 else 0.5
        bubble_t.append(round(t, 4))

    # Chain position from bubble ordinals (reference-independent)
    ordinals = [b.chain_step for b in chain.bubbles
                if b.chain_step is not None]
    min_step = min(ordinals) if ordinals else None
    max_step = max(ordinals) if ordinals else None

    # BP span from reference path (for LOD decisions)
    ref_min = None
    ref_max = None
    for b in chain.bubbles:
        for rs, re in b.range_inclusive:
            if ref_min is None or rs < ref_min:
                ref_min = rs
            if ref_max is None or re > ref_max:
                ref_max = re

    if ref_min is not None and ref_max is not None \
       and ref_min < len(stepidx.starts) and ref_max < len(stepidx.ends):
        bp_start = stepidx.starts[ref_min]
        bp_end = stepidx.ends[ref_max]
        bp_span = bp_end - bp_start
    else:
        bp_start = None
        bp_end = None
        bp_span = total_length

    # Determine bp at polyline head vs tail for direction detection.
    # The first bubble's ref range gives the head bp, last bubble's gives the tail.
    head_bp = None
    tail_bp = None
    if bp_start is not None:
        for rs, re in chain.bubbles[0].range_inclusive:
            head_bp = stepidx.starts[rs] if rs < len(stepidx.starts) else None
            break
        for rs, re in chain.bubbles[-1].range_inclusive:
            tail_bp = stepidx.ends[re] if re < len(stepidx.ends) else None
            break

    # RDP simplification
    span = max(abs(raw_polyline[-1][0] - raw_polyline[0][0]),
                abs(raw_polyline[-1][1] - raw_polyline[0][1]))
    epsilon = max(0.5, span / 500)
    polyline = rdp_simplify(raw_polyline, epsilon)

    rounded_polyline = [[round(x, 1), round(y, 1)] for x, y in polyline]

    return {
        "id": f"c{chain.id}",
        "polyline": rounded_polyline,
        "length": total_length,
        "gc_count": total_gc,
        "bp_span": bp_span,
        "bp_start": bp_start,
        "bp_end": bp_end,
        "bp_head": head_bp,
        "bp_tail": tail_bp,
        "n_bubbles": len(chain.bubbles),
        "subtype": subtype_counter.most_common(1)[0][0],
        "source_segs": chain.bubbles[0].source_segments,
        "sink_segs": chain.bubbles[-1].sink_segments,
        "bubble_t": bubble_t,
        "bubble_ids": [b.id for b in chain.bubbles],
        "_layout_span": span,
        "_start_seg": polyline_start_seg,
        "_end_seg": polyline_end_seg,
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
    return entry


# ---------------------------------------------------------------
# Decomposition
# ---------------------------------------------------------------

def decompose_chain(chain, expand_threshold, bubble_threshold,
                    bubbleidx, stepidx, seg_index, gfaidx, depth, max_depth,
                    _ancestors=None):
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
        """Flush a leaf run as a single connector."""
        if not run:
            return
        conn = build_connector(chain, run, stepidx, seg_index, depth)
        if not conn:
            return
        all_chains.append(conn)
        groups.append({'chains': [conn], 'super': None})

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
                child_ancestors = (_ancestors or []) + [{
                    "chain": f"c{chain.id}",
                    "bubble": f"b{b.id}",
                    "subtype": b.subtype,
                }]
                r = decompose_chain(cc, expand_threshold, bubble_threshold,
                                    bubbleidx, stepidx, seg_index, gfaidx,
                                    depth + 1, max_depth,
                                    _ancestors=child_ancestors)
                # Stamp ancestors on children that came from non-decomposed
                # base case (they bypass their own stamping block)
                for c in r["chains"]:
                    if "ancestors" not in c:
                        c["ancestors"] = list(child_ancestors)
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

    # Stamp parent_chain on all emitted chains that don't already have one.
    # Connectors and direct children point to this chain; deeper descendants
    # already have parent_chain set by the recursive call that produced them.
    chain_id_str = f"c{chain.id}"
    own_ancestors = list(_ancestors or [])
    for c in all_chains:
        if "parent_chain" not in c:
            c["parent_chain"] = chain_id_str
        if "ancestors" not in c:
            c["ancestors"] = list(own_ancestors)
        # Derive parent_bubble/parent_subtype from immediate ancestor
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


def _chain_as_polyline(chain, bubble_threshold, stepidx, seg_index, depth):
    """Return a chain as a single polyline (base case, no decomposition)."""
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

    # Build suppression set: (endpoint_seg, inside_seg) pairs from the same
    # bubble.  These are internal bubble edges (head→first-inside,
    # tail→last-inside) that shouldn't appear as junction links.
    # Head↔tail (deletion allele) links are NOT suppressed.
    _suppress_links = set()
    for cd in chains_data:
        bubble_ids = cd.get("bubble_ids") or []
        if not bubble_ids:
            continue
        # First bubble: source segs ↔ its inside
        first_b = bubbleidx[bubble_ids[0]]
        if first_b:
            for sid in (cd.get("source_segs") or []):
                for ins in first_b.inside:
                    _suppress_links.add(frozenset((sid, ins)))
        # Last bubble: sink segs ↔ its inside
        last_b = bubbleidx[bubble_ids[-1]]
        if last_b:
            for sid in (cd.get("sink_segs") or []):
                for ins in last_b.inside:
                    _suppress_links.add(frozenset((sid, ins)))

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

    # Prune dead-end stubs: naked segments reachable from only one chain
    # are not true junctions (e.g. indels at a chain boundary).  Remove
    # them from naked_visited so they don't appear as junction nodes.
    _stubs = {sid for sid, chains in naked_seg_chains.items()
              if len(chains) < 2}
    naked_visited -= _stubs
    for sid in _stubs:
        naked_seg_chains.pop(sid, None)

    # Build junction nodes: centroid of each naked segment.
    # Chain endpoint segments are excluded — their geometry overlaps
    # the chain polyline and creates stray lines when popped.
    _all_endpoint_segs = set(endpoint_seg_to_chain.keys())
    junction_nodes = []
    naked_centroids = {}  # seg_id → [x, y]
    for sid in naked_visited:
        pt = _seg_centroid(sid, seg_index)
        if pt:
            coord = [round(pt[0], 1), round(pt[1], 1)]
            naked_centroids[sid] = coord
            if sid not in _all_endpoint_segs:
                junction_nodes.append(coord)

    # Cache coordinates for endpoint segs (for links to/from them).
    # Prefer the chain polyline endpoint coordinate over the segment centroid,
    # because child chains (depth > 0) have polyline endpoints that diverge
    # significantly from segment centroids.
    endpoint_centroids = {}
    for sid in endpoint_reached | _all_endpoint_segs:
        if sid in endpoint_polyline_coord:
            plpt = endpoint_polyline_coord[sid]
            coord = [round(plpt[0], 1), round(plpt[1], 1)]
        else:
            pt = _seg_centroid(sid, seg_index)
            if not pt:
                continue
            coord = [round(pt[0], 1), round(pt[1], 1)]
        endpoint_centroids[sid] = coord

    # Build junction links from GFA edges
    junction_links = []
    link_seen = set()

    def _centroid(sid):
        """Link coordinate: chain endpoints use polyline positions,
        naked segments use segment centroids."""
        return endpoint_centroids.get(sid) or naked_centroids.get(sid)

    # Links from naked segments
    # Each link: [[x1,y1], [x2,y2], seg_id_a, seg_id_b]
    for sid in naked_visited:
        sid_pt = _centroid(sid)
        if not sid_pt:
            continue
        for nxt in gfaidx.get_neighbors(sid):
            nxt_pt = _centroid(nxt)
            if not nxt_pt:
                continue
            key = frozenset((sid, nxt))
            if key in link_seen or key in _suppress_links:
                continue
            link_seen.add(key)
            junction_links.append([sid_pt, nxt_pt, sid, nxt])

    # Links between endpoint segs (direct GFA neighbors, no naked seg between)
    for sid in endpoint_reached:
        if sid not in endpoint_centroids:
            continue
        for nxt in gfaidx.get_neighbors(sid):
            if nxt not in endpoint_centroids or nxt == sid:
                continue
            if endpoint_seg_to_chain.get(sid) == endpoint_seg_to_chain.get(nxt):
                continue  # same chain
            key = frozenset((sid, nxt))
            if key in link_seen or key in _suppress_links:
                continue
            link_seen.add(key)
            junction_links.append([endpoint_centroids[sid], endpoint_centroids[nxt],
                                   sid, nxt])

    chain_adjacency = {k: sorted(v) for k, v in chain_adj.items()}
    return (junction_nodes, junction_links, chain_adjacency,
            naked_visited, naked_seg_chains)


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
