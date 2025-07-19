from array import array
import pangyplot.db.sqlite.segment_db as db

class SegmentIndex:
    def __init__(self, chr_dir):
        self.conn = db.get_connection(chr_dir)
        self.cur = self.conn.cursor()
        
        rows = db.load_segments(self.cur)
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

    def __getitem__(self, seg_id):
        return db.get_segment(self.cur, seg_id)
    
    def get_by_ids(self, seg_ids):
        return [db.get_segment(self.cur, seg_id) for seg_id in seg_ids if seg_id < len(self.id)]

    def get_between(self, start_id, end_id):
        return db.get_segment_range(self.cur, start_id, end_id)

