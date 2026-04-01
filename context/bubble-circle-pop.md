# Simplify Viewer — Bubble Circle Pop

Ctrl+click a bubble circle on a polychain to expand ("pop") it, splitting the chain into fragments and inserting the popped subgraph into the force simulation. Supports nested pops (multiple bubbles per chain), cross-chain link resolution, and automatic chain removal when fully popped.

## Files

```
detail/data/
├── bubble-pop-adapter.js       popBubbleCircle() — orchestrates the pop
├── bubble-unpop-adapter.js     unpopLastBubble() — undo
├── bubble-meta-cache.js        bubble circle positions, removeBubbleFromStore
├── pop-tree.js                 PopTree — hierarchy tracking + LIFO undo stack
├── simplify-view-state.js      expand/collapse segment→node mappings
└── polychain/
    └── polychain-adapter.js    chainFragments, splitFragmentAt, removeChainEntirely

detail/engines/
└── force-engine.js             spliceChainAtBubble, removeFullyPoppedChain

engines/selection/
└── multi-selection-engine.js   Ctrl+click handler → popBubbleCircle

detail/engines/polychain/
└── polychain-hover-engine.js   hitTestBubbleCircles()
```

## Fragment Model

Chains are split into **fragments** when bubbles are popped. Each pop creates two new fragments from the containing fragment.

```
chainFragments: Map<originalChainId, [
  { fragmentId: "c42$0", tStart: 0, tEnd: 0.3 },
  { fragmentId: "c42$1", tStart: 0.3, tEnd: 0.7 },
  { fragmentId: "c42$2", tStart: 0.7, tEnd: 1.0 },
]>
```

- Fragment IDs use a per-chain incrementing counter (`$0`, `$1`, `$2`, ...)
- Each fragment's `tStart`/`tEnd` describe its range in the original chain's [0,1] arc-length space
- `chainPolychainNodes` stores nodes by fragmentId; node `chainId` properties are updated to the fragmentId
- Polychain forces group by `n.chainId`, so fragments are automatically treated independently

Key functions in `polychain-adapter.js`:
- `getFragmentForT(chainId, t)` — finds the fragment containing a global t, returns fragmentId + localT + nodes
- `splitFragmentAt(chainId, globalT)` — splits the containing fragment into two, returns splitIdx for spliceChainAtBubble
- `mergeFragmentAt(chainId, fragIdx)` — undo: merges fragments at fragIdx and fragIdx+1
- `getChainFragments(chainId)` — returns the fragments array or null
- `getPolychainPolylines(chainId)` — returns one polyline per fragment

## Pop Flow

1. **Hit test**: `hitTestBubbleCircles(layoutX, layoutY)` → `{ x, y, meta: { id, t }, chainId }`
2. **Fragment lookup**: `getFragmentForT(chainId, t)` → `{ fragmentId, localT, fragmentNodes }`
3. **Fetch**: `/pop?id={bubbleId}&...` → subgraph with source_segs, sink_segs, child_bubbles, nodes, links
4. **Deserialize**: `deserializeSubgraph(apiData, { linkResolver })` — enhanced linkResolver resolves:
   - `simplifyViewState.resolve()` — collapsed bubble ownership
   - `existingRecords` — visible force nodes from prior pops
   - `getSegToPolychainRecord()` — polychain endpoint nodes on other chains
   - `junctionRecordMap` — junction force nodes
5. **ViewState expand**: Unmaps parent bubble, registers child bubble segments
6. **Chain splice**: `spliceChainAtBubble(fragmentId, localT, fragmentNodes, childNodes, ...)` — removes spanning link, creates bridge links
7. **Fragment split**: `splitFragmentAt(chainId, t)` — splits the fragment entry into two
8. **Bubble removal**: `removeBubbleFromStore(chainId, bubbleId)` — removes the circle
9. **Chain removal check**: If `store.bubbles.length === 0`, calls `removeChainEntirely` + `removeFullyPoppedChain` to rewire external links and remove all polychain nodes
10. **Pop tree**: `popTree.register(bubbleId, chainId, parentBubbleId, popEntry)`

## Chain Removal

When all bubbles on a chain have been popped, the chain polyline is redundant — adjacent popped subgraphs are already connected through shared boundary segments (created by the linkResolver during each individual pop). External links (junction, inter-chain) are rewired from polychain nodes to the nearest popped boundary node via bridge links, then all polychain nodes and bridge links are removed.

`removeFullyPoppedChain(fragmentIds)` in force-engine.js:
- For each polychain node with a bridge link, rewires external links to the bridge's other endpoint
- Removes all polychain nodes, bridge links, and polychain-internal links
- Returns rewiredLinks + removedBridgeLinks for undo

## Undo Flow (Ctrl+Z)

`unpopLastBubble()` calls `popTree.undoLast()` to get the most recent pop entry:

1. **If chain was removed**: restore polychain nodes, un-rewire external links, re-add to force sim
2. **Merge fragments**: `mergeFragmentAt(chainId, fragmentIndex)` — reverses the split
3. **Unsplice**: `unspliceChainAtBubble(childIids, removedLink, bridgeLinks)` — removes children, restores polychain link
4. **ViewState collapse**: re-registers parent bubble
5. **Restore bubble**: `restoreBubbleToStore(chainId, bubbleMeta)`

## Pop Tree (Hierarchy)

`pop-tree.js` exports a singleton `PopTree` that replaces the old flat `_bubblePopStack`:

- `register(bubbleId, chainId, parentBubbleId, popEntry)` — adds to tree + LIFO stack
- `undoLast()` — pops from LIFO stack, removes from tree, returns popEntry
- `getParent(bubbleId)` / `getChildren(bubbleId)` / `getDepth(bubbleId)` — tree queries
- Parent is determined from `simplifyViewState.resolve()` at pop time

## Bridge Link Structure

```
leftNode (polychain) ──bridge──▶ sourceChildNode (first kink of source boundary)
sinkChildNode (last kink of sink boundary) ──bridge──▶ rightNode (polychain)
```

Source/sink boundary nodes are matched from `source_segs`/`sink_segs` against `recordMap`. Falls back to `simplifyViewState.segmentToNode` for collapsed child bubbles.
