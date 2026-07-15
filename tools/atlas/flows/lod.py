"""Flow — the LOD transition: what a zoom gesture actually does.

One wheel event changes `state.zoom`. Everything else on this page follows from
that: a grid size is derived from the new viewport, a precomputed skeleton level
is picked to match it, and — below a threshold — the live detail layer is faded
in over the top. The skeleton half is a mipmap built once by `pangyplot add`; the
detail half is (almost always) a client-side slice of a blob fetched once per
chromosome. Only the server half can be timed; the client half is read, not run.
"""

import gzip
import json
import os
import re
import sys

from core import ROOT, human

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _runtime  # noqa: E402

SLUG = "lod"
NAME = "LOD transition"
TITLE = "The LOD transition — skeleton ⇄ detail"
SUB = ("A wheel event lands on the canvas. The viewer re-derives a target grid size, picks a "
       "precomputed skeleton level to match, and — below a hard threshold — fades in the live "
       "detail layer. Five stages, in the order a zoom gesture runs them. The server half is "
       "probed live; the client half cannot be, and says so.")
CTX_LABEL = "chromosome"

# The two numbers this whole page turns on, read out of the source at build time
# rather than retyped here.
JS_STATE = "pangyplot/static/js/graph/state.js"
JS_LOD = "pangyplot/static/js/graph/engines/lod-engine.js"
PY_SKEL = "pangyplot/preprocess/skeleton/skeleton_pipeline.py"


def _src(rel):
    return open(os.path.join(ROOT, rel), encoding="utf-8").read()


def _num(rel, rx):
    m = re.search(rx, _src(rel))
    return float(m.group(1)) if m else None


def constants():
    """Every LOD constant, pulled out of the source it actually lives in."""
    return {
        "enter": _num(JS_STATE, r"DETAIL_GRID_THRESHOLD:\s*(\d+)"),
        "exit": _num(JS_STATE, r"DETAIL_EXIT_THRESHOLD:\s*(\d+)"),
        "circles": _num(JS_STATE, r"BUBBLE_CIRCLE_GRID_THRESHOLD:\s*(\d+)"),
        "fade": _num(JS_STATE, r"FADE_DURATION:\s*(\d+)"),
        "js_div": _num(JS_LOD, r"viewportWidth\s*/\s*(\d+)"),
        "py_div": _num(PY_SKEL, r"extent\s*/\s*(\d+)"),
        "viewer_grids": [int(x) for x in re.search(
            r"VIEWER_GRID_SIZES\s*=\s*\[([^\]]+)\]", _src(PY_SKEL)).group(1).split(",")],
    }


C = constants()

STAGES = [
  {
    "id": "wheel", "name": "The wheel event", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/engines/navigation/pan-zoom-engine.js", "setupPanZoom")],
    "gist": ("One wheel notch multiplies state.zoom by 1.05 (or divides by it), re-anchors the pan "
             "so the point under the cursor stays put, pauses the force sim, and schedules a frame "
             "and a debounced detail fetch. Nothing about LOD is decided here."),
    "inp": "a `wheel` event on the canvas",
    "out": "state.zoom, state.panX/panY; a queued frame and a queued fetch",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "invariants": [
      ("The sim is paused for the whole gesture and resumed 150 ms after the last event",
       "pan-zoom-engine.js calls pauseForInteraction() on every wheel event and "
       "resumeAfterInteraction() at the end of the same handler — that looks like a no-op pair, but "
       "resumeAfterInteraction is a 150 ms debounce (RESUME_DELAY in force-interaction-gate.js) and "
       "pauseForInteraction cancels any pending resume. So a burst of wheel events keeps the "
       "simulation paused and only the last one gets to restart it. Remove the pause and a zoom over "
       "a popped region fights the force tick for the frame budget."),
    ],
    "notes": [],
    "sub": [],
  },
  {
    "id": "decide", "name": "Decide the level", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/engines/lod-engine.js", "updateLOD")],
    "gist": ("targetGridSize = (canvasCssWidth / zoom) / 2000 — layout units per grid cell if you "
             "want ~2000 cells across the viewport. currentLOD is then the COARSEST precomputed "
             "level whose gridSize is still ≤ that, falling back to level 0 when zoomed past the "
             "finest one."),
    "inp": "state.zoom, canvas width, the level list from /skeleton",
    "out": "state.targetGridSize (a float), state.currentLOD (an index)",
    "artifacts": [],
    "checks": ["grid_divisor"],
    "tests": [],
    "invariants": [
      ("targetGridSize is the ONLY LOD currency",
       f"Everything downstream is a comparison against it, in raw layout units: detail enters at "
       f"≤ {C['enter']:.0f} and exits at &gt; {C['exit']:.0f} (state.js), bubble circles appear at "
       f"≤ {C['circles']:.0f} × dataScale (polychain-render-manager.js), and the skeleton level is "
       f"the coarsest one ≤ it. There is no zoom-level integer, no ppbp gate, no budget. "
       f"ppbp exists — but only as a query parameter on the /detail-tiles fallback, computed at the "
       f"moment of the fetch and never used to decide anything on the client."),
    ],
    "notes": [
      ("The 2000 is hard-coded twice, on both sides of the wire",
       f"lod-engine.js divides the viewport width by <b>{C['js_div']:.0f}</b> to get the target grid "
       f"size. skeleton_pipeline.py <code>compute_grid_sizes</code> independently divides the layout "
       f"extent by <b>{C['py_div']:.0f}</b> to decide how fine the finest precomputed level needs to "
       f"be. They are the same number for the same reason — 'about 2000 cells across' — and neither "
       f"file mentions the other. Change one and the client will ask for a resolution the mipmap "
       f"does not have (it silently clamps to level 0, i.e. draws a coarser skeleton than the zoom "
       f"deserves) or the preprocessor will emit levels no client ever selects."),
      ("updateLOD runs on every frame, not on every zoom change",
       "render-manager.js calls updateLOD() at the top of draw(), and scheduleDetailFetch() calls it "
       "again inside its own debounce. It is a cheap linear scan over ~8-12 levels, so this is not "
       "expensive — but it does mean currentLOD can change without any fetch decision being made, "
       "and the fetch decision can be made against a targetGridSize the last painted frame never saw."),
    ],
    "sub": [],
  },
  {
    "id": "skeleton", "name": "The skeleton side", "timing_key": "skeleton_total",
    "fns": [("pangyplot/preprocess/skeleton/skeleton_pipeline.py", "export_binary"),
            ("pangyplot/static/js/graph/data/chromosome-loader.js", "loadChromosome"),
            ("pangyplot/static/js/graph/skeleton/render/skeleton-render-manager.js", "drawSkeleton")],
    "gist": ("A mipmap of the whole chromosome, built once by `add` and fetched once per "
             "chromosome. /skeleton is the gzipped JSON header (stats, chainMeta, one entry per "
             "grid level); /skeleton-bin is one gzipped blob of delta-encoded int32 coordinates "
             "for every level, back to back. Nothing here is per-viewport: zooming only changes "
             "which slice of an already-resident array is drawn."),
    "inp": "GET /skeleton + /skeleton-bin, once per chromosome",
    "out": "levels[] with decoded polylines + chainIds, bboxes, dataBounds",
    "artifacts": [
      ("skeleton/meta.json.gz", "gzip json", "levels[], stats, chainMeta, version"),
      ("skeleton/polylines.bin.gz", "binary", "pointCounts | chainIds | delta coords, per level"),
    ],
    "checks": ["levels", "bin_layout", "threshold_bracket"],
    "tests": ["tests/preprocess/test_skeleton_geometry.py"],
    "invariants": [
      ("The binary has no framing — the header is the only way to cut it up",
       "chromosome-loader.js <code>indexBinaryLevels</code> walks the buffer with a running offset, "
       "reading numPolylines×uint32 point counts, then numPolylines×int32 chain ids, then "
       "totalPoints×2×int32 coords, per level, in the order the levels appear in the JSON. There is "
       "no magic number, no per-level length prefix, no checksum. The <code>bin_layout</code> "
       "checkpoint on this stage recomputes that exact sum and compares it to the real file size — "
       "if the two files are ever written out of step, that is the only thing that will notice."),
      ("Levels are sorted ascending, and the client depends on it",
       "export_binary iterates <code>sorted(grid_cell_sizes)</code>, and updateLOD scans the level "
       "array from the END backwards, taking the first entry whose gridSize ≤ target. That search "
       "is only correct on an ascending list. compute_grid_sizes returns "
       "<code>sorted(extra) + VIEWER_GRID_SIZES</code> — correct today, and quietly load-bearing."),
    ],
    "notes": [
      ("The 'lazy decoder' is not lazy",
       "skeleton-decoder.js is titled 'Lazy decoder … called on first access to a level's polyline "
       "data' — but skeleton-init.js <code>initSkeleton</code> loops over EVERY level and calls "
       "decodeLevel on it at chromosome load, then precomputeBboxes() walks every level again to "
       "build a Float64Array of bboxes. So all 8-12 levels are inflated from packed int32 into JS "
       "arrays of [x, y] pairs (two objects per point) before the first frame, even though a session "
       "may only ever look at two of them. The typed-array representation is then dropped on the "
       "floor (`level._binCoords = null`)."),
    ],
    "sub": [
      {"name": "Choosing the grid sizes (preprocess)", "timing_key": None,
       "fns": [("pangyplot/preprocess/skeleton/skeleton_pipeline.py", "compute_grid_sizes")],
       "gist": f"Levels are the fixed ladder {C['viewer_grids']}, with finer levels from "
               f"[5, 10, 25, 50] prepended only when the layout is small enough that extent/2000 "
               f"falls below 100. Big chromosomes therefore start at grid 100; a small graph like "
               f"DRB1 gets extra fine levels underneath.",
       "cost": ""},
      {"name": "Simplifying (preprocess)", "timing_key": None,
       "fns": [("pangyplot/preprocess/skeleton/skeleton_geometry.py", "grid_simplify")],
       "gist": "Snap every point to the level's grid, dedupe the resulting edges, and re-trace "
               "minimal polylines through the collapsed graph. This is the only thing that makes a "
               "level cheaper than the one below it.",
       "cost": ""},
      {"name": "Serving it", "timing_key": "skeleton_meta",
       "fns": [("pangyplot/routes.py", "skeleton")],
       "gist": "Both skeleton routes are a file read and a Response with Content-Encoding: gzip — "
               "the bytes on disk are the bytes on the wire, never recompressed.",
       "cost": ""},
      {"name": "Loading it", "timing_key": "skeleton_bin",
       "fns": [("pangyplot/static/js/graph/data/chromosome-loader.js", "loadChromosome")],
       "gist": "Six parallel fetches at chromosome load: skeleton meta, skeleton bin, spine, "
               "polychain-data, genes, graph-meta. Everything the LOD machinery reads afterwards is "
               "already in memory.",
       "cost": ""},
      {"name": "Decoding it", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/data/skeleton-decoder.js", "decodeLevel")],
       "gist": "Delta-decode the int32 coords in place, then rebuild each polyline as an array of "
               "[x, y] pairs and free the binary views.",
       "cost": "Client-side — not measurable from a build script. Runs for every level, not the one "
               "in use."},
      {"name": "Drawing it", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/skeleton/render/skeleton-render-manager.js", "drawSkeleton")],
       "gist": "Cull the current level's polylines against the viewport bbox, then draw base + hover "
               "+ gene overdraw at skeletonOpacity.",
       "cost": ""},
    ],
  },
  {
    "id": "gate", "name": "The detail gate", "timing_key": "detail_total",
    "fns": [("pangyplot/static/js/graph/engines/detail-transition-engine.js", "scheduleDetailFetch"),
            ("pangyplot/static/js/graph/detail/data/polychain/polychain-fetcher.js", "fetchDetailForViewport")],
    "gist": (f"200 ms after the last pan/zoom event: recompute the LOD, then apply hysteresis — "
             f"enter detail at targetGridSize ≤ {C['enter']:.0f}, leave it at &gt; {C['exit']:.0f}, "
             f"hold whatever you have in between. Entering means filling the viewport (plus a "
             f"±100%-of-width margin) with chains — from the precomputed cache if there is one, "
             f"and only otherwise from /detail-tiles."),
    "inp": "state.targetGridSize, the layout viewport, the polychain cache",
    "out": "state.detailData (chains + junction graph), a fade-in",
    "artifacts": [
      ("polychain-data.json.gz", "gzip json", "the whole chromosome's chains — the fast path"),
    ],
    "checks": ["polychain_cache", "detail_tiles", "tile_agrees"],
    "tests": ["tests/db/test_polychain_index.py", "tests/db/test_chain_polyline.py",
              "tests/graph/spine-engine.test.js"],
    "invariants": [
      ("The exit threshold must sit strictly between two grid levels, and it does",
       f"Enter is {C['enter']:.0f} — which is itself one of VIEWER_GRID_SIZES. Exit is "
       f"{C['exit']:.0f}, between the {C['enter']:.0f} and 1000 levels. That gap is the hysteresis "
       f"band: without it, a viewport sitting exactly on a level boundary would fetch and destroy "
       f"the entire detail layer on every stray wheel notch (see stage 5 — leaving detail is not a "
       f"cheap operation). The <code>threshold_bracket</code> checkpoint asserts the two constants "
       f"still bracket real, adjacent levels of the skeleton actually on disk."),
      ("The fetch is keyed on layout X only — never on bp, never on zoom",
       "fetchDetailForViewport's cache check is `vp.minX >= fetchedRegion.minX && vp.maxX <= "
       "fetchedRegion.maxX`. Zooming IN inside an already-fetched region is free: no fetch, no "
       "re-merge, no re-render of the chain set. Because the margin is a full viewport width on "
       "each side, that covers roughly a 3× zoom-out before the region misses."),
    ],
    "notes": [
      ("/detail-tiles is the fallback, not the path",
       "polychain-fetcher.js takes the cache branch whenever hasPolychainDataCache() is true, and "
       "that is true whenever polychain-data.json.gz exists and has ≥1 chain — which `add` writes "
       "for every chromosome it builds. The server route, its ppbp parameter, its junction-graph "
       "BFS and its bypass merge are only reached on a dataset where that file is missing or empty. "
       "/polychain-data returns `{}` with status 200 when the file is absent, so there is no error "
       "either — the viewer just silently starts making per-viewport server round-trips."),
      ("ppbp is computed, sent, and ignored",
       "The fallback URL carries &ppbp=…, computed from canvasWidth / (bpRight - bpLeft). "
       "query.get_detail_tile takes ppbp as a positional argument and never reads it. The same "
       "function documents that expand_threshold is 'accepted for API compatibility but ignored' — "
       "ppbp is in exactly the same position but isn't documented as such."),
      ("The cache scan is linear in the chromosome's chains",
       "getChainsInRange walks every chain in the cache on every debounced fetch and compares "
       "_pl_x_min/_pl_x_max — no bisect, no interval tree, even though the server-side "
       "PolychainIndex has precisely that structure (get_chains_in_layout_range does a bisect over "
       "sorted chain_x1 + a prefix-max array). The client threw the index away and kept the list."),
      ("state.FETCH_MARGIN is dead",
       "state.js declares FETCH_MARGIN: 0.2 and nothing in the codebase reads it. The margin that "
       "is actually applied is `const margin = vpWidth * 1.0` in polychain-fetcher.js, five times "
       "larger, with its own comment. Two numbers, one of them a lie."),
    ],
    "sub": [
      {"name": "Debounce + hysteresis", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/engines/detail-transition-engine.js", "scheduleDetailFetch")],
       "gist": f"One 200 ms timer, reset by every pan and wheel event. On fire: updateLOD, then the "
               f"{C['enter']:.0f}/{C['exit']:.0f} band decides fetch / exit / do-nothing.",
       "cost": ""},
      {"name": "Fast path: the cache", "timing_key": "polychain_data",
       "fns": [("pangyplot/static/js/graph/detail/data/polychain-data-cache.js", "getChainsInRange")],
       "gist": "The whole chromosome's chain decompositions were fetched once, at chromosome load. "
               "A 'detail fetch' is a filter over an array in memory.",
       "cost": "The timing here is the SERVER's /polychain-data — the once-per-chromosome cost the "
               "fast path pays up front, not the per-zoom cost (which is client-side and not "
               "measurable here)."},
      {"name": "Fallback: the server tile", "timing_key": "detail_tiles",
       "fns": [("pangyplot/routes.py", "detail_tiles"),
               ("pangyplot/db/query.py", "get_detail_tile")],
       "gist": "Only reached with no polychain cache. Bisects the PolychainIndex for chains "
               "overlapping the layout x-range, BFSes the junction graph between them, merges "
               "bypass segments, and clips junction segments to the viewport ±20%.",
       "cost": ""},
      {"name": "Merging into the live set", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/detail/data/polychain/polychain-fetcher.js", "fetchDetailForViewport")],
       "gist": "Incremental: chains already present are skipped, chains now fully outside the fetch "
               "window are removed from the polychain layer, the force graph and the view state; "
               "the junction graph is recomputed over the whole surviving set, not just the new "
               "viewport.",
       "cost": ""},
    ],
  },
  {
    "id": "fade", "name": "The crossfade", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/engines/detail-transition-engine.js", "updateDetailOpacity"),
            ("pangyplot/static/js/graph/engines/detail-transition-engine.js", "finishExit"),
            ("pangyplot/static/js/graph/render-manager.js", "draw")],
    "gist": (f"A real crossfade, not a swap: a {C['fade']:.0f} ms rAF-driven ramp of detailOpacity "
             f"0→1 against skeletonOpacity 1→0.06. Four phases: none → fading-in → static → "
             f"fading-out → none. The skeleton is never fully hidden while fading — it is floored "
             f"at 0.06 — and is only skipped entirely once the phase reaches `static`."),
    "inp": "detailPhase, performance.now()",
    "out": "state.detailOpacity / state.skeletonOpacity; on exit, no detail state at all",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/graph/polychain-model.test.js", "tests/graph/sim-object.test.js"],
    "invariants": [
      ("The fade is reversible mid-flight, and the maths is why",
       "beginFadeIn, when it catches a fade-OUT in progress, does not restart from zero — it "
       "back-dates fadeStartTime by detailOpacity × FADE_DURATION, so the ramp resumes from the "
       "opacity currently on screen. Zoom out and immediately back in and you get a continuous "
       "fade, not a flash. This is the only place the two directions share a clock."),
      ("`static` is what buys back the frame budget",
       "render-manager.js draw(): `skipSkeleton = !alwaysShowSkeleton && detailData && detailPhase "
       "=== 'static'`. Only in the settled phase does the skeleton layer stop being culled and drawn "
       "at all. During the fade both layers are painted every frame — that is the expensive "
       "600 ms, by design."),
    ],
    "notes": [
      ("Crossing the exit threshold destroys every popped bubble, silently",
       "finishExit() clears the pop tree, the model, the force engine, the detail view state and the "
       "fetched region, and nulls state.detailData. Pop a bubble, zoom out past targetGridSize "
       f"&gt; {C['exit']:.0f}, zoom back in: the region is re-fetched from scratch, unpopped. "
       "Nothing warns, nothing is persisted, and the undo history was already cleared by the first "
       "fetch (clearHistory() in polychain-fetcher.js). The hysteresis band is the ONLY thing "
       "standing between an idle wheel notch and losing an interactive session's work."),
      ("finishExit tears down through five dynamic imports",
       "The teardown is five `import(...).then(...)` calls, each returning a promise nobody awaits, "
       "while state.detailData is nulled synchronously on the next line. The clears therefore land "
       "in an unspecified order, after the state they are clearing has already been dropped. It "
       "works because each module's clear() is idempotent — not because anything sequences them."),
    ],
    "sub": [
      {"name": "Fading in", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/engines/detail-transition-engine.js", "beginFadeIn")],
       "gist": "Start (or reverse) the ramp. Called only when a fetch actually returned new data.",
       "cost": ""},
      {"name": "Ramping", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/engines/detail-transition-engine.js", "updateDetailOpacity")],
       "gist": f"Linear in t = elapsed / {C['fade']:.0f} ms, driven by its own rAF loop, terminating "
               f"in the `static` or `none` phase.",
       "cost": ""},
      {"name": "Painting both layers", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/render-manager.js", "draw")],
       "gist": "One canvas, two layers, drawn in order: skeleton (unless static), then gene halos, "
               "polychains, force graph and path trace at detailOpacity.",
       "cost": ""},
      {"name": "Fading out", "timing_key": None,
       "fns": [("pangyplot/static/js/graph/engines/detail-transition-engine.js", "exitDetailMode")],
       "gist": "Triggered from two places only: crossing the exit threshold, and any code that pans "
               "away entirely. Ends in finishExit(), which is a full teardown.",
       "cost": ""},
    ],
  },
]


# ---------------------------------------------------------------------------
# Contexts: boot the real app, request the real routes, read the real skeleton
# ---------------------------------------------------------------------------

def _chr_dir(db, chrom):
    return os.path.join(_runtime.DATA, "graphs", db, chrom)


def _gunzip_json(resp):
    return json.loads(gzip.decompress(resp.data))


def probe(client, db, chrom, ref):
    """Every checkpoint on this page, against a real chromosome."""
    out = {}

    def rec(k, ok, detail, weak=False):
        out[k] = _runtime.check(ok, detail, weak)

    # --- the skeleton header the client's LOD scan reads ---
    r = client.get(f"/skeleton?chromosome={chrom}")
    levels, raw = [], None
    if r.status_code == 200:
        try:
            raw = _gunzip_json(r)
            levels = raw.get("levels", [])
        except Exception as e:
            rec("levels", False, f"undecodable: {type(e).__name__}: {e}")
    if raw is None and "levels" not in out:
        rec("levels", False, f"/skeleton → {r.status_code}")

    grids = [lv["gridSize"] for lv in levels]
    if grids:
        st = raw.get("stats", {})
        rec("levels", grids == sorted(grids),
            f"{len(grids)} levels {grids[0]}–{grids[-1]}, ascending"
            f" · {st.get('runCount', '?'):,} runs from {st.get('totalSegments', '?'):,} segments"
            f" · built by {raw.get('meta', {}).get('version', '?')}")

    # --- the binary the client slices with nothing but that header ---
    rb = client.get(f"/skeleton-bin?chromosome={chrom}")
    if rb.status_code == 200 and levels:
        blob = gzip.decompress(rb.data)
        want = sum(lv["numPolylines"] * 4 + lv["numPolylines"] * 4
                   + lv["totalPoints"] * 2 * 4 for lv in levels)
        rec("bin_layout", want == len(blob),
            f"header predicts {human(want)}, blob is {human(len(blob))}"
            + ("" if want == len(blob) else " — indexBinaryLevels would read past the end"))
    else:
        rec("bin_layout", False, f"/skeleton-bin → {rb.status_code}")

    # --- do the client's thresholds land where the skeleton has levels? ---
    if grids:
        enter, exitv = C["enter"], C["exit"]
        below = [g for g in grids if g <= enter]
        above = [g for g in grids if g > exitv]
        ok = bool(below) and bool(above) and enter in grids and not [
            g for g in grids if enter < g <= exitv]
        rec("threshold_bracket", ok,
            f"enter {enter:.0f} (a real level: {enter in grids}), exit {exitv:.0f}; "
            f"no level sits inside the hysteresis band: "
            f"{not [g for g in grids if enter < g <= exitv]}; "
            f"{len(below)} levels below enter, {len(above)} above exit")

    # --- the constant that is written down twice ---
    rec("grid_divisor", C["js_div"] == C["py_div"],
        f"lod-engine.js divides by {C['js_div']:.0f}, "
        f"skeleton_pipeline.py divides by {C['py_div']:.0f}"
        + (" — agree" if C["js_div"] == C["py_div"] else " — DISAGREE"))

    # --- the fast path ---
    rp = client.get(f"/polychain-data?chromosome={chrom}")
    pd = _gunzip_json(rp) if rp.status_code == 200 and rp.data[:2] == b"\x1f\x8b" else {}
    n_chains = len(pd.get("chains", []) or [])
    rec("polychain_cache", n_chains > 0,
        f"{n_chains:,} chains cached client-side ({human(len(rp.data))} on the wire) — "
        f"/detail-tiles is never called for this chromosome"
        if n_chains else "empty — the viewer would fall back to per-viewport /detail-tiles")

    # --- the fallback, exercised anyway ---
    xs = [c["_pl_x_min"] for c in (pd.get("chains") or []) if c.get("_pl_x_min") is not None]
    xe = [c["_pl_x_max"] for c in (pd.get("chains") or []) if c.get("_pl_x_max") is not None]
    tile = None
    if xs and xe:
        lo, hi = min(xs), max(xe)
        mid = (lo + hi) / 2
        span = (hi - lo) / 20 or 1.0
        q = (f"/detail-tiles?genome={ref}&chromosome={chrom}&start=0&end=1000000"
             f"&ppbp=0.001&layout_min_x={mid - span:.1f}&layout_max_x={mid + span:.1f}")
        tile = _runtime.timed(client, q, n=2)
        j = tile.get("json") or {}
        tc = len(j.get("chains", []) or [])
        jg = j.get("junction_graph", {}) or {}
        rec("detail_tiles", tile["status"] == 200 and tc > 0,
            f"{tc} chains, {len(jg.get('nodes', []) or [])} junction nodes, "
            f"{len(jg.get('links', []) or [])} junction links, {human(tile['bytes'])} "
            f"for a 5%-wide layout window")

        # Do the two paths agree on what is in that window?
        want_ids = {c["id"] for c in (pd.get("chains") or [])
                    if c.get("_pl_x_max") is not None
                    and c["_pl_x_max"] >= mid - span and c["_pl_x_min"] <= mid + span}
        got_ids = {c["id"] for c in (j.get("chains", []) or [])}
        rec("tile_agrees", bool(want_ids) and want_ids == got_ids,
            f"cache slice {len(want_ids)} chains vs server tile {len(got_ids)} chains — "
            + ("identical id sets" if want_ids == got_ids
               else f"differ: {len(want_ids ^ got_ids)} ids in only one of them"))

    return out, tile


def contexts():
    out = {}
    for db, chrom in _runtime.datasets():
        d = _chr_dir(db, chrom)
        if not os.path.exists(os.path.join(d, "skeleton", "meta.json.gz")):
            continue
        b = _runtime.boot(db)
        if b["error"] or not b["client"]:
            out[f"{db}/{chrom}"] = {
                "line": f'<span class="warn">app failed to boot: {b["error"]}</span>',
                "timings": {}, "probe": {}, "artifacts": {}}
            continue
        c = b["client"]
        ref = b["ref"]

        T = {}
        for key, url in (
            ("skeleton_meta", f"/skeleton?chromosome={chrom}"),
            ("skeleton_bin", f"/skeleton-bin?chromosome={chrom}"),
            ("polychain_data", f"/polychain-data?chromosome={chrom}"),
        ):
            r = _runtime.timed(c, url, n=3)
            if r["s"] is not None:
                T[key] = {"s": r["s"], "gb": None}

        try:
            pr, tile = probe(c, db, chrom, ref)
        except Exception as e:
            print(f"  probe failed for {db}/{chrom}: {type(e).__name__}: {e}", file=sys.stderr)
            continue

        if tile and tile.get("s") is not None:
            T["detail_tiles"] = {"s": tile["s"], "gb": None}
        T["skeleton_total"] = {
            "s": T.get("skeleton_meta", {}).get("s", 0) + T.get("skeleton_bin", {}).get("s", 0),
            "gb": None}
        if "detail_tiles" in T or "polychain_data" in T:
            T["detail_total"] = {"s": max(T.get("detail_tiles", {}).get("s", 0),
                                          T.get("polychain_data", {}).get("s", 0)), "gb": None}

        arts = {}
        for st in STAGES:
            for name, _k, _n in st["artifacts"]:
                p = os.path.join(d, name)
                arts[name] = [os.path.exists(p),
                              human(os.path.getsize(p)) if os.path.exists(p) else None]

        sk = human(os.path.getsize(os.path.join(d, "skeleton", "polylines.bin.gz")))
        out[f"{db}/{chrom}"] = {
            "line": (f'<span class="num">{db}/{chrom}</span> — served by a real booted app '
                     f'(boot {b["boot_s"]:.1f}s). Skeleton binary <b class="num">{sk}</b> on the '
                     f'wire, gzip, straight off disk. '
                     f'<span class="warn">Only the server half of this flow can be timed: the '
                     f'wheel handler, updateLOD, the decode, the cache slice and the 600 ms fade '
                     f'all run in the browser and are NOT measured here — those stages show no '
                     f'time on purpose.</span>'),
            "timings": T, "probe": pr, "artifacts": arts}
    return out


PANELS = [
  {"cls": "flag", "title": "Every number on this page, and where it lives",
   "paras": [
     ("The currency.", f"<code>targetGridSize = (canvasCssWidth / zoom) / {C['js_div']:.0f}</code> "
      f"— lod-engine.js. Layout units per grid cell at ~{C['js_div']:.0f} cells across the viewport. "
      f"Every other decision is a comparison against this one float."),
     ("The level.", f"The coarsest precomputed level with gridSize ≤ targetGridSize. Levels are "
      f"{C['viewer_grids']} plus, on small graphs only, finer levels from [5, 10, 25, 50] — "
      f"skeleton_pipeline.py <code>compute_grid_sizes</code>."),
     ("The gate.", f"Detail enters at targetGridSize ≤ <b>{C['enter']:.0f}</b>, exits at "
      f"&gt; <b>{C['exit']:.0f}</b> — state.js DETAIL_GRID_THRESHOLD / DETAIL_EXIT_THRESHOLD. "
      f"Bubble circles appear separately at ≤ <b>{C['circles']:.0f} × dataScale</b>. Note the "
      f"asymmetry: the circle gate is scaled by the dataset's median link distance, the detail gate "
      f"is not — so on a graph laid out at a different scale, detail activation moves and the "
      f"circles inside it don't."),
     ("The fade.", f"<b>{C['fade']:.0f} ms</b> linear, both directions, skeleton floored at 0.06 "
      f"alpha — state.js FADE_DURATION. The debounce ahead of it is 200 ms; the force-sim resume "
      f"debounce behind it is 150 ms."),
   ]},
  {"cls": "resume", "title": "What is NOT here",
   "paras": [
     ("No ppbp gate.", "The name suggests pixels-per-basepair drives the LOD. It does not. ppbp is "
      "computed once, inside the /detail-tiles fallback, purely to fill a query parameter that "
      "query.get_detail_tile then ignores. The reference spine (bp ⇄ layout) is needed to build the "
      "fetch URL and to place genes — not to choose a level."),
     ("No tile cache, no eviction.", "There is no tile grid and nothing is evicted by age or size. "
      "There is exactly one <code>fetchedRegion</code> — a single layout x-interval — and one live "
      "<code>state.detailData</code>. A fetch whose viewport falls inside that interval is skipped "
      "entirely; a fetch outside it removes the chains that fell out of the new window and adds the "
      "ones that fell in. Zooming out past the exit threshold throws the whole thing away."),
     ("No budget.", "The multi-resolution notes describe a budget-based activation. The code has a "
      "threshold, not a budget: nothing counts nodes, chains or bubbles before deciding to enter "
      "detail. The only count-sensitive behaviour is the viewport culling inside each renderer."),
   ]},
]
