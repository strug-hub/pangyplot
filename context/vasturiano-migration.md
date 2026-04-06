# Migration Plan: Evolve Simplify Viewer into Core Replacement

## Context

The old core PangyPlot viewer used vasturiano's `force-graph` library but already bypassed most of its features. The simplify viewer used raw canvas and was architecturally superior for this project.

The simplify viewer was evolved to absorb core features, adopting the core's module organization (engines, managers, records) while keeping its raw-canvas foundation. The migration is now complete: the simplify viewer has been promoted to the main (and only) viewer at `static/js/graph/`, and the old core viewer has been removed.

## Current State (as of April 2026)

The viewer (`static/js/graph/`) has grown from the original 16 flat files to 56+ files across a `skeleton/`, `detail/`, `engines/`, `render/`, `data/`, `ui/`, `utils/` hierarchy. Most migration phases are complete. Current capabilities:

- Raw canvas rendering with RAF loop, skeleton/detail duality
- Manual zoom/pan with cursor anchoring
- Skeleton LOD with auto-level selection
- Progressive detail layer with polychain system and fade transitions
- Skeleton-level and polychain-level hover with ancestry tooltips
- D3-force simulation for popped chains with budget-based activation
- Kink system via core deserializers
- All custom forces imported from core
- Gene annotation table with visibility toggles + custom colors
- URL hash navigation
- Physics zone debug overlay
- Right-click context menu with SVG/PNG export
- Selection popup with bubble details
- All 7 core color modes integrated via eventBus
- Force settings UI with runtime parameter sliders
- Bubble pop/unpop within popped chains (polychain-pop-engine)
- Junction graph rendering for naked segments between chains

## Remaining Feature Gaps

### Completed (phases 1-6)
- ~~Bubble-level pop/unpop~~ — implemented via `polychain-pop-engine.js`, `bubble-pop-adapter.js`
- ~~Right-click context menu~~ — `context-menu.js`
- ~~PNG/SVG export~~ — `export.js`
- ~~Force settings UI~~ — `polychain-force-settings.js`
- ~~Color legend + style picker~~ — all 7 modes via eventBus integration
- ~~Single-click selection + info panel~~ — `selection-popup.js` with "Open Bubble View"
- ~~Gene annotations~~ — gene table with visibility + custom colors

### Still Missing
1. **Flashlight mode** -- BFS-based neighborhood dimming
2. **Path highlighting** -- sample haplotype animation
3. **Sequence search** -- ACGT regex match
4. **Graph rotation** -- R-key rotation

---

## Approach: Restructure to Match Core Module Organization

The viewer was restructured from 16 flat files into the core's proven module hierarchy while keeping the raw-canvas foundation.

### Actual Directory Structure (56 files)

See `context/viewer-engine.md` for the complete current module map.

---

## Phase Status

### Phase 1: Restructure — COMPLETE
Restructured from 16 flat files into `skeleton/`, `detail/`, `engines/`, `render/`, `data/`, `ui/`, `utils/` hierarchy (now 56 files).

### Phase 2: Export + Context Menu — COMPLETE
- SVG/PNG export via `render/export.js`
- Right-click context menu via `engines/context-menu.js`

### Phase 3: Force Settings UI + Drag — COMPLETE
- Force settings sliders via `ui/polychain-force-settings.js`
- Node + chain dragging via `engines/drag/` (drag-engine, drag-fix-engine, centroid-anchor-force)

### Phase 4: Selection + Info — COMPLETE
- Chain/bubble selection via `engines/selection/multi-selection-engine.js`
- Selection popup with details + "Open Bubble View" via `engines/selection/selection-popup.js`

### Phase 5: Color System — COMPLETE
- All 7 core color modes wired via eventBus (commit `ed8e295`)
- Gene annotation table with custom colors + visibility (commit `f93b657`)

### Phase 6: Bubble Pop/Unpop — COMPLETE
- V2 pop via `detail/model/pop-handler.js` (SimObject-based)
- Unpop via `detail/data/bubble-unpop-adapter.js`
- Undo stack via `detail/data/pop-tree.js` (LIFO with parent-child tracking)
- View state: `detail/data/detail-view-state.js`

### Phase 7: Flashlight Mode — NOT STARTED

### Phase 8: Path Highlighting + Sequence Search — NOT STARTED

---

## Remaining Work

The remaining phases (7-8) are independent and can be tackled in any order:
- **Flashlight mode**: BFS-based neighborhood dimming within popped chains; could extend to chain-level for skeleton view
- **Path highlighting + sequence search**: sample haplotype animation, ACGT regex matching
- **Graph rotation**: R-key / middle-mouse rotation (not in original plan)

## Verification (End-to-End)

The viewer should pass this checklist:
1. Graph renders with correct node/link positions and colors
2. Zoom/pan works (wheel + drag)
3. Skeleton LOD transitions smoothly
4. Detail layer fades in/out with polychains
5. Hover tooltip on chains and force nodes
6. Shift+drag multi-selects, selection popup shows details
7. X-key pops chain, bubble pop/unpop works within popped chains
8. Gene annotations render with labels and custom colors
9. Force settings sliders adjust simulation parameters
10. SVG/PNG export via right-click context menu
11. All 7 color modes work
12. Window resize adjusts canvas
13. URL hash navigation preserves viewport
14. Selection popup shows bubble details
