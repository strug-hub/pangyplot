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

## Odgi Python API

odgi provides Python bindings via pybind11. `import odgi` requires odgi built from source with bindings enabled, or installed via conda (`conda install -c bioconda odgi`). There is no pip package — it's a compiled C++ `.so`.

### Installation

- **Conda** (recommended for genomics users): `conda install -c bioconda odgi`
- **From source**: CMake build with `-DBUILD_PYTHON_BINDINGS=ON`
- **No PyPI wheel** — system-level dependency, not pip-installable

Should be treated as an **optional dependency**: `try: import odgi` at startup, fall back to current SQLite path if unavailable. Both paths produce the same `.npy` cache files.

### API Reference

Docs: https://odgi.readthedocs.io/en/latest/rst/binding/api.html

**Graph loading**
```python
gr = odgi.graph()
gr.load("graph.og")              # load from .og file
gr.serialize("graph.og")         # save to .og file
```

**Node/segment access (O(1) by ID)**
```python
handle = gr.get_handle(seg_id)   # node ID → handle
gr.get_id(handle)                # handle → node ID
gr.get_length(handle)            # sequence length
gr.get_sequence(handle)          # full DNA sequence
gr.has_node(seg_id)              # existence check
gr.get_node_count()              # total nodes
gr.min_node_id()                 # ID range
gr.max_node_id()
```

**Edge/link traversal**
```python
gr.follow_edges(handle, False, callback)  # iterate successors
gr.follow_edges(handle, True, callback)   # iterate predecessors
gr.get_degree(handle, False)              # out-degree
gr.get_degree(handle, True)               # in-degree
gr.has_edge(handle1, handle2)             # edge existence
```

**Bulk iteration**
```python
gr.for_each_handle(callback)                       # all nodes
gr.for_each_handle(callback, parallel=True)        # parallel iteration
gr.for_each_step_on_handle(handle, callback)       # all paths through a node
```

**Path access**
```python
gr.get_path_count()                                # total paths
gr.has_path("GRCh38#chr1")                         # existence check
path = gr.get_path_handle("GRCh38#chr1")           # name → path handle
gr.get_path_name(path)                             # path handle → name
gr.get_step_count(path)                            # steps in path
gr.for_each_path_handle(callback)                  # iterate all paths
```

**Step iteration (sequential only)**
```python
gr.for_each_step_in_path(path, callback)           # iterate all steps
step = gr.path_begin(path)                         # first step
gr.get_handle_of_step(step)                        # step → node handle
gr.get_next_step(step)                             # walk forward
gr.get_previous_step(step)                         # walk backward
gr.has_next_step(step)                             # bounds check
gr.path_back(path)                                 # last step
```

**Handle orientation**
```python
gr.get_is_reverse(handle)        # reverse complement?
gr.flip(handle)                  # get reverse orientation
gr.forward(handle)               # get forward orientation
```

### API Gaps for PangyPlot

The main limitation is **no random access on paths**. odgi only supports sequential step iteration (`get_next_step` / `get_previous_step`). PangyPlot needs:

1. **bp → step lookup** (binary search) — currently `StepIndex`
2. **Subpath extraction** (steps in a bp window) — currently `.binpath` lazy loading

### Potential Fork / Upstream Contribution

Adding random-access path queries to odgi would eliminate the need for `StepIndex` and `.binpath` overlays entirely. Target API additions:

```python
# Jump to a bp position without walking from the start
gr.get_step_at_position(path, bp_offset)  → step_handle

# Jump to the Nth step directly
gr.get_step_at_index(path, step_index)    → step_handle

# Return steps in a bp window
gr.get_steps_in_range(path, start_bp, end_bp) → list[step_handle]
```

**Implementation feasibility**: odgi stores paths as compressed integer sequences internally. Adding a position index (sorted bp offsets per path) is a natural extension to the C++ internals — essentially what `StepIndex` does externally. The harder part is persisting the index in the `.og` serialization format so it survives `load()`/`serialize()` cycles.

**Recommended approach**: open an issue on `pangenome/odgi` first. The maintainers (Erik Garrison et al.) may have existing plans or opinions. Could become an upstream contribution rather than requiring a full fork.

If these APIs existed natively, the remaining PangyPlot overlays would reduce to just:
- Bubble hierarchy (BubbleGun-specific)
- Haplotype bitmasks (PangyPlot-specific)
- Layout coordinates (separate `.lay` file)
- Polychain decompositions (visualization-specific)

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
