# Simplify Viewer — Module Architecture

The simplify viewer (`/simplify`) is a standalone canvas-based visualization for multi-resolution graph skeletons. It was extracted from a 1,350-line monolith into 12 ES modules following the same patterns as the main `static/js/graph/` codebase.

## Module Map

```
pangyplot/static/js/simplify/
├── simplify-app.js        Entry point: init(), wire up modules
├── simplify-state.js      Singleton: shared mutable state + DOM refs + constants
├── simplify-force.js      D3-force simulation for popped chain subgraphs
├── simplify-painter.js    Core app drawing primitives + colors for popped nodes
├── spine.js               Reference spine: coordinate transforms (x↔bp, x→y, bp→step)
├── lod.js                 Auto-LOD: selectLevel(), updateLodDisplay()
├── viewport.js            getViewport(), viewportStepCount(), precomputeBboxes(), fitToScreen()
├── detail.js              Detail fetch, cache, chain popping, phase state machine
├── genes.js               Gene landmarks, placeGenes()
├── hash-navigation.js     URL hash: parse, navigate, debounced update
├── render.js              Main draw(), skeleton pass, detail pass, force graph, gene labels
├── interaction.js         Mouse/wheel handlers, pan/drag, zoom, dblclick, LOD buttons
├── hit-test.js            Chain/bubble hover detection, tooltip formatting
├── physics.js             Legacy bubble ellipse physics (unused, kept for reference)
└── format-utils.js        formatBp(), subtypeColor()
```

## Dependency Graph (DAG)

```
format-utils ──────────────────────────────────────┐
simplify-state ────────────────────────────────────┤
spine ─────────────────────────────────────────────┤
  ↑                                                │
viewport ← state, spine                            │
lod ← state                                        │
genes ← spine                                      │
hash-navigation ← state, spine, viewport           │
hit-test ← state, format-utils                     │
simplify-force ← state, render
render ← state, lod, viewport, genes, format-utils, spine, simplify-force
detail ← state, spine, viewport, format-utils, render, lod, simplify-force
interaction ← state, render, detail, hash-navigation, viewport, spine, format-utils, hit-test, lod
simplify-app ← all modules (entry point)
```

No circular dependencies. `detail → render` is one-way: detail imports `scheduleFrame` and `updateDetailBar` from render; render reads detail state from the shared `state` singleton.

## Key Patterns

### Shared State Singleton (`simplify-state.js`)
- Single `state` object holds all mutable state + DOM references
- DOM elements queried at module load time (type="module" is deferred)
- Config from Jinja via `window.__SIMPLIFY_CONFIG` (set before module loads)
- Same pattern as `appState` in the main graph viewer

### Module-Local State
Some state is private to its module rather than shared:
- `spine.js`: Float64Arrays (spineX, spineBp, spineY, spineStep), chromosome name
- `genes.js`: genePins array (accessed via `getGenePins()`)
- `detail.js`: fadeStartTime, fetchController, fetchTimer
- `render.js`: rafId
- `hash-navigation.js`: hashTimer

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
When the detail layer activates, chains under a complexity threshold (≤50
bubbles) are "popped" — their polyline is replaced by actual bubble-segment
nodes+links from the `/select` API, rendered with d3-force physics and
core pangyplot colors via `simplify-painter.js`.

**Single simulation**: One d3-force simulation for all popped nodes. Chain
polylines and skeleton polylines are NOT in the simulation — they're static
canvas draws.

**Anchoring**: Popped nodes are positioned near their chain's polyline region.
Source/sink segment positions serve as anchor points. Force pulls nodes back
toward these origins on zoom-out.

**Zoom-out collapse**: As the user zooms out, spring forces pull movable nodes
back to their origin positions on the polyline, then the chain reverts to
its polyline representation.

**Complexity gate**: Chains above a node-count threshold stay as polylines
with arrow markers. Only chains simple enough to render clearly get popped.

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
