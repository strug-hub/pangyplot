from pangyplot.objects.BubbleJunction import BubbleJunction

class Chain:
    def __init__(self, chain_id, bubbles=None, parent_bubble=None, gfaidx=None):
        self.id = chain_id
        self.gfaidx = gfaidx

        self.parent_bubble = parent_bubble # object not id
        self.bubbles = bubbles if bubbles is not None else []

        self._sort_bubbles()
        self._assign_siblings()

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

    def update_bubble_ends(self, bubbleidx):
        if self.gfaidx is None or self.parent_bubble is None:
            return

        result = bubbleidx.get_chain_ends(self.id)
        if result is None:
            return

        start_id, start_step = result[0]
        end_id, end_step = result[1]

        #for bubble in (self.bubbles[0], self.bubbles[-1]):
        #    if bubble.id == start_id:
        #        bubble.source.update_with_parent(self.parent_bubble, gfaidx)
        #    if bubble.id == end_id:
        #        bubble.sink.update_with_parent(self.parent_bubble, gfaidx)

    def get_chain_links(self):
        if self.gfaidx is None:
            return None
        links = []

        for i, bubble in enumerate(self.bubbles[1:-1]):
            junctions = bubble.emit_chain_junctions(self.gfaidx)
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
            seg_ids.extend(bubble.sink.get_contained())
        
        if include_ends:
            seg_ids.extend(self.bubbles[0].source.get_contained())
            seg_ids.extend(self.bubbles[-1].sink.get_contained())

        return set(seg_ids) if as_set else seg_ids

    def add_bubbles(self, bubbles):
        self.bubbles.extend(bubbles)
        self._sort_bubbles()

    def _sort_bubbles(self):
        if len(self.bubbles) < 2:
            return

        self.bubbles.sort(key=lambda bubble: bubble.chain_step)
        chain_order = [None, *self.bubbles, None]

        for i, bubble in enumerate(chain_order):
            if bubble is None: continue
            prevId = chain_order[i - 1].id if chain_order[i - 1] is not None else None
            nextId = chain_order[i + 1].id if chain_order[i + 1] is not None else None
            bubble.correct_source_sink(prevId, nextId)

    def _assign_siblings(self):
        chain_order = [None, *self.bubbles, None]
        for i, bubble in enumerate(chain_order):
            if bubble is None: continue
            bubble.add_source_sibling(chain_order[i - 1])
            bubble.add_sink_sibling(chain_order[i + 1])

    def __len__(self):
        return len(self.bubbles)

    def __str__(self):
        return f"Chain(id={self.id}, n_bubbles={len(self.bubbles)})"

    def __repr__(self):
        return f"Chain({self.id}, n_bubbles={len(self.bubbles)})"
