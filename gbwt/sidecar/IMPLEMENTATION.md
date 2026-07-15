# pangyplot-gbwt-sidecar (C++, memory-mapped)

A drop-in C++ replacement for the Rust `gbwt-sidecar`. Same localhost wire
contract (`gbwt/sidecar/README.md`), so nothing above the HTTP boundary changes —
the Python client, `GbwtManager`, and `GbwtPathIndex` are untouched.

**Why C++:** it serves the GBWT **memory-mapped from disk** (fork
[github.com/ScottMastro/gbwt-mmap](https://github.com/ScottMastro/gbwt-mmap)), so
resident memory scales with the working set of active queries, not the whole
index. A whole-genome HPRC index (5.4 GB on disk) that **OOM-kills a resident
load** on a 15 GB box serves here at **~333 MB resident**, with localized viewport
queries adding almost nothing (+8 MB for 20k counts).

## Build

Depends on the `gbwt-mmap` fork (built: `lib/libgbwt.a`) and the vgteam
`sdsl-lite` it links against (`libsdsl.a`), plus `libzstd` (pkg-config).

```sh
make                        # uses ../../../gbwt-mmap and ../../../local by default
make GBWT_DIR=/path/to/gbwt-mmap SDSL_PREFIX=/path/to/local   # or override
```

Produces `pangyplot-gbwt-sidecar`.

## Run

```sh
pangyplot-gbwt-sidecar <graph.gbwt|graph.gbz> [127.0.0.1:PORT]   # default :5701
```

Positional args exactly match what `GbwtManager` spawns (the launch contract), so
wiring it in is a one-line change: point `PANGYPLOT_GBWT_BIN` at this binary.

## Endpoints (the wire contract — see gbwt/sidecar/README.md)

| endpoint | response |
|---|---|
| `GET /health` | `ok` |
| `GET /meta` | JSON: `nodes, paths, has_metadata, has_translation, samples[], path_list[{id,sample,contig,phase,fragment}]` |
| `GET /walk?path=<id>` | binary little-endian i64 array; each = `(segment_id << 1) \| orientation_bit` |
| `GET /count?node=<id>` | text decimal: haplotype occurrence count at the node |

`/walk` and `/count` are byte-identical to the Rust sidecar; `/meta` is
semantically identical (JSON key order differs, which `json.loads` ignores).
Verified by `tests/db/test_gbwt_native_build.py` (run with
`PANGYPLOT_GBWT_SIDECAR_BIN=$(pwd)/pangyplot-gbwt-sidecar`).

## Design notes

- **Memory-mapped, DA skipped.** Loads with `GBWT::load(in, mmap_base,
  with_da=false)`: the BWT bulk is served zero-copy from the mmap and the
  document-array samples (needed only by `locate`) are not loaded. The wire
  contract exposes only count/walk, neither of which needs the DA.
- **Read-only, lock-free.** The index is immutable after load and shared across
  worker threads with no locking (matches the Rust sidecar).
- **No external HTTP dependency.** A minimal POSIX-socket server handles the four
  GET endpoints; nothing to vendor.

## Format support

- **Native `graph.gbwt`** (PangyPlot's `add --build-gbwt`: node id == segment id,
  no translation) — **fully supported.** This is the production default.
- **GBZ** — the embedded GBWT is loaded and served, but a *chopped* GBZ's
  node→segment translation (stored in the GBWTGraph) is **not yet applied**, so
  walks come back in node ids. Correct only for an unchopped GBZ. Applying the
  translation (to match the Rust `Backend::Gbz` path and pass
  `tests/db/test_gbz_parity.py`) is the remaining follow-up.
