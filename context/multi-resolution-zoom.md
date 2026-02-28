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

Interactive prototype at `/simplify` for testing the grid simplification pipeline.

### Auto-LOD

The viewer automatically selects the grid level based on zoom:

```
targetCellSize = viewportWidth / 2000
```

This targets ~2000 grid cells across the viewport, keeping resolution high. The finest level whose `cellSize ≤ targetCellSize` is selected.

### Viewport Culling

Per-polyline bounding boxes are precomputed into `Float64Array` on load. During rendering, polylines whose bbox doesn't intersect the viewport (plus margin) are skipped entirely. This bounds the draw count regardless of zoom level.

### Detail-View Transition Indicator

A cyan bracket at the bottom of the canvas shows the ~2 Mb detail-view threshold:
- When the viewport is wider than the bracket, the bracket appears as a dashed outline
- When the viewport narrows below the threshold, the bracket becomes solid and a "DETAIL VIEW" badge appears in the header
- Threshold computed as `totalDataWidth / 30` (≈ 1.4M ODGI units for chrY ≈ 2 Mb)

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
| `pangyplot/preprocess/skeleton/graph_simplify.py` | Simplification script (RDP + grid + export) |
| `pangyplot/templates/simplify.html` | Canvas viewer with auto-LOD |
| `pangyplot/routes.py` | `/simplify` + `/simplify-data` endpoints |
| `pangyplot/static/data/simplify/chrY.json.gz` | Precomputed data (gitignored) |
| `context/multi-resolution-zoom.md` | This design doc |

## Usage

```bash
# Precompute grid mipmap data
python -m pangyplot.preprocess.skeleton.graph_simplify \
    --db hprc.clip --chr chrY --ref GRCh38 \
    --no-plot \
    --export-json pangyplot/static/data/simplify/chrY.json.gz

# Run app, visit http://127.0.0.1:5700/simplify
python pangyplot.py run --db hprc.clip --ref GRCh38

# Stats + matplotlib plot (no viewer export)
python -m pangyplot.preprocess.skeleton.graph_simplify \
    --db hprc.clip --chr chrY --ref GRCh38 --no-plot
```

## Next Steps

- Integrate coarse view into main PangyPlot app (replace standalone viewer)
- Implement view transition: coarse → detail when viewport < ~2 Mb
- Color polylines by path/haplotype density or graph topology
- Support multiple chromosomes
