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
    "gc_count": np.uint32,
    "n_count": np.uint32,
    "x1": np.float32,
    "y1": np.float32,
    "x2": np.float32,
    "y2": np.float32,
    "valid": np.uint8,
}


class SegmentIndex:
    def __init__(self, dir, client=None, coords=None):
        self.dir = dir

        # `client` (a GbwtClient in graph mode) sources segments from the GBZ
        # instead of segments.db; `coords` maps segment id -> (x1,y1,x2,y2) from
        # the layout file (the GBZ has no 2D coordinates). Without a client this
        # is the legacy SQLite-backed build. Either way the mmap cache wins first.
        # `client` is retained so __iter__/__getitem__ can build Segment objects
        # from the resident arrays when there is no segments.db (GBZ-native).
        self._client = client
        if not self.load_mmap_index():
            if client is not None:
                self._build_from_gbz(client, coords)
            else:
                self._build_from_sqlite()
            self.save_mmap_index()

    def _alloc(self, max_id):
        self.length = array('I', [0] * (max_id + 1))
        self.gc_count = array('I', [0] * (max_id + 1))
        self.n_count = array('I', [0] * (max_id + 1))
        self.x1 = array('f', [0.0] * (max_id + 1))
        self.y1 = array('f', [0.0] * (max_id + 1))
        self.x2 = array('f', [0.0] * (max_id + 1))
        self.y2 = array('f', [0.0] * (max_id + 1))
        self.valid = array('B', [0] * (max_id + 1))

    def _build_from_sqlite(self):
        self._alloc(db.get_max_id(self.dir))

        for row in db.get_index_info(self.dir):
            sid = row["id"]
            self.valid[sid] = 1
            self.length[sid] = row["length"]
            self.gc_count[sid] = row["gc_count"]
            self.n_count[sid] = row["n_count"]
            self.x1[sid] = row["x1"]
            self.y1[sid] = row["y1"]
            self.x2[sid] = row["x2"]
            self.y2[sid] = row["y2"]

        self._count = int(sum(self.valid))

    def _build_from_gbz(self, client, coords=None):
        """Fill the scalar arrays from the graphd's /segments (length, gc, n) plus
        the layout `coords` (segment id -> (x1,y1,x2,y2)); the GBZ carries no
        coordinates. `coords` may be a dict or any object indexable by segment id.
        """
        rows = client.segments()  # (N, 4): id, length, gc, n
        max_id = int(rows[:, 0].max()) if len(rows) else 0
        self._alloc(max_id)

        for sid, length, gc, n in rows.tolist():
            self.valid[sid] = 1
            self.length[sid] = length
            self.gc_count[sid] = gc
            self.n_count[sid] = n
            if coords is not None:
                c = coords[sid] if sid in coords else None
                if c is not None:
                    self.x1[sid], self.y1[sid], self.x2[sid], self.y2[sid] = c

        self._count = len(rows)

    def __getitem__(self, seg_id):
        if self._client is not None:
            return self._segment_from_arrays(seg_id)
        return db.get_segment(self.dir, seg_id)

    def __len__(self):
        return self._count

    def __iter__(self):
        if self._client is not None:
            return self._iter_from_arrays()
        return db.get_all(self.dir)

    def max_id(self):
        if self._client is not None:
            return len(self.valid) - 1
        return db.get_max_id(self.dir)

    # -- GBZ-native Segment objects (from the resident arrays; no segments.db) --
    #
    # The flat bubble backend (the default) reads only length/gc/n/coords, so a
    # Segment built from the arrays is sufficient. `seq` is None here -- the
    # BubbleGun backend, which needs DNA, isn't supported for GBZ-native input
    # until the graphd serves per-segment sequences.

    def _segment_from_arrays(self, seg_id):
        from pangyplot.objects.Segment import Segment
        seg = Segment()
        seg.id = seg_id
        seg.length = int(self.length[seg_id])
        seg.gc_count = int(self.gc_count[seg_id])
        seg.n_count = int(self.n_count[seg_id])
        seg.x1 = float(self.x1[seg_id])
        seg.y1 = float(self.y1[seg_id])
        seg.x2 = float(self.x2[seg_id])
        seg.y2 = float(self.y2[seg_id])
        return seg

    def _iter_from_arrays(self):
        for seg_id in range(len(self.valid)):
            if self.valid[seg_id]:
                yield self._segment_from_arrays(seg_id)

    def segment_length(self, seg_id):
        return self.length[seg_id] if seg_id < len(self.length) else 0

    def segment_gc_n_count(self, seg_id):
        if seg_id < len(self.gc_count):
            return [int(self.gc_count[seg_id]), int(self.n_count[seg_id])]
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
            "gc_count": self.gc_count.tolist(),
            "n_count": self.n_count.tolist(),
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
        self.gc_count = array('I', quick_index.get("gc_count", [0] * len(quick_index["length"])))
        self.n_count = array('I', quick_index.get("n_count", [0] * len(quick_index["length"])))
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
