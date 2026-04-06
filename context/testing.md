# Testing Plan

Test organization and coverage plan for PangyPlot's Python backend.

---

## Directory Structure

Tests are organized by responsibility, mirroring the source tree:

```
tests/
  preprocess/          # Parsers, skeleton geometry, preprocessing
  db/                  # Indexes, queries, SQLite, utilities
  objects/             # Domain objects (Bubble, Chain, Path, etc.)
  routes/              # Flask API endpoint tests
  fixtures/            # Shared test data
    cytoband/          # Cytoband fixture files
    db/                # SQLite fixture databases
    *.gfa, *.tsv       # GFA and layout fixtures
  graph/               # JavaScript unit tests
```

Each subdirectory has its own `conftest.py` for fixtures and an `__init__.py`.

---

## Current Coverage

### Tested
- GFA parser (segments, links, paths, utils) — `test_parse_gfa_lines.py`, `test_parse_pipeline.py`, `test_drb1_pipeline.py`
- Layout parser (ODGI, Bandage) — `test_parse_layout.py`
- Cytoband parser + routes — `tests/preprocess/test_parse_cytoband.py`, `tests/routes/test_cytoband_routes.py`
- Bubble construction and linking — `test_bubble_links.py`
- Query APIs (chains, bubbles, detail tiles, pops) — `test_query.py`, `test_pop_links.py`
- Index loading (segment, link, step, bubble) — `quick_index_test.py`
- Sequence read/write — `seq_read_write_test.py`

### Not Tested — Prioritized Backlog

#### Priority 1 — Pure functions, high bug risk, easy to test

| Module | Location | What to test |
|--------|----------|-------------|
| `skeleton_geometry.py` | `tests/preprocess/` | `rdp_simplify()`, `grid_simplify()`, `_perpendicular_distance()` — pure math, zero setup needed |
| `db_utils.py` | `tests/db/` | `NumpyJSONEncoder` with numpy scalar/array types, `dump_json`/`load_json` gzipped round-trip |
| `integrity_check.py` | `tests/db/` | `deduplicate_links()`, `deduplicate_nodes()`, `remove_invalid_links()` — data safety net |

#### Priority 2 — Complex logic, moderate setup

| Module | Location | What to test |
|--------|----------|-------------|
| `Path.py` | `tests/objects/` | `subset_path()` slicing, `construct_bubble_path()`, `clone()` independence |
| `Chain.py` | `tests/objects/` | `_sort_bubbles()` ordering, `_assign_siblings()` bidirectional links, `chain_step_range()` |
| `parse_gff3.py` | `tests/preprocess/` | Line parsing, gene/transcript/exon extraction, malformed input handling |
| `compact_graph.py` | `tests/preprocess/` | Node merging correctness, linear chain compaction |

#### Priority 3 — Integration/DB tests, heavier setup

| Module | Location | What to test |
|--------|----------|-------------|
| `AnnotationIndex.py` | `tests/db/` | `query_gene_range()`, `gene_search()` |
| `annotation_db.py` | `tests/db/` | Insert/query round-trip, range queries |
| `path_db.py` | `tests/db/` | Store/retrieve paths, sample index round-trip |
| `PolychainIndex.py` | `tests/db/` | Polychain queries |
| `spine_builder.py` | `tests/preprocess/` | Spine generation at stride intervals |
| `meta.py` | `tests/preprocess/` | Bbox computation, link distance stats |
| `Annotation.py` | `tests/objects/` | `serialize()`, `sort_transcripts()` by MANE status |

#### Priority 4 — Route coverage expansion

| Endpoint group | Location | What to test |
|----------------|----------|-------------|
| `/select`, `/pop` | `tests/routes/` | Bubble graph retrieval, pop expansion |
| `/path`, `/pathorder` | `tests/routes/` | Haplotype path retrieval |
| `/genes`, `/search` | `tests/routes/` | Gene annotation queries |
| `/detail-tiles`, `/chains` | `tests/routes/` | High-resolution detail view |

---

## Conventions

- **Fixture data**: Use small synthetic fixtures for unit tests. Reference real datastore files for integration tests (e.g. `datastore/graphs/hprc.clip/chrY/`).
- **Test naming**: `test_<module>.py` for unit tests, `test_<feature>_routes.py` for endpoint tests.
- **Class grouping**: Group related tests in classes (e.g. `TestParseCytobandColors`). No class needed if there's only a few tests for a module.
- **Scope**: Prefer `scope="module"` for expensive fixtures (DB loading). Use `tmp_path` for throwaway files.

---

## Existing Test Migration

The flat test files in `tests/` predate the directory structure. They should be migrated into subdirectories as they are touched:

| Current file | Target location |
|-------------|----------------|
| `test_parse_pipeline.py` | `tests/preprocess/` |
| `test_parse_gfa_lines.py` | `tests/preprocess/` |
| `test_parse_layout.py` | `tests/preprocess/` |
| `test_parse_utils.py` | `tests/preprocess/` |
| `test_drb1_pipeline.py` | `tests/preprocess/` |
| `test_query.py` | `tests/db/` |
| `test_bubble_links.py` | `tests/db/` |
| `test_pop_links.py` | `tests/db/` |
| `quick_index_test.py` | `tests/db/` |
| `seq_read_write_test.py` | `tests/db/` |
