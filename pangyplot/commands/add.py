import os
import shutil

from pympler.asizeof import asizeof

from pangyplot.parser.parse_gfa import parse_gfa
from pangyplot.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

def pangyplot_add(args):

    datastore_path = os.path.join(args.dir, "graphs")
    datastore_path = os.path.join(datastore_path, args.db)

    if not args.force and os.path.exists(datastore_path):
        response = input(f"Do you want to add to database '{args.db}'? [y/N]: ").strip().lower()
        if response != 'y':
            print("Aborting.")
            exit(1)
    
    if not os.path.exists(datastore_path):
        os.mkdir(datastore_path)

    chr_path = os.path.join(datastore_path, args.chr)
    if not args.force and os.path.exists(chr_path):
        response = input(f"Index for '{args.chr}' already exists. Do you want to overwrite it? [y/N]: ").strip().lower()
        if response != 'y':
            print("Aborting.")
            exit(1)
        else:
            shutil.rmtree(chr_path)

    os.mkdir(chr_path)

    layout_coords = parse_layout(args.layout)
    segment_dict, link_dict  = parse_gfa(args.gfa, args.ref, args.path, layout_coords, chr_path)
    bubble_gun.shoot(segment_dict, link_dict, chr_path, args.ref)

    print("→ Creating quick indexes.")
    gfa_index = GFAIndex(chr_path)
    print(f"gfa_index size:      {asizeof(gfa_index) / 1024**2:.2f} MB")
    step_index = StepIndex(chr_path, args.ref)
    print(f"step_index size:      {asizeof(step_index) / 1024**2:.2f} MB")
    bubble_index = BubbleIndex(chr_path)
    print(f"bubble_index size:      {asizeof(bubble_index) / 1024**2:.2f} MB")
