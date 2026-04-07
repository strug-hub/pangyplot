"""Auto-migrate legacy JSON path files to compressed .binpath format.

Called on startup by the run command, similar to ensure_skeleton.
"""

import json
import os

from pangyplot.db.path_codec import write_binpath


PATHS_DIR = "paths"


def _find_legacy_json(paths_dir):
    """Return list of .json path files (excluding sample_idx.json)."""
    if not os.path.isdir(paths_dir):
        return []
    return [
        f for f in os.listdir(paths_dir)
        if f.endswith(".json") and "__" in f
    ]


def _migrate_chromosome(paths_dir):
    """Migrate all legacy .json path files in a directory to .binpath.

    Returns (n_migrated, bytes_saved).
    """
    json_files = _find_legacy_json(paths_dir)
    if not json_files:
        return 0, 0

    n_migrated = 0
    bytes_saved = 0

    for filename in json_files:
        json_path = os.path.join(paths_dir, filename)
        binpath_path = json_path.rsplit(".json", 1)[0] + ".binpath"

        with open(json_path, "r") as f:
            data = json.load(f)

        steps = data.pop("path", [])
        write_binpath(binpath_path, data, steps)

        old_size = os.path.getsize(json_path)
        new_size = os.path.getsize(binpath_path)
        bytes_saved += old_size - new_size

        os.remove(json_path)
        n_migrated += 1

    return n_migrated, bytes_saved


def ensure_paths(data_dir, db_name):
    """Migrate any legacy JSON path files to compressed .binpath format.

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
        if not _find_legacy_json(paths_dir):
            continue

        print(f"[Paths] Migrating legacy paths for {chrom}...", end="", flush=True)
        n_migrated, bytes_saved = _migrate_chromosome(paths_dir)
        saved_mb = bytes_saved / (1024 * 1024)
        print(f" {n_migrated} files, {saved_mb:.1f} MB saved.")
