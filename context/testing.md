# Testing Plan

Test organization and coverage plan for PangyPlot.

---

## Directory Structure

```
tests/
  preprocess/          # Parsers, skeleton geometry, spine, preprocessing
  db/                  # Indexes, queries, SQLite, utilities
  objects/             # Domain objects (Bubble, Chain, Path, etc.)
  routes/              # Flask API endpoint tests
  fixtures/            # Shared test data
    cytoband/          # Cytoband fixture files
    db/                # SQLite fixture databases
    *.gfa, *.tsv       # GFA and layout fixtures
    drb1_annotations.gff3  # Synthetic GFF3 for annotation tests
  graph/               # JavaScript unit tests (simplify viewer)
  ui/                  # JavaScript UI event bus tests
```

Each subdirectory has its own `conftest.py` for fixtures and an `__init__.py`.

Run all tests: `python -m pytest tests/` + `npx vitest run`

---

## Current Coverage (431 Python + 178 JS = 609 tests)

### Well Tested (dedicated tests, all public functions covered)

| Module | Test File | Notes |
|--------|-----------|-------|
| `skeleton_geometry.py` | `test_skeleton_geometry.py` | RDP, grid simplify, perpendicular distance + DRB1 real data |
| `db_utils.py` | `test_db_utils.py` | NumpyJSONEncoder, dump/load JSON, get_connection |
| `integrity_check.py` | `test_integrity_check.py` | Dedup links/nodes, remove invalid links |
| `SegmentIndex.py` | `test_segment_index.py` | Array lookups, batch ops, mmap roundtrip |
| `LinkIndex.py` | `test_link_index.py` | Segment mapping, fast path, tuple lookup, strands |
| `GFAIndex.py` | `test_gfa_index.py` | Neighbors, BFS, traverse, subgraph (DRB1 seg 1 + seg 2) |
| `StepIndex.py` | `test_step_index.py` | Binary search, coordinate queries, segment map |
| `BubbleIndex.py` | `test_bubble_index.py` | SNP/bigger/nested bubbles, range queries, parent-child |
| `AnnotationIndex.py` | `test_annotation_index.py` | GFF3 fixture, hierarchy, MANE filtering, gene search |
| `SeqIndex.py` | `seq_read_write_test.py` | Nibble encode/decode roundtrip |
| `Path.py` | `test_path.py` | Clone, subset_path, bubble path, sample naming |
| `Chain.py` | `test_chain.py` | Sort, siblings, step range, internal segment IDs |
| `parse_gff3.py` | `test_parse_gff3.py` | Line parsing, attributes, type filtering, MANE tags |
| `spine_builder.py` | `test_spine_builder.py` | Spine generation, stride, export roundtrip |
| `parse_gfa_lines` | `test_parse_gfa_lines.py` | Segment, link, path line parsing |
| `parse_layout.py` | `test_parse_layout.py` | ODGI and Bandage layout parsing |
| `parse_cytoband.py` | `test_parse_cytoband.py` | Cytoband parsing, colors, normalization |
| `parse_utils.py` | `test_parse_utils.py` | GFA parsing utilities |
| `format-utils.js` | `format-utils.test.js` | formatBp, formatNodeLabel, formatPercentage |
| `sim-object.js` | `sim-object.test.js` | SimObject hierarchy |
| `polychain-model.js` | `polychain-model.test.js` | Polychain model |
| UI event bus | `*-events.test.js` (6 files) | Cytoband, color, navbar, gene search, coordinates, debug |

### Partially Tested (tested through pipeline or indirectly)

| Module | Tested Via | Gaps |
|--------|-----------|------|
| `query.py` | `test_query.py`, `test_pop_links.py` | Missing: `get_path`, `get_path_order`, `get_bubble_meta`, `generate_gfa`, `get_detail_tile` |
| `parse_gfa.py` | `test_parse_pipeline.py`, `test_drb1_pipeline.py` | `verify_reference`, `_parse_segments_and_links` edge cases |
| `bubble_gun.py` | `test_drb1_pipeline.py` | Only tested in full pipeline context |
| `PolychainIndex.py` | `test_drb1_pipeline.py` | Only tested in full pipeline context |
| `Bubble.py` | Indirect (via index/link tests) | No dedicated test file; `correct_source_sink`, `is_contained`, `contains` untested directly |
| `Segment.py` | Indirect (via index tests) | No dedicated test file |
| `Annotation.py` | Indirect (via annotation tests) | `serialize()` untested directly |
| `meta.py` | `test_drb1_pipeline.py::TestGraphMeta` | Tested with DRB1 data; no dedicated unit tests |
| SQLite layer (`segment_db`, `link_db`, `bubble_db`, `step_db`, `annotation_db`) | Indirect via index tests | No direct unit tests, but well exercised through indexes |
| `routes.py` | `test_cytoband_routes.py` | Only `/cytoband` and `/chromosomes` tested; 26+ endpoints missing |

### Untested

| Module | What to test | Priority |
|--------|-------------|----------|
| `chain_polyline.py` | `decompose_chain`, `build_chain_polyline`, `find_junction_graph`, `build_connector` — core chain decomposition logic | High |
| `routes.py` (most endpoints) | `/select`, `/pop`, `/path`, `/genes`, `/search`, `/detail-tiles`, `/chains`, `/skeleton`, `/spine`, `/polychain`, `/samples`, `/chain-graph`, `/bubble-meta` | High |
| `app.py` | `create_app`, `load_indexes` — startup/init | Medium |
| `compact_graph.py` | `merge_node`, `compact_graph` — BubbleGun adapter, tightly coupled | Low |
| `construct_bubble_links.py` | `classify_link`, `store_bubble_links` | Low |
| `skeleton_pipeline.py` | `export_json`, grid level iteration | Low |
| `generate_skeleton.py` | `generate_skeleton`, `ensure_skeleton` | Low |
| `export_polychain.py` | `export_polychain_data` | Low |
| `ensure_indexes.py` | `ensure_indexes`, `_cleanup_legacy` | Low |
| `PathIndex.py` | Thin wrapper; low value | Low |
| `path_db.py` | JSON file store/retrieve; low bug risk | Low |
| `organisms.py` | Data module | Low |

### JS Test Gaps (removed stale tests)

| Module | What was tested | Status |
|--------|----------------|--------|
| `reference-spine-engine.js` | Coordinate conversion (bpToLayout, layoutToBp) | Tests removed — API refactored during simplify migration |
| `viewport.js` | Viewport bounds, fitToScreen | Tests removed — functions moved/internalized |
| `gene-data.js` | Gene placement | Tests removed — module restructured |

---

## Prioritized Backlog

### Next Up — High Value

1. **Route integration tests** — `/select`, `/pop`, `/path`, `/genes` with Flask test client and DRB1 or chrY datastore
2. **chain_polyline.py** — `decompose_chain` is the core of the polychain system; complex logic, no tests
3. **query.py gaps** — `get_path`, `get_detail_tile`, `get_bubble_meta`

### Medium Value

4. **Bubble.py** dedicated tests — `correct_source_sink`, `is_contained`, `contains`, `is_ref`
5. **JS spine/viewport** — rewrite tests against current API (`bpToLayout`/`layoutToBp`, `getViewport`/`fitToScreen`)

### Low Value (skip unless touching)

6. `compact_graph.py` — BubbleGun internals, tightly coupled
7. `path_db.py` — simple JSON I/O
8. SQLite layer — well exercised through indexes
9. `ensure_indexes.py`, `generate_skeleton.py`, `export_polychain.py` — orchestration glue

---

## Conventions

- **Fixture data**: Use small synthetic fixtures for unit tests. DRB1-3123 for integration tests. chrY datastore for full-stack query tests.
- **Test naming**: `test_<module>.py` for unit tests, `test_<feature>_routes.py` for endpoint tests.
- **Class grouping**: Group related tests in classes (e.g. `TestParseCytobandColors`). No class needed if there's only a few tests for a module.
- **Scope**: Prefer `scope="module"` for expensive fixtures (DB loading). Use `tmp_path` for throwaway files.
- **Bubble IDs are unstable** between runs — anchor tests to source/sink segments, not bubble IDs.
- **Run both suites**: `python -m pytest tests/` and `npx vitest run`.
