import pangyplot.db.sqlite.path_db as path_db

class PathIndex:
    def __init__(self, dir):
        self.dir = dir
        self.samples = path_db.summarize(dir)

        self.sample_idx = path_db.retrieve_sample_idx(dir)

    def get_samples(self):
        return [sample for sample in self.samples]

    def get_paths(self, sample):
        return path_db.retrieve_paths(self.dir, sample)

    def __len__(self):
        return len(self.samples)
    
    def __repr__(self):
        return f"PathIndex(dir={self.dir}, samples={self.samples})"
    def __str__(self):
        return f"PathIndex with {len(self.samples)} samples"