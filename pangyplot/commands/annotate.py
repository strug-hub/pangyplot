import os
from pangyplot.parser.parse_gff3 import parse_gff3
import shutil

def pangyplot_annotate(args):

    if not args.gff3 and not args.bed:
        print("No annotation file provided. Exiting.")
        return
    
    if args.bed:
        print("BED file support is not yet implemented. Exiting.")
        return

    annotation_path = os.path.join(args.dir, "annotations", args.ref, args.name)

    if not args.force and os.path.exists(annotation_path):
        response = input(f"Annotations named {args.name} for '{args.ref}' already exists. Do you want to overwrite it? [y/N]: ").strip().lower()
        if response != 'y':
            print("Aborting.")
            exit(1)
        else:
            shutil.rmtree(annotation_path)

    os.makedirs(annotation_path, exist_ok=True)

    if args.gff3:
        print("→ Parsing GFF3...")
        parse_gff3(args.gff3, annotation_path)
