import os
from pangyplot.parser.parse_gfa import parse_gfa
from pangyplot.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun

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
            
    if not os.path.exists(chr_path):
        os.mkdir(chr_path)

    print(f"Indexing GFA data from {args.gfa}...")

    layout_coords = parse_layout(args.layout)
    segment_dict, link_dict  = parse_gfa(args.gfa, args.ref, args.path, layout_coords, chr_path)
    bubble_gun.shoot(segment_dict, link_dict, chr_path, args.ref)
