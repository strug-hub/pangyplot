"""Build RDP-simplified polylines for chains, connectors, and decomposed chains.

Chains are sequences of bubbles. The polyline follows:
  source_seg centroid → bubble centroids → sink_seg centroid

This is reference-path independent — coordinates come from the ODGI layout.

Decomposition splits a parent chain into child chains from superbubbles
and _r connector sub-runs from leaf bubble runs.  Adjacency between
consecutive groups is emitted from the interleaving order.
"""

from collections import Counter
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
    }


def build_connector(parent_chain, leaf_bubbles, stepidx, seg_index,
                    connector_idx, depth):
    """Build a connector polyline from a run of leaf bubbles.

    Connectors are the _r sub-runs between expanded superbubbles
    within a decomposed parent chain.
    """
    sub_chain = Chain(
        chain_id=f"{parent_chain.id}_r{connector_idx}",
        bubbles=leaf_bubbles)
    entry = build_chain_polyline(sub_chain, stepidx, seg_index)
    if entry is None:
        return None
    entry["id"] = f"c{parent_chain.id}_r{connector_idx}"
    entry["depth"] = depth
    entry["connector"] = True
    entry["bubble_ids"] = [b.id for b in leaf_bubbles]
    entry["parent_chain"] = f"c{parent_chain.id}"
    return entry


# ---------------------------------------------------------------
# Decomposition
# ---------------------------------------------------------------

def decompose_chain(chain, expand_threshold, bubble_threshold,
                    bubbleidx, stepidx, seg_index, depth, max_depth):
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

    leaf_run = []
    connector_idx = 0

    for b in chain.bubbles:
        if b.children:
            # Flush leaf run as connector
            if len(leaf_run) >= 2:
                conn = build_connector(
                    chain, leaf_run, stepidx, seg_index, connector_idx, depth)
                if conn:
                    all_chains.append(conn)
                    groups.append({'chains': [conn], 'super': None})
                    connector_idx += 1
            leaf_run = []

            # Recurse into superbubble's children
            child_bubbles = [bubbleidx[cid] for cid in b.children]
            child_chains_obj = bubbleidx.create_chains(child_bubbles, parent_bubble=b)
            group_chains = []
            for cc in child_chains_obj:
                r = decompose_chain(cc, expand_threshold, bubble_threshold,
                                    bubbleidx, stepidx, seg_index, depth + 1, max_depth)
                for c in r["chains"]:
                    c["parent_chain"] = f"c{chain.id}"
                group_chains.extend(r["chains"])
                all_bubbles.extend(r["bubbles"])
                # Merge child adjacency
                for k, v in r.get("adjacency", {}).items():
                    all_adj.setdefault(k, set()).update(v)

            all_chains.extend(group_chains)
            groups.append({'chains': group_chains, 'super': b})
        else:
            leaf_run.append(b)

    # Trailing leaf run
    if len(leaf_run) >= 2:
        conn = build_connector(
            chain, leaf_run, stepidx, seg_index, connector_idx, depth)
        if conn:
            all_chains.append(conn)
            groups.append({'chains': [conn], 'super': None})

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
                if ca_id != cb_id:
                    all_adj.setdefault(ca_id, set()).add(cb_id)
                    all_adj.setdefault(cb_id, set()).add(ca_id)

    return {"chains": all_chains, "bubbles": all_bubbles, "adjacency": all_adj}


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
