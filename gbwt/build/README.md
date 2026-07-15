# gbwt-build

Builds a native, compact **GBWT** for PangyPlot's path engine — no vg, no
chopping. Reads a "pathdata" intermediate emitted by
`pangyplot/preprocess/gbwt_build.py` and writes `graph.gbwt`.

```sh
gbwt-build <input.pathdata> <output.gbwt>
```

Usually invoked for you by `pangyplot add --build-gbwt`; run it directly only
for debugging.

```sh
cargo build --release --manifest-path gbwt/Cargo.toml
```

## Why native (and why only a GBWT, not a GBZ)

GBWT *construction* is available in gbwt-rs (`GBWTBuilder`); GBZ construction is
not (gbwt-rs reads GBZs but does not build them — that lives in the vg/C++
`gbwtgraph` toolchain). PangyPlot doesn't need a GBZ: a GBWT already encodes the
graph **topology** (edges live in its records), and PangyPlot already owns every
segment's **DNA** in `SegmentIndex`. So a compact GBWT + SegmentIndex is
functionally a compact GBZ, and the path engine needs only the GBWT.

The key identity that makes this exact: PangyPlot's
`combined = (segment_id << 1) | orientation_bit` is **already** the GBWT node
handle (`encode_node(id, orient) = 2*id + orient`, Forward=0/Reverse=1). Because
PangyPlot segments are compact and 1-based, node id == segment id with no
translation. The built GBWT serves walks byte-identical to the binpaths it was
built from (`tests/db/test_gbwt_native_build.py`).

## pathdata format (little-endian)

The single source of truth is `src/main.rs`. Emitted by `gbwt_build.py`.

```
magic  "PPGB"
u32    version (= 1)
u64    num_paths
per path:
  u32  sample_len, sample bytes (utf-8)
  u32  contig_len, contig bytes (utf-8)
  u64  haplotype
  u64  fragment
  u64  num_steps, num_steps × i64 combined (node handles, each >= 2)
```

The GBWT is built **bidirectional with metadata**, matching the vg GBZ path
indexes the engine otherwise adopts.
