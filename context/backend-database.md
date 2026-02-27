# Backend Database Style Guide

Rules and conventions for PangyPlot's SQLite databases, in-memory indexes, and query patterns. An agent or reviewer can check code against these rules to identify violations.

---

## File and Naming Conventions

### Database files

- Every entity gets exactly one `.db` file. Never put multiple tables in the same database file.
- Name database files `<entity>.db` in lowercase: `segments.db`, `links.db`, `bubbles.db`, `step_index.db`.
- Name quick index cache files `<entity>.quickindex.json.gz`. The `.gz` extension is added automatically by `db_utils.dump_json()` — the `QUICK_INDEX` constant should end in `.json` (not `.json.gz`).
- Path data uses flat JSON files in a `paths/` subdirectory, named `<sample>__<n>.json`. The sample index is always `sample_idx.json`.

### Module files

- One SQLite module per entity at `db/sqlite/<entity>_db.py`. Never combine entities into a single module.
- One Index class per entity at `db/indexes/<Entity>Index.py`. Use PascalCase for the file and class name.
- One domain object per entity at `objects/<Entity>.py`.
- Utility functions shared across modules live in `db/db_utils.py`. Do not create additional utility files.

### Module-level constants

- Every `_db.py` module must define `DB_NAME` as a module-level string constant. Never inline the database filename.

```python
# Correct
DB_NAME = "segments.db"

# Wrong — filename inlined in function
def get_connection(dir):
    return utils.get_connection(dir, "segments.db")
```

---

## SQLite Schema Rules

### Column types

- Use `INTEGER PRIMARY KEY` for entity IDs. Use the GFA's native IDs — never autoincrement.
- Use `TEXT` for composite keys, strands (`+`/`-`), subtypes, and JSON-encoded payloads.
- Use `REAL` or `FLOAT` for layout coordinates and frequencies. Be consistent within a table (don't mix `REAL` and `FLOAT`).
- Use `BOOLEAN` only as an alias for `INTEGER DEFAULT 0`. SQLite stores booleans as 0/1.

### NOT NULL

- Mark columns `NOT NULL` when the value is always present (all segment fields, link endpoints, step coordinates).
- Nullable columns are acceptable only for genuine optional data: `parent` (NULL for root bubbles), `exon_number` (NULL for non-exon annotations), `strand`.
- Never use empty strings as stand-ins for NULL.

### JSON-in-TEXT columns

- Store JSON arrays in `TEXT` columns **only** when the data is never filtered or joined against in SQL (examples: `children`, `siblings`, `source`, `sink`, `inside`, `range_exclusive`, `range_inclusive`).
- If you ever need `WHERE column CONTAINS x`, normalize into a junction table instead.
- Always use `json.dumps()` when writing and `json.loads()` when reading. Never store Python repr strings.
- Sort list contents before storing when order is semantically irrelevant (`json.dumps(sorted(bubble.inside))`).

### Indexes

- Index every column that appears in a `WHERE` clause. No un-indexed filtered columns.
- Use composite indexes when queries filter on multiple columns together: `(genome, step)`, `(gene_name, type)`, `(chain, chain_step)`.
- Index both sides of link traversal: `from_id` and `to_id` each get their own index.
- Do not over-index. `segments` needs only the primary key — it is bulk-scanned at preprocess time and point-queried by ID at runtime.
- Name indexes `idx_<column(s)>`: `idx_from_id`, `idx_bubble_chain`, `idx_chrom_start_end`.

### Schema creation

- `create_*_table()` functions must always pass `clear_existing=True` to `get_connection()`. Preprocessing always rebuilds from scratch.
- Always `CREATE TABLE` then `CREATE INDEX` then `conn.commit()` then `return conn`. This order must be followed.
- Use `CREATE TABLE IF NOT EXISTS` in schema creation functions for safety.

---

## Connection Management

### Opening connections

- **Always** go through `db_utils.get_connection()`. Never call `sqlite3.connect()` directly.
- **Always** use `sqlite3.Row` row factory (set by `get_connection()`). Never access rows by tuple index — always use dict-style `row["column_name"]`.

### Connection lifetime

- Connections are short-lived and not pooled. Each `_db.py` function opens its own connection.
- Never store a connection in instance state or pass it across module boundaries (with the single exception of the optional `cur` parameter pattern described below).
- Never explicitly close connections in query functions — let them fall out of scope. Only use `conn.close()` in preprocessing functions that do large writes.

### Cursors

- For single-row lookups: `cur.fetchone()`.
- For bounded result sets (known small): `cur.fetchall()`.
- For unbounded scans: iterate the cursor directly (`for row in cur.execute(...)`).
- Never call `cur.fetchall()` on a table scan of unbounded size — use a generator with `yield` instead.

### Parameterized queries

- **Always** use `?` placeholders for values. Never interpolate or f-string values into SQL.
- This is non-negotiable. A query like `f"WHERE id = {id}"` is always wrong.

```python
# Correct
cur.execute("SELECT * FROM segments WHERE id = ?", (seg_id,))

# Wrong — SQL injection risk
cur.execute(f"SELECT * FROM segments WHERE id = {seg_id}")
```

---

## SQLite Module Structure (`db/sqlite/*_db.py`)

Every entity module must follow this function structure. Functions may be omitted if unused, but when present they must follow these signatures:

### Required elements

| Function | Signature | Purpose |
|----------|-----------|---------|
| `DB_NAME` | `str` constant | Database filename |
| `get_connection(dir)` | `→ Connection` | Wraps `utils.get_connection(dir, DB_NAME)` |
| `create_*_table(dir)` | `→ Connection` | Schema creation; preprocessing only |
| `insert_*(cur, entity)` | `→ None` | Single-row insert; takes **cursor**, not connection |
| `create_*(row, ...)` | `→ Entity` | Row-to-object factory; all field mapping here |
| `get_*(dir, id, ...)` | `→ Entity or None` | Point lookup by primary key |

### Insert functions

- `insert_*()` must take a **cursor** as its first argument (after `cur`), not a connection. The caller manages the transaction.
- Never commit inside `insert_*()`. Commits happen in the bulk wrapper or the caller.

```python
# Correct — caller commits
def insert_segment(cur, segment):
    cur.execute("INSERT INTO ...", (...))

def insert_segments(dir, segments):
    conn = get_connection(dir)
    cur = conn.cursor()
    for seg in segments:
        insert_segment(cur, seg)
    conn.commit()

# Wrong — commit inside single-row insert
def insert_segment(cur, segment):
    cur.execute("INSERT INTO ...", (...))
    cur.connection.commit()  # NO
```

### Factory functions (`create_*`)

- All field mapping from `sqlite3.Row` to domain object must happen in the `create_*()` factory function. Never map fields inline at the call site.
- JSON columns must be deserialized here: `json.loads(row["children"])`.
- Optional enrichment parameters (like `step_index`, `gfaidx`) are accepted as keyword-style positional args with default `None`.

### Shared cursor pattern

- When a function makes multiple SQL calls in a loop, accept an optional `cur=None` parameter. If `None`, open a new connection; otherwise reuse the provided cursor.
- This is currently implemented in `link_db.get_link()` — all modules should follow this pattern for functions called in loops.

```python
def get_entity(dir, entity_id, cur=None):
    if cur is None:
        cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM entity WHERE id = ?", (entity_id,))
    row = cur.fetchone()
    return create_entity(row) if row else None
```

### Generator vs list return

- Functions that scan entire tables must be generators (`yield`). Name them `get_all()`, `iter_*()`, or `load_*()`.
- Functions that return a bounded result set use `fetchall()` and return a list.

---

## In-Memory Index Rules

### Array type selection

| Data | Type | Rationale |
|------|------|-----------|
| Segment IDs, step positions, bp coordinates | `array('I')` | Unsigned 32-bit int; covers IDs up to ~4 billion |
| Layout coordinates (x, y) | `array('f')` | 32-bit float; sufficient precision for visualization |
| Validity flags, per-segment link counts | `array('B')` | Unsigned byte; max 255; saves 3 bytes per entry vs `'I'` |
| Strand orientation (+/-) | `bitarray` | 1 bit per strand; `+` → 1, `-` → 0 |

- **Always** use the narrowest type that fits. Never use `array('I')` for boolean data.
- **Never** use Python `list` for large numeric data that could be a typed array. Lists waste ~56 bytes per element; `array('I')` uses 4.
- **Never** use `array('i')` (signed) when values are always non-negative. Use `array('I')` (unsigned).

### Direct-address arrays

- When entity IDs are dense non-negative integers (segments, bubbles), use **direct-address arrays** where `array[entity_id]` gives the value directly.
- Allocate with `array('X', [default] * (max_id + 1))`.
- Always maintain a parallel `valid` array (`array('B')`) to distinguish occupied from unoccupied slots, unless the entity guarantees contiguous IDs.

```python
# Correct — direct address with validity tracking
self.length = array('I', [0] * (max_id + 1))
self.valid  = array('B', [0] * (max_id + 1))
# ...
self.valid[sid] = 1
self.length[sid] = row["length"]
```

### Sorted parallel arrays

- For range queries on ordered data (bp positions, step ranges), use **sorted parallel arrays** queried with `bisect`.
- All parallel arrays must have the same length and maintain index correspondence. Never append to one without appending to all.
- Always use `bisect.bisect_right(array, value) - 1` for point-in-range queries (finding which interval contains a value).
- Always use `bisect.bisect_left(array, value)` for range-start queries (finding the first interval at or after a value).

### Flat reverse index (CSR pattern)

- For graph adjacency lookups, use the **compressed sparse row** pattern: `offsets` + `counts` + `flat` arrays.
- `offsets[entity_id]` = start position in `flat`. `counts[entity_id]` = number of entries. Entries are at `flat[offset..offset+count]`.
- `counts` should use `array('B')` (max 255) unless an entity can genuinely have more than 255 neighbors.

---

## Quick Index Cache Rules

### Lifecycle

Every index class must implement this exact lifecycle:

1. Constructor calls `self.load_quick_index()`.
2. If it returns `True`, arrays are populated — done.
3. If it returns `False`, build arrays from SQLite, then call `self.save_quick_index()`.

```python
def __init__(self, dir):
    if not self.load_quick_index():
        # ... build arrays from SQLite ...
        self.save_quick_index()
```

- Never skip `save_quick_index()` after building from SQLite. Every build must persist its cache.
- Never call `save_quick_index()` if `load_quick_index()` succeeded — avoid redundant writes.

### Required methods

Every index class must implement these three methods:

| Method | Returns | Purpose |
|--------|---------|---------|
| `serialize()` | `dict` | Converts all arrays to JSON-serializable form via `.tolist()` |
| `save_quick_index()` | `None` | Calls `utils.dump_json(self.serialize(), path)` |
| `load_quick_index()` | `bool` | Loads from `.json.gz`; returns `False` if file missing |

### Serialization

- `serialize()` must call `.tolist()` on every `array` and bitarray. Never use `list()` or manual conversion.
- `load_quick_index()` must reconstruct arrays with the correct type code: `array('I', data["field"])`. Never load into a plain list.
- The `QUICK_INDEX` filename constant must end in `.json` — `dump_json()` appends `.gz` automatically.

---

## Object Cache Rules

### FIFO bounded cache

- Use a bounded `dict` with FIFO eviction for domain objects loaded on-demand from SQLite (currently: Bubble objects in BubbleIndex).
- Cache size must be configurable via a constructor parameter with a sensible default (currently 1000).
- Eviction: `self.cached_bubbles.pop(next(iter(self.cached_bubbles)))` removes the oldest entry.
- Always check the cache before hitting SQLite. Never bypass the cache for a "fresh" read.

```python
def __getitem__(self, entity_id):
    if entity_id in self.cached:
        return self.cached[entity_id]
    obj = db.get_entity(self.dir, entity_id)
    self._cache(entity_id, obj)
    return obj
```

---

## Domain Object Rules (`objects/*.py`)

### ID representation

- **Internal Python code** uses raw integers for all IDs (segment, bubble, chain). Never store prefixed strings internally.
- **Serialized output** (API responses) uses prefixed string IDs to distinguish types:

| Object | Prefix | Format | Example |
|--------|--------|--------|---------|
| Segment | `s` | `s{id}` | `s42` |
| Bubble | `b` | `b{id}` | `b107` |
| Chain | `c` | `c{id}` | `c3` |
| Link | composite | `s{from}{strand}s{to}{strand}` | `s42+s43+` |

- Prefix conversion happens **only** in `serialize()`. Never prefix IDs in constructors, factories, or internal logic.
- When receiving prefixed IDs from the frontend (e.g. in `/pop`), strip the prefix immediately at the route handler boundary: `int(id.replace("b", ""))`.

### `serialize()` method

- Every domain object must have a `serialize()` method that returns a JSON-ready `dict`.
- Every serialized dict must include a `"type"` field (`"segment"`, `"bubble"`, `"link"`, etc.) so the frontend can distinguish types in mixed arrays.
- Never include fields the frontend doesn't use. Serialize only what's consumed.
- Return plain dicts. Never return domain objects from query functions — always call `.serialize()` at the query boundary.

### Field assignment

- Domain objects use plain attribute assignment, not `__init__` parameters. Factory functions (`create_*` in `_db.py`) set fields individually.
- Do not add `__init__` parameters or dataclass decorators — the factory pattern is intentional.

```python
# Correct — factory sets fields
def create_segment(row):
    segment = Segment()
    segment.id = row["id"]
    segment.length = row["length"]
    return segment

# Wrong — constructor args
def create_segment(row):
    return Segment(id=row["id"], length=row["length"])
```

---

## Query Layer Rules (`db/query.py`)

### Function signature

- Query functions take `indexes` as the first parameter (the namespace containing all loaded indexes). Never accept individual indexes as separate parameters.
- Remaining parameters are the raw values from the route: `genome`, `chrom`, `start`, `end`, `sample`, `id`.
- Never accept Flask `request` objects or any web-framework types. The query layer is framework-agnostic.

### Coordinate translation

- **Always** translate bp coordinates to step indices via `StepIndex.query_coordinates()` before querying BubbleIndex or GFAIndex.
- **Never** pass raw bp coordinates to BubbleIndex — it operates on step indices.
- **Never** query SQLite directly for coordinate translation. Always go through StepIndex.

### Return format

- Return plain Python dicts, not Flask `Response` objects. The route handler wraps results in `jsonify()`.
- Serialize objects at the query boundary: `[b.serialize() for b in bubbles]`. Never return unserialized domain objects.
- Use the standard structure: `{"nodes": [...], "links": [...]}` for graph responses.

---

## Hot Path vs Cold Path

This is the fundamental performance invariant of the codebase. Violations cause regressions.

### Hot path (must NEVER touch SQLite)

- Range queries: "which bubbles overlap steps X..Y" → `BubbleIndex` sorted arrays + `bisect`
- Coordinate translation: "bp position → step index" → `StepIndex` sorted arrays + `bisect`
- Neighbor lookup: "which links touch segment X" → `LinkIndex` flat reverse index
- Segment metadata: length, coordinates, validity → `SegmentIndex` direct-address arrays

### Cold path (SQLite on-demand, acceptable)

- Full segment details (sequence, gc/n counts) → `segment_db.get_segment()`
- Individual bubble materialization → `bubble_db.get_bubble()` (cached by FIFO)
- Link metadata (haplotype, frequency) → `link_db.get_link()`
- Annotation lookups → `annotation_db.get_by_gene_name()`
- Path loading → `path_db.retrieve_paths()` (JSON file read)

### Rules

- **Never** add a SQLite query to a hot-path code path. If you need data in the hot path, add it to the appropriate in-memory index.
- **Never** call `_db.get_*()` inside a loop that runs per-bubble or per-segment during a `/select` request. Batch or pre-cache instead.
- If a new feature requires data that isn't in an index, add it to the index's `serialize()`/`load_quick_index()` cycle — don't add a SQLite fallback in the hot path.

---

## Things to Avoid

- **`sqlite3.connect()` called directly** — always use `db_utils.get_connection()`.
- **Tuple indexing on rows** (`row[0]`, `row[2]`) — always use `row["column_name"]`.
- **String interpolation in SQL** — always use `?` placeholders.
- **`commit()` inside `insert_*()` single-row functions** — caller manages transactions.
- **Python `list` for large numeric arrays** — use `array` module or `bitarray`.
- **Storing prefixed IDs internally** (`"s42"` as a Python int) — prefixes are only for serialization.
- **Returning unserialized domain objects from `query.py`** — always `.serialize()` at the boundary.
- **Fetching all rows when scanning unbounded data** — use generators.
- **SQLite queries in hot-path loops** — use in-memory indexes.
- **Commented-out code left in index classes** — remove dead code, don't comment it out.
- **`json.loads()` / `json.dumps()` outside of `_db.py` factory functions** — JSON column handling belongs in the SQLite layer.
