# BubbleGun: flat representation

Replace BubbleGun's object graph with flat int arrays. Python, not Rust.

Supersedes the Rust-port question in [[bubblegun-migration]]. The wall-clock case
for a native port died when the pipeline went 473.7s → 237.2s in pure Python
(gzip level, batched projection, int-returning binpath decode); BubbleGun is now
only ~51s of 237s, so even a *perfect* port buys 1.24× overall. The surviving
case is memory, and the memory win comes from the **data layout**, not the
language. Rust would buy the constant factor on top — after this, if ever.

## The seam is free

`bubble_gun.shoot(segment_idx, link_idx, chr_path, ref)` is the only entry point,
and **every caller discards its return value** — `commands/add.py:55` plus all
five test modules call it bare. The BubbleGun object graph never escapes the
function. Its only observable output is `bubbles.db`.

So this is a pure internal swap: no API to preserve, and one artifact to diff.

## Where the memory goes

Measured on v2 chrY (1,046,775 nodes / 1.39M links), peak RSS 3.23 G:

| step | Δ RSS |
|---|---|
| Loading BubbleGun | +1.06 G |
| Finding bubbles and chains | +0.58 G |
| Indexing bubbles | +0.49 G |
| **`Finding bubbles` section** | **+2.06 G** |

RSS drops back to 1.21 G immediately after, so that whole 2.06 G is transient
BubbleGun state. Modelling it per node (`sys.getsizeof` on a representative
`Node`, degree 2.65):

| component | B/node | note |
|---|---|---|
| `start` + `end` — two Python `set`s | 432 | 216 B each *before any element* |
| `start_parent_ids`/`end_parent_ids` frozensets | 432 | allocated in `_precompute_parent_ids` |
| `Node` object (9 `__slots__`) | 312 | |
| `optional_info` dict + 4 boxed floats + list | 272 | 7 keys, per node |
| edge tuples `(id, dir, overlap)` | 170 | |
| `id` string | 48 | |

Measured is 1,087 B/node for `Loading BubbleGun` against ~1,386 modelled for the
same components — right magnitude, right shape. And the 432 B/node of frozensets
lands at 0.42 G, which is most of the +0.58 G measured for `Finding bubbles and
chains`.

**Every top cost is a container, not data.** None of it is the graph payload.
The segment ids are already `int`s — `to_bubblegun_obj` calls `str(segment.id)`
and `construct_bubble_index` calls `int(node.id)` right back.

## The representation

Nodes become dense indices `0..N-1`; `id_of[i]` (int32) maps back to segment id.
Adjacency becomes CSR, one per side of the bidirected graph:

```
id_of, seq_len, gc_count, n_count   int32   × N
x1, x2, y1, y2                      float32 × N
visited                             uint8   × N
start_ptr, end_ptr                  int32   × (N+1)
start_nbr, end_nbr                  int32   × E      # E ≈ 2.65 N
start_dir, end_dir                  uint8   × E
```

At v2 chrY scale that is **~57 MB**, against **1.06 G** today — ~19×.

Two things fall out for free:

- **`_precompute_parent_ids` disappears entirely.** "Are all of `u`'s parents
  visited?" stops being a `frozenset` subset test and becomes a slice:
  `visited[start_nbr[start_ptr[u]:start_ptr[u+1]]].all()`. Zero allocation, and
  −0.42 G.
- **`optional_info` disappears.** The seven per-node dict keys become seven
  columns. The `compacted` lists stay as a side CSR built during compaction.

Bubbles get the same treatment: `bubble_source[]`, `bubble_sink[]` int32 arrays
plus an `inside_ptr`/`inside_idx` CSR. `Bubble.__key` — today a tuple of two
*strings*, compared with `>` — becomes `(max << 32) | min` in an int64, so dedup
is `np.unique` or one int-keyed dict instead of a hash of a string pair.

`Indexing bubbles` (+0.49 G) should stream: `construct_bubble_index` currently
accumulates every domain `Bubble` into one `bubbles` list before
`db.insert_bubbles`. Chunk it.

## What it's worth — and what it is not

Projected peak on v2 chrY: **3.23 G → ~1.9 G**. The 2.06 G BubbleGun delta
collapses to roughly 0.3 G, and the new ceiling is whatever the parse phase
leaves resident (1.59 G) contested by the skeleton phase (1.67 G).

**This alone does not make v2 chr1 fit on a 15 GB box.** It removes the single
largest node-proportional term, but the ~1.2–1.6 G floor that survives the bubble
phase is a *separate* problem, and I have not decomposed its node-vs-step
scaling — `SegmentIndex`/`LinkIndex` are already flat numpy (~25 B/segment), so
that floor is parse-time transients plus allocator retention, not fat objects.
Attack it only after this, and only with a measurement first.

Order of operations, if chr1 is the goal:
1. this — the biggest, best-understood, node-proportional term
2. re-run `benchmark_memory.py` on v2 chrY and re-fit the slope
3. *then* decide whether the parse floor needs work, or Rust, or neither

## Validating it

`tools/fingerprint_bubbles.py` canonicalizes `bubbles.db` and hashes it, so
old-vs-new is one command:

```
python tools/fingerprint_bubbles.py old/chrY new/chrY
```

This only works because bubble/chain ids are deterministic (bd5914ff) — before
that commit the ids permuted on every build and no such diff was possible. That
commit is the thing that makes this rewrite safe to attempt.

Canonicalization is not "sort everything", which would hide real bugs:

- `children`, `inside` — set-derived, sorted before hashing
- `source`, `sink` — `[primary, *compacted]`; head compared positionally, tail sorted
- `siblings` — a positional `[prev, next]` pair (either may be null), verbatim
- `range_exclusive`, `range_inclusive` — ascending from `collapse_ranges`, verbatim
- `x1/x2/y1/y2` — rounded to 4dp; the layout coords are float32 upstream

Verified on the DRB1 fixture: identical fingerprint `e26e6704ffe5384c` (874
bubbles) across `PYTHONHASHSEED` 1/42/31337, and a negative control confirms it
tolerates a reordered `inside` set while catching a swapped sibling pair and a
changed set.

Ladder: DRB1 fixture → v1.1 chrY → v2 chrY. Fingerprint must be identical at
every rung, and `pytest tests/` (704) + vitest (256) stay green.
