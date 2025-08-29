import os
import shutil
from sqlite3 import OperationalError

from pangyplot.parser.parse_gfa import parse_gfa
from pangyplot.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

def pangyplot_add(args):

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
        segment_idx, link_idx  = parse_gfa(args.gfa, args.ref, args.path, layout_coords, chr_path)
   
    bubble_gun.shoot(segment_idx, link_idx, chr_path, args.ref)

    try:
        from pympler.asizeof import asizeof
        have_pympler = True
    except ImportError:
        have_pympler = False
        def asizeof(obj):  # fallback no-op
            return 0

    print(f"---")
    gfa_index = GFAIndex(chr_path)
    if have_pympler:
        print(f"gfa_index size:      {asizeof(gfa_index) / 1024**2:.2f} MB")
    
    step_index = StepIndex(chr_path, args.ref)
    if have_pympler:
        print(f"step_index size:      {asizeof(step_index) / 1024**2:.2f} MB")
    
    bubble_index = BubbleIndex(chr_path, gfa_index)
    if have_pympler:
        print(f"bubble_index size:      {asizeof(bubble_index) / 1024**2:.2f} MB")
