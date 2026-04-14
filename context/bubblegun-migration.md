# BubbleGun integration — migration plan

> **Status (2026-04-14):** Phases 1–2 landed in a standalone repo;
> Phase 3 integration into pangyplot was attempted on branch
> `phase3-flat-bubble-integration` and reverted from `main` due to a
> ~50× regression in the SQLite children-resolution step. See
> "Post-mortem" at the bottom.

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

---

## What actually happened (2026-04-13 → 2026-04-14)

### Standalone harness (companion repo `/home/scott/projects/bubble_gun`)

Forked upstream BubbleGun to `github.com/ScottMastro/bubble_gun`, branch
`pangyplot-optimizations`. Applied pangyplot's existing perf patches
(type caching, precomputed parent-id frozensets, set-containment
`find_parents`), then built a test/perf harness alongside the library:

- `harness/run.py` — drives the pipeline on a fixture GFA with
  per-phase timing and RSS sampling.
- `harness/snapshot.py` — canonical JSON snapshot keyed by stable
  `(source, sink)` pairs; used as the DRB1 golden correctness contract.
- `harness/stats.py` — per-phase `ru_maxrss` delta + `/proc/self/statm`
  resident RSS, appended to gitignored `stats.jsonl` with git sha.
- Fixtures: DRB1-3123 (committed), chrY (symlinked, not committed;
  see `harness/fixtures/chrY.README.md`).

### Phase 1 — flat graph + compaction (standalone)

Delivered:
- `FlatGraph` (CSR adjacency + numpy attr arrays; see
  `harness/flat/graph.py`).
- `flat.load_gfa.load` — single-pass GFA → FlatGraph.
- `flat.compact.compact` — **one-shot unitig contraction** (not the
  incremental merge the plan originally described). Finds maximal
  compactable chains via union-find, walks each, emits a new
  FlatGraph. Much simpler than porting the legacy in-place merge.

Key decisions:
- **Seq fidelity skipped** — compact sums `seq_len` naively without
  overlap trimming. Pangyplot drops sequences before bubble finding,
  so merged seq content is unused downstream. Flagged for Phase 3 if
  an offline consumer ever needs faithful merged seqs.
- **Representative id = min member idx** — reproduces legacy's
  insertion-order-walk choice. Verified on DRB1: byte-identical
  bubble snapshot against the legacy golden.

chrY memory (Phase 1 only, via adapter → legacy find_bubbles):
- load RSS: 272 MB → 149 MB
- compact RSS: 269 MB → 160 MB
- find_bubbles RSS: 264 MB → **292 MB** (regression — adapter
  materialized a second Node dict, doubling live objects briefly)

### Phase 2 — flat find / connect / find_parents

Ported pangyplot-patched BFS and set-containment logic to operate
directly on FlatGraph CSR. Lightweight int-keyed namedtuples
(`FlatBubble`, `FlatChain`, `FindResult`) replaced BubbleGun Nodes on
the output side.

Deleted the Phase-1 adapter — dead code per user directive.

chrY after Phase 2:
- find_bubbles RSS: 292 MB → **183 MB** (now lower than legacy's 264 MB)
- total time: 11.4 s → 7.5 s (legacy 2.1 s; still slower due to pure-
  Python loops)

Correctness: DRB1 and chrY snapshots byte-identical between legacy
and flat paths.

### Optimization pass (harness)

Not in original plan — done opportunistically before attempting
pangyplot integration. Six commits, all optimization with golden
parity maintained:

| change | chrY win |
|---|---|
| `build_from_flat` key sig-index by chain_id int (was hashing huge chain-signature tuples) | 5.7 s → 0.4 s |
| CSR builders use `np.asarray(list)` instead of per-element numpy assignment | load 3.5 → 1.1 s; compact 4.1 → 1.4 s |
| BFS inner loop reads `tolist()` views of CSR (avoid per-edge numpy int32 boxing) | find_bubbles 1.4 → 1.1 s |
| `defaultdict(set)` direct in load (dedup fused with accumulation) | load 1.1 → 0.85 s |
| Inline CSR access in compact's `_compactable_map` + adjacency rewrite | compact 1.4 → 1.0 s |
| `precompute_parent_sets` reads `tolist()` slices, not generator | find_bubbles 1.1 → 0.94 s |

Final standalone result on chrY: **3.18 s vs legacy 2.16 s (1.44×)**.
Memory still ~45 % less than legacy throughout load/compact/find.

**Things that didn't work:**

- **Packed-int BFS keys** — replacing `(idx, side)` tuples with
  `(idx << 1) | side` ints. Noise-level, reverted.
- **Skip BFS from degree-1 seeds.** Saves ~30 % of find_bubbles
  invocations but changes the final `(source, sink)` orientation on
  chain-end bubbles (the skipped seed is what sets the last-write
  orientation that legacy expects). Kept it out — pangyplot tests
  depend on that orientation.

### Scale validation (still in standalone harness)

- **DRB1** (1k nodes): golden snapshot byte-identical every commit.
- **chrY** (166k nodes): flat/legacy snapshots byte-identical.
- **chrX** (pggb, 1.07 M bubbles): 356 MB snapshots byte-identical.
  Flat 82 s vs legacy 59 s. Per-phase memory ~45 % less; snapshot
  build pushed peak RSS over legacy briefly (harness-only issue,
  doesn't affect pangyplot integration).

### Phase 3 — pangyplot integration (reverted)

Attempted on branch `phase3-flat-bubble-integration` (5 commits).
Delivered end-to-end on DRB1 (587/587 tests passing) but hit a
performance cliff on chrY:

| step | pre-Phase-3 (fb3a25cb) | Phase 3 attempt |
|---|---|---|
| total chrY preprocessing | 26 s | 104 s |
| Indexing bubbles phase | 1.5 s | **79 s** |
| peak RSS | 776 MB | 595 MB |

**Memory dropped 23 % as intended.** But the
`construct_bubble_index` phase went 53× slower, driven almost
certainly by `resolve_children_sql`'s correlated subquery:

```sql
UPDATE bubbles
SET children = COALESCE((
    SELECT json_group_array(c.id)
    FROM bubbles c
    WHERE c.parent = bubbles.id
), '[]')
```

This runs the subquery per parent row without an index on
`bubbles.parent` — O(n²) scan. Unacceptable.

Main reverted to `fb3a25cb`. Phase 3 work preserved on branch
`phase3-flat-bubble-integration` for when we return.

### What Phase 3 shipped, for when we come back

- `pangyplot/preprocess/bubble/flat/` — the 8 modules vendored from
  the standalone harness with fixed imports and a
  `from_indexes(segment_idx, link_idx)` constructor that builds a
  FlatGraph from pangyplot's in-memory indexes (no GFA re-parse).
- `FlatGraph.members` — compact now persists per-unitig member id
  lists, so pangyplot's `source_segments`/`sink_segments` arrays can
  be reconstructed.
- `FlatGraph.n_count_by_id` — SegmentIndex doesn't cache n_count in
  memory; `from_indexes` collects it in its one pass.
- `bubble_gun.shoot()` rewritten to run the flat pipeline.
- `construct_bubble_index` rewritten to **chain-at-a-time streaming
  emission**:
  - Assigns bubble ids 1..N in (chain_id, chain_step) order
  - Builds pangyplot Bubble objects for the current chain only
  - Applies `correct_source_sink` along the chain
  - INSERTs in 10k-row batches with intermediate commits
  - Deferred children population to one SQL UPDATE
- `bubble_db.resolve_children_sql` + `finalize_bubble_table` helpers.
- Flat `connect_bubbles` walks chains from sorted endpoints
  (descending) with min-key bucket picks — deterministic and matches
  legacy's observed chain-walk direction on DRB1.
- One test (`tests/db/test_chain_polyline.py::_find_chain`) relaxed
  to look up chains by either endpoint, since walk direction is
  BubbleGun-implementation-defined.

### Required fixes before re-attempting Phase 3

1. **Kill the `resolve_children_sql` cliff.** Options:
   - Create `CREATE INDEX idx_bubble_parent ON bubbles(parent)`
     BEFORE the UPDATE. The correlated subquery is index-lookup then.
   - Or: build a `{parent_id: [child_ids]}` map in Python during
     emission (we already have parent_key per FlatBubble) and
     `executemany` an `UPDATE ... WHERE id = ?`. Avoids the SQL
     entirely.
   - Recommended: build the map during streaming emission (data is
     already in hand) and `executemany`. Simpler, faster, no
     reliance on SQLite's query planner.
2. **Reconsider the seed-prune optimization.** It was reverted
   because of chain-end orientation. With the children-cliff fixed,
   we could claw back the lost 12 % on find_bubbles by either:
   - Regenerating goldens that encode the flipped orientation.
   - Detecting chain-end bubbles in connect_bubbles and re-orienting
     source/sink to match the "skip introduced" flip.
3. **Run chrY with `/usr/bin/time -v` to confirm the index fix**
   before attempting chrX/chr9/chr1.
4. **Phase 4 as originally scoped** (release FlatGraph before
   polychain index; `malloc_trim`) becomes relevant only once chr9
   completes under the streaming path.

### Revised complexity estimate

The plan underbudgeted for pangyplot's existing cross-bubble state
(`correct_source_sink` along chain, `_clean_inside` propagating up
ancestors) which forced chain-grouped streaming rather than pure
per-bubble streaming. Not blocking — just an extra week of work
behind what the "streaming emission" phrasing implied.

Real remaining work to land in pangyplot (estimate from here):
- Fix `resolve_children_sql` — half a day.
- Re-run DRB1 + chrY validation — half a day.
- chr9 scale test + any fallout — 1–2 days.
- Phase 4 `malloc_trim` cleanup — half a day.
- chr1 acceptance — 1 day.

### Files / branches to know when resuming

- `phase3-flat-bubble-integration` in pangyplot — has the reverted
  Phase 3 commits, ready for cherry-pick after fixing the index.
- `/home/scott/projects/bubble_gun` repo, branch
  `pangyplot-optimizations` — standalone harness with DRB1 golden +
  chrY/chrX parity, optimization-commit history. **Source of truth
  for the flat implementation.** Vendor back into pangyplot when
  re-attempting integration.
- `harness/goldens/DRB1-3123.bubbles.json` in the standalone repo —
  still the correctness anchor.
