"""
Skeleton builder for multi-resolution zoom.

Identifies junctions and linear runs in the GFA graph, applies grid-based
spatial simplification at multiple cell sizes, and exports gzipped JSON
for the D3 skeleton viewer.
"""

import gzip
import json
import math
import os
from collections import defaultdict

import numpy as np

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.sqlite import bubble_db
from pangyplot.db import db_utils


VIEWER_GRID_SIZES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000]


# ---------------------------------------------------------------------------
# Degree computation
# ---------------------------------------------------------------------------

def compute_degrees(link_index):
    """Returns dict: seg_id -> (in_degree, out_degree) from LinkIndex arrays."""
    degrees = {}
    n_links = len(link_index.from_ids)

    in_deg = defaultdict(int)
    out_deg = defaultdict(int)

    for i in range(n_links):
        fid = link_index.from_ids[i]
        tid = link_index.to_ids[i]
        out_deg[fid] += 1
        in_deg[tid] += 1

    all_segs = set(in_deg.keys()) | set(out_deg.keys())
    for sid in all_segs:
        degrees[sid] = (in_deg[sid], out_deg[sid])

    return degrees


# ---------------------------------------------------------------------------
# Junction finding
# ---------------------------------------------------------------------------

def find_junctions(degrees):
    """Returns set of segment IDs where total degree != 2.

    A degree-2 node has exactly one incoming and one outgoing edge — it's a
    pass-through that can be collapsed. Everything else is a junction.
    """
    junctions = set()
    for sid, (ind, outd) in degrees.items():
        if ind + outd != 2:
            junctions.add(sid)
    return junctions


# ---------------------------------------------------------------------------
# Linear run extraction
# ---------------------------------------------------------------------------

def find_linear_runs(gfaidx, junctions, segment_index):
    """Walk from each junction through degree-2 segments until hitting another
    junction. Returns list of runs, each a list of segment IDs
    [junction, deg2, ..., deg2, junction].

    Handles edge cases:
    - Isolated degree-2 cycles (no junctions) are detected separately.
    - Each run is found exactly once via visited-edge tracking.
    """
    visited_edges = set()
    runs = []

    for junc in junctions:
        neighbors = gfaidx.get_neighbors(junc)
        for neighbor in neighbors:
            edge_key = (min(junc, neighbor), max(junc, neighbor))
            if edge_key in visited_edges:
                continue

            if not segment_index.valid[neighbor]:
                continue

            # Start a run from junc toward neighbor
            run = [junc]
            prev = junc
            curr = neighbor

            while curr not in junctions:
                visited_edges.add((min(prev, curr), max(prev, curr)))
                run.append(curr)

                nexts = [n for n in gfaidx.get_neighbors(curr) if n != prev]
                if not nexts:
                    break
                prev = curr
                curr = nexts[0]

            # Add the final junction (or dead-end)
            visited_edges.add((min(prev, curr), max(prev, curr)))
            if curr in junctions:
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
# Ramer-Douglas-Peucker
# ---------------------------------------------------------------------------

def _perpendicular_distance(point, line_start, line_end):
    """Perpendicular distance from point to line segment."""
    dx = line_end[0] - line_start[0]
    dy = line_end[1] - line_start[1]
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(point[0] - line_start[0], point[1] - line_start[1])
    t = ((point[0] - line_start[0]) * dx + (point[1] - line_start[1]) * dy) / length_sq
    t = max(0.0, min(1.0, t))
    proj_x = line_start[0] + t * dx
    proj_y = line_start[1] + t * dy
    return math.hypot(point[0] - proj_x, point[1] - proj_y)


def rdp_simplify(polyline, epsilon):
    """Ramer-Douglas-Peucker simplification. Returns simplified polyline."""
    if len(polyline) <= 2:
        return polyline

    # Find the point with the maximum distance from the line start→end
    max_dist = 0.0
    max_idx = 0
    start = polyline[0]
    end = polyline[-1]

    for i in range(1, len(polyline) - 1):
        dist = _perpendicular_distance(polyline[i], start, end)
        if dist > max_dist:
            max_dist = dist
            max_idx = i

    if max_dist > epsilon:
        left = rdp_simplify(polyline[:max_idx + 1], epsilon)
        right = rdp_simplify(polyline[max_idx:], epsilon)
        return left[:-1] + right
    else:
        return [start, end]


# ---------------------------------------------------------------------------
# Grid-based spatial simplification
# ---------------------------------------------------------------------------

def grid_simplify(polylines, junction_coords, cell_size, chain_ids=None):
    """Snap all coordinates to a spatial grid and deduplicate.

    This merges nearby junctions (which RDP cannot do), enabling much
    coarser simplification levels. A polyline whose endpoints snap to the
    same grid cell collapses and is removed.

    If chain_ids is provided (parallel to polylines), it is filtered in sync.
    Returns (new_polylines, new_junctions) or (new_polylines, new_junctions, new_chain_ids).
    """
    def snap(x, y):
        return (round(x / cell_size) * cell_size,
                round(y / cell_size) * cell_size)

    new_polylines = []
    new_chain_ids = [] if chain_ids is not None else None
    for i, pl in enumerate(polylines):
        snapped = [snap(p[0], p[1]) for p in pl]
        # Remove consecutive duplicates
        deduped = [snapped[0]]
        for p in snapped[1:]:
            if p != deduped[-1]:
                deduped.append(p)
        if len(deduped) >= 2:
            new_polylines.append(deduped)
            if new_chain_ids is not None:
                new_chain_ids.append(chain_ids[i])

    new_junctions = sorted(set(snap(x, y) for x, y in junction_coords))
    if chain_ids is not None:
        return new_polylines, new_junctions, new_chain_ids
    return new_polylines, new_junctions


# ---------------------------------------------------------------------------
# Reference spine: layout_x → basepair lookup table
# ---------------------------------------------------------------------------

def build_reference_spine(step_index, segment_index, stride=50):
    """Build a compact (x, bp, y) lookup table from the reference path.

    Walks each step, computes segment centroid (x, y) and midpoint bp,
    filters to a monotone-increasing envelope (drops backward jogs in x)
    and downsamples by stride for compactness.

    Returns list of [x, bp, y] triples sorted by x.
    """
    # Collect (x, bp, y, step_idx) for every reference step
    points = []
    for i in range(len(step_index.segments)):
        sid = step_index.segments[i]
        if sid >= len(segment_index.valid) or not segment_index.valid[sid]:
            continue
        cx = (segment_index.x1[sid] + segment_index.x2[sid]) / 2.0
        cy = (segment_index.y1[sid] + segment_index.y2[sid]) / 2.0
        bp = (step_index.starts[i] + step_index.ends[i]) / 2.0
        points.append((cx, bp, cy, i))

    # Build monotone envelope: only keep points where x exceeds running max
    envelope = []
    max_x = -float('inf')
    for cx, bp, cy, step_idx in points:
        if cx > max_x:
            envelope.append((cx, bp, cy, step_idx))
            max_x = cx

    # Downsample by stride
    spine = [[round(envelope[i][0], 1), int(envelope[i][1]), round(envelope[i][2], 1), envelope[i][3]]
             for i in range(0, len(envelope), stride)]

    # Ensure last point is included
    if len(envelope) > 0:
        last = [round(envelope[-1][0], 1), int(envelope[-1][1]), round(envelope[-1][2], 1), envelope[-1][3]]
        if not spine or spine[-1] != last:
            spine.append(last)

    print(f"Reference spine: {len(points)} steps → {len(envelope)} monotone → {len(spine)} sampled points")
    return spine


# ---------------------------------------------------------------------------
# JSON export for D3 viewer
# ---------------------------------------------------------------------------

def export_json(junctions, runs, segment_index, link_index, polylines,
                grid_cell_sizes, output_path, ref_spine=None, chromosome=None,
                chain_ids=None, chain_stats=None):
    """Export pure grid-based mipmap data as gzipped JSON for the D3 viewer.

    Each level is a grid simplification at a different cell size.
    Levels are sorted finest (smallest cell) to coarsest (largest cell).
    Each level carries its own junction + polyline set.

    If chain_ids is provided (parallel to polylines), each level includes
    a chainIds array parallel to its polylines. chain_stats is exported
    as top-level chainMeta.
    """
    # Base junction coordinates
    junc_coords = []
    for sid in sorted(junctions):
        if sid < len(segment_index.valid) and segment_index.valid[sid]:
            cx = (segment_index.x1[sid] + segment_index.x2[sid]) / 2.0
            cy = (segment_index.y1[sid] + segment_index.y2[sid]) / 2.0
            junc_coords.append((cx, cy))

    total_segments = len(segment_index)
    levels = []

    for cell in sorted(grid_cell_sizes):
        if chain_ids is not None:
            grid_pls, grid_juncs, grid_chain_ids = grid_simplify(
                polylines, junc_coords, cell, chain_ids=chain_ids)
        else:
            grid_pls, grid_juncs = grid_simplify(polylines, junc_coords, cell)
            grid_chain_ids = None

        # Build polylines and chain IDs in sync (filter len<2 together)
        lines = []
        level_chain_ids = [] if grid_chain_ids is not None else None
        for j, pl in enumerate(grid_pls):
            if len(pl) < 2:
                continue
            lines.append([[round(p[0], 1), round(p[1], 1)] for p in pl])
            if level_chain_ids is not None:
                level_chain_ids.append(grid_chain_ids[j])

        juncs = [[round(j[0], 1), round(j[1], 1)] for j in grid_juncs]
        total_nodes = len(juncs) + sum(max(0, len(pl) - 2) for pl in grid_pls)
        level_data = {
            "gridSize": cell,
            "label": f"Grid {cell:,}",
            "polylines": lines,
            "junctions": juncs,
            "nodeCount": total_nodes,
            "polylineCount": len(lines),
        }
        if level_chain_ids is not None:
            level_data["chainIds"] = level_chain_ids
        levels.append(level_data)

    data = {
        "levels": levels,
        "stats": {
            "totalSegments": total_segments,
            "totalLinks": len(link_index),
            "junctionCount": len(junctions),
            "runCount": len(runs),
        },
    }
    if ref_spine is not None:
        data["refSpine"] = ref_spine
    if chromosome is not None:
        data["chromosome"] = chromosome
    if chain_stats is not None:
        # Convert int keys to strings for JSON
        data["chainMeta"] = {str(k): v for k, v in chain_stats.items()}

    with gzip.open(output_path, 'wt', encoding='utf-8') as f:
        json.dump(data, f, cls=db_utils.NumpyJSONEncoder)
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Exported {output_path} ({size_mb:.1f} MB)")

    print(f"\n=== Grid Levels (finest → coarsest) ===")
    print(f"{'Cell size':>12}  {'Nodes':>10}  {'Junctions':>10}  {'Polylines':>10}  {'Reduction':>10}")
    for level in levels:
        pct = (1 - level["nodeCount"] / total_segments) * 100
        print(f"{level['label']:>12}  {level['nodeCount']:>10,}  "
              f"{len(level['junctions']):>10,}  {level['polylineCount']:>10,}  "
              f"{pct:>9.1f}%")


# ---------------------------------------------------------------------------
# Skeleton generation (integrated pipeline entry points)
# ---------------------------------------------------------------------------

SKELETON_FILENAME = "skeleton.json.gz"


def generate_skeleton(chr_dir, ref, chrom):
    """Build and export skeleton JSON for a single chromosome directory."""
    gz_path = os.path.join(chr_dir, SKELETON_FILENAME)

    print("→ Building skeleton.")

    print("   🦴 Computing graph topology...", end="", flush=True)
    gfaidx = GFAIndex(chr_dir)
    segment_index = gfaidx.segment_index
    link_index = gfaidx.link_index
    degrees = compute_degrees(link_index)
    junctions = find_junctions(degrees)
    runs = find_linear_runs(gfaidx, junctions, segment_index)
    print(" Done.")

    print("   📐 Building polylines...", end="", flush=True)
    polylines = [run_to_polyline(run, segment_index) for run in runs]
    print(" Done.")

    print("   🧬 Building reference spine...", end="", flush=True)
    step_index = StepIndex(chr_dir, ref)
    ref_spine = build_reference_spine(step_index, segment_index)
    print(" Done.")

    print("   ⛓️  Annotating chains...", end="", flush=True)
    seg_to_bubble = load_segment_to_bubble(chr_dir)
    bubble_to_chain = bubble_db.get_bubble_chain_map(chr_dir)
    chain_stats = bubble_db.get_chain_stats(chr_dir)
    chain_ids = None
    if seg_to_bubble is not None and bubble_to_chain is not None:
        chain_ids = compute_run_chain_ids(runs, seg_to_bubble, bubble_to_chain, chain_stats)
    print(" Done.")

    print("   💾 Exporting skeleton...", end="", flush=True)
    export_json(junctions, runs, segment_index, link_index, polylines,
                VIEWER_GRID_SIZES, gz_path,
                ref_spine=ref_spine, chromosome=chrom,
                chain_ids=chain_ids, chain_stats=chain_stats)
    print(" Done.")


def ensure_skeleton(data_dir, db_name, ref):
    """Generate skeleton JSON for any chromosome that is missing it.

    Called automatically by the run command before starting the server.
    Discovers chromosomes from the graph directory on disk.
    """
    graph_path = os.path.join(data_dir, "graphs", db_name)
    if not os.path.isdir(graph_path):
        return

    chromosomes = [d for d in os.listdir(graph_path)
                   if os.path.isdir(os.path.join(graph_path, d))]

    for chrom in chromosomes:
        chr_dir = os.path.join(graph_path, chrom)
        gz_path = os.path.join(chr_dir, SKELETON_FILENAME)
        if not os.path.exists(gz_path):
            print(f"\n[Skeleton] Missing skeleton for {chrom}, generating...")
            generate_skeleton(chr_dir, ref, chrom)
