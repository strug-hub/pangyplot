# gbwt-spike

Throwaway benchmark for the GBWT migration Stage 3 spike.
See `../../context/gbwt-migration.md` → "Stage 3 spike — runbook".

**Status:** written, **not yet built or run** (needs a real `.gbz` + memory).

## What it measures

- **(2) extract latency [Query B]** — time to extract whole sample walks
  (`gbz.path`). Compare against Stage 2's pure-Python server-side binpath slice;
  only worth replacing Stage 2 if this is clearly faster at scale.
- **(3) presence-count latency [Query A]** — time `search_state(node).len()`
  aggregated over a node window. Run it on **two windows**: a sparse one
  (~100s of segments) and a **dense** one (chrY 20–20.5 Mb was ~21k segments in
  0.5 Mb in Stage 2 verify — the real worst case).

Step (1) storage is a plain `du` (already baselined for v1 chrY in the plan).
Step (4) wire-shape (sidecar vs in-process) is estimated from (2)+(3).

## Run (when a GBZ and toolchain are available)

```sh
cargo run --release -- /path/to/chrN.gbz            # default ~5% node window
cargo run --release -- /path/to/chrN.gbz LO HI      # explicit node-id window
```

Get a GBZ: use the HPRC v2 GBZ on the NAS, or `vg gbwt -G graph.gfa --gbz-format
-g graph.gbz` from a GFA.

## Key limitation (already verified)

gbwt-rs gives extract + presence **counts**, but **not** the sample **set**
(cannot interpret C++ document-array samples). If the spike shows exact
set-membership is needed and can't be reconstructed cheaply, that is the one
signal to reach for C++ `locate` (on a GBZ built *with* DA samples). See
`context/gbwt-migration.md` §7a.
