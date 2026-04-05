"""
Compute and export per-chromosome graph metadata to meta.json.

Statistics are derived from the ODGI layout positions stored in the
segment and link indexes. These are graph-intrinsic properties that
help the frontend adapt force simulation parameters and UI defaults
to the scale and density of each graph.
"""

import json
import math
import os
import statistics

from pangyplot.db.indexes.GFAIndex import GFAIndex

META_FILENAME = "meta.json"


def compute_meta(chr_dir, ref, chromosome=None):
    """Compute graph metadata for one chromosome directory.

    Returns a dict suitable for writing to meta.json.
    """
    gfaidx = GFAIndex(chr_dir)
    segment_index = gfaidx.segment_index
    link_index = gfaidx.link_index

    meta = {}

    if chromosome is not None:
        meta["chromosome"] = chromosome

    # -----------------------------------------------------------
    # Segment / link counts
    # -----------------------------------------------------------
    n_segments = len(segment_index)
    n_links = len(link_index)
    meta["total_segments"] = n_segments
    meta["total_links"] = n_links

    # -----------------------------------------------------------
    # Sample count (unique haplotype paths)
    # -----------------------------------------------------------
    meta["sample_count"] = len(gfaidx.get_samples())

    # -----------------------------------------------------------
    # Layout bounding box (from segment endpoints)
    # -----------------------------------------------------------
    min_x, max_x = math.inf, -math.inf
    min_y, max_y = math.inf, -math.inf
    max_id = segment_index.max_id()

    for sid in range(max_id + 1):
        if sid >= len(segment_index.valid) or not segment_index.valid[sid]:
            continue
        for x in (segment_index.x1[sid], segment_index.x2[sid]):
            if x < min_x:
                min_x = x
            if x > max_x:
                max_x = x
        for y in (segment_index.y1[sid], segment_index.y2[sid]):
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y

    if math.isfinite(min_x):
        meta["layout_bbox"] = {
            "min_x": round(float(min_x), 2),
            "max_x": round(float(max_x), 2),
            "min_y": round(float(min_y), 2),
            "max_y": round(float(max_y), 2),
        }

    # -----------------------------------------------------------
    # Median linked-segment distance (midpoint-to-midpoint)
    #
    # Measures ODGI's local packing density — the characteristic
    # spacing the force simulation should scale to.
    # -----------------------------------------------------------
    dists = []
    for i in range(len(link_index.from_ids)):
        s = link_index.from_ids[i]
        t = link_index.to_ids[i]
        if (s >= len(segment_index.valid) or not segment_index.valid[s] or
                t >= len(segment_index.valid) or not segment_index.valid[t]):
            continue
        sx = (segment_index.x1[s] + segment_index.x2[s]) / 2
        sy = (segment_index.y1[s] + segment_index.y2[s]) / 2
        tx = (segment_index.x1[t] + segment_index.x2[t]) / 2
        ty = (segment_index.y1[t] + segment_index.y2[t]) / 2
        d = math.hypot(sx - tx, sy - ty)
        if d > 0:
            dists.append(d)

    if dists:
        meta["median_link_distance"] = round(statistics.median(dists), 2)

    # -----------------------------------------------------------
    # Bubble stats (total count, max nesting depth)
    # -----------------------------------------------------------
    try:
        from pangyplot.db.sqlite import bubble_db
        chain_stats = bubble_db.get_chain_stats(chr_dir)
        if chain_stats:
            total_bubbles = sum(cs["n_bubbles"] for cs in chain_stats.values())
            meta["total_bubbles"] = total_bubbles

            # Max depth = longest parent chain
            depths = {}
            for cid, cs in chain_stats.items():
                depth = 0
                cur = cid
                visited = set()
                while cur is not None and cur not in visited:
                    visited.add(cur)
                    parent = chain_stats.get(cur, {}).get("parent")
                    if parent is not None:
                        depth += 1
                    cur = parent
                depths[cid] = depth
            meta["max_bubble_depth"] = max(depths.values()) if depths else 0
    except Exception:
        pass

    # -----------------------------------------------------------
    # Base pair range (from step index if available)
    # -----------------------------------------------------------
    try:
        from pangyplot.db.indexes.StepIndex import StepIndex
        step_index = StepIndex(chr_dir, ref)
        if len(step_index.starts) > 0:
            meta["bp_range"] = {
                "start": int(step_index.starts[0]),
                "end": int(step_index.ends[-1]),
            }
    except Exception:
        pass

    return meta


def generate_meta(chr_dir, ref, chromosome=None):
    """Compute and write meta.json for one chromosome directory."""
    meta = compute_meta(chr_dir, ref, chromosome)
    meta_path = os.path.join(chr_dir, META_FILENAME)
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    return meta
