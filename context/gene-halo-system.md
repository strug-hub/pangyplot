# Gene Halo System

Gene halos are colored outlines drawn behind graph elements to indicate which parts of the graph overlap with gene annotations. They appear in both the polychain and force-layout detail renderers.

## Data Flow

### 1. Gene Pins (`static/js/graph/data/gene-data.js`)

On chromosome load, gene annotations (from `/genes`) are cached. `placeGenes()` converts each gene's bp range into layout-space coordinates via the reference spine (`bpToLayout`), producing **gene pins**:

```
{ name, startBp, endBp, startX, endX, midX, refY, minY, maxY, color }
```

- Colors are deterministic from gene name (`stringToColor`) or user-customized via the annotation table.
- Pins are repositioned when detail data arrives (`placeGenesFromDetail`) using chain polyline endpoints as bp-to-x anchors.
- During zoom transitions, `blendGenePinsToSpine()` interpolates positions between detail and skeleton placement.

### 2. Gene-Chain Overlap Map (`static/js/graph/detail/data/polychain/polychain-gene-map.js`)

`buildGeneChainOverlaps()` checks each chain's `[bpStart, bpEnd]` against each visible gene's bp range. On overlap, it computes fractional `tStart`/`tEnd` (0-1 along the chain's polyline). Results are cached and keyed by chain identity, gene cache, and visibility state.

**Key filter**: chains with `bpStart == null || bpEnd == null` are skipped entirely (line 37).

### 3. Sub-Polyline Extraction (`extractSubPolyline`)

Given a chain polyline and fractional `[tStart, tEnd]`, interpolates along cumulative arc length to extract only the portion corresponding to the gene.

## Rendering

### Polychain Renderer (`static/js/graph/detail/render/polychain/polychain-render-manager.js`)

`drawGeneOverlays()` is called first in the render pass (before chain polylines). For each chain with gene overlaps, it extracts sub-polylines per gene, batches by color, and strokes at `haloWidth = max(8, bw * 5)` with `opacity * 0.55`.

Uses **bp-based** overlap via `getGeneChainOverlaps()` — correct approach.

### Force Renderer (`static/js/graph/detail/render/force-render-manager.js`)

Renders halos for popped bubble content (nodes + links). Currently uses **screen x-position** overlap:

- **Links**: checks if link midpoint x falls within a gene pin's `[startX, endX]` range
- **Nodes**: checks if `node.x` falls within a gene pin's x range, creates larger circles (`r * 3.5`) behind the node

## Known Issue: Force Renderer Uses Wrong Overlap Method

The force renderer's screen-position check is incorrect and should be replaced with bp-based logic:

- **Problem**: screen x-position says nothing about genomic position. Unrelated segments can land at the same x, producing false-positive halos. Meanwhile, segments that genuinely overlap a gene but render at a different x get no halo.

- **Why it "works" sometimes**: when popping bubbles on a chain that has reference coordinates (like c122), child segments may coincidentally render near the correct x range. But for nested chains like c123 (depth-1, no reference coordinates), the polychain halo is missing entirely while individual popped segments (e.g. s137721) may get false halos from the force renderer.

- **Root cause for nested chains**: `buildGeneChainOverlaps()` skips chains where `bpStart`/`bpEnd` are null. Nested chains (depth > 0) often lack reference coordinates because their segments don't lie on the reference path. Example: c123 on chrY is a depth-1 chain inside super-bubble b7968 on parent chain c122. The parent bubble has reference range ~23.14 Mbp, but c123 itself has null bp coordinates.

### Proposed Fix

Replace the force renderer's screen-position halo logic with chain-based bp overlap:

1. **For nodes/links with a `chainId`**: look up the chain in the gene-chain overlap map (`getGeneChainOverlaps()`). If the chain has gene overlaps, apply the halo. This matches what the polychain renderer does.

2. **For nested chains with null bp coords**: inherit the gene overlap from the parent bubble's chain. If a chain's parent bubble (via the pop tree) belongs to a chain that has gene overlaps, the child chain should inherit those halos. The parent chain c122 knows it overlaps a gene; its child c123 should too.

3. **Remove the `node.x >= pin.startX` screen-position check entirely** — it produces false positives and is architecturally wrong.

### Data Available on Force Nodes

Force nodes (built in `pop-handler.js` via `SegmentObject.fromApiNode`) carry:
- `chainId` — the parent chain they belong to
- `record.seqLength` — sequence length
- `ranges` — step-index pairs `[[step, step], ...]` from `Segment.serialize()` (reference path steps, not bp)
- `isRef` — true if `ranges.length > 0`

The `ranges` are step indices, not bp coordinates. Converting to bp on the client would require the step index arrays. The simpler approach is to use the chain-level overlap map.

## Recent Changes (2026-04-06)

- Halo width increased from `max(4, bw * 2)` to `max(8, bw * 5)` in both renderers
- Halo opacity reduced to `opacity * 0.55` (was full opacity) for a softer glow effect
