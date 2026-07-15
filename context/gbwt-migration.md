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

### Stage 2 — Region-scoped query model on existing data (pure Python)
- **Query A, cheap version:** expose "samples present in view." Interim source
  while Stage 1 removes the mask: compute presence during preprocessing into a
  compact per-region structure, OR keep just enough (frequency + a coarse
  presence summary). Decision: whether Query A ships in Stage 2 at all, or waits
  for Stage 3's GBWT — since Stage 1 removes its only current data source.
  **Likely: Query A is a Stage 3 feature; Stage 2 is Query B only.**
- **Query B:** serve the trace **region-scoped** by slicing server-side from the
  existing `.binpath` (the legacy `/path` `subset_path` already does exactly
  this over a segment range) instead of shipping the whole path. Frontend stops
  downloading+discarding whole walks.
- **Win:** proves the UX pivot (scale work to viewport) with no C++.
- **Validate:** trace renders identically for a region that fits on screen;
  payload shrinks with zoom; animation frames unchanged.
- **Risk:** medium — re-introduces per-request server decode for Query B
  (acceptable: it's the optional trace feature, not `/select`).

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

### Leaning
**Rust for the Stage 3 query surface** (PyO3 in-process *or* Rust sidecar —
decide from the Stage 3 spike's real latency numbers; Rust narrows the gap by
removing pybind11's build + crash pains). This is a clean-slate choice for the
serving-adjacent code; `gbz2layout` stays C++ *independently* (upstream/offline,
odgi-derived) and does not bear on it. Query A stays a debounced,
view-change-triggered call — never inline in `/select` — so IPC latency is a
non-factor and isolation wins.

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
