import sys
import time
import gzip
from pangyplot.db.sqlite.step_db import write_step_index
from pangyplot.preprocess.parser.gfa.parse_segments import parse_segments
from pangyplot.preprocess.parser.gfa.parse_links import parse_links
from pangyplot.preprocess.parser.gfa.parse_paths import parse_paths

def get_reader(gfa_file):
    if gfa_file.endswith(".gz"):
        return gzip.open(gfa_file, 'rt')
    return open(gfa_file)

def verify_reference(ref_path, matching_refs):
    if len(matching_refs) == 0:
        print(f"   ❌ ERROR: Reference sample '{ref_path}' not found in any sample IDs.")
        sys.exit(1)
    elif len(matching_refs) > 1:
        print(f"   ❌ ERROR: Reference sample string '{ref_path}' matched multiple samples:")
        for full_name, sample_name in matching_refs:
            print(f"     - {full_name}")
        print("   Please provide a more specific reference name.")
        sys.exit(1)

    full_name, sample_name = matching_refs[0]
    print(f"   🎯 Found reference path {full_name} -> {sample_name}.")

def parse_gfa(gfa_file, ref, path, ref_offset, path_sep, layout_coords, dir):
    print(f"→ Parsing GFA file: {gfa_file}.")
    
    if path:
        print(f"   🔍 Looking for path: {ref} (reference genome = {ref})")
        ref_path = path
    else:
        print(f"   🔎 Looking for reference path with name: {ref}")
        ref_path = ref

    # ==== PATHS ====
    print("   🧵 Gathering paths from GFA...", end="", flush=True)
    start_time = time.time()
    path_idx, path_dict, reference_info = parse_paths(get_reader(gfa_file), ref_path, ref_offset, path_sep, dir)
    reference_path, matching_refs = reference_info
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")
    verify_reference(reference_path, matching_refs)

    # ==== SEGMENTS ====
    print("   🍡 Gathering segments from GFA...", end="", flush=True)
    start_time = time.time()
    segment_idx = parse_segments(get_reader(gfa_file), layout_coords, dir)
    write_step_index(segment_idx, ref, reference_path, dir)

    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")
    print(f"      {len(segment_idx)} segments total.")

    # ==== LINKS ====
    print("   🧷 Gathering links from GFA...", end="", flush=True)
    start_time = time.time()
    link_idx = parse_links(get_reader(gfa_file), path_idx, path_dict, dir)
    end_time = time.time()
    print(f" Done. Took {round(end_time - start_time,1)} seconds.")
    print(f"      {len(link_idx)} links total.")

    return path_idx, segment_idx, link_idx
