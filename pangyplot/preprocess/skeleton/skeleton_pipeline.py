"""
Skeleton builder internals: graph topology, chain annotation,
reference spine, and JSON export.
"""

import gzip
import os
from collections import defaultdict

import numpy as np

from pangyplot.db import db_utils
from pangyplot.version import __version__
from pangyplot.preprocess.skeleton.skeleton_geometry import grid_simplify


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
# JSON export for D3 viewer
# ---------------------------------------------------------------------------

def export_json(junctions, runs, segment_index, link_index, polylines,
                grid_cell_sizes, output_path, chromosome=None,
                chain_ids=None, chain_stats=None):
    """Export pure grid-based mipmap data as gzipped JSON for the D3 viewer.

    Each level is a grid simplification at a different cell size.
    Levels are sorted finest (smallest cell) to coarsest (largest cell).

    If chain_ids is provided (parallel to polylines), each level includes
    a chainIds array parallel to its polylines. chain_stats is exported
    as top-level chainMeta.
    """
    total_segments = len(segment_index)
    encoder = db_utils.NumpyJSONEncoder()
    level_summaries = []

    # Stream JSON to gzip file, writing each grid level as it's computed
    # so we never hold all levels in memory at once.
    with gzip.open(output_path, 'wt', encoding='utf-8') as f:
        f.write('{')

        # Meta (must be first key for fast version detection)
        meta = {"version": __version__, "encoding": "delta"}
        f.write('"meta":')
        f.write(encoder.encode(meta))

        # Stats
        stats = {
            "totalSegments": total_segments,
            "totalLinks": len(link_index),
            "junctionCount": len(junctions),
            "runCount": len(runs),
        }
        f.write(',"stats":')
        f.write(encoder.encode(stats))

        # Chromosome
        if chromosome is not None:
            f.write(',"chromosome":')
            f.write(encoder.encode(chromosome))

        # ChainMeta (strip parent_subtype — not used by frontend)
        if chain_stats is not None:
            cleaned = {}
            for k, v in chain_stats.items():
                entry = {fk: fv for fk, fv in v.items() if fk != "parent_subtype"}
                cleaned[str(k)] = entry
            f.write(',"chainMeta":')
            f.write(encoder.encode(cleaned))

        # Levels — stream one at a time
        f.write(',"levels":[')
        for level_idx, cell in enumerate(sorted(grid_cell_sizes)):
            if chain_ids is not None:
                grid_pls, grid_chain_ids = grid_simplify(
                    polylines, cell, chain_ids=chain_ids)
            else:
                grid_pls = grid_simplify(polylines, cell)
                grid_chain_ids = None

            # Build polylines and chain IDs in sync (filter len<2 together)
            # Delta-encode: first point absolute, subsequent points as [dx, dy]
            lines = []
            level_chain_ids = [] if grid_chain_ids is not None else None
            for j, pl in enumerate(grid_pls):
                if len(pl) < 2:
                    continue
                encoded = [[round(pl[0][0], 1), round(pl[0][1], 1)]]
                for k in range(1, len(pl)):
                    encoded.append([round(pl[k][0] - pl[k-1][0], 1),
                                    round(pl[k][1] - pl[k-1][1], 1)])
                lines.append(encoded)
                if level_chain_ids is not None:
                    level_chain_ids.append(grid_chain_ids[j])

            total_nodes = sum(len(pl) for pl in grid_pls)
            level_data = {
                "gridSize": cell,
                "label": f"Grid {cell:,}",
                "polylines": lines,
                "nodeCount": total_nodes,
                "polylineCount": len(lines),
            }
            if level_chain_ids is not None:
                level_data["chainIds"] = level_chain_ids

            level_summaries.append((level_data["label"], total_nodes,
                                    len(lines)))

            if level_idx > 0:
                f.write(',')
            f.write(encoder.encode(level_data))
            del level_data, lines, grid_pls
            if grid_chain_ids is not None:
                del grid_chain_ids
            if level_chain_ids is not None:
                del level_chain_ids

        f.write(']')
        f.write('}')

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Exported {output_path} ({size_mb:.1f} MB)")

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



