from array import array
import pangyplot.db.sqlite.segment_db as db
import pangyplot.db.db_utils as utils

QUICK_INDEX = "segments.quickindex.json"

class SegmentIndex:
    def __init__(self, dir):
        self.dir = dir

        if not self.load_quick_index():
            rows = db.load_segments(self.dir)
            max_id = max(row["id"] for row in rows) if rows else 0

            self.id = array('I', [0] * (max_id + 1))
            self.length = array('I', [0] * (max_id + 1))
            self.x1 = array('f', [0.0] * (max_id + 1))
            self.y1 = array('f', [0.0] * (max_id + 1))
            self.x2 = array('f', [0.0] * (max_id + 1))
            self.y2 = array('f', [0.0] * (max_id + 1))

            for row in rows:
                sid = row["id"]
                self.length[sid] = row["length"]
                self.x1[sid] = row["x1"]
                self.y1[sid] = row["y1"]
                self.x2[sid] = row["x2"]
                self.y2[sid] = row["y2"]

            self.save_quick_index()

    def __getitem__(self, seg_id):
        return db.get_segment(self.dir, seg_id)

    def serialize(self):
        return {
            "id": self.id.tolist(),
            "length": self.length.tolist(),
            "x1": self.x1.tolist(),
            "y1": self.y1.tolist(),
            "x2": self.x2.tolist(),
            "y2": self.y2.tolist()
        }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False
        
        self.id = array('I', quick_index["id"])
        self.length = array('I', quick_index["length"])
        self.x1 = array('f', quick_index["x1"])
        self.y1 = array('f', quick_index["y1"])
        self.x2 = array('f', quick_index["x2"])
        self.y2 = array('f', quick_index["y2"])
        return True

    def get_by_ids(self, seg_ids):
        return [db.get_segment(self.dir, seg_id) for seg_id in seg_ids if seg_id < len(self.id)]

    def get_between(self, start_id, end_id):
        return db.get_segment_range(self.dir, start_id, end_id)

