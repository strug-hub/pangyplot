# gbwt-sidecar

Persistent GBWT path-service for PangyPlot (GBWT migration Stage 3). Loads one
per-chromosome GBZ into memory and answers path queries over localhost HTTP.
Flask proxies these and does region filtering + varint encoding in Python.

```sh
gbwt-sidecar <graph.gbz> [addr]     # addr default 127.0.0.1:5701
```

## Wire protocol — the language-agnostic contract

**This protocol, not the Rust code, is the boundary.** The Python client depends
only on what's below. The service is currently Rust (`gbz` / gbwt-rs), but the
same operations exist in the C++ stack (`jltsiren/gbwt` + `gbwtgraph`), so a C++
reimplementation that honours this contract is a drop-in — nothing above the
client changes. Keep everything here neutral: plain HTTP, JSON for metadata,
explicit little-endian binary for bulk. No language-specific serialization.

Walks are always in **PangyPlot segment ids**. vg chops long segments on
GFA→GBZ import (the GBZ then carries a node→segment translation), so `/walk`
uses `segment_path` when a translation is present (segment name = segment id)
and falls back to node ids only when there is none. Verified byte-identical to
the legacy binpath format by `tests/db/test_gbz_parity.py`.

| endpoint | params | response |
|---|---|---|
| `GET /health` | — | `text/plain` `ok` |
| `GET /meta` | — | `application/json` (below) |
| `GET /walk` | `path=<usize>` | `application/octet-stream`: array of **little-endian i64**, one per step, value = `(segment_id << 1) \| orientation_bit` (`+`=0, `-`=1). PangyPlot's `combined` form. |
| `GET /count` | `node=<usize>` | `text/plain` decimal: haplotype occurrence count at the node |

`/meta` JSON:
```json
{
  "nodes": <int>, "paths": <int>, "has_metadata": <bool>,
  "samples": ["<name>", ...],
  "path_list": [
    {"id": <int>, "sample": "<name>", "contig": "<name>",
     "phase": <int>, "fragment": <int>}
  ]
}
```

### Planned additions (Stage 5, node/link on GBZ — see context/gbwt-migration.md)
`/subgraph` (segment set → nodes+edges+seq+freq, **binary** not JSON), `/node`,
`/edges`. Same contract discipline: binary bulk payloads, one batch call per
`/select` (never per-node).

## Design notes (kept forward-compatible)
- **Threaded.** The GBZ is read-only + `Arc`-shared, so N worker threads serve
  concurrently with no locking. Fine for paths; required for the `/select` hot
  path in Stage 5.
- **Binary bulk payloads.** `/walk` is packed LE-i64, not JSON — the pattern to
  reuse for `/subgraph`.
- **Transport is swappable.** If HTTP framing ever shows up in profiling, a Unix
  socket / shared memory can replace it behind the Python client without touching
  the contract or the callers.
