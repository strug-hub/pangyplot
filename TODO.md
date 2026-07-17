# TODO

Deferred work, with enough context to pick up cold.

## Region-scope `/walk` instead of fetching whole paths to filter them

**Status:** deferred, needs design. Found 2026-07-16 while ingesting HPRC v2.

`get_path_region_raw()` (`pangyplot/db/query.py:272`) answers a windowed
`/path-data` request by pulling the subpath's *entire* walk and discarding
almost all of it:

```python
combined = gfaidx.path_index.get_path_combined(sample, file_index)  # whole path
region   = region_segment_ids(indexes, genome, chrom, start, end)
mask     = np.isin(combined >> 1, region_arr)
return encode_combined(combined[mask])
```

On chr1 a haplotype walk is ~6M steps / ~48 MB, so a 100 kb window costs a full
GBWT extract, a 48 MB localhost transfer, and an `np.isin` over 6M steps -- per
sample, per pan, uncached (`GbwtPathIndex._by_sample` holds metadata only, and
`graphd`'s `/walk?path=<id>` is a straight `g_index.extract`, `gbwt/graphd/main.cpp:184`).

**Not a GBWT regression.** `get_path_region_raw` is shared, and the legacy
binpath engine takes the same whole-path-then-filter route via
`PathIndex.get_path_combined`. GBWT only made the cost visible: a network
round-trip and a GBWT extract where binpaths did a local file read. That is how
it first surfaced -- as a 10s client timeout killing chr1's ingest (see
588bbf29), which is fixed, but the fix removed the ceiling rather than the cost.

**Why it wasn't just fixed:** it changes two contracts at once -- the `graphd`
wire protocol (`/walk` grows a range) and the query-layer path contract (both
engines share it). Sketch of the problem:

- The filter is a segment *set* from `region_segment_ids`, not a step range, so
  it doesn't push down as-is. Segment ids run roughly reference-ordered, so a
  `[min_seg, max_seg]` prefilter server-side plus a local refine may be enough --
  needs checking against inversions/duplications, where a haplotype re-enters the
  window discontiguously.
- GBWT can locate a path's occurrences at a node, so entering the region and
  extending may beat extracting from the path start. Worth measuring.
- An LRU of recent walks would cut repeat pans cheaply and is orthogonal; it
  does nothing for the first hit.

**Related, still open:** the serving-side timeout question (external graphds).
Production points at externally-managed daemons (`PANGYPLOT_GBWT_URLS`, see
`gbwt/graphd/README.md:41`), which -- unlike the ingest daemon `serve_graph()`
spawns and kills -- can wedge while alive. Data requests are currently unbounded
(`pangyplot/db/gbwt_client.py`), so a wedged remote blocks a worker until
gunicorn's own `--timeout` (default 30s, no gunicorn config in-repo) kills it.
Any client-side bound tight enough to catch a wedge is also tight enough to kill
a legitimate chr1 walk -- which is only true *because* serving does full walks.
Region-scoping `/walk` largely dissolves this; settle it after, not before.
Ingestion is unaffected either way: its full walks are a batch job with no server
above them, so unbounded is correct there on its own merits.
