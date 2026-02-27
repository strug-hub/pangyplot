# JavaScript Engine Style Guide

Rules and conventions for PangyPlot's frontend graph engine. An agent or reviewer can check code against these rules to identify violations.

---

## File Organization

### Directory structure

```
static/js/
├── d3/                          # Third-party libraries (vendored, never edit)
├── debug/                       # Debug-only utilities
├── graph/                       # Core graph engine
│   ├── force-graph.js           # Entry point
│   ├── app-state.js             # Global app state singleton
│   ├── data/                    # Data layer
│   │   ├── data-manager.js      # Coordinates data flow
│   │   ├── view-state.js        # Segment→visual node mapping
│   │   ├── graph-data/          # Graph data lifecycle (add/remove/replace)
│   │   └── records/             # Record classes and deserialization
│   │       ├── objects/         # Record classes (NodeRecord, LinkRecord, etc.)
│   │       ├── deserializer/    # JSON→Record conversion
│   │       └── fetch/           # API call functions
│   ├── engines/                 # Feature engines (one per interaction)
│   ├── forces/                  # D3 force customizations
│   ├── render/                  # Canvas rendering pipeline
│   │   ├── painter/             # Drawing primitives
│   │   ├── color/               # Color state and style resolution
│   │   ├── annotation/          # Gene/custom label rendering
│   │   ├── highlight/           # Selection/hover highlight rendering
│   │   └── settings/            # Render configuration
│   ├── ui/                      # Graph-panel UI managers
│   └── utils/                   # Graph utilities (distance, node finding)
├── ui/                          # Page-level UI (tabs, cytoband, modals)
└── utils/                       # Global utilities (event bus, network, labels)
```

### File naming

- Use `kebab-case.js` for all files. Never use camelCase or PascalCase in filenames.
- Name files by their primary export's role:

| Suffix | Role | Example |
|--------|------|---------|
| `-engine.js` | Feature engine (interaction handler) | `bubble-pop-engine.js`, `drag-engine.js` |
| `-state.js` | State singleton | `app-state.js`, `color-state.js`, `view-state.js` |
| `-manager.js` | Coordinator/aggregator | `engine-manager.js`, `data-manager.js` |
| `-record.js` | Record class | `node-record.js`, `link-record.js` |
| `-utils.js` | Pure utility functions | `network-utils.js`, `node-utils.js` |
| `-render.js` / `-renderer.js` | Render-specific logic | `highlight-selection-renderer.js` |
| `-painter.js` | Canvas drawing functions | `basic-node-painter.js`, `painter-utils.js` |

### One concern per file

- Each engine, state object, record class, or utility module lives in its own file.
- Never combine multiple engines or multiple record classes in one file.
- Exception: closely related record classes in the same hierarchy may share a file (e.g. `NodeRecord`, `BubbleRecord`, `SegmentRecord` in `node-record.js`).

---

## Module System

### ES modules only

- All files use ES module `import`/`export`. No CommonJS (`require`/`module.exports`). No AMD.
- No bundler. Files are loaded directly as ES modules by the browser via `<script type="module">`.

### Import style

- Always use **relative paths** with the `.js` extension. Never omit the extension.
- Never use bare specifiers (e.g., `import x from 'utils'`). Always specify the full relative path.

```javascript
// Correct
import appState from '../../app-state.js';
import { fetchData, buildUrl } from '../../../../utils/network-utils.js';

// Wrong — missing extension
import appState from '../../app-state';

// Wrong — bare specifier
import appState from 'app-state';
```

### Export style

- Use **default export** for the primary export of a module (setup functions, singletons, classes).
- Use **named exports** for modules that export multiple related items (utility functions, constants, multiple classes from one file).
- Never mix default and named exports from the same module unless unavoidable.

```javascript
// Singleton — default export
const appState = { ... };
export default appState;

// Setup function — default export
export default function setUpEngineManager(forceGraph) { ... }

// Multiple utilities — named exports
export function buildUrl(base, params) { ... }
export async function fetchData(url) { ... }

// Multiple record classes — named exports
export class BubbleRecord extends NodeRecord { ... }
export class SegmentRecord extends NodeRecord { ... }
```

### No circular imports

- Circular `import` dependencies are forbidden. If module A imports module B, module B must not import module A (directly or transitively).
- The `app-state.js` singleton exists specifically to break circular dependencies. State that would otherwise create circular imports must live in `app-state.js` or another shared singleton.

---

## State Management

### Singletons

All shared state lives in singleton objects exported as default exports. There are four:

| Singleton | File | Purpose |
|-----------|------|---------|
| `appState` | `graph/app-state.js` | Global app state: coords, selected/highlighted nodes, mode, drag |
| `viewState` | `graph/data/view-state.js` | Maps segment IDs → visual NodeRecord (for link resolution) |
| `colorState` | `graph/render/color/color-state.js` | Color configuration: style, palette, background |
| `selectionState` | `graph/engines/selection/selection-state.js` | Selection mode flags: multiSelect, chainMode |

### Mutation rules

- **Never mutate singleton properties directly** from outside the singleton. Always use setter methods.
- Setters must **short-circuit on no-op** (skip publish if value hasn't changed).
- Setters that affect other modules must **publish an event** via `eventBus` after mutating.

```javascript
// Correct — setter with event
setSelected(nodes) {
    if (this.selected.contains(nodes)) return;  // short-circuit
    this.selected.clear();
    this.selected.addAll(nodes);
    eventBus.publish('graph:selection-changed', nodes);
},

// Wrong — direct mutation from outside
appState.selected.clear();
appState.selected.addAll(nodes);
```

- Exception: `hoveredNode` is set directly (`appState.setHoveredNode(node)`) without an event because hover updates are high-frequency and consumed synchronously in the render loop.

### No global mutable variables

- Do not store shared state in module-level `let`/`var` variables. Put it in a singleton.
- Module-level `const` for constants (thresholds, config) is fine.
- Closure-scoped `let`/`var` within a `setUp*` function is acceptable for engine-local state (drag start position, queue, etc.) that no other module needs.

---

## Event Bus

### Pattern

The event bus (`utils/event-bus.js`) is a simple pub/sub object:

```javascript
eventBus.subscribe(eventName, callback);
eventBus.publish(eventName, data);
```

### Event naming

- Use the format `domain:action-description` with a colon separator and kebab-case action.
- The `domain` is either `graph` (engine-level) or `ui` (user interface level).

| Event | Published by | Data |
|-------|-------------|------|
| `graph:selection-changed` | `appState.setSelected()` | node array or null |
| `graph:highlighted-changed` | `appState.setHighlighted()` | node array or null |
| `graph:dragged-changed` | `appState.setDraggedNode()` | node or null |
| `graph:bubble-popped` | bubble-pop engine | forceGraph |
| `graph:bubble-unpopped` | data-manager (undo) | forceGraph |
| `graph:data-replaced` | data-manager | forceGraph |
| `graph:mode-changed` | modes-engine | mode string |
| `ui:construct-graph` | navbar/coordinates | coords object |
| `ui:coordinates-changed` | coordinates panel | coords object |

### Rules

- **Never create ad-hoc event names** without documenting them in this table. New events should follow the `domain:action` format.
- **Never publish from a subscriber callback** for the same event (would cause infinite loop). Cross-event publishing is fine.
- Subscribers must not throw. If a subscriber can fail, wrap it in try/catch internally.

---

## Record Classes

### Hierarchy

```
GraphObjectRecord (abstract base)
├── NodeRecord (abstract)
│   ├── BubbleRecord
│   └── SegmentRecord
└── LinkRecord

AnnotationRecord (abstract base)
├── GeneRecord
└── CustomAnnotationRecord
```

### Abstract class enforcement

- Abstract classes must throw in their constructor if instantiated directly:

```javascript
export default class GraphObjectRecord {
    constructor() {
        if (new.target === GraphObjectRecord) {
            throw new Error("Cannot instantiate abstract class GraphObjectRecord directly.");
        }
    }
}
```

- Never instantiate `GraphObjectRecord` or `NodeRecord` directly. Always use the concrete subclass.

### Constructor conventions

- Record constructors accept `rawData` (the raw JSON from the API) as their first argument.
- Field mapping from `snake_case` API names to `camelCase` JS properties happens **only** in the constructor. Never remap fields elsewhere.

```javascript
// Correct — in constructor
this.chainStep = rawBubble.chain_step;
this.sourceSegs = rawBubble.source_segs || [];

// Wrong — remapping at call site
const chainStep = rawPop.chain_step;
```

### Required fields

Every record must set these in its constructor:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Prefixed entity ID (`"s42"`, `"b107"`) |
| `type` | string | `"segment"`, `"bubble"`, or `"link"` |
| `elements` | `{nodes: [], links: []}` | Visual D3 elements (set after construction) |

### Record storage

- Records are stored in module-level `Map` objects in `records-manager-implementation.js`:
  - `nodeRecordLookup: Map<id, NodeRecord>`
  - `linkRecordLookup: Map<id, LinkRecord>`
  - `nodeAdjacencyLookup: Map<nodeId, Set<linkId>>`
  - `geneRecordLookup: Map<id, GeneRecord>`
- Access records through `recordsManager.getNode(id)` / `recordsManager.getLink(id)`. Never read the Maps directly from outside the records module.

---

## ID Conventions

### ID formats

| Object | Internal ID | Instance ID (iid) |
|--------|------------|-------------------|
| Segment | `"s42"` | `"s42#0"` (kink index) |
| Bubble | `"b107"` | `"b107#0"` (kink index) |
| Chain link | `"chain_b1_b2"` | same as id |
| Inter-node link | `"s1+s2+"` (strand composite) | `"s1#2+s2#0+"` (kink-level) |
| Kink-internal link | same as node id | `"s42#0+s42#1+"` |
| Deletion link | `"del_b107"` | same as id |

### Rules

- **`id`** identifies a logical record. Multiple D3 nodes may share the same `id` (one per kink).
- **`iid`** (instance ID) is unique per D3 element. It is what D3 uses as the node key (`.nodeId("iid")`).
- The `iid` format for nodes is `{id}#{kinkIndex}`. For links it is `{sourceIid}{strand}{targetIid}{strand}`.
- **Never use `id` where `iid` is expected** (e.g., as `source`/`target` in link elements). D3 resolves links by `iid`.
- When stripping the prefix from an API ID (e.g., `"s42"` → `"42"`), use `.slice(1)`. Never use `.replace("s", "")` (would break IDs like `"s1s2"`).

### Prefix conventions

- `s` = segment, `b` = bubble, `c` = chain. These match the backend serialization prefixes.
- Segment IDs from the API always arrive with the `s` prefix. When passing to `viewState.resolve()`, pass the **plain integer** (no prefix).

```javascript
// Correct
const segId = rawLink.source.slice(1);     // "s42" → "42"
viewState.resolve(segId);

// Wrong — passing prefixed ID to viewState
viewState.resolve(rawLink.source);          // "s42" — wrong
```

---

## Element Creation (Deserialization)

### Two-phase creation

Record creation and element creation are always two separate steps:

1. **Create records** from raw API data (constructors).
2. **Create elements** from records (`createNodeElements()`, `createLinkElements()`).

Never create elements in a record constructor. Never create records in an element factory.

```javascript
// Phase 1: records
const nodeRecords = deserializeNodes(rawGraph.nodes);

// Phase 2: elements (after records are stored and viewState is set up)
for (const nodeRecord of nodeRecords) {
    nodeRecord.elements = createNodeElements(nodeRecord);
}
```

### Node elements (kinks)

- A single `NodeRecord` may produce **multiple D3 nodes** (kinks) based on sequence length.
- Kink count is calculated by `calculateNumberOfKinks(seqLength)`: 1 for short sequences, up to `MAX_KINKS` for long ones.
- Internal kink-to-kink links have `class: "node"` (not `"link"`). This distinguishes them from inter-node links in rendering.

### Element shape

Every node element must include these fields:

| Field | Type | Purpose |
|-------|------|---------|
| `isNode` / `isLink` | boolean | Type discriminator for rendering |
| `class` | `"node"` or `"link"` | Rendering category |
| `id` | string | Record ID (shared across kinks) |
| `iid` | string | Unique instance ID (D3 key) |
| `record` | Record | Back-reference to the owning record |
| `type` | string | `"segment"`, `"bubble"`, `"link"`, `"chain"` |
| `x`, `y` | number | Position |
| `isVisible` | boolean | Viewport culling flag |
| `isDrawn` | boolean | Render flag |
| `width` | number | Render size |

Every link element must additionally include:

| Field | Type | Purpose |
|-------|------|---------|
| `source` | string | Source node's `iid` |
| `target` | string | Target node's `iid` |
| `sourceId` | string | Source record's `id` |
| `targetId` | string | Target record's `id` |
| `length` | number | Spring length for D3 force |
| `isDel` | boolean | Deletion link flag |

### Return format

Element factories always return `{nodes: [], links: []}`. Even if one array is empty, include it.

```javascript
// Correct
return { nodes: [], links: [linkElement] };

// Wrong — missing nodes key
return { links: [linkElement] };
```

---

## Link Resolution

### ViewState

`viewState` maps segment IDs to the `NodeRecord` that visually represents them. When a bubble is collapsed, its internal segments resolve to the bubble's record. When expanded, they resolve to themselves or to child bubbles.

### Resolution rules

- Raw API links are always `s→s` (segment-to-segment). The frontend resolves them to visual endpoints using `viewState`.
- Resolution order: `viewState.resolve(segId)` first, then `recordsManager.getNode("s" + segId)` as fallback.
- If either endpoint is null, skip the link.
- If both endpoints resolve to the **same record**, skip the link (self-loop).
- Deduplication: track seen `sourceId|targetId` pairs. Skip duplicates.
- Chain links take priority over regular links between the same node pair.

### ViewState write order

When registering a bubble's segments, write in this order: inside segs, then sink segs, then source segs. Source segs win for shared boundary segments (last write wins).

```javascript
// Correct order (view-state.js:registerBubble)
for (const segId of insideSegs)  this.segmentToNode.set(String(segId), bubbleRecord);
for (const segId of sinkSegs)    this.segmentToNode.set(String(segId), bubbleRecord);
for (const segId of sourceSegs)  this.segmentToNode.set(String(segId), bubbleRecord);
```

---

## Engine Pattern

### Structure

Each feature engine is a setup function that registers event listeners and subscribes to events:

```javascript
export default function setUpMyEngine(forceGraph) {
    // Register DOM listeners
    forceGraph.element.addEventListener('pointerdown', (event) => { ... });

    // Subscribe to events
    eventBus.subscribe('graph:data-replaced', () => { ... });

    // Expose methods on forceGraph if needed
    forceGraph.myAction = () => { ... };
}
```

### Rules

- Every engine's setup function takes `forceGraph` as its sole argument.
- Engines register listeners on `forceGraph.element`, not on `document` or `window` (exception: keyboard listeners that need to work when the graph is focused).
- Engines must **gate actions on the current mode** before executing. Use `appState.isSelectionMode()`, `appState.isBubblePopMode()`, etc.

```javascript
// Correct — check mode before acting
function attemptSelection(event, forceGraph) {
    if (!canSingleSelect()) return;
    // ...
}

// Wrong — no mode check
function attemptSelection(event, forceGraph) {
    appState.setSelected([hoveredNode]);
}
```

- Engines must not directly read or write another engine's local state. Cross-engine communication goes through `appState`, `eventBus`, or `forceGraph` methods.

### Event listeners

- Use **pointer events** (`pointerdown`, `pointermove`, `pointerup`) for mouse/touch input. Never use `mousedown`/`mousemove`/`mouseup`.
- Use `event.button !== 0` to filter non-left-clicks in `pointerup` handlers.
- Always call `event.preventDefault()` for `contextmenu` to suppress the browser menu.
- Always call `event.preventDefault()` for `wheel` on the graph canvas.

---

## API Communication

### Fetch pattern

- All API calls go through `fetchData()` from `utils/network-utils.js`. Never call `fetch()` directly.
- URL construction goes through `buildUrl(endpoint, params)`. Never construct URLs with string concatenation.
- `buildUrl` automatically injects the `lang=` parameter. Never add it manually.

```javascript
// Correct
const url = buildUrl('/select', { genome, chromosome, start, end });
const data = await fetchData(url, 'coords-fetch');

// Wrong — manual URL construction
const url = `/select?genome=${genome}&chromosome=${chromosome}`;

// Wrong — raw fetch
const response = await fetch(url);
```

### Error handling in fetch wrappers

- Wrap `fetchData()` calls in try/catch. Log errors with `console.warn("[module-name] error:", error)`.
- Show/hide the loader in a `finally` block so it always runs.
- Return `null` on error — never throw from a fetch wrapper function.

```javascript
export async function fetchCoordinateRange(coords) {
    let result = null;
    showLoader();
    try {
        const raw = await fetchData(buildUrl('/select', coords), 'coords-fetch');
        result = deserializeGraph(raw);
    } catch (error) {
        console.warn("[fetch-coordinate-range] error:", error);
    } finally {
        hideLoader();
        return result;
    }
}
```

### Log labels

- Every `fetchData()` call must pass a `logLabel` string (second argument) for error context.
- Format: `'kebab-case-description'` (e.g., `'coords-fetch'`, `'subgraph'`, `'path-selection'`).

---

## Naming Conventions

### Variables

| Type | Convention | Examples |
|------|-----------|---------|
| General variables | camelCase | `hoveredNode`, `nearestNode`, `graphData` |
| Collections | plural camelCase | `nodes`, `linkRecords`, `bubbleRecords` |
| Boolean flags | `is*` or `can*` | `isVisible`, `isDrawn`, `isDragging`, `canSingleSelect` |
| Map/lookup objects | `*Lookup` | `nodeRecordLookup`, `linkRecordLookup` |
| Constants | UPPER_SNAKE_CASE | `MAX_KINKS`, `LINK_SCALE`, `KINK_SIZE` |
| Singletons | camelCase | `appState`, `viewState`, `colorState`, `eventBus` |

### Functions

| Type | Convention | Examples |
|------|-----------|---------|
| Setup/init | `setUp*` (two words) | `setUpEngineManager`, `setUpColorState` |
| Boolean checks | `is*` or `can*` | `isInChainMode`, `canSingleSelect`, `isDragging` |
| Getters | `get*` | `getNodeColor`, `getHoverLabelText` |
| Setters | `set*` | `setSelected`, `setHighlighted`, `setNodeColors` |
| Draw operations | `draw*` | `drawCircle`, `drawLine`, `drawText` |
| Render operations | `render*` | `renderPreFrame`, `renderHoverEffect` |
| Update operations | `update*` | `updateVisibility`, `updateBackgroundColor` |
| Calculations | `calculate*` | `calculateNumberOfKinks`, `calculateGCNode` |
| Converters | `*To*` | `hexToRgb`, `rgbToHex`, `intToColor` |
| Deserializers | `deserialize*` | `deserializeGraph`, `deserializeLinks`, `deserializeNodes` |
| Fetch wrappers | `fetch*` | `fetchCoordinateRange`, `fetchBubbleSubgraph` |

- Note: `setUp` is two words (camelCase). Not `setup*`. Existing violations (`setupRightClickMenu`, `setupBubblePopEngine`) should not be replicated.

### CSS class references in JS

- Use `element.classList.add("hidden")` / `.remove("hidden")` for visibility toggling. Never set `style.display` directly (exception: legacy modal code).
- The `.hidden` utility class is the standard way to hide elements. Do not use `style.display = "none"`.

---

## Rendering Pipeline

### Frame lifecycle

The render pipeline runs every animation frame via D3-force-graph callbacks:

```
onRenderFramePre     → background, visibility, highlights, selection
nodeCanvasObject     → per-node drawing (basicNodePainter)
linkCanvasObject     → per-link drawing (basicLinkPainter)
onRenderFramePost    → labels, drag circle, hover effect
```

### Rules

- **Never draw outside of render callbacks.** All canvas operations must happen within `onRenderFramePre`, `onRenderFramePost`, `nodeCanvasObject`, or `linkCanvasObject`.
- **Always check `isVisible` and `isDrawn`** before drawing a node or link. Early-return if either is false.
- **Always save/restore canvas state** in painter utility functions (`ctx.save()` / `ctx.restore()`). The painter-utils functions already do this.
- **Never use `ctx.font` outside of render-manager initialization.** The font is set once on startup after `document.fonts.ready`.

### Painter functions

- Drawing primitives live in `render/painter/painter-utils.js` (canvas) and `render/painter/painter-svg-utils.js` (SVG export).
- Every painter function takes `ctx` as its first argument.
- Painter functions must be pure renderers — no state reads except the arguments passed in.

### SVG export

- All painters accept an optional `svg` parameter. When non-null, they must create SVG elements instead of canvas draw calls.
- The `renderFullFrame()` function is used for export. It manually iterates all nodes/links and calls painters.

---

## Coordinate Spaces

### Three coordinate systems

| Space | Origin | Used by |
|-------|--------|---------|
| Screen (pixel) | Top-left of canvas element | DOM events (`event.offsetX`, `event.offsetY`) |
| Graph | D3 simulation space | Node `x`/`y`, force calculations |
| Genomic (bp) | Reference genome start | `appState.coords.start`/`end` |

### Conversion rules

- Screen → graph: `forceGraph.screen2GraphCoords(x, y)`.
- Graph → screen: `forceGraph.graph2ScreenCoords(x, y)`.
- Genomic → graph: not direct — goes through the backend (`/select` returns layout coordinates).
- **Never mix coordinate spaces.** Distance calculations for hit testing must compare in the same space (screen pixels for hover/click thresholds).

```javascript
// Correct — compare in screen space
const screenPos = forceGraph.graph2ScreenCoords(node.x, node.y);
const dist = euclideanDist({x: event.offsetX, y: event.offsetY}, screenPos);
if (dist > MAX_HOVER_DISTANCE) return;

// Wrong — comparing screen coords to graph coords
const dist = euclideanDist({x: event.offsetX, y: event.offsetY}, {x: node.x, y: node.y});
```

---

## D3-Force-Graph Integration

### ForceGraph singleton

`forceGraph` is initialized once in `force-graph.js` and passed to all managers:

```javascript
const forceGraph = ForceGraph()(forceGraphElement);
```

### Configuration rules

- `.nodeId("iid")` — D3 identifies nodes by their `iid` field. Never change this.
- `.enablePointerInteraction(false)` — We handle all pointer events ourselves. Never enable D3's built-in interaction.
- `.autoPauseRedraw(false)` — Keep drawing after simulation stops.
- `.cooldownTicks(Infinity)` / `.cooldownTime(Infinity)` — Simulation runs indefinitely. Stopping is manual.

### Extending forceGraph

- Managers add methods to `forceGraph` at setup time (e.g., `forceGraph.popBubble`, `forceGraph.replaceGraphData`). This is the standard extension pattern.
- Never add properties to `forceGraph` outside of a `setUp*` function.
- Custom properties added to `forceGraph`: `element`, `canvas`, `getZoomFactor()`.

### GraphData mutation

- Use `forceGraph.replaceGraphData(data)` for a full graph replacement (new `/select`).
- Use `forceGraph.addGraphData(data)` to merge new nodes/links (bubble pop).
- Use `forceGraph.removeNodeById(id)` to remove a single node.
- **Never call `forceGraph.graphData({...})` directly to set data.** Always go through the data manager wrapper functions.

---

## Mode System

### Modes

The mode system gates which interactions are active:

| Mode | Key trigger | Cursor | Actions enabled |
|------|-----------|--------|----------------|
| `selection` | (default, no modifier) | `default` | Click to select, hover, drag |
| `pan-zoom` | `Shift` held | `grab`/`grabbing` | Pan and zoom the canvas |
| `bubble-pop` | `Ctrl`/`Cmd` held | `pointer` | Click to expand bubbles |

### Rules

- Mode is set by `modes-engine.js` based on modifier keys. Engines must not set the mode directly.
- Every engine that performs actions on pointer events must check the mode first.
- `appState.registerMode(modeData)` adds a mode and creates an `appState.is<Mode>Mode()` convenience method dynamically.

---

## Things to Avoid

- **Direct `fetch()` calls** — always use `fetchData()` from `network-utils.js`.
- **Manual URL construction** — always use `buildUrl()`.
- **Direct `appState` property mutation** from outside the singleton — always use setter methods.
- **`mousedown`/`mousemove`/`mouseup`** events — always use pointer events.
- **Missing `.js` extension** in imports.
- **Bare specifier imports** (no relative path).
- **Circular module imports** — restructure using singletons or event bus.
- **`style.display = "none"`** for hiding elements — use `.classList.add("hidden")`.
- **Drawing outside render callbacks** — all canvas ops in `onRenderFrame*` or `*CanvasObject`.
- **Mixing coordinate spaces** in distance calculations.
- **Creating records and elements in the same step** — always two-phase.
- **Calling `forceGraph.graphData({...})` directly** — use the data manager wrappers.
- **Instantiating abstract classes** (`GraphObjectRecord`, `NodeRecord`).
- **`var` declarations** — use `let` or `const`. (`var` exists in older engine code but should not be replicated.)
- **Field remapping outside of record constructors** — snake_case→camelCase conversion belongs in the constructor only.
- **Undocumented event bus events** — add new events to the event table above.
