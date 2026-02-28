# Multi-Resolution Zoom Design Doc

## Goal

Enable PangyPlot to visualize pangenome graphs at any scale — from whole-chromosome overviews down to individual segments. Currently capped at ~2 Mb regions.

## Architecture: Two-View System

| View | When | Data source |
|------|------|-------------|
| **Coarse view** | Zoomed out beyond detail threshold | RDP-simplified skeleton graph |
| **Detail view** | Zoomed in (current behavior) | Full bubble/segment system |

The coarse view shows a progressively simplified version of the graph. As the user zooms in, the view switches to the existing detail renderer once the region is small enough.

## Core Algorithm: Graph Simplification

### Step 1: Degree Classification

Every segment gets a degree from `LinkIndex.seg_index_counts`:
- **Degree 2** (1 in + 1 out) = "pass-through" → candidate for merging into a polyline
- **Degree != 2** = "junction" (branch, merge, tip, dead-end) → always preserved

### Step 2: Linear Run Extraction

Walk from each junction through consecutive degree-2 segments until hitting another junction. Each run becomes a polyline of ODGI (x, y) centroids.

### Step 3: Ramer-Douglas-Peucker Simplification

Apply RDP at multiple epsilon levels to each polyline. Points whose perpendicular distance from the simplified line is less than epsilon are removed. Endpoints (junctions) are always preserved.

### Step 4: Mipmap Levels

Pre-compute simplified graphs at several epsilon values. At runtime, select the appropriate level based on zoom/viewport size.

## Phase 1 Findings (chrY, hprc.clip)

```
Total segments:             163,806
Total links:                226,807
Junctions (deg != 2):        64,620  (39.4% of segments)
Linear runs:                127,621
  Avg run length:               2.8 segments
  Max run length:                 4 segments
  Median run length:              3 segments

Epsilon    Total nodes    Reduction
0.1        151,617         7.4%
0.5        125,463        23.4%
1.0        113,047        31.0%
5.0         90,598        44.7%
10.0        82,884        49.4%
50.0        69,302        57.7%
100.0       66,324        59.5%
```

### Key Observations

1. **High junction density**: 39.4% of segments are junctions. Pangenome graphs are highly branchy — each variant (SNP, indel) creates branch/merge points.

2. **Short linear runs**: Average 2.8 segments, max 4. This limits the ceiling for pure geometric simplification via RDP, since short polylines can only lose 0–2 interior points.

3. **RDP still effective**: Despite short runs, RDP achieves 23–60% reduction. Even a 2-point interior run can be reduced to 0 if the points are collinear within epsilon.

4. **Diminishing returns above ε ≈ 50**: The curve flattens — 57.7% at ε=50, 59.5% at ε=100. The ~40% floor corresponds to the junction count, which RDP cannot reduce.

5. **Practical sweet spot**: ε = 5–10 gives ~45–50% reduction while preserving graph shape fidelity. Good for a "medium zoom" level.

### Implications for Design

- **RDP alone won't reach 10:1 reduction** needed for whole-chromosome views. The 40% junction floor means we need a complementary strategy.

## Two-Stage Simplification (RDP + Grid)

RDP alone hits a ceiling at ~60% because it can only remove interior points within
linear runs, never junctions. A second stage — **spatial grid snapping** — breaks
through this ceiling by merging nearby junctions.

### Grid Simplification Algorithm

1. Choose a grid cell size (in ODGI coordinate units)
2. Snap all coordinates (junction + interior points) to the nearest grid vertex
3. Remove consecutive duplicate points within each polyline
4. Remove polylines that collapse to a single point
5. Deduplicate junction set

### Grid Results (chrY, hprc.clip)

Applied on top of RDP ε=100 polylines:

```
Cell size       Nodes   Junctions   Polylines   Reduction
Grid 500       24,335      22,820      47,707       85.1%
Grid 1,000     18,745      17,512      36,721       88.6%
Grid 5,000      5,705       5,610      12,027       96.5%
Grid 10,000     2,902       2,875       6,259       98.2%
Grid 50,000       559         557       1,249       99.7%
Grid 100,000      281         281         656       99.8%
```

### Key Findings

- Grid snapping breaks through the junction floor: from 64k junctions
  down to 281 at the coarsest level (99.8% total reduction).
- The graph skeleton remains recognizable at all levels — variation-dense
  regions (PAR, ampliconic) stay visually distinct from the quiet q-arm.
- Combined RDP + grid gives a smooth progression across 3 orders of
  magnitude (113k → 281 nodes) suitable for continuous zoom.

## D3 Canvas Viewer

Interactive prototype at `/simplify` for comparing simplification levels.

### Performance

- **Offscreen canvas**: graph is rendered once to an `OffscreenCanvas`;
  panning blits with `drawImage()` offset (no re-render).
- **`requestAnimationFrame`** throttling: mouse events schedule a single
  frame instead of drawing on every event.
- Re-render triggered only on zoom change or level switch.

### Controls

- **Detail slider**: left = coarsest (Grid 100k), right = finest (RDP ε=1)
- **Mouse wheel**: zoom in/out
- **Click-drag**: pan
- **Double-click**: reset to fit-to-screen

## File Map

| File | Purpose |
|------|---------|
| `pangyplot/preprocess/skeleton/graph_simplify.py` | Simplification script (RDP + grid + export) |
| `pangyplot/templates/simplify.html` | D3 canvas viewer with slider |
| `pangyplot/routes.py` | `/simplify` + `/simplify-data` endpoints |
| `pangyplot/static/data/simplify/chrY.json.gz` | Precomputed data (gitignored) |
| `context/multi-resolution-zoom.md` | This design doc |

## Usage

```bash
# Precompute mipmap data (RDP + grid levels)
python -m pangyplot.preprocess.skeleton.graph_simplify \
    --db hprc.clip --chr chrY --ref GRCh38 \
    --viewer-epsilons --no-plot \
    --export-json pangyplot/static/data/simplify/chrY.json.gz

# Run app, visit http://127.0.0.1:5700/simplify
python pangyplot.py run --db hprc.clip --ref GRCh38

# Stats + matplotlib plot (no viewer export)
python -m pangyplot.preprocess.skeleton.graph_simplify \
    --db hprc.clip --chr chrY --ref GRCh38 --no-plot
```
