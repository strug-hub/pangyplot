# Simplify Viewer — Module Architecture

The simplify viewer (`/simplify`) is a standalone canvas-based visualization for multi-resolution graph skeletons. Restructured from 17 flat files into a core-style hierarchy with `render/`, `engines/`, `data/`, `lod/`, `utils/` subdirectories (24 files total).

## Module Map

```
pangyplot/static/js/simplify/
├── simplify-app.js                   Entry point: init(), wire up modules
├── simplify-state.js                 Singleton: shared mutable state + DOM refs + constants
├── render/
│   ├── render-manager.js             Main draw(), RAF scheduling, detail bar DOM update
│   ├── viewport.js                   getViewport(), precomputeBboxes(), fitToScreen()
│   ├── painter/
│   │   ├── skeleton-painter.js       Skeleton LOD layer: polylines, junctions, gene overdraw
│   │   ├── detail-painter.js         Detail layer: chains, junction nodes/links, selections
│   │   ├── force-painter.js          Force graph: D3 simulation nodes + links
│   │   └── simplify-painter.js       Core app drawing primitives + colors for popped nodes
│   └── annotation/
│       └── gene-label-renderer.js    Gene landmarks + screen-space label rendering
├── engines/
│   ├── engine-manager.js             Orchestrator: sets up all interaction engines
│   ├── keyboard-engine.js            L-key physics debug toggle
│   ├── navigation/
│   │   ├── pan-zoom-engine.js        Pan, drag, zoom (wheel), dblclick reset, resize
│   │   └── hash-navigation.js        URL hash: parse, navigate, debounced update
│   ├── selection/
│   │   ├── hover-engine.js           Cursor readout + hover hit-test
│   │   └── multi-selection-engine.js Shift+drag rect, X-key pop, Escape clear, C-key toggle
│   └── bubble-pop/
│       └── chain-pop-engine.js       Pop/unpop state machine, fade animation, seed force
├── data/
│   ├── detail-fetcher.js             Single-viewport fetch, response parsing, debounced trigger
│   ├── detail-adapter.js             API response → core elements for force simulation
│   ├── detail-tile-cache.js          TileCache class (bp-space tile caching)
│   ├── simplify-force.js             D3-force simulation for popped chain subgraphs
│   └── spine.js                      Reference spine: coordinate transforms (x↔bp, x→y)
├── lod/
│   ├── lod.js                        Auto-LOD: selectLevel(), grid meter display
│   └── physics-zone.js               BFS activation zone debug overlay
└── utils/
    ├── hit-test.js                   Chain/bubble/skeleton hover detection, tooltip formatting
    └── format-utils.js               formatBp(), subtypeColor()
```

## Key Dependencies

- `render-manager.js` orchestrates: skeleton-painter, detail-painter, gene-label-renderer, physics-zone
- `detail-fetcher.js` ↔ `chain-pop-engine.js` have a circular import (safe: no top-level calls)
- `engine-manager.js` wires: pan-zoom-engine, hover-engine, multi-selection-engine, keyboard-engine
- All painters import `simplify-state.js` for zoom/pan/opacity
- Force simulation (`data/simplify-force.js`) imported by force-painter and chain-pop-engine

## Key Patterns

### Shared State Singleton (`simplify-state.js`)
- Single `state` object holds all mutable state + DOM references
- DOM elements queried at module load time (type="module" is deferred)
- Config from Jinja via `window.__SIMPLIFY_CONFIG` (set before module loads)
- Same pattern as `appState` in the main graph viewer

### Module-Local State
Some state is private to its module rather than shared:
- `data/spine.js`: Float64Arrays (spineX, spineBp, spineY, spineStep), chromosome name
- `render/annotation/gene-label-renderer.js`: genePins array (accessed via `getGenePins()`)
- `data/detail-fetcher.js`: fadeStartTime, fetchController, fetchTimer, fetchedRegion
- `render/render-manager.js`: rafId
- `engines/navigation/hash-navigation.js`: hashTimer
- `lod/physics-zone.js`: activationSet, adjacency, viewport snapshot

### Side-Effect-Free Viewport Functions
`resizeCanvas()` and `fitToScreen()` do not call `scheduleFrame()`. Callers are responsible for triggering redraws. This prevents render↔viewport cycles.

### Phase State Machine (detail.js)
```
none → fading-in → static
 ↑         ↓
 └── fading-out ←──┘
```
- RAF-driven fade animation independent of user interaction
- Time-based lerp (FADE_DURATION = 600ms)
- Cache invalidation when skeleton LOD level changes (expand threshold changes)

## Template (`simplify.html`)
- CSS stays inline (consistent with main `index.html`)
- HTML body unchanged
- JS replaced with:
  ```html
  <script>window.__SIMPLIFY_CONFIG = { genome: '{{ genome }}' };</script>
  <script type="module" src="…/simplify-app.js"></script>
  ```

## Detail Layer: Progressive Chain-to-Graph Zoom

The detail layer is a progressive zoom system where chain polylines serve as
placeholders that get replaced by actual bubble-segment graph views as the
user zooms in. The goal is a seamless visual transition from skeleton → chains
→ full pangyplot graph.

### Three Canvas Layers (back to front)

1. **Skeleton polylines** — static, faded when detail is active
2. **Chain polylines** — static, for chains too complex to expand
3. **Force-simulated nodes+links** — for "popped" chains showing their
   internal bubble-segment graph

### Chain Polylines (placeholder layer)
- **Uniform thickness**: `Math.max(1.5, 3 / zoom)` — matches skeleton
- **RDP simplification** applied. Walks min_step to max_step at adaptive stride
- Expand threshold derived from skeleton's current `cellSize * 2`
- Chains too complex to pop (>50 bubbles) stay as polylines

### Chain Popping (graph layer)
When the detail layer activates, chains under a complexity threshold (budget
of 2000 total bubbles) are "popped" — their polyline is replaced by actual
bubble-segment nodes+links from the `/select` API, rendered with d3-force
physics and core pangyplot colors via `simplify-painter.js`.

**Single simulation**: One d3-force simulation for all popped nodes. Chain
polylines and skeleton polylines are NOT in the simulation — they're static
canvas draws. A faint dashed guide polyline is drawn behind popped chains
to show the chain path.

**Anchoring**: Source/sink nodes of each popped chain are pinned (`fx`/`fy`)
to the chain polyline endpoints. This physically connects the expanded
bubble subgraph to the adjacent chain polylines. Interior nodes are held
by link forces between the pinned endpoints + weak anchor forces toward
their ODGI layout centroids. Diamond indicators mark anchor points.

**Zoom-out collapse**: On zoom-out, `collapseToAnchors()` releases fixed
positions and increases anchor force strength (0.6), pulling all nodes back
to their home positions. After 400ms settling, the detail layer fades out.
If the user zooms back in during collapse, `restoreAnchors()` re-pins the
anchor nodes and restores normal force strength.

**Complexity gate**: Chains are sorted by bubble count (smallest first) and
greedily filled up to the POP_BUDGET (2000). Connector chains are excluded.

### Implementation Pieces

**Piece 1 — Force simulation infrastructure**
Add an empty d3-force simulation to the simplify canvas. Skeleton and chain
polylines render unchanged. The simulation exists but has no nodes yet.
New module: `simplify-force.js`.

**Piece 2 — Chain popping: data fetch**
When detail activates, for each chain under a complexity threshold, fetch its
bubble-segment subgraph via existing API endpoints. Batch if possible.
Store popped graph data alongside chain polyline data.

**Piece 3 — Node+link rendering on canvas**
Draw popped nodes (circles/rects) and links (lines) on the canvas in the
same data-space transform as the skeleton. Use existing color/sizing logic
from the main app's painters where possible (imported, not copied).

**Piece 4 — Force anchoring and zoom-out collapse**
Add anchor forces that pin popped nodes to their chain polyline region.
On zoom-out past the detail threshold, increase anchor strength to collapse
nodes back onto the polyline, then swap to polyline representation.

### Design Constraints
- **No changes to core pangyplot app** — this is a sandbox experiment
- **Reuse existing API endpoints** (`/select`, `/pop`) — no new backend routes
- **d3.js already loaded** in `simplify.html` template
- **Canvas-based rendering** — consistent with skeleton, no SVG/WebGL

## Next Steps
- Integrate with main app's chromosome selector / navigation
- Share format-utils with main codebase (DRY)
- Add touch event support for mobile
- Consider extracting gene landmarks to server-side annotation data

---

## Detail Layer: Single Viewport Fetch + Visual Connectivity

### Single Viewport Fetch (replaced tile grid)

`detail.js` previously fetched fixed-width tiles and stitched them with a `TileCache`. This caused chain splitting at tile boundaries — the decomposition ran independently per tile, so the same chain could appear differently on each side of a boundary.

**Replacement**: one fetch for the entire visible region (plus 30% margin).

- Module-level `fetchedRegion = { minX, maxX, chr, expandThreshold }` tracks the last buffered region in **layout coordinates** (not bp). No re-fetch while the viewport stays inside this region.
- bp conversion happens only at the moment the API URL is built.
- On pan past the 30% margin, a new single fetch fires and replaces all chain data atomically — no boundary artifacts.
- `clearDetailState()` resets `fetchedRegion` and `state.detailData` together.
- `fetchController` (AbortController) cancels any in-flight request before starting a new one.

### Chain Hierarchy: `parent_chain` Field

When the backend decomposes a large chain (e.g. c122 → c122_r1, c122_r2, c123, c621…), child chains and connector runs now carry `parent_chain: "c122"` in the API response.

- Set in `_decompose_chain()` for child chains from expanded superbubbles.
- Set in `_build_connector()` for leaf-bubble connector runs.
- Parsed in `detail.js` `processResponse()` as `parentChain`.

### Visual Gap-Fillers (dashed lines between siblings)

`render.js drawDetail()` groups chains by `parentChain`, sorts each sibling group by first-point x, then draws dashed grey lines from the last point of each sibling to the first point of the next. This bridges the visual gap at chain boundaries where the parent chain was decomposed.

```js
// In drawDetail():
const byParent = new Map();
for (const chain of state.detailData.chains) {
    if (!chain.parentChain) continue;
    ...
}
// Sorted by polyline[0][0], dashed from aPl[-1] to bPl[0]
```

Style: `strokeStyle '#aaa'`, `lineWidth max(0.8, 1.8/zoom)`, `globalAlpha 0.5`.

### Inter-Chain Connectors (naked GFA segments)

Some top-level chains (e.g. c625, c82, c371) have no shared `parentChain` but are visually adjacent in the skeleton because they are connected via short naked GFA segments — segments not owned by any bubble.

**Backend** (`query.py: _find_inter_chain_connectors`):
- Builds a map of all chain endpoint segments (both `source_segs` and `sink_segs` of all returned chains).
- For each chain, BFS **undirected** (all GFA neighbors, not just forward) from each endpoint segment through naked segments (`bubbleidx.segment_in_bubble(nxt) is None`).
- Stops when reaching another chain's endpoint segment — records a connector polyline from the path segment centroids.
- Deduplicates chain pairs with `tuple(sorted([from_chain_id, to_chain_id]))`.
- MAX_HOPS = 8.
- Result appended to `/detail-tiles` response as `"inter_connectors"`.

Why undirected: GFA strand orientation doesn't reliably align with the chain's visual left→right direction; a forward BFS from sink_segs misses connections that flow "backward" through junction segments.

**Frontend** (`render.js`):
- Draws connector polylines before chain polylines (underneath).
- **Extends** each connector to the nearest endpoint of the `from_chain` and `to_chain` rendered polylines (using squared-distance comparison), so connector lines visually attach to the chain polyline tips rather than stopping at the raw segment centroid.

```js
const nearestEnd = (pl, pt) =>
    dist2(pl[0], pt) <= dist2(pl[pl.length-1], pt) ? pl[0] : pl[pl.length-1];
// draws: chain_A_endpoint → [naked seg centroids] → chain_B_endpoint
```

Style: `strokeStyle '#888'`, `lineWidth max(0.8, 1.8/zoom)`, `globalAlpha 0.5`, solid line.

### Chain Ancestry in Tooltips

`hit-test.js formatTooltip()` walks the ancestry chain when hovering a detail-mode chain:
1. Start with `chain.parentChain` (the decomposition parent, e.g. `"c122"`)
2. Walk `state.data.chainMeta[numId].parent` to climb the skeleton hierarchy
3. Builds a string like `"c122_r1 > c122 > c5"` matching skeleton hover tooltip style.

### Skeleton Opacity in Detail Mode

When detail mode is active, the skeleton fades to `skeletonOpacity = 0.06` (floor), giving the detail chains visual priority while keeping the skeleton as a faint reference.
