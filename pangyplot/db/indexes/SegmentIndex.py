from array import array
import pangyplot.db.sqlite.segment_db as db
import pangyplot.db.db_utils as utils

QUICK_INDEX = "segments.quickindex.json"

class SegmentIndex:
    def __init__(self, dir):
        self.dir = dir
        
        if not self.load_quick_index():
            max_id = db.get_max_id(self.dir)
            
            #self.id = array('I', [0] * (max_id + 1))
            self.length = array('I', [0] * (max_id + 1))
            self.x1 = array('f', [0.0] * (max_id + 1))
            self.y1 = array('f', [0.0] * (max_id + 1))
            self.x2 = array('f', [0.0] * (max_id + 1))
            self.y2 = array('f', [0.0] * (max_id + 1))
            self.valid = array('B', [0] * (max_id + 1))

            for row in db.get_index_info(self.dir):
                sid = row["id"]
                #self.id[sid] = sid
                self.valid[sid] = 1
                self.length[sid] = row["length"]
                self.x1[sid] = row["x1"]
                self.y1[sid] = row["y1"]
                self.x2[sid] = row["x2"]
                self.y2[sid] = row["y2"]

            self.save_quick_index()

    def __getitem__(self, seg_id):
        return db.get_segment(self.dir, seg_id)

    def __len__(self):
        return sum(self.valid)

    def __iter__(self):
        return db.get_all(self.dir)

    def max_id(self):
        return db.get_max_id(self.dir)

    def segment_length(self, seg_id):
        return self.length[seg_id] if seg_id < len(self.length) else 0

    def segment_gc_n_count(self, seg_id):
        return db.get_segment_gc_n_count(self.dir, seg_id)

    def serialize(self):
        return {
            #"id": self.id.tolist(),
            "length": self.length.tolist(),
            "x1": self.x1.tolist(),
            "y1": self.y1.tolist(),
            "x2": self.x2.tolist(),
            "y2": self.y2.tolist(),
            "valid": self.valid.tolist()
        }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False
        
        #self.id = array('I', quick_index["id"])
        self.length = array('I', quick_index["length"])
        self.x1 = array('f', quick_index["x1"])
        self.y1 = array('f', quick_index["y1"])
        self.x2 = array('f', quick_index["x2"])
        self.y2 = array('f', quick_index["y2"])
        self.valid = array('B', quick_index["valid"])

        return True

    def get_by_ids(self, seg_ids, step_index=None):
        return [db.get_segment(self.dir, seg_id, step_index) for seg_id in seg_ids if seg_id < len(self.valid) and self.valid[seg_id]]

    def get_between(self, start_id, end_id, step_index=None):
        return db.get_segment_range(self.dir, start_id, end_id, step_index)

