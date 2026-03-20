"""Pre-validate indexes before server startup, rebuilding if needed."""

import os

from pangyplot.db.indexes.SegmentIndex import SegmentIndex, QUICK_INDEX as SEG_QI
from pangyplot.db.indexes.StepIndex import StepIndex, QUICK_INDEX as STEP_QI
from pangyplot.db.indexes.LinkIndex import LinkIndex, QUICK_INDEX as LINK_QI
from pangyplot.db.indexes.BubbleIndex import BubbleIndex, QUICK_INDEX as BUBBLE_QI
from pangyplot.db.indexes.PolychainIndex import PolychainIndex, QUICK_INDEX as POLY_QI
from pangyplot.db.indexes.GFAIndex import GFAIndex

LEGACY_QUICKINDEXES = [SEG_QI, STEP_QI, LINK_QI, BUBBLE_QI, POLY_QI]


def _cleanup_legacy(chr_dir):
    """Remove old JSON quickindex files that have been replaced by mmap."""
    for qi in LEGACY_QUICKINDEXES:
        path = os.path.join(chr_dir, qi + ".gz")
        if os.path.exists(path):
            os.remove(path)
            print(f"  Removed legacy {qi}.gz")


def ensure_indexes(data_dir, db_name, ref):
    graph_path = os.path.join(data_dir, "graphs", db_name)
    if not os.path.isdir(graph_path):
        return

    for chrom in os.listdir(graph_path):
        chr_dir = os.path.join(graph_path, chrom)
        if not os.path.isdir(chr_dir):
            continue

        if not SegmentIndex.validate(chr_dir):
            print(f"[Index] Rebuilding stale segment index for {chrom}...")
            SegmentIndex(chr_dir)

        if not StepIndex.validate(chr_dir):
            print(f"[Index] Rebuilding stale step index for {chrom}...")
            StepIndex(chr_dir, ref)

        if not LinkIndex.validate(chr_dir):
            print(f"[Index] Rebuilding stale link index for {chrom}...")
            LinkIndex(chr_dir)

        if not BubbleIndex.validate(chr_dir):
            print(f"[Index] Rebuilding stale bubble index for {chrom}...")
            gfaidx = GFAIndex(chr_dir)
            BubbleIndex(chr_dir, gfaidx)

        _cleanup_legacy(chr_dir)
