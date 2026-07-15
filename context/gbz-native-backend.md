# GBZ-native backend — make the GBZ the primary store

**Status:** in progress (branch `atlas-flow-pages`). Phase 1 underway.
**Goal:** the `graph.gbz` becomes PangyPlot's primary on-disk graph object. The
Python index classes stay as-is in API but read *from the GBZ* (via the C++
graphd) instead of SQLite/binpaths. This retires, per chromosome:

- `segments.db`  (SQLite)
- `links.db`     (SQLite)
- `*.binpath`    (path storage)

## What the GBZ provides vs. what stays

A GBZ = `GBWT` (paths + topology-as-edges) + `GBWTGraph` (node DNA + node→segment
translation). It has **no 2D coordinates** — those come from a user-managed
layout file (the gbz→`.lay.tsv` tool is done; PangyPlot just consumes the TSV).

| data | source in the GBZ-native world |
|---|---|
| segment scalars (length, gc, n) | computed once from GBZ node DNA → mmapindex npy cache |
| segment coords (x1,y1,x2,y2) | **layout file** (user-managed), merged into the npy cache |
| segment DNA (`seq`) | on demand from the mmap'd GBZ (see sequence-memory note) |
| links (from/to + strands) | `GBWT::edges()`, collapsed to segment level via the translation |
| segment / link frequency | `find(node).size()` — the `/count` the graphd already serves |
| paths / walks | GBWT `/walk` (already live via `GbwtPathIndex`) |
| **bubbles / chains** | still PangyPlot-computed → `bubbles.db` (stays) |
| steps (ref bp→segment) | derived from the reference walk + segment lengths |
| skeleton / polychain | derived from the indexes (unchanged) |

## Why this fits the existing design (hydrate-scalars)

`SegmentIndex` / `LinkIndex` already run at query time off small mmap'd **npy
arrays** (`segments.mmapindex/`, `links.mmapindex/`), not SQLite — SQLite is only
their *build source*. `PathIndex` is already a pure interface over the graphd
(`GbwtPathIndex` → `/walk`, no binpaths). So the change is narrow:

- Add a sibling **`_build_from_gbz`** that fills the *same* npy arrays from the
  graphd's bulk export + the layout file. (`length`, `gc_count`, coords, `valid`
  for segments; adjacency for links.) The array runtime + accessors are unchanged.
- Re-point the still-SQLite paths — `SegmentIndex.__getitem__` / `__iter__` (the
  bubble builder iterates this, *with sequences*) / `segment_gc_n_count` n_count,
  and `LinkIndex._load_links` — at the GBZ instead of `segment_db`/`link_db`.

The decision is **hydrate-scalars**, not a pure live facade: whole-graph
consumers (bubble builder, skeleton) iterate every segment/link, so the small
scalar arrays are warmed once from a bulk GBZ pull; only DNA and walks stay lazy.

## The one new memory wrinkle: serving DNA

gc/n/length go into the scalar cache (computed once), but on-demand `seq` at serve
time reads the GBWTGraph `sequences` StringArray, which loads **resident** by
default (~GBs whole-genome). To keep serving lean, `sequences` must be **mmap'd**
the same way the fork already did for the BWT (`RecordArray` → `ByteView`). Until
then, graph mode loads sequences resident (fine for small graphs / preprocessing).
Everything else is `gbwt`-only — no gbwtgraph, no handlegraph, no vg.

## graphd additions (the "Stage 5" bulk endpoints)

Opt-in **graph mode** (`--graph`), so pure path-serving stays lean:

- `GET /segments` → binary bulk, per segment `{i64 id, i64 length, i64 gc, i64 n}`
  (coords are the layout file's job, not the GBZ's).
- `GET /links` → binary bulk, per link `{i64 from_id, i64 from_strand(0=-,1=+),
  i64 to_id, i64 to_strand}`, chop-internal edges dropped, deduped.
- (`/sequence?id=` for on-demand DNA — pairs with the mmap'd StringArray work.)

Segment enumeration: `node_to_segment.one_begin()..one_end()` gives each segment's
node range `[start, limit)`; segment id = `atoi(segments.str(rank))`; forward DNA =
concat of `sequences.view((2*v - firstNode())/2)` for `v in [start,limit)`. With no
translation (unchopped GBZ) each node id is its own segment.

## Phases (each fixture-gated on DRB1: GBZ-built == GFA-built)

1. **graphd `/segments` + `/links`** (graph mode) — parity: sets match the
   GFA-built `segments.db` / `links.db` scalars.  ✅ done
2. **`SegmentIndex`/`LinkIndex` `_build_from_gbz`** behind the same API. ✅ done
   - `SegmentIndex._build_from_gbz` ✅ (scalar arrays length/gc/**n**/valid match
     `segments.db`; `n_count` promoted into the resident arrays so gc/n need no
     SQLite; coords come from the layout file, keyed by segment id).
   - `LinkIndex._build_from_gbz` ✅ (`/links` is bidirectional; canonicalize each
     RC pair to one link via `min(link, rc)`, then the shared `_build_arrays`
     bidirected adjacency. Parity: same link count + identical bidirected
     side-pair edge set as `links.db` — the RC-invariant the bubble builder reads.
     Byte-identical link *rows* are not the target and not achievable, since the
     GFA's per-link direction choice is arbitrary.)
   - Still SQLite-backed (Phase 4 / needs `/sequence`): `SegmentIndex.__iter__` /
     `__getitem__` (bubble builder reads these *with DNA*). `GFAIndex`/`add` don't
     yet pass a client — the wiring is Phase 3.
3. **`add --gbz`** (GBZ-native ingest): adopt GBZ + layout → run bubbles/skeleton
   off the GBZ-backed indexes.  ← in progress
   - GBZ-backed **iteration** ✅ — `SegmentIndex.__iter__`/`__getitem__` and
     `LinkIndex.__iter__`/`__getitem__` now yield `Segment`/`Link` objects from the
     resident arrays when a client is set (no `segments.db`/`links.db`). The flat
     bubble backend (default) reads only length/gc/n/coords + link topology, so it
     runs off these; `Segment.seq` is None (the BubbleGun backend, which needs DNA,
     needs a `/sequence` endpoint — deferred). Bubble *detection* already matches
     the GFA exactly (599/234/41 on DRB1).
   - **StepIndex from the GBZ** ← next. Bubble *indexing* builds `StepIndex(chr_dir,
     ref).segment_map()` (reference bp→step ranges land in `bubbles.db`), which a
     GBZ dir lacks. Derive steps from the reference path walk (`/walk`) + segment
     lengths + ref offset. Unblocks full `bubbles.db` parity.
   - Then: `add --gbz` orchestration (adopt GBZ → spawn graphd `--graph` → build
     GBZ-backed indexes + layout → bubbles → skeleton), layout keying (node-layout
     → per-segment coords via the translation), and `bubbles.db`/skeleton parity.
4. **Retire** `segments.db` / `links.db` / `*.binpath` for GBZ-native datasets
   (GFA-native stays as the legacy loader). Mmap the `sequences` StringArray.

## The link RC-twin question (resolve empirically in Phase 1/3)

GBWT edges are bidirectional, so each GFA link `L A + B +` also appears as its
reverse-complement `B - A -`. GFA stores it once. Whether `/links` should emit the
canonical form once or both directions depends on what `LinkIndex`/the bubble
builder expect for the bidirected graph — validate against DRB1 `bubbles.db`.
