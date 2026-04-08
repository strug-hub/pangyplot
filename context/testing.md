# Testing Plan

Test organization and coverage plan for PangyPlot.

---

## Directory Structure

```
tests/
  preprocess/          # Parsers, skeleton geometry, spine, preprocessing
  db/                  # Indexes, queries, chain polyline, SQLite, utilities
  objects/             # Domain objects (Bubble, Chain, Path, etc.)
  routes/              # Flask API endpoint tests
  fixtures/            # Shared test data
    cytoband/          # Cytoband fixture files
    db/                # SQLite fixture databases
    *.gfa, *.tsv       # GFA and layout fixtures
    drb1_annotations.gff3  # Synthetic GFF3 for annotation tests
  graph/               # JavaScript unit tests (spine engine, models, utils)
  ui/                  # JavaScript UI event bus tests
```

Each subdirectory has its own `conftest.py` for fixtures and an `__init__.py`.

Run all tests: `python -m pytest tests/` + `npx vitest run`

---

## Current Coverage (588 Python + 203 JS = 791 tests)

### Well Tested (dedicated tests, all public functions covered)

| Module | Test File | Notes |
|--------|-----------|-------|
| **Preprocess** |
| `skeleton_geometry.py` | `test_skeleton_geometry.py` | RDP, grid simplify, perpendicular distance + DRB1 real data |
| `spine_builder.py` | `test_spine_builder.py` | Spine generation, stride, export roundtrip |
| `parse_gff3.py` | `test_parse_gff3.py` | Line parsing, attributes, type filtering, MANE tags |
| `parse_gfa_lines` | `test_parse_gfa_lines.py` | Segment, link, path line parsing |
| `parse_layout.py` | `test_parse_layout.py` | ODGI and Bandage layout parsing |
| `parse_cytoband.py` | `test_parse_cytoband.py` | Cytoband parsing, colors, normalization |
| `parse_utils.py` | `test_parse_utils.py` | GFA parsing utilities |
| **Indexes** |
| `SegmentIndex.py` | `test_segment_index.py` | Array lookups, batch ops, mmap roundtrip |
| `LinkIndex.py` | `test_link_index.py` | Segment mapping, fast path, tuple lookup, strands |
| `GFAIndex.py` | `test_gfa_index.py` | Neighbors, BFS, traverse, subgraph (DRB1 seg 1 + seg 2) |
| `StepIndex.py` | `test_step_index.py` | Binary search, coordinate queries, segment map |
| `BubbleIndex.py` | `test_bubble_index.py` | SNP/bigger/nested bubbles, range queries, parent-child |
| `AnnotationIndex.py` | `test_annotation_index.py` | GFF3 fixture, hierarchy, MANE filtering, gene search |
| `PolychainIndex.py` | `test_polychain_index.py` | Decomposition lookup, layout range queries, mmap roundtrip |
| `SeqIndex.py` | `seq_read_write_test.py` | Nibble encode/decode roundtrip |
| **DB / Query** |
| `db_utils.py` | `test_db_utils.py` | NumpyJSONEncoder, dump/load JSON, get_connection |
| `integrity_check.py` | `test_integrity_check.py` | Dedup links/nodes, remove invalid links |
| `chain_polyline.py` | `test_chain_polyline.py` | Helpers, polyline building, decomposition (connectors + children + bypass), junction graph |
| `query.py` | `test_query_functions.py` | get_path, get_path_order, get_bubble_meta, get_chain_graph |
| **Domain Objects** |
| `Bubble.py` | `test_bubble.py` | Containment, source/sink flipping, siblings, ranges |
| `Path.py` | `test_path.py` | Clone, subset_path, bubble path, sample naming |
| `Chain.py` | `test_chain.py` | Sort, siblings, step range, internal segment IDs |
| **JavaScript** |
| `reference-spine-engine.js` | `spine-engine.test.js` | bpToLayout, layoutToBp, initSpine, round-trip, clamping |
| `format-utils.js` | `format-utils.test.js` | formatBp, formatNodeLabel, formatPercentage |
| `sim-object.js` | `sim-object.test.js` | SimObject hierarchy |
| `polychain-model.js` | `polychain-model.test.js` | Polychain model |
| `path-codec.js` | `path-codec.test.js` | Delta-zigzag-varint encoding/decoding |
| UI event bus | `*-events.test.js` (6 files) | Cytoband, color, navbar, gene search, coordinates, debug |

### Route Coverage

| Endpoint | Test File | Status |
|----------|-----------|--------|
| `/select` | `test_graph_routes.py` | Tested — structure, node/link fields, 404 |
| `/pop` | `test_graph_routes.py` | Tested — simple SNP (segs 11/17), nested (segs 141/133), segment noop |
| `/chains` | `test_graph_routes.py` | Tested — 16 chains for DRB1 region, required fields |
| `/detail-tiles` | `test_graph_routes.py` | Tested — 63 chains full range, junction graph, narrow range, requires PolychainIndex |
| `/genes` | `test_annotation_routes.py` | Tested — range queries, mane_only, narrow range exclusion |
| `/search` | `test_annotation_routes.py` | Tested — gene name search, case insensitive |
| `/cytoband` | `test_cytoband_routes.py` | Tested — single/all chromosomes, 404 |
| `/chromosomes` | `test_cytoband_routes.py` | Tested — canonical + noncanonical |
| `/path` | `test_path_routes.py` | Tested — subpath retrieval, steps, nonexistent sample |
| `/pathorder` | `test_path_routes.py` | Tested — 12 DRB1 samples |
| `/path-meta` | `test_path_routes.py` | Tested — required fields, invalid sample |
| `/path-data` | `test_path_routes.py` | Tested — binary data serving, invalid sample 404 |
| `/samples` | `test_path_routes.py` | Tested — 12 DRB1 samples |
| `/skeleton`, `/spine`, `/polychain` | — | Not tested (static file serving) |
| `/chain-graph`, `/bubble-meta` | — | Not tested |
| `/gfa` | — | Not tested |

### Partially Tested (tested through pipeline or indirectly)

| Module | Tested Via | Gaps |
|--------|-----------|------|
| `parse_gfa.py` | `test_parse_pipeline.py`, `test_drb1_pipeline.py` | `verify_reference` edge cases |
| `bubble_gun.py` | `test_drb1_pipeline.py` | Only tested in full pipeline context |
| `meta.py` | `test_drb1_pipeline.py::TestGraphMeta` | Tested with DRB1 data; no dedicated unit tests |
| `Segment.py`, `Annotation.py` | Indirect via index/route tests | No dedicated test files |
| SQLite layer | Indirect via index tests | No direct unit tests, well exercised through indexes |

### Untested (low priority)

| Module | Notes |
|--------|-------|
| `app.py` | Startup/init — tested indirectly via route fixtures |
| `compact_graph.py` | BubbleGun adapter, tightly coupled to external library |
| `construct_bubble_links.py` | Covered indirectly via pipeline tests |
| `skeleton_pipeline.py`, `generate_skeleton.py`, `export_polychain.py` | Orchestration glue |
| `ensure_indexes.py` | Index migration utility |
| `PathIndex.py`, `path_db.py` | Thin wrappers, low bug risk |
| `organisms.py` | Data module |
| `viewport.js` | DOM-dependent, needs heavy mocking |
| `gene-data.js` | Module restructured, needs new test design |

---

## Remaining Backlog

### Medium Value

1. **Remaining route endpoints** — `/chain-graph`, `/bubble-meta`, `/gfa`
2. **viewport.js** — needs DOM mocking for getViewport, fitToScreen

### Low Value (skip unless touching)

3. `compact_graph.py` — BubbleGun internals
4. `path_db.py` — simple JSON I/O
5. SQLite layer — well exercised through indexes
6. `ensure_indexes.py`, `generate_skeleton.py`, `export_polychain.py` — orchestration glue

---

## Conventions

- **Fixture data**: Use small synthetic fixtures for unit tests. DRB1-3123 for integration tests. chrY datastore for full-stack query tests.
- **Test naming**: `test_<module>.py` for unit tests, `test_<feature>_routes.py` for endpoint tests.
- **Class grouping**: Group related tests in classes (e.g. `TestParseCytobandColors`). No class needed if there's only a few tests for a module.
- **Scope**: Prefer `scope="module"` for expensive fixtures (DB loading). Use `tmp_path` for throwaway files.
- **Bubble IDs are unstable** between runs — anchor tests to source/sink segments, not bubble IDs.
- **Run both suites**: `python -m pytest tests/` and `npx vitest run`.

---

## Code Changes Made During Testing

- Removed dead `child_bubbles`/`child_bubble_objects` from `BubbleIndex.get_popped_subgraph()` and `query.pop_bubble()` — hardcoded to `[]`, never read by frontend
- Removed `get_detail_tile` fallback paths — now requires PolychainIndex and layout coords (frontend always provides both)
- Removed stale `TestJunctionGraph` tests (superseded by DRB1-based route and chain_polyline tests)
- Removed stale JS tests for spine/genes/viewport (API refactored during simplify migration); spine engine tests rewritten against current API
