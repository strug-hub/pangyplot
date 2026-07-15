# gbwt-build (C++)

Native C++ GBWT builder for PangyPlot's path engine. Reads the "pathdata"
intermediate emitted by `pangyplot/preprocess/gbwt_build.py` and writes a compact
`graph.gbwt` (simple-sds format) via `gbwt::GBWTBuilder`. **No vg, no chopping.**

Replaces the Rust `gbwt/build` — this is the ingest half of the full-C++ pivot
(the serving half is the memory-mapped C++ graphd). Kept in `build-cpp/` until
the Rust `gbwt/build` is retired, then it moves into place.

```sh
./build.sh                       # links the gbwt fork + sdsl (see gbwt/graphd/IMPLEMENTATION.md)
gbwt-build <input.pathdata> <output.gbwt>
```

## Why C++ (and why not vg)

`gbwt::GBWTBuilder` is the same construction vg uses — but vg's `gbwt -G <gfa>`
runs it through vg's GFA importer, which **chops** long segments (node ≠ segment,
needs a translation). We feed the builder our **pre-parsed compact paths**
instead, so node id == segment id: PangyPlot's `combined = (seg << 1) | orient`
is exactly `gbwt::Node::encode(id, rev)`. Result: a compact, translation-free
`graph.gbwt` that serves walks byte-identical to the binpaths it's built from
(validated against the DRB1 fixture).

## pathdata format

Little-endian; the single source of truth is `main.cpp` (and the Python emitter):
```
magic "PPGB", u32 version(=1), u64 num_paths
per path: u32 sample_len, sample bytes; u32 contig_len, contig bytes;
          u64 haplotype, u64 fragment;
          u64 num_steps, num_steps x i64 combined (node handles, each >= 2)
```
