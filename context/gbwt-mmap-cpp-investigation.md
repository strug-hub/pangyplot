# Task brief — memory-mapped C++ GBWT serving sidecar

**For a fresh agent. Self-contained; you need no prior conversation.**
Read this, then `context/gbwt-migration.md` (the full migration plan) for depth.

---

## 0. THE HARD GATE — read this first

**Low resident memory is a GO/NO-GO condition, not a nice-to-have.** The entire
reason to do this work is that the current (Rust) sidecar holds the whole GBWT in
RAM, which is untenable at whole-genome scale (see §2). The project owner will
adopt a full C++ stack **only if it demonstrably keeps memory low** — i.e. mmap
must make RSS scale with *active queries*, not total mapped data.

Therefore: **prove the memory win with a throwaway spike BEFORE building anything
real** (see §9 step 0). If a minimal C++ program can `mmap` a chr-scale GBWT and
answer presence/walk queries while RSS stays a small fraction of the index size,
proceed. **If touching the index during normal queries pages most of it into RAM
anyway, mmap does not help — STOP and report; the GBWT-serving direction is
abandoned and PangyPlot stays binpath-only.** Do not build the full sidecar +
build system until the spike proves the gate.

**Full C++ is sanctioned.** You may replace the Rust stack entirely — *both* the
serving sidecar and the ingest-time builder (`gbwt/build`) can become C++. The
Rust crates in `gbwt/` are the reference for *behavior and the wire contract*, not
something to preserve. Retire them once the C++ pipeline passes parity.

## 1. The one-sentence task

Build a **C++ path-service sidecar** that serves PangyPlot's per-chromosome GBWT
**memory-mapped from disk** (RSS scales with active queries, not total data),
honoring the **exact existing wire contract** so it is a drop-in replacement for
the current Rust sidecar — nothing above the HTTP boundary changes. Full C++
(sidecar **and** builder) is fine; the memory win in §0 is the gate.

## 2. Why this exists (the problem)

PangyPlot is a pangenome-graph viewer with a hard, deliberate design constraint:
**keep resident memory low.** Today everything is loaded into RAM at startup
(segments+DNA, links, bubbles) **except haplotype paths**, which live on disk as
per-sample `.binpath` files fetched on demand — so resident path memory is ~zero.

Stages 1–3 of the GBWT migration (see `context/gbwt-migration.md`) built a
working GBWT path engine served by a **Rust sidecar** (`gbz`/gbwt-rs crate). It
is correct and parity-tested. **But it loads the whole GBWT into RAM.** The
investigation that produced this brief established:

- **gbwt-rs (Rust) loads the GBWT fully into RAM.** No memory-mapping. `GBWT`
  holds owned `Vec<u8>` / `SparseVector` / `Vec<Pos>`; `load_from` reads it all.
- **C++ `gbwt`/`gbwtgraph` ALSO load fully into RAM by default.** `RecordArray`
  is a `std::vector<byte_type>`; the "compressed GBWT" is space-efficient but
  resident. Neither library exposes mmap through its public API.
- Measured: a 1614-haplotype **chrY** GBZ = **107 MB RSS**. A high-haplotype
  chr1 is hundreds of MB; whole-genome resident across ~24 per-chr sidecar
  processes is **several GB**. Users query multiple chromosomes concurrently, so
  all must be ready at once. **This is untenable** and regresses the exact
  property the project optimized for.

**Decision:** the resident-lean **on-disk binpath engine stays the default**
(it already satisfies the constraint and serves the current "trace a sample
through a region" feature via Stage 2 region-slicing). The GBWT's *unique* value
is **presence queries** ("which haplotypes are here / counts", Query A), which
need the index resident/mapped. To get that at low memory, we must serve the
GBWT **memory-mapped**. Since building mmap support is a from-scratch effort in
either language, target the **more mature C++ stack** (`sdsl-lite` has real
memory-mapping primitives; `gbwt`/`gbwtgraph` are the reference impls vg uses,
and this also sets up Stage 5 node/link-on-GBZ serving).

## 3. What "success" looks like

1. A C++ sidecar binary that `mmap`s a `graph.gbwt` (and/or `graph.gbz`) and
   answers the wire contract in §4.
2. **RSS stays low and OS-paged**: loading N chromosomes' indexes must NOT cost
   N × full-index RAM. Demonstrate resident memory scaling with *active queries*,
   not total mapped data (measure RSS with a chr-scale index, idle vs querying).
3. **Byte-identical parity**: `/walk` output must exactly match the Rust sidecar
   and the legacy binpaths. The existing pytest parity tests must pass against
   the C++ binary (see §6).
4. Drop-in: the Python side (client, manager, `GbwtPathIndex`, Flask routes) is
   **unchanged** — only the spawned binary differs.

## 4. The wire contract (DO NOT CHANGE — it is the boundary)

Localhost HTTP. Full spec in `gbwt/sidecar/README.md`. The Rust implementation in
`gbwt/sidecar/src/main.rs` is your reference — mirror its behavior exactly.

| endpoint | params | response |
|---|---|---|
| `GET /health` | — | `text/plain` `ok` |
| `GET /meta` | — | `application/json` (below) |
| `GET /walk` | `path=<usize>` | `application/octet-stream`: array of **little-endian i64**, one per step, value = `(segment_id << 1) \| orientation_bit` (`+`=0, `-`=1) |
| `GET /count` | `node=<usize>` | `text/plain` decimal: haplotype occurrence count at the node |

`/meta` JSON: `{ "nodes": int, "paths": int, "has_metadata": bool,
"has_translation": bool, "samples": [str...], "path_list": [{"id": int,
"sample": str, "contig": str, "phase": int, "fragment": int}] }`

### The critical encoding identity
PangyPlot's step value `combined = (segment_id << 1) | orientation_bit`
(`+`=0, `-`=1) **is exactly** the GBWT node handle
`encode_node(id, orient) = 2*id + orient`. So:
- **Native `graph.gbwt` is compact: node id == segment id, no translation.**
  `/walk` for path `p` = the forward sequence of path `p` (in a bidirectional
  GBWT, that's sequence id `2*p`), each node handle emitted as an i64.
- `/count` for node `n` = occurrences of forward handle `2*n` (C++: the GBWT
  `find(node)` search-state size).
- A **`graph.gbz`** (foreign, e.g. from `vg gbwt`) may be *chopped* (node id ≠
  segment id) and carries a node→segment translation; walk in terms of GFA
  **segments** (segment name = PangyPlot segment id). The Rust sidecar's
  `Backend::Gbz` branch shows the exact logic (`segment_path`). Mirror it.

## 5. What already exists (reuse, don't rebuild)

- `gbwt/sidecar/` — **Rust reference sidecar** (Cargo workspace). Read
  `src/main.rs`: `Backend` enum (GBWT vs GBZ), `/walk` `/count` `/meta` handlers,
  threading (read-only, `Arc`-shared, N workers). Your C++ sidecar reproduces
  this behavior over an mmap'd index.
- `gbwt/build/` — **native Rust GBWT builder** (no vg). Produces `graph.gbwt` in
  the **simple-sds serialization format**. **VERIFY EARLY** that C++ `gbwt`'s
  `simple_sds_load()` can load this file (gbwt-rs and C++ `gbwt` are designed to
  share the format — C++ has `simple_sds_serialize`/`simple_sds_load`). If yes,
  keep the Rust builder unchanged and only the *serving* goes C++. If no, fall
  back to building with C++ `gbwt`'s builder at ingest.
- `pangyplot/db/gbwt_client.py` — Python HTTP client. **Unchanged.**
- `pangyplot/db/gbwt_manager.py` — spawns/health-checks/tears-down the sidecar
  per chr; `PANGYPLOT_GBWT_BIN` points at the binary; `PANGYPLOT_GBWT_URLS` can
  point at externally-managed sidecars. Point `PANGYPLOT_GBWT_BIN` at the C++
  binary; no code change needed (maybe update `DEFAULT_BIN`).
- `pangyplot/db/indexes/GbwtPathIndex.py` — the Python path source. **Unchanged.**

## 6. Parity tests the C++ binary MUST pass

Set the sidecar path env / test constant to the C++ binary and run:
- `tests/db/test_gbz_parity.py` — GBZ walks == binpaths (chopped-GBZ path).
- `tests/db/test_gbwt_native_build.py` — native `graph.gbwt` walks == binpaths;
  `has_translation == False`; metadata (sample/contig/start/bp) == legacy.
- `tests/db/test_gbwt_manager.py` — spawn/health/teardown lifecycle.
- `tests/db/test_gbz_ingest.py` — adopt-a-GBZ → serve.

Fixtures: `tests/fixtures/DRB1-3123.{gfa,gbz,lay.tsv}` (small, chopped GBZ).
Reference genome id in tests: `gi|568815592`.

## 7. Technical leads for the mmap part (the actual research)

- **sdsl-lite mmap primitives** (C++ gbwt's foundation): `sdsl::int_vector_mapper`
  memory-maps an int_vector file; `sdsl::memory_manager` / `MEMORY_MANAGER` has
  an mmap mode; sdsl structures can be loaded over mmap'd regions. This is the
  richest mmap toolkit in play — richer than Rust's simple-sds (which only has
  mappers for `IntVector`/`RawVector`, not `SparseVector`).
- **Check how vg loads GBWTs** (`vg` uses `gbwt`+`gbwtgraph` at scale). If vg has
  a memory-mapped or lazy GBWT path, copy that approach. If vg loads fully into
  RAM (likely), you're genuinely adding mmap serving.
- **What must be mapped**: the GBWT's `BWT` records (the bulk — a byte array
  indexed by an Elias-Fano/`sd_vector` offset structure), the endmarker, and the
  document-array samples (`DA`, needed for real set-membership `locate`; counts
  via `find().size()` may not need it). Metadata is small — can stay resident.
- **Minimum viable**: you may not need to mmap *everything*. If the record byte
  array (the large part) can be mmap'd while small index structures stay
  resident, that already collapses RSS. Measure to confirm.
- **Set-membership vs counts**: Query A "how many haplotypes here" = `find().size()`
  (cheap, no DA). Query A "*which* haplotypes here" = `locate` (needs the DA
  samples; the GBZ must be built WITH DA sampling). Scope which one is required;
  counts-only is much lighter. See the plan doc §7a.

## 8. Constraints & non-negotiables

- **Honor the wire contract byte-for-byte.** The Python side must not change.
- **Keep it thread-ready**: read-only mmap shared across worker threads, no locks
  (matches the Rust sidecar; needed for the future `/select` hot path, Stage 5).
- **Language-agnostic wire, binary bulk payloads** (`/walk` = packed LE-i64).
  Keep metadata JSON, bulk binary. No language-specific serialization on the wire.
- **The segment-level contract** (see plan doc "THE CONTRACT"): every engine
  (path, node, link, bubble) must read *segment-level* ids. Native GBWT = compact
  (node=segment). A chopped GBZ must be read through its translation
  (`segment_path` / `node_to_segment`), never the raw chopped node ids. Do not
  mix a compact native GBWT with a chopped GBZ.

## 9. Suggested plan of attack

**Step 0 comes first and is the gate (§0). Do not build the real sidecar until it
passes.**

0. **MEMORY SPIKE (GO/NO-GO).** Smallest possible C++ program: `mmap` a
   chr-scale `.gbwt` (build one at ingest scale, or `vg gbwt` a real chromosome),
   run a realistic burst of `/walk`-style extracts and `/count`/`find` queries
   over a *viewport-sized* node range, and **measure RSS** (idle after map, then
   after queries) against the full index size. **GO** if RSS stays a small
   fraction of the index (queries are viewport-local → paging is bounded).
   **NO-GO** if normal queries page most of the index in — then mmap doesn't
   solve it; STOP and report, PangyPlot stays binpath-only. Report the numbers
   before proceeding.
1. **Build path (full C++).** Confirm you can build a `graph.gbwt` with C++
   `gbwt` at ingest (its builder), OR that C++ `gbwt::simple_sds_load` loads a
   `graph.gbwt` written by the existing Rust `gbwt/build` (they share the
   simple-sds format by design). Either is fine — pick one and note it. The
   builder can go C++; the Rust builder is not sacred.
2. **Minimal C++ sidecar, correctness first.** HTTP server + `/health` + `/walk`
   + `/count` + `/meta`, mmap loading from step 0. Get the **parity tests green**
   (§6) — byte-identical walks to binpaths.
3. **Confirm the memory win holds in the real sidecar** (not just the spike):
   RSS idle vs active, single chr, then several chrs mapped at once (or one
   process mapping many — see §10). Quantify against the 107 MB/chr resident
   baseline.
4. **Wire in and retire Rust.** Point `PANGYPLOT_GBWT_BIN` at the C++ binary; run
   the full pytest suite; document the build (CMake + sdsl/gbwt/gbwtgraph deps).
   Once green, retire the Rust `gbwt/sidecar` (and `gbwt/build` if the builder is
   now C++).

## 10. Risks / open questions

- Does C++ `gbwt` load a gbwt-rs-written `graph.gbwt`? (Step 1 answers this.)
- Can the GBWT's `sd_vector` index be mmap'd via sdsl, or only the record bytes?
  Partial mmap may still hit the memory goal — measure.
- Build complexity: C++ sidecar needs CMake + `sdsl-lite` + `gbwt` + `gbwtgraph`
  (submodules/vendored). Heavier than `cargo`. Budget setup time.
- Does mmap actually reduce RSS *enough* under real query patterns, or does
  touching most of the index during normal use page most of it in anyway?
  (Presence/trace over a viewport touches a bounded node range — should be local,
  but verify. If it pages everything in, mmap doesn't help and we revisit.)
- One process per chr vs one process mapping many chrs: with mmap, a single
  process mapping all chromosomes may be simpler and cheaper than N processes.
  Reconsider the process model once mmap works.

## 11. Key files (paths relative to repo root)

- `gbwt/sidecar/src/main.rs` — behavior to mirror
- `gbwt/sidecar/README.md` — wire contract
- `gbwt/build/` — native GBWT builder (keep if format-compatible)
- `pangyplot/db/gbwt_client.py`, `gbwt_manager.py`, `indexes/GbwtPathIndex.py`
- `tests/db/test_gbwt_native_build.py`, `test_gbz_parity.py`, `test_gbwt_manager.py`
- `context/gbwt-migration.md` — full migration background, the OPEN memory note
- Upstream: `github.com/jltsiren/gbwt`, `.../gbwtgraph`, `.../sdsl-lite`
