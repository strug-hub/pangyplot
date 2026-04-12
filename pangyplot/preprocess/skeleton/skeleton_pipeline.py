"""
Skeleton builder internals: graph topology, chain annotation,
reference spine, and binary export.
"""

import gzip
import json
import os
from collections import defaultdict

import numpy as np

from pangyplot.db import db_utils
from pangyplot.version import __version__
from pangyplot.preprocess.skeleton.skeleton_geometry import grid_simplify


VIEWER_GRID_SIZES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000]
FINE_GRID_CANDIDATES = [5, 10, 25, 50]


def compute_grid_sizes(segment_index):
    """Return grid sizes adapted to the layout extent.

    For small graphs, prepend finer grid levels so the skeleton has
    enough resolution at close zoom. The finest useful level is
    roughly max(layout_width, layout_height) / 200.
    """
    import math
    min_x, max_x = math.inf, -math.inf
    min_y, max_y = math.inf, -math.inf
    for sid in range(len(segment_index.valid)):
        if not segment_index.valid[sid]:
            continue
        for x in (segment_index.x1[sid], segment_index.x2[sid]):
            if x < min_x: min_x = x
            if x > max_x: max_x = x
        for y in (segment_index.y1[sid], segment_index.y2[sid]):
            if y < min_y: min_y = y
            if y > max_y: max_y = y

    if not math.isfinite(min_x):
        return list(VIEWER_GRID_SIZES)

    extent = max(max_x - min_x, max_y - min_y)
    min_useful = extent / 2000

    extra = [g for g in FINE_GRID_CANDIDATES if g >= min_useful and g < VIEWER_GRID_SIZES[0]]
    return sorted(extra) + list(VIEWER_GRID_SIZES)


# ---------------------------------------------------------------------------
# Degree computation
# ---------------------------------------------------------------------------

def compute_degrees(link_index):
    """Returns (in_deg, out_deg) numpy arrays indexed by segment ID."""
    from_ids = np.asarray(link_index.from_ids)
    to_ids = np.asarray(link_index.to_ids)
    max_id = max(int(from_ids.max()), int(to_ids.max())) if len(from_ids) else 0
    out_deg = np.bincount(from_ids, minlength=max_id + 1).astype(np.uint16)
    in_deg = np.bincount(to_ids, minlength=max_id + 1).astype(np.uint16)
    return in_deg, out_deg


# ---------------------------------------------------------------------------
# Junction finding
# ---------------------------------------------------------------------------

def find_junctions(degrees):
    """Returns a numpy bool array where True means junction (total degree != 2).

    Accepts either (in_deg, out_deg) numpy arrays or a legacy dict.
    A degree-2 node has exactly one incoming and one outgoing edge — it's a
    pass-through that can be collapsed. Everything else is a junction.
    """
    in_deg, out_deg = degrees
    total = in_deg.astype(np.uint32) + out_deg.astype(np.uint32)
    is_junction = total != 2
    is_junction[total == 0] = False
    return is_junction


# ---------------------------------------------------------------------------
# Linear run extraction
# ---------------------------------------------------------------------------

def find_linear_runs(gfaidx, is_junction, segment_index):
    """Walk from each junction through degree-2 segments until hitting another
    junction. Returns list of runs, each a list of segment IDs
    [junction, deg2, ..., deg2, junction].

    Handles edge cases:
    - Isolated degree-2 cycles (no junctions) are detected separately.
    - Each run is found exactly once via visited-edge tracking.

    is_junction is a numpy bool array indexed by segment ID.
    """
    # Pack undirected edge (a, b) into a single Python int to avoid
    # tuple overhead: lo << shift | hi.
    shift = int(len(is_junction) - 1).bit_length()

    def _edge_key(a, b):
        lo, hi = (a, b) if a < b else (b, a)
        return (lo << shift) | hi

    visited_edges = set()
    runs = []

    junction_ids = np.flatnonzero(is_junction)
    for junc in junction_ids:
        junc = int(junc)
        neighbors = gfaidx.get_neighbors(junc)
        for neighbor in neighbors:
            neighbor = int(neighbor)
            if _edge_key(junc, neighbor) in visited_edges:
                continue

            if not segment_index.valid[neighbor]:
                continue

            # Start a run from junc toward neighbor
            run = [junc]
            prev = junc
            curr = neighbor

            while not is_junction[curr]:
                visited_edges.add(_edge_key(prev, curr))
                run.append(curr)

                nexts = [int(n) for n in gfaidx.get_neighbors(curr) if n != prev]
                if not nexts:
                    break
                prev = curr
                curr = nexts[0]

            # Add the final junction (or dead-end)
            visited_edges.add(_edge_key(prev, curr))
            if is_junction[curr]:
                run.append(curr)

            runs.append(run)

    return runs


# ---------------------------------------------------------------------------
# Polyline construction
# ---------------------------------------------------------------------------

def run_to_polyline(run, segment_index):
    """Convert a run of segment IDs to [(x, y), ...] using segment centroids."""
    polyline = []
    for sid in run:
        cx = float(segment_index.x1[sid] + segment_index.x2[sid]) / 2.0
        cy = float(segment_index.y1[sid] + segment_index.y2[sid]) / 2.0
        polyline.append((cx, cy))
    return polyline


# ---------------------------------------------------------------------------
# Chain ID annotation for runs
# ---------------------------------------------------------------------------

def load_segment_to_bubble(data_dir):
    """Read segment_to_bubble array from bubble mmap index.

    Returns array where index=seg_id, value=bubble_id (0 = unmapped).
    Avoids loading the full BubbleIndex.
    """
    npy_path = os.path.join(data_dir, "bubbles.mmapindex", "segment_to_bubble.npy")
    if os.path.exists(npy_path):
        return np.load(npy_path, mmap_mode='r')
    # Fallback to legacy JSON quickindex
    quick_index = db_utils.load_json(os.path.join(data_dir, "bubbles.quickindex.json.gz"))
    if quick_index is None:
        return None
    return quick_index["segment_to_bubble"]


def _compute_chain_depths(chain_stats):
    """Compute depth of each chain from parent links. Root chains have depth 0."""
    depths = {}
    if not chain_stats:
        return depths
    for cid in chain_stats:
        if cid in depths:
            continue
        # Walk up to root, collecting ancestors
        path = [cid]
        cur = cid
        while True:
            info = chain_stats.get(cur)
            parent = info.get("parent") if info else None
            if parent is None:
                break
            if parent in depths:
                break
            path.append(parent)
            cur = parent
        # Base depth: parent's depth + 1, or 0 for root
        info = chain_stats.get(cur)
        parent = info.get("parent") if info else None
        base = (depths[parent] + 1) if (parent is not None and parent in depths) else 0
        # Assign depths: path is [cid, ..., cur], reversed = [cur, ..., cid]
        for i, c in enumerate(reversed(path)):
            depths[c] = base + i
    return depths


def compute_run_chain_ids(runs, seg_to_bubble, bubble_to_chain, chain_stats=None):
    """For each run, assign the deepest chain that has any vote.

    Boundary segments (source/sink) of child bubbles map to the parent
    chain, so a simple majority vote systematically misattributes child
    chains. Instead, prefer the most deeply nested chain — it is the
    most specific annotation. Ties at the same depth break by vote count.

    Returns list parallel to runs: chain_id or -1 if unmapped.
    """
    depths = _compute_chain_depths(chain_stats) if chain_stats else {}

    chain_ids = []
    mapped = 0
    for run in runs:
        votes = defaultdict(int)
        for sid in run:
            if sid < len(seg_to_bubble):
                bid = seg_to_bubble[sid]
                if bid != 0 and bid in bubble_to_chain:
                    votes[bubble_to_chain[bid]] += 1
        if votes:
            # Deepest chain wins; break ties by vote count
            chain_id = max(votes, key=lambda c: (depths.get(c, 0), votes[c]))
            chain_ids.append(chain_id)
            mapped += 1
        else:
            chain_ids.append(-1)
    print(f"Chain annotation: {mapped}/{len(runs)} runs mapped ({100*mapped/max(1,len(runs)):.1f}%)")
    return chain_ids


# ---------------------------------------------------------------------------
# Binary export for viewer
# ---------------------------------------------------------------------------

def export_binary(junctions, runs, segment_index, link_index, polylines,
                  grid_cell_sizes, meta_path, bin_path, chromosome=None,
                  chain_ids=None, chain_stats=None):
    """Export grid-based mipmap data as two files:
      meta_path  — gzipped JSON (stats, chainMeta, level metadata)
      bin_path   — gzipped binary (pointCounts, chainIds, coords per level)
    """
    total_segments = len(segment_index)
    level_summaries = []

    # Build all levels first to compute metadata
    all_levels = []
    for cell in sorted(grid_cell_sizes):
        if chain_ids is not None:
            grid_pls, grid_chain_ids = grid_simplify(
                polylines, cell, chain_ids=chain_ids)
        else:
            grid_pls = grid_simplify(polylines, cell)
            grid_chain_ids = None

        # Filter polylines with <2 points, delta-encode coordinates
        point_counts = []
        level_chain_ids = []
        coord_chunks = []
        for j, pl in enumerate(grid_pls):
            n = len(pl)
            if n < 2:
                continue
            point_counts.append(n)
            if grid_chain_ids is not None:
                level_chain_ids.append(int(grid_chain_ids[j]))
            else:
                level_chain_ids.append(-1)
            arr = np.asarray(pl, dtype=np.float64)
            deltas = np.empty_like(arr)
            deltas[0] = arr[0]
            deltas[1:] = arr[1:] - arr[:-1]
            coord_chunks.append(np.rint(deltas).astype(np.int32).ravel())

        coords_arr = (np.concatenate(coord_chunks) if coord_chunks
                      else np.empty(0, dtype=np.int32))
        total_nodes = sum(len(pl) for pl in grid_pls)
        num_polylines = len(point_counts)
        total_points = sum(point_counts)

        all_levels.append({
            "cell": cell,
            "total_nodes": total_nodes,
            "num_polylines": num_polylines,
            "total_points": total_points,
            "point_counts": np.array(point_counts, dtype=np.uint32),
            "chain_ids": np.array(level_chain_ids, dtype=np.int32),
            "coords": coords_arr,
        })
        level_summaries.append((f"Grid {cell:,}", total_nodes, num_polylines))

    # Build JSON header
    junction_count = int(np.count_nonzero(junctions)) if hasattr(junctions, 'dtype') else len(junctions)
    header = {
        "meta": {"version": __version__, "encoding": "binary"},
        "stats": {
            "totalSegments": total_segments,
            "totalLinks": len(link_index),
            "junctionCount": junction_count,
            "runCount": len(runs),
        },
        "chromosome": chromosome,
        "levels": [],
    }

    if chain_stats is not None:
        cleaned = {}
        for k, v in chain_stats.items():
            entry = {fk: fv for fk, fv in v.items() if fk != "parent_subtype"}
            cleaned[str(k)] = entry
        header["chainMeta"] = cleaned

    for level in all_levels:
        header["levels"].append({
            "gridSize": level["cell"],
            "label": f"Grid {level['cell']:,}",
            "nodeCount": level["total_nodes"],
            "polylineCount": level["num_polylines"],
            "numPolylines": level["num_polylines"],
            "totalPoints": level["total_points"],
        })

    # Write meta JSON
    with gzip.open(meta_path, 'wt', encoding='utf-8') as f:
        json.dump(header, f, cls=db_utils.NumpyJSONEncoder)

    meta_mb = os.path.getsize(meta_path) / (1024 * 1024)
    print(f"Exported {meta_path} ({meta_mb:.1f} MB)")

    # Write binary polylines
    with gzip.open(bin_path, 'wb') as f:
        for level in all_levels:
            f.write(level["point_counts"].tobytes())
            f.write(level["chain_ids"].tobytes())
            f.write(level["coords"].tobytes())

    bin_mb = os.path.getsize(bin_path) / (1024 * 1024)
    print(f"Exported {bin_path} ({bin_mb:.1f} MB)")

    print(f"\n=== Grid Levels (finest → coarsest) ===")
    print(f"{'Cell size':>12}  {'Nodes':>10}  {'Polylines':>10}  {'Reduction':>10}")
    for label, node_count, pl_count in level_summaries:
        pct = (1 - node_count / total_segments) * 100
        print(f"{label:>12}  {node_count:>10,}  "
              f"{pl_count:>10,}  "
              f"{pct:>9.1f}%")


# ---------------------------------------------------------------------------
# Skeleton generation (integrated pipeline entry points)
# ---------------------------------------------------------------------------



