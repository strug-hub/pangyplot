# Viewer — Module Architecture

The graph viewer (`/`) is a canvas-based visualization for multi-resolution graph skeletons. Organized into a hierarchy with `skeleton/`, `detail/`, `engines/`, `render/`, `data/`, `ui/`, `utils/`, `debug/` subdirectories (85 files total).

## Module Map

```
pangyplot/static/js/graph/
├── app.js                                 Entry point: init(), wire up modules
├── state.js                               Singleton: shared mutable state + DOM refs + constants
├── render-manager.js                      Top-level draw(), RAF scheduling
├── render/
│   ├── viewport.js                        getViewport(), precomputeBboxes(), fitToScreen()
│   ├── export.js                          SVG + PNG export via right-click context menu
│   └── svg-utils.js                       SVG rendering helpers
├── skeleton/
│   ├── data/
│   │   ├── skeleton-data.js               Skeleton data structures + parsing
│   │   └── skeleton-init.js               Skeleton initialization
│   ├── render/
│   │   ├── skeleton-painter.js            Skeleton LOD layer: polylines, junctions
│   │   ├── skeleton-render-manager.js     Orchestrates skeleton rendering passes
│   │   ├── skeleton-base-overlay.js       Base skeleton overlay drawing
│   │   ├── skeleton-hover-overlay.js      Hover highlight overlay for skeleton
│   │   ├── gene-label-overlay.js          Gene name label rendering
│   │   └── gene-polyline-overlay.js       Gene-colored polyline overdraw
│   └── engines/
│       └── skeleton-hover-engine.js       Skeleton-level hover hit-testing
├── detail/
│   ├── data/
│   │   ├── bubble-meta-cache.js           Batch-fetch + cache bubble metadata
│   │   ├── bubble-unpop-adapter.js        Undo pop, restore parent bubble
│   │   ├── force-data.js                  Canonical force node/link arrays
│   │   ├── polychain-data-cache.js        Cached polychain data store
│   │   ├── pop-debug-log.js               Pop operation debug logging
│   │   ├── pop-tree.js                    Hierarchical undo stack with parent-child tracking
│   │   ├── detail-view-state.js            Segment → owning bubble mapping
│   │   └── polychain/
│   │       ├── polychain-adapter.js       API response → polychain elements
│   │       ├── polychain-fetcher.js       Viewport-based polychain data fetching
│   │       └── polychain-gene-map.js      Gene annotation mapping to polychains
│   ├── model/
│   │   ├── sim-object.js                  Abstract base: ends, interior, resolveEnd
│   │   ├── segment-object.js              Kinked GFA segment (1-20 nodes)
│   │   ├── bubble-object.js               Collapsed poppable bubble
│   │   ├── polychain-container.js         Permanent spine manager (NOT a SimObject)
│   │   ├── polychain-segment.js           Visible chain portion with anchor nodes
│   │   ├── segment-registry.js            Unified Map<segId, SimObject>
│   │   ├── model-manager.js               Coordinator: containers + objects maps
│   │   └── pop-handler.js                 V2 pop orchestrator (SimObject-based)
│   ├── render/
│   │   ├── detail-painter.js              Detail layer: chains, junction nodes/links
│   │   ├── force-render-manager.js        Force graph rendering orchestration
│   │   ├── force-render-debug.js          Force render debug overlays
│   │   ├── highlight-painter.js           Selection highlight rendering
│   │   └── polychain/
│   │       └── polychain-render-manager.js  Polychain-specific rendering
│   └── engines/
│       ├── force-engine.js                D3-force simulation (14 forces)
│       ├── node-hover-engine.js           Force-node-level hover
│       ├── forces/
│       │   ├── pc-settings.js             Shared config object for all forces
│       │   ├── polychain-forces.js        5 chain-shape forces: centroid, loop, parent, smoothing, balloon
│       │   ├── layout-forces.js           ODGI pull + deletion link push
│       │   ├── viewport-forces.js         Viewport freeze
│       │   └── chain-guide-force.js       Soft pull toward parent chain polyline
│       └── polychain/
│           ├── polychain-force-engine.js  Force simulation for polychain graphs
│           └── polychain-hover-engine.js  Polychain hover hit-testing
├── engines/
│   ├── engine-manager.js                  Orchestrator: sets up all interaction engines
│   ├── keyboard-engine.js                 Keyboard shortcuts (Y, U, Ctrl+Z, Escape)
│   ├── lod-engine.js                      LOD level management
│   ├── detail-transition-engine.js        Fade transition between skeleton ↔ detail
│   ├── reference-spine-engine.js          Reference spine coordinate transforms
│   ├── context-menu.js                    Right-click context menu
│   ├── force-interaction-gate.js          Pause/resume force sim during interaction
│   ├── annotation-label-drag-engine.js    Drag gene annotation labels
│   ├── node-search-engine.js              Node search highlighting
│   ├── drag/
│   │   ├── drag-engine.js                 Main drag orchestrator (node + chain modes)
│   │   ├── drag-fix-engine.js             Anchor-on-drag toggle (F key + checkbox)
│   │   ├── centroid-anchor-force.js       D3 force: pins chain centroid, nodes flex
│   │   ├── drag-influence-engine.js       (Disabled) Scroll-wheel influence radius
│   │   ├── drag-influence-force.js        (Disabled) BFS influence force
│   │   ├── drag-influence-render.js       (Disabled) Blue dashed influence circle
│   │   └── drag-lock-render.js            Lock icon rendering for anchored chains
│   ├── navigation/
│   │   ├── pan-zoom-engine.js             Pan, drag, zoom (wheel), dblclick reset, resize
│   │   └── hash-navigation.js             URL hash: parse, navigate, debounced update
│   └── selection/
│       ├── hover-engine.js                Cursor readout + hover hit-test
│       ├── multi-selection-engine.js      Shift+drag rect, X-key pop, Ctrl+click pop, Escape clear
│       └── selection-popup.js             Selection info popup with "Open Bubble View" action
├── data/
│   ├── chromosome-data.js                 Chromosome metadata management
│   ├── chromosome-loader.js               Chromosome data loading
│   ├── custom-annotation-data.js          Custom annotation data management
│   └── gene-data.js                       Gene annotation data management
├── debug/
│   ├── debug-hud.js                       Debug heads-up display
│   ├── debug-orchestrator.js              Debug overlay orchestration
│   └── views/
│       ├── force-vectors.js               Force vector debug visualization
│       └── hit-zones.js                   Hit zone debug visualization
├── ui/
│   ├── polychain-force-settings.js        Runtime force parameter sliders
│   ├── render-settings.js                 Render settings toggles
│   ├── cursor-badge.js                    Cursor badge overlay
│   ├── status-bar.js                      Status bar with viewport info
│   ├── tooltip-formatter.js               Tooltip content formatting
│   ├── ui-bridge.js                       Bridge between viewer and shared UI
│   └── viewport-sync.js                   Viewport synchronization
└── utils/
    ├── frame-scheduler.js                 RAF frame scheduling
    └── geometry.js                        Geometry utilities
```

## Key Dependencies

- `render-manager.js` orchestrates: skeleton-render-manager, detail-painter, polychain-render-manager
- `engine-manager.js` wires: pan-zoom-engine, hover-engine, multi-selection-engine, keyboard-engine, lod-engine, detail-transition-engine, reference-spine-engine, context-menu, drag-engine, node-search-engine, annotation-label-drag-engine, force-interaction-gate
- `skeleton/` is self-contained: own data, render, and engine layers for the coarse zoom level
- `detail/` is self-contained: own data (polychain fetcher/adapter), render, and engines for fine zoom
- `detail/data/polychain/` handles progressive data loading with tile caching
- `detail/model/` contains SimObject hierarchy for unified pop/render model
- All painters import `state.js` for zoom/pan/opacity

## Key Patterns

### Shared State Singleton (`state.js`)
- Single `state` object holds all mutable state + DOM references
- DOM elements queried at module load time (type="module" is deferred)
- Config from Jinja via `window.__GRAPH_CONFIG` (set before module loads)

### Module-Local State
Some state is private to its module rather than shared:
- `engines/reference-spine-engine.js`: spine coordinate transforms (x<->bp, x->y)
- `data/gene-data.js`: gene pins array
- `detail/data/polychain/polychain-fetcher.js`: fetchController, fetchTimer, fetchedRegion
- `engines/navigation/hash-navigation.js`: hashTimer

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

## Template (`index.html`)
- CSS stays inline
- Uses import maps for `@event-bus` and `@app-state` aliases
- JS entry:
  ```html
  <script>window.__GRAPH_CONFIG = { genome: '{{ genome }}' };</script>
  <script type="module" src="…/app.js"></script>
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
- **Budget-based activation**: chains sorted by complexity, greedily filled up to POP_BUDGET for force simulation
- **Force simulation** (`detail/engines/force-engine.js`, `polychain/polychain-force-engine.js`): D3-force for popped chain nodes with anchoring to polyline endpoints
- **Bubble pop/unpop** (`detail/model/pop-handler.js`, `bubble-unpop-adapter.js`): expand individual bubbles within popped chains via SimObject model
- **View state** (`detail-view-state.js`): segment → owning bubble mapping

### Cross-Layer Features
- **Color integration**: all 7 color modes work on the canvas (via eventBus)
- **Gene annotations**: gene table with visibility toggles + custom colors, persisted
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
