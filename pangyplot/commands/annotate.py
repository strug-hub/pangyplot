import os
from pangyplot.parser.parse_gff3 import parse_gff3

def pangyplot_annotate(args):

    if not args.gff3 and not args.bed:
        print("No annotation file provided. Exiting.")
        return
    
    if args.bed:
        print("BED file support is not yet implemented. Exiting.")
        return

    datastore_path = os.path.join(args.dir, "annotations")
    datastore_path = os.path.join(datastore_path, args.ref)
    
    if not os.path.exists(datastore_path):
        os.makedirs(datastore_path)
    
    datastore_path = os.path.join(datastore_path, args.name)

    if not os.path.exists(datastore_path):
        os.makedirs(datastore_path)

    if args.gff3:
        print("→ Parsing GFF3...")
        parse_gff3(args.gff3, datastore_path)
