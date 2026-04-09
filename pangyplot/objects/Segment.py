class Segment:
    def __init__(self):
        self.id = None
        self.gc_count = None
        self.n_count = None
        self.length = None
        self.x1 = None
        self.y1 = None
        self.x2 = None
        self.y2 = None
        self.seq = None
        self.step = []
        self.bp_start = None
        self.bp_end = None

    def serialize(self):
        return {
            "id": f"s{self.id}",
            "type": "segment",
            "x1": self.x1,
            "y1": self.y1,
            "x2": self.x2,
            "y2": self.y2,
            "seq": self.seq,
            "gc_count": self.gc_count,
            "n_count": self.n_count,
            "length": self.length,
            "ranges": [[step, step] for step in self.step],
            "bp_start": self.bp_start,
            "bp_end": self.bp_end,
       }

    def add_step(self, step_index):
        self.step = step_index.query_segment(self.id)
        self.bp_start = None
        self.bp_end = None
        for s in self.step:
            if s < len(step_index.starts):
                bp_s = step_index.starts[s]
                if self.bp_start is None or bp_s < self.bp_start:
                    self.bp_start = bp_s
            if s < len(step_index.ends):
                bp_e = step_index.ends[s]
                if self.bp_end is None or bp_e > self.bp_end:
                    self.bp_end = bp_e

    def __str__(self):
        seq = self.seq if len(self.seq) <= 10 else self.seq[:10] + "..."
        return f"Segment(id={self.id}, {self.length}bp, seq={seq})"

    def __repr__(self):
        return f"Segment({self.id})"
