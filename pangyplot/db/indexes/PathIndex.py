import json
import os

import numpy as np

import pangyplot.db.sqlite.path_db as path_db
from pangyplot.db.path_codec import (
    read_binpath, read_binpath_combined, read_path_index,
)

BP_RANGES_CACHE = "bp_ranges.json"


class PathIndex:
    def __init__(self, dir):
        self.dir = dir
        self.samples = path_db.summarize(dir)
        self.sample_idx = path_db.retrieve_sample_idx(dir)
        self._subpath_bp_ranges = {}  # {sample: [(bp_start, bp_end), ...]}

    def _bp_ranges_cache_path(self):
        return os.path.join(self.dir, path_db.DB_NAME, BP_RANGES_CACHE)

    def _load_bp_ranges_cache(self):
        path = self._bp_ranges_cache_path()
        if not os.path.exists(path):
            return False
        try:
            with open(path) as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            return False
        self._subpath_bp_ranges = {
            sample: [tuple(r) for r in ranges]
            for sample, ranges in data.items()
        }
        return True

    def _save_bp_ranges_cache(self):
        path = self._bp_ranges_cache_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        serializable = {
            sample: [list(r) for r in ranges]
            for sample, ranges in self._subpath_bp_ranges.items()
        }
        with open(path, "w") as f:
            json.dump(serializable, f)

    def compute_bp_ranges(self, step_index):
        """Precompute bp ranges for every subpath using the step index.

        Cached to disk; rebuilt only if the cache file is missing.
        Call once after both PathIndex and StepIndex are loaded.
        """
        paths_dir = os.path.join(self.dir, path_db.DB_NAME)
        if not os.path.isdir(paths_dir):
            return

        if self._load_bp_ranges_cache():
            return

        # segment_id -> (min_bp, max_bp), as arrays indexed by segment id so the
        # per-path lookup below is a vectorized gather rather than a dict probe
        # per step. A path can carry tens of millions of steps.
        segments = np.asarray(step_index.segments, dtype=np.int64)
        starts = np.asarray(step_index.starts, dtype=np.int64)
        ends = np.asarray(step_index.ends, dtype=np.int64)

        size = int(segments.max()) + 1 if segments.size else 0
        seg_min = np.full(size, np.iinfo(np.int64).max, dtype=np.int64)
        seg_max = np.full(size, np.iinfo(np.int64).min, dtype=np.int64)
        np.minimum.at(seg_min, segments, starts)
        np.maximum.at(seg_max, segments, ends)
        known = seg_min != np.iinfo(np.int64).max

        index = read_path_index(paths_dir)
        all_paths = index.get("paths", {})

        for sample, entries in all_paths.items():
            ranges = []
            for entry in entries:
                filepath = os.path.join(paths_dir, entry["file"])
                try:
                    combined = read_binpath_combined(filepath)
                except Exception:
                    ranges.append((None, None))
                    continue

                seg_ids = combined >> 1
                seg_ids = seg_ids[(seg_ids >= 0) & (seg_ids < size)]
                seg_ids = seg_ids[known[seg_ids]]

                if seg_ids.size == 0:
                    ranges.append((None, None))
                    continue

                ranges.append((int(seg_min[seg_ids].min()),
                               int(seg_max[seg_ids].max())))
            self._subpath_bp_ranges[sample] = ranges

        self._save_bp_ranges_cache()

    def get_samples(self):
        return [sample for sample in self.samples]

    def get_sample_idx(self):
        return self.sample_idx

    def get_paths(self, sample):
        return path_db.retrieve_paths(self.dir, sample)

    def get_path_meta(self, sample):
        """Return metadata for a sample's paths without loading step data."""
        return path_db.retrieve_path_meta(self.dir, sample)

    def get_path_meta_with_bp(self, sample):
        """Return metadata with precomputed bp_start/bp_end for each subpath."""
        meta = path_db.retrieve_path_meta(self.dir, sample)
        bp_ranges = self._subpath_bp_ranges.get(sample, [])
        for i, entry in enumerate(meta):
            if i < len(bp_ranges):
                entry["bp_start"] = bp_ranges[i][0]
                entry["bp_end"] = bp_ranges[i][1]
            else:
                entry["bp_start"] = None
                entry["bp_end"] = None
        return meta

    def get_path_raw(self, sample, file_index):
        """Return raw compressed bytes for a specific path file."""
        return path_db.retrieve_path_raw(self.dir, sample, file_index)

    def __len__(self):
        return len(self.samples)

    def __repr__(self):
        return f"PathIndex(dir={self.dir}, samples={self.samples})"

    def __str__(self):
        return f"PathIndex with {len(self.samples)} samples"
