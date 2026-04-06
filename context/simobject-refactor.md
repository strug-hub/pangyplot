# SimObject Refactor — Status & Migration Guide

## Current State (2026-04-03)

The new SimObject model layer is **live and the primary pop path**.
Old `popBubbleCircle` and `popBubbleForceNode` removed (bubble-pop-adapter
now delegates entirely to V2 handlers). Rendering still uses old force node
iteration but works with SimObject kink nodes via compat fields.

### What's Done

- **SimObject class hierarchy** (`graph/detail/model/`):
  - `sim-object.js` — abstract base: `ends`, `interior`, `resolveEnd(link)`, `isDeletionLink(link)`
  - `segment-object.js` — self-kinked segment (1-20 nodes), renderer-compatible
  - `bubble-object.js` — collapsed poppable bubble
  - `polychain-segment.js` — visible chain portion with 2 anchor d3 nodes
  - `polychain-container.js` — permanent spine manager (NOT a SimObject)

- **Unified registry** (`segment-registry.js`): `Map<SegmentId, SimObject>`, ends only

- **Integration layer**:
  - Container creation via `PolychainContainer.fromChainData()` static method
  - `model-manager.js` — coordinates all containers + loose objects
  - `pop-handler.js` — V2 pop using SimObjects (replaces deserializeSubgraph path)

- **Wiring**:
  - `initModel()` called alongside `initPolychainLayer()` in polychain-fetcher.js
  - `updateAnchors()` called every force tick in force-engine.js
  - Ctrl+click pop and `popAllBubblesOnChain` use `popBubbleCircleV2`
  - Unpop merges container segments back

### What Still Uses the Old System

- **Rendering**: `force-render-manager.js` and `polychain-render-manager.js` iterate raw force node/link arrays. They work with SimObject kink nodes because of compat fields.
- **Old view state**: `detail-view-state.js` still exists but may be redundant with segment-registry.

### Key Architecture

```
/detail-tiles response
  → polychain-fetcher.js calls initModel(detailData)
  → model-manager creates PolychainContainers
  → each container has: permanent spineNodes (in sim, never drawn),
    PolychainSegments with anchor nodes, renderMasks for gaps

Ctrl+click bubble circle
  → popBubbleCircleV2 (pop-handler.js)
  → creates SegmentObject/BubbleObject from /pop API
  → container.splitAtBubble (render mask + segment split)
  → kink nodes added to force sim (renderer-compatible)

Undo (Z key)
  → unpopAnchor in bubble-unpop-adapter.js
  → removePoppedContent + removeGap (old system)
  → container.mergeAtBubble (new system)
```

### Debug

Console access:
- `__simContainers()` — all PolychainContainers
- `__simObjects()` — loose SimObjects (popped segments/bubbles)
- `__simRegistry` — unified SegmentRegistry

### Remaining Work

1. **Rendering via RenderSpecs**: Switch renderers to consume `getRenderables()` from model-manager instead of iterating raw force nodes. Low priority — current compat approach works.

2. **Remove old viewState**: `detail-view-state.js` may be redundant with segment-registry. Evaluate whether it can be removed.
