"""Auto-migrate legacy path files to the current compressed format.

Called on startup by the run command, similar to ensure_skeleton.
Handles two legacy formats:
  1. Plain JSON files (.json) — original format
  2. Old .binpath with embedded headers — first compressed format
Both are migrated to: pure .binpath (no header) + index.json
"""

import json
import os

from pangyplot.db.path_codec import (
    encode_steps, write_binpath, write_path_index,
    read_legacy_binpath, is_legacy_binpath, path_index_version,
)
from pangyplot.version import __version__, is_compatible_version


PATHS_DIR = "paths"


def _find_legacy_json(paths_dir):
    """Return list of .json path files (excluding sample_idx.json and index.json)."""
    if not os.path.isdir(paths_dir):
        return []
    return [
        f for f in os.listdir(paths_dir)
        if f.endswith(".json") and "__" in f
    ]


def _find_legacy_binpath(paths_dir):
    """Return list of old-format .binpath files (with embedded headers)."""
    if not os.path.isdir(paths_dir):
        return []
    candidates = [f for f in os.listdir(paths_dir) if f.endswith(".binpath")]
    if not candidates:
        return []
    # Check first file to see if it's old format
    first = os.path.join(paths_dir, candidates[0])
    if is_legacy_binpath(first):
        return candidates
    return []


def _needs_migration(paths_dir):
    """Check if migration is needed."""
    if _find_legacy_json(paths_dir):
        return True
    if _find_legacy_binpath(paths_dir):
        return True
    if not is_compatible_version(path_index_version(paths_dir)):
        return True
    return False


def _migrate_chromosome(paths_dir):
    """Migrate all legacy path files to the new split format.

    Returns (n_migrated, bytes_saved).
    """
    json_files = _find_legacy_json(paths_dir)
    legacy_binpath_files = _find_legacy_binpath(paths_dir)

    index_entries = {}
    n_migrated = 0
    bytes_saved = 0

    # Migrate .json files
    for filename in json_files:
        json_path = os.path.join(paths_dir, filename)
        binpath_name = filename.rsplit(".json", 1)[0] + ".binpath"
        binpath_path = os.path.join(paths_dir, binpath_name)

        with open(json_path, "r") as f:
            data = json.load(f)

        steps = data.pop("path", [])
        sample = data.get("id", filename.split("__")[0])

        write_binpath(binpath_path, steps)

        if sample not in index_entries:
            index_entries[sample] = []
        index_entries[sample].append({
            "file": binpath_name,
            "full_id": data.get("full_id"),
            "contig": data.get("contig"),
            "start": data.get("start"),
            "length": data.get("length"),
            "is_ref": data.get("is_ref", False),
        })

        old_size = os.path.getsize(json_path)
        new_size = os.path.getsize(binpath_path)
        bytes_saved += old_size - new_size

        os.remove(json_path)
        n_migrated += 1

    # Migrate old-format .binpath files (with headers)
    for filename in legacy_binpath_files:
        filepath = os.path.join(paths_dir, filename)
        old_size = os.path.getsize(filepath)

        metadata, steps = read_legacy_binpath(filepath)
        sample = metadata.get("id", filename.split("__")[0])

        # Rewrite as pure binary (no header)
        write_binpath(filepath, steps)
        new_size = os.path.getsize(filepath)
        bytes_saved += old_size - new_size

        if sample not in index_entries:
            index_entries[sample] = []
        index_entries[sample].append({
            "file": filename,
            "full_id": metadata.get("full_id"),
            "contig": metadata.get("contig"),
            "start": metadata.get("start"),
            "length": metadata.get("length"),
            "is_ref": metadata.get("is_ref", False),
        })

        n_migrated += 1

    # If we only need to rebuild index.json (version mismatch, no file migration)
    if not json_files and not legacy_binpath_files:
        # Rebuild index from existing pure .binpath files + old index
        old_index_path = os.path.join(paths_dir, "index.json")
        if os.path.exists(old_index_path):
            with open(old_index_path, "r") as f:
                old_index = json.load(f)
            index_entries = old_index.get("paths", {})

    if index_entries:
        write_path_index(paths_dir, index_entries)

    return n_migrated, bytes_saved


def ensure_paths(data_dir, db_name):
    """Migrate any legacy path files to the current compressed format.

    Walks each chromosome's paths/ directory under the graph folder.
    Called automatically by the run command before starting the server.
    """
    graph_path = os.path.join(data_dir, "graphs", db_name)
    if not os.path.isdir(graph_path):
        return

    chromosomes = [
        d for d in os.listdir(graph_path)
        if os.path.isdir(os.path.join(graph_path, d))
    ]

    for chrom in sorted(chromosomes):
        paths_dir = os.path.join(graph_path, chrom, PATHS_DIR)
        if not os.path.isdir(paths_dir):
            continue
        if not _needs_migration(paths_dir):
            continue

        print(f"[Paths] Migrating paths for {chrom}...", end="", flush=True)
        n_migrated, bytes_saved = _migrate_chromosome(paths_dir)
        if n_migrated > 0:
            saved_mb = bytes_saved / (1024 * 1024)
            print(f" {n_migrated} files, {saved_mb:.1f} MB saved.")
        else:
            print(f" index updated.")
