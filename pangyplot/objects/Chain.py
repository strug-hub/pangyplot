class Chain:
    def __init__(self, chain_id, bubbles=None, parent_bubble=None, gfaidx=None,
                 is_chunk=False):
        self.id = chain_id
        self.gfaidx = gfaidx

        self.parent_bubble = parent_bubble # object not id
        self.bubbles = bubbles if bubbles is not None else []
        self.is_chunk = is_chunk  # True when this is a pre-split chunk of a long chain

        self._sort_bubbles()

    def __getitem__(self, i):
        return self.bubbles[i]

    def source_bubble(self): return self.bubbles[0] if self.bubbles else None
    def sink_bubble(self): return self.bubbles[-1] if self.bubbles else None

    def chain_step_range(self):
        return (self[0].chain_step, self[-1].chain_step) if len(self.bubbles) > 0 else (None, None)

    def get_internal_segment_ids(self, include_ends=True, as_set=False):
        seg_ids = []
        for i, bubble in enumerate(self.bubbles[:-1]):
            seg_ids.extend(bubble.sink_segments)

        if include_ends:
            seg_ids.extend(self.bubbles[0].get_source_segments())
            seg_ids.extend(self.bubbles[-1].get_sink_segments())

        return set(seg_ids) if as_set else seg_ids

    def _sort_bubbles(self):
        if len(self.bubbles) < 2:
            return
        self.bubbles.sort(key=lambda bubble: bubble.chain_step)
        self._assign_siblings()

    def _assign_siblings(self):
        chain_order = [None, *self.bubbles, None]
        for i, bubble in enumerate(chain_order):
            if bubble is None: continue
            bubble.add_source_sibling(chain_order[i - 1])
            bubble.add_sink_sibling(chain_order[i + 1])
            bubble.correct_source_sink(chain_order[i - 1], chain_order[i + 1])

    def __len__(self):
        return len(self.bubbles)

    def __str__(self):
        return f"Chain(id={self.id}, n_bubbles={len(self.bubbles)})"

    def __repr__(self):
        return f"Chain({self.id}, n_bubbles={len(self.bubbles)})"
