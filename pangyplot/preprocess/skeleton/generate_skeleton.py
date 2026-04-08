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
    VIEWER_GRID_SIZES, compute_grid_sizes,
    compute_degrees, find_junctions, find_linear_runs, run_to_polyline,
    load_segment_to_bubble, compute_run_chain_ids,
    export_binary,
)
from pangyplot.preprocess.skeleton.export_polychain import export_polychain_data
from pangyplot.preprocess.spine.spine_builder import generate_spine, spine_filename
from pangyplot.preprocess.meta import generate_meta, META_FILENAME

SKELETON_DIR = "skeleton"
SKELETON_META = "meta.json.gz"
SKELETON_BIN = "polylines.bin.gz"
POLYCHAIN_DATA_FILENAME = "polychain-data.json.gz"

def generate_skeleton(chr_dir, ref, chrom):
    """Build and export skeleton binary for a single chromosome directory."""
    skel_dir = os.path.join(chr_dir, SKELETON_DIR)
    os.makedirs(skel_dir, exist_ok=True)
    meta_path = os.path.join(skel_dir, SKELETON_META)
    bin_path = os.path.join(skel_dir, SKELETON_BIN)

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
    generate_spine(chr_dir, ref, segment_index, output_dir=skel_dir)
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
    grid_sizes = compute_grid_sizes(segment_index)
    export_binary(junctions, runs, segment_index, link_index, polylines,
                  grid_sizes, meta_path, bin_path, chromosome=chrom,
                  chain_ids=chain_ids, chain_stats=chain_stats)
    print(" Done.")

    print("   🔗 Exporting polychain data...", end="", flush=True)
    pd_path = os.path.join(chr_dir, POLYCHAIN_DATA_FILENAME)
    export_polychain_data(chr_dir, gfaidx, ref, pd_path)
    print(" Done.")

    print("   📊 Computing graph metadata...", end="", flush=True)
    generate_meta(chr_dir, ref, chrom)
    print(" Done.")


def _skeleton_version(meta_path):
    """Read the skeleton version from the meta file without loading fully."""
    try:
        with gzip.open(meta_path, 'rt', encoding='utf-8') as f:
            head = f.read(200)
        m = re.search(r'"version"\s*:\s*"([^"]+)"', head)
        return m.group(1) if m else None
    except Exception:
        return None


def ensure_skeleton(data_dir, db_name, ref):
    """Generate skeleton for any chromosome that is missing or stale.

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
        skel_dir = os.path.join(chr_dir, SKELETON_DIR)
        meta_path = os.path.join(skel_dir, SKELETON_META)
        bin_path = os.path.join(skel_dir, SKELETON_BIN)
        pd_path = os.path.join(chr_dir, POLYCHAIN_DATA_FILENAME)
        spine_path = os.path.join(skel_dir, spine_filename(ref))
        if not os.path.exists(meta_path) or not os.path.exists(bin_path):
            print(f"\n[Skeleton] Missing skeleton for {chrom}, generating...")
            generate_skeleton(chr_dir, ref, chrom)
        elif _skeleton_version(meta_path) != __version__:
            print(f"\n[Skeleton] Rebuilding stale skeleton for {chrom} "
                  f"({_skeleton_version(meta_path)} → {__version__})...")
            generate_skeleton(chr_dir, ref, chrom)
        else:
            # Spine and polychain checked independently of skeleton
            if not os.path.exists(spine_path):
                print(f"\n[Spine] Missing spine for {chrom} ({ref}), generating...")
                _gfaidx = GFAIndex(chr_dir)
                generate_spine(chr_dir, ref, _gfaidx.segment_index, output_dir=skel_dir)
            if not os.path.exists(pd_path) and PolychainIndex.validate(chr_dir):
                print(f"\n[Skeleton] Missing polychain data for {chrom}, generating...")
                _gfaidx = GFAIndex(chr_dir)
                export_polychain_data(chr_dir, _gfaidx, ref, pd_path)
            meta_path = os.path.join(chr_dir, META_FILENAME)
            if not os.path.exists(meta_path):
                print(f"\n[Meta] Missing metadata for {chrom}, generating...")
                generate_meta(chr_dir, ref, chrom)
