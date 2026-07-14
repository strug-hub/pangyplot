# How `pangyplot add` scales

Answers reviewer r1.c4 (how run-time / memory / index size scale with pangenome
size). Measured on HPRC v2 chrY, all runs same machine, memory-capped cgroup.

**Memory scales with nodes. Time scales with steps. They are separate axes.**

## The controlled experiment

Two-point fits across different chromosomes confound the two axes, so instead:
hold the graph *completely* fixed (same 1,046,775 nodes, 1,394,620 links, same
layout file) and vary only the number of haplotypes in the GFA. Any change in
peak RSS is then caused by step count alone.

| paths | steps | gather-paths RSS | seg+links RSS | **peak RSS** | gather-paths time |
|---|---|---|---|---|---|
| 404 | 11.6 M | 0.66 G | 0.79 G | **1.68 G** | 26.1 s |
| 807 | 25.7 M | 0.77 G | 0.79 G | **1.84 G** | 47.8 s |
| 1614 | 54.3 M | 0.81 G | 0.78 G | **1.68 G** | 97.1 s |

**4.7x the steps → peak RSS x1.00.** Flat. The same 4.7x costs **3.7x the time**.

- `Gathering segments and links` is constant, as it must be — the graph did not change.
- `Gathering paths` RSS grows only 1.23x for 4.7x the steps: the `.binpath` codec
  encodes and writes one path at a time, so steps are streamed, never accumulated.
  It peaks at 0.81 G, well under the 1.68 G ceiling, so paths never set the peak.
- The 1.84 G at 807 paths is run-to-run allocator variance (~±0.1 G), not signal —
  nodes were identical in all three runs.

Peak lives in `Exporting skeleton`, and everything that sets it is node-driven.

## The model

    peak RSS  ≈  0.27 G  +  1448 B x nodes          (steps do not appear)
    wall time ≈  node-driven phases x nodes  +  path phases x steps

The node slope is measured across v1.1 chrY (164 K nodes → 0.49 G) and v2 chrY
(1.05 M nodes → 1.68 G). Before the flat bubble port it was 3041 B/node; see
[[bubblegun-flat-repr]].

## What this means for the big chromosomes

**chr22** — 2,176,837 nodes (2.08x chrY), 578,479,542 steps (**10.6x** chrY):

- memory ≈ **3.2 G**. The 10.6x steps cost nothing. Fits the 15 GB box easily.
- time ≈ **20–30 min**, almost all of it in `Gathering paths` (~10.6x of 97 s).

`odgi sort` failing on chr22 is **not** a signal that `pangyplot add` will fail.
odgi must hold all 578 M steps at once; `add` never does.

**chr1** — node count unknown, and it is the only number that matters. It cannot
be inferred from the 30 GB file size: file size tracks steps, and chr22's `.og`
is 8x chrY's while having only 2.08x the nodes. One command settles it:

    odgi stats -i chr1.og -S

Under ~9 M nodes and chr1 fits in 15 GB. Time will be the pain, not memory.

## Consequences

- Optimizing memory means optimizing **per-node** cost. Step-side work
  (`.binpath`, gzip level) buys time, not headroom.
- Optimizing time means optimizing the **path phases**. They are ~40% of runtime
  at chrY and will be ~65% at chr22.
- The remaining per-node costs, in order: the skeleton export (sets the peak),
  the parse-time floor (1.59 G resident), and `Indexing bubbles` (+0.31 G, which
  is 308 K domain `Bubble` objects at 1,267 B each and could be streamed).
