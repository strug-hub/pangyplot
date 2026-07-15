# GBWT path model — migration plan

> **GOAL (revised — see the OPEN memory note below):** add a GBWT path backend
> for what GBWT is uniquely good at (region-scoped, all-haplotype **presence**
> queries), *alongside* PangyPlot's memory-lean on-disk binpath engine — which
> **stays the default**. The original "GBWT replaces the path engine, retire
> binpaths (Stage 4)" plan is **cancelled**: both the Rust and C++ GBWT load fully
> into RAM, and a whole-genome resident GBWT is untenable against PangyPlot's
> low-memory requirement. GBWT is opt-in (`PANGYPLOT_GBWT`); resident-lean
> presence is provided by the **memory-mapped C++ graphd** in `gbwt/graphd/`
> (see `gbwt/graphd/IMPLEMENTATION.md`). Stages 1–3 (dead-mask removal,
> region-scoped trace, the working GBWT engine + native builder) stand.
>
> **Status (2026-07-15):** Stages 1–2 landed + monotonicity hardening + Stage 3
> spike run and decided (Rust path service; extract+counts+metadata all proven on a
> v2 GBZ) + Stage 3 serving plumbing wired (below). Branch `gbwt-migration`.
>
> **Stage 3 plumbing landed (2026-07-15):** the GBWT path engine is now a live,
> opt-in serving backend. `GbwtPathIndex` completes the simplify-viewer seam —
> `get_samples`/`get_sample_idx` (`/pathorder`), `get_path_meta_with_bp` with
> real contig/start/length + `compute_bp_ranges` from walk+StepIndex (`/path-meta`),
> `get_path_raw`/`get_path_combined` whole + region-sliced (`/path-data`).
> `GbwtManager` owns per-chr graphd lifecycle (spawn on the chr GBZ / connect to
> an external URL / gracefully fall back to binpaths), toggled by `PANGYPLOT_GBWT`.
> `app.py` swaps `path_index` per chr when a graphd comes up. Parity tests extended:
> bp-range parity vs binpaths + sample-idx bijection + manager spawn/health/teardown.
> 737 pytest green. **Deferred:** `get_paths()` (core-viewer `/path` + `/export`,
> iterable Path objects) raises under GBWT mode — outside the simplify-viewer seam.
>
> **Stage 3 ingest landed (2026-07-15) — NATIVE builder, no vg:** the decisive
> finding is that gbwt-rs (`GBWTBuilder`) can build a **GBWT** natively, and
> PangyPlot needs nothing more: a GBWT already encodes graph topology (edges live
> in its records) and PangyPlot already owns every segment's DNA in SegmentIndex,
> so a **compact GBWT + SegmentIndex ≈ a compact GBZ**. And because PangyPlot's
> `combined = (seg<<1)|orient` value **is** the GBWT node handle
> (`encode_node = 2*id+orient`), node id = segment id with **no chopping, no
> translation, no vg**. Pieces: `gbwt/build/` (Rust: pathdata → compact
> `graph.gbwt`); `preprocess/gbwt_build.py` (emits the pathdata intermediate from
> parsed paths, runs the builder, cleans up); graphd loads **GBWT or GBZ** behind
> one wire contract (`Backend` enum; GBWT walk = `sequence(2*pid)`, count =
> `find(2*nid).len()`); `GbwtManager` serves `graph.gbwt` (preferred) else
> `graph.gbz`; `pangyplot add --build-gbwt` (native) / `--gbz` (adopt a foreign
> vg GBZ). End-to-end test: native `graph.gbwt` serves walks byte-identical to
> binpaths, `has_translation == False`. 742 pytest green. **Why not a Stage-5
> lock-in:** the GBWT is a strict subset of a future compact GBZ (same node
> space); node/link serving can come from GBWT-topology + SegmentIndex-DNA. The
> id-space trap to avoid — mixing a native-compact GBWT with a vg-chopped GBZ —
> is avoided by keeping native (compact) the production path and vg GBZ a separate
> optional *adopt* input. **Ahead:** Stage 4 binpath retirement; metadata parity
> (sample-key reconciliation); GBZ-only input is the separate layout project.
>
> **OPEN — resident memory: mmap investigation (DECIDED direction).** The graphd
> loads the whole GBWT/GBZ into RAM and holds it for the process lifetime — one
> process per chromosome. This regresses PangyPlot's memory-lean design (binpaths
> are on-disk, ~zero resident path memory). Per-chr it's ~107 MB (1614-hap chrY);
> **whole-genome resident across ~24 processes is several GB — untenable**, and
> users query multiple chrs at once so all must be ready.
> **Investigation found neither gbwt-rs (Rust) nor `gbwt`/`gbwtgraph` (C++) mmaps
> the index — both load fully into RAM.** So this is not a language choice; mmap
> must be built. What the resident GBWT uniquely buys is **Query A presence**
> ("which/how-many haplotypes here"); **Query B trace is already served
> resident-lean on-disk by Stage 2 binpaths** and gains nothing from the GBWT.
> **Decisions:** (1) keep the on-disk **binpath engine as the default** — do NOT
> do Stage 4 (retiring binpaths) as previously planned; it would break the memory
> constraint. (2) The GBWT stays **opt-in** (already is: `PANGYPLOT_GBWT` off →
> binpaths). (3) Resident-lean presence comes from **memory-mapped serving in a
> C++ graphd** (sdsl mmap primitives; `gbwt`/`gbwtgraph` the reference; also sets
> up Stage 5), now implemented in `gbwt/graphd/` (see
> `gbwt/graphd/IMPLEMENTATION.md`). The wire contract makes the graphd a drop-in
> — nothing above the HTTP boundary changes.
>
> **mmap PROVEN — GO (2026-07-15).** The forked C++ `gbwt` (mmap-backed
> `RecordArray` + DA opt-out) serves the **whole genome** (`hprc-v2.0-mc-grch38`,
> 5.42 GB) at **333 MB resident** — on a 15 GB box where a *resident* load
> (`vg gbwt -Z`) **OOM-kills**. Localized viewport queries (the real use) are
> **0.14 µs / +228 KB RSS** — a viewport stays local and does NOT page the index
> in (the reference-slice reasoning, confirmed with a number); warm queries are
> RAM-speed (0.35 µs), worst-case cold scatter still bounded (+183 MB for 50k
> random). The DA opt-out (the counts-vs-locate finding above) is the 752→333 MB
> win. Fork: `github.com/ScottMastro/gbwt-mmap` (`mmap-serving`). Full data in the
> investigation doc's STEP 1–3 findings.
> **Remaining, split in parallel:** (a) *contract side* — wrap the mmap library in
> a C++ HTTP graphd honoring the wire contract (other agent); (b) *PangyPlot
> side* — parity tests are already env-swappable (`PANGYPLOT_GRAPHD_BIN`)
> and the launch contract is documented in `gbwt_manager`; once the C++ binary
> passes parity, point `PANGYPLOT_GBWT_BIN` at it and retire the Rust
> `gbwt/graphd`. Ship model: optional external binary, gracefully skipped if
> absent (same as the Rust path service; GBWT mode is opt-in).
>
> **NOTE — Stage 4 is cancelled** (was: retire binpaths). Binpaths are the
> memory-lean default and must stay. `get_paths()` (core-viewer `/path`/`/export`)
> remains served by the binpath engine; no need to port it under GBWT mode.
>
> **RESOLVED — presence needs COUNTS, not set-membership (`find().size()`, no DA).**
> Code audit (2026-07-15): the only presence semantics PangyPlot has ever used is a
> **count** — link `frequency` (fraction of paths per edge, `parse_gfa.py:94`),
> stored, serialized (`Link.serialize`), and plumbed end-to-end to the frontend
> (bubble-unpop/polychain adapters, pop-handler). It is currently a *passthrough*
> (nothing reads `.frequency` downstream yet), but it is the field positioned for an
> edge/bubble prevalence display — and it maps to GBWT `find().size()`, which needs
> **no document-array (`DA`) / no `locate`**. The which-samples (set-membership)
> path was explicitly DEAD and removed in Stage 1 (`haplotype`/`reverse` masks, read
> nowhere). "Which samples are in view" (locate/DA) is speculative — not required by
> any current or plumbed feature. The graphd's `/count` already covers the real
> need and is likewise unwired (no route/frontend consumer yet). The C++ mmap agent
> is mapping the DA anyway as reclaimable insurance for a possible future `locate`,
> at no correctness cost — but the DA is not needed for anything today.
>
> **Stage 3 file layout (2026-07-15):** the two native crates moved out of
> `tools/` into a top-level `gbwt/` **Cargo workspace** (`gbwt/graphd/`,
> `gbwt/build/`) — one lockfile + `target/`, `gbz`/`simple-sds` compile once,
> workspace deps hoisted. Binaries now at `gbwt/target/release/{gbwt-graphd,
> gbwt-build}`. The throwaway spike was deleted (numbers preserved in this doc).
> Python glue stays idiomatic (`db/indexes/GbwtPathIndex`, `db/gbwt_*`,
> `preprocess/gbwt_build`, `preprocess/gbz`).
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
> 107 MB RSS. Decisions: adopt GBWT for **Query A** counts as a **Rust path service**;
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

### Stage 3 — GBWT *becomes* the path engine (Rust path service) — DECIDED

**Goal (the actual target):** replace the bespoke path engine wholesale. The GBZ
becomes the single source of truth for haplotype paths; a **Rust path service** over
`gbwt-rs` serves every path operation. Not "GBWT adds presence" — GBWT *is* the
engine. The spike de-risked this (see RESULTS): extract + counts + metadata all
work on a real 1614-haplotype v2 GBZ, sub-ms, 107 MB RSS.

**Language: Rust, decided.** The existing engine's operations (per-sample
extract, sample list/metadata, ordering) are *all* covered by gbwt-rs — proven
by the spike, not theory. The one gbwt-rs gap (sample-set enumeration via
`locate`) is something the current engine never did either; count+lazy covers the
future Query-A refinement. Load-bearing serving makes Rust's crash-isolation
worth more, and continuing the working spike beats a C++ restart. Flip trigger:
a *hard* requirement for exact server-side "which samples in view" enumeration →
C++ `locate` on a DA-sampled GBZ. Building the GBZ stays a `vg gbwt` subprocess
(26 s/chr in the spike), so it doesn't pull serving toward C++.

**Retire (the old path engine):**
- `paths/*.binpath` generation in `pangyplot add`; `path_codec.py` encode side,
  `path_db.py` binpath storage, binpath logic in `PathIndex`, `ensure_paths.py`.
- Stage 2's `get_path_region_raw` binpath slice — but `region_segment_ids` is
  **kept**: it now bounds the GBWT extract instead of a binpath.

**graphd query surface (Rust over the GBZ):**
- **Trace (Query B):** `GBZ::path(sample)` → filter to the viewport's node set
  (`region_segment_ids`) → re-encode to the **same delta-zigzag-varint gzip** and
  return bytes.
- **Presence (Query A):** `search_state(node).len()` counts.
- **Metadata:** sample list / subpath meta / ordering from GBWT `Metadata`;
  recompute `bp_ranges` from the GBWT walk + `StepIndex`.

**Frontend seam — unchanged by design.** Flask proxies the graphd's varint bytes
under the existing `/path-data` / `/path-meta` / `/pathorder` contracts, so
`path-codec.js`, `path-trace-engine`, and the viewer are untouched — the bytes
just come from GBWT. `StepIndex` stays (coordinate index for `/select`/bubbles,
not part of the path engine; can later be derived from the GBWT reference path).

**Ingest:** `pangyplot add` builds a per-chr GBZ via `vg gbwt -G <gfa>
--gbz-format` (or takes a GBZ input, per the GBZ-native project) and stops
emitting binpaths.

**KEY FINDING — chopping + the parity test (2026-07-15).** vg **chops** long
segments on GFA→GBZ import (DRB1: 3214 segs → 3218 nodes), so raw node id ≠
segment id and PangyPlot's compact segments get split. The GBZ carries a
node→segment **translation** for exactly this; `/walk` uses `segment_path` (whose
`segment.name` is the GFA segment id) to collapse chopped nodes back to compact
segments. The earlier "node = segment, drop the translation" assumption was
WRONG and produced mismatched walks. Cross-validated by
`tests/db/test_gbz_parity.py`: PangyPlot binpaths and the GBZ (via the graphd)
built from the same DRB1 GFA yield **byte-identical** walk sets — the load-bearing
correctness guarantee for the whole migration. Works for user-supplied GBZs too
(they may be chopped; the translation handles it). No need to disable chopping.

**THE CONTRACT — segment-level everywhere (enforce before Stage 5 / GBZ-input).**
PangyPlot compacts internally: bubble calling runs `flat_graph.compact` /
`compact_graph` (`bubble_gun.py:82,118`), merging degree-2 chains and *tracking*
absorbed segment ids (`construct_bubble_index_flat.py:121` "plus compacted"), so
a bubble's coverage — hence `region_segment_ids` — includes every original
segment id it swallowed. Consequence: the system is correct **iff every engine
(path, node, link, bubble) reads segment ids through the GBZ's segment-level view
(the translation)** — `segment_path` for paths, `node_to_segment` for topology.
A chopped GBZ exposes both a node-level (split) and a segment-level (original)
view and does NOT conflate them; we always use the segment-level one.
- **The dangerous mix** (would bite silently): building bubbles/topology from the
  *node-level* (chopped) graph while paths come from the segment-level view →
  bubble ids `1a,1b,1c` vs path id `1` mismatch → `region_segment_ids`, boundary
  resolution, rendering all break. Compaction does NOT save this — it fixes
  topology but leaves chopped-node ids.
- **Why it's otherwise robust:** even a fragmented *source* graph is fine —
  compaction records absorbed segments, so whatever ids a path walks are present
  in the bubble's set. Consistency = "same ids everywhere", guaranteed by the
  translation.
- **Foreign-GBZ requirement:** the GBZ must carry the translation (chopped ones
  always do; unchopped means node = segment). Always satisfiable.

**graphd built forward-compatible (from the start, costs nothing now):**
- **The wire protocol is the boundary, not the language.** Documented as a
  neutral contract (`gbwt/graphd/README.md`): plain HTTP, JSON metadata,
  explicit LE-binary bulk. The C++ stack (`jltsiren/gbwt` + `gbwtgraph`) has the
  same ops, so a C++ swap is a drop-in behind the Python client — nothing above
  changes. This is what keeps the Rust-vs-C++ decision reversible.
- **Threaded** (read-only `Arc`-shared GBZ, N workers, no locks) and **binary
  bulk payloads** (`/walk` is packed LE-i64) — so we don't paint ourselves into a
  serial/JSON corner before the `/select` hot path arrives in Stage 5.
- **Transport swappable** (Unix socket / shm) behind the client if HTTP framing
  ever profiles hot.

**Real tradeoff:** the graphd is now **load-bearing** (no trace if it's down) —
hence graphd (crash-isolated; Flask degrades to "trace unavailable") over
in-process. Set-membership stays count/lazy.

**Validate:** graphd trace bytes == Stage 2 binpath slice for the same
sample+window (byte-identical, since same varint codec); `/path-meta` parity;
presence counts sanity-checked.

#### Stage 3 spike — runbook (do BEFORE any integration; memory-heavy, run when free)

Purpose: produce the numbers that decide (i) whether GBWT is worth adopting at
all, (ii) graphd vs in-process (§7b), (iii) whether set-membership needs C++
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
   IPC hop. Decision: feeds graphd (isolation) vs in-process PyO3 (latency)
   in §7b. Query A stays debounced/view-triggered, so a hop is likely fine.

Harness: `gbwt/`s throwaway spike (since removed) (Rust, `gbz` v0.6.1). Built + run 2026-07-15.

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
4. **§7b wire-shape → DAEMON.** Query A is µs–1 ms and debounced, so an IPC
   hop (~0.1 ms) is negligible; in-process PyO3 buys nothing meaningful here, so
   isolation wins. Decided.
5. **§7a set-membership → count-only path is viable; no C++ `locate` needed.**
   Counts cover "how many samples here / link weight"; the exact set resolves
   lazily on sample-select via a Query-B extract. gbwt-rs's missing `locate`
   does not block the planned UX.
6. **Storage — GBZ is compact** (41 M for v2-chrY topology + 1614 haplotypes).
   A full binpath-vs-GBWT comparison still needs a v2 `pangyplot add`, but the
   presence-mask win was already banked in Stage 1, so storage isn't deciding.

Net: **adopt GBWT for Query A as a Rust path service; leave Query B on Stage 2.**
Remaining open item: a v2-scale `pangyplot add` to complete the storage number.

### Stage 4 — Delete the old path engine
Once the graphd serves trace+metadata at parity (Stage 3 validated), remove the
now-dead binpath code: `path_codec.py` encode side, `path_db.py` binpath storage,
binpath paths in `PathIndex`, `ensure_paths.py`, and binpath emission in
`pangyplot add`. `region_segment_ids` and the frontend codec **stay** (the graphd
speaks the same varint). Re-ingest drops `paths/*.binpath` from datastores.
- **Validate:** full suites; trace works end-to-end via the graphd only; no
  references to removed binpath modules.

### Stage 5 — node/link engine on GBZ (LATER / POSSIBLE — not committed)

Direction, captured so it isn't lost; **do not start until the path engine
(Stages 3–4) is done.** The GBZ already holds everything the node/link engines
need, so `segments.db` + `links.db` could retire too:
- node **sequence** → `gbz.sequence(id)` (the bulk of `segments.db`)
- node length / gc / n → derived from the sequence
- **links** → `gbz.successors/predecessors`
- **link frequency** → a GBWT edge-count query (completes the Stage-1 mask
  removal: the count we deleted, regenerated on demand)

**Hard limit — coordinates never move.** The GBZ has no 2D layout; PangyPlot
always keeps a compact per-segment `(x1,y1,x2,y2)` structure (a float array by
segment id — what `SegmentIndex` mmap already is once seq+topology leave).
Derived indexes (bubbles, steps, skeleton) also stay; they'd source topology
from the GBZ instead of the parsed GFA.

**Why it's a separate, gated stage:** unlike paths (optional trace), node/link is
the **`/select` hot path**. Gate on a benchmark of a new graphd **`/subgraph`**
endpoint (given a segment set → nodes+edges+seq+freq in ONE call) vs today's
in-memory mmap arrays. Spike says topology ops ~50 ns, so one call per `/select`
should be fine — but prove it before committing. The graphd extends naturally
(add `/subgraph`, `/node`, `/edges`).

Retires: `segments.db` (esp. sequences), `links.db`, parse-time frequency.
Keeps: coordinate structure + derived bubble/step/skeleton indexes.

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

| | Preprocessing CLI only | Persistent graphd | In-process binding |
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
it re-bakes derived data instead. graphd and in-process both can.

### Leaning — DECIDED by the spike (2026-07-15)
**Rust path service for Query A presence-counts; Query B stays on Stage 2's
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
