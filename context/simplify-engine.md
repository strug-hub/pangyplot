# Simplify Viewer — Module Architecture

The simplify viewer (`/simplify`) is a standalone canvas-based visualization for multi-resolution graph skeletons. It was extracted from a 1,350-line monolith into 12 ES modules following the same patterns as the main `static/js/graph/` codebase.

## Module Map

```
pangyplot/static/js/simplify/
├── simplify-app.js        Entry point: init(), wire up modules
├── simplify-state.js      Singleton: shared mutable state + DOM refs + constants
├── spine.js               Reference spine: coordinate transforms (x↔bp, x→y, bp→step)
├── lod.js                 Auto-LOD: selectLevel(), updateLodDisplay()
├── viewport.js            getViewport(), viewportStepCount(), precomputeBboxes(), fitToScreen()
├── detail.js              Detail fetch, cache, phase state machine, fade animation
├── genes.js               Gene landmarks, placeGenes()
├── hash-navigation.js     URL hash: parse, navigate, debounced update
├── render.js              Main draw(), skeleton pass, detail pass, gene labels
├── interaction.js         Mouse/wheel handlers, pan/drag, zoom, dblclick, LOD buttons
├── hit-test.js            Chain/bubble hover detection, tooltip formatting
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
render ← state, lod, viewport, genes, format-utils, spine
detail ← state, spine, viewport, format-utils, render
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
- Cache invalidation on zoom change (>2x ratio)

## Template (`simplify.html`)
- CSS stays inline (consistent with main `index.html`)
- HTML body unchanged
- JS replaced with:
  ```html
  <script>window.__SIMPLIFY_CONFIG = { genome: '{{ genome }}' };</script>
  <script type="module" src="…/simplify-app.js"></script>
  ```

## Next Steps
- Integrate with main app's chromosome selector / navigation
- Share format-utils with main codebase (DRY)
- Add touch event support for mobile
- Consider extracting gene landmarks to server-side annotation data
