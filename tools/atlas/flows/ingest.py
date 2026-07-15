"""Flow — `pangyplot add`: the ingest pipeline.

A GFA file and an odgi layout go in; a chromosome directory the server can
memory-map comes out. The stages below are traced from add.py, in the order it
runs them. Status is measured against every real chromosome directory in
datastore/graphs/ at build time -- when the spec and the measurement disagree,
the spec is what is stale.
"""

import glob
import gzip
import json
import os
import sqlite3
import sys

from core import ROOT, human

SLUG = "ingest"
NAME = "pangyplot add"
TITLE = "<code>pangyplot add</code> — the ingest pipeline"
SUB = ("A GFA file and an odgi layout go in; a chromosome directory the server can "
       "memory-map goes out. Six stages, in order. Every function links into your editor. "
       "Status is probed live against a real dataset — pick one.")
CTX_LABEL = "dataset"

STAGES = [
  {
    "id": "parse_layout", "name": "Parse layout", "timing_key": "parsing_layout",
    "fns": [("pangyplot/preprocess/parser/parse_layout.py", "parse_layout")],
    "gist": "Read the odgi layout TSV into packed float arrays, so the GFA pass can stamp x/y onto every segment as it writes.",
    "inp": "the --layout TSV (two rows per segment: start point, end point)",
    "out": "OdgiLayout — four array('d')s, in memory only",
    "artifacts": [],
    "checks": [],
    "tests": ["tests/preprocess/test_parse_layout.py"],
    "notes": [],
    "invariants": [
      ("The layout must be dropped the moment parsing ends", "add.py `del`s layout_coords and calls memory.release() right after parse_gfa. Nothing downstream reads it — segments carry their own coords from there on — but if it stays in scope it sits underneath every later peak. As packed arrays it's 32 B/segment (it used to be a dict per segment, ~300 B, i.e. 0.32 G on chrY). Don't reintroduce a reference to it."),
    ],
    "sub": [],
  },
  {
    "id": "parsing_gfa_file", "name": "Parse GFA", "timing_key": "parsing_gfa_file",
    "fns": [("pangyplot/preprocess/parser/parse_gfa.py", "parse_gfa")],
    "gist": "Two passes over the GFA text. Everything downstream reads the three primitives this writes; nothing re-reads the GFA again.",
    "inp": "the --gfa file, --ref, layout coords",
    "out": "PathIndex, SegmentIndex, LinkIndex",
    "artifacts": [
      ("segments.db", "sqlite", "id, length, gc/n counts, x1..y2, seq"),
      ("links.db", "sqlite", "from/to + strand, haplotype bitmask, frequency"),
      ("step_index.db", "sqlite", "bp start/end per step of the reference path"),
      ("paths/", "binary", "one .binpath per haplotype + sample_idx.json"),
      ("segments.mmapindex/", "numpy", "built on SegmentIndex construction"),
      ("links.mmapindex/", "numpy", "built on LinkIndex construction"),
    ],
    "checks": ["segments", "links", "steps"],
    "tests": ["tests/preprocess/test_parse_gfa_lines.py", "tests/preprocess/test_parse_pipeline.py", "tests/db/test_segment_index.py", "tests/db/test_link_index.py"],
    "invariants": [],
    "notes": [
      ("The layout is joined by LINE ORDER, not segment id", "parse_gfa.py:63 — `coords = layout[seg_count]`. The Nth S-line gets the Nth layout row. No length check between the two files. A GFA whose S-lines aren't in odgi's order silently produces wrong coordinates for the entire chromosome — and every downstream artifact (bubble bboxes, skeleton polylines, polychain ranges, meta.json) is derived from them. The Bandage branch, right below it, keys by segment id and behaves as you'd expect."),
    ],
    "sub": [
      {"name": "Gathering paths", "timing_key": "parsing_gfa_file/gathering_paths_from_gfa",
       "fns": [("pangyplot/preprocess/parser/gfa/parse_paths.py", "parse_paths")],
       "gist": "Pass 1: every P/W line → its own .binpath file; pick the reference; build the edge→haplotype bitmask table the link pass needs.",
       "cost": "Memory hotspot. `path_dict` gets one entry per distinct adjacent step pair across all haplotypes, keyed by a tuple of two Python strings ('123+','124+') — ~200-250 B each, scaling with the number of oriented links. It stays resident through the whole segments+links pass. parse_line_P also does cols[2].split(',') — a full Python list of an entire path line, which on chr1 is hundreds of MB by itself."},
      {"name": "Gathering segments + links", "timing_key": "parsing_gfa_file/gathering_segments_and_links_from_gfa",
       "fns": [("pangyplot/preprocess/parser/parse_gfa.py", "_parse_segments_and_links")],
       "gist": "Pass 2: stream S-lines into segments.db (joining layout by ordinal) and L-lines into links.db (attaching the bitmask), in 20k-row batches.",
       "cost": "Streaming and batched — the DB writes are fine. VACUUM on segments.db rewrites the whole thing including sequences: transient 2× disk."},
    ],
  },
  {
    "id": "finding_bubbles", "name": "Find bubbles", "timing_key": "finding_bubbles",
    "fns": [("pangyplot/preprocess/bubble/bubble_gun.py", "shoot")],
    "gist": "Build the bidirected graph, contract unary paths, detect superbubbles, thread them into chains, nest them by parent, write the hierarchy.",
    "inp": "SegmentIndex + LinkIndex, iterated straight out of SQLite",
    "out": "bubbles.db (the returned graph is discarded)",
    "artifacts": [
      ("bubbles.db", "sqlite", "one row per bubble: chain, parent, source/sink/inside, ranges, bbox"),
      ("steps.mmapindex/", "numpy", "side effect — StepIndex is first constructed here"),
    ],
    "checks": ["bubbles", "fingerprint"],
    "tests": ["tests/preprocess/test_flat_graph.py", "tests/preprocess/test_flat_bubbles.py", "tests/preprocess/test_flat_chains.py", "tests/preprocess/test_compacted_bubble_length.py", "tests/db/test_bubble_index.py"],
    "flag": True,
    "invariants": [
      ("Chain and bubble numbering is derived from segment ids — never from iteration order", "flat_chains.py:142 sorts chains by their end-node segment-id pair before assigning ids, because iterating BubbleGun's set-of-strings renumbered chains on every run. find_parents sorts ascending then REVERSES rather than sorting descending, because Python's stable sort makes those two differ on ties — and the tie decides the parent. Change how bubbles are keyed, deduped, sorted or reversed and you renumber every bubble in bubbles.db, invalidating bubbles.mmapindex, polychains.mmapindex, the skeleton's chain annotations and polychain-data.json.gz at once."),
      ("Absorbed nodes' lengths are deliberately NOT summed into the absorber", "flat_graph.py:185 — merge_node never did it, and bubble.length has to keep matching the existing datastore. It looks like a bug. It isn't."),
    ],
    "notes": [
      ("Legacy holds the whole sequence through compaction", "bubble_gun.py:27 copies segment.seq onto every Node; the loop that blanks them runs only AFTER compact_graph. The flat path never copies seq — but build_flat_graph still does `list(segment_idx)`, materializing every Segment row (seq included) before packing."),
    ],
    "sub": [
      {"name": "Building the graph", "timing_key": "finding_bubbles/loading_bubblegun",
       "alt_timing_key": "finding_bubbles/building_graph",
       "fns": [("pangyplot/preprocess/bubble/flat_graph.py", "build_flat_graph"),
               ("pangyplot/preprocess/bubble/bubble_gun.py", "to_bubblegun_obj")],
       "gist": "One adjacency structure over every segment and link: CSR numpy arrays (flat) or a BubbleGun.Node per segment (legacy).",
       "cost": "THE hotspot on the legacy path. A BubbleGun.Node is ~1 KB and almost none of it is payload — two empty Python sets are 432 B, two parent frozensets another 432 B, optional_info another 272 B. On chrY (1.05 M nodes) that's 1.06 G of node objects. The same graph as CSR is ~57 MB. chr1 is an order of magnitude bigger: this is where the ~13 G peak comes from."},
      {"name": "Compacting", "timing_key": "finding_bubbles/compacting_graph",
       "fns": [("pangyplot/preprocess/bubble/flat_graph.py", "compact")],
       "gist": "Contract maximal unbranching runs into single nodes, so detection only sees branch structure.",
       "cost": "Allocates a whole second FlatGraph before dropping the first — a transient 2× on the graph arrays. Absorbed nodes' seq_len/gc/n are deliberately NOT summed into the absorber, because merge_node never did and bubble.length must keep matching the existing datastore."},
      {"name": "Detecting + chaining", "timing_key": "finding_bubbles/finding_bubbles_and_chains",
       "fns": [("pangyplot/preprocess/bubble/flat_bubbles.py", "find_bubbles"),
               ("pangyplot/preprocess/bubble/flat_chains.py", "connect_bubbles"),
               ("pangyplot/preprocess/bubble/flat_chains.py", "find_parents")],
       "gist": "Run the superbubble algorithm from every node in both directions, dedup, thread into chains, assign each bubble its tightest container.",
       "cost": "Time + memory. _find_sb runs 2N times, each allocating fresh seen/visited/S sets. find_parents then builds a Python set of every node of every bubble simultaneously (double-counting heavily under nesting), inverts it per node, and does a subset test per candidate — the quadratic-ish term on a deeply nested graph."},
      {"name": "Indexing", "timing_key": "finding_bubbles/indexing_bubbles",
       "fns": [("pangyplot/preprocess/bubble/construct_bubble_index_flat.py", "construct_bubble_index")],
       "gist": "Turn every detected bubble into a domain Bubble (bp ranges, bbox, GC/N) and bulk-insert the hierarchy.",
       "cost": "The file's own docstring concedes it: memory is not won here. find_children needs every bubble at once, Chain assigns siblings across a whole chain, and insert_bubbles takes the entire list. +0.49 G. Also: link_idx is threaded through the signature and never read — it just keeps a LinkIndex alive across the highest-memory step."},
    ],
  },
  {
    "id": "building_polychain_index", "name": "Build polychain index", "timing_key": "building_polychain_index",
    "fns": [("pangyplot/db/indexes/PolychainIndex.py", "PolychainIndex._build")],
    "gist": "Precompute, per top-level chain, the multi-level decomposition the detail view needs — so a /detail-tiles request becomes a file read instead of a graph traversal.",
    "inp": "BubbleIndex, GFAIndex, StepIndex",
    "out": "chain arrays + one decomposition per chain",
    "artifacts": [
      ("polychains.mmapindex/", "numpy", "chain_x1/x2/ids .npy + meta.json"),
      ("polychains.mmapindex/decomp/", "gzip json", "one file per chain"),
      ("polychain-data.json.gz", "gzip json", "the single blob the frontend fetches"),
      ("bubbles.mmapindex/", "numpy", "side effect of BubbleIndex construction"),
    ],
    "checks": ["polychain", "polychain_data"],
    "tests": ["tests/db/test_polychain_index.py", "tests/db/test_chain_polyline.py", "tests/db/test_layout_export.py"],
    "hang": True,
    "invariants": [],
    "notes": [
      ("The whole chromosome is fetched with an infinite-range query", "PolychainIndex.py:51 — `get_top_level_bubbles_by_layout(-inf, +inf)`. The same method /select uses for a viewport is handed an unbounded one, so the bisect narrowing is a no-op and every top-level Bubble is materialized at once. create_chains then batch-fetches every remaining bubble in every chain: bubbles.db effectively becomes live Python objects."),
      ("_find_bypass copies the whole path on every BFS edge", "chain_polyline.py:157 — `new_path = path + [nxt]`, inside a BFS whose queue holds one such list per node. O(V²) time and memory inside a single tangled superbubble, in a loop that prints nothing until it finishes. This is what a 'hang' with no output actually looks like."),
      ("One gzip file per chain", "Tens of thousands of tiny files per chromosome. Cheap to serve (LRU of 64), expensive to create, copy or back up — and export_polychain_data then re-reads all of them twice."),
    ],
    "sub": [
      {"name": "Loading top-level bubbles", "timing_key": "building_polychain_index/loading_top-level_bubbles",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "get_top_level_bubbles_by_layout")],
       "gist": "Pull every parentless bubble out of bubbles.db.", "cost": ""},
      {"name": "Assembling chains", "timing_key": "building_polychain_index/assembling_chains",
       "fns": [("pangyplot/db/indexes/BubbleIndex.py", "create_chains")],
       "gist": "Group by chain id and back-fill every sibling from SQLite so each Chain is complete.", "cost": ""},
      {"name": "Decomposing chains", "timing_key": "building_polychain_index/decomposing_chains",
       "fns": [("pangyplot/db/chain_polyline.py", "decompose_chain")],
       "gist": "Per chain: recursively (≤5 levels) expand oversized bubbles into child chains, build a polyline per sub-chain, flood-fill the bypass (deletion-allele) segments.",
       "cost": "The hang candidate. Nothing is streamed — every chain's decomposition is held until the save step. And _find_bypass runs its path-copying BFS once per decomposed superbubble."},
      {"name": "Saving", "timing_key": "building_polychain_index/saving_polychain_index",
       "fns": [("pangyplot/db/indexes/PolychainIndex.py", "_save_mmap_index")],
       "gist": "Write the lookup arrays as .npy and each chain's decomposition as its own gzip.", "cost": ""},
      {"name": "Exporting polychain data", "timing_key": "building_polychain_index/exporting_polychain_data",
       "fns": [("pangyplot/preprocess/skeleton/export_polychain.py", "export_polychain_data")],
       "gist": "Re-read the decomp files, compute the junction graph that stitches chains together, stream one combined blob.",
       "cost": "Reads every decomp file twice — once to build the junction graph, once to stream out."},
    ],
  },
  {
    "id": "bp_ranges", "name": "Compute subpath bp ranges", "timing_key": "computing_subpath_bp_ranges",
    "fns": [("pangyplot/db/indexes/PathIndex.py", "compute_bp_ranges")],
    "gist": "Work out the bp span each sample's path covers, so the viewer can tell which haplotypes intersect a region without decoding them.",
    "inp": "StepIndex arrays + paths/*.binpath",
    "out": "paths/bp_ranges.json",
    "artifacts": [("paths/bp_ranges.json", "json", "pure cache — if it exists, the step is a no-op")],
    "checks": ["bp_ranges"],
    "tests": ["tests/db/test_path_codec.py", "tests/routes/test_path_routes.py"],
    "invariants": [],
    "notes": [],
    "sub": [],
  },
  {
    "id": "building_skeleton", "name": "Build skeleton", "timing_key": "building_skeleton",
    "fns": [("pangyplot/preprocess/skeleton/generate_skeleton.py", "generate_skeleton")],
    "gist": "Collapse the graph into linear runs, grid-simplify at eight zoom levels, export one binary mipmap — so the low-zoom canvas can draw a whole chromosome without touching SQLite.",
    "inp": "chr_dir (re-opens its own GFAIndex)",
    "out": "skeleton/ + meta.json",
    "artifacts": [
      ("skeleton/polylines.bin.gz", "binary", "delta-encoded int32 coords, per grid level"),
      ("skeleton/meta.json.gz", "gzip json", "per-level metadata + the version string used for staleness checks"),
      ("skeleton/spine.<ref>.json.gz", "gzip json", "every 50th step of the reference, as (x,y,bp)"),
      ("meta.json", "json", "whole-graph stats the frontend tunes itself from"),
    ],
    "checks": ["skeleton", "meta"],
    "tests": ["tests/preprocess/test_skeleton_geometry.py", "tests/preprocess/test_spine_builder.py"],
    "invariants": [],
    "notes": [
      ("Chain annotation degrades silently", "If the segment→bubble or bubble→chain map comes back None, chain_ids stays None and the skeleton exports with chain_ids = -1 everywhere. No error, no warning — just a missing summary line."),
      ("Nine copies of the geometry at once", "export_binary accumulates the simplified polylines for EVERY level before writing anything — ~9 simplified copies of the chromosome resident simultaneously, on top of the originals."),
    ],
    "sub": [
      {"name": "Graph topology", "timing_key": "building_skeleton/computing_graph_topology",
       "fns": [("pangyplot/preprocess/skeleton/skeleton_pipeline.py", "find_linear_runs")],
       "gist": "Find every node whose degree isn't 2, walk the degree-2 chains between them: millions of nodes become a set of linear runs.", "cost": ""},
      {"name": "Polylines", "timing_key": "building_skeleton/building_polylines",
       "fns": [("pangyplot/preprocess/skeleton/skeleton_pipeline.py", "run_to_polyline")],
       "gist": "Turn each run of segment ids into an actual sequence of layout points.",
       "cost": "Full materialization — two Python floats per segment, nested lists, every segment in the chromosome, alive until export finishes."},
      {"name": "Reference spine", "timing_key": "building_skeleton/building_reference_spine",
       "fns": [("pangyplot/preprocess/spine/spine_builder.py", "generate_spine")],
       "gist": "Sample every 50th reference step into a point cloud, so screen position maps back to a genomic coordinate.", "cost": ""},
      {"name": "Annotating chains", "timing_key": "building_skeleton/annotating_chains",
       "fns": [("pangyplot/preprocess/skeleton/skeleton_pipeline.py", "compute_run_chain_ids")],
       "gist": "Tag each run with the chain it belongs to, so the skeleton can be coloured and filtered by chain.", "cost": ""},
      {"name": "Exporting", "timing_key": "building_skeleton/exporting_skeleton",
       "fns": [("pangyplot/preprocess/skeleton/skeleton_pipeline.py", "export_binary")],
       "gist": "Grid-simplify per zoom level, delta-encode as int32, write the mipmap.", "cost": ""},
      {"name": "Graph metadata", "timing_key": "building_skeleton/computing_graph_metadata",
       "fns": [("pangyplot/preprocess/meta.py", "generate_meta")],
       "gist": "Derive whole-graph stats (counts, extent, density) the frontend tunes its force sim from.",
       "cost": "Constructs a fourth GFAIndex in the same run rather than reusing one."},
    ],
  },
]

RESUME = {
  "how": "add.py builds GFAIndex(chr_path) inside a try. That construction ends up doing SELECT MAX(id) FROM segments. If segments.db has no segments table, sqlite raises OperationalError, it's caught, and the run goes down the parse path. If it IS populated, the exception never fires and parse_layout + parse_gfa are BOTH skipped. The reuse decision is made by 'does a readable segments table exist' — not by any flag.",
  "force": "--force skips the prompts and rmtree()s the chromosome directory, so it always re-parses. It does NOT imply --retry.",
  "retry": "--retry only suppresses deletion — and it BEATS --force: with both flags the directory survives. Nothing validates that the preserved index is complete or was built by the current code.",
  "trap": "Every later stage is silently resumable too. SegmentIndex, StepIndex, BubbleIndex and PolychainIndex all do `if not load_mmap_index(): build(); save()`. So on a --retry run, if polychains.mmapindex/meta.json exists, the ENTIRE polychain stage is skipped with no message and no timing row. There is no version check on it (the skeleton does check) and no content check beyond 'the files exist'. Change decompose_chain, re-run with --retry, and you get the old decompositions.",
}

FLAG = {
  "env": "PANGYPLOT_FLAT_BUBBLES",
  "read_at": ("pangyplot/preprocess/bubble/bubble_gun.py", 73),
  "same": "Byte-identical bubbles.db. Both backends share the tail — find_children, Chain sibling assignment and insert_bubbles all live in common modules — which is why the outputs cannot drift. Diff them with tools/fingerprint_bubbles.py.",
  "differs": "Peak RSS: 3.22 G → 1.68 G on chrY. And the timing keys: shoot_flat labels its first step 'Building graph', so the flat run emits finding_bubbles/building_graph where the legacy run emits finding_bubbles/loading_bubblegun. Anything keyed on those slugs silently loses the row when the backend flips.",
}

def _f(chr_dir, *p):
    return os.path.join(chr_dir, *p)


def _size(path):
    if os.path.isdir(path):
        return sum(
            os.path.getsize(os.path.join(dp, f))
            for dp, _, fs in os.walk(path) for f in fs
        )
    return os.path.getsize(path) if os.path.exists(path) else 0


def _rows(db, table):
    try:
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        n = c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        c.close()
        return n
    except Exception:
        return None


def probe(chr_dir):
    """Run every checkpoint against a real chromosome directory."""
    from pangyplot.db.indexes.SegmentIndex import SegmentIndex
    from pangyplot.db.indexes.LinkIndex import LinkIndex
    from pangyplot.db.indexes.StepIndex import StepIndex
    from pangyplot.db.indexes.BubbleIndex import BubbleIndex
    from pangyplot.db.indexes.PolychainIndex import PolychainIndex

    out = {}

    def rec(key, ok, detail, weak=False):
        out[key] = {"ok": ok, "detail": detail, "weak": weak}

    n = _rows(_f(chr_dir, "segments.db"), "segments")
    rec("segments", SegmentIndex.validate(chr_dir) and bool(n),
        f"{n:,} segments" if n else "no segments table", weak=True)

    n = _rows(_f(chr_dir, "links.db"), "links")
    rec("links", LinkIndex.validate(chr_dir) and bool(n),
        f"{n:,} links" if n else "no links table", weak=True)

    rec("steps", StepIndex.validate(chr_dir), "steps.mmapindex present", weak=True)

    n = _rows(_f(chr_dir, "bubbles.db"), "bubbles")
    rec("bubbles", BubbleIndex.validate(chr_dir) and bool(n),
        f"{n:,} bubbles" if n else "no bubbles table", weak=True)

    # The one checkpoint with real content semantics: a hash over canonical rows.
    try:
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        from fingerprint_bubbles import fingerprint
        h, cnt = fingerprint(chr_dir)
        rec("fingerprint", True, f"sha {h} over {cnt:,} bubbles")
    except SystemExit:
        rec("fingerprint", False, "no bubbles.db")
    except Exception as e:
        rec("fingerprint", False, f"{type(e).__name__}: {e}")

    ok = PolychainIndex.validate(chr_dir)
    d = _f(chr_dir, "polychains.mmapindex", "decomp")
    cnt = len(os.listdir(d)) if os.path.isdir(d) else 0
    rec("polychain", ok, f"{cnt:,} chain decompositions" if ok else "missing", weak=True)

    p = _f(chr_dir, "polychain-data.json.gz")
    rec("polychain_data", os.path.exists(p), human(_size(p)) if os.path.exists(p) else "missing")

    p = _f(chr_dir, "paths", "bp_ranges.json")
    if os.path.exists(p):
        try:
            rec("bp_ranges", True, f"{len(json.load(open(p))):,} samples")
        except Exception:
            rec("bp_ranges", True, "present")
    else:
        rec("bp_ranges", False, "missing")

    sk = _f(chr_dir, "skeleton")
    if os.path.isdir(sk):
        try:
            meta = json.load(gzip.open(_f(sk, "meta.json.gz"), "rt"))
            lv = len(meta.get("levels", meta.get("grids", [])) or [])
            v = meta.get("version", "?")
            rec("skeleton", True, f"v{v}, {lv} zoom levels, {human(_size(sk))}")
        except Exception:
            rec("skeleton", True, f"present ({human(_size(sk))})")
    else:
        rec("skeleton", False, "missing")

    p = _f(chr_dir, "meta.json")
    rec("meta", os.path.exists(p), "present" if os.path.exists(p) else "missing")

    return out


def read_timings(chr_dir):
    p = _f(chr_dir, "timings.tsv")
    if not os.path.exists(p):
        return {}
    t = {}
    for line in open(p):
        parts = line.rstrip("\n").split("\t")
        if len(parts) >= 2:
            try:
                t[parts[0]] = {"s": float(parts[1]),
                               "gb": float(parts[2]) if len(parts) > 2 else None}
            except ValueError:
                pass
    return t


def artifact_status(chr_dir, name):
    p = _f(chr_dir, name.replace("<ref>", "*").rstrip("/"))
    if "*" in p:
        import glob
        hits = glob.glob(p)
        if hits:
            return True, human(sum(_size(h) for h in hits))
        return False, None
    if os.path.exists(p):
        return True, human(_size(p))
    return False, None


def discover_datasets():
    base = os.path.join(ROOT, "datastore", "graphs")
    out = []
    if not os.path.isdir(base):
        return out
    for db in sorted(os.listdir(base)):
        for chrom in sorted(os.listdir(os.path.join(base, db))):
            d = os.path.join(base, db, chrom)
            if os.path.isdir(d):
                out.append(d)
    return out




# ---------------------------------------------------------------------------
# Contexts: every chromosome directory on disk, measured
# ---------------------------------------------------------------------------

def discover_datasets():
    base = os.path.join(ROOT, "datastore", "graphs")
    out = []
    if not os.path.isdir(base):
        return out
    for db in sorted(os.listdir(base)):
        for chrom in sorted(os.listdir(os.path.join(base, db))):
            d = os.path.join(base, db, chrom)
            if os.path.isdir(d):
                out.append(d)
    return out


def runbar(chr_dir, T):
    rel = os.path.relpath(chr_dir, ROOT)
    if not T:
        return (f'<span class="num">{rel}</span> — <span class="warn">no timings.tsv — never '
                f'built by <code>add</code> on this machine, so no stage times.</span>')
    peak = [v["gb"] for v in T.values() if v.get("gb") is not None]
    total = T.get("total", {}).get("s")
    s = f'<span class="num">{rel}</span> — last <code>add</code> took '
    s += f'<b class="num">{total:.1f}s</b>' if total else "an unrecorded time"
    s += (f', peak <b class="num">{max(peak):.2f} GB</b>' if peak else ", no RSS recorded")
    if "finding_bubbles/loading_bubblegun" in T:
        s += (' · <span class="warn">these timing keys can only come from a legacy-BubbleGun '
              'run (PANGYPLOT_FLAT_BUBBLES=0)</span>')
    return s


def contexts():
    out = {}
    for d in discover_datasets():
        label = "/".join(d.split(os.sep)[-2:])
        arts = {}
        for st in STAGES:
            for name, _k, _n in st["artifacts"]:
                ok, sz = artifact_status(d, name)
                arts[name] = [ok, sz]
        try:
            pr = probe(d)
        except Exception as e:
            print(f"  probe failed for {label}: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        T = read_timings(d)
        out[label] = {"line": runbar(d, T), "timings": T, "probe": pr, "artifacts": arts}
    return out


PANELS = [
  {"cls": "flag", "title": "The <code>PANGYPLOT_FLAT_BUBBLES</code> switch",
   "paras": [("What's the same:", FLAG["same"]), ("What differs:", FLAG["differs"])]},
  {"cls": "resume", "title": "Re-running: what gets skipped",
   "paras": [(None, RESUME["how"]), ("--force", RESUME["force"]),
             ("--retry", RESUME["retry"]), ("The trap.", RESUME["trap"])]},
]
