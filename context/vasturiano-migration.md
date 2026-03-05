# Migration Plan: Evolve Simplify Viewer into Core Replacement

## Context

The core PangyPlot viewer (`static/js/graph/`, 133 files) uses vasturiano's `force-graph` library but already bypasses most of its features. The simplify viewer (`static/js/simplify/`, 16 files) uses raw canvas and is architecturally superior for this project.

Rather than migrating the core viewer away from vasturiano, we evolve the simplify viewer to absorb core features. The simplify viewer will adopt the core's module organization (engines, managers, records) while keeping its raw-canvas foundation. Once feature-complete, it replaces the core viewer entirely.

## Current State: What Simplify Already Has

- Raw canvas rendering with RAF loop (`render.js`, `scheduleFrame()`)
- Manual zoom/pan with cursor anchoring (`interaction.js`)
- Skeleton LOD with auto-level selection (`lod.js`)
- Progressive detail layer with fade transitions (`detail.js`)
- Chain-level hover, Shift+drag selection, X-key pop (`interaction.js`, `hit-test.js`)
- D3-force simulation for popped chains (`simplify-force.js`)
- Kink system via core deserializers (`simplify-detail-adapter.js`)
- All 5 custom forces imported from core (`layout-force`, `bubble-circular-force`)
- Gene landmark labels (`genes.js`)
- URL hash navigation (`hash-navigation.js`)
- Physics zone debug overlay (`physics-zone.js`)

## Feature Gaps (What Core Has That Simplify Doesn't)

### Must Have (blocks replacement)
1. **Bubble-level pop/unpop with undo** -- core has undo snapshots via `popData`
2. **Right-click context menu** -- core has 8 menu options
3. **PNG export** -- trivial (~20 lines)

### Should Have (common workflows)
4. **Node dragging + fix-on-drag** -- per-node grab and pin
5. **Single-click node selection** -- node-level analysis
6. **Flashlight mode** -- BFS-based neighborhood dimming
7. **Force settings UI** -- runtime parameter sliders
8. **Deletion link rendering** -- X cross through indel links
9. **Color legend + style picker** -- switchable color modes

### Nice to Have (polish)
10. **Gene region highlights** -- color regions under gene spans
11. **Path highlighting** -- sample haplotype animation
12. **Sequence search** -- ACGT regex match
13. **Information panel** -- rich selection details
14. **Graph rotation** -- R-key rotation
15. **Node search** -- navigate to node by ID

---

## Approach: Restructure Simplify to Match Core Module Organization

The simplify viewer currently has 16 flat files. To absorb core features, restructure into the core's proven module hierarchy while keeping the raw-canvas foundation.

### Target Directory Structure

```
static/js/simplify/
├── simplify-app.js              (entry point - exists)
├── simplify-state.js            (state singleton - exists)
├── render/
│   ├── render-manager.js        (draw loop - extracted from render.js)
│   ├── render-scaling.js        (zoom LOD - new, from core)
│   ├── viewport.js              (viewport utils - moved from viewport.js)
│   ├── painter/
│   │   ├── skeleton-painter.js  (skeleton pass - extracted from render.js)
│   │   ├── detail-painter.js    (detail pass - extracted from render.js)
│   │   ├── force-painter.js     (force graph pass - extracted from render.js)
│   │   ├── node-painter.js      (per-node canvas draw - from core basic-node-painter)
│   │   └── link-painter.js      (per-link canvas draw - from core basic-link-painter)
│   ├── color/                   (import from ../graph/render/color/ or move here)
│   ├── annotation/
│   │   └── gene-label-renderer.js  (extracted from render.js gene label code)
│   └── download/
│       └── render-png.js        (new, from core)
├── engines/
│   ├── engine-manager.js        (orchestrator - new)
│   ├── navigation/
│   │   ├── pan-zoom-engine.js   (extracted from interaction.js)
│   │   └── hash-navigation.js   (moved from hash-navigation.js)
│   ├── selection/
│   │   ├── hover-engine.js      (extracted from interaction.js + hit-test.js)
│   │   ├── single-selection-engine.js  (new, from core)
│   │   └── multi-selection-engine.js   (extracted from interaction.js)
│   ├── drag/
│   │   └── drag-engine.js       (new, from core)
│   ├── bubble-pop/
│   │   ├── chain-pop-engine.js  (extracted from detail.js pop logic)
│   │   └── undo-pop-engine.js   (new, from core)
│   ├── right-click/
│   │   └── right-click-engine.js  (new, from core)
│   ├── flashlight/
│   │   └── flashlight-engine.js (new, from core)
│   └── modes/
│       └── modes-engine.js      (new, from core)
├── forces/                      (keep importing from ../graph/forces/)
├── data/
│   ├── detail-fetcher.js        (extracted from detail.js fetch logic)
│   ├── detail-adapter.js        (renamed from simplify-detail-adapter.js)
│   └── spine.js                 (moved from spine.js)
├── lod/
│   ├── lod.js                   (moved from lod.js)
│   └── physics-zone.js          (moved from physics-zone.js)
└── utils/
    ├── hit-test.js              (moved from hit-test.js)
    └── format-utils.js          (moved from format-utils.js)
```

---

## Phased Implementation

### Phase 1: Restructure into Subdirectories

**Goal:** Move existing simplify files into the target directory structure without changing behavior. Pure file moves + import path updates.

**Changes:**
- Create `render/`, `engines/`, `data/`, `lod/`, `utils/` subdirectories
- Move files to new locations
- Update all import paths
- Split `render.js` into `render/render-manager.js` + `render/painter/skeleton-painter.js` + `render/painter/detail-painter.js` + `render/painter/force-painter.js`
- Split `interaction.js` into `engines/navigation/pan-zoom-engine.js` + `engines/selection/hover-engine.js` + `engines/selection/multi-selection-engine.js`
- Split `detail.js` into `data/detail-fetcher.js` (fetch/cache logic) + `engines/bubble-pop/chain-pop-engine.js` (pop/unpop logic)
- Create `engines/engine-manager.js` to orchestrate all engines

**Verify:** Simplify viewer works identically after restructure. All existing features preserved.

**Risk:** MEDIUM -- many file moves, but no logic changes. Import path errors caught immediately at load time.

---

### Phase 2: PNG Export + Right-Click Menu

**Goal:** Add the two simplest missing features.

**PNG export** (`render/download/render-png.js`):
- `canvas.toDataURL('image/png')` -> download trigger
- Reuse core's `render/download/download-utils.js`

**Right-click menu** (`engines/right-click/right-click-engine.js`):
- Adapt core's `right-click-menu.js` for simplify's chain-centric model
- Options: Pop/Unpop chain, Zoom to chain, Copy chain ID, Export PNG
- Wire up to canvas `contextmenu` event

**Verify:** Right-click on chain shows menu. PNG export downloads current view.

**Risk:** LOW -- self-contained features.

---

### Phase 3: Node Dragging + Force Settings UI

**Goal:** Add per-node interaction for popped chain nodes.

**Node dragging** (`engines/drag/drag-engine.js`):
- Detect pointerdown on force node (via hit-test)
- On pointermove: update `node.fx`/`node.fy`, reheat simulation
- On pointerup: optionally keep pinned (fix-on-drag toggle)
- Adapt core's `drag-engine.js` threshold + influence patterns

**Force settings UI** (`forces/settings/`):
- Import core's `force-settings.js` and `force-defaults.js`
- Add slider panel to simplify template
- Wire sliders to `simplify-force.js` simulation parameters

**Verify:** Drag force nodes. Sliders adjust simulation. Nodes settle correctly.

**Risk:** MEDIUM -- dragging requires careful coordinate conversion (screen -> data space via `state.panX/panY/zoom`).

---

### Phase 4: Single-Click Selection + Information Panel

**Goal:** Add node-level selection and details display.

**Single-click selection** (`engines/selection/single-selection-engine.js`):
- Click on force node -> select it
- Click on chain polyline -> select chain
- Escape to deselect
- Track in `state.selectedNodes` (Set) alongside `state.selectedChains`

**Information panel**:
- Show node/chain details in a side panel or overlay
- Display: ID, type, sequence length, GC content, bubble membership

**Verify:** Click selects. Info panel updates. Escape deselects.

**Risk:** LOW -- straightforward UI.

---

### Phase 5: Deletion Links + Color Legend

**Goal:** Improve rendering fidelity and add color system UI.

**Deletion link rendering**:
- In force painter, detect `link.isDel` flag
- Draw X cross through link midpoint (reuse core's `drawRotatedCross()` from `painter-utils.js`)

**Color legend + style picker**:
- Import core's color system (`color-state.js`, `color-style.js`, `legend-manager.js`)
- Add dropdown to switch between 7 color modes
- Render legend in a corner overlay

**Verify:** Deletion links show X. Color mode switching works. Legend renders.

**Risk:** LOW -- core color system already imported partially.

---

### Phase 6: Bubble-Level Pop/Unpop with Undo

**Goal:** Add the core's signature feature -- individual bubble expansion with undo stack.

**Implementation:**
- Within a popped chain's force graph, Ctrl+click on a bubble node triggers `/pop`
- Store undo data in bubble record's `popData` (core pattern)
- Expand viewState: unmap parent, register children
- Add child nodes/links to force simulation
- Right-click -> Collapse reverses the operation

**Key reuse:**
- `data/records/deserializer/deserializer.js::deserializePopResponse()`
- `data/view-state.js` (segment -> visual node mapping)
- `engines/bubble-pop/bubble-pop.js` (pop queue + fetch)

**Verify:** Ctrl+click bubble expands it. Right-click -> Collapse restores it. Multiple levels of nesting work.

**Risk:** HIGH -- this is the most complex feature. Requires viewState integration into simplify's data flow. The core's pop/unpop is tightly coupled to `forceGraph.graphData()` mutations; must adapt to simplify's `addPoppedNodes()`/`removePoppedNodes()` pattern.

---

### Phase 7: Flashlight Mode

**Goal:** Add BFS-based neighborhood exploration.

**Implementation:**
- Import core's `flashlight-bfs.js` (pure graph traversal, no vasturiano deps)
- On hover, BFS from hovered node using adjacency from force simulation
- Set `node.flashlightAlpha` on each node based on BFS distance
- Respect alpha in force painter

**Limitation:** Only works within popped chains (simplify doesn't have a full node graph). Could extend to chain-level flashlight (dim distant chains) for skeleton view.

**Verify:** Hover dims distant nodes. Toggle on/off works.

**Risk:** MEDIUM -- BFS is portable; the challenge is defining "adjacency" in simplify's hybrid chain+force model.

---

### Phase 8: Path Highlighting + Sequence Search

**Goal:** Add analysis features for multi-sample exploration.

**Path highlighting:**
- Fetch `/path?sample=...` endpoint
- Color links along path with animation
- Add sample selector dropdown to simplify UI
- Adapt core's `path-highlight-engine.js` animation tick

**Sequence search:**
- Add search input to UI
- ACGT regex + reverse complement matching
- Highlight matching nodes in force graph
- Adapt core's `sequence-search-engine.js`

**Verify:** Select sample -> path animates. Search ACGT -> matches highlight.

**Risk:** MEDIUM -- requires UI additions and endpoint integration.

---

## What Gets Imported Directly from Core (No Changes Needed)

These core files are reused as-is (imported via `../graph/`):
- `forces/layout-force.js`, `bubble-circular-force.js`, `force-defaults.js`
- `data/records/objects/node-record.js`, `link-record.js`, `annotation-record.js`
- `data/records/deserializer/*` (all deserializers)
- `data/view-state.js` (Phase 6+)
- `render/painter/painter-utils.js` (drawCircle, drawLine, drawRotatedCross)
- `render/color/color-style.js`, `color-state.js`, `color-utils.js`
- `render/color/legend/legend-manager.js` (Phase 5+)
- `render/download/download-utils.js`
- `utils/event-bus.js` (if needed for engine communication)
- `engines/flashlight/flashlight-bfs.js` (Phase 7)

## What Stays Simplify-Specific (Not From Core)

- Skeleton LOD system (`lod.js`) -- core has no equivalent
- Spine coordinate transforms (`spine.js`) -- unique to simplify's layout
- Progressive detail layer with fade (`detail-fetcher.js`) -- core loads all at once
- Physics zone activation budget (`physics-zone.js`) -- unique to simplify
- Chain polyline rendering -- core uses individual nodes
- Hash navigation by bp coordinates -- core has no URL state

## Critical Path

```
Phase 1 (restructure)
    |
    +---> Phase 2 (export + context menu)
    |
    +---> Phase 3 (drag + force UI)
    |
    +---> Phase 4 (selection + info panel)
    |
    +---> Phase 5 (deletion links + color legend)
    |
    v
Phase 6 (bubble pop/unpop with undo) -- depends on Phase 4 (selection)
    |
    +---> Phase 7 (flashlight) -- depends on Phase 6 (node graph)
    |
    +---> Phase 8 (path highlight + search) -- independent
```

Phases 2-5 can proceed in any order after Phase 1. Phase 6 is the critical gate. Phases 7-8 depend on Phase 6.

## Verification (End-to-End)

After all phases, the simplify viewer should pass the same checklist as the core viewer:
1. Graph renders with correct node/link positions and colors
2. Zoom/pan works (wheel + drag)
3. Skeleton LOD transitions smoothly (simplify-specific)
4. Detail layer fades in/out with chains (simplify-specific)
5. Hover tooltip on chains and force nodes
6. Single-click selects, Shift+drag multi-selects
7. X-key or Ctrl+click pops chain/bubble, right-click collapses
8. Node drag moves node and reheats simulation
9. Path highlighting animates along sample path
10. Gene annotations render with labels
11. Force settings sliders adjust simulation parameters
12. PNG export captures current view
13. Flashlight mode dims distant nodes
14. Window resize adjusts canvas
15. URL hash navigation preserves viewport
