import pangyplot.db.sqlite.path_db as path_db


class PathIndex:
    def __init__(self, dir):
        self.dir = dir
        self.samples = path_db.summarize(dir)
        self.sample_idx = path_db.retrieve_sample_idx(dir)

    def get_samples(self):
        return [sample for sample in self.samples]

    def get_sample_idx(self):
        return self.sample_idx

    def get_paths(self, sample):
        return path_db.retrieve_paths(self.dir, sample)

    def get_path_meta(self, sample):
        """Return metadata for a sample's paths without loading step data."""
        return path_db.retrieve_path_meta(self.dir, sample)

    def get_path_raw(self, sample, file_index):
        """Return raw compressed bytes for a specific path file."""
        return path_db.retrieve_path_raw(self.dir, sample, file_index)

    def __len__(self):
        return len(self.samples)

    def __repr__(self):
        return f"PathIndex(dir={self.dir}, samples={self.samples})"

    def __str__(self):
        return f"PathIndex with {len(self.samples)} samples"
