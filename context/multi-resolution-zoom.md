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
- **Candidate complementary strategies**:
  - **Junction merging**: Collapse nearby junctions that form simple bubble patterns (e.g., SNP bubbles = 2 junctions + 1-2 alt paths → 1 node)
  - **Spatial binning**: Group nodes by spatial proximity at coarse zoom levels
  - **Hierarchical bubbles**: Use the existing bubble nesting — a top-level bubble becomes a single node at coarse zoom
- **The bubble hierarchy is likely the right approach**: PangyPlot already computes nested bubbles. At coarse zoom, show only top-level bubbles as single nodes. This naturally produces massive reduction.

## File Map

| File | Purpose |
|------|---------|
| `pangyplot/preprocess/skeleton/graph_simplify.py` | Phase 1 prototype script |
| `context/multi-resolution-zoom.md` | This design doc |

## Prototype Usage

```bash
# Stats only
python -m pangyplot.preprocess.skeleton.graph_simplify \
    --db hprc.clip --chr chrY --ref GRCh38 --no-plot

# Stats + matplotlib visualization
python -m pangyplot.preprocess.skeleton.graph_simplify \
    --db hprc.clip --chr chrY --ref GRCh38

# Custom epsilon levels
python -m pangyplot.preprocess.skeleton.graph_simplify \
    --db hprc.clip --chr chrY --ref GRCh38 \
    --epsilons 1.0 10.0 100.0 500.0
```

Output: `graph_simplification.png` in the current directory.
