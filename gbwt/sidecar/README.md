# gbwt-sidecar

A persistent path-service for PangyPlot's GBWT path engine. It loads one
per-chromosome index and answers path queries over localhost HTTP; Flask proxies
these and does region filtering + varint encoding in Python.

```sh
pangyplot-gbwt-sidecar <graph.gbwt|graph.gbz> [addr]   # addr default 127.0.0.1:5701
```

The index is served **memory-mapped** from disk, so resident memory scales with
the working set of active queries rather than the whole file — a 5.4 GB
whole-genome GBZ serves at a few hundred MB resident. See `IMPLEMENTATION.md` for
how the sidecar is built.

Two index formats are accepted behind one wire contract (auto-detected by file
tag):

- **`graph.gbwt`** — a compact GBWT where node id == segment id (no translation).
- **`graph.gbz`** — a GBZ, which may be *chopped* (long segments split across
  several node ids) and therefore carries a node→segment translation. The sidecar
  parses that translation and collapses chopped node runs back to segment ids, so
  its walks are identical to those from a `graph.gbwt` for the same graph.

Either way, `/walk` always returns **PangyPlot segment ids** — the wire contract
is format-independent.

## Turning it on in PangyPlot (opt-in)

The GBWT path engine is off by default (the binpath `PathIndex` is used). Enable
it per environment; `GbwtManager` (`pangyplot/db/gbwt_manager.py`) reads:

| env var | meaning |
|---|---|
| `PANGYPLOT_GBWT` | `1`/`true` to enable the GBWT path engine |
| `PANGYPLOT_GBWT_BIN` | sidecar binary path (default `gbwt/sidecar/pangyplot-gbwt-sidecar`) |
| `PANGYPLOT_GBWT_GBZ` | per-chr GBZ filename inside each chr dir (default `graph.gbz`) |
| `PANGYPLOT_GBWT_URLS` | JSON `{chrom: base_url}` for externally-managed sidecars (no spawn) |

Dev spawns one sidecar per chromosome on a free localhost port and tears them
down at exit. Production sets `PANGYPLOT_GBWT_URLS` and runs the sidecars itself.
A missing index / binary is a warning, not a crash — that chromosome keeps the
binpath engine.

## Wire protocol — the language-agnostic contract

**This protocol, not the implementation, is the boundary.** The Python client
depends only on what is below, so any implementation that honours the contract is
a drop-in. Everything here is neutral: plain HTTP, JSON for metadata, explicit
little-endian binary for bulk. No language-specific serialization.

| endpoint | params | response |
|---|---|---|
| `GET /health` | — | `text/plain` `ok` |
| `GET /meta` | — | `application/json` (below) |
| `GET /walk` | `path=<usize>` | `application/octet-stream`: array of **little-endian i64**, one per step, value = `(segment_id << 1) \| orientation_bit` (`+`=0, `-`=1). PangyPlot's `combined` form. |
| `GET /count` | `node=<usize>` | `text/plain` decimal: haplotype occurrence count at the node |

`/walk` values are always PangyPlot segment ids. For a `graph.gbwt` the node
handle already is the segment id; for a chopped GBZ the sidecar applies the
node→segment translation and collapses each chopped run into one segment step.
Verified byte-identical to the binpath format by `tests/db/test_gbz_parity.py`
and `tests/db/test_gbz_ingest.py`.

`/meta` JSON:
```json
{
  "nodes": <int>, "paths": <int>, "has_metadata": <bool>,
  "has_translation": <bool>,
  "samples": ["<name>", ...],
  "path_list": [
    {"id": <int>, "sample": "<name>", "contig": "<name>",
     "phase": <int>, "fragment": <int>}
  ]
}
```

## Design notes

- **Threaded, lock-free.** The index is read-only after load and shared across N
  worker threads with no locking.
- **Binary bulk payloads.** `/walk` is packed LE-i64, not JSON.
- **Transport is swappable.** If HTTP framing ever shows up in profiling, a Unix
  socket / shared memory can replace it behind the Python client without touching
  the contract or the callers.
