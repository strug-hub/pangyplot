# GBWT path model — migration plan

> **Status (2026-07-15):** scoping. Branch `gbwt-migration`. Scope decision:
> **staged, both** — ship the near-term wins that need no C++, then graduate to
> a GBWT-backed query-time model. The C++ serving-integration shape is an open
> decision gated to Stage 3 (see §7).
>
> **Stage 1 landed (2026-07-15):** per-link `haplotype`/`reverse` masks dropped
> from schema, inserts, `Link`, serialization, and 4 frontend passthroughs;
> dead `combine_links`/`get_haplotype_presence` + uncalled `parse_links()`
> removed; `frequency` (mask popcount) preserved. 721 pytest + 256 vitest green;
> new code reads old-schema datastores (re-ingest for a clean schema). Net
> −165 / +9 lines across 9 files.
>
> **Stage 3 spike ran (2026-07-15):** on a v2 chrY GBZ (1614 haplotypes),
> presence-counts are ~57 ns/node, depth-independent (30 µs–1.1 ms/viewport),
> 107 MB RSS. Decisions: adopt GBWT for **Query A** counts as a **Rust sidecar**;
> keep **Query B** on Stage 2's pure-Python slice; no C++ `locate` needed. See
> the Stage 3 RESULTS block.
>
> **Stage 2 landed (2026-07-15):** region-scoped trace via `/path-data` +
> `start`/`end` (Option A). `query.region_segment_ids` (step-range + full bubble
> closure, ID-order-independent) + `get_path_region_raw` slice/re-encode;
> dead `get_between`/`get_segment_range` removed. This is also the `/path`
> monotonicity fix. Tests: DRB1 integration + non-monotonic-ID regression
> (pytest) + resolver-invariance (vitest). 727 pytest + 259 vitest green.
> Verified end-to-end on chrY: 50 kb window → 113 steps/72 B vs whole-path
> 78 341 steps/18 478 B.

## 1. Thesis — what GBWT is actually for here

The naive pitch ("GBWT compresses paths better than our `.binpath`") is the
*weakest* case, and the code shows why:

- `.binpath` files are per-sample and fetched **on demand, one at a time**, and
  `/path-data` ships the **raw gzip bytes with zero server decode**
  (`routes.py:387`, `path_db.read_binpath_raw`). GBWT can't ship a pre-gzipped
  blob; every retrieval is a decode. Adopting it *for path storage* trades away
  the zero-CPU serving design for a compression win on data that isn't resident.

The real case is two things GBWT is genuinely built for:

1. **Replace the always-resident, sample-count-scaling, currently-UNUSED
   per-link presence mask** with query-time reconstruction. Every link stores
   two N-bit hex masks — `haplotype` and `reverse` (`link_db.py:28-29`) — built
   from the expensive `path_dict` pass, serialized on every link, OR-ed up the
   bubble hierarchy by `combine_links` (`Link.py:121`)... and **read nowhere**.
   No frontend code reads `.haplotype`; `get_haplotype_presence` (`Link.py:116`)
   has zero callers and a `#todo: test and verify`. It is O(edges × samples)
   of resident, replicated, dead data — the worst-scaling term in the core
   graph, and the best GBWT target.

2. **Enable a region-scoped, all-haplotype query model** to replace the
   whole-path-download-and-discard model. Today: pick a sample from *all* of
   them (`/samples`), download its whole subpath, decode every step, then
   `resolvePathByBoundaries` **`continue`s past every step not on screen**
   (`path-trace-boundary-resolver.js:81`). Work scales with path length; it
   should scale with what's visible.

## 2. The two queries we actually want

- **Query A — "which samples are on screen?"** (location → samples). A GBWT
  `locate` over the visible node set. For a well-formed bubble this reduces to a
  single-node locate on its source/sink segment.
- **Query B — "trace this sample through the visible region"** (sample +
  node-range → walk-slice). A region-scoped GBWT `extract`.

Both are node-range-keyed and cross-sample — the GBWT sweet spot, and precisely
what the current per-sample-whole-path model sidesteps.

## 3. Target architecture — GBWT *alongside*, not *inside*

GBWT's alphabet is oriented **segment** IDs; sequences are flat haplotype walks.
It has **no primitive for bubbles/nesting** — and shouldn't. This is the proven
vg layering:

```
GBWT            flat haplotype index over segment walks   (no bubbles)
gbwtgraph       + sequence + topology
BubbleIndex     the hierarchical bubble decomposition     (we already have this)
```

Bubbles join to GBWT through segment membership we already store
(`Bubble.inside`, `source_segments`, `sink_segments`). **Presence** joins
cleanly (boundary-node locate); **allele/internal route** is a genuine
two-index join (extract subwalk + interpret against the decomposition), made
fiddlier by nesting and by subpath boundaries that start/end inside a bubble —
the same edge cases the boundary resolver already handles.

## 4. Current-state file map (what changes touch)

| Concern | File(s) |
|---|---|
| Per-link mask build | `preprocess/parser/gfa/parse_paths.py` (`path_dict`), `parse_links.py`, `parse_gfa.py:91` |
| Per-link mask store | `db/sqlite/link_db.py:28-29` (`haplotype`, `reverse` TEXT) |
| Mask on domain object | `objects/Link.py` (`haplotype`, `get_haplotype_presence`, `combine_links`) |
| Path storage | `db/sqlite/path_db.py`, `db/path_codec.py`, `db/indexes/PathIndex.py` |
| Path serving | `routes.py:356-418` (`/path`, `/path-meta`, `/path-data`, `/pathorder`), `db/query.py:201-231` |
| Trace consumer | `static/js/graph/engines/path-trace/*` (engine, boundary-resolver) |
| Bubble↔segment map | `objects/Bubble.py` (`inside`, `source_segments`, `sink_segments`), `db/indexes/BubbleIndex.py` |

## 5. Stages (each independently shippable)

### Stage 1 — Drop the dead per-link mask (pure Python, no GBWT)

**Goal:** stop *storing and serializing* the two N-bit hex masks (`haplotype`,
`reverse`) — the O(edges × samples) always-resident, never-read term. Keep the
scalar `frequency`.

**THE load-bearing subtlety:** `frequency` is **derived from the mask** —
`frequency = bin(mask).count("1") / n_paths` (`parse_gfa.py:93`,
`parse_links.py:35`). So we CANNOT drop the `path_dict` build or the transient
`mask`. Stage 1 keeps computing `mask` per edge to get its popcount, and only
stops *persisting/shipping* the hex strings. (Parse-time win is therefore
storage + payload, NOT the `path_dict` pass — that cost stays until frequency has
another source. Deferring `path_dict` is a Stage-3 follow-on, not Stage 1.)

**Grep-confirmed facts (2026-07-15):** nothing reads `.haplotype`;
`get_haplotype_presence` (`Link.py:116`) and `combine_links` (`Link.py:121`) have
**zero callers**; `parse_links.parse_links()` is imported but **never called**
(superseded by `_parse_segments_and_links`) — only `parse_line_L` is live; the
LinkIndex mmap arrays carry only topology (no masks), so runtime index is
untouched; the **one** real consumer of the stored masks is `summarize_links` →
`pangyplot status --table link`.

**File-by-file:**

*Preprocessing (build):*
1. `preprocess/parser/parse_gfa.py` — `_parse_segments_and_links`, L-branch
   (~L82–101): keep `mask = path_dict.get(key,0) | path_dict.get(key_rev,0)` and
   `frequency = bin(mask).count("1")/n_paths`; delete the `haplotype` and
   `reverse` locals and remove them from the `lnk_batch` tuple.
2. `preprocess/parser/gfa/parse_links.py` — legacy/dead path. Either delete the
   unused `parse_links()` fn (keep `parse_line_L`) and drop its import in
   `parse_gfa.py:8`, or mirror step 1 in `process_path_information`. Prefer
   deletion after confirming it's truly uncalled.

*Storage (SQLite):*
3. `db/sqlite/link_db.py`:
   - `create_link_table` (L28–29): drop `haplotype TEXT`, `reverse TEXT` columns.
   - `insert_link` (L50–61) + `insert_links_batch` (L64–67): drop the two columns
     from the INSERT list and value tuples.
   - `create_link` (L80–81): drop `link.haplotype` / `link.reverse` reads.
   - `summarize_links` (L118–147): remove the `GROUP BY haplotype` block and the
     `GROUP BY reverse` block; drop `haplotypes_top` from the return dict (keep
     `frequency` stats + `orientations`).

*Domain object:*
4. `objects/Link.py`: remove `self.haplotype`/`self.reverse` from `__init__`
   (L7–8), `serialize` (L26–27), `clone` (L41–42); delete dead
   `get_haplotype_presence` (L116) and `combine_links` (L121, references the mask
   and is uncalled).

*Frontend (passthrough carriers — copy the field, nothing reads it):*
5. Remove the `haplotype: … || null` lines in
   `detail/data/polychain/polychain-adapter.js:264`,
   `detail/data/bubble-unpop-adapter.js:113`,
   `detail/model/pop-handler.js:122` and `:295`. (Leave `frequency` passthrough.)

*CLI consumer:*
6. `commands/status.py` (L82, `--table link`): it prints whatever
   `summarize_links` returns via `pretty_print_summary`; once `haplotypes_top` is
   gone it just stops showing that block — no code change strictly required, but
   verify the output reads sensibly.

**Datastore regeneration:** `links.db` is a build artifact. Existing datastores
carry the old schema; the reduced `create_link` (SELECT *, fewer reads) tolerates
old DBs, but the clean path is **re-ingest** (`pangyplot add`) so schema matches.
Note in release notes. `links.mmapindex` is unaffected (topology only).

**Tests to update (assert on the dropped fields):**
`tests/preprocess/test_parse_gfa_lines.py`, `test_parse_pipeline.py`,
`test_drb1_pipeline.py`, `test_parse_utils.py`, `tests/db/test_bubble_links.py`,
and check `tests/ui/color-events.test.js` (may be `Array.reverse`, not the field).

- **Win:** drops the biggest sample-count-scaling term from disk + `/select`
  payload; **zero current feature loss** (nothing reads it). Frequency preserved.
- **Validate:** `/select` payload diff (masks gone, topology + frequency
  identical); full pytest + vitest; `pangyplot status --table link` still runs.
- **Risk:** low, reversible. The only gotcha is the frequency-from-popcount
  coupling above — don't remove `path_dict`/`mask` in this stage.

### Stage 2 — Region-scoped trace + the /path monotonicity fix (pure Python)

Query A ("samples in view") is deferred to Stage 3 — Stage 1 removed its only
data source (the mask) and its clean home is the GBWT presence index. **Stage 2
is Query B (trace) only.**

**Dual purpose:** Stage 2 is not just a perf win — it is *also* the correctness
fix for the one serving path that breaks under non-monotonic segment IDs (see the
Monotonic-ID Audit below). It replaces `subset_path`'s `start_id <= id <= end_id`
window with a position-safe basis, which is what a no-sort GBZ importer needs.

**Do NOT reuse `subset_path`'s id-range** — it assumes IDs are ordered by
position (Path.py:71), the exact thing we're eliminating.

**Correct basis (already in the codebase):** the viewport's segment set =
`stepidx.query_coordinates(start,end)` → `bubbleidx.get_top_level_bubbles(...)` →
union of each bubble's `source_segments + sink_segments + inside`
(query.py:18-19, 52-53). Slice the haplotype to steps whose segID ∈ that set.
**Pop-independent** (keys off the genomic region, not render state) and
**ID-order-independent**. Whole edge-straddling bubbles are included intact, so a
chain's entry/exit steps aren't clipped mid-traversal.

**Design — Option A (chosen): extend `/path-data` with optional `start`/`end`:**
- No range → current behavior (whole subpath, raw gzip bytes, zero decode).
- With range → server decodes the binpath, keeps steps whose segID ∈ region set,
  **re-encodes to the same varint format**, ships gzip. Frontend codec + decode
  path unchanged; it just receives fewer steps. (Trade-off: server-side decode
  for the trace only — acceptable, it's optional, not `/select`.)
- Rejected: **B** new JSON `/path-region` (diverges from codec + decode path);
  **C** fix `/path`/`get_path` (carries bubble annotation, wrong response shape).

**Frontend (minimal):** `_fetchAndDecodePath` passes viewport `start`/`end`;
cache key becomes `(sample, fileIndex, regionStart, regionEnd)`; re-fetch on the
existing debounced `ui:coordinates-changed`. Boundary resolver **untouched** (it
already tolerates a step subset).

**Test plan:**
- Backend unit: slice == steps with segID ∈ region set; edge-straddling bubble
  included whole; empty region → empty.
- **First-class regression:** a fixture graph with segment IDs *non-monotonic*
  with position — assert the set-membership slice is correct where `subset_path`'s
  id-range would be wrong. This is the guard for the whole GBZ-importer effort.
- Containment: region slice ⊂ whole-path decode; full-span region == whole path.
- Frontend vitest: `/path-data` request carries the range; cache keyed by region;
  resolver yields identical `chainOverlays` for full-path vs slice on an in-view
  region.
- `verify` end-to-end: trace a sample, zoom in — identical render, smaller payload.
- Full pytest + vitest.

- **Win:** UX pivot (work scales to viewport) **and** removes the one broken
  serving path — no C++.
- **Risk:** medium — per-request server decode for the trace (optional feature);
  region-set recompute per fetch (reuses `/select` machinery; cacheable).

### Monotonic-ID Audit (2026-07-15) — foundational for the GBZ importer

The GBZ-native importer (`GBZ_LAYOUT_PROJECT.md`) skips `odgi sort`, which is
what makes segment IDs increase with reference position. Audited the codebase for
code that treats segment ID as a position proxy. **Result: localized, not
pervasive.** The core serving surface (`/select`, `/pop`, `/chains`,
`/detail-tiles`) is already **step/layout-coordinate based** and safe.

Real dependencies (all now resolved):
| site | kind | resolution |
|---|---|---|
| `Path.subset_path` (Path.py:71) + `query.get_path` (`/path`) | **Serving** | **Fixed** by Stage 2 (segment-set basis). |
| `flat_chains._find_ends` (:49) — chain orientation by max ID | Preprocess | **Verified not a bug — left as-is.** Determinism + byte-parity device; chain direction isn't load-bearing (`Bubble.correct_source_sink` renormalizes at serving; ranges are position-derived; render uses layout). Reordering would renumber every datastore. |
| `chain_polyline.py:167` — fallback polyline in ID order | Cosmetic | **Fixed** — orders naked-internal fallback by centroid x (serving-time geometry, no parity concern). |
| `segment_db.get_segment_range` (`id BETWEEN`) + `SegmentIndex.get_between` | **Dead** | **Removed** in Stage 2. |

Safe (checked): `BubbleIndex` range queries (step-order), `bubble_db` chain_step
BETWEEN, `StepIndex` bp-bisects (safe unless fed into an id-range), all
`sorted(key=int(seg_id))` sites (deterministic packing / renumber, not position),
array-sizing `range(max_id+1)` (sparse indexing). **Blast radius for no-sort GBZ:
small — fix `/path` (Stage 2) + `_find_ends` ordering, remove dead `get_between`.**

### Stage 3 — GBWT backs Query A + Query B (C++ enters) — GATED on §7 decision
- **Goal:** stand up the GBWT query surface; wire Query A (presence via locate)
  and Query B (region extract) to it.
- **Prereq spike (do first):** on a real chromosome, measure (a) GBWT/GBZ size
  vs current per-region artifacts, (b) `locate` latency over a realistic visible
  node set, (c) aggregation cost for a zoomed-out bubble spanning thousands of
  segments. **Gate the rest of Stage 3 on this spike.**
- **Language:** clean-slate choice — `gbz2layout` is a *separate upstream/offline*
  tool (see §7a), so it does not pull this toward C++. Lean Rust (`gbwt-rs`).
- **Validate:** presence set from GBWT == presence set reconstructed from the
  old mask (before it was dropped — keep a fixture); trace slice == Stage 2
  server-side slice.
- **Risk:** high — puts C++ query cost on a hot-ish path; the §7 shape decision
  lands here.

#### Stage 3 spike — runbook (do BEFORE any integration; memory-heavy, run when free)

Purpose: produce the numbers that decide (i) whether GBWT is worth adopting at
all, (ii) sidecar vs in-process (§7b), (iii) whether set-membership needs C++
`locate` or the count+lazy-resolve workaround (§7a option 3).

Inputs: one real chromosome's `.gbz` (HPRC v2 GBZ on the NAS, or `vg` a v1 GFA →
GBZ), the matching PangyPlot datastore, and `gbwt-rs` in a throwaway Rust bin.

Run in this order (cheapest + most decisive first); each has a go/no-go:

1. **Storage** — `du` the current per-region path artifacts (`paths/*.binpath` +
   `paths/index.json`) vs the `.gbz`. Decision: if GBWT isn't materially smaller
   on the multi-haplotype set, the storage argument is dead (we already knew this
   was the weak case — confirm, don't assume). *Cheap, no code.*
   - **Baseline captured (2026-07-15, chrY v1, ~20 haplotypes):** `paths/` = 1.1M
     (163 `.binpath` + 28K index) out of a 130M datastore. So at v1 scale the
     path data GBWT would replace is ~1% of the store — the storage win is
     **negligible here and only becomes real at v2 scale** (hundreds of
     haplotypes), which is the whole reason for the GBZ project. Re-measure
     step 1 on a v2 chromosome; v1 chrY is not representative.
2. **Extract latency (Query B)** — time `GBZ::path`/`GBWT::sequence` extracting a
   sample's walk over a node range, vs the current Stage-2 server-side binpath
   slice. Decision: only worth replacing Stage 2 if GBWT extract is clearly
   faster at scale; otherwise keep Stage 2's pure-Python slice and use GBWT only
   for Query A.
3. **Presence over a window (Query A)** — the load-bearing one. For a realistic
   visible node set, time: (a) `find().len()` **counts** per edge (what `gbwt-rs`
   supports), and (b) the aggregation over a window's full segment set.
   **Use two windows** — a sparse one (~100s of segments, typical) and a **dense
   one** (chrY 20–20.5 Mb was ~21k segments in 0.5 Mb during Stage 2 verify):
   the dense case is the real worst case for per-window aggregation. Decision:
   if counts are fast enough on the dense window, Query A can be count-only
   (Rust, no C++); if exact set-membership is needed and too slow to reconstruct,
   that's the one signal for C++ `locate` (needs a GBZ built WITH DA samples —
   check the source GBZ carries them).
4. **Wire-shape sanity** — from 2+3, estimate per-request latency inline vs one
   IPC hop. Decision: feeds sidecar (isolation) vs in-process PyO3 (latency)
   in §7b. Query A stays debounced/view-triggered, so a hop is likely fine.

Harness: `tools/gbwt-spike/` (Rust, `gbz` v0.6.1). Built + run 2026-07-15.

#### Spike RESULTS (2026-07-15)

Ran on two MC v2 graphs. v2 chrY GBZ built from the clip GFA
(`vg gbwt -G chrY.sorted.gfa --gbz-format`): 511M GFA → **41M GBZ** (12×), 26 s,
1.6 G RAM.

| graph | nodes | paths | load | RSS | extract 8 paths | presence /node |
|---|---|---|---|---|---|---|
| MC v2 `full.gbz` | 1.41M | 38 | 498 ms | 281 MB | 182 ms / 2.8M steps (64 ns) | 50 ns |
| **v2 chrY** | 1.05M | **1614** | 163 ms | **107 MB** | 36 ms / 544k steps (66 ns) | 57 ns |

Realistic Query-A viewport presence-counts (v2 chrY, 1614 haplotypes):
- sparse (~500 nodes): **30 µs**
- dense (~21k nodes, the chrY-20M worst case): **1.1 ms**

**What the data settles:**
1. **Query A (presence counts) — adopt; effectively free.** ~57 ns/node and
   **depth-independent** (held from 38 → 1614 paths, because a count reads one
   node-record number). Worst-case dense viewport 1.1 ms, normal 30 µs. Needs no
   C++; fast enough to be inline, though keep it debounced/view-triggered (§8).
2. **Query B (extract) — keep Stage 2's pure-Python slice.** GBWT extract is
   ~66 ns/step → a viewport region is µs–~1.3 ms, comparable to the Stage-2
   binpath slice. No latency reason to replace it; use GBWT for Query A only.
   Shrinks the native serving surface.
3. **Memory — trivial.** 107 MB RSS for a 41 M v2-chrY GBZ.
4. **§7b wire-shape → SIDECAR.** Query A is µs–1 ms and debounced, so an IPC
   hop (~0.1 ms) is negligible; in-process PyO3 buys nothing meaningful here, so
   isolation wins. Decided.
5. **§7a set-membership → count-only path is viable; no C++ `locate` needed.**
   Counts cover "how many samples here / link weight"; the exact set resolves
   lazily on sample-select via a Query-B extract. gbwt-rs's missing `locate`
   does not block the planned UX.
6. **Storage — GBZ is compact** (41 M for v2-chrY topology + 1614 haplotypes).
   A full binpath-vs-GBWT comparison still needs a v2 `pangyplot add`, but the
   presence-mask win was already banked in Stage 1, so storage isn't deciding.

Net: **adopt GBWT for Query A as a Rust sidecar; leave Query B on Stage 2.**
Remaining open item: a v2-scale `pangyplot add` to complete the storage number.

### Stage 4 — Retire the old serving paths
- Remove whole-path `/path-data` download path once Query B is region-scoped;
  remove any interim Stage-2 presence structure once GBWT owns Query A.
- **Validate:** full suites; no references to removed endpoints/columns.

## 6. Validation strategy (fixtures)

Mirror the bubblegun-migration approach: fixture-validate on a size ladder —
**chrY (small) → chr9 → a v2 chromosome**. Keep a **pre-Stage-1 snapshot of the
per-link presence masks** as the golden set so Stage 3's GBWT presence can be
diffed against the data it replaces. Byte-diff datastores where possible
(`mtime=0` already makes `.binpath` diffable; see `path_codec.encode_combined`).

## 7. OPEN DECISION — native serving-integration shape (needed before Stage 3)

Deferred by staging; Stages 1–2 need none of this. Two sub-decisions:
**(a) language** and **(b) boundary shape**.

### (a) Language — C++ vs Rust
GBWT has a maintained **Rust** implementation by the original author:
`gbwt-rs` + `simple-sds` (reads vg-produced `.gbz`/`.gbwt`, exposes FM-index
queries). So Rust is first-class, not a self-port. Construction is upstream (vg
emits the GBZ) — we only need read+query.

**Verified against the `gbwt-rs` source (2026-07-15):**
- **Extract (Query B) — ✓ fully supported.** `GBWT::sequence(id)` (`gbwt.rs:255`)
  and `GBZ::path(path_id, orientation)` (`gbz.rs:486`); `GBZ::metadata()` gives
  sample→path mapping.
- **Presence as a COUNT (Query A, frequency) — ✓.** `GBWT::find(node)`
  (`gbwt.rs:271`) + `extend`/`bd_find`; `SearchState::len()` = #occurrences.
- **Presence as a SET ("which samples") — ✗ NOT supported.** `gbwt.rs:102` /
  `:418`: `da_samples: Vec<u64>, // We pass the data through but cannot
  interpret it.` The document-array samples are exactly what C++ `locate()` uses
  to resolve a search range to sequence IDs; gbwt-rs round-trips but won't decode
  them. `SearchState` exposes only `len()`/`is_empty()` — no id enumeration.

**Consequence:** the "reconstruct the presence *set* live from GBWT, store
nothing" half of the thesis does NOT come free in Rust. Options for set-membership:
  1. **C++ GBWT** (`jltsiren/gbwt`) — implements `locate()`, *if* the GBZ was
     built with DA samples (not guaranteed); locate is the heavier op. A narrow
     point for C++ over Rust.
  2. **Build a node→sample index at preprocessing** by extracting all paths
     (Rust `GBZ::path`) and inverting — but that re-stores presence data (hopefully
     more compact than per-link N-bit masks), so "store nothing" doesn't hold.
  3. **Don't enumerate server-side:** show the in-view *count* (`find().len()`),
     resolve membership lazily on sample-select via Query B extract + overlap test.
     Sidesteps set-locate entirely. **← likely best; revisit at Stage 3.**

Query B (trace) is an unqualified Rust win; Query A *counts* are a Rust win;
Query A *set* is the open sub-question above.

Rust improves every boundary shape: memory safety shrinks the crash blast
radius (matters most in-process), and **PyO3 + maturin** is a far cleaner wheel
story than pybind11 + CMake + sdsl.

**No single-stack argument to preserve.** `gbz2layout` is an **upstream,
offline preprocessing tool**: it reads a GBZ, emits a `.lay.tsv`, and exits —
that layout is a *prerequisite input to `pangyplot add`*, not part of PangyPlot's
runtime. It's C++ because it reuses odgi's PG-SGD algorithm, and that C++-ness is
self-contained and sunk. It never touches the Flask app. So the GBWT **query
surface** (extract/count at serving time) shares no codebase, build, or lifecycle
with it — folding serving-time queries into an offline layout generator would be
architecturally wrong regardless of language. The query surface is therefore a
**clean-slate decision**, not "extend the existing C++." The only residual cost of
Rust is that the *ecosystem* holds two native build systems (C++ layout tool +
Rust query surface) — but they are separate projects with separate lifecycles, so
this is not a "one merged codebase in two languages" burden.

### (b) Boundary shape

| | Preprocessing CLI only | Persistent sidecar | In-process binding |
|---|---|---|---|
| Native code location | separate binary, `add`-time | separate long-lived process | inside Flask process |
| Python purity | 100% pure | pure (talks over IPC) | native code in the wheel |
| Query-time reconstruct | ✗ (re-materializes) | ✓ | ✓ |
| Per-query latency | n/a (files) | + IPC hop (~0.1ms) | lowest (in-proc) |
| Crash blast radius | none (offline) | one query | one gunicorn worker |
| Deploy complexity | lowest | + one process | build/ABI/wheels (much milder w/ Rust+maturin) |
| Precedent in repo | matches `gbz2layout` | none | none |

The catch: **preprocessing-CLI-only cannot do query-time presence
reconstruction** (Query A live), so it can't fully deliver the Stage 3 thesis —
it re-bakes derived data instead. Sidecar and in-process both can.

### Leaning — DECIDED by the spike (2026-07-15)
**Rust sidecar for Query A presence-counts; Query B stays on Stage 2's
pure-Python slice.** The spike (see Stage 3 RESULTS) showed presence counts are
~57 ns/node and depth-independent (30 µs–1.1 ms per viewport, debounced), so the
IPC hop is negligible and process isolation wins over in-process PyO3.
`gbz2layout` stays C++ *independently* (upstream/offline, odgi-derived). Exact
set-membership isn't needed (count + lazy resolve), so no C++ `locate`.

## 8. Open questions

1. Integration shape (§7).
2. Is per-request server decode acceptable on `/select` if Query A goes there,
   or does Query A stay a panel-triggered call (not every select)? — Leaning:
   Query A is triggered on view-change, debounced, not inline in `/select`.
3. Scale target: how many haplotypes must this hold? Gates whether Stage 3/4 are
   worth the C++ cost at all (v1 chrY is 1.1 MB of paths — not painful; v2 is
   the driver — see `GBZ_LAYOUT_PROJECT.md`).
4. Source of the GBWT: reuse the v2 GBZ already on the NAS (per GBZ project §9)
   or build per-chromosome.
