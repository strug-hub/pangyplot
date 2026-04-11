import os

import pangyplot.db.sqlite.path_db as path_db
from pangyplot.db.path_codec import read_binpath, read_path_index


class PathIndex:
    def __init__(self, dir):
        self.dir = dir
        self.samples = path_db.summarize(dir)
        self.sample_idx = path_db.retrieve_sample_idx(dir)
        self._subpath_bp_ranges = {}  # {sample: [(bp_start, bp_end), ...]}

    def compute_bp_ranges(self, step_index):
        """Precompute bp ranges for every subpath using the step index.

        Call once after both PathIndex and StepIndex are loaded.
        """
        # Build segment_id → (min_bp, max_bp) from step index
        seg_to_bp = {}
        for i in range(len(step_index.starts)):
            seg_id = int(step_index.segments[i])
            bp_s = int(step_index.starts[i])
            bp_e = int(step_index.ends[i])
            if seg_id not in seg_to_bp:
                seg_to_bp[seg_id] = (bp_s, bp_e)
            else:
                old_s, old_e = seg_to_bp[seg_id]
                seg_to_bp[seg_id] = (min(old_s, bp_s), max(old_e, bp_e))

        # For each sample's subpaths, decode segment IDs and find bp range
        paths_dir = os.path.join(self.dir, path_db.DB_NAME)
        if not os.path.isdir(paths_dir):
            return

        index = read_path_index(paths_dir)
        all_paths = index.get("paths", {})

        for sample, entries in all_paths.items():
            ranges = []
            for entry in entries:
                filepath = os.path.join(paths_dir, entry["file"])
                try:
                    steps = read_binpath(filepath)
                except Exception:
                    ranges.append((None, None))
                    continue

                min_bp = None
                max_bp = None
                for step_str in steps:
                    seg_id = int(step_str[:-1])
                    if seg_id in seg_to_bp:
                        s, e = seg_to_bp[seg_id]
                        if min_bp is None or s < min_bp:
                            min_bp = s
                        if max_bp is None or e > max_bp:
                            max_bp = e
                ranges.append((min_bp, max_bp))
            self._subpath_bp_ranges[sample] = ranges

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
