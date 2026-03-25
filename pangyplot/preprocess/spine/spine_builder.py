"""Reference spine builder: layout (x, y) ↔ basepair lookup table.

Generates a per-reference spine file that maps layout coordinates to
genomic basepair positions. Separate from skeleton so different references
can have independent spines without rebuilding the skeleton.
"""

import gzip
import json
import os

from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db import db_utils
from pangyplot.version import __version__


def spine_filename(ref):
    """Return the spine filename for a given reference genome."""
    return f"spine.{ref}.json.gz"


def build_reference_spine(step_index, segment_index, stride=50):
    """Build a point cloud mapping layout coordinates to basepair positions.

    Walks each step, computes segment centroid (x, y) and midpoint bp,
    and downsamples by stride for compactness. No monotone filtering —
    the full path trace is preserved so vertical jogs are handled correctly.

    Returns list of [x, y, bp] triples in path order (sorted by bp).
    """
    points = []
    for i in range(len(step_index.segments)):
        sid = step_index.segments[i]
        if sid >= len(segment_index.valid) or not segment_index.valid[sid]:
            continue
        cx = (segment_index.x1[sid] + segment_index.x2[sid]) / 2.0
        cy = (segment_index.y1[sid] + segment_index.y2[sid]) / 2.0
        bp = (step_index.starts[i] + step_index.ends[i]) / 2.0
        points.append((cx, cy, bp))

    # Downsample by stride
    spine = [[round(points[i][0], 1), round(points[i][1], 1), int(points[i][2])]
             for i in range(0, len(points), stride)]

    # Ensure last point is included
    if points:
        last = [round(points[-1][0], 1), round(points[-1][1], 1), int(points[-1][2])]
        if not spine or spine[-1] != last:
            spine.append(last)

    print(f"Reference spine: {len(points)} steps → {len(spine)} sampled points")
    return spine


def export_spine(spine, output_path):
    """Write spine data as gzipped JSON."""
    encoder = db_utils.NumpyJSONEncoder()
    data = {
        "meta": {"version": __version__},
        "spine": spine,
    }
    with gzip.open(output_path, 'wt', encoding='utf-8') as f:
        f.write(encoder.encode(data))

    size_kb = os.path.getsize(output_path) / 1024
    print(f"Exported {output_path} ({size_kb:.0f} KB)")


def generate_spine(chr_dir, ref, segment_index):
    """Build and export spine for a single chromosome + reference."""
    step_index = StepIndex(chr_dir, ref)
    spine = build_reference_spine(step_index, segment_index)
    output_path = os.path.join(chr_dir, spine_filename(ref))
    export_spine(spine, output_path)
    return spine
