import os
import time
import shutil
from sqlite3 import OperationalError

from pangyplot.preprocess import log
from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.preprocess import memory
from pangyplot.preprocess import gbz as gbz_build
from pangyplot.preprocess import gbwt_build
from pangyplot.preprocess.graphd import serve_graph, layout_coords_by_id
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
from pangyplot.preprocess.skeleton.generate_skeleton import generate_skeleton, export_polychain_section
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.PolychainIndex import PolychainIndex

TIMINGS_FILENAME = "timings.tsv"


def _repo_root():
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _add_from_gbz(args, chr_path):
    """GBZ-native ingest: the graph.gbz is the primary store, read through a
    graph-mode graphd. Builds the same on-disk artifacts as the GFA path (segment/
    link/step mmap indexes, bubbles.db, polychains, skeleton) with no GFA and no
    per-segment SQLite -- only bubbles.db stays SQLite (PangyPlot-computed).
    """
    with log.section("Adopting GBZ."):
        out = gbz_build.adopt_gbz(args.gbz, chr_path)
        print(f"  🧬 Adopted GBZ -> {out}")

    with serve_graph(gbz_build.gbz_path(chr_path), repo_root=_repo_root()) as client:
        with log.section("Parsing layout."):
            coords = layout_coords_by_id(parse_layout(args.layout), client)

        gfa_index = GFAIndex(chr_path, client=client, coords=coords)
        segment_idx, link_idx = gfa_index.segment_index, gfa_index.link_index

        # Steps from the reference walk -- cached so the bubble indexer (and
        # everything after) loads StepIndex(chr_path, ref) with no client.
        with log.section("Building steps from the reference path."):
            step_index = StepIndex(chr_path, args.ref, client=client,
                                   segment_index=segment_idx)

        bubble_gun.shoot(segment_idx, link_idx, chr_path, args.ref)

        bubble_index = BubbleIndex(chr_path, gfa_index)
        with log.section("Building polychain index."):
            PolychainIndex(chr_path, bubble_index, gfa_index, step_index, args.ref)
            export_polychain_section(chr_path, gfa_index, args.ref)

        with log.section("Computing subpath bp ranges."):
            gfa_index.path_index.compute_bp_ranges(step_index)

        # Inside the serve_graph context, and passing the client: meta's
        # sample_count comes from the path index, which under GBZ-native ingest
        # only exists as GbwtPathIndex(client). Called outside, it silently
        # reported 0 samples.
        generate_skeleton(chr_path, args.ref, args.chr, client=client)

def pangyplot_add(args):
    start_time = time.time()
    log.reset_timings()

    if not args.gfa and not getattr(args, "gbz", None):
        print("Provide --gfa (GFA ingest) or --gbz (GBZ-native ingest).")
        exit(1)

    datastore_path = os.path.join(args.dir, "graphs", args.db)
    
    if not args.force and os.path.exists(datastore_path):
        response = input(f"Do you want to add to database '{args.db}'? [y/N]: ").strip().lower()
        if response != 'y':
            print("Aborting.")
            exit(1)
    
    os.makedirs(datastore_path, exist_ok=True)

    chr_path = os.path.join(datastore_path, args.chr)
    if not args.retry and not args.force and os.path.exists(chr_path):
        response = input(f"Index for '{args.chr}' already exists. Do you want to overwrite it? [y/N]: ").strip().lower()
        if response != 'y':
            print("Aborting.")
            exit(1)
        else:
            shutil.rmtree(chr_path)
    elif args.force and not args.retry:
        if os.path.exists(chr_path):
            shutil.rmtree(chr_path)

    if not os.path.exists(chr_path):
        os.mkdir(chr_path)

    # GBZ-native ingest: --gbz with no --gfa. The GBZ is the primary store.
    if getattr(args, "gbz", None) and not args.gfa:
        _add_from_gbz(args, chr_path)
        elapsed = time.time() - start_time
        log._timings.append(("total", elapsed, log._peak_gb()))
        log.write_timings(os.path.join(chr_path, TIMINGS_FILENAME))
        minutes, seconds = divmod(elapsed, 60)
        print(f"\nCompleted in {int(minutes)}m {seconds:.1f}s" if minutes
              else f"\nCompleted in {seconds:.1f}s")
        return

    try:
        gfa_index = GFAIndex(chr_path)
        segment_idx, link_idx  = gfa_index.segment_index, gfa_index.link_index
        print("→ Reusing existing GFA index.")
    except OperationalError:
        with log.section("Parsing layout."):
            layout_coords = parse_layout(args.layout)
        path_idx, segment_idx, link_idx = parse_gfa(args.gfa, args.ref, args.path, args.offset, args.sep, layout_coords, chr_path)
        # Keep: the layout sits underneath every later peak if it stays in scope.
        del layout_coords
        memory.release()

    bubble_gun.shoot(segment_idx, link_idx, chr_path, args.ref)

    gfa_index = GFAIndex(chr_path)
    step_index = StepIndex(chr_path, args.ref)
    bubble_index = BubbleIndex(chr_path, gfa_index)

    with log.section("Building polychain index."):
        polychain_index = PolychainIndex(chr_path, bubble_index, gfa_index, step_index, args.ref)
        export_polychain_section(chr_path, gfa_index, args.ref)

    with log.section("Computing subpath bp ranges."):
        gfa_index.path_index.compute_bp_ranges(step_index)

    # GBWT path engine (opt-in): produce the index GbwtManager serves. Prefer the
    # native compact graph.gbwt (no vg); adopt a foreign GBZ if given instead.
    # Without either, the app runs on the legacy binpath engine for this chr.
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if getattr(args, "build_gbwt", False):
        with log.section("Building native GBWT."):
            out = gbwt_build.build_gbwt(chr_path, repo_root=repo_root)
            print(f"  🧬 Built GBWT -> {out}")
    elif getattr(args, "gbz", None):
        with log.section("Adopting GBZ."):
            out = gbz_build.adopt_gbz(args.gbz, chr_path)
            print(f"  🧬 Adopted GBZ -> {out}")

    generate_skeleton(chr_path, args.ref, args.chr)

    elapsed = time.time() - start_time
    log._timings.append(("total", elapsed, log._peak_gb()))
    log.write_timings(os.path.join(chr_path, TIMINGS_FILENAME))

    minutes, seconds = divmod(elapsed, 60)
    if minutes > 0:
        print(f"\nCompleted in {int(minutes)}m {seconds:.1f}s")
    else:
        print(f"\nCompleted in {seconds:.1f}s")
