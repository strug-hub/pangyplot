# Simplify Viewer — Module Architecture

The simplify viewer (`/simplify`) is a standalone canvas-based visualization for multi-resolution graph skeletons. Organized into a core-style hierarchy with `skeleton/`, `detail/`, `engines/`, `render/`, `data/`, `ui/`, `utils/` subdirectories (56 files total).

## Module Map

```
pangyplot/static/js/simplify/
├── simplify-app.js                        Entry point: init(), wire up modules
├── simplify-state.js                      Singleton: shared mutable state + DOM refs + constants
├── render-manager.js                      Top-level draw(), RAF scheduling
├── render/
│   ├── viewport.js                        getViewport(), precomputeBboxes(), fitToScreen()
│   ├── export-simplify.js                 SVG + PNG export via right-click context menu
│   └── simplify-svg-utils.js              SVG rendering helpers
├── skeleton/
│   ├── data/
│   │   ├── skeleton-data.js               Skeleton data structures + parsing
│   │   ├── skeleton-init.js               Skeleton initialization
│   │   └── gene-data.js                   Gene annotation data management
│   ├── render/
│   │   ├── skeleton-painter.js            Skeleton LOD layer: polylines, junctions
│   │   ├── skeleton-render-manager.js     Orchestrates skeleton rendering passes
│   │   ├── skeleton-base-overlay.js       Base skeleton overlay drawing
│   │   ├── skeleton-gene-overlay.js       Gene landmark rendering on skeleton
│   │   └── skeleton-hover-overlay.js      Hover highlight overlay for skeleton
│   └── engines/
│       └── skeleton-hover-engine.js       Skeleton-level hover hit-testing
├── detail/
│   ├── data/
│   │   ├── bubble-pop-adapter.js          Pop response → force simulation nodes
│   │   ├── bubble-unpop-adapter.js        Undo pop, restore parent bubble
│   │   ├── force-data.js                  Force simulation data management
│   │   ├── simplify-view-state.js         Segment → owning bubble mapping (like core viewState)
│   │   └── polychain/
│   │       ├── polychain-adapter.js       API response → polychain elements
│   │       ├── polychain-fetcher.js       Viewport-based polychain data fetching
│   │       ├── polychain-gene-map.js      Gene annotation mapping to polychains
│   │       ├── polychain-tile-cache.js    Tile caching for polychain data
│   │       └── activation-data.js         Budget-based chain activation for force sim
│   ├── render/
│   │   ├── detail-painter.js              Detail layer: chains, junction nodes/links
│   │   ├── force-render-manager.js        Force graph rendering orchestration
│   │   ├── highlight-painter.js           Selection highlight rendering
│   │   ├── physics-debug-painter.js       Physics debug visualization
│   │   └── polychain/
│   │       └── polychain-render-manager.js  Polychain-specific rendering
│   └── engines/
│       ├── force-engine.js                D3-force simulation management
│       ├── node-hover-engine.js           Force-node-level hover
│       └── polychain/
│           ├── polychain-force-engine.js  Force simulation for polychain graphs
│           ├── polychain-hover-engine.js  Polychain hover hit-testing
│           └── polychain-pop-engine.js    Pop/unpop for polychains
├── engines/
│   ├── engine-manager.js                  Orchestrator: sets up all interaction engines
│   ├── keyboard-engine.js                 Keyboard shortcuts (L-key debug, etc.)
│   ├── lod-engine.js                      LOD level management
│   ├── detail-transition-engine.js        Fade transition between skeleton ↔ detail
│   ├── physics-activation-engine.js       Budget-based physics zone activation
│   ├── reference-spine-engine.js          Reference spine coordinate transforms
│   ├── simplify-context-menu.js           Right-click context menu
│   ├── navigation/
│   │   ├── pan-zoom-engine.js             Pan, drag, zoom (wheel), dblclick reset, resize
│   │   └── hash-navigation.js            URL hash: parse, navigate, debounced update
│   └── selection/
│       ├── hover-engine.js                Cursor readout + hover hit-test
│       ├── multi-selection-engine.js      Shift+drag rect, X-key pop, Escape clear
│       └── selection-popup.js             Selection info popup with "Open Bubble View" action
├── data/
│   ├── chromosome-data.js                 Chromosome metadata management
│   └── chromosome-loader.js               Chromosome data loading
├── ui/
│   ├── polychain-force-settings.js        Runtime force parameter sliders
│   ├── status-bar.js                      Status bar with viewport info
│   ├── tooltip-formatter.js               Tooltip content formatting
│   ├── ui-bridge.js                       Bridge between simplify and shared UI
│   └── viewport-sync.js                   Viewport synchronization
└── utils/
    ├── color-hash.js                      Color hashing utilities
    ├── format-utils.js                    formatBp(), subtypeColor()
    ├── frame-scheduler.js                 RAF frame scheduling
    └── geometry.js                        Geometry utilities
```

## Key Dependencies

- `render-manager.js` orchestrates: skeleton-render-manager, detail-painter, polychain-render-manager
- `engine-manager.js` wires: pan-zoom-engine, hover-engine, multi-selection-engine, keyboard-engine, lod-engine, detail-transition-engine, physics-activation-engine, reference-spine-engine, simplify-context-menu
- `skeleton/` is self-contained: own data, render, and engine layers for the coarse zoom level
- `detail/` is self-contained: own data (polychain fetcher/adapter), render, and engines for fine zoom
- `detail/data/polychain/` handles progressive data loading with tile caching and budget-based activation
- All painters import `simplify-state.js` for zoom/pan/opacity
- `selection-popup.js` enables "Open Bubble View" to switch to core viewer for deep inspection

## Key Patterns

### Shared State Singleton (`simplify-state.js`)
- Single `state` object holds all mutable state + DOM references
- DOM elements queried at module load time (type="module" is deferred)
- Config from Jinja via `window.__SIMPLIFY_CONFIG` (set before module loads)
- Same pattern as `appState` in the main graph viewer

### Module-Local State
Some state is private to its module rather than shared:
- `engines/reference-spine-engine.js`: spine coordinate transforms (x↔bp, x→y)
- `skeleton/data/gene-data.js`: gene pins array
- `detail/data/polychain/polychain-fetcher.js`: fetchController, fetchTimer, fetchedRegion
- `engines/navigation/hash-navigation.js`: hashTimer
- `engines/physics-activation-engine.js`: activationSet, adjacency, viewport snapshot

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
- Uses import maps for `@event-bus` and `@app-state` aliases (shared with core)
- JS entry:
  ```html
  <script>window.__SIMPLIFY_CONFIG = { genome: '{{ genome }}' };</script>
  <script type="module" src="…/simplify-app.js"></script>
  ```

## Architecture: Skeleton / Detail Duality

The viewer has two distinct rendering layers that crossfade based on zoom level:

### Skeleton Layer (`skeleton/`)
- Coarse zoom level: polylines representing chain paths + gene landmarks
- Self-contained data/render/engine modules
- Skeleton-specific hover with chain ancestry tooltips
- Gene overlay with hide/show + custom color persistence

### Detail Layer (`detail/`)
- Fine zoom level: polychains with bubble-segment graph subgraphs
- **Polychain system** (`detail/data/polychain/`): chains rendered as polylines with RDP simplification, fetched via `/detail-tiles` API with tile caching
- **Budget-based activation** (`activation-data.js`): chains sorted by complexity, greedily filled up to POP_BUDGET for force simulation
- **Force simulation** (`detail/engines/force-engine.js`, `polychain/polychain-force-engine.js`): D3-force for popped chain nodes with anchoring to polyline endpoints
- **Bubble pop/unpop** (`bubble-pop-adapter.js`, `bubble-unpop-adapter.js`, `polychain-pop-engine.js`): expand individual bubbles within popped chains
- **View state** (`simplify-view-state.js`): segment → owning bubble mapping, like core viewer's viewState

### Cross-Layer Features
- **Color integration**: all 7 core color modes work on the simplify canvas (via eventBus)
- **Gene annotations**: gene table with visibility toggles + custom colors, persisted
- **Bubble view switching**: selection popup offers "Open Bubble View" to switch to core viewer
- **SVG/PNG export**: right-click context menu for canvas export
- **Force settings UI** (`ui/polychain-force-settings.js`): runtime parameter sliders
- **Junction graph**: naked GFA segments between chains rendered with physics

---

## Detail Layer Implementation Notes

### Data Fetching (`polychain-fetcher.js`)
- Single-viewport fetch for the entire visible region (plus 30% margin) in **layout coordinates**
- `fetchedRegion` tracks last buffered region; no re-fetch while viewport stays inside
- `AbortController` cancels in-flight requests before starting new ones
- Tile cache (`polychain-tile-cache.js`) for recently-fetched regions

### Chain Hierarchy
- Backend decomposes large chains (e.g. c122 → c122_r1, c122_r2, c123…)
- Child chains carry `parent_chain` field in API response
- Tooltips walk ancestry chain: `"c122_r1 > c122 > c5"`

### Junction Graph
- Naked GFA segments between chains are fetched as part of `/detail-tiles` response
- `find_junction_graph()` in backend does BFS from chain endpoints through non-bubble segments
- Frontend renders junction segments with physics simulation
- `junction_seg_chains` maps junction segment IDs to adjacent chain IDs for link resolution

### Skeleton Opacity
When detail mode is active, skeleton fades to `skeletonOpacity = 0.06` (floor).
