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

## chr22: gbz2layout emits 5 more links than pangyplot stores

**Status:** deferred, low priority (5 links out of ~3.01M = 0.00017%). Found
2026-07-17 during NAS/ingest review.

- **gbz2layout** `--emit-links` -> `chr22.links.tsv`: **3,013,418** links
  (3,013,419 file rows, 1 is the `a\tb` header). Confirmed: the 3,013,418 data
  rows are all *distinct* `(a,b)` pairs -- zero exact duplicates.
- **pangyplot** `meta.json.total_links` (chr22): **3,013,413** -- exactly 5 fewer.

The two counts are produced by **independent extractors reading the same GBZ**,
not one derived from the other:

- gbz2layout writes its own 2-column `a b` adjacency (combined node handles, for
  the SGD), during the layout run.
- pangyplot's `LinkIndex._build_from_gbz` reads the **graphd's** `/links` and
  RC-collapses each edge with its reverse-complement twin
  (`key = min(link, rc)`, `pangyplot/db/indexes/LinkIndex.py`).

So this is *not* simply pangyplot RC-collapsing gbz2layout's list. Proof: RC-
canonicalizing gbz2layout's 3,013,418 edges (treating `a`/`b` as
`node<<1|orient`, `rc = (b^1, a^1)`) yields **3,003,441**, ~10k off from
pangyplot's number -- the graphd's edge set differs from gbz2layout's before any
dedup. The near-exact 3,013,413 vs 3,013,418 agreement is between pangyplot's
stored count and gbz2layout's *directed* count, off by 5.

**Candidates for the exact 5** (unverified):
- self-RC / palindromic edges (an edge whose reverse-complement is itself) or
  self-loops, counted once by one path and twice (or zero) by the other;
- chopped-GBZ node->segment translation: the graphd collapses chop-run edges
  (`has_translation`), gbz2layout may not, so a handful of intra-run edges differ;
- a header/off-by-one artifact compounding with one of the above.

**To settle it** (when worth it): boot the graphd on chr22, dump its `/links`,
canonicalize both sides into a common `(seg,orient)->(seg,orient)` form, and set-
diff. The 5 asymmetric edges will name the mechanism. Needs both encodings
aligned first (gbz2layout emit-links source + graphd link extraction).
