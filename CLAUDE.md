# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is PangyPlot

PangyPlot is a genome graph visualization tool — a Flask web app that serves an interactive browser for pangenome graphs in GFA format. It preprocesses GFA files into on-disk SQLite databases and in-memory array-based indexes, then serves a d3-force-graph frontend that visualizes pangenome bubbles interactively.

## Commands

### Run the app (development mode)
```bash
python pangyplot.py run --db hprc.clip --ref GRCh38 --annotations gencode48.chrY
```
Launches Flask at http://127.0.0.1:5700. The `datastore/` directory inside the repo contains bundled test data.

### Run all tests
```bash
python -m pytest tests/
```

### Run a single test
```bash
python -m pytest tests/quick_index_test.py::test_quick_index_roundtrip
```

### Add a new dataset (preprocessing)
```bash
python pangyplot.py add --db <name> --ref <ref_genome> --chr <chrom> --gfa <path.gfa> --layout <odgi_layout.tsv>
```
This parses a GFA + odgi layout TSV, builds SQLite indexes (segments, links, paths, steps, bubbles), and saves array-based quick indexes as gzipped JSON.

### Add annotations
```bash
python pangyplot.py annotate --ref <ref_genome> --gff3 <path.gff3> --name <annotation_name>
```

### Manage translations
```bash
# From pangyplot/translations/:
pybabel extract -F babel.cfg -o messages.pot ../..
pybabel update -i messages.pot -d .
pybabel compile -d .
```
See `pangyplot/translations/compile_translations.sh` for the full workflow. Supported locales: en, fr, es, de, it, pt_BR, ru, zh_CN, ja, ko, ar.

### Production deployment
Use `wsgi.py` with a WSGI server (gunicorn, etc.). Configure via environment variables: `PANGYPLOT_DATA`, `PANGYPLOT_DB`, `PANGYPLOT_ANNOTATION`, `PANGYPLOT_REF`, `PANGYPLOT_PORT`.

## Architecture

### Data flow: preprocessing → serving

**Preprocessing** (`python pangyplot.py add ...`):
1. `pangyplot/preprocess/parser/parse_gfa.py` — reads GFA file, populates SQLite databases for segments, links, and paths per chromosome
2. `pangyplot/preprocess/parser/parse_layout.py` — reads odgi layout TSV for x/y coordinates
3. `pangyplot/preprocess/bubble/bubble_gun.py` — wraps the external BubbleGun library to detect nested bubble structures and stores them in `bubbles.db`
4. Each chromosome's data lives in `datastore/graphs/<db_name>/<chrom>/` as several `.db` SQLite files plus `.quickindex.json.gz` fast-load caches

**Serving** (`python pangyplot.py run ...`):
1. `pangyplot/app.py:create_app()` loads all chromosome indexes into memory on startup
2. Per-chromosome indexes stored on `app.*` attributes: `app.gfa_index[chr]`, `app.step_index[(chr,ref)]`, `app.bubble_index[chr]`, `app.annotation_index[ref]`
3. `pangyplot/routes.py` — all Flask API endpoints; delegates to `pangyplot/db/query.py`

### Index classes (in-memory data structures)

All indexes are in `pangyplot/db/indexes/`:

- **`GFAIndex`** — composes `SegmentIndex`, `LinkIndex`, `PathIndex`; provides BFS/subgraph traversal
- **`StepIndex`** — sorted arrays (`starts`, `ends`, `segments`) of reference path steps for coordinate→segment lookup; cached as `steps.quickindex.json.gz`
- **`BubbleIndex`** — sorted arrays of top-level bubble ranges for range queries; FIFO cache for individual `Bubble` objects loaded from SQLite; cached as `bubbles.quickindex.json.gz`
- **`AnnotationIndex`** — gene/annotation lookup built from GFF3

Quick indexes use Python `array` module (typed arrays) for memory efficiency. They are saved as gzipped JSON and loaded on startup to avoid rebuilding from SQLite every time.

### Domain objects

`pangyplot/objects/`:
- **`Bubble`** — a pangenome variation bubble with source/sink segments, inside segments, children (nested bubbles), siblings, chain membership
- **`Chain`** — an ordered sequence of bubbles along a linear variation path
- **`Segment`**, **`Link`**, **`Path`** — GFA primitives

### Frontend

Two viewers in `pangyplot/static/js/`: a core force-directed graph viewer (`graph/`) using d3-force-graph, and a simplify viewer (`simplify/`) using raw canvas for multi-resolution skeleton exploration. Templates are Jinja2 in `pangyplot/templates/`. Bubbles can be "popped" (expanded) interactively via the `/pop` API endpoint.

### Key API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Renders core viewer |
| `GET /simplify` | Renders simplify (multi-resolution skeleton) viewer |
| `GET /select?genome=&chromosome=&start=&end=` | Returns bubble graph (nodes+links) for a genomic region |
| `GET /pop?id=&genome=&chromosome=` | Expands a bubble node into its internal subgraph |
| `GET /path?genome=&chromosome=&start=&end=&sample=` | Returns a sample's haplotype path through a region |
| `GET /pathorder?genome=&chromosome=` | Returns sample ordering for frontend color mapping |
| `GET /genes?genome=&chromosome=&start=&end=` | Returns gene annotations for a region |
| `GET /search?type=&query=` | Searches genes by name |
| `GET /chromosomes` | Lists available chromosomes |
| `GET /cytoband?chromosome=` | Returns cytoband data for ideogram |
| `GET /samples` | Lists available samples/haplotypes |
| `GET /skeleton?chromosome=` | Returns precomputed simplification data |
| `GET /chains?genome=&chromosome=&start=&end=` | Returns chain decomposition for a region |
| `GET /detail-tiles?genome=&chromosome=&start=&end=&ppbp=` | Returns high-resolution tiles for detail view |
| `GET /chain-graph?id=&genome=&chromosome=` | Returns subgraph for a specific chain |

### Organism/cytoband configuration

Supported organisms and their genome assemblies are defined in `pangyplot/organisms.py`. Cytoband data for the ideogram lives in `pangyplot/static/cytoband/`. Custom organisms can be specified via `.env` with `ORGANISM=custom`, `CYTOBAND_PATH=...`, `CANONICAL_PATH=...`.

### Environment variables (`.env`)

- `ORGANISM` — one of the keys in `organisms.VALID_ORGANISMS` or `"custom"`
- `CYTOBAND_PATH` / `CANONICAL_PATH` — required when `ORGANISM=custom`
- `GA_TAG_ID` — optional Google Analytics tag
- `PANGYPLOT_DATA/DB/ANNOTATION/REF/PORT` — production deployment config
