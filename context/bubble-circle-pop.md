# Simplify Viewer — Bubble Circle Pop (Chain-Split)

Ctrl+click a bubble circle on a polychain to expand ("pop") it, splitting the chain and inserting the popped subgraph into the force simulation.

## Key Distinction: Two Kinds of Bubbles

1. **Bubble circles** — decorative markers drawn on polychain splines. Positioned by interpolating `t` (fractional arc-length position) along the polyline each frame. Metadata lives in `bubble-meta-cache.js`. These are NOT force simulation nodes.

2. **Bubble force nodes** — actual D3 force nodes with `type === 'bubble'`. Only present if they came from the junction graph. The old (dead) pop mechanism targeted these.

This feature targets bubble circles (1), which is what the user actually sees and can interact with.

## Files

```
detail/data/
├── bubble-pop-adapter.js       popBubbleCircle() — orchestrates the pop
├── bubble-unpop-adapter.js     unpopLastBubble() — undo, handles isChainSplitPop
├── bubble-meta-cache.js        removeBubbleFromStore / restoreBubbleToStore
├── simplify-view-state.js      expand/collapse segment→node mappings
└── polychain/
    └── polychain-adapter.js    getPolychainNodesForChain (passed to splice)

detail/engines/
└── force-engine.js             spliceChainAtBubble / unspliceChainAtBubble

engines/selection/
├── multi-selection-engine.js   Ctrl+click handler → popBubbleCircle
└── hover-engine.js             Ctrl+hover → hitTestBubbleCircles (bubble browsing mode)

detail/engines/polychain/
└── polychain-hover-engine.js   hitTestBubbleCircles() — hit-test for bubble circles
```

## Pop Flow

1. **Hit test**: `hitTestBubbleCircles(layoutX, layoutY)` returns `{ x, y, meta, chainId }`.
2. **Fetch**: `/pop?id={bubbleId}&genome=...&chromosome=...` → subgraph with `source_segs`, `sink_segs`, `child_bubbles`, `nodes`, `links`.
3. **Deserialize**: `deserializeSubgraph(apiData, { tag: { chainId }, linkResolver })` creates kink nodes + GFA links. The linkResolver uses `simplifyViewState.resolve()` for cross-batch resolution.
4. **ViewState expand**: Unmaps parent bubble's segments, registers child bubble segments.
5. **Chain splice**: `spliceChainAtBubble(chainId, t, pcNodes, childNodes, ...)`:
   - Computes cumulative arc lengths of polychain nodes
   - Finds the polychain link spanning position `t`
   - Removes that link
   - Finds source/sink boundary child nodes from the deserialized records
   - Creates bridge links: leftNode→sourceChild, sinkChild→rightNode
   - Syncs force sim, reheats
6. **Cache cleanup**: `removeBubbleFromStore(chainId, bubbleId)` removes the circle.
7. **Undo entry**: Pushed to `state._bubblePopStack` with `isChainSplitPop: true`.

## Undo Flow (Ctrl+Z)

`unpopLastBubble()` checks `isChainSplitPop` flag:
1. `unspliceChainAtBubble(childIids, removedLink, bridgeLinks)` — removes children, removes bridge links, restores the polychain link.
2. `simplifyViewState.collapse()` — re-registers parent bubble.
3. `restoreBubbleToStore(chainId, bubbleMeta)` — re-inserts the bubble circle.

## Known Issue: Chain Not Actually Split

**Current behavior**: The polychain link is removed and bridge links are added, but the chain's `chainPolychainNodes` entry remains intact as one array. The polychain nodes on both sides still share the same `chainId`. The visual "split" relies on force simulation pulling the two halves apart via the inserted subgraph.

**What's missing**: The `chainPolychainNodes` Map entry should be split into two sub-arrays (e.g. left half and right half). This matters because:
- Polychain forces (smoothing, loop closure, centroid repulsion) treat the chain as one unit — they'll try to keep both halves together or compute incorrect centroids
- The polychain renderer draws one continuous polyline per chain — it needs to draw two separate polylines after the split
- Chain hover hit-testing assumes a single contiguous polyline

**To fix**: `spliceChainAtBubble` needs to split the `chainPolychainNodes` entry into two new entries (e.g. `chainId:left` and `chainId:right`) and update `segToPolychain` mappings. The undo path must merge them back. This is the main remaining work.

## Bridge Link Structure

Bridge links connect polychain nodes to child kink nodes:
```
leftNode (polychain) ──bridge──▶ sourceChildNode (first kink of source boundary segment)
sinkChildNode (last kink of sink boundary segment) ──bridge──▶ rightNode (polychain)
```

Source/sink boundary nodes are identified by matching `source_segs`/`sink_segs` from the API against record IDs in the `recordMap`. If boundary segments are owned by collapsed child bubbles, falls back to checking `simplifyViewState.segmentToNode`.
