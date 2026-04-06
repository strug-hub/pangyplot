# Multi-Resolution Zoom Design Doc

## Goal

Enable PangyPlot to visualize pangenome graphs at any scale — from whole-chromosome overviews down to individual segments. Currently capped at ~2 Mb regions.

## Architecture: Two-View System

| View | When | Data source |
|------|------|-------------|
| **Coarse view** | Zoomed out beyond ~2 Mb viewport | Grid-simplified skeleton graph |
| **Detail view** | Zoomed in below ~2 Mb viewport | Full bubble/segment system |

The coarse view shows a progressively simplified version of the graph. Auto-LOD selects the appropriate grid level based on zoom. As the user zooms in past the detail threshold (~2 Mb), the view switches to the existing detail renderer.

## Core Algorithm: Graph Simplification

### Step 1: Degree Classification

Every segment gets a degree from `LinkIndex` arrays:
- **Degree 2** (1 in + 1 out) = "pass-through" → candidate for merging into a polyline
- **Degree != 2** = "junction" (branch, merge, tip, dead-end) → always preserved

### Step 2: Linear Run Extraction

Walk from each junction through consecutive degree-2 segments until hitting another junction. Each run becomes a polyline of ODGI (x, y) centroids.

### Step 3: Grid-Based Spatial Simplification

Snap all coordinates to a spatial grid and deduplicate:

1. Choose a grid cell size (in ODGI coordinate units)
2. Snap all coordinates (junction + interior points) to the nearest grid vertex
3. Remove consecutive duplicate points within each polyline
4. Remove polylines that collapse to a single point
5. Deduplicate junction set

Pre-compute at multiple grid cell sizes. At runtime, auto-LOD selects the appropriate level based on viewport width.

### Why Grid Instead of RDP

Early experiments with Ramer-Douglas-Peucker simplification showed a ~60% ceiling due to:
- **High junction density**: 39.4% of segments are junctions (pangenome graphs are highly branchy)
- **Short linear runs**: Average 2.8 segments, max 4 — RDP can only remove 0–2 interior points per run
- **Junction floor**: RDP preserves all endpoints (junctions), so it can never reduce below the junction count

Grid snapping breaks through this ceiling by merging nearby junctions, achieving 99%+ reduction at the coarsest levels.

## Phase 1 Findings (chrY, hprc.clip)

### Graph Topology

```
Total segments:             163,806
Total links:                226,807
Junctions (deg != 2):        64,620  (39.4% of segments)
Linear runs:                127,621
  Avg run length:               2.8 segments
  Max run length:                 4 segments
  Median run length:              3 segments
```

### RDP Results (informational — not used in viewer)

```
Epsilon    Total nodes    Reduction
0.1        151,617         7.4%
0.5        125,463        23.4%
1.0        113,047        31.0%
5.0         90,598        44.7%
10.0        82,884        49.4%
50.0        69,302        57.7%
100.0       66,324        59.5%
```

### Grid Results (used in viewer)

```
Cell size       Nodes   Junctions   Polylines   Reduction
Grid 50        79,820      28,862     108,803       51.3%
Grid 100       55,155      24,062      82,073       66.3%
Grid 250       33,143      18,792      54,889       79.8%
Grid 500       24,335      15,494      42,255       85.1%
Grid 1,000     18,745      12,488      33,043       88.6%
Grid 2,500     10,490       8,267      19,802       93.6%
Grid 5,000      5,705       4,889      11,070       96.5%
Grid 10,000     2,902       2,657       5,837       98.2%
Grid 25,000     1,146       1,090       2,433       99.3%
```

### Key Findings

- Grid snapping breaks through the junction floor: from 64k junctions
  down to 1,090 at Grid 25,000 (99.3% total reduction).
- The graph skeleton remains recognizable at all levels — variation-dense
  regions (PAR, ampliconic) stay visually distinct from the quiet q-arm.
- Smooth progression across 2 orders of magnitude (79k → 1.1k nodes)
  suitable for continuous zoom.

## Canvas Viewer

Interactive viewer at `/` using the grid simplification pipeline.

### Auto-LOD

The viewer automatically selects the grid level based on zoom:

```
targetCellSize = viewportWidth / 2000
```

This targets ~2000 grid cells across the viewport, keeping resolution high. The finest level whose `cellSize ≤ targetCellSize` is selected.

Manual LOD override buttons are available in the header to lock to a specific grid level.

### Viewport Culling

Per-polyline bounding boxes are precomputed into `Float64Array` on load. During rendering, polylines whose bbox doesn't intersect the viewport (plus margin) are skipped entirely. This bounds the draw count regardless of zoom level.

### Detail-View Transition Indicator

A cyan bracket at the bottom of the canvas shows the ~2 Mb detail-view threshold:
- When the viewport is wider than the bracket, the bracket appears as a dashed outline
- When the viewport narrows below the threshold, the bracket becomes solid and a "DETAIL VIEW" badge appears in the header
- Threshold computed as `totalDataWidth / 30` (≈ 1.4M ODGI units for chrY ≈ 2 Mb)

### Reference Coordinate Readout

The viewer translates layout-space positions back to genomic coordinates using a **reference spine** — a monotone envelope of `(x, bp, y)` triples from the reference path, downsampled by stride-50.

- **Backend**: `build_reference_spine()` in `graph_simplify.py` walks reference steps, builds a monotone x envelope, downsamples, and exports `[x, bp, y]` triples in the JSON
- **Frontend**: `initSpine()` loads into `Float64Array`s; `xToBp()`, `xToY()`, `bpToX()` use binary search + linear interpolation
- **Viewport readout**: green `chrY:start-end` label in bottom-left shows the genomic range visible on screen
- **Cursor readout**: gray `chrY:pos` label tracks the mouse cursor position in basepairs

### Gene Landmarks

Gene annotations are displayed as colored overlays on the graph, similar to landmarks on a map.

**Data**: 11 real chrY genes from gencode48 (GRCh38): SRY, ZFY, PCDH11Y, AMELY, USP9Y, UTY, NLGN4Y, KDM5D, EIF1AY, RBMY1A1, DAZ1. Positions are hardcoded in the GENES array (will eventually be loaded from the annotation database dynamically).

**Rendering** (all computed at every LOD level, not just coarsest):

1. **Gene body coloring**: Gold overdraw pass — all polylines/junctions are drawn white first, then those within a gene's basepair range are overdrawn in gold. Both x-range and y-proximity to the reference path are checked, so distant branches on non-planar graphs are not falsely colored.
2. **Y-proximity filtering**: `xToY()` finds the reference path's actual y at a given x. Only elements within `cellSize * 3` of that y are colored, preventing false hits on distant diagonal branches that happen to share the same x range.
3. **Extent brackets**: In screen space, gene labels appear with bracket markers. Full bracket `[—]` when the gene spans >6px on screen; single stem `|` when collapsed to a point.
4. **Label pills**: Gene name rendered in a dark pill above the bracket, positioned at the gene midpoint's reference-path y.

### Performance

- **`requestAnimationFrame`** throttling: mouse events schedule a single
  frame instead of drawing on every event.
- **Viewport culling**: only visible polylines and junctions are drawn.
- **Batched rendering**: all polylines drawn in a single `beginPath()/stroke()` call,
  all junctions in a single `beginPath()/fill()` call.

### Controls

- **Mouse wheel**: zoom in/out (centered on cursor)
- **Click-drag**: pan
- **Double-click**: reset to fit-to-screen

## File Map

| File | Purpose |
|------|---------|
| `pangyplot/preprocess/skeleton/generate_skeleton.py` | Skeleton generation (grid simplification) |
| `pangyplot/preprocess/skeleton/skeleton_geometry.py` | Geometry utilities for skeleton |
| `pangyplot/preprocess/skeleton/skeleton_pipeline.py` | Orchestrates full skeleton build pipeline |
| `pangyplot/preprocess/skeleton/export_polychain.py` | Exports polychain + junction data |
| `pangyplot/templates/index.html` | Canvas viewer with auto-LOD |
| `pangyplot/routes.py` | `/` + `/skeleton` endpoints |
| `context/multi-resolution-zoom.md` | This design doc |

## Usage

```bash
# Run app, visit http://127.0.0.1:5700/
python pangyplot.py run --db hprc.clip --ref GRCh38
```

## Next Steps

- Color polylines by path/haplotype density or graph topology
