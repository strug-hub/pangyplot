"""Flow — `/path`: tracing one sample's haplotype through a region.

"Where does HG00621#1 go through here?" A haplotype is a list of oriented
segment ids, tens of millions of them on a big chromosome. It is written once at
ingest as a delta-zigzag-varint stream, shipped to the browser as those exact
bytes, decoded there, and matched against the chain boundaries already on screen
until it becomes drawn geometry.

Measured against real samples out of the real datastore: every payload on this
page was fetched from a booted server and decoded again in Python at build time.
"""

import os
import sys
from urllib.parse import quote

import numpy as np

from flows import _runtime as rt
from core import ROOT, human

SLUG = "path"
NAME = "/path"
TITLE = "<code>/path</code> — tracing one haplotype through a region"
SUB = ("A sample's walk through the graph is a list of oriented segment ids — millions of them. "
       "It is encoded once at ingest, shipped to the browser as raw varint bytes, decoded there, "
       "and resolved against the chains already on screen. Two of the four path endpoints are live; "
       "two are legacy. Pick a real sample — every payload below was fetched and decoded at build time.")
CTX_LABEL = "sample"

STAGES = [
  {
    "id": "write", "name": "Written at ingest", "timing_key": None,
    "fns": [("pangyplot/preprocess/parser/gfa/parse_paths.py", "parse_paths")],
    "gist": "Pass 1 of the GFA parse: every P/W line becomes one .binpath file, and index.json records what each file is.",
    "inp": "the GFA's P and W lines",
    "out": "paths/*.binpath + paths/index.json + paths/sample_idx.json",
    "artifacts": [
      ("paths/index.json", "json", "sample → [{file, contig, start, length, is_ref}] + the writing version"),
      ("paths/sample_idx.json", "json", "sample → bit position in the link haplotype bitmask"),
    ],
    "checks": ["binpaths", "index_json"],
    "tests": ["tests/db/test_path_codec.py"],
    "invariants": [
      ("The combined array is derived once and shared",
       "parse_paths packs each step into <code>(seg_id &lt;&lt; 1) | dir_bit</code> with <code>_combine_steps</code>, then hands the <i>same</i> int64 array to both <code>collapse_binary</code> (which keys path_dict on adjacent pairs) and <code>store_path(combined=...)</code> (which encodes it). Deriving it twice was the single most expensive thing in the phase. A caller that passes steps instead of <code>combined</code> still works — <code>store_path</code> falls back to <code>write_binpath</code> — it is just far slower."),
      ("index.json ordering IS the wire protocol",
       "<code>/path-data?index=N</code> indexes into <code>index['paths'][sample]</code> positionally. The client gets that list from <code>/path-meta</code> and sends back the array position. Reorder the entries for a sample and every cached client fetches the wrong subpath — nothing would raise."),
    ],
    "notes": [
      ("store_path accumulates metadata in a module-global",
       "path_db.py — <code>_pending_metadata</code> is a module-level dict keyed by the paths directory, drained by <code>finalize_paths</code>. So does <code>_filename_counters</code>. Two chromosomes parsed in one process without <code>reset_filename_counters()</code> in between would keep counting up; parse_paths calls it first, which is the only thing making this safe."),
    ],
    "sub": [
      {"name": "Reading the P/W lines",
       "fns": [("pangyplot/preprocess/parser/gfa/parse_paths.py", "parse_line_P"),
               ("pangyplot/preprocess/parser/gfa/parse_paths.py", "parse_line_W")],
       "gist": "A P line's path column is split on commas; a W line's walk column is regex-scanned for >/< runs. Both produce ['123+', '124-'] step strings.",
       "cost": "cols[2].split(',') materializes a Python list of every step on the line — hundreds of MB on chr1, for one line."},
      {"name": "Packing the steps",
       "fns": [("pangyplot/db/path_codec.py", "_combine_steps")],
       "gist": "['1+','305-'] → int64 array of (seg_id << 1) | dir_bit, vectorized through one joined byte buffer.",
       "cost": ""},
      {"name": "Writing one file per path",
       "fns": [("pangyplot/db/sqlite/path_db.py", "store_path")],
       "gist": "Encode the combined array and write <sample>__<n>.binpath; remember its metadata for the index.",
       "cost": ""},
      {"name": "Writing the index",
       "fns": [("pangyplot/db/sqlite/path_db.py", "finalize_paths")],
       "gist": "Flush the accumulated metadata to paths/index.json, stamped with the pangyplot version.",
       "cost": ""},
    ],
  },
  {
    "id": "codec", "name": "The codec", "timing_key": None,
    "fns": [("pangyplot/db/path_codec.py", "encode_combined"),
            ("pangyplot/db/path_codec.py", "decode_combined")],
    "gist": "Delta, zigzag, varint, gzip — in that order. A path is a mostly-monotonic run of segment ids, so consecutive deltas are tiny and most steps cost a single byte.",
    "inp": "int64 array of combined values",
    "out": "gzipped LEB128 varint stream — no header, no framing",
    "artifacts": [("paths/", "binary", "one .binpath per haplotype per contig")],
    "checks": ["roundtrip", "byte_stable", "compression"],
    "tests": ["tests/db/test_path_codec.py", "tests/graph/path-codec.test.js"],
    "invariants": [
      ("Two encoders and two decoders must agree bit-for-bit",
       "Python encodes (<code>encode_combined</code>, numpy, vectorized) and decodes twice — <code>decode_combined</code> (numpy, via <code>add.reduceat</code>) and <code>decode_steps</code> (scalar, produces '123+' strings). JavaScript decodes a third time (<code>path-codec.js:decodeSteps</code>) and encodes a second (<code>encodeSteps</code>, tests only). All four walk the same layout: first value raw, every later value a zigzagged delta against the previous <i>combined</i> value — not against the previous segment id. Change the framing in one and three others silently disagree; the vitest suite and tests/db/test_path_codec.py exist to pin exactly this."),
      ("gzip is stamped with mtime=0 on purpose",
       "encode_combined passes <code>mtime=0</code> to gzip.compress. Without it gzip writes the current wall time into the header, so two identical builds produce different .binpath bytes and a datastore cannot be diffed against another — which is how the flat-bubble port was validated. Byte-determinism here is a feature; do not drop the argument."),
      ("The payload has no header and no step count",
       "A .binpath file is <i>only</i> the gzipped varint stream. The decoder's stop condition is end-of-buffer, so a truncated file decodes to a shorter path rather than raising. Everything the reader needs to know about the path (contig, start, is_ref) lives in index.json, and nothing cross-checks the two."),
    ],
    "notes": [
      ("The shipped datastore was NOT written by the current encoder",
       "The <code>byte_stable</code> checkpoint below re-encodes the exact payload the server just served and compares it to the file on disk. The <i>varint stream</i> comes back byte-identical every time — the codec is sound. The <i>gzip container</i> does not: every .binpath in datastore/graphs/ carries a non-zero mtime in its gzip header and was compressed at the zlib default (level 6), while <code>encode_combined</code> now writes <code>mtime=0</code> at <code>GZIP_LEVEL = 4</code> (db_utils.py:15). So these files predate both changes, and re-running <code>add</code> would rewrite every one of them with different bytes and a slightly larger size. The determinism the mtime=0 invariant buys only applies to datastores built by current code — and there is no version stamp on a .binpath to tell you which you have."),
      ("The JS decoder is 32-bit; the Python one is 64-bit",
       "path-codec.js uses <code>|=</code>, <code>&lt;&lt;</code>, <code>&gt;&gt;&gt;</code> and <code>^</code>, all of which coerce to int32. Python's <code>decode_combined</code> works in int64. They agree only while every <i>combined</i> value fits in 31 bits — i.e. segment ids below 2^30 (~1.07e9). No graph in this datastore is close, and nothing checks it: past that boundary the browser would silently draw a path through negative segment ids while Python read the same bytes correctly."),
    ],
    "sub": [
      {"name": "Encode (Python)",
       "fns": [("pangyplot/db/path_codec.py", "encode_combined")],
       "gist": "First value raw, the rest zigzagged deltas, LEB128'd in numpy, gzipped with mtime=0.", "cost": ""},
      {"name": "Decode fast (Python)",
       "fns": [("pangyplot/db/path_codec.py", "decode_combined")],
       "gist": "Group bytes by continuation bit, sum with add.reduceat, cumsum the deltas — no Python-level loop over steps. This is what compute_bp_ranges uses.", "cost": ""},
      {"name": "Decode to strings (Python)",
       "fns": [("pangyplot/db/path_codec.py", "decode_steps")],
       "gist": "The scalar decoder: one '123+' Python string per step. Only the legacy /path route and the migration need it.",
       "cost": "Tens of millions of string allocations on a chromosome-scale path. decode_combined exists so that callers who only want ids never pay this."},
    ],
  },
  {
    "id": "startup", "name": "Startup: migrate, then measure", "timing_key": "boot",
    "fns": [("pangyplot/preprocess/ensure_paths.py", "ensure_paths"),
            ("pangyplot/db/indexes/PathIndex.py", "compute_bp_ranges")],
    "gist": "Before the server serves anything: migrate any legacy path format to the current one, then work out which bp range each subpath covers so the viewer can filter without decoding.",
    "inp": "the chromosome's paths/ directory + StepIndex",
    "out": "current-format .binpath + paths/bp_ranges.json",
    "artifacts": [("paths/bp_ranges.json", "json", "sample → [(bp_start, bp_end), …], positionally aligned with index.json")],
    "checks": ["migration", "bp_ranges"],
    "tests": ["tests/db/test_path_codec.py"],
    "invariants": [
      ("Migration is keyed on the version string in index.json",
       "<code>_needs_migration</code> re-migrates when <code>is_compatible_version(path_index_version(...))</code> is false, on top of sniffing for legacy .json and header-framed .binpath files. That version string is written by <code>write_path_index</code> from <code>pangyplot.version.__version__</code> — so bumping the version to force a re-migration works, and forgetting to bump it when the format changes means old files are served as if current."),
      ("bp_ranges.json is positional, not keyed",
       "PathIndex.get_path_meta_with_bp zips <code>bp_ranges[sample][i]</code> onto <code>index['paths'][sample][i]</code> by array index. It is a pure cache with no fingerprint of what it was built from: re-parse the GFA so the subpaths change, keep the old bp_ranges.json, and every subpath gets a plausible bp range belonging to a different subpath. Nothing would fail."),
    ],
    "notes": [
      ("The WSGI entrypoint never migrates",
       "<code>ensure_paths</code> is called from <code>pangyplot/commands/run.py:44</code> — the dev CLI. <code>wsgi.py:16</code> calls <code>create_app</code> directly, so a production gunicorn deployment runs none of ensure_paths / ensure_indexes / ensure_skeleton. Serve a legacy-format datastore over WSGI and /path-data hands the browser header-framed bytes, which the JS decoder will happily decode into garbage segment ids rather than fail."),
      ("Legacy sniffing reads exactly one file",
       "<code>_find_legacy_binpath</code> tests <i>candidates[0]</i> from os.listdir and, if it looks current, declares the whole directory current. A part-migrated directory (an interrupted run) is indistinguishable from a clean one."),
    ],
    "sub": [
      {"name": "Migrating legacy formats",
       "fns": [("pangyplot/preprocess/ensure_paths.py", "_migrate_chromosome")],
       "gist": "Convert plain-JSON paths and header-framed .binpath files to the current headerless format, and rewrite index.json.", "cost": ""},
      {"name": "Precomputing bp ranges",
       "fns": [("pangyplot/db/indexes/PathIndex.py", "compute_bp_ranges")],
       "gist": "Decode every .binpath once, gather each step's bp span out of the StepIndex, and cache the min/max per subpath.",
       "cost": "Every path of every sample is decoded at startup — but only on the first run: the cache file short-circuits it. app.py:115 calls it per chromosome after the StepIndex loads."},
    ],
  },
  {
    "id": "meta", "name": "GET /path-meta — what subpaths exist", "timing_key": "path_meta",
    "fns": [("pangyplot/routes.py", "path_meta"),
            ("pangyplot/db/query.py", "get_path_meta"),
            ("pangyplot/db/indexes/PathIndex.py", "get_path_meta_with_bp")],
    "gist": "The first request the browser makes after you pick a sample: the list of that sample's subpaths, each with the bp range it covers — and no step data at all.",
    "inp": "?sample=&chromosome=",
    "out": "[{file, full_id, contig, start, length, is_ref, bp_start, bp_end}]",
    "artifacts": [],
    "checks": ["meta_shape", "meta_bp"],
    "tests": ["tests/routes/test_path_routes.py"],
    "invariants": [
      ("Sample names contain '#', so the URL must be encoded",
       "Real HPRC samples are <code>HG02145#1</code>. Unencoded, the '#' turns everything after it into a URL fragment — the chromosome parameter never reaches the server and <code>get_path_meta</code> dies on <code>gfa_index[None]</code>, surfacing as a 404 whose message is literally <code>None</code>. What saves the viewer is <code>buildUrl()</code> in network-utils.js running every value through encodeURIComponent. Any hand-built path URL (a test, a curl, this page's own probe) has to do the same."),
      ("The reply is cheap by construction",
       "get_path_meta_with_bp reads index.json and the in-memory bp_ranges dict. It never opens a .binpath. This is the whole reason the endpoint exists — the viewport filter in path-trace-engine.js filters the subpath table on bp_start/bp_end without a single byte of path data being fetched."),
    ],
    "notes": [
      ("index.json is re-read from disk on every request",
       "path_db.retrieve_path_meta → read_path_index → json.load, per call. PathIndex holds <code>self.samples</code> (a summary) but not the index itself. Every /path-meta and every /path-data re-parses the whole file; on a graph with thousands of haplotypes that is the dominant cost of both endpoints."),
    ],
    "sub": [],
  },
  {
    "id": "data", "name": "GET /path-data — the bytes, untouched", "timing_key": "path_data",
    "fns": [("pangyplot/routes.py", "path_data"),
            ("pangyplot/db/query.py", "get_path_raw"),
            ("pangyplot/db/sqlite/path_db.py", "retrieve_path_raw")],
    "gist": "The server reads the .binpath file off disk and returns it verbatim, labelled Content-Encoding: gzip — no decode, no re-encode, no serialization.",
    "inp": "?sample=&chromosome=&index=N (N indexes index.json positionally)",
    "out": "application/octet-stream, Content-Encoding: gzip — the file, byte for byte",
    "artifacts": [],
    "checks": ["decodes", "ids_exist", "contiguous", "span_matches_meta"],
    "tests": ["tests/routes/test_path_routes.py"],
    "invariants": [
      ("The server hands over the file, not a copy of its contents",
       "<code>read_binpath_raw</code> is an <code>f.read()</code>. Declaring Content-Encoding: gzip makes the browser do the gunzip, so no Python ever decompresses a path on the serving side. That is why this endpoint is O(file size) and not O(steps) — and why <code>decodeSteps</code> in JS takes plain varint bytes rather than a gzip buffer."),
      ("The response is not JSON, and must not become JSON",
       "routes.path_data returns a bare <code>Response</code>. Wrapping it in jsonify (or letting a proxy re-compress it) breaks the Content-Encoding contract the client relies on: path-trace-engine.js reads <code>response.arrayBuffer()</code> and feeds it straight to decodeSteps, trusting the browser to have already gunzipped."),
    ],
    "notes": [],
    "sub": [],
  },
  {
    "id": "decode", "name": "Decoded in the browser", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/engines/path-trace/path-codec.js", "decodeSteps")],
    "gist": "The same delta-zigzag-varint walk as the Python decoder, over the bytes the browser has already gunzipped, producing [{segId, direction}, …] — cached per (sample, fileIndex).",
    "inp": "Uint8Array of raw varint bytes",
    "out": "Array<{segId, direction}>",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/graph/path-codec.test.js"],
    "invariants": [
      ("Decoded paths are cached and never re-fetched",
       "path-trace-engine.js keys <code>decodedPaths</code> on (sample, fileIndex) and returns the cached array before touching the network. Resolution runs again on every pop/unpop — <code>reResolve()</code> — so the decode must not be in that loop."),
    ],
    "notes": [
      ("decodeFromGzip is dead code",
       "path-codec.js exports <code>decodeFromGzip</code> (DecompressionStream). Nothing calls it: /path-data sets Content-Encoding: gzip, so the browser has already decompressed by the time <code>response.arrayBuffer()</code> resolves, and the engine calls <code>decodeSteps</code> directly. If the header is ever dropped, this is the function that was meant to cover it."),
    ],
    "sub": [
      {"name": "Fetch + decode + cache",
       "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-engine.js", "_fetchAndDecodePath")],
       "gist": "GET /path-data for the clicked subpath, decode once, memoize by (sample, fileIndex).", "cost": ""},
      {"name": "Decode",
       "fns": [("pangyplot/static/js/graph/engines/path-trace/path-codec.js", "decodeSteps")],
       "gist": "Varint → zigzag → running sum → {segId, direction}.", "cost": ""},
    ],
  },
  {
    "id": "resolve", "name": "Resolved against what is on screen", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-boundary-resolver.js", "resolveAndBuildRenderData")],
    "gist": "A decoded path is a list of segment ids; the canvas holds chains and junctions. Resolution walks the steps and matches them against the head/tail segments each drawn object registered — the interior of a chain needs no matching at all.",
    "inp": "Array<{segId, direction}> + the live segment registry",
    "out": "{chainOverlays: Map<chainId, tRanges>, kinkHighlights, frames[]}",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "invariants": [
      ("Only boundaries are registered, so only boundaries can be matched",
       "The segment registry tracks <i>ends only</i> — a PolychainContainer registers its headSegs/tailSegs, a SegmentObject registers itself. A path step that lands inside a chain resolves to nothing, on purpose: the chain overlay emitted from its entry/exit t-range already covers it. This is what replaced server-side bubble annotation, and it is why popping a bubble sharpens the trace for free — the split registers new boundaries, so the same decoded steps resolve to more, finer frames without re-fetching."),
      ("Both sides must normalize the segment key the same way",
       "registry._normalize prefixes 's' if absent; polychain-container normalizes source_segs/sink_segs to 's123' when it builds headSegs; the resolver looks up <code>`s${step.segId}`</code>. Three places, one convention. Feed the boundary index a raw numeric id and every lookup misses silently — the path simply draws nothing."),
    ],
    "notes": [
      ("Resolution is a state machine with no error state",
       "resolvePathByBoundaries tracks one <code>inChain</code> at a time. An exit for a chain it is not in emits that chain anyway (as a whole-segment traversal) and drops the one it was in. A path that never hits a registered boundary produces an empty overlay set — indistinguishable, on screen, from a sample that genuinely does not traverse the region."),
      ("Popped bubble interiors are not traced",
       "path-trace-boundary-resolver.js — <code>_emitChain</code> splits a traversal around each popped range and carries a TODO where the popped bubble's own contents should become frames. Today the animation skips straight over the interior of a popped bubble."),
      ("SimObject type is tested by constructor.name",
       "<code>obj.constructor.name === 'SegmentObject'</code>. There is no bundler today so it holds, but any minifier that renames classes silently disables junction resolution."),
    ],
    "sub": [
      {"name": "Index the boundaries",
       "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-boundary-resolver.js", "buildBoundaryIndex")],
       "gist": "Walk every live container's segments and map each head seg → entry, each tail seg → exit. Rebuilt from scratch on every resolve, so pops are picked up automatically.", "cost": ""},
      {"name": "Walk the steps",
       "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-boundary-resolver.js", "resolvePathByBoundaries")],
       "gist": "entry → inChain → exit → emit. Junctions resolve directly through the registry; everything else is interior and skipped.", "cost": ""},
      {"name": "Emit overlays and frames",
       "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-boundary-resolver.js", "_emitChain")],
       "gist": "One chain traversal becomes one t-range on the chain's polyline and one animation frame — or several partial frames if popped bubbles interrupt it.", "cost": ""},
    ],
  },
  {
    "id": "draw", "name": "Drawn and animated", "timing_key": None,
    "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-render.js", "drawPathTrace")],
    "gist": "The chain overlays are stroked along each chain's existing polyline between the resolved t-values — the path never gets geometry of its own, it borrows the geometry already on the canvas.",
    "inp": "renderData from the resolver + the canvas transform",
    "out": "pixels",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "invariants": [
      ("A traced path owns no coordinates",
       "Everything drawn here is a t-range into a PolychainContainer's polyline, or a registered SegmentObject. The force simulation can move the whole chain and the trace follows for free — nothing has to be re-resolved on tick. Give the trace its own x/y and that stops being true."),
    ],
    "notes": [],
    "sub": [
      {"name": "Stroke the overlays",
       "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-render.js", "drawPathTrace")],
       "gist": "Chain overlays, junction highlights, then the animation frames on top.", "cost": ""},
      {"name": "Advance the cursor",
       "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-animation.js", "tickPathAnimation")],
       "gist": "One frame per interval; earlier frames fade out on a quadratic tail, so the trace reads as a glow moving through the graph.", "cost": ""},
    ],
  },
  {
    "id": "legacy", "name": "The legacy routes: /path and /pathorder", "timing_key": "path_legacy",
    "fns": [("pangyplot/routes.py", "path"),
            ("pangyplot/db/query.py", "get_path"),
            ("pangyplot/objects/Path.py", "subset_path")],
    "gist": "The original design: the server decoded the path, cut it to the requested bp window, annotated every step with its bubble ancestry, and sent JSON. Still wired, still working, no longer called by anything in the frontend.",
    "inp": "?genome=&chromosome=&start=&end=&sample=",
    "out": "JSON subpaths, each step tagged with its bubble stack",
    "artifacts": [],
    "checks": ["legacy_path", "legacy_pathorder", "no_js_caller"],
    "tests": ["tests/routes/test_path_routes.py"],
    "invariants": [],
    "notes": [
      ("/path and /pathorder have no caller in the frontend",
       "grep of pangyplot/static/js finds <code>/path-meta</code> and <code>/path-data</code> only; the sample dropdown is filled from <code>/samples</code>. <code>/path</code> (routes.py) and <code>/pathorder</code> are reachable and tested, but nothing in the shipped viewer requests them. They are the pre-binpath design — kept working, and measured on this page precisely so it stays honest about what they still cost."),
      ("subset_path cuts on a numeric segment-id range",
       "Path.py — <code>if start_id &lt;= id &lt;= end_id</code>. It assumes segment ids are ordered along the reference, which is true of odgi-sorted graphs and of nothing else. It also walks the path once per sample in Python, decoding every step to a string first (decode_steps). This is the whole reason the flow moved to boundary resolution on the client."),
      ("Errors are swallowed into 404",
       "routes.path catches ValueError and returns 404 with the exception text. A missing StepIndex for (chrom, genome) surfaces as an AttributeError on None instead — a 500 with no message."),
    ],
    "sub": [
      {"name": "Cut the path to the window",
       "fns": [("pangyplot/objects/Path.py", "subset_path")],
       "gist": "Walk every step, keep runs whose ids fall inside [start_segment, end_segment], allowing a 10-step buffer of misses before closing a run.", "cost": ""},
      {"name": "Annotate with bubbles",
       "fns": [("pangyplot/objects/Path.py", "construct_bubble_path")],
       "gist": "For each step, walk the bubble hierarchy upward and attach the full ancestor stack — one SQLite lookup chain per step.",
       "cost": "Two index lookups per step per ancestor level. The client does this now, from geometry it already has."},
      {"name": "Sample ordering",
       "fns": [("pangyplot/routes.py", "path_order"),
               ("pangyplot/db/query.py", "get_path_order")],
       "gist": "Returns sample_idx.json — the bit position each sample occupies in the link haplotype bitmask. Still the definition of that bitmask; just no longer fetched over HTTP.", "cost": ""},
    ],
  },
]


# ---------------------------------------------------------------------------
# Contexts: real samples, real requests, decoded again in Python
# ---------------------------------------------------------------------------

WINDOW = 500_000


def _paths_dir(db, chrom):
    return os.path.join(rt.DATA, "graphs", db, chrom, "paths")


def _dir_size(d):
    if not os.path.isdir(d):
        return 0
    return sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d)
               if os.path.isfile(os.path.join(d, f)))


def _artifact(db, chrom, name):
    p = os.path.join(rt.DATA, "graphs", db, chrom, name.rstrip("/"))
    if not os.path.exists(p):
        return [False, None]
    size = _dir_size(p) if os.path.isdir(p) else os.path.getsize(p)
    return [True, human(size)]


def probe(app, client, db, chrom, ref, sample, idx, meta, raw):
    """Every checkpoint on this page, against one real sample's real payload."""
    from pangyplot.db.path_codec import decode_combined, encode_combined, decode_steps
    from pangyplot.preprocess.ensure_paths import _needs_migration
    from pangyplot.db.path_codec import read_path_index

    out = {}

    def rec(key, ok, detail, weak=False):
        out[key] = rt.check(ok, detail, weak)

    pdir = _paths_dir(db, chrom)
    files = [f for f in os.listdir(pdir) if f.endswith(".binpath")] if os.path.isdir(pdir) else []
    rec("binpaths", bool(files),
        f"{len(files):,} .binpath files, {human(_dir_size(pdir))} total" if files else "none",
        weak=True)

    try:
        index = read_path_index(pdir)
        n_s = len(index.get("paths", {}))
        n_e = sum(len(v) for v in index.get("paths", {}).values())
        rec("index_json", n_e == len(files),
            f"v{index.get('version')}, {n_s:,} samples, {n_e:,} entries "
            f"({'matches' if n_e == len(files) else 'MISMATCH vs'} {len(files):,} files)")
    except Exception as e:
        rec("index_json", False, f"{type(e).__name__}: {e}")

    rec("migration", not _needs_migration(pdir),
        "index.json version is current; no legacy files found")

    # --- the codec, against the bytes the server actually served -----------
    import gzip as _gz
    combined = None
    try:
        combined = decode_combined(raw)
        again = encode_combined(combined)
        same_payload = _gz.decompress(again) == _gz.decompress(raw)
        rec("roundtrip", same_payload,
            f"{len(combined):,} steps decoded from the served bytes and re-encoded — "
            + ("the varint stream is byte-identical" if same_payload
               else "the varint stream DIFFERS"))
        rec("byte_stable", again == raw,
            "the whole .binpath re-encodes byte-for-byte" if again == raw else
            f"gzip container differs: {len(raw):,} B on disk vs {len(again):,} B re-encoded "
            f"(disk header mtime={int.from_bytes(raw[4:8], 'little')}, "
            f"current encoder writes mtime=0 at level {__import__('pangyplot.db.db_utils', fromlist=['x']).GZIP_LEVEL})")
    except Exception as e:
        rec("roundtrip", False, f"{type(e).__name__}: {e}")
        rec("byte_stable", False, f"{type(e).__name__}: {e}")

    if combined is not None:
        plain = len(combined) * 4  # int32 per step, the cheapest naive form
        rec("compression", len(raw) < plain,
            f"{human(len(raw))} on disk vs {human(plain)} as raw int32 — "
            f"{plain / max(len(raw), 1):.1f}x, {8 * len(raw) / max(len(combined), 1):.1f} bits/step")
        # the two Python decoders must agree
        try:
            head = decode_steps(raw)[:1000]
            same = all(f"{int(c) >> 1}{'+' if not int(c) & 1 else '-'}" == s
                       for c, s in zip(combined[:1000], head))
            rec("decodes", bool(len(combined)) and same,
                f"{len(combined):,} steps; decode_steps and decode_combined agree on the first {len(head):,}")
        except Exception as e:
            rec("decodes", False, f"{type(e).__name__}: {e}")
    else:
        rec("compression", False, "payload did not decode")
        rec("decodes", False, "payload did not decode")

    gfaidx = app.gfa_index[chrom]
    stepidx = app.step_index[(chrom, ref)]

    if combined is not None and len(combined):
        seg_ids = np.asarray(combined) >> 1
        max_seg = int(np.asarray(stepidx.segments).max())
        lo, hi = int(seg_ids.min()), int(seg_ids.max())
        n_bad = int((seg_ids < 0).sum())
        li = gfaidx.link_index
        n_seg = len(li.seg_index_offsets)
        rec("ids_exist", n_bad == 0 and hi < n_seg,
            f"segment ids {lo:,}–{hi:,}; {n_seg:,} segments in the link index"
            + (f"; reference path tops out at {max_seg:,}" if max_seg else ""))

        # contiguity: is every consecutive pair a real edge?
        edges = set(zip(np.asarray(li.from_ids).tolist(),
                        np.asarray(li.to_ids).tolist()))
        a = seg_ids[:-1].tolist()
        b = seg_ids[1:].tolist()
        broken = sum(1 for x, y in zip(a, b)
                     if (x, y) not in edges and (y, x) not in edges)
        rec("contiguous", broken == 0,
            f"{len(a):,} consecutive step pairs, {broken:,} not backed by a link in links.db")

        # does the decoded path's bp span match what /path-meta advertised?
        segments = np.asarray(stepidx.segments, dtype=np.int64)
        starts = np.asarray(stepidx.starts, dtype=np.int64)
        ends = np.asarray(stepidx.ends, dtype=np.int64)
        size = int(segments.max()) + 1
        seg_min = np.full(size, np.iinfo(np.int64).max, dtype=np.int64)
        seg_max = np.full(size, np.iinfo(np.int64).min, dtype=np.int64)
        np.minimum.at(seg_min, segments, starts)
        np.maximum.at(seg_max, segments, ends)
        known = seg_min != np.iinfo(np.int64).max
        s = seg_ids[(seg_ids >= 0) & (seg_ids < size)]
        s = s[known[s]]
        if s.size:
            got = (int(seg_min[s].min()), int(seg_max[s].max()))
        else:
            got = (None, None)
        want = (meta[idx].get("bp_start"), meta[idx].get("bp_end"))
        rec("span_matches_meta", got == want,
            f"decoded span {got[0]:,}–{got[1]:,} bp; /path-meta advertised "
            f"{want[0]:,}–{want[1]:,} bp" if got[0] is not None and want[0] is not None
            else f"decoded {got}, advertised {want}")
    else:
        for k in ("ids_exist", "contiguous", "span_matches_meta"):
            rec(k, False, "no decoded path")

    # --- /path-meta shape ---------------------------------------------------
    need = {"file", "full_id", "contig", "start", "is_ref", "bp_start", "bp_end"}
    ok = bool(meta) and all(need <= set(e) for e in meta)
    rec("meta_shape", ok,
        f"{len(meta)} subpath{'s' if len(meta) != 1 else ''} for {sample}, every entry carries "
        + ", ".join(sorted(need)) if ok else "missing keys")

    with_bp = [e for e in meta if e.get("bp_start") is not None]
    rec("meta_bp", len(with_bp) == len(meta) and bool(meta),
        f"{len(with_bp)}/{len(meta)} subpaths carry a precomputed bp range"
        + (" — the viewport filter works without fetching a byte" if len(with_bp) == len(meta) else ""))

    # --- the legacy routes, exercised for real ------------------------------
    q = quote(sample, safe="")
    bp0 = meta[idx].get("bp_start") or 0
    win = (bp0, bp0 + WINDOW)
    r = client.get(f"/path?genome={ref}&chromosome={chrom}&start={win[0]}&end={win[1]}&sample={q}")
    try:
        legacy = r.get_json() if r.status_code == 200 else None
    except Exception:
        legacy = None
    if isinstance(legacy, list) and legacy:
        steps = sum(len(p.get("path", [])) for p in legacy)
        rec("legacy_path", True,
            f"{len(legacy)} subpath{'s' if len(legacy) != 1 else ''}, {steps:,} bubble-annotated steps "
            f"for {win[0]:,}–{win[1]:,} bp ({len(r.data):,} B of JSON)")
    else:
        rec("legacy_path", False,
            f"HTTP {r.status_code}, returned {legacy!r} for {win[0]:,}–{win[1]:,} bp")

    r = client.get(f"/pathorder?genome={ref}&chromosome={chrom}")  # noqa: E501
    order = r.get_json() if r.status_code == 200 else None
    ok = isinstance(order, dict) and sample in order
    rec("legacy_pathorder", ok,
        f"{len(order):,} samples, {sample} → bit {order[sample]}" if ok
        else f"HTTP {r.status_code}")

    # --- and the claim that nothing calls them ------------------------------
    import subprocess
    js = os.path.join(ROOT, "pangyplot", "static", "js")
    hits = subprocess.run(["grep", "-rIl", "-e", "/pathorder", "-e", "'/path'", "-e", '"/path"', js],
                          capture_output=True, text=True).stdout.split()
    rec("no_js_caller", not hits,
        "no module under static/js/ requests /path or /pathorder"
        if not hits else f"{len(hits)} JS file(s) still call them")

    return out


def runbar(db, chrom, sample, idx, meta, raw, T, boot_err):
    if boot_err:
        return f'<span class="warn">boot failed: {boot_err}</span>'
    e = meta[idx]
    return (f'<span class="num">{db}/{chrom}</span> · <b class="num">{sample}</b> '
            f'subpath {idx} ({e.get("contig")}) — <b class="num">{human(len(raw))}</b> over the wire, '
            f'/path-meta <b class="num">{T["path_meta"]["s"] * 1000:.2f} ms</b> · '
            f'/path-data <b class="num">{T["path_data"]["s"] * 1000:.2f} ms</b> · '
            f'legacy /path <b class="num">{T["path_legacy"]["s"] * 1000:.0f} ms</b> '
            f'— the route it replaced, on the same sample')


def contexts():
    out = {}
    for db, chrom in rt.datasets():
        b = rt.boot(db)
        if b["error"] or not b["client"]:
            # an incomplete chromosome directory — nothing to serve, so nothing
            # to measure. ingest.html is the page that reports on those.
            print(f"  {db}/{chrom}: boot failed ({b['error']}) — skipped",
                  file=sys.stderr)
            continue
        app, client, ref = b["app"], b["client"], b["ref"]

        samples = client.get("/samples").get_json() or []
        if not samples:
            continue

        # a reference-ish sample and a couple of haplotypes: real names, no guessing
        picks = samples[:3]

        arts = {}
        for st in STAGES:
            for name, _k, _n in st.get("artifacts", []):
                arts[name] = _artifact(db, chrom, name)

        for sample in picks:
            # sample names carry a '#' (HG02145#1) — unencoded it truncates the
            # query string, which is exactly what buildUrl() in the browser avoids.
            q = quote(sample, safe="")
            m = rt.timed(client, f"/path-meta?sample={q}&chromosome={chrom}")
            meta = m["json"] or []
            if not isinstance(meta, list) or not meta:
                continue
            # the longest subpath is the interesting one
            idx = max(range(len(meta)),
                      key=lambda i: (meta[i].get("bp_end") or 0) - (meta[i].get("bp_start") or 0))

            url = f"/path-data?sample={q}&chromosome={chrom}&index={idx}"
            d = rt.timed(client, url)
            raw = client.get(url).data

            bp0 = meta[idx].get("bp_start") or 0
            lg = rt.timed(client,
                          f"/path?genome={ref}&chromosome={chrom}&start={bp0}"
                          f"&end={bp0 + WINDOW}&sample={q}", n=1)

            T = {"boot": {"s": b["boot_s"], "gb": None},
                 "path_meta": {"s": m["s"], "gb": None},
                 "path_data": {"s": d["s"], "gb": None},
                 "path_legacy": {"s": lg["s"], "gb": None}}
            T["total"] = {"s": sum(v["s"] or 0 for v in T.values()), "gb": None}

            try:
                pr = probe(app, client, db, chrom, ref, sample, idx, meta, raw)
            except Exception as e:
                print(f"  probe failed for {sample}: {type(e).__name__}: {e}", file=sys.stderr)
                continue

            label = f"{chrom} · {sample}"
            out[label] = {"line": runbar(db, chrom, sample, idx, meta, raw, T, None),
                          "timings": T, "probe": pr, "artifacts": arts}
    return out


PANELS = [
  {"cls": "flag", "title": "Live or legacy — the four path endpoints",
   "paras": [
     ("<code>/path-meta</code> — LIVE.",
      "Called by path-trace-engine.js the moment a sample is chosen. Reads index.json + the bp_ranges cache. No step data."),
     ("<code>/path-data</code> — LIVE.",
      "Called when a subpath row is clicked. Returns the .binpath file verbatim under Content-Encoding: gzip; the browser gunzips and path-codec.js decodes. This is the only route that ever ships step data."),
     ("<code>/path</code> — LEGACY, still working.",
      "Server-side window cut plus per-step bubble annotation, as JSON. No frontend module requests it. Kept alive by tests/routes/test_path_routes.py and by this page, which times it against the same sample it fetches the binpath for — so the cost of the design it replaced stays visible."),
     ("<code>/pathorder</code> — LEGACY, still working.",
      "Returns sample_idx.json: each sample's bit position in the link haplotype bitmask. Nothing fetches it. The file itself is not legacy at all — parse_paths writes it and the bitmask on every link in links.db is defined by it."),
     ("<code>/samples</code> — LIVE.",
      "Not a path route, but the one that starts this flow: it fills the sample dropdown, straight out of PathIndex."),
   ]},
  {"cls": "resume", "title": "Where the format is pinned",
   "paras": [
     (None,
      "Four implementations of one byte layout: <code>encode_combined</code> and <code>decode_combined</code> (numpy), "
      "<code>decode_steps</code> (scalar Python), and <code>decodeSteps</code>/<code>encodeSteps</code> in path-codec.js. "
      "Nothing at runtime cross-checks them."),
     ("What holds them together:",
      "tests/db/test_path_codec.py pins the Python side (zigzag, varint, round-trip, index.json I/O); "
      "tests/graph/path-codec.test.js pins the JS side (round-trip, deltas, reverse orientation). "
      "The checkpoint at the top of this page is the only place the two meet real data: it takes the exact bytes the "
      "server served, decodes them with numpy, re-encodes them, and asserts the result is byte-identical to what came off disk."),
   ]},
]
