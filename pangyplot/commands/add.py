import os
import time
import shutil
from sqlite3 import OperationalError

from pangyplot.preprocess import log
from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
from pangyplot.preprocess.skeleton.generate_skeleton import generate_skeleton, export_polychain_section
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.PolychainIndex import PolychainIndex

TIMINGS_FILENAME = "timings.tsv"

def pangyplot_add(args):
    start_time = time.time()
    log.reset_timings()

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

    try:
        gfa_index = GFAIndex(chr_path)
        segment_idx, link_idx  = gfa_index.segment_index, gfa_index.link_index
        print("→ Reusing existing GFA index.")
    except OperationalError:
        layout_coords = parse_layout(args.layout)
        path_idx, segment_idx, link_idx = parse_gfa(args.gfa, args.ref, args.path, args.offset, args.sep, layout_coords, chr_path)

    bubble_gun.shoot(segment_idx, link_idx, chr_path, args.ref)

    gfa_index = GFAIndex(chr_path)
    step_index = StepIndex(chr_path, args.ref)
    bubble_index = BubbleIndex(chr_path, gfa_index)

    with log.section("Building polychain index."):
        polychain_index = PolychainIndex(chr_path, bubble_index, gfa_index, step_index, args.ref)
        export_polychain_section(chr_path, gfa_index, args.ref)

    with log.section("Computing subpath bp ranges."):
        gfa_index.path_index.compute_bp_ranges(step_index)

    generate_skeleton(chr_path, args.ref, args.chr)

    elapsed = time.time() - start_time
    log._timings.append(("total", elapsed, log._peak_gb()))
    log.write_timings(os.path.join(chr_path, TIMINGS_FILENAME))

    minutes, seconds = divmod(elapsed, 60)
    if minutes > 0:
        print(f"\nCompleted in {int(minutes)}m {seconds:.1f}s")
    else:
        print(f"\nCompleted in {seconds:.1f}s")
