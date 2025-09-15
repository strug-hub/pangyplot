import os
from pangyplot.db.sqlite.step_db import get_genomes, summarize_steps
from pangyplot.db.sqlite.segment_db import count_segments, summarize_segments
from pangyplot.db.sqlite.link_db import count_links, summarize_links
from pangyplot.db.sqlite.bubble_db import count_bubbles, summarize_bubbles


def pretty_print_summary(summary, indent=0):
    pad = "  " * indent
    if isinstance(summary, dict):
        for key, val in summary.items():
            if isinstance(val, dict):
                print(f"{pad}{key}:")
                pretty_print_summary(val, indent + 1)
            elif isinstance(val, (list, tuple)):
                print(f"{pad}{key}: {val}")
            else:
                # format numbers nicely
                if isinstance(val, (int, float)):
                    if isinstance(val, int):
                        print(f"{pad}{key}: {val:,}")
                    else:
                        print(f"{pad}{key}: {val:,.3f}")
                else:
                    print(f"{pad}{key}: {val}")
    else:
        print(pad + str(summary))


def pangyplot_status(args):

    if not os.path.exists(args.dir):
        print(f"[ERROR] Directory not found: {args.dir}")
        return

    graph_path = os.path.join(args.dir, "graphs")

    db_names = sorted(os.listdir(graph_path))
    if getattr(args, "db", None) is not None:
        db_names = [db for db in db_names if args.db in db]

        if not db_names:
            print(f"[ERROR] No database with name: {args.db}")
            return

    if args.table:
        db_name = db_names[0]
        db_path = os.path.join(graph_path, db_name)

        if len(db_names) > 1:
            print(f"Showing table for database: {db_name}")

        for chr_name in sorted(os.listdir(db_path)):
            chr_dir = os.path.join(db_path, chr_name)
            if not os.path.isdir(chr_dir):
                continue

            print(f"Data for {chr_name}")

            printed = False
            
            if "segment" in args.table:
                summary = summarize_segments(chr_dir)
                pretty_print_summary(summary, indent=2)
                print("     ---------------")
                summary = summarize_steps(chr_dir)
                pretty_print_summary(summary, indent=2)
                printed = True

            if "link" in args.table:
                summary = summarize_links(chr_dir)
                pretty_print_summary(summary, indent=2)
                printed = True

            if "bubble" in args.table:
                summary = summarize_bubbles(chr_dir)
                pretty_print_summary(summary, indent=2)
                printed = True

            if not printed:
                print(f"No function for --table {args.table}, try: [segment,link,bubble]")
                return

    else:
        for db_name in db_names:
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

                    ref_list = ", ".join(refs)
                    print(f"  🧬 {chr_name} (refs: {ref_list})")
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
