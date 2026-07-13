import os

from pangyplot.preprocess import cytoband_generator


def pangyplot_cytoband(args):

    if args.band_size is not None and args.num_bands is not None:
        print("Specify --band-size or --num-bands, not both. Exiting.")
        return

    if not os.path.isfile(args.fai):
        print(f"Input file not found: {args.fai}")
        return

    genome = args.genome
    if not genome:
        # foo.fa.fai -> foo, foo.fai -> foo
        genome = os.path.basename(args.fai)
        for suffix in (".fai", ".fasta", ".fa", ".fna", ".tsv", ".txt"):
            if genome.endswith(suffix):
                genome = genome[: -len(suffix)]
        if not genome:
            print(f"Could not derive a genome name from {args.fai}; pass --genome. Exiting.")
            return

    chromosomes = None
    if args.chromosomes:
        chromosomes = [c.strip() for c in args.chromosomes.split(",") if c.strip()]

    try:
        lengths = cytoband_generator.parse_lengths(args.fai)
        kept, dropped = cytoband_generator.select_canonical(
            lengths,
            min_length=args.min_length,
            chromosomes=chromosomes,
            pattern=args.pattern,
        )
    except ValueError as error:
        print(f"Error: {error}")
        return

    cytoband_path = os.path.join(args.out_dir, f"{genome}.cytoBand.txt")
    canonical_path = os.path.join(args.out_dir, f"{genome}.canonical.txt")
    existing = [p for p in (cytoband_path, canonical_path) if os.path.exists(p)]
    if existing and not args.force:
        for path in existing:
            print(f"File already exists: {path}")
        response = input("Overwrite? [y/N]: ").strip().lower()
        if response != 'y':
            print("Aborting.")
            exit(1)

    try:
        cytoband_path, canonical_path = cytoband_generator.write_cytoband(
            kept, args.out_dir, genome,
            band_size=args.band_size, num_bands=args.num_bands,
        )
    except ValueError as error:
        print(f"Error: {error}")
        return

    print(f"→ Read {len(lengths)} sequences from {args.fai}")
    print(f"  Kept {len(kept)}, dropped {len(dropped)}")
    if dropped:
        # Say plainly what was filtered out -- silent truncation reads as
        # "we covered everything" when it did not.
        preview = ", ".join(name for name, _ in dropped[:5])
        if len(dropped) > 5:
            preview += f", ... (+{len(dropped) - 5} more)"
        print(f"  Dropped: {preview}")
        print("  Adjust with --min-length, --pattern or --chromosomes.")

    print(f"  Wrote {cytoband_path}")
    print(f"  Wrote {canonical_path}")
    print()
    print("Add these lines to your .env to use them:")
    print()
    print("  ORGANISM=custom")
    print(f"  CYTOBAND_PATH={os.path.abspath(cytoband_path)}")
    print(f"  CANONICAL_PATH={os.path.abspath(canonical_path)}")
