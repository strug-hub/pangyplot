import os
from pangyplot.db.sqlite.step_db import get_genomes
from pangyplot.db.sqlite.segment_db import count_segments
from pangyplot.db.sqlite.link_db import count_links
from pangyplot.db.sqlite.bubble_db import count_bubbles

def pangyplot_status(args):

    if not os.path.exists(args.dir):
        print(f"[ERROR] Directory not found: {args.dir}")
        return

    graph_path = os.path.join(args.dir, "graphs")

    for db_name in sorted(os.listdir(graph_path)):
        db_path = os.path.join(graph_path, db_name)

        if not os.path.isdir(db_path):
            continue

        print("-" * 40)
        print(f"db: {db_name}")
        print("-" * 40)

        total_segments = 0
        total_links = 0
        total_bubbles = 0

        for chr_name in sorted(os.listdir(db_path)):
            chr_dir = os.path.join(db_path, chr_name)
            if not os.path.isdir(chr_dir):
                continue

            try:
                n_seg = count_segments(chr_dir)
                refs = get_genomes(chr_dir)
                n_link = count_links(chr_dir)
                n_bubble = count_bubbles(chr_dir)

                print(f"  🧬 {chr_name} (refs: {", ".join(refs)})")
                print(f"    → Segments: {n_seg}")
                print(f"    → Links:    {n_link}")
                print(f"    → Bubbles:  {n_bubble}")

                total_segments += n_seg
                total_links += n_link
                total_bubbles += n_bubble

            except Exception as e:
                print(f"  [ERROR] problem reading {chr_name}: {e}\n")

        print(f"\nTotals for {db_name}")
        print(f"  Segments: {total_segments}")
        print(f"  Links:    {total_links}")
        print(f"  Bubbles:  {total_bubbles}\n")
