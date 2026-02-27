# Graph Data Pipeline

How the frontend builds the graph visualization — from API fetch to rendered D3 nodes.

---

## Overview

The pipeline has four stages:

```
API response (raw JSON)
    │
    ▼
Records (NodeRecord, LinkRecord)     ← persistent, stored in Maps
    │
    ▼
Elements (D3 node/link objects)      ← visual, stored on record.elements
    │
    ▼
D3 graphData ({nodes, links})        ← live, owned by force-graph
```

Each stage produces a different object shape. Data flows strictly downward — later stages never write back to earlier ones.

---

## Stage 1: Fetch

A genomic coordinate query triggers a fetch to the `/select` endpoint. The response is a flat JSON object with two arrays:

```json
{
  "nodes": [
    { "id": "b107", "type": "bubble", "length": 5000, "x1": ..., "source_segs": [42, 43], ... },
    { "id": "s42",  "type": "segment", "length": 120,  "x1": ..., "seq": "ACGT...", ... }
  ],
  "links": [
    { "source": "s42", "target": "s43", "from_strand": "+", "to_strand": "+", ... }
  ]
}
```

Two things to notice:

1. **Nodes are either bubbles or segments.** The backend has already decided which top-level bubbles are visible at this zoom level. Segments only appear if they sit outside any bubble (boundary segments between bubbles).

2. **Links are always segment-to-segment.** The backend serves pure GFA links — it doesn't know about the visual graph. A link might connect two segments that are both hidden inside collapsed bubbles. The frontend resolves where each link visually attaches.

---

## Stage 2: Records

Raw JSON is deserialized into **record** objects — lightweight wrappers that remap `snake_case` API fields to `camelCase` and store them in global lookup Maps.

### Node records

```
NodeRecord (abstract)
├── BubbleRecord  — collapsed bubble (has sourceSegs, sinkSegs, siblings, chain info)
└── SegmentRecord — visible segment (has sequence)
```

A `BubbleRecord` represents a single collapsed bubble. It knows its boundary segments (`sourceSegs`, `sinkSegs`) and its sibling bubbles in the chain. A `SegmentRecord` is a GFA segment visible as its own node.

Records are stored in `nodeRecordLookup` (a `Map<id, NodeRecord>`) and persist across bubble pops/unpops. When the same ID is fetched again (e.g., after popping a bubble, a segment reappears), the existing record is reused rather than replaced. This means record object identity is stable — you can hold a reference to a record and it stays valid.

### Link records

A `LinkRecord` stores both the raw link data and **references to the two NodeRecords** it connects. This is important: the link knows its visual endpoints at the record level, not just as string IDs.

Links are stored in `linkRecordLookup` and an adjacency index (`nodeAdjacencyLookup: Map<nodeId, Set<linkId>>`) for fast neighbor queries.

### Parent-child tracking

When a bubble is popped, its children (new records from the `/pop` response) are added to the parent record's `inside` set. This forms a tree:

```
BubbleRecord (b107)
  └── inside: Set { SegmentRecord(s50), BubbleRecord(b200), SegmentRecord(s51) }
         └── BubbleRecord(b200).inside: Set { ... }
```

This tree is used for undo (unpop) — to know which records to remove when collapsing a bubble back.

---

## Link Resolution (ViewState)

This is the trickiest part of the pipeline.

### The problem

The backend sends links between raw segment IDs. But many of those segments are hidden inside collapsed bubbles — they don't exist as visible nodes. A link like `s42 → s43` might need to render as `b107 → b108` if both segments are inside different bubbles.

### The solution: viewState

`viewState` is a `Map<segmentId, NodeRecord>` that answers: "given a segment ID, which visible node should a link attach to?"

When a bubble is registered (on initial load or after unpop), all its boundary and interior segments are mapped to it:

```
viewState:
  "42" → BubbleRecord(b107)    // source seg of b107
  "43" → BubbleRecord(b107)    // sink seg of b107
  "50" → BubbleRecord(b107)    // inside seg of b107
```

When a link arrives as `s42 → s55`, the deserializer asks:
- `viewState.resolve("42")` → `BubbleRecord(b107)`
- `viewState.resolve("55")` → `BubbleRecord(b108)`
- Result: this link visually connects `b107 → b108`

If `resolve()` returns `null`, the segment is visible as itself (not inside any bubble).

### Write order matters

A segment can be shared between two sibling bubbles (one bubble's sink is the next bubble's source). When registering, segments are written in order: inside segs, then sink segs, then source segs. **Source segs win** because in a chain `A → B`, the shared boundary segment logically belongs to the downstream bubble's source.

### Expand and collapse

When a bubble is popped:
- `viewState.expand()` unmaps all the bubble's segments, then maps child bubble segments to the child records.

When a bubble is unpopped:
- `viewState.collapse()` unmaps child segments and re-maps everything back to the parent bubble.

Both operations carefully handle boundary segments shared with still-popped siblings (the `excludeSegIds` parameter).

---

## Stage 3: Elements

Records describe what a node *is*. Elements describe how it *looks* in D3.

### Kinks: one record, many nodes

A single NodeRecord can produce **multiple D3 nodes** called "kinks." This represents long genomic segments or bubbles as chains of connected circles rather than one huge circle.

```
SegmentRecord(s42, length=5000)
    │
    ▼ createNodeElements()
    │
    ├── node { iid: "s42#0", x: ..., isEnd: true }     (head)
    ├── node { iid: "s42#1", x: ... }                   (middle)
    └── node { iid: "s42#2", x: ..., isEnd: true }     (tail)

    + internal links:
    ├── link { source: "s42#0", target: "s42#1", class: "node" }
    └── link { source: "s42#1", target: "s42#2", class: "node" }
```

Kink count is based on sequence length: 1 for short sequences (<10bp), up to 20 for very long ones, scaling at ~1 kink per 2000bp.

### id vs iid

- **`id`** = the record ID (e.g., `"s42"`). Shared across all kinks of the same record.
- **`iid`** = instance ID (e.g., `"s42#2"`). Unique per D3 node. This is what D3 uses as its key (`.nodeId("iid")`).

This distinction matters everywhere: D3 links reference `iid` values (connecting specific kinks), while record-level operations use `id` values.

### Inter-node links attach to kink endpoints

When a link connects two records, it doesn't just connect "the node" — it connects a specific kink of each node, based on strand orientation:

- `from_strand "+"` → attach to the **tail** kink (last kink)
- `from_strand "-"` → attach to the **head** kink (first kink)
- `to_strand "+"` → attach to the **head** kink
- `to_strand "-"` → attach to the **tail** kink

This makes strand direction visible in the graph layout — forward links go head-to-tail while reverse-complement links go tail-to-tail or head-to-head.

### Internal kink links vs inter-node links

The graph has two kinds of links distinguished by their `class` field:

| `class` | Meaning | Width | Example |
|---------|---------|-------|---------|
| `"node"` | Kink-internal link (within one record) | 5 (thick, same as node) | `s42#0 → s42#1` |
| `"link"` | Inter-node link (between records) | 1 (thin) or 5 (chain link) | `s42#2 → s43#0` |

This distinction affects rendering (internal links are drawn as thick "spine" connections), force simulation (different spring constants), and removal logic (when removing a node, internal links are filtered by `id` match, inter-node links by endpoint check).

### Chain links

Sibling bubbles in a chain get a synthetic "chain link" between them. These are created purely on the frontend — the backend doesn't send them. They are generated by scanning bubble records for sibling relationships and connecting consecutive pairs.

Chain links have `type: "chain"`, `width: 5`, and take visual priority over regular GFA links between the same pair (duplicates are removed).

### Deletion links

When a bubble is popped and one of the raw links directly connects the bubble's source to its sink (bypassing the interior), that link is marked as a deletion link (`isDel: true`). For indel bubbles with 3+ kinks, an additional internal deletion link is created from the first kink to the last, visualizing the "skip" path.

### Element storage

Elements are stored on the record itself:

```javascript
nodeRecord.elements = { nodes: [...kink objects], links: [...internal link objects] }
linkRecord.elements = { nodes: [], links: [...link objects] }
```

`extractElementsFromRecords()` flattens all elements from a list of records into a single `{nodes, links}` object for D3.

---

## Stage 4: D3 GraphData

The final stage is the live `{nodes, links}` object owned by D3-force-graph. Three operations modify it:

### replaceGraphData (fresh query)

Wipes everything and starts from scratch. Used when the user enters new coordinates.

1. Clean up: deduplicate by `iid`, remove links with missing endpoints, sort (internal links last).
2. Recenter: shift all coordinates so the graph is centered at the origin.
3. Hand to D3: `forceGraph.graphData(data)`.

### addGraphData (bubble pop)

Merges new nodes and links into the existing graph. Used after popping a bubble.

1. The popped bubble node is removed first (`removeNodeById`).
2. New child nodes and links are pushed into the existing arrays.
3. Same cleanup (dedup, invalid link removal, sort).
4. Recenter the new nodes around the area where the bubble was.

### removeNodeById (bubble removal)

Removes a single node and all its related links. Filters the arrays in place. The filter logic is:
- Remove all nodes with matching `id` (catches all kinks).
- Remove internal links with matching `id` (kink-internal).
- Remove inter-node links where either endpoint's `id` matches.

---

## Bubble Pop / Unpop Lifecycle

This is where all the pieces come together.

### Pop (expand a bubble)

```
User ctrl-clicks bubble b107
    │
    ▼
Fetch /pop?id=b107                    → raw {nodes, links, child_bubbles, source_segs, sink_segs}
    │
    ▼
Deserialize into records              → new NodeRecords + LinkRecords stored in Maps
    │                                   parent record's .inside set gets children added
    │
    ▼
Capture undo snapshot                 → save external link references + inside seg IDs on bubbleRecord.popData
    │
    ▼
viewState.expand()                    → unmap b107's segments, map child bubble segments
    │
    ▼
Filter visible segments               → exclude segs still owned by a collapsed sibling
    │
    ▼
Create elements from records          → kinks + internal links + inter-node links
    │
    ▼
removeNodeById(b107)                  → remove bubble from D3
addGraphData(children)                → add child nodes + links to D3
    │
    ▼
Select new nodes, publish event
```

### Unpop (collapse back)

```
User triggers undo on b107
    │
    ▼
Read bubbleRecord.popData             → childBubbles, insideSegs, externalLinkSnapshots
    │
    ▼
Find shared boundary segments         → check if any sibling is still popped
    │
    ▼
Remove all descendant nodes from D3   → recursive, but skip shared boundary segs
    │
    ▼
viewState.collapse()                  → unmap child segs, re-register parent segs (skip shared)
    │
    ▼
Restore external links                → from pre-pop snapshots, skip links to popped siblings
    │                                   regenerate elements from restored link records
    │
    ▼
addGraphData(bubble + links)          → add parent bubble node + external links back to D3
    │
    ▼
Clear popData, publish event
```

### Why undo needs snapshots

When a bubble is popped, the links that connected it to its neighbors are replaced by new links connecting the child nodes. When we unpop, we need to restore the original links. But the current state of `viewState` has changed (child bubbles are mapped), so we can't just re-resolve the raw links — we saved snapshots of the `sourceRecord`/`targetRecord` references before the expand happened.

---

## Record Persistence and Reuse

Records are never deleted — they accumulate in the lookup Maps. When the same ID appears again (from a new fetch or from re-expanding), the existing record is returned instead of creating a new one:

```javascript
// In updateExistingNodeRecords:
const records = nodeRecords.map(r => getNodeRecord(r.id) || r);
```

This means:
- A popped bubble's record stays in the Map even after it's removed from D3.
- When you unpop, the old record (with its elements and popData) is still available.
- Elements are regenerated as needed, but the record identity is stable.

Link records follow the same reuse pattern, with lazy element creation — elements are generated on first access if missing.

---

## Data Integrity

Before data reaches D3, it passes through cleanup:

1. **Deduplication** — removes duplicate `iid` entries (can happen when merging).
2. **Invalid link removal** — drops links whose source or target `iid` doesn't exist in the node set.
3. **Sort** — puts internal kink links (`class: "node"`) after inter-node links (`class: "link"`) so they draw on top.
