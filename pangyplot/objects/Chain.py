from pangyplot.objects.ChainJunction import ChainJunction

class Chain:
    def __init__(self, chain_id, bubbles=None, parent_bubble=None, gfaidx=None):
        self.id = chain_id
        self.gfaidx = gfaidx

        self.parent_bubble = parent_bubble # object not id
        self.bubbles = bubbles if bubbles is not None else []

        self._sort_bubbles()

    def serialize(self):
        return {
            "nodes": [bubble.serialize() for bubble in self.bubbles],
            "links": [link.serialize() for link in self.get_chain_links()]
        }
    
    def __getitem__(self, i):
        return self.bubbles[i]

    def decompose(self):
        return self.bubbles, self.get_chain_links()
    
    def source_bubble(self): return self.bubbles[0] if self.bubbles else None
    def sink_bubble(self): return self.bubbles[-1] if self.bubbles else None

    def chain_step_range(self):
        return (self[0].chain_step, self[-1].chain_step) if len(self.bubbles) > 0 else (None, None)

    def emit_junctions(self, gfaidx):
        source = ChainJunction(self, True, gfaidx)
        sink = ChainJunction(self, False, gfaidx)
        return [source, sink]

    def get_chain_links(self):
        if self.gfaidx is None:
            return None
        links = []

        for bubble in self.bubbles[1:-1]:
            junctions = bubble.emit_junctions(self.gfaidx)
            for junction in junctions:
                links.extend(junction.get_chain_links())
        return links

    def get_parent_segment_links(self):
        links = self.bubbles[0].source.get_parent_segment_links(self.gfaidx)
        links.extend(self.bubbles[-1].sink.get_parent_segment_links(self.gfaidx))
        return links

    def get_internal_segment_ids(self, include_ends=True, as_set=False):
        seg_ids = []
        for i, bubble in enumerate(self.bubbles[:-1]):
            seg_ids.extend(bubble.sink_segments)
        
        if include_ends:
            seg_ids.extend(self.bubbles[0].source_segments)
            seg_ids.extend(self.bubbles[-1].sink_segments)

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
