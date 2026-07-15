"""Flow — the bubble pop: one Ctrl+click, all the way down and back.

The only flow that crosses the whole stack. A bubble circle on a polychain is
hit-tested in the browser, popBubbleCircleV2 fetches GET /pop, the server walks
the bubble hierarchy in BubbleIndex and hands back a flat segment subgraph, and
the browser then splits the container, turns the response into SimObjects,
resolves every GFA link against the segment registry and drops the whole lot
into the running force simulation in one batch.

Stages 1-2 and 5-9 are the browser. Stages 3-4 are the server. The boundary is
one fetch() and one Flask route, and almost every fragile assumption in the
codebase lives on the browser side of it.

Measured live: the real app is booted against datastore/, /select is called on a
real region, a real bubble id is taken out of the response, and that bubble is
actually popped.
"""

import time

from core import human
from flows import _runtime as rt

SLUG = "pop"
NAME = "bubble pop"
TITLE = "<code>pop</code> — a bubble circle becomes a subgraph"
SUB = ("Ctrl+click a bubble on a polychain and it expands into the graph hiding inside it. "
       "Nine stages: two in the browser, two on the server, five back in the browser. "
       "Every step is bound to a real function and the pop is measured against a real bubble — pick one.")
CTX_LABEL = "bubble"

# The region the switcher pops out of. chrY, around the biggest superbubble on
# the chromosome — so the switcher can offer both a trivial pop and a brutal one.
REGION = ("chrY", 9_380_000, 9_480_000)
GENOME = "GRCh38"
DB = "hprc.clip"


STAGES = [
  {
    "id": "hittest", "name": "1 · Ctrl+click a bubble circle — BROWSER", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/engines/selection/multi-selection-engine.js", "setupMultiSelection"),
            ("pangyplot/static/js/graph/detail/engines/polychain/polychain-hover-engine.js", "hitTestBubbleCircles")],
    "gist": "A pointerdown with Ctrl held is converted to layout coordinates and hit-tested against every bubble circle currently drawn on a polychain segment; the hit carries the bubble id, its t along the chain, and the chain it sits on.",
    "inp": "pointerdown event (ctrlKey/metaKey), canvas coords",
    "out": "hit = { x, y, meta:{id,t}, chainId }",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "notes": [
      ("Hit testing reads a render side effect", "hitTestBubbleCircles walks <code>seg._lastBubbleCircles</code> — the array the renderer happened to leave behind on its last frame. A bubble that has not been drawn yet (or was culled by the grid-size threshold) cannot be popped, and there is no fallback to the model."),
    ],
    "invariants": [],
    "sub": [],
  },
  {
    "id": "fetch", "name": "2 · popBubbleCircleV2 → GET /pop — BROWSER, and the boundary",
    "timing_key": "pop_http",
    "fns": [("pangyplot/static/js/graph/detail/model/pop-handler.js", "popBubbleCircleV2")],
    "gist": "The one function that owns the whole pop: it fetches /pop, splits the container, builds the SimObjects, resolves the links, inserts them into the sim and records the undo entry. Everything after this stage is still inside it.",
    "inp": "hit from the hit test",
    "out": "GET /pop?id=b…&genome=…&chromosome=… — the only network call a pop makes",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "notes": [
      ("A pop is not cancellable and not deduplicated", "The fetch is awaited with no AbortController and no in-flight guard. popAllBubblesOnChain awaits them one at a time, but a user Ctrl+clicking two circles quickly runs two pops concurrently against the same container, and the second one's splitAtBubble sees a container the first one is halfway through mutating."),
    ],
    "invariants": [
      ("The container's <code>t</code> wins over the hit's <code>t</code>", "pop-handler.js re-looks-up the bubble in <code>container.bubbles</code> and uses <em>that</em> t, not <code>hit.meta.t</code> from the meta cache. The comment above it is load-bearing: the two can differ, and splitting at the meta-cache t leaves gaps between the split segments' tRanges that later pops then fail to cover."),
    ],
    "sub": [],
  },
  {
    "id": "route", "name": "3 · /pop route and query — SERVER", "timing_key": "pop_query",
    "fns": [("pangyplot/routes.py", "pop"),
            ("pangyplot/db/query.py", "pop_bubble")],
    "gist": "Flask hands the id straight to query.pop_bubble, which strips the 'b' prefix, asks BubbleIndex for the popped subgraph and serializes it. A segment id ('s…') returns an empty payload — segments have nothing inside them.",
    "inp": "id, genome, chromosome (query string)",
    "out": "{source_segs, sink_segs, nodes, links} as JSON",
    "artifacts": [],
    "checks": ["boundaries_match", "boundaries_in_nodes"],
    "tests": ["tests/routes/test_graph_routes.py", "tests/db/test_query.py"],
    "notes": [
      ("No validation, no bounds, no 404", "id is passed to <code>int(id.replace('b',''))</code> — a non-numeric id raises ValueError and Flask returns a 500, and an id for a bubble that does not exist returns an empty subgraph with a 200. Compare /select, which catches ValueError and answers 404."),
    ],
    "invariants": [
      ("Popping a segment must return an empty payload, not an error", "The <code>id.startswith('s')</code> early return is what lets the frontend call /pop on anything clickable without asking what it is first. Asserted by tests/db/test_pop_links.py::test_segment_pop_returns_empty."),
    ],
    "sub": [],
  },
  {
    "id": "subgraph", "name": "4 · Assembling the child subgraph — SERVER",
    "timing_key": "pop_subgraph",
    "fns": [("pangyplot/db/indexes/BubbleIndex.py", "get_popped_subgraph")],
    "gist": "Collect every descendant segment of the bubble, add its own source/sink, pull those segments and every link incident to them out of the indexes, and return them flat.",
    "inp": "bubble id, StepIndex",
    "out": "source_segs, sink_segs, Segment objects, Link objects",
    "artifacts": [],
    "checks": ["children_flattened", "no_self_links"],
    "tests": ["tests/db/test_pop_links.py", "tests/db/test_bubble_index.py"],
    "flag": True,
    "notes": [
      ("A pop expands the ENTIRE nesting hierarchy, not one level", "get_descendant_ids recurses through every child bubble, so popping a superbubble returns all of its descendants as bare segments — no child bubble ever comes back as a node. Measured on chrY b26524: 2,788 children, 14,286 segment nodes, 19,522 links, 7.8 MB, 0.86 s for one click. The 'collapsed child bubble' the frontend is written to expect (pop-handler's <code>node.type === 'bubble'</code> branch, BubbleObject.fromApiNode) is unreachable from /pop; BubbleObjects only ever arrive via /chain-graph and /detail-tiles."),
      ("The response carries full nucleotide sequence", "Segment.serialize emits <code>seq</code>, and get_by_ids does SELECT * — so every popped segment ships its bases. A 6-node pop of chrY b32423 is 2.79 MB, over 90% of it sequence. SegmentObject.fromApiNode does keep it, but nothing in the pop path reads it until a tooltip asks."),
      ("N+1 SQLite queries", "SegmentIndex.get_by_ids runs one SELECT per segment id and LinkIndex.get_links_by_segment resolves one row per link through get_link(). On b26524 that is ~14k segment SELECTs plus ~19k link SELECTs inside a single request."),
      ("Nothing tells the client how big a pop will be", "The bubble node /select returns has <code>size = len(inside)</code>. b26524 reports <b>size 1</b> and pops to 14,286 nodes. There is no cost estimate anywhere in the payload, so the viewer cannot warn or refuse."),
    ],
    "invariants": [
      ("Links are deliberately fetched the slow way", "pop_bubble calls get_subgraph without <code>fast=True</code>, while _bubbles_to_subgraph (/chain-graph) uses it. get_link_by_index_fast builds a Link from the in-memory arrays and drops haplotype, frequency and contained — exactly the three fields pop-handler copies onto every gfaLink for colouring and path highlight. Flipping pop to the fast path would silently blank link colours."),
      ("The returned links reach OUTSIDE the returned nodes, on purpose", "get_subgraph returns every link incident to a requested segment, including the ones landing on a neighbouring bubble's boundary segment (measured: 2 of 9 links on b32423, 4 of 19,522 on b26524). Those are what stitch a popped bubble to its unpopped neighbours — the frontend resolves them through the global registry, where the neighbour's boundary seg is already registered as some other SimObject's end. Filtering them out server-side because they look dangling would disconnect every pop from its chain."),
    ],
    "sub": [
      {"name": "Collect descendants", "timing_key": "pop_subgraph/descendants",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "get_descendant_ids")],
       "gist": "Recursively walk children, collecting every end segment and every inside segment of the whole subtree.",
       "cost": "Recursive, unbounded, and each child is fetched through BubbleIndex's FIFO cache — 2,788 child lookups on b26524."},
      {"name": "Fetch segments + links", "timing_key": "pop_subgraph/get_subgraph",
       "fns": [("pangyplot/db/indexes/GFAIndex.py", "get_subgraph")],
       "gist": "Materialize every collected segment out of segments.db and every link touching any of them, deduplicated by link id.",
       "cost": "Where the time actually goes: one SQLite round trip per segment and per link."},
      {"name": "Serialize", "timing_key": "pop_subgraph/serialize",
       "fns": [("pangyplot/objects/Segment.py", "serialize"),
               ("pangyplot/objects/Link.py", "serialize")],
       "gist": "Segments become nodes ('s'-prefixed, with seq), links become {source, target, from_strand, to_strand, haplotype, frequency, contained} — the exact shape pop-handler reads.",
       "cost": "The sequence copy happens here, and again in jsonify."},
    ],
  },
  {
    "id": "split", "name": "5 · Splitting the polychain container — BROWSER",
    "timing_key": None,
    "fns": [("pangyplot/static/js/graph/detail/model/polychain-container.js", "splitAtBubble"),
            ("pangyplot/static/js/graph/detail/model/polychain-segment.js", "splitAt")],
    "gist": "The chain the bubble sits on is cut at its t: the covering PolychainSegment is replaced by a left and a right segment with new inner anchors, and the bubble's range is marked popped so it stops being drawn and stops being hit-testable.",
    "inp": "bubbleId, t, source_segs, sink_segs (from /pop)",
    "out": "{leftSegment, rightSegment, removedSegment, newAnchors, materializeHead, materializeTail}",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/graph/polychain-model.test.js"],
    "notes": [
      ("mergeAtBubble is dead code", "PolychainContainer has a full merge-back implementation and nothing calls it — unpop rebuilds the container by hand in bubble-unpop-adapter instead. Two inverse implementations of splitAtBubble exist; only the untested-in-isolation one runs."),
    ],
    "invariants": [
      ("Outer anchors are reused, not recreated", "splitAt hands the old segment's headAnchor to the left half and its tailAnchor to the right half, and only the two <em>inner</em> anchors are new — that is why <code>newAnchors</code> is returned separately. Every link that already pointed at the chain's ends keeps pointing at the same d3 node objects across the split, so nothing outside the split has to be rewired."),
      ("An empty split side is not an empty segment — it is materialized", "If one side has no remaining unpopped bubbles, splitAtBubble returns null for that segment and lists its boundary segs in materializeHead/materializeTail. The caller then replaces the anchor with a real SegmentObject and destroys the anchor's links (saving their metadata for undo). Returning a zero-length PolychainSegment instead would leave an anchor pinned on top of the popped content."),
    ],
    "sub": [],
  },
  {
    "id": "children", "name": "6 · Response nodes become SimObjects — BROWSER",
    "timing_key": None,
    "fns": [("pangyplot/static/js/graph/detail/model/segment-object.js", "fromApiNode"),
            ("pangyplot/static/js/graph/detail/model/bubble-object.js", "fromApiNode")],
    "gist": "Every node that is not a boundary seg becomes a SimObject: segments become kinked SegmentObjects (their physics nodes are the kinks), bubbles would become BubbleObjects — though /pop never sends any. Each object registers its head and tail segs in the segment registry.",
    "inp": "apiData.nodes minus source_segs/sink_segs",
    "out": "SimObjects in model-manager, ends in the registry, physics nodes not yet in the sim",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/graph/sim-object.test.js"],
    "notes": [],
    "invariants": [
      ("Only ENDS go in the registry — interiors are invisible to the link system", "SegmentRegistry maps segId → SimObject for exposed ends only. A segment hidden inside a BubbleObject is not registered, so a GFA link pointing at it resolves to null and is dropped — which is exactly how a collapsed bubble hides its internals without anyone filtering links. If you register interiors 'so links resolve', collapsed bubbles start sprouting links into segments that are not drawn."),
      ("Registry is last-write-wins, and pop-handler compensates rather than fixes it", "Adjacent bubbles share boundary segments, so registering both siblings' ends overwrites one claim. pop-handler builds its own segId → [objects] multi-map purely to detect deletion links, and deliberately leaves the registry single-valued: link resolution wants exactly one owner per exposed seg."),
    ],
    "sub": [],
  },
  {
    "id": "links", "name": "7 · Resolving GFA links to force nodes — BROWSER",
    "timing_key": None,
    "fns": [("pangyplot/static/js/graph/detail/model/segment-registry.js", "resolveForLink"),
            ("pangyplot/static/js/graph/detail/model/sim-object.js", "_matchLink"),
            ("pangyplot/static/js/graph/detail/model/segment-object.js", "resolveEnd")],
    "gist": "The backend sends pure segment→segment GFA links. Each endpoint is looked up in the registry, and the owning SimObject decides which of its d3 nodes the link actually lands on — strand-aware. Links whose endpoints resolve to nothing are dropped.",
    "inp": "apiData.links (s→s, with strands)",
    "out": "d3 links between iids, plus synthetic deletion links for head→tail GFA links",
    "artifacts": [],
    "checks": ["links_touch_subgraph", "external_links"],
    "tests": ["tests/graph/sim-object.test.js", "tests/db/test_pop_links.py"],
    "notes": [],
    "invariants": [
      ("Source and target read the strand in OPPOSITE directions", "resolveEnd: as a link's <em>source</em>, '+' means it leaves from the tail kink and '-' from the head; as its <em>target</em>, '+' means it arrives at the head and '-' at the tail. The mirroring is what makes a reverse-strand link land on the right end of a kinked segment. Both SegmentObject and BubbleObject implement the same rule, and sim-object.test.js pins all four cases — 'simplifying' one side to match the other silently reverses every '-' link."),
      ("A link is resolved once, through the object that owns the seg", "resolveForLink never touches d3 nodes directly — it defers to the SimObject, so a segment can change its physical representation (one kink, twenty kinks, an anchor, a bubble circle) without a single link-resolution site changing. This is the whole point of the SimObject indirection."),
    ],
    "sub": [],
  },
  {
    "id": "sim", "name": "8 · Into the force simulation — BROWSER", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/detail/engines/force-engine.js", "insertPoppedContent"),
            ("pangyplot/static/js/graph/detail/data/pop-tree.js", "PopTree.register")],
    "gist": "New anchors, materialized boundary nodes, child kinks and every resolved link are pushed into d3 in a single batch, the sim is reheated to alpha 1, and the undo entry — the removed segment, the removed anchors, the destroyed links' metadata, and everything added — is recorded in the PopTree.",
    "inp": "newAnchors + child physics nodes + kink links + gfa links",
    "out": "a running simulation containing the popped subgraph; one PopTree entry",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "notes": [
      ("The PopTree hierarchy is never actually built", "pop-handler calls <code>popTree.register(bubbleId, chainId, null, entry)</code> — parentBubbleId is hard-coded null at every call site. So every pop is a root, depth is always 0, and getParent/getChildren/getDepth always answer 'none'. Undo still works, because it only uses the LIFO stack. The tree is the part of PopTree that does nothing."),
      ("Every pop re-seeds the whole simulation", "insertPoppedContent rebuilds the node and link arrays with spread copies and calls <code>sim.alpha(1).restart()</code>. Popping a chain's bubbles one by one (popAllBubblesOnChain) does this once per bubble, each time over the entire simulation."),
    ],
    "invariants": [
      ("Nodes and links must enter d3 in ONE call", "pop-handler collects newAnchors, deferred materialized nodes, child kinks, kink links and gfa links and makes a single insertPoppedContent call. d3's link force resolves a link's string endpoints against the current node array — inserting links whose nodes are not in the sim yet throws mid-tick. The batching is not a micro-optimization; it is the correctness condition."),
      ("Popped children spawn ON the bubble circle, then fall out to their ODGI layout", "Their real layout coords are stashed as homeX/homeY (what the layout force pulls toward) and their x/y are set to the bubble's position with a 0.15 squish. Spawning them at their true coords instead makes a pop look like a teleport, and spawning them all at one point makes the charge force explode."),
    ],
    "sub": [],
  },
  {
    "id": "unpop", "name": "9 · Undo (Ctrl+Z) — BROWSER", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/detail/data/bubble-unpop-adapter.js", "unpopLastBubble"),
            ("pangyplot/static/js/graph/detail/data/pop-tree.js", "undoLast"),
            ("pangyplot/static/js/graph/detail/engines/force-engine.js", "removePoppedContent")],
    "gist": "The last pop entry is taken off the LIFO stack and reversed with the objects it saved: added nodes removed from the sim, added objects forgotten, the removed PolychainSegment pushed back into the container and re-registered, its anchors re-added, and the links that materialization destroyed rebuilt from saved metadata against the restored anchors.",
    "inp": "popTree.undoLast()",
    "out": "the container as it was before the pop",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "notes": [
      ("Undo is untested", "There is no pytest or vitest file covering unpopLastBubble, and it is the most stateful function in the viewer: it mutates the container's segment array, the registry, the model store and the d3 simulation, in that order, and any one of them left half-restored is only visible as a rendering artifact."),
      ("Undo is strictly LIFO and ignores the tree", "undoLast pops the stack, so Ctrl+Z after popping bubbles on two different chains undoes them in click order, not per chain. Nothing can undo a specific pop."),
    ],
    "invariants": [
      ("Undo forgets objects, it does not destroy them", "forgetObject drops the object from the model store WITHOUT unregistering its segment ends — destroy() would unregister segs that neighbouring siblings and the restored PolychainSegment still claim. The restored segment then re-registers its own ends, last-write-wins, and the registry lands back where it started."),
      ("Anchor ownership has to be handed back explicitly", "splitAt re-pointed the old anchors' <code>simObject</code> at the split halves. Restoring the segment without resetting headAnchor.simObject / tailAnchor.simObject leaves the anchors owned by segments that are no longer in the container, and every link that resolves through them lands on a dead object."),
    ],
    "sub": [],
  },
]


# ---------------------------------------------------------------------------
# Contexts: boot the real app, /select a real region, pop real bubbles
# ---------------------------------------------------------------------------

def _pick_bubbles(app, client, chrom, start, end):
    """Two real bubbles out of a real /select: the cheapest and the worst."""
    r = rt.timed(client, f"/select?genome={GENOME}&chromosome={chrom}&start={start}&end={end}", n=1)
    if not r["json"] or not r["json"].get("nodes"):
        return None, []
    bidx = app.bubble_index[chrom]
    scored = []
    for n in r["json"]["nodes"]:
        if not str(n["id"]).startswith("b"):
            continue
        b = bidx[int(str(n["id"])[1:])]
        if b is None:
            continue
        scored.append((len(bidx.get_descendant_ids(b)), str(n["id"]), b))
    if not scored:
        return r, []
    scored.sort()
    picks = [scored[0], scored[-1]]
    if picks[0][1] == picks[1][1]:
        picks = picks[:1]
    return r, picks


def _probe(payload, bubble, bidx):
    """Assert the popped subgraph really is the bubble it came from."""
    out = {}

    def rec(k, ok, detail):
        out[k] = {"ok": bool(ok), "detail": detail, "weak": False}

    src, snk = payload["source_segs"], payload["sink_segs"]
    rec("boundaries_match",
        src == bubble.source_segments and snk == bubble.sink_segments,
        f"source {src} / sink {snk} == the bubble's own boundary segments")

    node_ids = {str(n["id"]) for n in payload["nodes"]}
    missing = [s for s in src + snk if f"s{s}" not in node_ids]
    rec("boundaries_in_nodes", not missing,
        "every boundary seg is also a node (the frontend materializes them from these)"
        if not missing else f"missing from nodes: {missing}")

    want = {f"s{s}" for s in bidx.get_descendant_ids(bubble)} | {f"s{s}" for s in src + snk}
    types = {n["type"] for n in payload["nodes"]}
    rec("children_flattened", want == node_ids and types <= {"segment"},
        f"{len(node_ids):,} nodes = every descendant segment of the subtree, "
        f"0 bubble nodes ({len(bubble.children):,} child bubbles were flattened away)")

    selfies = [l for l in payload["links"] if l["source"] == l["target"]]
    rec("no_self_links", not selfies, f"0 self-links in {len(payload['links']):,}")

    outside = [l for l in payload["links"]
               if l["source"] not in node_ids or l["target"] not in node_ids]
    orphan = [l for l in outside
              if l["source"] not in node_ids and l["target"] not in node_ids]
    rec("links_touch_subgraph", not orphan,
        f"every one of {len(payload['links']):,} links has at least one endpoint in the response")
    rec("external_links", True,
        f"{len(outside):,} links reach outside it — the joins to neighbouring bubbles, "
        f"resolved client-side through the registry")
    return out


def _measure(app, client, chrom, bubble_id, bubble):
    """Time the pop three ways: over HTTP, through query, and inside the index."""
    import pangyplot.db.query as query

    url = f"/pop?id={bubble_id}&genome={GENOME}&chromosome={chrom}"
    http = rt.timed(client, url, n=3)
    if http["status"] != 200 or not http["json"]:
        return None, None, None

    with app.app_context():
        t0 = time.perf_counter()
        query.pop_bubble(app, bubble_id, GENOME, chrom)
        q_s = time.perf_counter() - t0

    bidx = app.bubble_index[chrom]
    stepidx = app.step_index[(chrom, GENOME)]
    gfaidx = app.gfa_index[chrom]

    t0 = time.perf_counter()
    segs = bidx.get_descendant_ids(bubble)
    segs.update(bubble.source_segments + bubble.sink_segments)
    d_s = time.perf_counter() - t0

    t0 = time.perf_counter()
    segments, links = gfaidx.get_subgraph(segs, stepidx)
    g_s = time.perf_counter() - t0

    t0 = time.perf_counter()
    [s.serialize() for s in segments]
    [l.serialize() for l in links]
    ser_s = time.perf_counter() - t0

    T = {
        "total": {"s": http["s"], "gb": None},
        "pop_http": {"s": http["s"], "gb": None},
        "pop_query": {"s": q_s, "gb": None},
        "pop_subgraph": {"s": d_s + g_s + ser_s, "gb": None},
        "pop_subgraph/descendants": {"s": d_s, "gb": None},
        "pop_subgraph/get_subgraph": {"s": g_s, "gb": None},
        "pop_subgraph/serialize": {"s": ser_s, "gb": None},
    }
    return http, T, _probe(http["json"], bubble, bidx)


def _line(chrom, bubble_id, bubble, http, select):
    p = http["json"]
    seq = sum(len(n.get("seq") or "") for n in p["nodes"])
    frac = 100 * seq / max(http["bytes"], 1)
    return (
        f'<span class="num">{bubble_id}</span> on {chrom} — '
        f'{len(bubble.children):,} child bubbles, {len(bubble.inside):,} inside segs, '
        f'popped in <b class="num">{http["s"] * 1000:.0f} ms</b> → '
        f'<b class="num">{len(p["nodes"]):,}</b> nodes, '
        f'<b class="num">{len(p["links"]):,}</b> links, '
        f'<b class="num">{human(http["bytes"])}</b> '
        f'(<span class="warn">{frac:.0f}% of it nucleotide sequence</span>) · '
        f'the /select that offered this bubble took {select["s"] * 1000:.0f} ms '
        f'and called it "size {len(bubble.inside)}"'
    )


def contexts():
    if (DB, REGION[0]) not in rt.datasets():
        return {}
    boot = rt.boot(DB, ref=GENOME)
    if boot["error"] or not boot["client"]:
        return {}

    app, client = boot["app"], boot["client"]
    chrom, start, end = REGION
    select, picks = _pick_bubbles(app, client, chrom, start, end)
    if not picks:
        return {}

    out = {}
    for desc, bubble_id, bubble in picks:
        http, T, probe = _measure(app, client, chrom, bubble_id, bubble)
        if http is None:
            continue
        kind = "leaf" if not bubble.children else f"superbubble ×{len(bubble.children):,}"
        label = f"{bubble_id} · {kind} · {desc:,} segs"
        out[label] = {"line": _line(chrom, bubble_id, bubble, http, select),
                      "timings": T, "probe": probe, "artifacts": {}}
    return out


PANELS = [
  {"cls": "flag", "title": "Where the boundary falls",
   "paras": [
     (None, "Nine stages, one network call. Stages 1-2 and 5-9 run in the browser; only "
            "stages 3-4 run on the server, and they are the simple ones: a route with no "
            "validation and an index walk with no streaming. Everything difficult — "
            "container splitting, boundary materialization, strand-aware link resolution, "
            "batched insertion into a live force simulation, and undo — happens after the "
            "response lands, inside a single 340-line function."),
     ("The contract across it:", "The server speaks pure GFA: segment ids, segment→segment "
      "links, real strands. It knows nothing about anchors, kinks, containers or iids. The "
      "browser owns every visual identity, and the segment registry is the only place the "
      "two vocabularies meet. That separation is why the same /pop response can be consumed "
      "by a chain that is drawn as a polyline and by one that is fully exploded."),
   ]},
  {"cls": "resume", "title": "What a pop is allowed to cost",
   "paras": [
     (None, "The one number nobody bounds. /select advertises a bubble's <code>size</code> as "
            "<code>len(inside)</code> — the segments directly inside it, not counting its "
            "children's. chrY's b26524 advertises size 1 and pops into 14,286 nodes and "
            "19,522 links: 7.8 MB over the wire, 0.86 s of SQLite, and one "
            "<code>sim.alpha(1).restart()</code> over the whole simulation."),
     ("If you fix one thing here:", "make /pop expand one level — return child bubbles as "
      "bubble nodes instead of recursing to the leaves. The frontend already has the code "
      "path (BubbleObject.fromApiNode, the <code>node.type === 'bubble'</code> branch in "
      "pop-handler); it is simply never reached, because get_descendant_ids flattens the "
      "whole subtree first. /chain-graph already does exactly this, in _bubbles_to_subgraph."),
   ]},
]
