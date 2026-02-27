# Backend Query Logic

Developer notes on the backend data flow, index classes, domain objects, and coordinate systems.

---

## API Endpoints (`pangyplot/routes.py`)

| Endpoint | Params | Purpose |
|---|---|---|
| `GET /select` | genome, chromosome, start, end | Primary query: bubble graph for genomic region |
| `GET /pop` | id, genome, chromosome | Expand a collapsed bubble node into its subgraph |
| `GET /path` | genome, chromosome, start, end, sample | Sample haplotype path through a region |
| `GET /pathorder` | genome, chromosome | Sample ordering/index for frontend color mapping |
| `GET /genes` | genome, chromosome, start, end | Gene annotations in range |
| `GET /search` | type, query_string | Gene search by name |
| `GET /samples` | — | Lists all samples/haplotypes |
| `GET /chromosomes` | noncanonical (optional) | Lists available chromosomes |
| `GET /cytoband` | chromosome | Cytoband data for ideogram |

All endpoints delegate to `pangyplot/db/query.py`. Errors raise `ValueError`, caught as JSON 404.

---

## Query Orchestration (`pangyplot/db/query.py`)

Thin layer bridging routes to index classes.

Key functions:
- **`get_bubble_graph(indexes, genome, chrom, start, end)`** — main `/select` handler
- **`pop_bubble(indexes, id, genome, chrom)`** — expands a bubble via `BubbleIndex.get_popped_subgraph()`
- **`get_bubble_end(indexes, id, genome, chrom)`** — returns source/sink endpoint subgraph (`b123:0`, `b123:1`)
- **`get_path(indexes, genome, chrom, start, end, sample)`** — calls `Path.subset_path()` to extract portion
- **`get_path_order(indexes, genome, chrom)`** — returns sample ordering index

---

## Coordinate Systems (critical)

Three parallel systems in use simultaneously:

1. **Genomic bp** — user-facing coordinates (e.g., `23128355`)
2. **Step indices** — internal integers; each step = one reference segment covering a bp range
3. **Segment IDs** — internal integer IDs for individual graph segments

Conversion flow:
```
User bp range  →[StepIndex.query_coordinates()]→  step range
step range     →[BubbleIndex.get_top_level_bubbles()]→  Bubble objects
Bubble.inside  →[GFAIndex.get_subgraph()]→  Segment + Link objects
               →[.serialize()]→  JSON for frontend
```

---

## Index Classes (`pangyplot/db/indexes/`)

All are in-memory, loaded at app startup from `.quickindex.json.gz` files (not rebuilt from SQLite each time). App stores them as `app.step_index[(chrom, genome)]`, `app.bubble_index[chrom]`, etc.

### `StepIndex` (`StepIndex.py`)

Maps genomic bp ↔ step numbers. Core of coordinate conversion.

Data: three typed `array('I')` arrays indexed by step number:
- `starts[i]` — bp start of step i
- `ends[i]` — bp end of step i
- `segments[i]` — segment ID at step i

Key methods:
- **`query_coordinates(start_bp, end_bp) → (start_step, end_step)`** — binary search, most-used method
- `query_bp(position)` — single bp lookup → `(step_idx, start_bp, end_bp)`
- `query_segment_id_from_coordinates(start, end)` — segment IDs at query boundaries
- `segment_map()` — dict: `segment_id → list of steps`

Quickload: `steps.quickindex.json` (gzipped, loads in ~10ms).

---

### `BubbleIndex` (`BubbleIndex.py`)

Range queries over nested bubbles. The most complex index.

Data:
- Sorted typed arrays of top-level bubble step ranges
- `segment_to_bubble[]`, `bubble_to_parent[]` — hierarchy maps
- FIFO cache of 1000 `Bubble` objects (loaded on demand from SQLite)

Key methods:
- **`get_top_level_bubbles(min_step, max_step, as_chains=True)`** — main query method:
  1. Binary search start_steps for first overlap
  2. Iterate while `start_step ≤ max_step`
  3. Recurse into children (`_traverse_descendants`) to find leaf bubbles
  4. Group by `chain_id`, create `Chain` objects
- **`get_popped_subgraph(bubble_id, stepidx)`** — expand a bubble:
  - Emits `BubbleJunction` source+sink
  - Gets inner segments+links via `gfaidx.get_subgraph()`
  - Recursively gets child bubbles → chains
- `segment_in_bubble(seg_id)` — O(1) typed array lookup
- `[bubble_id]` — fetch Bubble by ID (FIFO cached)

Quickload: `bubbles.quickindex.json`.

---

### `GFAIndex` (`GFAIndex.py`)

Composition of three sub-indexes:

- **`SegmentIndex`** — typed arrays: `length`, `x1,y1,x2,y2` per segment ID; SQLite for seq/gc/n
- **`LinkIndex`** — compact two-level index: `seg_index_offsets[s]`, `seg_index_counts[s]`, `seg_index_flat[offset:offset+count]` for O(1) links-by-segment; strand stored as bitarray
- **`PathIndex`** — sample names dict + JSON files per sample

Key methods:
- `get_subgraph(seg_ids, step_index)` → `(segments, links)` for a set of segment IDs
- `get_segments(seg_ids)` → list of `Segment` objects
- `get_links(seg_id)` → outgoing links
- `[seg_id]` on LinkIndex → all links touching segment

---

### `AnnotationIndex` (`AnnotationIndex.py`)

Gene annotations from GFF3. `step_index` must be set before querying.

- `query_gene_range(chrom, start, end)` → SQLite range query
- `gene_search(query_string)` → substring search over gene name list
- `[gene_name]` → fetch single gene

---

## Domain Objects (`pangyplot/objects/`)

### `Bubble`

Represents a pangenome variation bubble (a divergence + reconvergence).

Key fields: `id`, `chain`, `chain_step`, `parent`, `children`, `siblings[2]`, `subtype`, `source_segments[]`, `sink_segments[]`, `inside{set}`, `range_inclusive[]`, `range_exclusive[]`, `length`, `gc_count`, `n_count`, `x1,y1,x2,y2`, `link_data`

Key methods: `serialize()`, `is_contained(start_step, end_step)`, `emit_junctions(gfaidx)`, `get_chain_link(gfaidx)`

### `Chain`

An ordered sequence of bubbles forming a linear variation path.

Fields: `id`, `bubbles[]` (sorted by `chain_step`), `parent_bubble`, `gfaidx`

Methods: `serialize()` → `{"nodes": bubbles, "links": chain_links}`, `decompose()`, `get_chain_links()`

### `BubbleJunction`

The visible source or sink endpoint of an expanded bubble in the popped view.

ID format: `"b{bubble_id}:0"` (source) or `"b{bubble_id}:1"` (sink)

Fields: `bubble`, `is_source`, `contained{set}`, `segments[]`, `length`, `is_chain_end`

Method: `get_popped_links()` → `{chain_links, deletion_links, end_links, child_links}`

### `Link`

Graph edge between segments.

Key fields: `from_id`, `to_id`, `from_strand`, `to_strand`, `haplotype` (hex bitmask of which samples have it), `frequency`, `link_type` (`"link"`, `"chain"`, `"deletion"`, `"self-destruct"`, …), `contained[]`, `deletion_bubble_id`

Methods: `serialize()`, `combine_links()` (OR haplotypes), `update_to_chain_link()`, `flip()`

### `Segment`

Fields: `id`, `length`, `gc_count`, `n_count`, `x1,y1,x2,y2`, `seq`, `step[]`

### `Path`

Fields: `sample`, `hap`, `contig`, `full_id`, `path[]` (list of `"segid+/-"` strings), `start`, `length`, `is_ref`, `bubble_path[]`

Methods: `subset_path(start_id, end_id)` — extract path portion between segment IDs

### `Annotation`

Gene/transcript/exon hierarchy from GFF3.

Fields: `id`, `type`, `chrom`, `start`, `end`, `strand`, `gene_name`, `parent`, `exons[]`, `transcripts[]`, `mane_select`, `ensembl_canonical`, `range`

---

## SQLite Storage (`pangyplot/db/sqlite/`)

Each chromosome's data in `datastore/graphs/{db_name}/{chrom}/`:

| File | Contents |
|---|---|
| `segments.db` | id, length, gc/n counts, x/y coords, seq |
| `step_index.db` | step→segment mapping (step, seg_id, start, end, genome) |
| `links.db` | from_id, to_id, strands, haplotype, frequency |
| `bubbles.db` | id, chain, chain_step, parent, children, siblings, source, sink, inside, ranges, coords, link_data (JSON) |
| `paths/` | JSON files per sample: `{sample}__{n}.json` |
| `annotations/` | Gene annotations |

SQLite wrapper modules: `bubble_db.py`, `step_db.py`, `segment_db.py`, `link_db.py`, `path_db.py`, `annotation_db.py`

---

## Complete `/select` Request Flow

```
GET /select?genome=GRCh38&chromosome=chr7&start=23128355&end=23200010

routes.select()
  └─ query.get_bubble_graph(app, "GRCh38", "chr7", 23128355, 23200010)
       ├─ stepidx = app.step_index[("chr7", "GRCh38")]
       ├─ bubbleidx = app.bubble_index["chr7"]
       ├─ stepidx.query_coordinates(23128355, 23200010) → (start_step, end_step)
       ├─ bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)
       │    ├─ Binary search bubble start_steps
       │    ├─ _traverse_descendants() for nested bubbles
       │    └─ Group → Chain objects
       └─ chain.serialize() → {"nodes": [...], "links": [...]}
```

---

## App Startup (`pangyplot/app.py`)

On startup, `create_app()` loads all indexes into memory:
- `app.gfa_index[chrom]` — GFAIndex (segments, links, paths)
- `app.step_index[(chrom, ref)]` — StepIndex
- `app.bubble_index[chrom]` — BubbleIndex
- `app.annotation_index[ref]` — AnnotationIndex
