"""Build RDP-simplified polylines for chains and connectors.

Chains are sequences of bubbles. The polyline follows:
  source_seg centroid → bubble centroids → sink_seg centroid

This is reference-path independent — coordinates come from the ODGI layout.
"""

from collections import Counter
from pangyplot.objects.Chain import Chain
from pangyplot.preprocess.skeleton.graph_simplify import rdp_simplify


def _seg_centroid(sid, seg_index):
    """Return (cx, cy) for a segment id, or None if invalid."""
    if sid < len(seg_index.valid) and seg_index.valid[sid]:
        return ((seg_index.x1[sid] + seg_index.x2[sid]) / 2.0,
                (seg_index.y1[sid] + seg_index.y2[sid]) / 2.0)
    return None


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
