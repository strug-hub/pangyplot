"""Flow — `GET /select`: a region query.

Two genomic coordinates go in; a JSON graph of bubble nodes and GFA links comes
out. The stages below are traced from routes.py through query.py and the three
indexes it consults, in the order a request actually visits them. Every timing on
this page is a real request issued against the real datastore at build time,
through the harness in _runtime.py — not a fixture, not an estimate.

The last stage is /chains — now REMOVED. It was the sibling endpoint over the
same window that answered the same question 2000x slower (and OOM'd larger
chromosomes). It is kept here as the record of why it was deleted; the frontend
always used /detail-tiles, and /select is now guarded with a segment-count limit.
"""

import time

from flows import _runtime as rt
from flows._runtime import check

SLUG = "select"
NAME = "/select"
TITLE = "<code>GET /select</code> — a region query"
SUB = ("Two bp coordinates in, a graph of bubbles and links out. Four index lookups and "
       "a serialize, in order. Every function links into your editor; every timing is a "
       "real request against the real datastore, issued at build time — pick a query.")
CTX_LABEL = "query"

STAGES = [
  {
    "id": "endpoint", "name": "The endpoint", "timing_key": "dispatch",
    "fns": [("pangyplot/routes.py", "select"),
            ("pangyplot/db/query.py", "get_bubble_graph")],
    "gist": "Read four query args, pull the three indexes for (chrom, genome) off the app, and hand them to the query layer. No validation beyond int().",
    "inp": "genome, chromosome, start, end — all raw request args",
    "out": "{'nodes': [...], 'links': [...]} as JSON",
    "artifacts": [],
    "checks": ["status", "shape"],
    "tests": ["tests/routes/test_graph_routes.py", "tests/routes/test_security.py"],
    "notes": [
      ("A missing or non-numeric parameter is a 500, not a 400",
       "routes.py — <code>start = int(request.args.get(\"start\"))</code>, straight into "
       "<code>int()</code> with no default and no try. <code>/select?genome=GRCh38&amp;chromosome=chrY&amp;start=2700000</code> "
       "(no <code>end</code>) raises <code>TypeError: int() argument must be ... not 'NoneType'</code> and Flask "
       "returns <b>500</b> — measured, it is one of the contexts on this page. An unknown genome is handled properly "
       "(ValueError → 404); an unparseable coordinate is not. Same pattern in <code>chains()</code>, "
       "<code>detail_tiles()</code> and <code>path()</code>."),
      ("/select does not go through _safe_chrom",
       "The file-serving routes (<code>/skeleton</code>, <code>/spine</code>, <code>/graph-meta</code>) validate "
       "<code>chromosome</code> against <code>current_app.chromosomes</code> because it lands in "
       "<code>os.path.join</code>. <code>/select</code> skips that check. It is not exploitable today — the value is "
       "only ever used as a dict key into the loaded indexes, and a miss is a clean 404 — but the two routes now "
       "treat the same parameter differently, and only one of them is guarded if a future handler joins a path."),
    ],
    "invariants": [
      ("The indexes are looked up with .get(), and a miss is a ValueError → 404",
       "query.py raises <code>ValueError</code> when <code>step_index[(chrom, genome)]</code> or "
       "<code>bubble_index[chrom]</code> is absent, and the route turns that into a 404 with the message. This is "
       "the only reason a request for an unloaded chromosome does not 500. Keep the .get() — an indexing "
       "<code>[]</code> here would raise KeyError, which the route does not catch."),
    ],
    "sub": [],
  },
  {
    "id": "coords", "name": "bp → step", "timing_key": "coords",
    "fns": [("pangyplot/db/indexes/StepIndex.py", "query_coordinates")],
    "gist": "Binary-search the reference path's sorted bp array to turn the two genomic coordinates into two step ordinals.",
    "inp": "start, end (bp on the reference)",
    "out": "(start_step, end_step) — ordinals into the reference walk",
    "artifacts": [],
    "checks": ["steps"],
    "tests": ["tests/db/test_step_index.py"],
    "notes": [],
    "invariants": [
      ("Everything downstream is expressed in steps, not bp",
       "bp exists only in this stage. BubbleIndex ranges, Bubble.range_inclusive and the chain step ranges are all "
       "step ordinals on the reference path, so a bubble that carries no reference step has no bp at all. That is "
       "why the range query is over <code>start_steps</code>/<code>end_steps</code> and not over coordinates — and "
       "why a non-reference bubble can only be found through its siblings, never by position."),
      ("starts/ends are mmapped, and bisect works on them by accident of protocol",
       "StepIndex loads its three arrays with <code>np.load(..., mmap_mode='r')</code>, so a chromosome's step "
       "table costs no RSS until touched. <code>bisect.bisect_right</code> then walks that memmap through "
       "<code>__getitem__</code> — it works because a numpy array is a sequence, and it stays O(log n) because the "
       "array is sorted by construction (steps are appended in reference order). Sort it any other way and the "
       "bisect silently returns garbage rather than failing."),
    ],
    "sub": [
      {"name": "One coordinate", "timing_key": "",
       "fns": [("pangyplot/db/indexes/StepIndex.py", "query_bp")],
       "gist": "bisect_right over the sorted `starts` array, minus one — the step whose bp interval contains the position.",
       "cost": "Two of these per request. Microseconds; it does not appear in any measurement on this page."},
    ],
  },
  {
    "id": "bubbles", "name": "Range query for bubbles", "timing_key": "bubbles",
    "fns": [("pangyplot/db/indexes/BubbleIndex.py", "get_top_level_bubbles")],
    "gist": "Bisect the sorted top-level bubble ranges for everything overlapping the window, then walk down into any bubble that spills outside it.",
    "inp": "(start_step, end_step)",
    "out": "a flat list of Bubble objects — the nodes of the answer",
    "artifacts": [],
    "checks": ["nodes_are_bubbles", "window"],
    "tests": ["tests/db/test_bubble_index.py", "tests/db/test_query.py"],
    "notes": [
      ("The overlap scan is a linear walk, not a second bisect",
       "<code>get_top_level_bubbles</code> bisects <code>end_steps</code> for the lower bound and then loops "
       "<code>range(start_index, len(start_steps))</code> until a start exceeds the window. That is correct, but the "
       "loop is over the whole tail of the array in the worst case (a single bubble whose range covers the "
       "chromosome pushes <code>start_index</code> to 0). On chrY the array is 31,062 rows, so it does not show up; "
       "it is not bounded by the answer size, only by the array size."),
    ],
    "invariants": [
      ("A bubble that straddles the window edge is replaced by its children, not clipped",
       "<code>_traverse_descendants</code> returns the bubble only if <code>is_contained(min_step, max_step)</code>; "
       "otherwise it recurses into <code>bubble.children</code>. So the answer is the deepest set of bubbles that "
       "actually fit inside the viewport — the frontend never receives a node that claims a bp range wider than the "
       "region it asked for. This is what makes /select's payload scale with the window (12.8 KB at 100 kb, 1.5 MB "
       "at 2 Mb) rather than with the chromosome."),
      ("_get_many batches the SQLite fetch and does not trust its own cache",
       "BubbleIndex's cache is a 1000-entry FIFO. <code>_get_many</code> builds its result from a local dict rather "
       "than re-reading the cache after the insert, because a request larger than <code>cache_size</code> evicts its "
       "own earlier entries mid-loop. Reverting that to a cache lookup would silently drop bubbles from any window "
       "with more than 1000 of them."),
    ],
    "sub": [
      {"name": "Bisect the range arrays", "timing_key": "",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "get_top_level_bubbles")],
       "gist": "bisect_left on end_steps, then scan forward while start_step <= max_step, collecting ids.",
       "cost": "Pure array work over the mmapped uint32 arrays — no SQLite, no objects."},
      {"name": "Materialize the Bubbles", "timing_key": "",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "_get_many")],
       "gist": "Turn ids into Bubble objects: FIFO cache first, then ONE batched SELECT for the misses.",
       "cost": "The only SQLite read in the stage. Each row's source/sink/inside lists are JSON-decoded on the way out."},
      {"name": "Descend into straddling bubbles", "timing_key": "",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "_traverse_descendants")],
       "gist": "If a bubble is not fully inside the window, recurse into its children and return those instead.",
       "cost": "Recursion loads children one at a time through __getitem__ — a SELECT per child on a cache miss, not batched."},
    ],
  },
  {
    "id": "links", "name": "Boundary segments → links", "timing_key": "links",
    "fns": [("pangyplot/db/indexes/GFAIndex.py", "get_subgraph")],
    "gist": "Collect every source and sink segment of every returned bubble, then fetch every GFA link touching one of them. The segments themselves are discarded — /select keeps only the links.",
    "inp": "the source+sink segment ids of the bubbles",
    "out": "a deduplicated list of Link objects",
    "artifacts": [],
    "checks": ["links_resolve"],
    "tests": ["tests/db/test_gfa_index.py", "tests/db/test_link_index.py", "tests/db/test_bubble_links.py"],
    "notes": [
      ("/select calls get_subgraph without fast=True — one SQLite SELECT per link",
       "query.py calls <code>gfaidx.get_subgraph(boundary_segs, stepidx)</code>, and <code>fast</code> defaults to "
       "False, so link discovery goes through <code>LinkIndex.get_links_by_segment</code> → "
       "<code>get_link_by_index</code> → <code>db.get_link(...)</code>: one SQLite round trip per incident link, per "
       "boundary segment, links counted twice (once from each end). Every other caller — the exports, the chain "
       "subgraphs, the detail tiles — passes <code>fast=True</code>. This one cannot: see the invariant. It is why "
       "the 2 Mb window costs ~190 ms where the 100 kb window costs ~4 ms."),
      ("get_subgraph builds the Segment objects /select then throws away",
       "The first line of <code>get_subgraph</code> is <code>segment_index.get_by_ids(seg_ids, step_index)</code>, "
       "and <code>get_bubble_graph</code> assigns that to <code>_</code>. Every boundary segment is fetched from "
       "SQLite, sequence included, and dropped. The links are all /select wants."),
    ],
    "invariants": [
      ("The slow path is the one with the haplotype data on it",
       "<code>get_link_by_index_fast</code> builds a Link from the in-memory arrays but carries only from/to ids and "
       "strands — no <code>haplotype</code> bitmask, no <code>frequency</code>. Those two fields are exactly what "
       "the viewer colours and weights links by, and they are only in <code>links.db</code>. Flipping /select to "
       "<code>fast=True</code> would make it ~50x faster and silently unpaint the graph."),
      ("Links are emitted as raw GFA s→s, even though every node is a bubble",
       "Every node in a /select response is <code>b&lt;id&gt;</code>; every link is <code>s&lt;id&gt; → "
       "s&lt;id&gt;</code>, naming segments that are not in <code>nodes</code> at all. That is deliberate and "
       "load-bearing: the backend stays a pure projection of the GFA, and the frontend's viewState resolves each "
       "segment endpoint to whichever visual node currently owns it (bubble circle when collapsed, segment when "
       "popped). A link endpoint is always a source or sink segment of a returned bubble — the "
       "<code>links_resolve</code> checkpoint asserts exactly that. Rewriting endpoints to bubble ids here would "
       "break pop, which re-resolves the same links against a changed view."),
    ],
    "sub": [
      {"name": "Fetch the boundary segments", "timing_key": "",
       "fns": [("pangyplot/db/indexes/SegmentIndex.py", "get_by_ids")],
       "gist": "Load a Segment per id from SQLite, attaching its reference steps from the StepIndex.",
       "cost": "Entirely wasted on this route — the result is bound to `_` in get_bubble_graph."},
      {"name": "Fetch the incident links", "timing_key": "",
       "fns": [("pangyplot/db/indexes/LinkIndex.py", "get_links_by_segment")],
       "gist": "Look the segment up in the flat CSR link arrays, then re-read each link's full row from links.db by id.",
       "cost": "The dominant cost of the whole request. The CSR offset lookup is free; the per-link db.get_link() is not."},
    ],
  },
  {
    "id": "serialize", "name": "Nodes and links on the wire", "timing_key": "serialize",
    "fns": [("pangyplot/objects/Bubble.py", "Bubble.serialize"),
            ("pangyplot/objects/Link.py", "Link.serialize")],
    "gist": "Each Bubble becomes a node dict (id b<n>, its ranges, its source/sink/inside segment ids, its layout bbox); each Link becomes {source, target, haplotype, frequency}. Flask's jsonify does the rest.",
    "inp": "[Bubble], [Link]",
    "out": "the response body",
    "artifacts": [],
    "checks": ["payload"],
    "tests": ["tests/routes/test_graph_routes.py"],
    "notes": [
      ("inside_segs is sorted on every serialize",
       "<code>Bubble.serialize</code> does <code>sorted(self.inside)</code>. For the big bubbles of a wide window "
       "that is a sort per node per request, of a set that never changes. It is also the reason a node's payload "
       "grows with the bubble's interior even though the viewer draws it as one circle until it is popped — "
       "<code>inside_segs</code> is most of the 1.5 MB the 2 Mb window returns."),
    ],
    "invariants": [
      ("The id prefixes are the frontend's type system",
       "<code>b&lt;id&gt;</code> for a bubble, <code>s&lt;id&gt;</code> for a segment, <code>c&lt;id&gt;</code> for "
       "a chain. Link endpoints are built as <code>f\"{from_type}{from_id}\"</code>, and the viewer parses the "
       "prefix back off to decide what a link connects. These strings are the contract; the ints alone are "
       "ambiguous between the three id spaces."),
    ],
    "sub": [],
  },
  {
    "id": "chains", "name": "/chains — REMOVED (was 2000x slower; this is why)", "timing_key": "chains",
    "fns": [("pangyplot/db/indexes/BubbleIndex.py", "create_chains"),
            ("pangyplot/db/chain_polyline.py", "_project_points_onto_polyline")],
    "gist": "REMOVED endpoint. It was the sibling of /select over the same region, but as_chains=True made the window stop mattering — a 100 kb request was chromosome-scale (~7 s, and OOM on larger chromosomes). The frontend never called it (it uses /detail-tiles); this flow is kept as the measurement that justified deleting it.",
    "inp": "the same genome, chromosome, start, end",
    "out": "(removed) was {'chains': [ {polyline, bubble_t, bubble_ids, ...} ], 'bubbles': []}",
    "artifacts": [],
    "checks": ["chains_window"],
    "tests": ["tests/db/test_chain_polyline.py", "tests/db/test_query_functions.py"],
    "hang": True,
    "notes": [
      ("REMOVED — the route and get_chains are gone; /select is guarded instead",
       "The <code>/chains</code> route and <code>get_chains</code> were deleted. <code>/select</code> (the live "
       "viewer path) now returns <b>413</b> (<code>RegionTooComplex</code> / <code>MAX_REGION_SEGMENTS</code>) when a "
       "region resolves to too many segments, instead of OOMing. The functions the notes below name — "
       "<code>create_chains</code>, <code>_project_points_onto_polyline</code> — still exist (used by "
       "<code>/detail-tiles</code> and the PolychainIndex prebuild), so the root-cause analysis stays accurate; only "
       "the <code>/chains</code> entry point is gone. The measurements below are preserved verbatim as the record."),
      ("MEASURED: ~3 ms vs ~7,200 ms over the identical window",
       "chrY:2,700,000-2,800,000, same booted app, same process, best of three. <code>/select</code> → <b>3.2 ms</b> "
       "/ 12.5 KB / 11 nodes. <code>/chains</code> → <b>7,273 ms</b> / 186 KB / <b>1</b> chain. cProfile puts 6.78 s "
       "of those 7.30 s inside <code>_project_points_onto_polyline</code> — 93% of the request in one function. The "
       "two root causes are below, and they compound."),
      ("Root cause 1 — create_chains discards the window",
       "<code>get_top_level_bubbles(..., as_chains=True)</code> hands the 11 in-window bubbles to "
       "<code>BubbleIndex.create_chains</code>, which asks <code>get_chain_bubble_ids_batch</code> for <i>every</i> "
       "bubble id of every chain those 11 belong to and back-fills them all from SQLite. chrY's window falls in one "
       "chain, and that chain has <b>12,706 bubbles</b>. So a 100 kb request materializes a chain that spans most of "
       "the chromosome. The proof is in the contexts on this page: the 100 kb window and the 2 Mb window return "
       "<b>byte-identical 190,063-byte responses, both in ~7 s</b>. <code>start</code> and <code>end</code> change "
       "nothing about the answer — only which chains are touched, and on chrY that is always the one."),
      ("Root cause 2 — _project_points_onto_polyline is O(bubbles × polyline segments)",
       "chain_polyline.py — for every bubble centroid it computes the distance to every segment of the chain's "
       "polyline (<code>rel = q[:, None, :] - A[None, :, :]</code>, then an einsum, then an argmin over axis 1). The "
       "polyline has one vertex per bubble, so M and K are the same 12,706 number: ~<b>1.6 × 10⁸</b> "
       "point-to-segment distances, to produce 12,706 t-values. <code>_PROJECT_CHUNK = 1024</code> bounds the "
       "<i>memory</i> of the intermediate, which is why this shows up as seven seconds of CPU rather than an OOM. "
       "It is only quadratic because root cause 1 handed it the whole chain — the two are one bug. A bubble's t is "
       "its position along a polyline it is itself a vertex of, so the nearest-segment search is doing work the "
       "construction order already knows the answer to."),
      ("It was NOT _find_bypass — that function is never reached from /chains",
       "The standing suspicion was <code>_find_bypass</code>'s <code>new_path = path + [nxt]</code> inside a BFS. "
       "Disproved: <code>/chains</code> passes no <code>expand</code> parameter, so "
       "<code>expand_threshold is None</code>, and <code>decompose_chain</code> returns "
       "<code>_chain_as_polyline(...)</code> on its first line before any decomposition happens. cProfile records "
       "<b>zero</b> calls to <code>_find_bypass</code> during a /chains request. The path-copying BFS is real code "
       "on the /detail-tiles and PolychainIndex prebuild paths, but it is not this hang. Fixing it would not have "
       "moved this number at all."),
    ],
    "invariants": [
      ("/chains is not on the hot path of the live viewer — PolychainIndex is",
       "The detail view does not call /chains at runtime; it calls <code>/detail-tiles</code>, which reads the "
       "decompositions PolychainIndex precomputed at ingest. That is precisely why a 7-second endpoint has survived: "
       "it is the uncached form of the same computation, kept for the API and for chain queries with an explicit "
       "<code>expand</code>. Do not \"fix\" the latency by caching /chains — fix create_chains to respect the window, "
       "or the same cost simply reappears the first time anyone calls it with a real expand threshold."),
    ],
    "sub": [
      {"name": "The same first two stages", "timing_key": "",
       "fns": [("pangyplot/db/query.py", "get_bubble_graph")],
       "gist": "query_coordinates, then get_top_level_bubbles — /chains was identical to /select up to this point (get_bubble_graph still shows these two stages).",
       "cost": "~0 ms. Everything after this was the difference."},
      {"name": "Back-fill the whole chain", "timing_key": "chains_create",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "create_chains")],
       "gist": "Group the in-window bubbles by chain id, then fetch every OTHER bubble of those chains from SQLite so each Chain object is complete.",
       "cost": "0.36 s and 12,706 Bubble objects for a window that contained 11. This is where the window is thrown away."},
      {"name": "Decompose (a no-op here)", "timing_key": "",
       "fns": [("pangyplot/db/chain_polyline.py", "decompose_chain")],
       "gist": "With no expand_threshold, this returns _chain_as_polyline immediately — no recursion, no bypass flood-fill.",
       "cost": "The route never sends expand=, so this is a straight passthrough. _find_bypass is not called."},
      {"name": "Build the chain polyline", "timing_key": "chains_polyline",
       "fns": [("pangyplot/db/chain_polyline.py", "build_chain_polyline")],
       "gist": "One vertex per bubble centroid, then arc-length t-values for each bubble, then RDP-simplify.",
       "cost": "6.94 s. The RDP simplify at the end is 0.09 s; the t-values are everything."},
      {"name": "Project every centroid onto the polyline", "timing_key": "chains_project",
       "fns": [("pangyplot/db/chain_polyline.py", "_project_points_onto_polyline")],
       "gist": "For each bubble centroid, find its arc-length position on the chain polyline by taking the nearest point over ALL polyline segments.",
       "cost": "6.78 s — 93% of the request. M×K = 12,706 × 12,706 distance evaluations, chunked 1024 points at a time so it costs time instead of memory."},
    ],
  },
]


# ---------------------------------------------------------------------------
# Contexts: four real queries against a real chromosome, timed
# ---------------------------------------------------------------------------

DB = "hprc.clip"
CHROM = "chrY"
REF = "GRCh38"

# (label, start, end, run_chains) -- run_chains is False everywhere now: /chains
# was removed, so the atlas no longer issues it. The chains flow above is kept as
# the historical record of why it was removed.
QUERIES = [
    ("100 kb window", 2_700_000, 2_800_000, False),
    ("2 Mb window", 2_700_000, 4_700_000, False),
    ("empty region", 57_227_410, 57_227_415, False),
    ("missing &end", 2_700_000, None, False),
]


def _q(start, end):
    q = f"genome={REF}&chromosome={CHROM}&start={start}"
    return q if end is None else q + f"&end={end}"


def _stage_timings(app, start, end):
    """Time each stage by calling the same index methods /select calls, in order."""
    stepidx = app.step_index[(CHROM, REF)]
    bubbleidx = app.bubble_index[CHROM]
    gfaidx = app.gfa_index[CHROM]

    t0 = time.perf_counter()
    start_step, end_step = stepidx.query_coordinates(start, end)
    t1 = time.perf_counter()
    bubbles = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=False)
    t2 = time.perf_counter()
    boundary = set()
    for b in bubbles:
        boundary.update(b.source_segments + b.sink_segments)
    _, links = gfaidx.get_subgraph(boundary, stepidx)
    t3 = time.perf_counter()
    nodes = [b.serialize() for b in bubbles]
    slinks = [l.serialize() for l in links]
    t4 = time.perf_counter()

    return ({"coords": {"s": t1 - t0, "gb": None},
             "bubbles": {"s": t2 - t1, "gb": None},
             "links": {"s": t3 - t2, "gb": None},
             "serialize": {"s": t4 - t3, "gb": None}},
            {"steps": (start_step, end_step), "nodes": nodes, "links": slinks,
             "boundary": boundary})


def _probe(app, sel, chains, inner, start, end):
    """Every checkpoint on this page, against one real response."""
    p = {}

    if sel["status"] != 200:
        p["status"] = check(False, f"HTTP {sel['status']} — the request never reached the query layer")
        for k in ("shape", "steps", "nodes_are_bubbles", "window", "links_resolve", "payload"):
            p[k] = check(False, "not reached")
        p["chains_window"] = check(False, "not issued for this query")
        return p

    j = sel["json"] or {}
    nodes, links = j.get("nodes"), j.get("links")
    p["status"] = check(True, f"HTTP 200 in {sel['s'] * 1000:.1f} ms")
    p["shape"] = check(isinstance(nodes, list) and isinstance(links, list),
                       f"{len(nodes or [])} nodes, {len(links or [])} links")

    st = inner["steps"]
    stepidx = app.step_index[(CHROM, REF)]
    ok = (0 <= st[0] <= st[1] < len(stepidx.starts)
          and int(stepidx.starts[st[0]]) <= start
          and int(stepidx.ends[st[1]]) >= end)
    p["steps"] = check(ok, f"bp {start:,}-{end:,} → steps {st[0]:,}-{st[1]:,} "
                           f"(bp {int(stepidx.starts[st[0]]):,}-{int(stepidx.ends[st[1]]):,})")

    types = {n.get("type") for n in nodes}
    p["nodes_are_bubbles"] = check(
        not nodes or types == {"bubble"},
        f"every node is type=bubble, id b<n>" if types == {"bubble"}
        else ("no nodes — the region has no top-level bubbles" if not nodes
              else f"unexpected node types: {types}"))

    # Every returned bubble's reference range must lie inside the queried steps.
    lo, hi = st
    outside = [n["id"] for n in nodes
               if n["ranges"] and not all(lo <= r[0] and r[1] <= hi for r in n["ranges"])]
    p["window"] = check(not outside,
                        f"all {len(nodes)} bubbles' step ranges lie inside {lo:,}-{hi:,}"
                        if not outside else f"{len(outside)} bubbles spill outside the window: {outside[:3]}")

    # Links name segments, not bubbles: every endpoint must be a source or sink
    # segment of some returned bubble.
    bset = set()
    for n in nodes:
        bset.update(n["source_segs"])
        bset.update(n["sink_segs"])
    bad = [l["id"] for l in links
           if int(l["source"][1:]) not in bset and int(l["target"][1:]) not in bset]
    p["links_resolve"] = check(
        not bad,
        f"all {len(links)} links name a source/sink segment of a returned bubble "
        f"(s-prefixed, never b-prefixed)" if not bad
        else f"{len(bad)} links reference no returned bubble's boundary")

    p["payload"] = check(sel["bytes"] > 0,
                         f"{sel['bytes'] / 1024:.1f} KB for {len(nodes)} nodes / {len(links)} links")

    if chains is None:
        p["chains_window"] = check(False, "not issued for this query")
    elif chains["status"] != 200:
        p["chains_window"] = check(False, f"HTTP {chains['status']}")
    else:
        cj = chains["json"] or {}
        cbubbles = sum(len(c.get("bubble_ids") or []) for c in cj.get("chains", []))
        # The window is respected only if the chains do not carry vastly more
        # bubbles than the window itself contained.
        ok = cbubbles <= max(len(nodes) * 2, 8)
        p["chains_window"] = check(
            ok,
            f"{len(cj.get('chains', []))} chain(s) carrying {cbubbles:,} bubbles for a window "
            f"with {len(nodes)} — {chains['bytes'] / 1024:.0f} KB in {chains['s']:.2f}s"
            + ("" if ok else " · the whole chain is back-filled regardless of start/end"))
    return p


def contexts():
    b = rt.boot(DB, ref=REF)
    if b["error"] or not b["client"]:
        return {}
    app, client = b["app"], b["client"]
    if (CHROM, REF) not in getattr(app, "step_index", {}):
        return {}

    out = {}
    for label, start, end, run_chains in QUERIES:
        sel = rt.timed(client, "/select?" + _q(start, end), n=3)

        if sel["status"] != 200:
            timings = {"total": {"s": sel["s"], "gb": None}}
            out[label] = {
                "line": (f'<span class="num">{CHROM}:{start:,}-…</span> — '
                         f'<span class="warn">HTTP {sel["status"]}. '
                         f'<code>int(request.args.get("end"))</code> on a missing arg is a '
                         f'TypeError, and Flask turns that into a 500.</span>'),
                "timings": timings,
                "probe": _probe(app, sel, None, {}, start, end),
                "artifacts": {},
            }
            continue

        timings, inner = _stage_timings(app, start, end)
        timings["total"] = {"s": sel["s"], "gb": None}
        inner_sum = sum(timings[k]["s"] for k in ("coords", "bubbles", "links", "serialize"))
        timings["dispatch"] = {"s": max(sel["s"] - inner_sum, 0.0), "gb": None}

        chains = None
        if run_chains:
            # One call only: on chrY this is seven seconds.
            chains = rt.timed(client, "/chains?" + _q(start, end), n=1)
            timings["chains"] = {"s": chains["s"], "gb": None}

        n = len(sel["json"]["nodes"])
        line = (f'<span class="num">{CHROM}:{start:,}-{end:,}</span> — '
                f'<code>/select</code> <b class="num">{sel["s"] * 1000:.1f} ms</b>, '
                f'{sel["bytes"] / 1024:.1f} KB, {n} bubbles')
        if chains and chains["status"] == 200:
            ratio = chains["s"] / sel["s"] if sel["s"] else 0
            line += (f' · <code>/chains</code> <b class="num">{chains["s"] * 1000:.0f} ms</b>, '
                     f'{chains["bytes"] / 1024:.0f} KB — '
                     f'<span class="warn">{ratio:.0f}x slower over the same window</span>')
        line += ('. Stage times are the same index calls made directly; '
                 '<i>dispatch</i> is the remainder (Flask routing + jsonify).')

        out[label] = {"line": line, "timings": timings,
                      "probe": _probe(app, sel, chains, inner, start, end),
                      "artifacts": {}}
    return out


PANELS = [
  {"cls": "flag", "title": "What the /select route tests actually prove",
   "paras": [
     ("The route tests are real, but tiny.",
      "<code>tests/routes/test_graph_routes.py</code> does not use the <code>client</code> fixture from "
      "<code>tests/routes/conftest.py</code> — it shadows it with a module-scoped <code>drb1_app</code> that parses "
      "the DRB1-3123 GFA fixture, runs bubble detection, and builds all four real indexes into a tempdir. So /select "
      "IS exercised end-to-end. But DRB1-3123 is a 5 kb region with a handful of bubbles: it can prove the response "
      "shape and the pop endpoints' exact node sets, and it cannot prove anything about cost. The 7-second /chains "
      "documented on this page passed <code>tests/db/test_chain_polyline.py</code> without complaint — it was "
      "removed only after being measured here, never by a test."),
     ("The conftest client is a stub, and the other route tests use it.",
      "<code>tests/routes/conftest.py</code> builds a bare Flask app with <b>only</b> cytoband data on it — no "
      "<code>step_index</code>, no <code>bubble_index</code>, no <code>gfa_index</code>. Everything that takes the "
      "unshadowed <code>client</code> fixture (<code>test_cytoband_routes</code>, "
      "<code>test_annotation_routes</code>, <code>test_security</code>) is testing a server that could not answer a "
      "/select at all. That is fine for what they check; it is worth knowing before you read a green run as "
      "coverage of the query layer."),
     ("Nothing measures a request.",
      "No test in the suite asserts a latency or a payload size for any route. The 2000x gap on this page was "
      "invisible to CI and would have stayed invisible. Every number here comes from "
      "<code>tools/atlas/flows/_runtime.py</code> booting the real app against <code>datastore/</code> at build "
      "time."),
   ]},
  {"cls": "resume", "title": "The three endpoints over a region, and which one the viewer uses",
   "paras": [
     ("/select",
      "Bubbles as nodes, GFA links between their boundary segments. Scales with the window. This is what the core "
      "viewer draws, and what <code>/pop</code> then expands node by node."),
     ("/chains (removed)",
      "The same bubbles, grouped into Chain objects and reduced to one polyline per chain. Documented as a region "
      "query; was not one — <code>create_chains</code> back-fills each chain in full, so the response was the same 190 "
      "KB whether you asked for 100 kb or 2 Mb of chrY. Deleted for that reason; /select carries a segment-count "
      "guard so it cannot hit the same wall."),
     ("/detail-tiles",
      "What the simplify viewer actually calls. Reads the decompositions <code>PolychainIndex</code> precomputed "
      "during <code>pangyplot add</code> (see the ingest flow), which is why the same chain decomposition that costs "
      "7 s here costs milliseconds there. The cost did not go away — it moved into ingest, where "
      "<code>_find_bypass</code>'s path-copying BFS really does live."),
   ]},
]
