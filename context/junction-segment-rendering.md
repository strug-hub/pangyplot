# Junction Segment Rendering (HISTORICAL)

> **Note:** The force-based activation system described under "The old approach" has been fully removed. The current rendering approach (thin gray segment lines) is stable. This document is kept for context on why the simpler approach was chosen.

## What are junction segments?

When the backend decomposes a region into bubble chains, some segments don't belong to any chain. These are **junction segments** — the naked GFA segments that sit between superbubbles, connecting chains to each other. They come from the server as `junctionGraph` (an object with `nodes` and `links`) alongside the chain data in `detailData`.

Each junction node has layout coordinates (`x1, y1, x2, y2`) from the odgi layout, plus GFA link connectivity in `junctionGraph.links`.

## The old approach (force-based activation)

Previously, junction segments were pulled into the force simulation when their adjacent chain was popped:

1. `state.activatedJunctionSegs` tracked which junction segments were "activated" (a `Map` of seg ID → `Set<chainId>` for refcounting)
2. `activateJunctionSegs()` deserialized junction nodes into force-ready records and created tether links connecting them to chain anchor nodes
3. `deactivateJunctionSegs()` removed them when chains were unpopped, with refcounting so a junction shared by two popped chains stayed active until both were unpopped
4. `deserializeJunctionSegments()` and `createJunctionToAnchorLinks()` in `polychain-adapter.js` handled the record creation and link wiring (~150 lines)
5. The render manager used `buildActivatedCoords()` / `filterJunctionNodes()` / `filterJunctionLinks()` to hide the static dots for any junction that had been pulled into the force sim

**Problems with this approach:**
- ~250 lines of complex activation/deactivation/refcounting code
- Junction segments don't benefit from force simulation — they have fixed layout positions and don't need to find equilibrium
- Tether links between junction kinks and chain anchors were fragile and produced visual artifacts
- The coordinate-matching filter (`buildActivatedCoords`) was a brittle heuristic

## The removal (current state)

The activation system has been removed across 4 files:
- `simplify-state.js` — removed `activatedJunctionSegs` map
- `polychain-pop-engine.js` — removed `activateJunctionSegs()`, `deactivateJunctionSegs()`, `readdActiveJunctions()`, and all call sites
- `polychain-adapter.js` — removed `deserializeJunctionSegments()` and `createJunctionToAnchorLinks()`
- `polychain-render-manager.js` — removed `buildActivatedCoords()`, `filterJunctionNodes()`, `filterJunctionLinks()`

## Current rendering (what you see now)

Junction segments render as thin gray (`#999`) lines using `strokeSegments`, with thin gray GFA links between them:

```javascript
// 1. Junction links
strokeLines(ctx, state.detailData.junctionLinks, '#999', lineWidth, 0.7 * opacity);

// 2. Junction segments (rendered as segment lines)
strokeSegments(ctx, jgNodes, '#999', lineWidth, 0.6 * opacity);
```

This is an improvement over the old gray-dot centroids, but the segments are still visually distinct from popped chain segments (which render as thick blue lines with endpoint circles in the force sim).

## The open question

How should junction segments look? Options explored so far:

1. **Gray dots at centroids** — the original pre-refactor style. Too abstract, hides real graph structure.
2. **Thin gray segment lines** — current state. Shows real structure but visually disconnected from popped chain segments.
3. **Force-style nodes (thick blue lines + endpoint circles)** — tried and reverted. Made junction segments look identical to force-sim segments, but the user didn't like it (possibly too visually heavy, or the blue color was wrong for static elements).

The rendering lives entirely in `polychain-render-manager.js` section 2. The painter primitives (`strokeSegments`, `fillCircles`, `strokeLines`, etc.) are all available in `detail-painter.js`. No other files need to change for a rendering-only update.
