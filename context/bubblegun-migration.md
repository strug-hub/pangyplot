# BubbleGun integration — migration plan

## Why

BubbleGun is vendored under `BubbleGun/` and used through
`pangyplot/preprocess/bubble/bubble_gun.py` → `construct_bubble_index.py`.
Its data model is pointer-heavy Python: every `Node` is a full Python
object with an `optional_info` dict, `start`/`end` adjacency sets of tuples,
and a `compacted` list of node references. Bubbles hold lists of Node
*references*.

At HPRC scale this blows up:

| chr | indexing_bubbles | peak RSS | notes |
|---|---|---|---|
| chrY | 2 s | 1 GB | small |
| chrX | 30 s | 11 GB | |
| chr9 | ~40 min | 13 GB | swap thrash kicks in |
| chr1 | fails (hangs) | 15+ GB | swap cliff, 30-min single-bubble stall |

Profiling (cProfile + py-spy) showed 72% of indexing time in
`collapse_ranges` on the old code (fixed Nov 2025), then the next stall
was pure swap thrash: a 1-bp, 2-seg bubble took 30 minutes because GC
fired against 13 GB of scattered pointer-heavy objects and had to page
them back in.

Fixing that structurally requires touching BubbleGun itself — the
pointer-heavy data model is the root cause.

## Scope

Replace BubbleGun's in-memory representation of graph, nodes, bubbles,
and chains with **flat integer / numpy structures**, then stream bubble
emission into SQLite directly so no 2.8M-object Python list is ever
held in memory at once.

The algorithm (BFS-based bubble/chain/parent discovery) stays the same.
Only the data structures and emission pipeline change.

## Target architecture

```
parse_gfa  ──►  int64 adjacency (CSR)  +  numpy attr arrays
                       │
                       ▼
            find_bubbles / connect_bubbles / find_parents
            (operating on int ids, not Node refs)
                       │
                       ▼
            yield bubble {id, parent_id, chain_id, step,
                          source_id, sink_id,
                          inside_ids: array,
                          compacted_ids: array}
                       │
                       ▼
            create_bubble_row (no Bubble class intermediate)
                       │
                       ▼
            INSERT INTO bubbles  (streamed, batched 10k/tx)
```

**Peak RSS target: ~4 GB** (down from ~13 GB). chr1 fits comfortably on
a 16 GB box, stays off swap.

## Phases

### Phase 1 — flat data layout for the graph (isolated)

Work in a scratch directory (e.g. `experiments/bubblegun_flat/`)
containing a vendored copy of the current BubbleGun + a small fixture
dataset (DRB1-3123 + chrY).

Replace:
- `Node` class → numpy arrays indexed by seg id:
  - `seq_len: int32[n]`
  - `gc_count: int32[n]`, `n_count: int32[n]`
  - `x1, x2, y1, y2: float32[n]`
- Adjacency sets → CSR arrays: `indptr: int64[n+1]`, `neighbors: (id, side) int32[2*m]`
- `optional_info["compacted"]` → per-seg list stored in a separate
  `compacted_offsets + compacted_ids` flat structure, built during
  `compact_graph`.

Migrate `compact_graph.py` to operate on the flat adjacency (merges
become array edits). Verify it produces the same graph topology as the
object-based version on DRB1.

**Validation**: run BubbleGun BFS on both representations for the
fixture; the bubble sets must match exactly.

### Phase 2 — bubble/chain finder on flat representation

Rewrite `find_bubbles.py`, `connect_bubbles.py`, `find_parents.py`
against the flat representation. The BFS state (`seen`, `visited`,
`S`, `nodes_inside`) becomes numpy arrays or sets of ints.

Bubbles emitted as lightweight Python tuples / namedtuples, not class
instances.

**Validation**: bubble ids, parent relationships, chain membership must
match the old implementation on DRB1 + chrY. Add a golden-output test.

### Phase 3 — streaming emission

Rework `construct_bubble_index` so it consumes a generator of bubble
records and inserts them directly into SQLite, batched per chain.
No `bubbles[]` list. No intermediate `Bubble` class. `find_children`
becomes a single SQL `UPDATE` grouping by `parent`.

Keep the existing `Bubble` class for the read path (downstream still
uses it for serve-time lookups). Split "write-time bubble" (transient
record) from "read-time bubble" (full Python object).

**Validation**: diff chr9's resulting `bubbles.db` between old and new
implementations. Must be byte-identical after normalization of JSON
field ordering.

### Phase 4 — drop graph after extraction

Once bubbles are streamed to SQLite, delete the flat graph arrays
(or at least the compacted/optional_info tables). Release memory
via `del` + `gc.collect()` + `malloc_trim(0)` before starting the
polychain index step.

**Validation**: RSS at start of `building_polychain_index` should be
≤ 3 GB on chr1. Measure via the existing log.write_timings.

### Phase 5 — C / Cython BFS (optional, measure first)

If Phase 2's Python BFS is still slow on chr1-scale graphs, port the
inner BFS loop to Cython. The flat data layout makes this mechanical —
numpy arrays pass directly to C.

Defer until 1-4 land; likely unnecessary.

## Validation strategy

### Fixture datasets

1. **DRB1-3123** — existing test fixture, ~1k segs. Fast feedback during
   dev. Unit tests must stay green.
2. **chrY (HPRC)** — ~100k segs, runs in <1 min. Integration canary.
3. **chr9 (HPRC)** — 11M segs. Scale test; catches swap-regime issues.
4. **chr1 (HPRC)** — 15M segs. Final acceptance.

### Test matrix

For each fixture and each phase, compare against the current main:

- Bubble count and ids identical
- Parent/child relationships identical
- Chain membership + chain_step identical
- `range_exclusive` / `range_inclusive` identical
- `bubbles.db` byte-identical (after field-order normalization)
- Downstream `PolychainIndex` output identical
- All 587 existing pytest tests still pass

### Performance targets

On 16 GB box, chr9:

| | Current (post Nov 2025 fixes) | Target |
|---|---|---|
| parse_gfa | 17 min | 17 min (unchanged) |
| BubbleGun load + compact | 2 min | 30 s |
| find_bubbles | 40 min | 5 min |
| indexing_bubbles | 40 min | 2 min |
| peak RSS | 13 GB | ≤ 4 GB |
| chr1 completes? | no (hangs in swap) | yes (<30 min total) |

## Rollback plan

Phases 1-4 are independent. If phase N regresses behavior, revert just
that phase — earlier phases stay landed. The flat graph representation
from phase 1 is a pure refactor with no visible behavior change; phase
2+3 are the behavioral changes that matter.

Keep the old BubbleGun code in place under `BubbleGun/` during the
migration. Switch `pangyplot/preprocess/bubble/bubble_gun.py` via a
feature flag (`PANGYPLOT_NEW_BUBBLEGUN=1`) until chr1 validation passes,
then flip default and delete the old path.

## Effort estimate

| Phase | Effort | Risk |
|---|---|---|
| 1 flat data | 3-4 days | low |
| 2 flat BFS | 4-5 days | medium (algorithm re-verification) |
| 3 streaming emission | 2-3 days | low |
| 4 drop graph | 1 day | low |
| 5 Cython BFS | 3-4 days | defer |
| **Subtotal (1-4)** | **~2 weeks** | |

## Out of scope (for this migration)

- Replacing the SQLite bubble schema
- Changing the `PolychainIndex` / `Skeleton` build pipeline
- Changing the read-side `Bubble` class used by `query.py`
- Rewriting the `StepIndex` or `GFAIndex`

These remain object-based and are fast enough; the swap cliff is
specifically in `construct_bubble_index` + its BubbleGun dependency.

## Critical files

Current (to be migrated / superseded):
- `BubbleGun/Graph.py`, `BubbleGun/Node.py`, `BubbleGun/Bubble.py`,
  `BubbleGun/BubbleChain.py`
- `BubbleGun/find_bubbles.py`, `BubbleGun/connect_bubbles.py`,
  `BubbleGun/find_parents.py`
- `pangyplot/preprocess/bubble/bubble_gun.py`
- `pangyplot/preprocess/bubble/compact_graph.py`
- `pangyplot/preprocess/bubble/construct_bubble_index.py`

New (proposed):
- `pangyplot/preprocess/bubble/flat_graph.py` — CSR adjacency + attr arrays
- `pangyplot/preprocess/bubble/flat_bubbles.py` — BFS bubble finder on flat graph
- `pangyplot/preprocess/bubble/stream_index.py` — streaming SQLite emission

## Open questions

- Does BubbleGun upstream still get updates? If yes, we'd need to keep
  the vendored copy for compatibility with any future BubbleGun file
  format changes. If no (last commit check), divergence is safe.
- Are there any users depending on the in-memory BubbleGun graph post-
  indexing for other purposes? (grep shows no — only `construct_bubble_index`
  consumes `graph.b_chains`.)
