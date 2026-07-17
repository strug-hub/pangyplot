# gbwt-graphd

A persistent path-service for PangyPlot's GBWT path engine. It loads one or more
indexes and answers path queries over localhost HTTP; Flask proxies these and
does region filtering + varint encoding in Python.

```sh
# one graph — the selector is optional, so this is the original protocol
pangyplot-graphd <graph.gbwt|graph.gbz> [addr]     # addr default 127.0.0.1:5701

# several graphs from one daemon — requests pick one with ?graph=NAME
pangyplot-graphd chr1=/data/chr1/graph.gbz chr2=/data/chr2/graph.gbz [addr]

pangyplot-graphd ... --workers=N     # accept threads (default: cores, 2..8)
```

One daemon can serve the whole genome, which is what PangyPlot does by default.
Serving each chromosome from its own daemon is still supported — that is how you
shard across machines (see `PANGYPLOT_GBWT_URLS` below) — but it is no longer
what every installation pays for: 25 chromosomes meant 25 processes, 25 ports and
227 threads.

The index is served **memory-mapped** from disk, so resident memory scales with
the working set of active queries rather than the whole file — a 5.4 GB
whole-genome GBZ serves at a few hundred MB resident. See `IMPLEMENTATION.md` for
how the graphd is built.

Two index formats are accepted behind one wire contract (auto-detected by file
tag):

- **`graph.gbwt`** — a compact GBWT where node id == segment id (no translation).
- **`graph.gbz`** — a GBZ, which may be *chopped* (long segments split across
  several node ids) and therefore carries a node→segment translation. The graphd
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
| `PANGYPLOT_GBWT_BIN` | graphd binary path (default `gbwt/graphd/pangyplot-graphd`) |
| `PANGYPLOT_GBWT_GBZ` | per-chr GBZ filename inside each chr dir (default `graph.gbz`) |
| `PANGYPLOT_GBWT_WORKERS` | accept threads (default: the graphd's own — cores, 2..8) |
| `PANGYPLOT_GBWT_URLS` | JSON `{chrom: base_url}` for externally-managed graph daemons (no spawn) |

By default PangyPlot spawns **one** graphd on a free localhost port, serving every
chromosome that has an index (discovered under the datastore's `graphs/<db>/`),
and tears it down at exit. Each chromosome's client is bound to `?graph=<chrom>`.

`PANGYPLOT_GBWT_URLS` overrides that per chromosome, and is how you shard: run a
single-graph daemon for each chromosome — anywhere, in any wire-compatible
implementation — and map them here. Those daemons hold one graph, so they need no
selector. Mixing is fine: chromosomes named here use their own daemon, the rest
use the local one.

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
| `GET /meta` | `graph=<name>`* | `application/json` (below) |
| `GET /walk` | `graph=<name>`*, `path=<usize>` | `application/octet-stream`: array of **little-endian i64**, one per step, value = `(segment_id << 1) \| orientation_bit` (`+`=0, `-`=1). PangyPlot's `combined` form. |
| `GET /count` | `graph=<name>`*, `node=<usize>` | `text/plain` decimal: haplotype occurrence count at the node |

\* `graph=` selects which of the daemon's graphs to query. **Optional when the
daemon holds exactly one** — it is then implied, so a single-graph daemon speaks
this contract exactly as it did before multi-graph support, and a sharded
deployment never sends a selector. Omitting it against a multi-graph daemon is a
`400`; naming a graph it does not serve is a `404`. Both list what is available.
`/health` never takes one: it reports on the daemon, and is polled before the
caller knows what it serves.

`/walk` values are always PangyPlot segment ids. For a `graph.gbwt` the node
handle already is the segment id; for a chopped GBZ the graphd applies the
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
  ],
  "graphs": ["<name>", ...]
}
```

Every field except `graphs` describes the *selected* graph. `graphs` lists what
the daemon serves, so a client can discover that without being told; it is `[""]`
for a daemon started with a bare index path (one unnamed graph).

## Design notes

- **Threaded, lock-free.** The index is read-only after load and shared across N
  worker threads with no locking.
- **Binary bulk payloads.** `/walk` is packed LE-i64, not JSON.
- **Transport is swappable.** If HTTP framing ever shows up in profiling, a Unix
  socket / shared memory can replace it behind the Python client without touching
  the contract or the callers.
