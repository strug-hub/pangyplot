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

    def serialize(self):
        return {
            "id": self.id,
            "nodeid": f"s{self.id}",
            "x1": self.x1,
            "y1": self.y1,
            "x2": self.x2,
            "y2": self.y2,
            "seq": self.seq,
            "gc_count": self.gc_count,
            "n_count": self.n_count,
            "length": self.length,
            "range_inclusive": [[step, step] for step in self.step],
            "range_exclusive": [[step, step] for step in self.step],
            "type": "segment"
        }

    def add_step(self, step_index):
        self.step = step_index.query_segment(self.id)

    def __str__(self):
        seq = self.seq if len(self.seq) <= 10 else self.seq[:10] + "..."
        return f"Segment(id={self.id}, {self.length}bp, seq={seq})"

    def __repr__(self):
        return f"Segment({self.id})"
