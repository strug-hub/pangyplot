from pangyplot.parser.parse_gff3 import parse_gff3

def pangyplot_annotate(args):
    print("Adding annotations...")
    if args.gff3 and args.ref:
        #todo: check if exists, check if should be dropped?
        #drop.drop_annotations()
        print("Parsing GFF3...")
        parse_gff3(args.gff3, args.ref)
