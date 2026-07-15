# pangyplot-gbwt-sidecar (C++, memory-mapped)

Implementation notes for the C++ sidecar. It honours the localhost wire contract
in `gbwt/sidecar/README.md`, so nothing above the HTTP boundary depends on any of
this — the Python client, `GbwtManager`, and `GbwtPathIndex` see only the
contract.

**Why memory-mapped:** it serves the GBWT **memory-mapped from disk** (fork
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

Verified by `tests/db/test_gbwt_native_build.py` (run with
`PANGYPLOT_GBWT_SIDECAR_BIN=$(pwd)/pangyplot-gbwt-sidecar`).

## Design notes

- **Memory-mapped, DA skipped.** Loads with `GBWT::load(in, mmap_base,
  with_da=false)`: the BWT bulk is served zero-copy from the mmap and the
  document-array samples (needed only by `locate`) are not loaded. The wire
  contract exposes only count/walk, neither of which needs the DA.
- **Read-only, lock-free.** The index is immutable after load and shared across
  worker threads with no locking.
- **No external HTTP dependency.** A minimal POSIX-socket server handles the four
  GET endpoints; nothing to vendor.

## Format support

- **Native `graph.gbwt`** (PangyPlot's `add --build-gbwt`: node id == segment id,
  no translation) — **fully supported.** This is the production default.
- **GBZ** (adopted via `add --gbz`, possibly chopped) — **fully supported.** The
  embedded GBWT is served mmap'd, and the GBWTGraph's node→segment translation is
  parsed (segment names + the node→segment `sd_vector`) so `/walk` collapses each
  chopped node run back to its segment id. Only the translation is read resident;
  the node sequences are skipped, not decompressed (the mmap memory win holds).
  Verified byte-identical to the binpaths by `tests/db/test_gbz_parity.py` and
  `tests/db/test_gbz_ingest.py`.

### How the translation is applied (`main.cpp`)

After `GBWT::load` the stream sits at the embedded GBWTGraph. We read its 24-byte
header, **skip** the `sequences` string array (seek past the zstd blob for graph
version ≥ 4, load-and-discard the compact components for v3 — never materializing
the DNA), then load `segments` (a `gbwt::StringArray`) and `node_to_segment` (an
`sdsl::sd_vector<>`). In `/walk`, each node id `v` maps to segment
`segments.str(node_to_segment.predecessor(v).first)`. Consecutive nodes are
collapsed into one segment step **only** when they form a chop run — same segment
and adjacent node ids (forward `v+1`, reverse `v-1`) — so genuine tandem repeats
of a segment (a self-loop revisits the *same* node id, which is not adjacent) are
preserved exactly as in the binpaths.
