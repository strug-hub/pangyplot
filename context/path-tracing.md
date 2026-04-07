# Path Tracing System

Haplotype path visualization — traces a sample's walk through the pangenome graph.

## Compressed Path Storage (.binpath)

Paths are stored as delta-zigzag-varint encoded binary files. Each step `"ID+/-"` is combined as `(segment_id << 1) | direction_bit` (+/- = 0/1). First value is varint-encoded directly; subsequent values are delta-zigzag-varint encoded. The stream is gzip-compressed.

**Storage layout** (per chromosome):
```
paths/index.json     — metadata for all paths + pangyplot version
paths/*.binpath      — pure gzipped varint bytes (no header)
```

**index.json** maps sample names to arrays of path entries:
```json
{
  "version": "v0.1.0",
  "paths": {
    "HG00621#1": [
      {"file": "HG00621#1__1.binpath", "contig": "...", "start": 0, "length": null, "is_ref": false, "full_id": "..."}
    ]
  }
}
```

**Compression**: ~23x on chr3 (3.2GB → 133MB), ~14.5x on chrY (16MB → 1.1MB).

**Auto-migration**: `ensure_paths()` in `preprocess/ensure_paths.py` runs on startup (like `ensure_skeleton`). Converts legacy JSON → old binpath → current split format. Version in `index.json` triggers re-migration when format changes.

**Codec**: `pangyplot/db/path_codec.py` (Python), `static/js/graph/engines/path-trace/path-codec.js` (JS). Both produce identical byte streams — cross-compatibility verified in tests.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /path-meta?sample=X&chromosome=chrY` | Returns metadata from index.json (no step data) |
| `GET /path-data?sample=X&chromosome=chrY&index=0` | Returns raw .binpath bytes (Content-Encoding: gzip, browser auto-decompresses) |
| `GET /path` | Legacy: server-side filtered + bubble-annotated paths (still functional) |

## Frontend Architecture

All path-trace code lives in `static/js/graph/engines/path-trace/`:

| Module | Role |
|--------|------|
| `path-codec.js` | Delta-zigzag-varint decoder/encoder + gzip helper |
| `path-trace-engine.js` | Fetches samples/paths, wires UI, coordinates resolution |
| `path-trace-state.js` | State singleton: decoded paths cache, render data, animation state |
| `path-trace-boundary-resolver.js` | Maps paths to visual objects via boundary segments |
| `path-trace-animation.js` | Distance-based cursor traversal along waypoints |
| `path-trace-render.js` | Canvas rendering: chain overlays, highlights, cursor, tail |

### Data Flow

```
User selects sample
  → GET /path-meta (metadata)
  → populate subpath table
User clicks subpath
  → GET /path-data (compressed binary)
  → decodeSteps() → [{segId, direction}, ...]
  → cache in decodedPaths Map
  → resolveAndBuildRenderData(steps)
    → buildBoundaryIndex() from registered chain entry/exit segments
    → walk steps, match against boundaries
    → emit chain overlays + waypoints
  → render
```

### Boundary-Based Resolution

Instead of server-side bubble annotation, the resolver uses **registered boundary segments** to identify chain traversals:

- Every `PolychainContainer` has `headSegs` (entry) and `tailSegs` (exit) registered in the segment registry
- When a path step hits a chain entry → start tracking; when it hits the exit → emit chain overlay for the full t-range
- Junction `SegmentObject`s are also registered and resolve directly
- Steps between boundaries are interior to a chain — implicitly covered by the chain overlay
- When bubbles are popped, split segments register additional boundaries, giving finer resolution

### Waypoint Animation

The animation cursor moves at constant layout-space speed along a **waypoint list**:

- Waypoints are built during resolution: spine polyline points + bubble positions + junction positions
- Each waypoint has `{dist, pos, action, chainId, t, ...}` where `dist` is cumulative euclidean distance
- Cursor interpolates between waypoints via binary search + lerp
- Progressive rendering: chain overlays grow from entry to cursor's current t-position
- Active highlights (bubbles, junctions) accumulate as cursor passes them
- Fading tail trail behind cursor using opacity buckets

## Key Files (Backend)

- `pangyplot/db/path_codec.py` — encode/decode, index.json I/O, legacy migration helpers
- `pangyplot/db/sqlite/path_db.py` — store/retrieve paths, `finalize_paths()` writes index.json
- `pangyplot/db/indexes/PathIndex.py` — runtime path access (wraps path_db)
- `pangyplot/preprocess/ensure_paths.py` — auto-migration on startup
- `pangyplot/preprocess/parser/gfa/parse_paths.py` — GFA path parsing (calls store_path + finalize_paths)
- `pangyplot/objects/Path.py` — Path domain object with `subset_path()`, `construct_bubble_path()`

## Known Issues / Future Work

- **Animation jankiness**: waypoint spacing and speed tuning needed
- **Popped bubble recursion**: waypoint builder doesn't yet recurse into popped bubble internals
- **Path length**: full paths have `length: null` (can't compute at parse time, only during subset_path)
- **subset_path ID range assumption**: still uses `start_id <= id <= end_id` (only affects legacy `/path` endpoint)
