"""
Graph simplification prototype for multi-resolution zoom.

Loads an existing PangyPlot database, identifies junctions and linear runs,
applies Ramer-Douglas-Peucker simplification at multiple epsilon levels,
and reports statistics + matplotlib visualizations.

Usage:
    python -m pangyplot.preprocess.skeleton.graph_simplify \
        --db hprc.clip --chr chrY --ref GRCh38
"""

import argparse
import gzip
import json
import math
import os
import sys
from collections import defaultdict

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex


DEFAULT_EPSILONS = [0.1, 0.5, 1.0, 5.0, 10.0, 50.0, 100.0]
VIEWER_EPSILONS = [1.0, 5.0, 10.0, 50.0, 100.0]
GRID_CELL_SIZES = [500, 1000, 5000, 10000, 50000, 100000]


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
        cx = (segment_index.x1[sid] + segment_index.x2[sid]) / 2.0
        cy = (segment_index.y1[sid] + segment_index.y2[sid]) / 2.0
        polyline.append((cx, cy))
    return polyline


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
# Mipmap computation
# ---------------------------------------------------------------------------

def compute_mipmaps(runs, segment_index, epsilon_levels):
    """Apply RDP at each epsilon level.
    Returns dict: epsilon -> list of simplified polylines.
    """
    # Pre-compute polylines once
    polylines = [run_to_polyline(run, segment_index) for run in runs]

    mipmaps = {}
    for eps in epsilon_levels:
        simplified = [rdp_simplify(pl, eps) for pl in polylines]
        mipmaps[eps] = simplified

    return mipmaps, polylines


# ---------------------------------------------------------------------------
# Grid-based spatial simplification
# ---------------------------------------------------------------------------

def grid_simplify(polylines, junction_coords, cell_size):
    """Snap all coordinates to a spatial grid and deduplicate.

    This merges nearby junctions (which RDP cannot do), enabling much
    coarser simplification levels. A polyline whose endpoints snap to the
    same grid cell collapses and is removed.
    """
    def snap(x, y):
        return (round(x / cell_size) * cell_size,
                round(y / cell_size) * cell_size)

    new_polylines = []
    for pl in polylines:
        snapped = [snap(p[0], p[1]) for p in pl]
        # Remove consecutive duplicates
        deduped = [snapped[0]]
        for p in snapped[1:]:
            if p != deduped[-1]:
                deduped.append(p)
        if len(deduped) >= 2:
            new_polylines.append(deduped)

    new_junctions = sorted(set(snap(x, y) for x, y in junction_coords))
    return new_polylines, new_junctions


# ---------------------------------------------------------------------------
# JSON export for D3 viewer
# ---------------------------------------------------------------------------

def export_json(junctions, runs, segment_index, link_index, polylines,
                epsilon_levels, grid_cell_sizes, output_path):
    """Export precomputed mipmap data as gzipped JSON for the D3 viewer.

    Produces two types of levels:
      - RDP levels: geometric simplification within runs (junctions fixed)
      - Grid levels: spatial binning that merges nearby junctions
    Each level carries its own junction + polyline set.
    """
    # Base junction coordinates
    junc_coords = []
    for sid in sorted(junctions):
        if sid < len(segment_index.valid) and segment_index.valid[sid]:
            cx = (segment_index.x1[sid] + segment_index.x2[sid]) / 2.0
            cy = (segment_index.y1[sid] + segment_index.y2[sid]) / 2.0
            junc_coords.append((cx, cy))

    def round_coords(coords):
        return [[round(p[0], 1), round(p[1], 1)] for p in coords]

    # --- RDP levels (junctions unchanged) ---
    levels = []
    base_junctions_json = round_coords(junc_coords)

    for eps in epsilon_levels:
        simplified = [rdp_simplify(pl, eps) for pl in polylines]
        lines = [round_coords(pl) for pl in simplified if len(pl) >= 2]
        total_nodes = len(junc_coords) + sum(max(0, len(pl) - 2) for pl in simplified)
        levels.append({
            "label": f"RDP ε={eps}",
            "polylines": lines,
            "junctions": base_junctions_json,
            "nodeCount": total_nodes,
            "polylineCount": len(lines),
        })

    # --- Grid levels (applied on top of max-RDP polylines) ---
    # Start from the most-simplified RDP polylines
    rdp_polylines = [rdp_simplify(pl, epsilon_levels[-1]) for pl in polylines]

    for cell in grid_cell_sizes:
        grid_pls, grid_juncs = grid_simplify(rdp_polylines, junc_coords, cell)
        lines = [[[round(p[0], 1), round(p[1], 1)] for p in pl]
                 for pl in grid_pls if len(pl) >= 2]
        juncs = [[round(j[0], 1), round(j[1], 1)] for j in grid_juncs]
        total_nodes = len(juncs) + sum(max(0, len(pl) - 2) for pl in grid_pls)
        levels.append({
            "label": f"Grid {cell:,}",
            "polylines": lines,
            "junctions": juncs,
            "nodeCount": total_nodes,
            "polylineCount": len(lines),
        })

    total_segments = len(segment_index)
    data = {
        "levels": levels,
        "stats": {
            "totalSegments": total_segments,
            "totalLinks": len(link_index),
            "junctionCount": len(junctions),
            "runCount": len(runs),
        }
    }

    with gzip.open(output_path, 'wt', encoding='utf-8') as f:
        json.dump(data, f)
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Exported {output_path} ({size_mb:.1f} MB)")

    # Print grid level stats
    print(f"\n=== Grid Simplification Levels ===")
    print(f"{'Cell size':>12}  {'Nodes':>10}  {'Junctions':>10}  {'Polylines':>10}  {'Reduction':>10}")
    for level in levels:
        if level["label"].startswith("Grid"):
            pct = (1 - level["nodeCount"] / total_segments) * 100
            print(f"{level['label']:>12}  {level['nodeCount']:>10,}  "
                  f"{len(level['junctions']):>10,}  {level['polylineCount']:>10,}  "
                  f"{pct:>9.1f}%")


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

def report_stats(segment_index, link_index, junctions, runs, mipmaps, epsilon_levels):
    """Print statistics about the graph simplification."""
    total_segments = len(segment_index)
    total_links = len(link_index)
    n_junctions = len(junctions)
    n_runs = len(runs)

    run_lengths = [len(r) for r in runs]
    avg_len = sum(run_lengths) / n_runs if n_runs else 0
    max_len = max(run_lengths) if run_lengths else 0
    sorted_lengths = sorted(run_lengths)
    median_len = sorted_lengths[len(sorted_lengths) // 2] if sorted_lengths else 0

    total_polyline_points = sum(len(run_to_polyline(r, segment_index)) for r in runs)

    print(f"\n=== Graph Simplification Report ===")
    print(f"Total segments:          {total_segments:>10,}")
    print(f"Total links:             {total_links:>10,}")
    print(f"Junctions (deg != 2):    {n_junctions:>10,}")
    print(f"Linear runs:             {n_runs:>10,}")
    print(f"  Avg run length:        {avg_len:>10.1f} segments")
    print(f"  Max run length:        {max_len:>10,} segments")
    print(f"  Median run length:     {median_len:>10,} segments")
    print()

    print(f"=== RDP Mipmap Levels ===")
    print(f"{'Epsilon':>10}  {'Total nodes':>12}  {'Reduction':>10}")
    print(f"{'-'*10}  {'-'*12}  {'-'*10}")

    for eps in epsilon_levels:
        simplified = mipmaps[eps]
        total_nodes = n_junctions + sum(len(pl) - 2 for pl in simplified)
        reduction = (1 - total_nodes / total_segments) * 100 if total_segments else 0
        print(f"{eps:>10.1f}  {total_nodes:>12,}  {reduction:>9.1f}%")

    print()


# ---------------------------------------------------------------------------
# Plotting
# ---------------------------------------------------------------------------

def plot_simplified(mipmaps, junctions, segment_index, epsilon_levels):
    """Matplotlib subplots showing the graph at each epsilon level."""
    n_levels = len(epsilon_levels)
    cols = min(3, n_levels)
    rows = math.ceil(n_levels / cols)

    fig, axes = plt.subplots(rows, cols, figsize=(7 * cols, 5 * rows))
    if n_levels == 1:
        axes = [axes]
    else:
        axes = axes.flatten()

    # Junction coordinates
    junc_x = []
    junc_y = []
    for sid in junctions:
        if sid < len(segment_index.valid) and segment_index.valid[sid]:
            cx = (segment_index.x1[sid] + segment_index.x2[sid]) / 2.0
            cy = (segment_index.y1[sid] + segment_index.y2[sid]) / 2.0
            junc_x.append(cx)
            junc_y.append(cy)

    for i, eps in enumerate(epsilon_levels):
        ax = axes[i]
        simplified = mipmaps[eps]

        total_nodes = len(junctions) + sum(len(pl) - 2 for pl in simplified)

        # Batch draw runs as LineCollection (much faster than individual plot calls)
        segments = [list(pl) for pl in simplified if len(pl) >= 2]
        lc = LineCollection(segments, colors='#4a90d9', linewidths=0.4, alpha=0.7)
        ax.add_collection(lc)

        # Draw junctions
        ax.scatter(junc_x, junc_y, s=1, c='#e74c3c', alpha=0.6, zorder=5)

        ax.set_title(f"ε = {eps}  ({total_nodes:,} nodes)")
        ax.autoscale()
        ax.set_aspect('equal')
        ax.invert_yaxis()
        ax.set_xlabel('x (ODGI)')
        ax.set_ylabel('y (ODGI)')

    # Hide unused subplots
    for j in range(n_levels, len(axes)):
        axes[j].set_visible(False)

    plt.tight_layout()
    plt.savefig("graph_simplification.png", dpi=150)
    print("Saved plot to graph_simplification.png")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def find_data_dir(db_name, chrom):
    """Locate the datastore directory for a given db + chromosome."""
    candidates = [
        os.path.join("datastore", "graphs", db_name, chrom),
        os.path.join(os.path.dirname(__file__), "..", "..", "..",
                     "datastore", "graphs", db_name, chrom),
    ]
    for path in candidates:
        abspath = os.path.abspath(path)
        if os.path.isdir(abspath):
            return abspath
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Graph simplification prototype for multi-resolution zoom")
    parser.add_argument("--db", required=True, help="Database name (e.g. hprc.clip)")
    parser.add_argument("--chr", required=True, help="Chromosome (e.g. chrY)")
    parser.add_argument("--ref", required=True, help="Reference genome (e.g. GRCh38)")
    parser.add_argument("--epsilons", type=float, nargs="+", default=DEFAULT_EPSILONS,
                        help="Epsilon values for RDP simplification")
    parser.add_argument("--no-plot", action="store_true",
                        help="Skip matplotlib plotting")
    parser.add_argument("--export-json", metavar="PATH",
                        help="Export mipmap data as gzipped JSON for D3 viewer")
    parser.add_argument("--viewer-epsilons", action="store_true",
                        help="Use wider epsilon range suited for the D3 viewer")
    args = parser.parse_args()

    if args.viewer_epsilons:
        args.epsilons = VIEWER_EPSILONS

    # Find data directory
    data_dir = find_data_dir(args.db, args.chr)
    if data_dir is None:
        print(f"Error: could not find datastore for --db={args.db} --chr={args.chr}")
        print(f"Expected: datastore/graphs/{args.db}/{args.chr}/")
        sys.exit(1)

    print(f"Loading indexes from {data_dir} ...")
    gfaidx = GFAIndex(data_dir)
    segment_index = gfaidx.segment_index
    link_index = gfaidx.link_index

    print("Computing degrees ...")
    degrees = compute_degrees(link_index)

    print("Finding junctions ...")
    junctions = find_junctions(degrees)

    print(f"Finding linear runs from {len(junctions)} junctions ...")
    runs = find_linear_runs(gfaidx, junctions, segment_index)

    print(f"Computing RDP mipmaps at {len(args.epsilons)} epsilon levels ...")
    mipmaps, polylines = compute_mipmaps(runs, segment_index, args.epsilons)

    report_stats(segment_index, link_index, junctions, runs, mipmaps, args.epsilons)

    if args.export_json:
        print(f"Exporting JSON for D3 viewer ...")
        export_json(junctions, runs, segment_index, link_index, polylines,
                    args.epsilons, GRID_CELL_SIZES, args.export_json)

    if not args.no_plot:
        print("Generating plots ...")
        plot_simplified(mipmaps, junctions, segment_index, args.epsilons)


if __name__ == "__main__":
    main()
