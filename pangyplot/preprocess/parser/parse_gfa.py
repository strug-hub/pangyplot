import sys
import gzip
from collections import defaultdict

from pangyplot.preprocess import log
from pangyplot.db.sqlite.step_db import write_step_index
from pangyplot.preprocess.parser.gfa.parse_segments import parse_segments, parse_line_S
from pangyplot.preprocess.parser.gfa.parse_links import parse_links, parse_line_L
from pangyplot.preprocess.parser.gfa.parse_paths import parse_paths, edge_key
import pangyplot.db.sqlite.segment_db as segment_db
import pangyplot.db.sqlite.link_db as link_db
from pangyplot.db.indexes.SegmentIndex import SegmentIndex
from pangyplot.db.indexes.LinkIndex import LinkIndex

BATCH_SIZE = 20000

def get_reader(gfa_file):
    if gfa_file.endswith(".gz"):
        return gzip.open(gfa_file, 'rt')
    return open(gfa_file)

def verify_reference(ref_path, matching_refs):
    if len(matching_refs) == 0:
        log.info("❌", f"ERROR: Reference sample '{ref_path}' not found in any sample IDs.")
        sys.exit(1)
    elif len(matching_refs) > 1:
        log.info("❌", f"ERROR: Reference sample string '{ref_path}' matched multiple samples:")
        for full_name, sample_name in matching_refs:
            print(f"     - {full_name}")
        print("   Please provide a more specific reference name.")
        sys.exit(1)

    full_name, sample_name = matching_refs[0]
    log.info("🎯", f"Found reference path {full_name} -> {sample_name}.")

def _parse_segments_and_links(gfa_file, layout_coords, path_idx, path_dict, dir):
    """Parse S and L lines in a single file pass with batched SQLite inserts."""
    layout = layout_coords["layout"]
    layout_type = layout_coords["type"]
    n_paths = len(path_idx)

    # Create both tables with bulk-loading pragmas
    seg_conn = segment_db.create_segment_table(dir, bulk=True)
    seg_cur = seg_conn.cursor()

    lnk_conn = link_db.create_link_table(dir, bulk=True)
    lnk_cur = lnk_conn.cursor()

    seg_batch = []
    lnk_batch = []
    seg_count = 0
    lnk_count = 0

    seg_conn.execute("BEGIN")
    lnk_conn.execute("BEGIN")

    with get_reader(gfa_file) as gfa:
        for line in gfa:
            tag = line[0]

            if tag == "S":
                segment = parse_line_S(line)
                if layout_type == "odgi":
                    coords = layout[seg_count]
                elif layout_type == "bandage":
                    coords = layout[segment.id]

                seg_batch.append((
                    segment.id, segment.gc_count, segment.n_count, segment.length,
                    coords["x1"], coords["y1"], coords["x2"], coords["y2"],
                    segment.seq
                ))
                seg_count += 1

                if len(seg_batch) >= BATCH_SIZE:
                    segment_db.insert_segments_batch(seg_cur, seg_batch)
                    seg_batch = []

            elif tag == "L":
                link = parse_line_L(line)

                # Haplotype bitmask, keyed the way collapse_binary packed it:
                # one int64 per step pair, not a tuple of two strings.
                from_rev = link.from_strand == '-'
                to_rev = link.to_strand == '-'

                key = edge_key(link.from_id, from_rev, link.to_id, to_rev)
                # the same edge walked the other way: both ends flip orientation
                # and swap places
                key_rev = edge_key(link.to_id, not to_rev, link.from_id, not from_rev)
                mask = path_dict.get(key, 0) | path_dict.get(key_rev, 0)
                haplotype = hex(mask)[2:]
                frequency = bin(mask).count("1") / n_paths
                reverse = hex(path_dict.get(key_rev, 0))[2:]
                link_key = f"{link.from_id}{link.from_strand}{link.to_id}{link.to_strand}"

                lnk_batch.append((
                    link_key, link.from_id, link.from_strand,
                    link.to_id, link.to_strand,
                    haplotype, reverse, frequency
                ))
                lnk_count += 1

                if len(lnk_batch) >= BATCH_SIZE:
                    link_db.insert_links_batch(lnk_cur, lnk_batch)
                    lnk_batch = []

    # Flush remaining
    if seg_batch:
        segment_db.insert_segments_batch(seg_cur, seg_batch)
    if lnk_batch:
        link_db.insert_links_batch(lnk_cur, lnk_batch)

    seg_conn.commit()
    seg_conn.execute("ANALYZE")
    seg_conn.execute("VACUUM")
    seg_conn.close()

    # Create link indexes after all data is loaded
    link_db.create_link_indexes(lnk_conn)
    lnk_conn.execute("ANALYZE")
    lnk_conn.execute("VACUUM")
    lnk_conn.close()

    segment_idx = SegmentIndex(dir)
    link_idx = LinkIndex(dir)
    return segment_idx, link_idx, seg_count, lnk_count

def parse_gfa(gfa_file, ref, path, ref_offset, path_sep, layout_coords, dir):
    with log.section(f"Parsing GFA file: {gfa_file}."):
        if path:
            log.info("🔍", f"Looking for path: {ref} (reference genome = {ref})")
            ref_path = path
        else:
            log.info("🔎", f"Looking for reference path with name: {ref}")
            ref_path = ref

        # ==== PASS 1: PATHS ====
        with log.step("🧵", "Gathering paths from GFA"):
            path_idx, path_dict, reference_info = parse_paths(get_reader(gfa_file), ref_path, ref_offset, path_sep, dir)
            reference_path, matching_refs = reference_info
        verify_reference(reference_path, matching_refs)

        # ==== PASS 2: SEGMENTS + LINKS (single file read) ====
        with log.step("🍡", "Gathering segments and links from GFA"):
            segment_idx, link_idx, seg_count, lnk_count = _parse_segments_and_links(
                gfa_file, layout_coords, path_idx, path_dict, dir
            )
        log.summary(f"{seg_count} segments, {lnk_count} links total.")

        # ==== STEP INDEX ====
        write_step_index(segment_idx, ref, reference_path, dir)

    return path_idx, segment_idx, link_idx
