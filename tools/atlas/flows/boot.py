"""Flow — browser boot: from GET / to the first frame on the canvas.

This is the frontend half of the atlas. There is no server to instrument here,
so nothing on this page is timed. What CAN be checked without a browser is
whether the page could boot at all: the module scripts the template names, every
import-map alias, and the whole transitive static import graph reachable from the
entry modules. A single mistyped import path is a blank canvas with one line in
the console and nothing in CI to catch it — so that is what the checkpoints on
this page actually verify, at build time, by walking the imports themselves.
"""

import os
import re

from core import ROOT

SLUG = "boot"
NAME = "first paint"
TITLE = "browser boot — <code>GET /</code> to the first frame"
SUB = ("Flask renders one template; the browser evaluates one module graph; the viewer "
       "issues six fetches in parallel and paints once. Every function links into your "
       "editor. Nothing here is timed — the checkpoints instead walk the static import "
       "graph, which is the thing that actually breaks a boot.")
CTX_LABEL = "page"

TEMPLATE = "pangyplot/templates/index.html"
LOADER = "pangyplot/static/js/graph/data/chromosome-loader.js"

STAGES = [
  {
    "id": "serve_page", "name": "Serve the page",
    "fns": [("pangyplot/routes.py", "index")],
    "gist": "Flask renders index.html. Nothing about the graph is server-rendered — the "
            "template's whole job is to declare the import map, the canvas element, and two "
            "module script tags.",
    "inp": "GET /",
    "out": "index.html — importmap in <head>, d3 + __APP_CONFIG + two module scripts at the end of <body>",
    "artifacts": [],
    "checks": ["entry_modules", "import_map", "classic_before_modules"],
    "tests": [],
    "notes": [
      ("<code>index()</code> passes <code>genome</code>, but every other template variable "
       "arrives by context processor",
       "routes.py:41 renders with <code>genome=current_app.genome</code> only. "
       "<code>version</code>, <code>version_name</code>, <code>debug_mode</code> and "
       "<code>organism</code> — all of which the template dereferences unguarded — come from "
       "four separate <code>@bp.context_processor</code> hooks (routes.py:56–80). "
       "<code>inject_organism</code> reads <code>current_app.cytoband[\"organism\"]</code>, so an "
       "app object assembled without that attribute renders a 500 on the index route and "
       "nowhere else."),
    ],
    "invariants": [
      ("The import map must be parsed before the first module script, and there may be only one",
       "index.html:30 puts <code>&lt;script type=\"importmap\"&gt;</code> in the <code>&lt;head&gt;</code>; "
       "the module entries are at index.html:315–316, at the foot of the <code>&lt;body&gt;</code>. "
       "The browser rejects an import map that appears after module resolution has begun, and "
       "rejects a second one outright. Every <code>@ui/</code>, <code>@event-bus</code>, "
       "<code>@app-state</code>, <code>@color-utils</code>, <code>@format-utils</code>, "
       "<code>@graph-data/</code> and <code>@debug/</code> specifier in the tree resolves through it."),
      ("<code>window.__APP_CONFIG</code> and <code>window.d3</code> are set by classic scripts, "
       "and that is load-bearing",
       "index.html:286–287 loads d3 as a plain script and index.html:288 assigns "
       "<code>__APP_CONFIG</code> inline. Classic non-async scripts run during parsing; "
       "<code>type=\"module\"</code> is implicitly deferred, so it runs after. That ordering is the "
       "only reason <code>app-state.js</code> and <code>state.js</code> can read "
       "<code>window.__APP_CONFIG</code> at module-evaluation time, and the only reason "
       "<code>force-engine.js</code> can reference the bare global <code>d3</code>. Add "
       "<code>defer</code>, <code>async</code> or <code>type=\"module\"</code> to either of those tags "
       "and both assumptions break."),
    ],
    "sub": [],
  },
  {
    "id": "module_eval", "name": "Evaluate the module graph",
    "fns": [("pangyplot/static/js/app-state.js", "isDebugMode"),
            ("pangyplot/static/js/graph/utils/frame-scheduler.js", "setDrawCallback"),
            ("pangyplot/static/js/graph/render-manager.js", "draw")],
    "gist": "Before a single line of app.js runs, the browser has fetched and evaluated the "
            "whole static import graph beneath it, depth-first in import order. The singletons "
            "(state, event-bus, colorState) and every side-effect import (render-manager's "
            "setDrawCallback, the four debug views, the debug status bar's event subscription) "
            "are already in place.",
    "inp": "js/graph/color/color-manager.js, then js/graph/app.js",
    "out": "every module evaluated exactly once; state.dom populated; draw() registered",
    "artifacts": [],
    "checks": ["import_graph", "no_bare_specifiers"],
    "tests": ["tests/ui/coordinate-events.test.js", "tests/ui/navbar-events.test.js"],
    "notes": [
      ("Two independent URL-hash parsers, with different key names",
       "<code>app-state.js</code> has its own <code>parseHash()</code> returning "
       "<code>{chromosome, start, end}</code>, evaluated once at module load into a frozen "
       "<code>hashCoords</code> const. <code>hash-navigation.js:31</code> has "
       "<code>parseUrlHash()</code> returning <code>{chrom, ...}</code> — different key, read "
       "live. app.js uses the second. The first is what the shared UI (coordinate box, cytoband) "
       "reads, and because it is captured at module-eval it never updates when the hash changes."),
    ],
    "invariants": [
      ("<code>state.js</code> grabs its DOM references at module-evaluation time",
       "state.js:4 does <code>document.getElementById('canvas')</code> at top level and "
       "state.js:75–95 builds the whole <code>state.dom</code> map the same way. Its own comment "
       "says why this is safe: <code>type=\"module\"</code> is deferred, so the document is fully "
       "parsed before any of it runs. Every one of those ids must exist in index.html; a renamed "
       "element becomes a <code>null</code> that only explodes on the frame that touches it."),
      ("Subscribe-before-publish is guaranteed by module evaluation, not by timing",
       "The event bus (event-bus.js) is a plain object with no replay — a publish with no "
       "subscriber is dropped silently. <code>setupUiBridge()</code> (app.js) subscribes to "
       "<code>ui:construct-graph</code>, and <code>debug-status-bar.js:23</code> subscribes to "
       "<code>app:debug-mode-changed</code> at module scope. Both are in place before the first "
       "user interaction because they run during evaluation of the entry graph, not from a "
       "callback. Move either behind an <code>await</code> and the first event through it is lost."),
      ("<code>render-manager.js</code> is imported for its side effect and nothing else",
       "app.js imports it as bare <code>import './render-manager.js'</code>. Its module body ends "
       "with <code>setDrawCallback(draw)</code> and <code>updateLegend()</code>, which is the only "
       "thing that ever registers the draw function with the frame scheduler. Drop that import "
       "line as 'unused' and <code>scheduleFrame()</code> becomes a no-op with no error."),
    ],
    "sub": [],
  },
  {
    "id": "wiring", "name": "Wire the engines",
    "fns": [("pangyplot/static/js/graph/ui/ui-bridge.js", "setupUiBridge"),
            ("pangyplot/static/js/graph/engines/engine-manager.js", "setupEngines"),
            ("pangyplot/static/js/graph/engines/node-search-engine.js", "setupNodeSearch"),
            ("pangyplot/static/js/graph/detail/engines/forces/pc-settings.js", "bindRenderState")],
    "gist": "app.js's top level, in order: setupUiBridge, setupPolychainForceSettings, "
            "setupNodeSearch, setupEngines, then init(). All four setups are synchronous and "
            "complete before init()'s first await — so every listener exists before any data does.",
    "inp": "the evaluated module graph",
    "out": "canvas listeners for pan/zoom, hover, drag, selection, keyboard, context menu, path trace",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "notes": [],
    "invariants": [
      ("The engines bind to the canvas before the first fetch is issued",
       "app.js calls <code>setupEngines()</code> (synchronous) and only then <code>init()</code> "
       "(async). Everything in engine-manager attaches to <code>state.canvas</code>, which exists "
       "from module-eval. So the canvas is pannable and zoomable during the several hundred "
       "milliseconds where it is still blank — the user can interact before there is anything to "
       "interact with, and that is intentional, not an accident of ordering."),
      ("<code>bindRenderState(state)</code> is the first line of init() for a reason",
       "pc-settings.js keeps its own <code>_state</code> reference rather than importing state.js, "
       "to break an import cycle. Nothing in the detail layer works until that assignment happens."),
    ],
    "sub": [],
  },
  {
    "id": "load_chromosome", "name": "Load the chromosome",
    "fns": [("pangyplot/static/js/graph/data/chromosome-loader.js", "loadChromosome")],
    "gist": "Six fetches go out in one Promise.all, then their bodies are consumed one by one. "
            "This is the only blocking work between page load and first paint.",
    "inp": "state.chromosome — from the URL hash, else the hardcoded 'chrY'",
    "out": "skeleton levels, spine, polychain cache, gene cache, graph meta, stats",
    "artifacts": [],
    "checks": ["boot_endpoints"],
    "tests": ["tests/graph/spine-engine.test.js"],
    "notes": [
      ("The initial chromosome falls back to a hardcoded <code>'chrY'</code>",
       "app.js — <code>state.chromosome = hashParams?.chrom ?? 'chrY'</code>. Nothing consults "
       "<code>/chromosomes</code>. On a dataset without chrY, a visit to <code>/</code> with no "
       "hash always lands on the error path (<code>No data for chrY</code>) even though the "
       "dataset is fine."),
      ("Only two of the six responses are checked",
       "chromosome-loader.js throws only if <code>/skeleton</code> or <code>/skeleton-bin</code> "
       "fails. A failed <code>/spine</code> is swallowed — and without a spine "
       "<code>layoutToBp</code> returns null, <code>isReady()</code> is false, and "
       "<code>scheduleDetailFetch</code> silently returns forever. The graph draws, the coordinate "
       "readout is blank, and detail never activates. No error is surfaced anywhere."),
      ("The gene fetch can serialise a second full-chromosome request",
       "The parallel batch asks for <code>&amp;mane_only=true</code>. If that comes back with zero "
       "genes, chromosome-loader awaits a second <code>/genes</code> for the entire chromosome "
       "with no filter — after the parallel batch has already resolved. On a reference with no "
       "MANE annotations, every boot pays two serial gene fetches."),
      ("<code>showStats()</code> throws outside the try/catch",
       "init() wraps only <code>loadChromosome</code>. <code>showStats()</code> "
       "(debug-status-bar.js) hides the loading overlay and then dereferences "
       "<code>state.stats.totalSegments</code>. If the skeleton response carried no "
       "<code>stats</code> block, it hides the overlay, throws, and init() never reaches "
       "<code>resizeCanvas()</code> or <code>scheduleFrame()</code> — an unhandled rejection and a "
       "permanently blank canvas with no error UI."),
    ],
    "invariants": [
      ("The six fetches are parallel; the six body reads are not",
       "One <code>Promise.all</code> of six bare <code>fetch()</code> calls — headers only. The "
       "<code>.json()</code> / <code>.arrayBuffer()</code> calls that follow each block in source "
       "order. That is deliberate: the network is the long pole and it is fully overlapped, while "
       "the decode order matters (skeleton binary is indexed before the spine is installed, and "
       "the spine must exist before anything asks for a bp coordinate)."),
      ("The skeleton binary is indexed, not decoded, at load",
       "<code>indexBinaryLevels</code> lays typed-array views over the one ArrayBuffer and sets "
       "<code>_decoded = false</code> per level. Nothing is copied. <code>initSkeleton</code> then "
       "decodes; the buffer must stay alive for the lifetime of those views."),
    ],
    "sub": [
      {"name": "Six fetches, in parallel",
       "fns": [("pangyplot/static/js/graph/data/chromosome-loader.js", "loadChromosome")],
       "gist": "/skeleton, /skeleton-bin, /spine, /polychain-data, /genes?mane_only=true, /graph-meta — "
               "issued together, awaited together.",
       "cost": "Everything before first paint is behind this one await. There is no progressive "
               "reveal: the loading overlay stays up until all six have landed AND been decoded."},
      {"name": "Index the binary levels",
       "fns": [("pangyplot/static/js/graph/data/chromosome-loader.js", "indexBinaryLevels")],
       "gist": "Compute byte offsets per zoom level over the skeleton ArrayBuffer; decode nothing yet.",
       "cost": ""},
      {"name": "Install the reference spine",
       "fns": [("pangyplot/static/js/graph/engines/reference-spine-engine.js", "initSpine")],
       "gist": "The layout↔bp coordinate bridge. Until this lands, no bp coordinate exists on the client.",
       "cost": ""},
      {"name": "Seed the polychain cache",
       "fns": [("pangyplot/static/js/graph/detail/data/polychain-data-cache.js", "initPolychainDataCache")],
       "gist": "The whole chromosome's chain decomposition, preloaded. This is why the first detail "
               "view usually needs no network call at all.",
       "cost": ""},
      {"name": "Seed the gene cache",
       "fns": [("pangyplot/static/js/graph/data/gene-data.js", "initGeneCache")],
       "gist": "Every gene on the chromosome, held client-side; placement against the spine happens later.",
       "cost": ""},
      {"name": "Publish LOD metadata",
       "fns": [("pangyplot/static/js/graph/data/chromosome-data.js", "setLevelMeta")],
       "gist": "The per-zoom-level grid sizes the LOD engine picks from. Empty array until this runs.",
       "cost": ""},
      {"name": "Decode the skeleton",
       "fns": [("pangyplot/static/js/graph/skeleton/data/skeleton-init.js", "initSkeleton")],
       "gist": "Decode every level, build the chain family map, precompute bboxes, compute the data "
               "bounds fitToScreen will use.",
       "cost": "All eight levels are decoded eagerly here, not on first use."},
    ],
  },
  {
    "id": "place_viewport", "name": "Place the viewport",
    "fns": [("pangyplot/static/js/graph/debug/debug-status-bar.js", "showStats"),
            ("pangyplot/static/js/graph/render/viewport.js", "resizeCanvas"),
            ("pangyplot/static/js/graph/engines/navigation/hash-navigation.js", "navigateToHash")],
    "gist": "Hide the loading overlay, size the canvas to its container at device pixel ratio, then "
            "either navigate to the region in the URL hash or fit the whole chromosome on screen.",
    "inp": "decoded skeleton bounds, the URL hash",
    "out": "state.panX / panY / zoom",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/graph/render-offset.test.js"],
    "notes": [
      ("The loading overlay is hidden by a module called <code>debug-status-bar</code>",
       "<code>showStats()</code> lives with the debug readouts and does two unrelated things: it "
       "sets <code>state.dom.loading.style.display = 'none'</code> and it fills the debug stats "
       "line. The overlay is not a debug feature; the function that removes it is. Anyone deleting "
       "the debug bars takes the loading screen's only exit with them."),
    ],
    "invariants": [
      ("The canvas is sized in device pixels and the context is pre-scaled by DPR",
       "<code>resizeCanvas()</code> sets <code>canvas.width = clientWidth * dpr</code> and then "
       "<code>ctx.setTransform(dpr,0,0,dpr,0,0)</code>. Every downstream module — viewport bounds, "
       "hit testing, the render offset — divides <code>canvas.width</code> by dpr to get CSS "
       "pixels back. Drop the setTransform and everything is drawn at 1/dpr scale."),
    ],
    "sub": [],
  },
  {
    "id": "first_paint", "name": "First paint",
    "fns": [("pangyplot/static/js/graph/utils/frame-scheduler.js", "scheduleFrame"),
            ("pangyplot/static/js/graph/render-manager.js", "draw"),
            ("pangyplot/static/js/graph/engines/lod-engine.js", "updateLOD")],
    "gist": "init() calls scheduleFrame(). One requestAnimationFrame later, draw() runs: clear, fill "
            "the background, pick the LOD level for the current zoom, and stroke the skeleton "
            "polylines for the visible viewport. This is the first frame — and the only layer in it "
            "is the skeleton.",
    "inp": "state.zoom / panX / panY, the decoded skeleton levels",
    "out": "pixels",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/graph/render-offset.test.js", "tests/graph/format-utils.test.js"],
    "notes": [],
    "invariants": [
      ("A frame scheduled before the data lands is harmless, by design",
       "<code>draw()</code> clears and fills the background, calls <code>updateLOD()</code>, and "
       "only then does <code>const meta = getLevelMeta(); if (!meta) return;</code>. "
       "<code>levelMeta</code> starts as <code>[]</code> (chromosome-data.js:6), so "
       "<code>updateLOD</code> is safe on an empty array and <code>getLevelMeta()</code> returns "
       "undefined. Any early frame paints the background and bails instead of throwing. Initialise "
       "<code>levelMeta</code> to <code>null</code> and that guard becomes a crash one line earlier."),
      ("<code>scheduleFrame()</code> coalesces — it is not a render",
       "frame-scheduler.js holds a single <code>rafId</code> and returns immediately if one is "
       "pending. Every engine in the app calls it freely on every mouse move. It is decoupled from "
       "render-manager precisely so engines never import the render layer; the draw function is "
       "injected by <code>setDrawCallback</code> at module-eval."),
      ("The render offset is what keeps the geometry precise",
       "draw() calls <code>setRenderOffset(-panX/zoom, -panY/zoom)</code> before scaling the "
       "context, so world coordinates are rebased near the origin before hitting canvas's 32-bit "
       "float path. At chromosome-scale layout coordinates, drawing without it visibly quantises."),
    ],
    "sub": [],
  },
  {
    "id": "after_paint", "name": "After the first frame",
    "fns": [("pangyplot/static/js/graph/engines/detail-transition-engine.js", "scheduleDetailFetch"),
            ("pangyplot/static/js/graph/detail/data/polychain/polychain-fetcher.js", "fetchDetailForViewport"),
            ("pangyplot/static/js/graph/detail/engines/force-engine.js", "initForce")],
    "gist": "init() also arms a 200 ms debounced detail fetch. It is gated on zoom: fitToScreen over "
            "a whole chromosome leaves targetGridSize far above DETAIL_GRID_THRESHOLD (500), so on a "
            "plain load it returns having done nothing. Land on a zoomed-in URL hash instead and the "
            "detail layer builds from the already-cached polychain data — no network — and fades in "
            "over 600 ms.",
    "inp": "the viewport after fitToScreen or navigateToHash",
    "out": "state.detailData, or nothing at all",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/graph/polychain-model.test.js", "tests/graph/sim-object.test.js"],
    "notes": [
      ("The force simulation does not exist at first paint, and usually never does",
       "<code>initForce()</code> is called lazily, and only from <code>addPoppedNodes</code>, "
       "<code>insertPoppedContent</code> and <code>reheatSimulation</code> — i.e. from a bubble "
       "pop. It is <em>not</em> called by init(), by loadChromosome, or by the detail fetch. Until "
       "the user pops something there is no d3 simulation object and no tick loop; the detail layer "
       "is drawn from precomputed layout coordinates. Any mental model of boot that includes a "
       "'first tick' is wrong."),
    ],
    "invariants": [
      ("The first detail view is served from memory, not from <code>/detail-tiles</code>",
       "<code>fetchDetailForViewport</code> checks <code>hasPolychainDataCache()</code> first and, "
       "when the cache seeded by <code>/polychain-data</code> at boot covers the viewport, builds "
       "the chains locally. <code>/detail-tiles</code> is the fallback path. This is why boot pays "
       "for a whole-chromosome polychain download: it buys every subsequent zoom for free."),
      ("Detail entry and exit use different thresholds on purpose",
       "state.js:66–67 — enter at <code>targetGridSize &lt;= 500</code>, exit at "
       "<code>&gt; 700</code>. The gap is hysteresis; collapse the two constants to one value and "
       "a viewport parked on the boundary thrashes fetch/fade/clear on every wheel event."),
    ],
    "sub": [],
  },
]


# ---------------------------------------------------------------------------
# The static import-graph probe.
#
# There is no browser here and nothing to time. But everything on the critical
# path to first paint is statically declared -- the script tags, the import map,
# and the import specifiers themselves -- so the whole thing can be walked from
# the template outwards without executing a line of it. A broken import path is a
# blank page, and no test in this repo would notice.
# ---------------------------------------------------------------------------

URL_FOR = re.compile(r"url_for\(\s*'static'\s*,\s*filename\s*=\s*'([^']+)'\s*\)")
MODULE_TAG = re.compile(r"<script[^>]*\btype\s*=\s*[\"']module[\"'][^>]*>", re.I)
SCRIPT_TAG = re.compile(r"<script\b[^>]*>", re.I)
IMPORTMAP = re.compile(r"<script[^>]*type=[\"']importmap[\"'][^>]*>(.*?)</script>", re.I | re.S)
ALIAS = re.compile(r'"([^"]+)"\s*:\s*"\{\{\s*url_for\(\s*\'static\'\s*,\s*'
                   r'filename\s*=\s*\'([^\']+)\'\s*\)\s*\}\}"')

# import ... from 'x' | import 'x' | export ... from 'x' | import('x')
SPEC = re.compile(
    r"""(?:^\s*import\s+[^'";]*?from\s*['"]([^'"]+)['"]"""
    r"""|^\s*import\s*['"]([^'"]+)['"]"""
    r"""|^\s*export\s+[^'";]*?from\s*['"]([^'"]+)['"]"""
    r"""|\bimport\(\s*['"]([^'"]+)['"]\s*\))""",
    re.M,
)


def _read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace") as fh:
        return fh.read()


def _static_rel(filename):
    """'js/graph/app.js' -> 'pangyplot/static/js/graph/app.js'."""
    return os.path.join("pangyplot", "static", filename)


def entry_modules():
    """Every <script type="module"> in index.html, as repo-relative paths."""
    html = _read(TEMPLATE)
    out = []
    for tag in MODULE_TAG.findall(html):
        m = URL_FOR.search(tag)
        if m:
            out.append(_static_rel(m.group(1)))
    return out


def import_map():
    """The alias -> repo-relative-path map the browser resolves specifiers through."""
    html = _read(TEMPLATE)
    m = IMPORTMAP.search(html)
    if not m:
        return {}
    return {alias: _static_rel(target) for alias, target in ALIAS.findall(m.group(1))}


def _resolve_spec(spec, importer, aliases):
    """Resolve one import specifier the way the browser's import map would."""
    if spec.startswith((".", "/")):
        if spec.startswith("/"):
            return os.path.normpath(os.path.join("pangyplot", spec.lstrip("/")))
        return os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    for alias, target in aliases.items():
        if alias.endswith("/"):
            if spec.startswith(alias):
                return os.path.normpath(os.path.join(target, spec[len(alias):]))
        elif spec == alias:
            return os.path.normpath(target)
    return None  # bare specifier with no import-map entry: unresolvable in the browser


def walk_imports():
    """Depth-first walk of the static import graph from the template's module entries.

    Returns (modules_seen, broken, bare) — broken is (importer, specifier, resolved-path)
    for a specifier that resolved to a file that does not exist; bare is (importer, specifier)
    for one the import map cannot resolve at all. Either is a blank page in the browser.
    """
    aliases = import_map()
    seen, broken, bare = set(), [], []
    stack = list(entry_modules())
    while stack:
        mod = stack.pop()
        if mod in seen:
            continue
        seen.add(mod)
        if not os.path.exists(os.path.join(ROOT, mod)):
            continue
        for groups in SPEC.findall(_read(mod)):
            spec = next((g for g in groups if g), None)
            if not spec:
                continue
            target = _resolve_spec(spec, mod, aliases)
            if target is None:
                bare.append((mod, spec))
                continue
            if not os.path.exists(os.path.join(ROOT, target)):
                broken.append((mod, spec, target))
                continue
            stack.append(target)
    return seen, broken, bare


BOOT_FETCH = re.compile(r"fetch\(\s*`(/[a-z\-]+)")


def probe():
    """Everything that must be true for the page to reach first paint, checked statically."""
    out = {}

    def rec(key, ok, detail, weak=False):
        out[key] = {"ok": ok, "detail": detail, "weak": weak}

    # 1. The module entry points the template names actually exist.
    entries = entry_modules()
    missing = [e for e in entries if not os.path.exists(os.path.join(ROOT, e))]
    rec("entry_modules", bool(entries) and not missing,
        ", ".join(os.path.basename(e) for e in entries) if not missing
        else "missing: " + ", ".join(missing))

    # 2. Every import-map alias points at a real file or directory.
    aliases = import_map()
    bad = [a for a, t in aliases.items()
           if not os.path.exists(os.path.join(ROOT, t.rstrip(os.sep)))]
    rec("import_map", bool(aliases) and not bad,
        f"{len(aliases)} aliases resolve" if not bad else "dangling: " + ", ".join(bad))

    # 3. The classic scripts that set window.d3 / window.__APP_CONFIG precede the
    #    module tags -- deferred modules read both at evaluation time.
    html = _read(TEMPLATE)
    first_module = MODULE_TAG.search(html[html.index("<body"):])
    body = html[html.index("<body"):]
    cutoff = first_module.start() if first_module else len(body)
    head = body[:cutoff]
    d3_ok = "d3/d3.js" in head and "__APP_CONFIG" in head
    rec("classic_before_modules", d3_ok,
        "d3 + __APP_CONFIG set by classic scripts before the first module tag" if d3_ok
        else "a module script precedes the d3 / __APP_CONFIG classic scripts")

    # 4. The whole transitive import graph resolves.
    seen, broken, bare = walk_imports()
    rec("import_graph", not broken,
        f"{len(seen)} modules reachable from the entry points, all resolve" if not broken
        else "; ".join(f"{os.path.basename(i)} → {s} (no {t})" for i, s, t in broken[:4]))
    rec("no_bare_specifiers", not bare,
        "every specifier is relative or import-mapped" if not bare
        else "; ".join(f"{os.path.basename(i)} → {s}" for i, s in bare[:4]))

    # 5. Every endpoint the boot loader fetches is a real Flask route.
    loader = _read(LOADER)
    routes = set(re.findall(r"@bp\.route\('([^']+)'", _read("pangyplot/routes.py")))
    wanted = sorted(set(BOOT_FETCH.findall(loader)))
    absent = [w for w in wanted if w not in routes]
    rec("boot_endpoints", bool(wanted) and not absent,
        " ".join(wanted) if not absent else "no such route: " + ", ".join(absent))

    return out


def contexts():
    seen, broken, bare = walk_imports()
    n_bad = len(broken) + len(bare)
    line = (
        '<span class="num">index.html</span> — <span class="warn">this flow is not timed. '
        'There is no server-side stage to instrument and no headless browser in this toolchain, '
        'so no stage on this page carries a duration — inventing one would be worse than leaving '
        'it blank.</span> The viewer does instrument itself: <code>chromosome-loader.js</code> '
        'logs <code>[load] fetch / skeleton parse / genes / total</code> to the console on every '
        'load, and with <code>debug=true</code> the per-layer draw timings appear in the on-canvas '
        f'HUD (<code>debug-hud.js</code>). What is checked here instead is static: '
        f'<b class="num">{len(seen)}</b> modules walked from the two entry points, '
        + ('<b class="num">0</b> broken imports.' if not n_bad
           else f'<b class="num">{n_bad}</b> that would not resolve in a browser.')
    )
    return {"index.html": {"line": line, "timings": {}, "probe": probe(), "artifacts": {}}}


PANELS = [
  {"cls": "flag", "title": "Where first paint actually is",
   "paras": [
     (None, "The last thing <code>init()</code> does before returning is <code>scheduleFrame()</code>. "
            "One <code>requestAnimationFrame</code> later, <code>draw()</code> in "
            "<code>render-manager.js</code> runs, and that is the first frame. Everything before it "
            "is blocked on a single <code>await loadChromosome()</code>, whose six fetches are fully "
            "parallel but whose six body decodes are strictly serial."),
     ("The first frame contains one layer.",
      "The skeleton. No detail, no bubbles, no force simulation. "
      "<code>fitToScreen()</code> over a whole chromosome leaves <code>targetGridSize</code> far "
      "above the detail threshold of 500, so the 200 ms debounced "
      "<code>scheduleDetailFetch()</code> armed at the end of init() fires and returns having done "
      "nothing at all."),
     ("There is no first tick.",
      "<code>initForce()</code> is lazy and reachable only from a bubble pop. On a cold boot the d3 "
      "simulation object is never constructed. The detail layer, when it appears, is drawn from "
      "precomputed layout coordinates — the simulation only exists once the user pops something."),
   ]},
  {"cls": "resume", "title": "Why the checkpoints on this page are an import walk",
   "paras": [
     (None, "The build walks the transitive static import graph from the two "
            "<code>&lt;script type=\"module\"&gt;</code> tags in index.html, resolving every "
            "specifier through the import map exactly as the browser would. A mistyped relative "
            "path, a module moved without updating an importer, an <code>@alias/</code> that no "
            "longer points anywhere: each of those is a hard module-resolution failure, which in "
            "the browser means an empty canvas and one line in the console."),
     ("Nothing else in this repo catches that.",
      "There is no bundler and no build step — the browser resolves ES modules at runtime, so a "
      "broken import has no compile stage to fail at. vitest only ever imports the handful of "
      "modules its own test files reach, and it resolves them through its own alias table in "
      "<code>vitest.config.js</code>, not through the template's import map. The two can disagree "
      "and the tests still pass."),
   ]},
]
