"""Flow — `pangyplot run`: server boot.

From the argv line to a process that can answer a request. `run` does three
things before Flask exists at all (migrate paths, rebuild stale indexes,
rebuild stale skeletons), then create_app() wires Babel and the blueprint
around a set of per-chromosome indexes held on the app object for the life of
the process.

Every dataset in datastore/graphs/ is booted for real at build time, timed with
perf_counter, and then asked for a request. When the spec and the measurement
disagree, the spec is what is stale.
"""

import json
import os
import sys
import time
from types import SimpleNamespace

from core import ROOT

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _runtime

SLUG = "startup"
NAME = "pangyplot run"
TITLE = "<code>pangyplot run</code> — server boot"
SUB = ("A chromosome directory on disk goes in; a process that can answer <code>/select</code> "
       "comes out. Six stages, in order — three of them run <i>before</i> Flask exists. Every "
       "function links into your editor. Every dataset below was booted for real at build time.")
CTX_LABEL = "dataset"

STAGES = [
  {
    "id": "cli", "name": "Dispatch the command", "timing_key": None,
    "fns": [("pangyplot.py", "parse_args"),
            ("pangyplot/commands/run.py", "pangyplot_run")],
    "gist": "argparse routes `run` to pangyplot_run, which resolves --annotations (or picks one for you) and then hands off to the three preflight passes.",
    "inp": "--db, --ref, --dir, --port, optional --annotations and --debug",
    "out": "args, plus an annotation name that may not be the one you meant",
    "artifacts": [],
    "checks": [],
    "tests": [],
    "invariants": [],
    "notes": [
      ("An unspecified --annotations silently picks the most recently modified one",
       "run.py:33 sorts the subdirectories of <code>annotations/&lt;ref&gt;/</code> by mtime and takes "
       "<code>subdirs[0]</code>. With both <code>gencode48.chrY</code> and <code>gencode49</code> present, which "
       "gene set the server serves depends on which directory was touched last — a "
       "<code>cp -a</code>, a backup restore or a re-download flips it. The only signal is one "
       "<code>Found annotations:</code> line in the boot log."),
    ],
    "sub": [],
  },
  {
    "id": "preflight", "name": "Preflight — migrate and rebuild", "timing_key": "preflight",
    "fns": [("pangyplot/preprocess/ensure_paths.py", "ensure_paths"),
            ("pangyplot/db/indexes/ensure_indexes.py", "ensure_indexes"),
            ("pangyplot/preprocess/skeleton/generate_skeleton.py", "ensure_skeleton")],
    "gist": "Three passes over every chromosome directory before Flask is even imported: upgrade legacy path files, rebuild any index whose mmap files are missing, rebuild any skeleton that is missing or stamped with an incompatible version.",
    "inp": "datastore/graphs/<db>/*/",
    "out": "a chromosome directory that create_app can load without building anything",
    "artifacts": [],
    "checks": ["indexes_valid", "skeleton_valid"],
    "tests": ["tests/db/test_path_codec.py", "tests/preprocess/test_skeleton_geometry.py",
              "tests/preprocess/test_spine_builder.py"],
    "hang": True,
    "invariants": [
      ("The skeleton is the only artifact with a real staleness check",
       "ensure_skeleton reads the version stamped in <code>skeleton/meta.json.gz</code> and compares it "
       "through <code>is_compatible_version()</code>, so a format-breaking version bump forces a rebuild. "
       "<code>COMPATIBLE_VERSIONS</code> in version.py is the escape hatch: list a version there when the "
       "on-disk format did not change, remove it when it did. That set is what stops every "
       "existing datastore regenerating on an unrelated bump — and what makes it regenerate "
       "when it must."),
    ],
    "notes": [
      ("A malformed chromosome directory takes the whole boot down, with a raw sqlite error",
       "ensure_indexes.py:34 — <code>SegmentIndex.validate()</code> is false, so it constructs "
       "<code>SegmentIndex(chr_dir)</code>, which does <code>SELECT MAX(id) FROM segments</code>. "
       "<code>hprc.prepared/chrY</code> holds a stub segments.db with no tables (the raw .gfa.gz and "
       ".lay.tsv.gz sit in a nested <code>chrY/chrY/</code>), and boot dies with "
       "<code>sqlite3.OperationalError: no such table: segments</code> — no chromosome name in the "
       "message, no skip, no server. One unfinished directory under --db is fatal for all of them. "
       "Measured live: see the failing checkpoints on that dataset."),
      ("Preflight can quietly start a multi-hour rebuild",
       "None of the three passes ask. If <code>polychains.mmapindex/</code> is absent, ensure_indexes "
       "does not build it — but create_app will (see the next stage), and if a skeleton is absent "
       "ensure_skeleton runs the full grid-simplification pipeline here, before the port is ever "
       "bound. <code>pangyplot run</code> on a half-ingested chromosome is <code>pangyplot add</code> "
       "with a web server bolted on the end."),
      ("A wrong --ref writes a new spine instead of complaining",
       "generate_skeleton.py:130 — if <code>skeleton/spine.&lt;ref&gt;.json.gz</code> is missing, it is "
       "generated. Nothing checks --ref against the genome recorded in "
       "<code>steps.mmapindex/meta.json</code>. The evidence is in the repo: "
       "<code>datastore/graphs/drb1/DRB1/skeleton/</code> contains both "
       "<code>spine.gi|568815592.json.gz</code> (the real reference path) and "
       "<code>spine.GRCh38.json.gz</code> — the residue of someone booting DRB1 with the wrong --ref."),
    ],
    "sub": [
      {"name": "Migrating path files",
       "fns": [("pangyplot/preprocess/ensure_paths.py", "ensure_paths")],
       "gist": "Rewrite legacy .json / headered .binpath files as pure .binpath + index.json.",
       "cost": "No-op on a current datastore: _needs_migration() is three cheap directory checks."},
      {"name": "Rebuilding stale indexes",
       "fns": [("pangyplot/db/indexes/ensure_indexes.py", "ensure_indexes")],
       "gist": "Per chromosome, validate() each of Segment/Step/Link/Bubble and reconstruct the ones that fail; then delete any leftover *.quickindex.json.gz.",
       "cost": "validate() only checks that the .npy files and meta.json exist. It never reads the version it wrote into meta.json — so a v0.1.0 mmap index is loaded by a v0.2.0 server without a word. PolychainIndex is imported here but never validated: that rebuild is left to create_app."},
      {"name": "Rebuilding stale skeletons",
       "fns": [("pangyplot/preprocess/skeleton/generate_skeleton.py", "ensure_skeleton")],
       "gist": "Regenerate the skeleton if it is missing or version-incompatible; independently, backfill a missing spine or a missing polychain-data.json.gz.",
       "cost": "The one preflight pass that can run for hours. Missing skeleton → the whole topology + polyline + 8-level grid export pipeline, synchronously, before the server starts."},
    ],
  },
  {
    "id": "app_shell", "name": "Construct the Flask app", "timing_key": None,
    "fns": [("pangyplot/app.py", "create_app")],
    "gist": "Flask object, numpy-aware JSON encoder, Babel with an 11-locale list, then the two calls that do all the work: setup_cytoband and load_indexes.",
    "inp": "data_dir, db_name, annotation_name, ref, port",
    "out": "app — with .data_dir, .db_name, .debug_mode set before anything reads them",
    "artifacts": [],
    "checks": ["locale_selector"],
    "tests": [],
    "invariants": [
      ("The numpy JSON encoder is installed before any route can run",
       "app.json.default = NumpyJSONEncoder().default, on the second line of create_app. Every "
       "index on the app is backed by mmap'd numpy arrays, so a np.uint32 reaches jsonify on "
       "almost every route. Remove this line and /select, /chains and /detail-tiles all 500 with "
       "'Object of type uint32 is not JSON serializable'."),
    ],
    "notes": [
      ("get_locale prints on every request",
       "app.py:27-28 — <code>print(\"LOCALE\", lang)</code> followed by <code>print(lang)</code>. "
       "get_locale is the Babel locale selector <i>and</i> is called again by the "
       "<code>inject_locale</code> context processor, so a plain page render puts two lines of "
       "debug output on stdout. Under gunicorn that is two lines per request, forever."),
      ("The locale selector ignores its own allow-list",
       "BABEL_SUPPORTED_LOCALES is configured with 11 locales and then never consulted: "
       "get_locale returns <code>request.args.get(\"lang\") or \"en\"</code>, so any string a client "
       "sends as ?lang= is handed straight to Babel, and Accept-Language is never looked at."),
      ("babel is a module-level singleton",
       "app.py:22 — <code>babel = Babel()</code>. create_app called twice in one process (the test "
       "suite, a WSGI reloader, this atlas build) re-inits the same Babel object against a new "
       "app. Harmless today because the config is identical every time; it stops being harmless "
       "the moment it isn't."),
    ],
    "sub": [],
  },
  {
    "id": "cytoband", "name": "Load the ideogram", "timing_key": "cytoband",
    "fns": [("pangyplot/app.py", "setup_cytoband")],
    "gist": "Read .env, resolve ORGANISM to a genome, and parse that genome's cytoband + canonical chromosome files into app.cytoband. Degrades to an empty ideogram rather than failing.",
    "inp": ".env (ORGANISM, CYTOBAND_PATH, CANONICAL_PATH)",
    "out": "app.cytoband = {organism, genome, chromosomes, cytobands}",
    "artifacts": [],
    "checks": ["cytoband"],
    "tests": ["tests/test_setup_cytoband.py", "tests/routes/test_cytoband_routes.py"],
    "invariants": [
      ("ORGANISM=none must boot, not crash",
       "app.py:160-163 returns early with an empty chromosome list and an empty band dict. This "
       "is deliberate and tested (tests/test_setup_cytoband.py): the earlier code fell through to "
       "open(None). Do not 'fix' the empty case by substituting a default organism — a graph of a "
       "species with no UCSC cytoband is a supported configuration, and a fake ideogram would put "
       "wrong coordinates on the screen."),
    ],
    "notes": [
      ("The ideogram, not the datastore, decides what /chromosomes returns",
       "routes.py:88 — the default branch of /chromosomes returns "
       "<code>current_app.cytoband[\"chromosomes\"]</code>, the canonical list for the organism. "
       "app.chromosomes — the chromosomes actually loaded — is only consulted for "
       "<code>?noncanonical=true</code>. Boot with a single chromosome and /chromosomes still "
       "answers with all 24 of GRCh38. Verified live: the drb1 dataset, which has exactly one "
       "chromosome directory named DRB1, answers /chromosomes with chr1..chrY."),
    ],
    "sub": [],
  },
  {
    "id": "load_indexes", "name": "Load the indexes", "timing_key": "load_indexes",
    "fns": [("pangyplot/app.py", "load_indexes")],
    "gist": "For each chromosome directory: GFAIndex, StepIndex, BubbleIndex, PolychainIndex — each one either memory-maps its .npy arrays or rebuilds from SQLite and saves them. Everything the server serves for the rest of the process comes from these four dicts.",
    "inp": "datastore/graphs/<db>/<chrom>/*.mmapindex/",
    "out": "app.gfa_index[chrom], app.step_index[(chrom, ref)], app.bubble_index[chrom], app.polychain_index[chrom], app.annotation_index[ref]",
    "artifacts": [
      ("paths/bp_ranges.json", "json", "written here if absent — the one thing load_indexes creates"),
    ],
    "checks": ["gfa_index", "step_index", "bubble_index", "polychain_index"],
    "tests": ["tests/db/test_gfa_index.py", "tests/db/test_segment_index.py",
              "tests/db/test_link_index.py", "tests/db/test_step_index.py",
              "tests/db/test_bubble_index.py", "tests/db/test_polychain_index.py",
              "tests/db/test_annotation_index.py"],
    "invariants": [
      ("Every index constructor is `if not load_mmap_index(): build(); save()`",
       "SegmentIndex, LinkIndex, StepIndex, BubbleIndex and PolychainIndex all share the shape. "
       "It is what makes a warm boot ~20 ms instead of minutes, and it is why the server never "
       "needs to hold SQLite rows for the topology: numpy loads the arrays with "
       "<code>mmap_mode='r'</code>, so the pages are the OS page cache, shared between workers, and "
       "never counted twice. Add a field to any ARRAYS dict and you must also make the missing "
       "file a validate() failure, or old directories will load with the field absent."),
      ("Segment sequences never enter memory",
       "SegmentIndex keeps only length/gc/x1..y2/valid as arrays; <code>__getitem__</code> goes back "
       "to segments.db per id. The sequence column is the largest thing in the datastore and the "
       "server is designed never to hold it. LinkIndex is the same shape — arrays for topology, "
       "SQLite for the haplotype bitmask."),
    ],
    "notes": [
      ("StepIndex trusts --ref without checking it",
       "StepIndex.py:66 — load_mmap_index() does not open meta.json, so the <code>genome</code> field it "
       "wrote at build time is never compared with the genome it was constructed with. Boot "
       "<code>--db drb1 --ref GRCh38</code> and you get the gi|568815592 step arrays, indexed and served "
       "as GRCh38: every bp coordinate on the screen is silently from the wrong reference path. "
       "The rebuild-from-SQLite branch does honour the genome — so the bug only appears on the "
       "fast path, which is the only path a real boot takes."),
      ("A missing polychain index is built during boot",
       "app.py:108-112 — if PolychainIndex.validate() fails, load_indexes prints one line and then "
       "constructs it, which runs decompose_chain over every top-level chain (the hang candidate "
       "of the ingest flow). This is inside create_app, before app.run(), with no progress output "
       "beyond the log steps. ensure_indexes deliberately does not cover PolychainIndex, so this "
       "is the only place it can happen on a run."),
      ("The size report it prints is meaningless",
       "app.py:100-120 calls <code>pympler.asizeof</code> on every index and prints the result. The "
       "arrays are numpy mmaps, so asizeof sees the view object, not the mapping: hprc.clip/chrY "
       "reports <code>gfa_index size: 0.14 MB</code> for a 130 MB chromosome. It is a boot-time deep "
       "object traversal whose only output is a number that cannot be right."),
    ],
    "sub": [
      {"name": "GFAIndex", "timing_key": "load_indexes/gfa",
       "fns": [("pangyplot/db/indexes/GFAIndex.py", "GFAIndex")],
       "gist": "Composes SegmentIndex + LinkIndex + PathIndex — the first two mmap their .npy arrays, the third reads the paths/ directory listing.",
       "cost": "Cheap when warm: mmap'd .npy is an open() and an mmap(), not a read. PathIndex is the only member that touches SQLite at construction (path_db.summarize)."},
      {"name": "StepIndex", "timing_key": "load_indexes/step",
       "fns": [("pangyplot/db/indexes/StepIndex.py", "StepIndex")],
       "gist": "Three sorted uint32 arrays (starts, ends, segments) — the bp ↔ segment bridge every coordinate query crosses.",
       "cost": "Falling back to _build_from_db() means one row per step of the reference path, appended to a Python array — the difference between milliseconds and minutes on a real chromosome."},
      {"name": "BubbleIndex", "timing_key": "load_indexes/bubble",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "BubbleIndex")],
       "gist": "Eight arrays for range lookup plus a 1000-entry cache of Bubble objects lazily fetched from bubbles.db.",
       "cost": "load_mmap_index() then rebuilds prefix_max_x2 with a Python for-loop over every top-level bubble — the one O(n) Python loop on the warm path (BubbleIndex.py:128)."},
      {"name": "PolychainIndex", "timing_key": "load_indexes/polychain",
       "fns": [("pangyplot/db/indexes/PolychainIndex.py", "PolychainIndex")],
       "gist": "Three chain lookup arrays; the decompositions stay on disk as one gzip per chain, pulled through a 64-entry LRU on demand.",
       "cost": "Warm, it maps three .npy files and sets _decompositions = None. Cold, it is the whole chain-decomposition build — see the hazard above."},
      {"name": "AnnotationIndex", "timing_key": "load_indexes/annotation",
       "fns": [("pangyplot/db/indexes/AnnotationIndex.py", "AnnotationIndex")],
       "gist": "Loads the gene-name list from annotations.quickindex.json.gz — the only index still on the gzipped-JSON quick index rather than mmap.",
       "cost": "Only constructed if --annotations resolved to something. Unlike every other index it holds a real Python list of gene names; gene bodies stay in annotations.db."},
      {"name": "Subpath bp ranges", "timing_key": "load_indexes/bp_ranges",
       "fns": [("pangyplot/db/indexes/PathIndex.py", "compute_bp_ranges")],
       "gist": "Per sample, the bp span its haplotype covers — read from paths/bp_ranges.json, or computed and cached there on first boot.",
       "cost": "Cached: a json.load. Uncached: every .binpath is decoded and gathered against the step arrays — the one boot step whose cost scales with the number of haplotypes."},
    ],
  },
  {
    "id": "serve", "name": "Register routes and answer", "timing_key": "first_request",
    "fns": [("pangyplot/routes.py", "index"),
            ("pangyplot/routes.py", "chromosomes")],
    "gist": "register_blueprint(routes_bp) attaches every endpoint; a werkzeug log filter drops static-asset lines; app.run() binds the port. From here the app object is read-only and every route reads the indexes off current_app.",
    "inp": "an HTTP GET",
    "out": "JSON, or the rendered viewer",
    "artifacts": [],
    "checks": ["index_200", "chromosomes_200", "samples_200"],
    "tests": ["tests/routes/test_graph_routes.py", "tests/routes/test_cytoband_routes.py",
              "tests/routes/test_annotation_routes.py", "tests/routes/test_security.py"],
    "invariants": [
      ("The blueprint is registered after the indexes are loaded",
       "create_app calls load_indexes() and only then register_blueprint(). Every route reaches "
       "for current_app.gfa_index / .bubble_index / .cytoband with no existence check, so a route "
       "that could be served before load_indexes returned would AttributeError. Do not move the "
       "registration up to make the app importable earlier."),
    ],
    "notes": [
      ("/samples answers from whichever chromosome os.listdir happened to yield first",
       "routes.py:113 — <code>current_app.chromosomes[0]</code>. app.chromosomes is appended in "
       "os.listdir order (app.py:88), which is filesystem order, not sorted. For a multi-chromosome "
       "db the sample list is taken from an arbitrary chromosome; if the haplotype sets differ "
       "between chromosomes, which one you get depends on inode ordering."),
    ],
    "sub": [],
  },
]


# ---------------------------------------------------------------------------
# Contexts: boot every dataset in datastore/graphs/, for real
# ---------------------------------------------------------------------------

def _chr_dir(db, chrom):
    return os.path.join(ROOT, "datastore", "graphs", db, chrom)


def _ref_for(chr_dir):
    """The genome the step index was actually built with — not an assumption."""
    meta = os.path.join(chr_dir, "steps.mmapindex", "meta.json")
    try:
        with open(meta) as f:
            return json.load(f).get("genome") or "GRCh38"
    except Exception:
        return "GRCh38"


def _annotation_for(ref):
    """Reproduce run.py's mtime-newest pick, so the boot matches a real one."""
    d = os.path.join(ROOT, "datastore", "annotations", ref)
    if not os.path.isdir(d):
        return None
    subs = [s for s in os.listdir(d) if os.path.isdir(os.path.join(d, s))]
    if not subs:
        return None
    subs.sort(key=lambda s: os.path.getmtime(os.path.join(d, s)), reverse=True)
    return subs[0]


def _rss():
    try:
        import psutil
        return psutil.Process().memory_info().rss
    except Exception:
        return None


def _time(fn):
    t0 = time.perf_counter()
    try:
        fn()
        err = None
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    return time.perf_counter() - t0, err


def _preflight(db, ref):
    """Run the three passes run.py runs before Flask. No-ops on a built datastore."""
    from pangyplot.preprocess.ensure_paths import ensure_paths
    from pangyplot.db.indexes.ensure_indexes import ensure_indexes
    from pangyplot.preprocess.skeleton.generate_skeleton import ensure_skeleton
    data = os.path.join(ROOT, "datastore")
    ensure_paths(data, db)
    ensure_indexes(data, db, ref)
    ensure_skeleton(data, db, ref)


def _measure(db, chrom):
    """Boot this dataset, timing preflight, cytoband, each index, and a request."""
    chr_dir = _chr_dir(db, chrom)
    ref = _ref_for(chr_dir)
    ann = _annotation_for(ref)

    T, P = {}, {}

    def rec(key, ok, detail, weak=False):
        P[key] = _runtime.check(ok, detail, weak)

    pre_s, pre_err = _time(lambda: _preflight(db, ref))
    T["preflight"] = {"s": pre_s, "gb": None}

    r0 = _rss()
    b = _runtime.boot(db, ref, ann)
    r1 = _rss()
    app, client, err = b["app"], b["client"], b["error"]
    gb = (r1 - r0) / 1024 ** 3 if (r0 is not None and r1 is not None and r1 > r0) else None

    # Preflight failure and boot failure are the same failure here: the malformed
    # directory kills whichever runs first.
    boot_err = pre_err or err
    if not boot_err:
        T["load_indexes"] = {"s": b["boot_s"], "gb": gb}

    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.LinkIndex import LinkIndex
    from pangyplot.db.indexes.StepIndex import StepIndex
    from pangyplot.db.indexes.BubbleIndex import BubbleIndex
    from pangyplot.db.indexes.PolychainIndex import PolychainIndex

    idx_ok = all(c.validate(chr_dir) for c in
                 (SegmentIndex, LinkIndex, StepIndex, BubbleIndex))
    missing = [c.__name__ for c in (SegmentIndex, LinkIndex, StepIndex, BubbleIndex,
                                    PolychainIndex) if not c.validate(chr_dir)]
    rec("indexes_valid", idx_ok,
        "segment/link/step/bubble mmap indexes present"
        if idx_ok else "would be REBUILT on boot: " + ", ".join(missing), weak=True)

    sk = os.path.join(chr_dir, "skeleton")
    have_sk = os.path.exists(os.path.join(sk, "meta.json.gz")) and \
        os.path.exists(os.path.join(sk, "polylines.bin.gz"))
    spine = os.path.join(sk, f"spine.{ref}.json.gz")
    rec("skeleton_valid", have_sk and os.path.exists(spine),
        f"skeleton + spine.{ref} present" if have_sk and os.path.exists(spine)
        else "missing skeleton or spine — ensure_skeleton would rebuild it", weak=True)

    if boot_err:
        # Everything downstream of the crash is unmeasurable, and saying so is
        # the finding. Do not paper over it with a synthetic pass.
        for k in ("locale_selector", "cytoband", "gfa_index", "step_index",
                  "bubble_index", "polychain_index",
                  "index_200", "chromosomes_200", "samples_200"):
            rec(k, False, f"boot failed: {boot_err}")
        T["total"] = {"s": pre_s + b["boot_s"], "gb": None}
        return T, P, _line(db, chrom, ref, ann, T, boot_err)

    # -- cytoband, timed on its own (same call create_app makes) --------------
    from pangyplot.app import setup_cytoband
    probe_app = SimpleNamespace()
    cy_s, cy_err = _time(lambda: setup_cytoband(probe_app))
    T["cytoband"] = {"s": cy_s, "gb": None}
    cb = getattr(app, "cytoband", {}) or {}
    rec("cytoband", bool(cb.get("cytobands")) and not cy_err,
        f"{cb.get('organism')} / {cb.get('genome')} — "
        f"{len(cb.get('chromosomes') or [])} canonical chromosomes"
        if cb.get("cytobands") else f"no bands ({cy_err or cb.get('organism')})")

    rec("locale_selector", app.config.get("BABEL_DEFAULT_LOCALE") == "en",
        f"babel default 'en', {len(app.config.get('BABEL_SUPPORTED_LOCALES') or [])} supported locales")

    # -- each index, re-constructed against the same directory ---------------
    # create_app does not expose per-index timings, so time the identical
    # constructor call on the already-booted directory. Warm, so these are a
    # lower bound on the boot's own cost, never an upper one.
    gfa_holder = {}

    def _gfa():
        from pangyplot.db.indexes.GFAIndex import GFAIndex
        gfa_holder["i"] = GFAIndex(chr_dir)

    T["load_indexes/gfa"] = {"s": _time(_gfa)[0], "gb": None}
    gfa = gfa_holder["i"]
    T["load_indexes/step"] = {"s": _time(lambda: StepIndex(chr_dir, ref))[0], "gb": None}
    T["load_indexes/bubble"] = {"s": _time(lambda: BubbleIndex(chr_dir, gfa))[0], "gb": None}

    step = StepIndex(chr_dir, ref)
    bub = BubbleIndex(chr_dir, gfa)
    T["load_indexes/polychain"] = {
        "s": _time(lambda: PolychainIndex(chr_dir, bub, gfa, step, ref))[0], "gb": None}

    if ann:
        from pangyplot.db.indexes.AnnotationIndex import AnnotationIndex
        ann_dir = os.path.join(ROOT, "datastore", "annotations", ref, ann)
        T["load_indexes/annotation"] = {
            "s": _time(lambda: AnnotationIndex(ann, ann_dir))[0], "gb": None}

    T["load_indexes/bp_ranges"] = {
        "s": _time(lambda: gfa.path_index.compute_bp_ranges(step))[0], "gb": None}

    rec("gfa_index", chrom in app.gfa_index,
        f"{len(app.gfa_index[chrom].segment_index):,} segments, "
        f"{len(app.gfa_index[chrom].link_index):,} links, "
        f"{len(app.gfa_index[chrom].path_index)} samples"
        if chrom in app.gfa_index else "not on the app object")
    rec("step_index", (chrom, ref) in app.step_index,
        f"{len(app.step_index[(chrom, ref)].starts):,} steps of {ref}"
        if (chrom, ref) in app.step_index else f"no step index for ({chrom}, {ref})")
    rec("bubble_index", chrom in app.bubble_index,
        f"{len(app.bubble_index[chrom].ids):,} top-level bubble ranges"
        if chrom in app.bubble_index else "not on the app object")
    rec("polychain_index", chrom in app.polychain_index,
        f"{len(app.polychain_index[chrom].chain_ids):,} chains"
        if chrom in app.polychain_index else "not on the app object")

    # -- the request the whole boot exists to answer -------------------------
    home = _runtime.timed(client, "/")
    chrs = _runtime.timed(client, "/chromosomes")
    samples = _runtime.timed(client, "/samples")
    T["first_request"] = {"s": home["s"], "gb": None}

    rec("index_200", home["status"] == 200,
        f"GET / → {home['status']}, {home['bytes'] / 1024:.0f} KB in {home['s'] * 1000:.0f} ms")
    n_chr = len(chrs["json"] or []) if isinstance(chrs["json"], list) else 0
    rec("chromosomes_200", chrs["status"] == 200,
        f"GET /chromosomes → {chrs['status']}, {n_chr} chromosomes "
        f"(loaded: {', '.join(app.chromosomes)})")
    n_s = len(samples["json"] or []) if isinstance(samples["json"], list) else 0
    rec("samples_200", samples["status"] == 200,
        f"GET /samples → {samples['status']}, {n_s} samples")

    T["total"] = {"s": pre_s + b["boot_s"] + (home["s"] or 0), "gb": gb}
    return T, P, _line(db, chrom, ref, ann, T, None)


def _line(db, chrom, ref, ann, T, err):
    s = (f'<span class="num">{db}/{chrom}</span> — booted with '
         f'<code>--ref {ref}</code>'
         + (f' <code>--annotations {ann}</code>' if ann else " and no annotations"))
    if err:
        return s + f' — <span class="warn">boot FAILED: {err}</span>'
    total = T.get("total", {}).get("s")
    gb = T.get("load_indexes", {}).get("gb")
    s += f' — ready in <b class="num">{total * 1000:.0f} ms</b>'
    s += (f', RSS +<b class="num">{gb * 1024:.0f} MB</b>' if gb
          else ", no measurable RSS growth")
    return s


def contexts():
    out = {}
    for db, chrom in _runtime.datasets():
        label = f"{db}/{chrom}"
        try:
            T, P, line = _measure(db, chrom)
        except Exception as e:
            print(f"  measure failed for {label}: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        out[label] = {"line": line, "timings": T, "probe": P, "artifacts": {}}
    return out


PANELS = [
  {"cls": "flag", "title": "Warm boot vs cold boot",
   "paras": [
     ("Warm.", "Every index is a set of .npy files opened with <code>mmap_mode='r'</code>. Nothing is "
      "read at boot — the arrays are mappings, and the pages arrive when a request touches them. "
      "A fully built chromosome boots in tens of milliseconds and grows RSS by almost nothing, "
      "which is exactly what the measurements above show. The datastore, not the process, is "
      "where the chromosome lives."),
     ("Cold.", "Every one of those constructors has a second branch. If the .npy files are absent, "
      "the same call rebuilds the index from SQLite and saves it — and PolychainIndex's rebuild is "
      "the full chain decomposition. There is no flag for this and no prompt: the presence of a "
      "directory is the whole decision. A boot that takes hours and a boot that takes 20 ms are "
      "the same code path with a different filesystem underneath it."),
     ("Which one you get.", "<code>validate()</code> on every index checks only that the files exist. "
      "The version each index stamps into its own meta.json is written and never read back. Only "
      "the skeleton and the path index actually compare versions — so a format change to any mmap "
      "index will be loaded, silently, by a server that no longer agrees with it."),
   ]},
  {"cls": "resume", "title": "What is on the app object when boot returns",
   "paras": [
     (None, "Everything the process will ever serve, keyed by chromosome, with no lock and no "
      "invalidation. <code>app.gfa_index[chrom]</code>, <code>app.bubble_index[chrom]</code>, "
      "<code>app.polychain_index[chrom]</code> and <code>app.annotation_index[ref]</code> are keyed "
      "by chromosome alone; <code>app.step_index[(chrom, ref)]</code> is the only one keyed by "
      "genome — and only ever with the single --ref the process was started with."),
     ("One ref per process.", "<code>app.genome = ref</code>. Serving two reference genomes means two "
      "processes. The (chrom, ref) tuple key looks like it anticipates more, but load_indexes only "
      "ever fills one ref, and every route that reads it passes <code>current_app.genome</code>."),
     ("Nothing is reloaded.", "The indexes are built once, in create_app, and read for the life of "
      "the process. Re-running <code>pangyplot add</code> under a running server leaves that server "
      "serving the old arrays from mappings whose backing files have been replaced."),
   ]},
]
