# SimObject Refactor — Status & Migration Guide

## Current State (2026-04-03)

The new SimObject model layer is **live and active** alongside the old system.
Pop/unpop uses the new V2 handler. Rendering still uses the old force node iteration.

### What's Done

- **SimObject class hierarchy** (`simplify/detail/model/`):
  - `sim-object.js` — abstract base: `ends`, `interior`, `resolveEnd(link)`, `isDeletionLink(link)`
  - `segment-object.js` — self-kinked segment (1-20 nodes), renderer-compatible
  - `bubble-object.js` — collapsed poppable bubble
  - `polychain-segment.js` — visible chain portion with 2 anchor d3 nodes
  - `polychain-container.js` — permanent spine manager (NOT a SimObject)

- **Unified registry** (`segment-registry.js`): `Map<SegmentId, SimObject>`, ends only

- **Integration layer**:
  - `polychain-factory.js` — creates containers from /detail-tiles, objects from /pop
  - `model-manager.js` — coordinates all containers + loose objects
  - `pop-handler.js` — V2 pop using SimObjects (replaces deserializeSubgraph path)

- **Wiring**:
  - `initModel()` called alongside `initPolychainLayer()` in polychain-fetcher.js
  - `updateAnchors()` called every force tick in force-engine.js
  - Ctrl+click pop and `popAllBubblesOnChain` use `popBubbleCircleV2`
  - Unpop merges container segments back

### What Still Uses the Old System

- **Rendering**: `force-render-manager.js` and `polychain-render-manager.js` iterate raw force node/link arrays. They work with SimObject kink nodes because of compat fields.
- **Old registries**: `seg-registry.js`, `simplify-view-state.js`, `segToPolychain` in polychain-adapter still exist. The V2 pop handler writes to both old + new registries.
- **Old gap system**: `createGapAtPop`, `chainGaps`, anchors still used by V2 handler for polychain visual management.
- **Ghost spine**: Still exists in polychain-adapter but not used by V2 path.
- **Force node pop** (`popBubbleForceNode`): Still uses old deserializeSubgraph path.

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

2. **Remove old gap/anchor system**: V2 handler still calls `createGapAtPop`. The container handles splits internally but the old gap system is still needed for polychain visual rendering (getVisibleSegments, getPolychainPolylines). To remove it, the polychain-render-manager needs to read from container.getRenderables() instead.

3. **Remove ghost spine**: Not used by V2 path. Can delete `createGhostSpine`, `removeGhostSpine`, `hasGhostSpine` from polychain-adapter once the chain-split pop path is fully replaced.

4. **Remove old viewState**: `simplify-view-state.js` is not used by V2 path. Can remove once `popBubbleForceNode` is also converted.

5. **Convert `popBubbleForceNode`**: Still uses old deserializeSubgraph. Needs a V2 version.

6. **Remove `deserializeSubgraph` dependency**: Once both pop paths use SimObjects, the shared graph deserializer is no longer needed by the simplify viewer.
