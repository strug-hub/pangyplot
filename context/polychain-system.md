# Polychain System Architecture

The simplify viewer's detail layer renders pangenome chains as force-simulated polylines with interactive bubble popping. This document covers the full lifecycle from data fetch through rendering and interaction.

## Core Concepts

**PolychainContainer** — queryable spine for a single chain. NOT a SimObject. Owns invisible D3 force nodes (the spine) and tracks bubble positions along the chain. Segments query the container for positions.

**PolychainSegment** — a visible portion of a chain (extends SimObject). Has two **anchor** d3 nodes (head, tail) pinned to the spine via `container.positionAt(t)`. Anchors are the attachment points for GFA links. A full unpoppped chain has one segment spanning `t=[0,1]`.

**SegmentObject** — a single GFA segment with 1-20 kink nodes (extends SimObject). Used for junction segments (init time) and popped bubble children (pop time). Strand-aware: `resolveEnd(link)` picks head vs tail kink based on source/target role + strand.

**BubbleObject** — a collapsed poppable bubble (extends SimObject). Same kink structure as SegmentObject but with distinct head (source) and tail (sink) segment IDs.

**Segment Registry** — single `Map<segId, SimObject>`. Only tracks **ends** (boundary segments). Interior is opaque to the link system. `resolveForLink(link, segId)` → d3 force node.

## Invisible vs Visible

The system has two layers of physics objects:

| Layer | In D3 sim? | Drawn? | Purpose |
|-------|-----------|--------|---------|
| Spine nodes (`pn_{chain}_{i}`) | Yes | No | Invisible backbone — forces shape the chain |
| Spine links (sequential) | Yes | No | Hold spine together |
| Spine physics links | Yes | No | Invisible copies of junction/inter-chain links on spine nodes — restore chain-pulling forces |
| Anchor nodes | Yes | No | Pinned connection points for GFA links, track spine position |
| Kink nodes (segments/bubbles) | Yes | Yes | Visible kinked segments from pops or junctions |
| GFA links | Yes | Yes | Visible inter-segment links |

**Why invisible spine links?** Anchors are pinned (`fx/fy`), so D3 link forces can't move them. Without spine-level copies, junction links can only pull junction segments toward chains but can't pull chains toward junctions. The invisible links connect to free-moving spine head/tail nodes, restoring bidirectional physics.

## Initialization Flow

```
polychain-fetcher.fetchDetailForViewport()
  │
  ├─ Fetch /detail-tiles or read from polychain-data-cache
  │
  └─ polychain-adapter.initPolychainLayer()
      │
      ├─ Phase A: Create containers
      │   for each chain:
      │     PolychainContainer.fromChainData(chain)
      │       ├─ Resample polyline → spine nodes (log²(bpSpan) count)
      │       ├─ Create sequential spine links
      │       ├─ Create initial PolychainSegment with head/tail anchors
      │       └─ Register sourceSegs/sinkSegs → segment in registry
      │     Collect: spineNodes, spineLinks, anchorNodes → allNodes/allLinks
      │     Compute parent-side perpendiculars for child chains
      │
      ├─ Phase B: Create junction SegmentObjects
      │   for each junction graph node:
      │     SegmentObject.fromApiNode(node, '__junction__')
      │       ├─ Create 1-20 kink nodes from ODGI coordinates
      │       └─ Register ends in segment-registry
      │   Resolve junction graph links via registry.resolveForLink()
      │   Resolve endpoint-to-endpoint junction links via registry
      │
      ├─ Phase C: Resolve shared-segment links
      │   Chains sharing a sinkSeg/sourceSeg get linked
      │   via their PolychainSegment anchors (through registry)
      │
      ├─ Phase D: Create invisible spine physics links
      │   For each GFA/inter-chain link, if an endpoint belongs to a chain,
      │   create a copy linking the spine head/tail node instead
      │
      └─ Phase E: force-engine.addPoppedNodes(allNodes, allLinks)
          └─ D3 simulation initialized, all forces wired
```

### Incremental Updates (Pan/Zoom)

`addChainsToPolychainLayer(newChains)` follows the same A→E phases for new chains only. Old junction nodes are removed and rebuilt from current data. `removeChainsFromPolychainLayer(chainIds)` destroys containers and unregisters their segments.

## Rendering Pipeline

Each frame:

1. **Force tick** → `updateAnchors()` snaps all segment anchors to spine positions
2. **Polychain render manager** iterates containers → segments:
   - `seg.getPolyline()` → pulls from `container.polylineInRange(tStart, tEnd)`
   - `seg.getBubbleCircles(metaStore)` → positions from container, metadata from bubble-meta-cache
   - Colors from `getNodeColor()` using record-compatible objects
3. **Force render manager** draws junction nodes, GFA links, deletion link crosses
4. **Debug overlay** (optional) draws force vectors, guide lines, perpendiculars

Bubble circles are **not cached** in the container. They're computed at render time from: container position (live) + bubble-meta-cache metadata (fetched once) + threshold formula (log scale of bp length).

## Pop Lifecycle

```
pop-handler.popBubbleCircleV2(hit)
  │
  ├─ Fetch /pop?id=<bubbleId> → nodes, links, source_segs, sink_segs
  │
  ├─ container.splitAtBubble(bubbleId, t, sourceSegs, sinkSegs)
  │   ├─ Mark bubble as popped (bubblesInRange excludes it)
  │   ├─ Find neighbor bubbles on each side
  │   ├─ Anchor position: midpoint between popped bubble and neighbor
  │   ├─ segment.splitAt() → left + right PolychainSegments
  │   │   ├─ Outer anchors REUSED (already in sim from init)
  │   │   └─ New inner anchors created at gap boundary
  │   ├─ If a side is empty (no bubbles) → materializeHead/materializeTail
  │   └─ Register new segments, unregister old
  │
  ├─ Materialize boundary segs (where split side is empty)
  │   SegmentObject replaces the anchor on that side
  │   Old anchor + its links removed, link metadata saved for undo
  │
  ├─ Create child SimObjects (interior segments + bubbles)
  │   Register all ends in segment-registry
  │
  ├─ Resolve GFA links through registry
  │   For each /pop link: resolveForLink(link, sourceSegId/targetSegId)
  │   Deletion links: both endpoints in boundary set
  │
  ├─ Position: spawn at container.positionAt(t), homeX/homeY = ODGI layout
  │
  ├─ Batch insert: insertPoppedContent(chainId, allNewNodes, allNewLinks)
  │
  └─ Save undo data in popTree:
      removedSegment, removedAnchors, destroyedLinkMeta,
      addedNodes, addedObjects
```

### Undo (bubble-unpop-adapter.js)

```
unpopLastBubble()
  ├─ popTree.undoLast() → retrieve saved undo data
  ├─ removePoppedContent(addedNodes) — remove all nodes added during pop
  ├─ forgetObject(obj.id) for each added object (no end unregistration)
  ├─ Restore container: remove split segments, restore old segment
  ├─ Re-register restored segment's ends
  ├─ Re-add restored segment's anchors to sim
  ├─ Re-add anchors removed during materialization
  └─ Recreate destroyed links from saved metadata via resolveForLink()
```

## Force System

D3 force simulation with 14 registered forces:

| Force | Purpose | Applies to |
|-------|---------|-----------|
| `vpFreeze` | Freeze nodes outside viewport | All |
| `link` | D3 force link (distance + strength) | All links |
| `charge` | Isolated many-body repulsion | Polychain nodes only |
| `segCharge` | Isolated many-body repulsion | Popped segment nodes only |
| `layout` | Pull toward ODGI layout positions | All with homeX/homeY |
| `centroid` | Push overlapping chain centroids apart | Polychain nodes |
| `loopClosure` | Pull head toward tail for loopy chains | Polychain nodes |
| `smoothing` | Laplacian smoothing along chain | Polychain nodes |
| `balloon` | Inflate chains outward from centroid | Polychain nodes |
| `parentSide` | Push child chains away from parent | Child polychain nodes |
| `delLink` | Push deletion link endpoints apart | Deletion links |
| `chainGuide` | Pull popped nodes toward parent chain polyline | Popped nodes with ghostRootId |
| `centroidAnchor` | Soft spring after drag release | Dragged chains |
| `spawnDamp` | Dampen velocity on newly spawned nodes | Nodes with _spawnTick |

### Force Parameter Routing

```
linkDistance(d):
  isPolychainLink    → d.length (uniform arc spacing)
  isBridgeLink       → 10
  class='link', chainId not junction → 10
  default            → d.length * SIMPLIFY_LINK_SCALE

linkStrength(d):
  isPolychainLink/isKinkLink:
    source/target isAnchor → 0.5
    else → base / (1 + (arcLen/100000)²)  [softened for long chains]
  isBridgeLink       → 0.1
  class='link', chainId not junction → 0.5
  default            → 0.01
```

### Isolated Charge Groups

Polychain nodes and popped segment nodes repel **within** their group but not across groups. `isolatedCharge()` wraps `d3.forceManyBody()`, saving/restoring velocities for non-group nodes each tick.

## Key Principles

1. **Ends only** — the registry tracks boundary segment IDs, not interior. A SimObject's interior is its own business.

2. **Anchors are pinned proxies** — they sit at spine positions (`fx/fy` set each tick by `updateAnchors`). GFA links attach to anchors. Forces can't move anchors directly.

3. **Invisible spine carries physics** — spine nodes are free-moving. Spine-level copies of junction/inter-chain links let forces shape chains. Visible links go to anchors for the model layer.

4. **Container is queryable, not renderable** — `positionAt(t)`, `polylineInRange()`, `bubblesInRange()`. Segments pull from it and render themselves.

5. **Same resolution path for init and pop** — all links resolve through `registry.resolveForLink(link, segId)` → `simObject.resolveEnd(link)` → d3 node.

6. **Undo by saving actual objects** — pop saves `removedSegment`, `addedNodes`, `addedObjects`, `destroyedLinkMeta`. Undo replays in reverse.

## File Map

All paths relative to `static/js/simplify/detail/`.

### Model (`model/`)
| File | Lines | Role |
|------|-------|------|
| `sim-object.js` | 182 | Abstract base: ends, interior, resolveEnd, _matchLink |
| `polychain-container.js` | 507 | Spine owner: fromChainData, positionAt, split/merge |
| `polychain-segment.js` | 318 | Visible chain section: anchors, getPolyline, getBubbleCircles, splitAt |
| `segment-object.js` | 191 | Kinked GFA segment: 1-20 nodes, strand-aware resolveEnd |
| `bubble-object.js` | 220 | Collapsed bubble: source/sink ends, interior child list |
| `segment-registry.js` | 97 | Unified Map<segId, SimObject>: register, resolve, resolveForLink |
| `model-manager.js` | 135 | Coordinator: containers + objects maps, addContainer, updateAnchors |
| `pop-handler.js` | 287 | Pop orchestrator: split, materialize, children, links, undo |

### Data (`data/`)
| File | Lines | Role |
|------|-------|------|
| `polychain/polychain-adapter.js` | 515 | Init orchestrator: containers, junctions, link resolution, spine physics |
| `polychain/polychain-fetcher.js` | 368 | Fetch /detail-tiles, incremental merge, triggers adapter |
| `bubble-meta-cache.js` | 101 | Batch-fetch + cache bubble metadata from server |
| `bubble-unpop-adapter.js` | 121 | Undo pop: reverse all operations from pop-handler |
| `pop-tree.js` | 114 | Hierarchical undo stack with parent-child tracking |
| `force-data.js` | 14 | Canonical node/link arrays (getForceNodes/Links) |

### Engines (`engines/`)
| File | Lines | Role |
|------|-------|------|
| `force-engine.js` | 417 | D3 simulation: 14 forces, add/remove nodes, sync |
| `forces/pc-settings.js` | 23 | Shared config object for all forces |
| `forces/polychain-forces.js` | 312 | 5 chain-shape forces: centroid, loop, parent, smoothing, balloon |
| `forces/layout-forces.js` | 82 | ODGI pull + deletion link push |
| `forces/viewport-forces.js` | 177 | Viewport freeze (+ unused viewport charge/collide) |
| `forces/chain-guide-force.js` | 67 | Soft pull toward parent chain polyline |
