import json
import os

import numpy as np

from array import array
import pangyplot.db.sqlite.segment_db as db
import pangyplot.db.db_utils as utils
from pangyplot.version import __version__

QUICK_INDEX = "segments.quickindex.json"
MMAP_DIR = "segments.mmapindex"

ARRAYS = {
    "length": np.uint32,
    "x1": np.float32,
    "y1": np.float32,
    "x2": np.float32,
    "y2": np.float32,
    "valid": np.uint8,
}


class SegmentIndex:
    def __init__(self, dir):
        self.dir = dir

        if not self.load_mmap_index():
            self._build_from_sqlite()
            self.save_mmap_index()

    def _build_from_sqlite(self):
        max_id = db.get_max_id(self.dir)

        self.length = array('I', [0] * (max_id + 1))
        self.x1 = array('f', [0.0] * (max_id + 1))
        self.y1 = array('f', [0.0] * (max_id + 1))
        self.x2 = array('f', [0.0] * (max_id + 1))
        self.y2 = array('f', [0.0] * (max_id + 1))
        self.valid = array('B', [0] * (max_id + 1))

        for row in db.get_index_info(self.dir):
            sid = row["id"]
            self.valid[sid] = 1
            self.length[sid] = row["length"]
            self.x1[sid] = row["x1"]
            self.y1[sid] = row["y1"]
            self.x2[sid] = row["x2"]
            self.y2[sid] = row["y2"]

        self._count = int(sum(self.valid))

    def __getitem__(self, seg_id):
        return db.get_segment(self.dir, seg_id)

    def __len__(self):
        return self._count

    def __iter__(self):
        return db.get_all(self.dir)

    def max_id(self):
        return db.get_max_id(self.dir)

    def segment_length(self, seg_id):
        return self.length[seg_id] if seg_id < len(self.length) else 0

    def segment_gc_n_count(self, seg_id):
        return db.get_segment_gc_n_count(self.dir, seg_id)

    # -- mmap binary index ------------------------------------------------

    def save_mmap_index(self):
        mmap_dir = os.path.join(self.dir, MMAP_DIR)
        os.makedirs(mmap_dir, exist_ok=True)

        for name, dtype in ARRAYS.items():
            arr = getattr(self, name)
            np.save(os.path.join(mmap_dir, f"{name}.npy"),
                    np.array(arr, dtype=dtype))

        meta = {
            "version": __version__,
            "count": self._count,
            "max_id": len(self.valid) - 1,
        }
        with open(os.path.join(mmap_dir, "meta.json"), "w") as f:
            json.dump(meta, f)

    def load_mmap_index(self):
        mmap_dir = os.path.join(self.dir, MMAP_DIR)
        meta_path = os.path.join(mmap_dir, "meta.json")

        if not os.path.isdir(mmap_dir) or not os.path.exists(meta_path):
            return False

        with open(meta_path) as f:
            meta = json.load(f)

        for name in ARRAYS:
            if not os.path.exists(os.path.join(mmap_dir, f"{name}.npy")):
                return False

        for name in ARRAYS:
            setattr(self, name,
                    np.load(os.path.join(mmap_dir, f"{name}.npy"),
                            mmap_mode='r'))

        self._count = meta["count"]
        return True

    @classmethod
    def validate(cls, chr_dir):
        mmap_dir = os.path.join(chr_dir, MMAP_DIR)
        meta_path = os.path.join(mmap_dir, "meta.json")

        if not os.path.isdir(mmap_dir) or not os.path.exists(meta_path):
            return False

        try:
            for name in ARRAYS:
                if not os.path.exists(os.path.join(mmap_dir, f"{name}.npy")):
                    return False
        except (json.JSONDecodeError, KeyError, ValueError):
            return False

        return True

    # -- legacy JSON quickindex (kept for serialize/export) ----------------

    def serialize(self):
        return {
            "length": self.length.tolist(),
            "x1": self.x1.tolist(),
            "y1": self.y1.tolist(),
            "x2": self.x2.tolist(),
            "y2": self.y2.tolist(),
            "valid": self.valid.tolist(),
        }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False

        self.length = array('I', quick_index["length"])
        self.x1 = array('f', quick_index["x1"])
        self.y1 = array('f', quick_index["y1"])
        self.x2 = array('f', quick_index["x2"])
        self.y2 = array('f', quick_index["y2"])
        self.valid = array('B', quick_index["valid"])
        self._count = int(sum(self.valid))
        return True

    # -- query helpers (delegate to SQLite) --------------------------------

    def get_by_ids(self, seg_ids, step_index=None):
        return [db.get_segment(self.dir, seg_id, step_index) for seg_id in seg_ids if seg_id < len(self.valid) and self.valid[seg_id]]

    def get_between(self, start_id, end_id, step_index=None):
        return db.get_segment_range(self.dir, start_id, end_id, step_index)
