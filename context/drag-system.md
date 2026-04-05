# Simplify Viewer — Drag & Move System

Ported from the core graph viewer's `static/js/graph/engines/drag/` module, adapted for the simplify viewer's chain-centric data model. Lives in `static/js/simplify/engines/drag/`.

## Files

```
engines/drag/
├── drag-engine.js              Main orchestrator: pointer events, mode detection, position updates
├── drag-fix-engine.js          "Anchor on drag" toggle: #anchorToggle checkbox + F key
├── centroid-anchor-force.js    D3 force: pins chain centroid while nodes flex
├── drag-lock-render.js         Lock icon rendering for anchored chains
├── drag-influence-force.js     (Disabled) BFS influence force for connected-node movement
├── drag-influence-engine.js    (Disabled) Scroll-wheel influence radius control
└── drag-influence-render.js    (Disabled) Blue dashed influence circle overlay
```

## Drag Modes

### Node Drag
- **Target**: Force nodes from popped bubbles or junction segments (`hoveredForceNode`, non-polychain)
- **Behavior**: Sets `node.fx/fy` to cursor position each frame. Identical to core graph.
- **On release**: If anchor enabled → `fx/fy` stay pinned. If not → `fx/fy` cleared, node returns to force-driven position.

### Chain Drag
- **Target**: Chain polylines in detail mode (`hoveredChain` with `detailData` present)
- **Behavior**: Looks up all polychain nodes via `getPolychainNodesForChain(chainId)`, sets `fx/fy` on all, applies uniform delta each frame (rigid body movement).
- **On release**: `fx/fy` always cleared. If anchor enabled → `anchorChain()` registers a centroid constraint instead of pinning individual nodes.

### Segment Grab (Phase 3, not yet implemented)
- **Target**: Individual polyline segments within a chain
- **Behavior**: Would move nearby polychain nodes with arc-length-based falloff (local deformation)
- **Trigger**: Alt+mousedown on a chain (planned)

## Event Flow

```
pointerdown (canvas):
  Guard: left-click only, no shift/ctrl/meta
  If hoveredForceNode (non-polychain) → readyMode = 'node'
  If hoveredChain + detailData         → readyMode = 'chain'
  Else → return (pan-zoom-engine handles it)

pointermove (window):
  If readyMode set → check 5px threshold → activateDrag()
  If dragMode set  → updateDrag() with screen→data conversion

pointerup (window):
  Clear readyMode
  If dragMode set → endDrag() (pin/release/anchor based on mode + fixOnDrag)
```

## Centroid Anchor Force (`centroid-anchor-force.js`)

When anchor-on-drag is enabled and a chain is released, instead of pinning all `fx/fy` (which makes the chain completely rigid), the system registers a centroid constraint:

- **`anchorChain(chainId, nodes)`**: Computes centroid from current node positions, stores `{ cx, cy, nodes }` in a Map. Marks nodes with `_centroidAnchored = true`.
- **Force tick**: For each anchored chain, computes current centroid, calculates drift from anchor point, shifts all nodes by the correction delta. Hard constraint — centroid is exactly corrected every tick.
- **Effect**: Chain center of mass stays locked at the drop position, but individual polychain nodes flex freely under other forces (smoothing, charge, link springs, etc.).
- **Viewport freeze exemption**: Nodes with `_centroidAnchored = true` are skipped by `viewportFreezeForce` so the centroid correction isn't fought by off-screen freezing.
- **Cleanup**: `releaseAllChains()` called in `clearForce()` when detail mode exits.

## Influence System (Currently Disabled)

A BFS-based influence force was built but is disconnected due to tuning issues. When re-enabled:

- **`drag-influence-force.js`**: BFS from dragged node(s) through force link graph. Chain-aware: when a polychain node is reached, all sibling nodes in the same chain are pulled in at the same BFS depth. Exponential decay `influence^depth` per inter-chain hop.
- **`drag-influence-engine.js`**: Scroll-wheel adjusts influence (0.01–1.0) during drag. Registers force via `registerCustomForce()`.
- **`drag-influence-render.js`**: Blue dashed circle showing influence radius in data-space.

To re-enable: import `setupDragInfluenceEngine` in `drag-engine.js` and call it in `setupDragEngine()`. Uncomment the render import and call in `render-manager.js`.

## Integration Points

### State additions (`simplify-state.js`)
```
dragMode: null          // null | 'node' | 'chain' | 'segment'
dragTarget: null        // force node or chain object
dragChainNodes: null    // polychain node array (chain mode)
dragPrevDataX/Y: 0      // previous cursor position in data-space
fixOnDrag: false        // anchor toggle
```

### Guards preventing conflicts
- **pan-zoom-engine.js**: Mousedown bails when `hoveredChain && detailData` or `hoveredForceNode` — drag-engine claims the event.
- **hover-engine.js**: Mousemove bails when `state.dragMode` is set — prevents hover flicker during drag.
- **multi-selection-engine.js**: Mutually exclusive via `e.shiftKey` check — shift+drag = selection, bare drag = element drag.

### Force engine additions (`force-engine.js`)
- **`reheatDrag()`**: Modest reheat at `alpha(0.3)` during drag (avoids violent reorganization).
- **`registerCustomForce(name, fn)`**: Registers a named force into the D3 simulation.
- **`centroidAnchorForce`** registered in `initForce()`, cleaned up in `clearForce()`.

### Polychain adapter addition (`polychain-adapter.js`)
- **`getPolychainNodesForChain(chainId)`**: Returns raw node array from private `chainPolychainNodes` Map. Needed for `fx/fy` manipulation during chain drag and centroid anchor registration.

## Keyboard Focus Model

All simplify viewer keyboard shortcuts use `canvas.addEventListener('keydown', ...)` (not `window`). The canvas receives `tabindex="0"` and auto-focuses on mousedown, both set up in `engine-manager.js`. This scopes shortcuts to canvas interaction and prevents firing when typing in UI panels. `outline: none` in `simplify.html` suppresses the focus ring.

Affected files: `drag-fix-engine.js` (F), `keyboard-engine.js` (Y, U, Ctrl+Z, Escape), `pan-zoom-engine.js` (Space), `multi-selection-engine.js` (Shift, Escape).
