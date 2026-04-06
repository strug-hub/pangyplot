# Viewer — Bubble Circle Pop

Ctrl+click a bubble circle on a polychain to expand ("pop") it, splitting the chain into fragments and inserting the popped subgraph into the force simulation. Supports nested pops (multiple bubbles per chain) and undo via Ctrl+Z.

## Files

```
detail/model/
├── pop-handler.js              popBubbleCircleV2() — orchestrates the pop
├── polychain-container.js      splitAtBubble() — splits chain at popped bubble
├── polychain-segment.js        splitAt() — splits visible segment into two
├── segment-object.js           Kinked GFA segment for popped children
├── bubble-object.js            Collapsed child bubble
├── segment-registry.js         Unified Map<segId, SimObject>
└── model-manager.js            Coordinator: containers + objects

detail/data/
├── bubble-unpop-adapter.js     unpopLastBubble() — undo
├── bubble-meta-cache.js        Bubble circle positions + metadata
├── pop-tree.js                 PopTree — hierarchy tracking + LIFO undo stack
└── detail-view-state.js        Segment→node mappings

detail/engines/
├── force-engine.js             insertPoppedContent, removePoppedContent
└── polychain/
    └── polychain-hover-engine.js   hitTestBubbleCircles()

engines/selection/
└── multi-selection-engine.js   Ctrl+click handler → popBubbleCircleV2
```

## Pop Flow (SimObject-based)

1. **Hit test**: `hitTestBubbleCircles(layoutX, layoutY)` → `{ x, y, meta: { id, t }, chainId }`
2. **Ctrl+click**: `multi-selection-engine.js` detects Ctrl+click, calls `popBubbleCircleV2(hit)`
3. **Fetch**: `/pop?id={bubbleId}&...` → subgraph with source_segs, sink_segs, child_bubbles, nodes, links
4. **Container split**: `container.splitAtBubble(bubbleId, t, sourceSegs, sinkSegs)` — marks bubble as popped, splits the containing PolychainSegment into left + right segments with new anchor nodes at the gap boundary
5. **Boundary materialization**: If a split side has no remaining bubbles, a SegmentObject replaces the anchor on that side
6. **Child creation**: Interior segments become SegmentObjects, child bubbles become BubbleObjects — all registered in segment-registry
7. **Link resolution**: GFA links from /pop response resolved through `registry.resolveForLink(link, segId)` → d3 force nodes
8. **Force insertion**: `insertPoppedContent(chainId, allNewNodes, allNewLinks)` adds to D3 simulation
9. **Pop tree**: `popTree.register(bubbleId, chainId, parentBubbleId, popEntry)` saves undo data

## Undo Flow (Ctrl+Z)

`unpopLastBubble()` calls `popTree.undoLast()` to get the most recent pop entry:

1. **Remove popped content**: `removePoppedContent(addedNodes)` — removes all nodes added during pop
2. **Forget objects**: Unregister from model-manager
3. **Restore container**: Remove split segments, restore original segment
4. **Re-register**: Restored segment's ends back in registry
5. **Re-add anchors**: Restored anchors back into D3 simulation
6. **Recreate destroyed links**: From saved metadata via `resolveForLink()`

## Pop Tree (Hierarchy)

`pop-tree.js` exports a singleton `PopTree`:

- `register(bubbleId, chainId, parentBubbleId, popEntry)` — adds to tree + LIFO stack
- `undoLast()` — pops from LIFO stack, removes from tree, returns popEntry
- `getParent(bubbleId)` / `getChildren(bubbleId)` / `getDepth(bubbleId)` — tree queries
