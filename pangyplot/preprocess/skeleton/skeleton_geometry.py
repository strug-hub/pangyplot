"""Spatial simplification algorithms for skeleton building."""

import math
from collections import defaultdict


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
# Grid-based spatial simplification with edge dedup and path tracing
# ---------------------------------------------------------------------------

def grid_simplify(polylines, cell_size, chain_ids=None):
    """Snap coordinates to a spatial grid, deduplicate edges, and trace
    minimal polylines through the resulting graph.

    Steps:
      1. Snap all points to grid cells, remove consecutive duplicates
      2. Collect unique directed edges (deduplicate overlapping segments)
      3. Build adjacency graph and trace paths through degree-2 nodes

    Returns new_polylines or (new_polylines, new_chain_ids).
    Chain IDs are assigned per-edge from the first contributing polyline,
    then the most common chain ID along each traced path wins.
    """
    def snap(x, y):
        return (round(x / cell_size) * cell_size,
                round(y / cell_size) * cell_size)

    # 1. Collect unique edges from all polylines
    edges = set()
    edge_chain = {}  # canonical edge → chain_id (first seen wins)
    for i, pl in enumerate(polylines):
        snapped = [snap(p[0], p[1]) for p in pl]
        # Remove consecutive duplicates
        deduped = [snapped[0]]
        for p in snapped[1:]:
            if p != deduped[-1]:
                deduped.append(p)
        cid = chain_ids[i] if chain_ids is not None else -1
        for j in range(len(deduped) - 1):
            a, b = deduped[j], deduped[j + 1]
            edge = (a, b) if a <= b else (b, a)
            if edge not in edges:
                edges.add(edge)
                edge_chain[edge] = cid

    # 2. Build adjacency graph
    adj = defaultdict(set)
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)

    # 3. Trace paths through degree-2 nodes
    used = set()
    new_polylines = []
    new_chain_ids = [] if chain_ids is not None else None

    def trace_path(start, first_nbr):
        """Walk from start through first_nbr, continuing through degree-2 nodes."""
        path = [start]
        path_edges = []
        cur, prev = first_nbr, start
        while True:
            edge = (min(prev, cur), max(prev, cur))
            if edge in used:
                break
            path.append(cur)
            used.add(edge)
            path_edges.append(edge)
            if len(adj[cur]) != 2:
                break
            neighbors = [n for n in adj[cur] if n != prev]
            if not neighbors:
                break
            prev, cur = cur, neighbors[0]
        return path, path_edges

    def majority_chain(path_edges):
        """Return the most common chain ID along a traced path."""
        counts = defaultdict(int)
        for e in path_edges:
            cid = edge_chain.get(e, -1)
            counts[cid] += 1
        if not counts:
            return -1
        return max(counts, key=counts.get)

    # Start from junctions and dead-ends (degree != 2)
    starts = [n for n in adj if len(adj[n]) != 2]
    for node in starts:
        for nbr in list(adj[node]):
            edge = (min(node, nbr), max(node, nbr))
            if edge in used:
                continue
            path, path_edges = trace_path(node, nbr)
            if len(path) >= 2:
                new_polylines.append(path)
                if new_chain_ids is not None:
                    new_chain_ids.append(majority_chain(path_edges))

    # Handle remaining cycles (all degree-2, no junction start)
    for a, b in edges:
        canon = (a, b) if a <= b else (b, a)
        if canon in used:
            continue
        path, path_edges = trace_path(a, b)
        if len(path) >= 2:
            new_polylines.append(path)
            if new_chain_ids is not None:
                new_chain_ids.append(majority_chain(path_edges))

    if chain_ids is not None:
        return new_polylines, new_chain_ids
    return new_polylines


# ---------------------------------------------------------------------------
# Dyadic floor-snap cascade
#
# The multi-resolution ladder is produced by building the finest level from the
# original skeleton once, then deriving each coarser level from the previous
# one (coarse <- fine) instead of re-snapping the original at every cell.
#
# This is exact ONLY when the grids are properly nested: with FLOOR snapping and
# a dyadic ladder (each cell 2x the previous), snap_2C(snap_C(x)) == snap_2C(x)
# always holds, so a level derived from the previous is byte-identical to one
# rebuilt from the original. (Round-to-nearest breaks this; see grid_simplify.)
#
# Floor biases every point toward the cell's lower-left corner; the viewer adds
# +cell/2 at render time to re-center (skeleton-decoder.js). Coordinates stay
# exact multiples of the cell on disk, which the grid-varint codec relies on.
# ---------------------------------------------------------------------------

def _floor_snap(x, y, cell):
    return (math.floor(x / cell) * cell, math.floor(y / cell) * cell)


def _canon(a, b):
    return (a, b) if a <= b else (b, a)


def _finest_edge_hist(polylines, cell, chain_ids):
    """Floor-snap the originals into {edge: {chain_id: weight}} for the finest
    cell. Weight is the number of contributing snapped segments, used only to
    pick the majority chain per traced polyline (order-independent, so the
    cascade and a per-level rebuild agree exactly)."""
    hist = {}
    for i, pl in enumerate(polylines):
        cid = chain_ids[i] if chain_ids is not None else -1
        prev = _floor_snap(pl[0][0], pl[0][1], cell)
        for p in pl[1:]:
            cur = _floor_snap(p[0], p[1], cell)
            if cur == prev:
                continue
            e = _canon(prev, cur)
            d = hist.get(e)
            if d is None:
                hist[e] = {cid: 1}
            else:
                d[cid] = d.get(cid, 0) + 1
            prev = cur
    return hist


def _coarsen_edge_hist(hist, cell):
    """Derive the next-coarser level directly from a finer level's edges by
    floor-snapping both endpoints to `cell` and merging chain histograms.
    Edges whose endpoints collapse into one cell are sub-cell detail, dropped."""
    out = {}
    for (a, b), d in hist.items():
        A = _floor_snap(a[0], a[1], cell)
        B = _floor_snap(b[0], b[1], cell)
        if A == B:
            continue
        e = _canon(A, B)
        agg = out.get(e)
        if agg is None:
            out[e] = dict(d)
        else:
            for c, w in d.items():
                agg[c] = agg.get(c, 0) + w
    return out


def _trace_edge_hist(hist, want_chains):
    """Trace an {edge: {chain: weight}} level into polylines (same walk as
    grid_simplify: junctions/dead-ends first, then leftover pure cycles).
    Per-polyline chain = the weight-majority label along it, ties broken by the
    smallest id so the result is deterministic and cascade-exact."""
    adj = defaultdict(set)
    for a, b in hist:
        adj[a].add(b)
        adj[b].add(a)

    used = set()
    polylines = []
    chains = [] if want_chains else None

    def trace_path(start, first_nbr):
        path = [start]
        path_edges = []
        prev, cur = start, first_nbr
        while True:
            e = _canon(prev, cur)
            if e in used:
                break
            path.append(cur)
            used.add(e)
            path_edges.append(e)
            if len(adj[cur]) != 2:
                break
            nxt = [n for n in adj[cur] if n != prev]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
        return path, path_edges

    def majority(path_edges):
        agg = {}
        for e in path_edges:
            for c, w in hist[e].items():
                agg[c] = agg.get(c, 0) + w
        if not agg:
            return -1
        best = max(agg.values())
        return min(c for c, w in agg.items() if w == best)

    for node in [n for n in adj if len(adj[n]) != 2]:
        for nbr in list(adj[node]):
            if _canon(node, nbr) in used:
                continue
            path, path_edges = trace_path(node, nbr)
            if len(path) >= 2:
                polylines.append(path)
                if want_chains:
                    chains.append(majority(path_edges))

    for e in list(hist):
        if e in used:
            continue
        path, path_edges = trace_path(e[0], e[1])
        if len(path) >= 2:
            polylines.append(path)
            if want_chains:
                chains.append(majority(path_edges))

    return polylines, chains


def grid_simplify_cascade(polylines, cells, chain_ids=None):
    """Produce the whole multi-resolution ladder via a floor-snap dyadic
    cascade: build the finest level from `polylines` once, then derive each
    coarser level from the previous.

    `cells` must be ascending with each cell an integer multiple (2x) of the
    previous, or the coarsen step is not exact. Returns a list of
    (cell, polylines, chain_ids) with chain_ids=None when none were supplied.
    """
    want = chain_ids is not None
    cells = sorted(cells)
    hist = _finest_edge_hist(polylines, cells[0], chain_ids)
    out = []
    for idx, cell in enumerate(cells):
        if idx > 0:
            hist = _coarsen_edge_hist(hist, cell)
        pls, chains = _trace_edge_hist(hist, want)
        out.append((cell, pls, chains))
    return out
