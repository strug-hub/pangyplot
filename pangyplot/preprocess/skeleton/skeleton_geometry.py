"""Spatial simplification algorithms for skeleton building."""

import math


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

def grid_simplify(polylines, cell_size, chain_ids=None):
    """Snap all coordinates to a spatial grid and deduplicate.

    This merges nearby points (which RDP cannot do), enabling much
    coarser simplification levels. A polyline whose endpoints snap to the
    same grid cell collapses and is removed.

    If chain_ids is provided (parallel to polylines), it is filtered in sync.
    Returns new_polylines or (new_polylines, new_chain_ids).
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

    if chain_ids is not None:
        return new_polylines, new_chain_ids
    return new_polylines
