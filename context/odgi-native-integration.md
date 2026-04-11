# Odgi Native Format Integration

Potential improvements to PangyPlot's backend by adopting odgi's native `.og` format as the base graph representation, with PangyPlot-specific indexes as overlays.

## Current Architecture

PangyPlot preprocesses GFA files through a two-pass Python parser (`parse_gfa.py`) into several SQLite databases and mmap'd numpy array indexes:

| Store | Contents | Used for |
|-------|----------|----------|
| `segments.db` | id, sequence, length, GC/N counts, layout coords | Segment lookup |
| `links.db` | from/to IDs, strands, haplotype bitmasks, frequency | Neighbor traversal |
| `step_index.db` | step, seg_id, bp start/end per reference genome | bp-to-step conversion |
| `bubbles.db` | source/sink/inside segments, hierarchy, ranges | Bubble queries |
| `*.binpath` | Delta-zigzag-varint compressed path steps | Sample haplotype paths |
| `*.npy` (mmap) | Flat arrays extracted from the above SQLite tables | O(1) serving lookups |

odgi is currently used only as an external CLI tool during preprocessing (`odgi build`, `odgi sort`, `odgi layout`, `odgi view`). The `.og` file is converted back to GFA before PangyPlot ingests it.

## Proposed Change

Use the `.og` file directly as the base graph representation via odgi's Python bindings. PangyPlot-specific data becomes overlay indexes on top of it, rather than duplicating graph topology into SQLite.

### What `.og` replaces

**Segment storage (`segments.db` + `SegmentIndex` numpy arrays)**
- `odgi.graph.get_sequence(handle)` and `odgi.graph.get_length(handle)` provide O(1) segment access.
- GC/N counts can be computed on the fly from the sequence.
- Eliminates the need to store and maintain `segments.db`.

**Link topology (`links.db` topology columns + `LinkIndex` numpy arrays)**
- `odgi.graph.follow_edges(handle, callback)` provides native neighbor traversal.
- Eliminates the CSR-like flat array structure currently built from `links.db`.

**GFA parsing (`parse_gfa.py` two-pass parser)**
- `odgi build` already parses GFA in C++ (much faster than Python).
- The `.og` file loaded via `odgi.graph()` replaces re-parsing GFA text entirely.

**Path iteration**
- `odgi.graph.for_each_step_in_path()` iterates path steps directly.
- Could replace raw path data extraction during preprocessing.

**BFS / subgraph traversal (`GFAIndex.bfs()`)**
- odgi's handle graph API supports edge traversal natively.

### What `.og` does NOT replace (overlay indexes)

These are PangyPlot-specific and have no equivalent in odgi:

| Overlay Index | Why it's needed |
|---------------|-----------------|
| **Bubble hierarchy** (`bubbles.db`, `BubbleIndex`) | BubbleGun analysis output; odgi has no bubble concept |
| **Haplotype bitmasks** (per-link) | uint64 path-presence bitmasks computed during preprocessing |
| **Layout coordinates** (x1/y1/x2/y2) | Stored in `.lay`/`.lay.tsv`, not in `.og` |
| **Step index** (`StepIndex` sorted arrays) | Sorted bp arrays for binary search; odgi paths are sequential-access only |
| **Polychain decompositions** | Viewport-based rendering precomputation |
| **Compressed paths** (`.binpath`) | Delta-zigzag-varint with lazy subpath loading; odgi has no random-access path API |

### Simplified preprocessing pipeline

```
Before:  GFA → odgi build → odgi sort → odgi layout → odgi view (back to GFA) → parse_gfa.py → SQLite + numpy
After:   GFA → odgi build → odgi sort → odgi layout → build overlay indexes from .og directly
```

The two-pass Python GFA parser is eliminated. BubbleGun, haplotype bitmask computation, and step index construction would read from the `.og` graph object instead of parsing GFA text.

## Open Questions

### Performance: odgi Python bindings vs mmap'd numpy

The critical concern is **serving speed**. Current architecture:
- `segment_length[seg_id]` is a single numpy array dereference (nanoseconds)
- `follow_edges` equivalent uses pre-built CSR flat arrays (nanoseconds)

odgi Python bindings add FFI overhead per call. For bulk operations (fetching hundreds of segments for a viewport), this could add up.

**Benchmark needed**: Load a chrY `.og` file via odgi Python bindings and compare:
- `odgi.graph.get_length(handle)` in a loop vs `segment_index.length[seg_id]`
- `odgi.graph.follow_edges()` vs `link_index.get_links_by_segment_fast(seg_id)`
- Bulk subgraph extraction (500+ segments) through both paths

If odgi bindings are too slow for serving, a hybrid approach works: load `.og` at startup, extract hot-path data into numpy arrays (skip SQLite entirely), and query `.og` only for cold-path data (full sequences, rare lookups).

### Layout coordinate storage

Layout coordinates are in `.lay.tsv` (or binary `.lay`), not in `.og`. Options:
1. Keep storing coordinates in a separate overlay (current approach, just drop SQLite)
2. Investigate whether odgi's binary `.lay` format can be queried directly via bindings
3. Store coordinates as numpy arrays indexed by odgi node rank

### Path random access

odgi paths are sequential-iteration only. PangyPlot needs:
- Binary search on reference path (bp → step) — `StepIndex`
- Lazy subpath loading (decode steps 500-600 without reading full path) — `.binpath`

These access patterns don't map well to `for_each_step_in_path()`. The step index and binpath overlays would likely persist even with full odgi integration.

### BubbleGun interface

BubbleGun currently consumes GFA via its own Python parser (`BubbleGun/graph_io.py`). Switching to `.og` would require either:
- Adapting BubbleGun to accept an odgi graph object
- Extracting topology from `.og` into BubbleGun's internal format
- Keeping GFA as BubbleGun's input (simplest, least disruption)

## Runtime Cost Estimates

Building numpy arrays from `.og` at startup (instead of loading from cached `.npy` files) was considered and rejected for full-genome use cases.

### Per-chromosome build times (estimated from SQLite rebuild benchmarks)

| Chromosome scale | Segments | Links | Estimated build time |
|-----------------|----------|-------|---------------------|
| chrY (small) | 164K | 227K | ~100-500ms |
| chr20 (medium) | 1.86M | 2.57M | ~2-3s |
| chr3 (large) | ~5M | ~6.9M | ~5-8s |

### Full genome cost

A full human genome is roughly equivalent to 24 chr3-scale chromosomes: **24 * ~5-8s = 2-3 minutes of startup**. This is too slow for both development iteration and production restarts.

### Conclusion: keep the `.npy` cache, change the source of truth

The serving architecture stays the same — mmap'd `.npy` files for instant startup. The change is what *produces* those `.npy` files:

```
Current:   .og → GFA → parse_gfa.py → SQLite → numpy → .npy cache
Proposed:  .og → odgi Python bindings → numpy → .npy cache
```

- **Preprocessing**: Drop `segments.db` and `links.db` from the pipeline entirely. The `.og` file plus overlay indexes (bubbles, haplotypes, polychains) are the complete on-disk representation.
- **First startup** per chromosome: Build numpy arrays from `.og` instead of from SQLite (~comparable speed). Save as `.npy`.
- **Subsequent startups**: mmap `.npy` files as before (instant, ~0-10ms per index).

Net effect: simpler data pipeline, fewer intermediate files, but the serving layer is unchanged.

## Migration Strategy

1. **Benchmark first** — measure odgi Python binding performance vs numpy for the hot path
2. **Replace preprocessing input** — read `.og` instead of GFA in `parse_gfa.py` (lowest risk, immediate benefit: faster C++ parsing)
3. **Eliminate `segments.db` and `links.db`** — build `.npy` caches directly from `.og` on first startup, skip the SQLite intermediary
4. **Keep all overlay indexes** — bubbles, haplotypes, steps, polychains, layout coords remain as-is
5. **Evaluate cold-path queries** — sequence retrieval, full segment objects can go through odgi bindings directly
