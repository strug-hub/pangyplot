# Bubble Link System (ARCHIVED)

> **This document is historical.** The BubbleJunction class, Chain.serialize(), Chain.get_chain_links(), and the 3-variant link pattern described here were all deleted in the canonical s→s link refactor. The backend now returns pure GFA s→s links; link resolution happens on the frontend via `viewState`. See `backend-query.md` for the current architecture.

Developer notes on the pre-refactor bubble/chain/link serialization layer.

---

## Core Concept

A **bubble** is a divergence+reconvergence in the pangenome graph (a variation site). Multiple bubbles along the same path form a **chain**. When the frontend displays a region, it shows collapsed bubbles with chain links between them. When a bubble is "popped" (expanded), it shows its internal structure: junction nodes, internal segments, and all connecting links.

The link-generation code is **lazy** — links between bubbles are not stored in the database. They are computed on-demand from the raw GFA segment-level links that were classified and stored on Bubble objects during preprocessing.

---

## Five Link Categories Stored on Each Bubble

These are populated by `preprocess/bubble/construct_bubble_links.py` during preprocessing and persisted to `bubbles.db`.

| Field | Type | Meaning |
|---|---|---|
| `deletion_link` | single link_id or None | A direct segment→segment shortcut from bubble source to bubble sink (skips the bubble entirely) |
| `end_links` | `[(link_id, from_id, to_id), ...]` | Links connecting the inside of the bubble to its source or sink end |
| `child_links` | `[(link_id, from_id, to_id), ...]` | Links from the parent bubble's ends to the ends of nested child bubbles |
| `singleton_links` | `[(link_id, from_id, to_id), ...]` | Links to segments that aren't captured by any bubble (orphan segments at chain ends) |
| `cross_links` | `[(link_id, from_id, to_id), ...]` | Links between ends of bubbles that belong to different chains |

In each tuple, `from_id`/`to_id` are either:
- A raw segment ID as a string: `"23"`
- A bubble-end string: `"5:0"` (source of bubble 5) or `"5:1"` (sink of bubble 5)

---

## How Links Get Classified: `construct_bubble_links.py`

`store_bubble_links(link_idx, bubbles)`:
1. Builds `node_to_bubbles[segment_id]` → set of `(bubble_id, role)` where role is `source=0`, `sink=1`, or `inside=2`
2. For every GFA link, calls `classify_link(link, from_bubbles, to_bubbles)`:

```
Both ends in the SAME bubble:
  {inside, inside}           → internal (ignored)
  {source/sink, source/sink} → deletion link (source→sink shortcut)
  {source/sink, inside}      → end link

Different bubbles, parent-child:
  {end, end}                 → child link (on the parent bubble)
  {inside, end}              → singleton (parent inside → child end)

Different bubbles, same chain (adjacent):
  {sink/source, inside}      → chain link (but NOT stored — computed lazily from end_links)

Different bubbles, different chains:
  {end, end}                 → cross link

One end in no bubble:
  {end, segment_not_in_bubble} → singleton link
```

Chain links are not stored explicitly. When a chain link is needed, `Bubble.get_chain_link()` finds all `end_links` at the relevant bubble end and combines them.

---

## BubbleJunction: The Collapsed Bubble End

A `BubbleJunction` represents one end (source `:0` or sink `:1`) of a bubble. It aggregates the segments at that end into a single visual node.

```python
junction.id         # "5:0" or "5:1"
junction.contained  # set of segment IDs at this end
junction.is_chain_end  # True if at chain boundary (no neighbor bubble)
```

`bubble.emit_junctions(gfaidx)` → `[source_junction, sink_junction]`

### Method Map

| Method | When called | What it returns |
|---|---|---|
| `get_end_links()` | When bubble is popped | seg→junction and junction→seg links connecting internals to this end |
| `get_chain_links()` | When bubble is popped | [chain_link_to_neighbor, self-destruct marker] |
| `get_deletion_links()` | When bubble is popped | 3 variants: b→b, s→b, b→s (only from source junction) |
| `get_child_links()` | When bubble is popped | 3 variants per child: s→b, b→s, b→b connecting to nested bubbles |
| `get_singleton_links()` | At chain end | Links to orphan segments not in any bubble |
| `get_cross_links()` | At chain end | 3 variants: b→b, b→s, s→b to other chains |
| `get_chain_terminal_link()` | At chain end | Chain link to self (with self.id filling the None neighbor) |
| `get_self_destruct_link()` | When chain-end bubble is popped | Self-loop link: `id → id` with type "self-destruct" |

**`get_popped_links()`** (called for every junction when `/pop` is invoked):
```python
return self.get_chain_links() + get_deletion_links() + get_end_links() + get_child_links()
```

**`get_chain_end_links()`** (called for chain-end bubbles in `/select` response):
```python
return self.get_singleton_links() + get_cross_links() + get_chain_terminal_link()
```

---

## How Chain Links Are Assembled

`Bubble.get_chain_link(gfaidx, source=False)`:

1. Picks `end_id = "bubble_id:0"` (source) or `"bubble_id:1"` (sink)
2. Finds all `end_links + child_links` that contain `end_id`
3. Fetches the actual `Link` objects from SQLite via `gfaidx.get_links_by_id()`
4. Clones the first link, combines all subsequent links via `combine_links()` (bitwise OR of haplotypes, sum counts)
5. Calls `update_to_chain_link((prev_bubble_id, next_bubble_id), sink_segments, ...)` — replaces IDs with bubble IDs
6. Calls `make_bubble_to_bubble()` — sets `from_type = to_type = "b"`
7. Returns the chain link, or `None` if no end_links exist at that side

The chain link's `contained` field holds `sink_segments` (the segment IDs at the junction between the two bubbles), and `length/gc_count/n_count` reflect those segments.

---

## Link ID Coordinate System

Links live in a mixed coordinate space:

| Value | Meaning | Example |
|---|---|---|
| Integer segment ID | Raw GFA segment | `23` |
| String segment ID | Segment stored as string | `"23"` |
| `"bubble_id:0"` | Source end of a bubble | `"5:0"` |
| `"bubble_id:1"` | Sink end of a bubble | `"5:1"` |

**Link.id()** format: `"{from_type}{from_id}{from_strand}{to_type}{to_id}{to_strand}"`
- Segment-to-segment: `"s1+s2+"`
- Bubble-to-bubble: `"b5+b6+"`
- Segment-to-bubble: `"s23+b5:1+"` (segment 23 → sink of bubble 5)

**SQLite storage** (`link_db.py`): stores link IDs WITHOUT type prefix (`"1+2+"` not `"s1+s2+"`). `get_link()` strips "s" characters from the key before querying.

---

## `/select` vs `/pop` Response Content

| | `/select` | `/pop` |
|---|---|---|
| **Nodes** | Bubble nodes + chain-end BubbleJunctions only | All BubbleJunctions + interior segments + nested bubbles |
| **Links** | Chain links (b→b) + chain-end links | Popped links from each junction + interior segment links + nested chain links |
| **Code path** | `BubbleIndex.get_top_level_bubbles()` → `Chain.serialize()` | `BubbleIndex.get_popped_subgraph()` |

---

## Known Quirks

### Chain-end junctions produce links with None IDs
When a bubble is at a chain boundary (e.g., first or last in chain), `get_chain_link()` is called but `siblings[0]` or `siblings[1]` is None. This produces a chain link with `from_id=None` or `to_id=None`. These are handled by `get_chain_terminal_link()` which replaces None with `self.id` for the top-level view, but `get_chain_links()` (called from `get_popped_links()`) may produce links with None IDs for the popped view. These are likely filtered or tolerated by the frontend.

### `get_popped_links()` excludes singleton and cross links
When a bubble is expanded (popped), its singleton and cross links are NOT included in the response — only chain, deletion, end, and child links. Singleton/cross links only appear in the top-level chain view. This means some external connections may not be visible when a bubble is popped.

---

## Key Files

| File | Purpose |
|---|---|
| `pangyplot/objects/Bubble.py` | Bubble domain object; stores link categories; `get_chain_link()` |
| `pangyplot/objects/BubbleJunction.py` | Collapsed bubble end node; all `get_*_links()` methods |
| `pangyplot/objects/Chain.py` | Ordered bubble sequence; `get_chain_links()`, `serialize()` |
| `pangyplot/objects/Link.py` | Graph edge; `clone()`, `combine_links()`, `serialize()`, `update_to_chain_link()` |
| `pangyplot/preprocess/bubble/construct_bubble_links.py` | `classify_link()` + `store_bubble_links()` — populates bubble link categories during preprocessing |
| `pangyplot/db/indexes/BubbleIndex.py` | `get_top_level_bubbles()`, `get_popped_subgraph()`, `create_chains()` |
| `tests/test_bubble_links.py` | Unit/integration tests for all the above |
| `tests/fixtures/mini_bubble.gfa` | Two-bubble chain fixture (7 segs, 8 links, 2 paths) |

---

## Test Coverage

`tests/test_bubble_links.py` covers:
- `Link.clone()` — all fields including gc_count/n_count (regression for Bug 1)
- `Link.combine_links()` — haplotype OR, field accumulation
- `Link.serialize()` — source/target format, link types, deletion flag
- `BubbleJunction.get_end_links()` — count, types, from/to type assignment
- `BubbleJunction.get_chain_links()` — correct output + None guard (regression for Bug 2)
- `BubbleJunction.get_deletion_links()` — 3 variants, source-side only
- `Chain.get_chain_links()` — main B1→B2 link structure, contained segments
- `Chain.serialize()` — node count, types, chain link presence
