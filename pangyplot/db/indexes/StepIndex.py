import bisect
from collections import defaultdict
from array import array
import pangyplot.db.sqlite.step_db as db
import pangyplot.db.db_utils as utils

QUICK_INDEX = "steps.quickindex.json"

class StepIndex:
    def __init__(self, dir, genome):
        self.dir = dir
        self.genome = genome

        if not self.load_quick_index():
            self.starts = array('I')
            self.ends = array('I')
            self.segments = array('I')

            for row in db.load_steps(self.dir, genome):
                self.segments.append(row["seg_id"])
                self.starts.append(row["start"])
                self.ends.append(row["end"])

            self.save_quick_index()

    def __getitem__(self, step):
        if step < 0 or step >= len(self.segments):
            return None
        return self.segments[step]

    def serialize(self):
        return {
            "starts": self.starts.tolist(),
            "ends": self.ends.tolist(),
            "segments": self.segments.tolist()
        }
    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False
        
        self.starts = array('I', quick_index["starts"])
        self.ends = array('I', quick_index["ends"])
        self.segments = array('I', quick_index["segments"])
        return True
    
    def query_segment(self, seg_id):
        return db.get_segment_steps(self.dir, seg_id)

    def query_bp(self, bp_position):
        i = bisect.bisect_right(self.starts, bp_position) - 1
        i = max(i, 0)
        return (i, self.starts[i], self.ends[i])

    def query_coordinates(self, start, end, debug=False):
        res1 = self.query_bp(start)
        res2 = self.query_bp(end)

        if res1 is None or res2 is None:
            raise ValueError("Step not found for the given bp position")

        if debug:
            print(f"""[DEBUG] Position query results {start}-{end}. 
                  START: step={res1[0]} / ref coords {res1[1]}-{res1[2]} / nodes {self._step_to_segment[res1[0]]}
                  END:   step={res2[0]} / ref coords {res2[1]}-{res2[2]} / nodes {self._step_to_segment[res2[0]]}""")
        return (res1[0], res2[0])

    def get_genome(self):
        return self.genome
    
    def segment_map(self):
        seg_map = defaultdict(list)
        for i in range(len(self.segments)):
            seg_map[self.segments[i]].append(i)
        return seg_map

