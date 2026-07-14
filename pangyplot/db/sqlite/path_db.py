import os
import json
from collections import defaultdict
from pangyplot.objects.Path import Path
from pangyplot.db.path_codec import (
    write_binpath, write_binpath_combined, read_binpath, read_binpath_raw,
    write_path_index, read_path_index, INDEX_FILENAME,
)

DB_NAME = "paths"
SAMPLE_IDX = "sample_idx.json"

# -------------------------------------------------------------------
# Sample index (unchanged)
# -------------------------------------------------------------------

def store_sample_idx(dir, sample_idx):
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.exists(db_path):
        os.makedirs(db_path)

    with open(os.path.join(db_path, SAMPLE_IDX), "w") as f:
        json.dump(sample_idx, f)

def retrieve_sample_idx(dir):
    db_path = os.path.join(dir, DB_NAME)
    with open(os.path.join(db_path, SAMPLE_IDX), "r") as f:
        return json.load(f)

# -------------------------------------------------------------------
# Path storage (preprocessing)
# -------------------------------------------------------------------

# Accumulates metadata during preprocessing for finalize_paths()
_pending_metadata = {}

def store_path(dir, path, combined=None):
    """Store a path as a pure .binpath file. Call finalize_paths() after all paths stored.

    `combined` is the packed step array, if the caller already derived it --
    parse_paths does, to key path_dict, and deriving it twice is the single most
    expensive thing in that phase.
    """
    sample = path.sample_name()
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.exists(db_path):
        os.makedirs(db_path)

    filepath = get_filename(db_path, sample)
    filename = os.path.basename(filepath)

    if combined is None:
        write_binpath(filepath, path.path)
    else:
        write_binpath_combined(filepath, combined)

    # Accumulate metadata for index.json
    key = db_path
    if key not in _pending_metadata:
        _pending_metadata[key] = {}

    if sample not in _pending_metadata[key]:
        _pending_metadata[key][sample] = []

    _pending_metadata[key][sample].append({
        "file": filename,
        "full_id": path.full_id,
        "contig": path.contig,
        "start": path.start,
        "length": path.length,
        "is_ref": path.is_ref,
    })


def finalize_paths(dir):
    """Write index.json with accumulated metadata. Call after all store_path() calls."""
    db_path = os.path.join(dir, DB_NAME)
    key = db_path
    entries = _pending_metadata.pop(key, {})
    write_path_index(db_path, entries)

# -------------------------------------------------------------------
# Path retrieval (runtime)
# -------------------------------------------------------------------

def create_path(paths_dir, meta):
    """Create a Path object from index metadata + .binpath file."""
    filepath = os.path.join(paths_dir, meta["file"])
    steps = read_binpath(filepath)

    path = Path()
    path.full_id = meta.get("full_id")
    path.sample = meta.get("full_id", "").split("#")[0] if meta.get("full_id") else None
    path.hap = meta.get("full_id", "").split("#")[1] if meta.get("full_id") and "#" in meta.get("full_id", "") else None
    path.contig = meta.get("contig")
    path.start = meta.get("start")
    path.length = meta.get("length")
    path.is_ref = meta.get("is_ref", False)
    path.path = steps
    return path


def retrieve_paths(dir, sample):
    """Load all paths for a sample using index.json + .binpath files."""
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.isdir(db_path):
        return []

    index = read_path_index(db_path)
    sample_entries = index.get("paths", {}).get(sample, [])

    paths = []
    for meta in sample_entries:
        paths.append(create_path(db_path, meta))
    return paths


def retrieve_path_meta(dir, sample):
    """Return metadata for a sample's paths without loading step data."""
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.isdir(db_path):
        return []

    index = read_path_index(db_path)
    return index.get("paths", {}).get(sample, [])


def retrieve_path_raw(dir, sample, file_index):
    """Return raw compressed bytes for a specific path file."""
    db_path = os.path.join(dir, DB_NAME)
    index = read_path_index(db_path)
    sample_entries = index.get("paths", {}).get(sample, [])

    if file_index < 0 or file_index >= len(sample_entries):
        return None

    filepath = os.path.join(db_path, sample_entries[file_index]["file"])
    return read_binpath_raw(filepath)


# -------------------------------------------------------------------
# Filename management
# -------------------------------------------------------------------

_filename_counters = {}

def reset_filename_counters():
    _filename_counters.clear()
    _pending_metadata.clear()

def get_filename(db_path, sample):
    key = (db_path, sample)
    idx = _filename_counters.get(key, 0) + 1
    _filename_counters[key] = idx
    return os.path.join(db_path, f"{sample}__{idx}.binpath")

# -------------------------------------------------------------------
# Summary (for PathIndex)
# -------------------------------------------------------------------

def summarize(dir):
    """Return dict of sample → [filenames] from index.json."""
    db_path = os.path.join(dir, DB_NAME)
    index_path = os.path.join(db_path, INDEX_FILENAME)

    if os.path.exists(index_path):
        index = read_path_index(db_path)
        summary = defaultdict(list)
        for sample, entries in index.get("paths", {}).items():
            for entry in entries:
                summary[sample].append(entry["file"])
        return summary

    # Fallback: scan directory
    summary = defaultdict(list)
    for filename in os.listdir(db_path):
        if filename.endswith(".binpath") and "__" in filename:
            sample = filename.split("__")[0]
            summary[sample].append(filename)
    return summary
