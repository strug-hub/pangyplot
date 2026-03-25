"""Skeleton generation entry points.

Public API:
  generate_skeleton(chr_dir, ref, chrom) — build skeleton + polychain for one chromosome
  ensure_skeleton(data_dir, db_name, ref) — rebuild any missing or stale skeletons
"""

import gzip
import os
import re

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.PolychainIndex import PolychainIndex
from pangyplot.db.sqlite import bubble_db
from pangyplot.version import __version__

from pangyplot.preprocess.skeleton.skeleton_pipeline import (
    VIEWER_GRID_SIZES,
    compute_degrees, find_junctions, find_linear_runs, run_to_polyline,
    load_segment_to_bubble, compute_run_chain_ids,
    export_json,
)
from pangyplot.preprocess.skeleton.export_polychain import export_polychain_data
from pangyplot.preprocess.spine.spine_builder import generate_spine, spine_filename

SKELETON_FILENAME = "skeleton.json.gz"
POLYCHAIN_DATA_FILENAME = "polychain-data.json.gz"

def generate_skeleton(chr_dir, ref, chrom):
    """Build and export skeleton JSON for a single chromosome directory."""
    gz_path = os.path.join(chr_dir, SKELETON_FILENAME)

    print("→ Building skeleton.")

    print("   🦴 Computing graph topology...", end="", flush=True)
    gfaidx = GFAIndex(chr_dir)
    segment_index = gfaidx.segment_index
    link_index = gfaidx.link_index
    degrees = compute_degrees(link_index)
    junctions = find_junctions(degrees)
    runs = find_linear_runs(gfaidx, junctions, segment_index)
    print(" Done.")

    print("   📐 Building polylines...", end="", flush=True)
    polylines = [run_to_polyline(run, segment_index) for run in runs]
    print(" Done.")

    print("   🧬 Building reference spine...", end="", flush=True)
    generate_spine(chr_dir, ref, segment_index)
    print(" Done.")

    print("   ⛓️  Annotating chains...", end="", flush=True)
    seg_to_bubble = load_segment_to_bubble(chr_dir)
    bubble_to_chain = bubble_db.get_bubble_chain_map(chr_dir)
    chain_stats = bubble_db.get_chain_stats(chr_dir)
    chain_ids = None
    if seg_to_bubble is not None and bubble_to_chain is not None:
        chain_ids = compute_run_chain_ids(runs, seg_to_bubble, bubble_to_chain, chain_stats)
    print(" Done.")

    print("   💾 Exporting skeleton...", end="", flush=True)
    export_json(junctions, runs, segment_index, link_index, polylines,
                VIEWER_GRID_SIZES, gz_path, chromosome=chrom,
                chain_ids=chain_ids, chain_stats=chain_stats)
    print(" Done.")

    print("   🔗 Exporting polychain data...", end="", flush=True)
    pd_path = os.path.join(chr_dir, POLYCHAIN_DATA_FILENAME)
    export_polychain_data(chr_dir, gfaidx, ref, pd_path)
    print(" Done.")


def _skeleton_version(gz_path):
    """Read the skeleton version from the meta field without loading the full file."""
    try:
        with gzip.open(gz_path, 'rt', encoding='utf-8') as f:
            head = f.read(200)
        m = re.search(r'"version"\s*:\s*"([^"]+)"', head)
        return m.group(1) if m else None
    except Exception:
        return None


def ensure_skeleton(data_dir, db_name, ref):
    """Generate skeleton JSON for any chromosome that is missing or stale.

    Called automatically by the run command before starting the server.
    Discovers chromosomes from the graph directory on disk.
    """
    graph_path = os.path.join(data_dir, "graphs", db_name)
    if not os.path.isdir(graph_path):
        return

    chromosomes = [d for d in os.listdir(graph_path)
                   if os.path.isdir(os.path.join(graph_path, d))]

    for chrom in chromosomes:
        chr_dir = os.path.join(graph_path, chrom)
        gz_path = os.path.join(chr_dir, SKELETON_FILENAME)
        pd_path = os.path.join(chr_dir, POLYCHAIN_DATA_FILENAME)
        spine_path = os.path.join(chr_dir, spine_filename(ref))
        if not os.path.exists(gz_path):
            print(f"\n[Skeleton] Missing skeleton for {chrom}, generating...")
            generate_skeleton(chr_dir, ref, chrom)
        elif _skeleton_version(gz_path) != __version__:
            print(f"\n[Skeleton] Rebuilding stale skeleton for {chrom} "
                  f"({_skeleton_version(gz_path)} → {__version__})...")
            generate_skeleton(chr_dir, ref, chrom)
        else:
            # Spine and polychain checked independently of skeleton
            if not os.path.exists(spine_path):
                print(f"\n[Spine] Missing spine for {chrom} ({ref}), generating...")
                _gfaidx = GFAIndex(chr_dir)
                generate_spine(chr_dir, ref, _gfaidx.segment_index)
            if not os.path.exists(pd_path) and PolychainIndex.validate(chr_dir):
                print(f"\n[Skeleton] Missing polychain data for {chrom}, generating...")
                _gfaidx = GFAIndex(chr_dir)
                export_polychain_data(chr_dir, _gfaidx, ref, pd_path)
