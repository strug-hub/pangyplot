"""
Compute and export per-chromosome graph metadata to meta.json.

Statistics are derived from the ODGI layout positions stored in the
segment and link indexes. These are graph-intrinsic properties that
help the frontend adapt force simulation parameters and UI defaults
to the scale and density of each graph.
"""

import json
import os

import numpy as np

from pangyplot.db.indexes.GFAIndex import GFAIndex

META_FILENAME = "meta.json"


def compute_meta(chr_dir, ref, chromosome=None, client=None):
    """Compute graph metadata for one chromosome directory.

    Returns a dict suitable for writing to meta.json.

    `client` (a graph-mode GbwtClient) is required under GBZ-native ingest to
    get sample_count. Segment/link counts survive without it because those
    indexes have mmap caches; PathIndex has none, so with no client it falls
    back to a paths SQLite that GBZ-native never writes and reports 0 samples.
    """
    gfaidx = GFAIndex(chr_dir, client=client)
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
    # Zero-copy numpy views over array.array
    x1 = np.frombuffer(segment_index.x1, dtype=np.float32)
    y1 = np.frombuffer(segment_index.y1, dtype=np.float32)
    x2 = np.frombuffer(segment_index.x2, dtype=np.float32)
    y2 = np.frombuffer(segment_index.y2, dtype=np.float32)
    valid = np.frombuffer(segment_index.valid, dtype=np.uint8).astype(bool)

    if valid.any():
        vx1, vx2 = x1[valid], x2[valid]
        vy1, vy2 = y1[valid], y2[valid]
        meta["layout_bbox"] = {
            "min_x": round(float(min(vx1.min(), vx2.min())), 2),
            "max_x": round(float(max(vx1.max(), vx2.max())), 2),
            "min_y": round(float(min(vy1.min(), vy2.min())), 2),
            "max_y": round(float(max(vy1.max(), vy2.max())), 2),
        }

    # -----------------------------------------------------------
    # Median linked-segment distance (midpoint-to-midpoint)
    #
    # Measures ODGI's local packing density — the characteristic
    # spacing the force simulation should scale to.
    # -----------------------------------------------------------
    from_ids = np.frombuffer(link_index.from_ids, dtype=np.uint32)
    to_ids = np.frombuffer(link_index.to_ids, dtype=np.uint32)
    n_seg = len(valid)
    link_ok = (from_ids < n_seg) & (to_ids < n_seg)
    if link_ok.any():
        s = from_ids[link_ok]
        t = to_ids[link_ok]
        both_valid = valid[s] & valid[t]
        s, t = s[both_valid], t[both_valid]
        if s.size:
            mx_s = (x1[s] + x2[s]) * 0.5
            my_s = (y1[s] + y2[s]) * 0.5
            mx_t = (x1[t] + x2[t]) * 0.5
            my_t = (y1[t] + y2[t]) * 0.5
            d = np.hypot(mx_s - mx_t, my_s - my_t)
            d = d[d > 0]
            if d.size:
                meta["median_link_distance"] = round(float(np.median(d)), 2)

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


def generate_meta(chr_dir, ref, chromosome=None, client=None):
    """Compute and write meta.json for one chromosome directory."""
    meta = compute_meta(chr_dir, ref, chromosome, client=client)
    meta_path = os.path.join(chr_dir, META_FILENAME)
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    return meta
