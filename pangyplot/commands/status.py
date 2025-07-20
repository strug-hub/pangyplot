import os
from pathlib import Path
from pangyplot.db.sqlite.step_db import get_genomes
from pangyplot.db.sqlite.segment_db import count_segments
from pangyplot.db.sqlite.link_db import count_links
from pangyplot.db.sqlite.bubble_db import count_bubbles

def pangyplot_status(args):
    db_root = Path(args.dir).resolve()

    if not db_root.exists():
        print(f"[ERROR] Directory not found: {db_root}")
        return

    for db_name in sorted(os.listdir(db_root)):
        db_path = db_root / db_name
        if not db_path.is_dir():
            continue

        print("-" * 40)
        print(f"db: {db_name}")
        print("-" * 40)

        total_segments = 0
        total_links = 0
        total_bubbles = 0

        for chr_name in sorted(os.listdir(db_path)):
            chr_dir = db_path / chr_name
            if not chr_dir.is_dir():
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
