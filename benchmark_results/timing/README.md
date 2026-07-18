# PangyPlot indexing benchmarks

Per-phase runtime and peak-memory measurements of the `pangyplot add`
preprocessing pipeline, over the full HPRC human genome for two graph builds.

## Files

- **`per_chromosome_summary.csv`** — one row per (chromosome, assembler),
  with node/step counts, peak RSS, total wall-clock minutes, and derived
  bytes-per-node / bytes-per-step.
- **`per_phase_timing.csv`** — the full data: one row per pipeline phase of every
  run (`seconds`, `peak_gb`, `delta_gb`). Phases with `kind=section` are the
  top-level stages; `kind=step` rows are their sub-phases (summing the sections
  gives the total, so don't add both or you double-count).

The two `.tsv` files one directory up (`sweep_results*.tsv`) are the same data in
the wide, at-a-glance layout the sweep emitted as it ran.

## What was measured

- **`assembler`** — `minigraph-cactus` (HPRC v1.1 MC clip, GRCh38) and `pggb`
  (HPRC v1.0 PGGB). Inputs: Zenodo 17173731 (MC) and 19580039 (PGGB).
- The pipeline measured is the current flat-array bubble-detection path
  (`PANGYPLOT_FLAT_BUBBLES=1`, the default).

## Machine and method

Single desktop, 15 GB RAM, each run confined to a memory cgroup
(`systemd-run -p MemoryMax=… -p MemorySwapMax=0`) so an over-run is a clean kill,
never swap-thrash. MC runs used an 11 GB cap; the larger PGGB graphs used 13 GB.
Times are wall-clock as the pipeline itself reports them.

Peak RSS is deterministic (hardware-independent); wall-clock is not, so the times
here are only comparable to each other, on this machine — not to timings measured
elsewhere.

## Headline findings

- **Memory scales with nodes, not steps.** Across 318 K – 11.1 M nodes,
  peak RSS ≈ 0.55 GB + ~1200 B/node, independent of step count. chr16-PGGB's
  691 M steps (the most in the genome) still peaked at only 5.1 GB.
- **PGGB chr1 (11.1 M nodes) and chr9 (8.8 M)** — the largest graphs in the set —
  complete at 12.7 and 12.2 GB.

## Caveats baked into specific rows

- All runs are clean, single-governor, suspend-free (a system suspend during the
  first PGGB chr7 run was detected and that run was discarded and re-measured).

## Reproducing

```bash
python benchmark_memory.py --gfa <chr.gfa> --layout <chr.lay.tsv> \
    --chr <chr> --ref <ref> --nodes <N> --steps <S> --save <name>
```

writes `benchmark_results/<name>.memory.json` (per-phase timings + a full
RSS-vs-time sample timeline). The raw `.memory.json` files and per-run pipeline
logs are gitignored — they are large and mostly memory samples; this directory
holds the distilled timing extracted from them.
