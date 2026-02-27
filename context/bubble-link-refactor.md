# Bubble Link Refactor — Problem Diagnosis

Diagnosis of complexity in the bubble/chain/link serialization layer, and options for cleanup. The goal is to minimize backend changes.

---

## The Three Complexity Layers

### Layer 1: Surface duplication in `BubbleJunction`

Every `get_*_links()` method in `BubbleJunction.py` repeats the same three-step pattern:

1. Filter the stored `(link_id, from_id, to_id)` tuples by `self.id in link`
2. Batch-fetch `Link` objects from SQLite via `fetch_links()`
3. Clone each link and manually set `from_id`, `to_id`, `from_type`, `to_type`

This boilerplate appears 4 times (`get_end_links`, `get_child_links`, `get_singleton_links`, `get_cross_links`). It can be extracted into helpers without changing any behavior.

There is also dead code: `classify_link()` in `construct_bubble_links.py` builds a `types` list (line 27) used only by a commented-out print statement.

**Impact:** Low — cosmetic complexity, no correctness risk.
**Fix:** Extract `_fetch_and_clone_links()` and `_make_three_variants()` helpers in `BubbleJunction`. Delete the `types` list in `classify_link()`.

---

### Layer 2: Type reconstruction at query time

When links are stored during preprocessing (`store_bubble_links()`), only `(link_id, from_id, to_id)` 3-tuples are saved. The `from_type`/`to_type` fields are **not** stored — instead, `BubbleJunction` reconstructs them at query time using per-category rules:

- `end_links`: "whichever end equals `self.id` gets type `b`"
- `child_links` / `cross_links`: "always produce all 3 variants (s→b, b→s, b→b)"
- `deletion_links`: "3 variants, but only from the source junction"

This means preprocessing knowledge leaks into the query layer. If 5-tuples `(link_id, from_id, to_id, from_type, to_type)` were stored instead, the `get_*_links()` methods would become filter → fetch → assign pre-computed types, with no per-category branching.

**Impact:** Medium — each `/pop` request reconstructs types for every link.
**Fix (backend-only):** Store 5-tuples in preprocessing; `get_*_links()` becomes dumb consumers. Requires touching `Bubble.add_*_link()`, `store_bubble_links()`, and re-preprocessing all datasets.

---

### Layer 3: The 3-variant pattern — the root architectural problem

`get_child_links()`, `get_deletion_links()`, and `get_cross_links()` each emit **3 copies** of every underlying GFA link, varying only in which ends are typed as `b` (bubble junction) vs `s` (raw segment):

```
variant 1:  from=raw_segment,     to=bubble_junction    (s→b)
variant 2:  from=bubble_junction, to=raw_segment        (b→s)
variant 3:  from=bubble_junction, to=bubble_junction    (b→b)
```

**Why?** When a bubble is popped, the rendered graph can have nodes in mixed representational states — some nodes are raw `s`-type segments, others are `b`-type bubble junctions. The frontend needs a matching link edge regardless of which combination of node types is currently present. So the backend pre-computes all possible type interpretations of the same conceptual edge and sends all three.

This triples the link count for those categories on every `/pop` response and is the root cause of `BubbleJunction`'s complexity. It also means the backend contains rendering-state logic that belongs in the frontend.

---

## Preferred Approach: Frontend Resolution (minimize backend work)

Instead of the backend emitting 3 variants, emit only the canonical `b→b` form for all link categories. The frontend resolves which link applies based on the current node state.

This is possible because the frontend already receives `contained` arrays on junction nodes — it knows which raw segment IDs are "inside" any given bubble junction. When the graph has both a raw segment node `s23` and a junction node `b5:0` that contains segment 23, the frontend can check incoming links against both representations.

**Backend change required:** None beyond removing the variant-generation code. The `b→b` form is already produced (it's `variant 3` above). The `s→b` and `b→s` variants can be dropped.

**Frontend change required:** When a link's `source` or `target` ID does not match any node in the current graph, look up the containing junction (or the contained segments) and remap the link endpoint. This resolution needs to happen in the link-binding step of the D3 graph, before links are drawn.

The frontend already has the data needed to do this: junction nodes carry `contained: [seg_id, ...]` and the node map is always available at render time.

---

## Execution Plan (preferred order)

1. **Layer 1 cleanup** — extract helpers, delete dead code. Safe, no behavior change. Confirms the test suite stays green.

2. **Frontend link resolution** — add endpoint remapping in the D3 graph link-binding step. Drop `s→b` and `b→s` variant generation from all `get_*_links()` methods. This is the key change.

3. **Layer 2 cleanup** (optional, after Layer 3 works) — store 5-tuples at preprocessing time to remove the remaining type-reconstruction logic from `BubbleJunction`.

---

## Key Files

| File | Role in this refactor |
|---|---|
| `pangyplot/objects/BubbleJunction.py` | Emits 3 variants; target for variant reduction |
| `pangyplot/objects/Link.py` | Serializes `source`/`target` with type prefix |
| `pangyplot/preprocess/bubble/construct_bubble_links.py` | Classifies and stores link categories |
| `pangyplot/objects/Bubble.py` | Stores 3-tuples per link category |
| `pangyplot/static/js/graph/` | Frontend graph; needs link endpoint resolution |
