"""Skeleton generation entry points.

Public API:
  generate_skeleton(chr_dir, ref, chrom) — build skeleton + polychain for one chromosome
  ensure_skeleton(data_dir, db_name, ref) — rebuild any missing or stale skeletons
"""

import gzip
import os
import re

from pangyplot.preprocess import log
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.PolychainIndex import PolychainIndex
from pangyplot.db.sqlite import bubble_db
from pangyplot.version import __version__, is_compatible_version

from pangyplot.preprocess.skeleton.skeleton_pipeline import (
    VIEWER_GRID_SIZES, compute_grid_sizes,
    compute_degrees, find_junctions, find_linear_runs, run_to_polyline,
    load_segment_to_bubble, compute_run_chain_ids,
    export_binary, summarize_grid_levels, SKELETON_SNAP,
)
from pangyplot.preprocess.skeleton.export_polychain import export_polychain_data
from pangyplot.preprocess.spine.spine_builder import generate_spine, spine_filename
from pangyplot.preprocess.meta import generate_meta, META_FILENAME

SKELETON_DIR = "skeleton"
SKELETON_META = "meta.json.gz"
SKELETON_BIN = "polylines.bin.gz"
POLYCHAIN_DATA_FILENAME = "polychain-data.json.gz"

def generate_skeleton(chr_dir, ref, chrom, client=None):
    """Build and export skeleton binary for a single chromosome directory.

    Under GBZ-native ingest, pass the graph-mode `client` and call this inside
    the serve_graph context: the topology here loads fine from the segment/link
    mmap caches, but meta's sample_count needs a live path source, and without a
    client PathIndex falls back to a paths SQLite that GBZ-native never writes.
    """
    skel_dir = os.path.join(chr_dir, SKELETON_DIR)
    os.makedirs(skel_dir, exist_ok=True)
    meta_path = os.path.join(skel_dir, SKELETON_META)
    bin_path = os.path.join(skel_dir, SKELETON_BIN)

    with log.section("Building skeleton."):
        with log.step("🦴", "Computing graph topology"):
            gfaidx = GFAIndex(chr_dir, client=client)
            segment_index = gfaidx.segment_index
            link_index = gfaidx.link_index
            degrees = compute_degrees(link_index)
            junctions = find_junctions(degrees)
            runs = find_linear_runs(gfaidx, junctions, segment_index)

        with log.step("📐", "Building polylines"):
            polylines = [run_to_polyline(run, segment_index) for run in runs]

        with log.step("🧬", "Building reference spine"):
            num_steps, num_sampled = generate_spine(chr_dir, ref, segment_index, output_dir=skel_dir)
        log.summary(f"Reference spine: {num_steps} steps → {num_sampled} sampled points")

        with log.step("⛓️ ", "Annotating chains"):
            seg_to_bubble = load_segment_to_bubble(chr_dir)
            bubble_to_chain = bubble_db.get_bubble_chain_map(chr_dir)
            chain_stats = bubble_db.get_chain_stats(chr_dir)
            chain_ids = None
            mapped = 0
            if seg_to_bubble is not None and bubble_to_chain is not None:
                chain_ids, mapped = compute_run_chain_ids(runs, seg_to_bubble, bubble_to_chain, chain_stats)
        if chain_ids is not None:
            log.summary(f"Chain annotation: {mapped}/{len(runs)} runs mapped ({100*mapped/max(1,len(runs)):.1f}%)")

        with log.step("💾", "Exporting skeleton"):
            grid_sizes = compute_grid_sizes(segment_index)
            export_stats = export_binary(junctions, runs, segment_index, link_index, polylines,
                                         grid_sizes, meta_path, bin_path, chromosome=chrom,
                                         chain_ids=chain_ids, chain_stats=chain_stats)
        log.summary(summarize_grid_levels(export_stats))

        with log.step("📊", "Computing graph metadata"):
            generate_meta(chr_dir, ref, chrom, client=client)


def export_polychain_section(chr_dir, gfaidx, ref):
    """Write polychain-data.json.gz as a step under `Building polychain index.`."""
    with log.step("📤", "Exporting polychain data"):
        pd_path = os.path.join(chr_dir, POLYCHAIN_DATA_FILENAME)
        pc_stats = export_polychain_data(chr_dir, gfaidx, ref, pd_path)
    if pc_stats is None:
        log.summary("(no PolychainIndex, skipping)")
    elif pc_stats["chains"] == 0:
        log.summary("(no chains)")
    else:
        log.summary(f"{pc_stats['chains']} chains, "
                    f"{pc_stats['junc_segs']} junc segs, "
                    f"{pc_stats['junc_links']} junc links")


def _skeleton_version(meta_path):
    """Read the skeleton version from the meta file without loading fully."""
    try:
        with gzip.open(meta_path, 'rt', encoding='utf-8') as f:
            head = f.read(200)
        m = re.search(r'"version"\s*:\s*"([^"]+)"', head)
        return m.group(1) if m else None
    except Exception:
        return None


def _skeleton_snap(meta_path):
    """Read the skeleton snap mode from the meta file. Absent on pre-cascade
    skeletons (round snap), which must be rebuilt to the floor-snap cascade."""
    try:
        with gzip.open(meta_path, 'rt', encoding='utf-8') as f:
            head = f.read(200)
        m = re.search(r'"snap"\s*:\s*"([^"]+)"', head)
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
        elif (not is_compatible_version(_skeleton_version(meta_path))
              or _skeleton_snap(meta_path) != SKELETON_SNAP):
            reason = (f"{_skeleton_version(meta_path)} → {__version__}"
                      if not is_compatible_version(_skeleton_version(meta_path))
                      else f"snap {_skeleton_snap(meta_path)} → {SKELETON_SNAP}")
            print(f"\n[Skeleton] Rebuilding stale skeleton for {chrom} "
                  f"({reason})...")
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
