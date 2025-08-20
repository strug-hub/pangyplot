from pangyplot.objects.BubbleJunction import BubbleJunction

class Bubble:
    def __init__(self):
        self.id = None

        self.subtype = "simple"
        self.parent = None
        self.children = []
        self.siblings = [None,None]

        self.chain = None
        self.chain_step = None

        self.source_segments = []
        self.sink_segments = []

        self.inside = set()
        self.range_exclusive = []
        self.range_inclusive = []

        self.length = 0
        self.gc_count = 0
        self.n_count = 0

        self.x1 = 0
        self.x2 = 0
        self.y1 = 0
        self.y2 = 0


        #todo: convert to dict, read/write from db
        self.chain_links = []
        self.deletion_link = None
        self.parent_links = []
        self.singleton_links = []

    def get_serialized_id(self):
        return f"b{self.id}"

    def serialize(self):
        return {
            "id": self.get_serialized_id(),
            "type": "bubble",
            "parent": self.parent,
            "chain": f"c{self.chain}",
            "chain_step": self.chain_step,
            "subtype": self.subtype,
            "size": len(self.inside),
            "length": self.length,
            "gc_count": self.gc_count,
            "n_count": self.n_count,
            "ranges": self.range_inclusive,
            "x1": self.x1,
            "x2": self.x2,
            "y1": self.y1,
            "y2": self.y2
        }

    def correct_source_sink(self, prevBubble=None, nextBubble=None):
        # if at chain end, check other side
        shouldFlipSource = prevBubble is None
        shouldFlipSink = nextBubble is None

        if prevBubble is not None and set(self.sink_segments).issubset(set(prevBubble.get_end_segments())):
            shouldFlipSource = True

        if nextBubble is not None and set(self.source_segments).issubset(set(nextBubble.get_end_segments())):
            shouldFlipSink = True      

        if shouldFlipSource and shouldFlipSink:
            self.siblings = [prevBubble.id if prevBubble else None, nextBubble.id if nextBubble else None]
            self.source_segments, self.sink_segments = self.sink_segments, self.source_segments

    def add_source_sibling(self, sibling):
        if sibling is None: return
        self.siblings[0] = sibling.id

    def add_sink_sibling(self, sibling):
        if sibling is None: return
        self.siblings[1] = sibling.id

    def add_chain_link(self, link_id, from_id, to_id):
        self.chain_links.append((link_id, from_id, to_id))

    def add_deletion_link(self, link_id):
        self.deletion_link = link_id

    def add_parent_link(self, link_id, from_id, to_id):
        self.parent_links.append((link_id, from_id, to_id))

    def add_singleton_link(self, link_id, from_id, to_id):
        self.singleton_links.append((link_id, from_id, to_id))

    def _clean_inside(self, inside_ids, bubble_dict):
        self.inside -= inside_ids
        if self.parent:
            parent_bubble = bubble_dict.get(self.parent)
            parent_bubble._clean_inside(inside_ids, bubble_dict)

    def add_child(self, child, bubble_dict):
        self.children.append(child.id)
        to_remove = set()
        for sid in child.get_end_segments():
            to_remove.add(sid)
        for sid in child.inside:
            to_remove.add(sid)
        self._clean_inside(to_remove, bubble_dict)

    def get_siblings(self):
        return self.siblings

    def get_next_sibling(self):
        return self.siblings[1]

    def get_previous_sibling(self):
        return self.siblings[0]

    def get_source_segments(self):
        return self.source_segments

    def get_sink_segments(self):
        return self.sink_segments

    def is_chain_end(self):
        return self.siblings[0] is None or self.siblings[1] is None
        
    def get_end_segments(self):
        return self.get_source_segments() + self.get_sink_segments()
    
    def emit_junctions(self, gfaidx, parent_hint=None):
        source = BubbleJunction(self, True, parent_hint, gfaidx)
        sink = BubbleJunction(self, False, parent_hint, gfaidx)
        return [source, sink]

    def has_range(self, exclusive=True):
        if exclusive:
            return len(self.range_exclusive) > 0
        return len(self.range_inclusive) > 0
    
    def get_ranges(self, exclusive=True):
        if exclusive:
            return self.range_exclusive
        return self.range_inclusive
    
    def is_contained(self, start_step, end_step, strict=False):
        strict_check = any(start >= start_step and end <= end_step for start, end in self.range_exclusive)
        if strict or strict_check:
            return strict_check
        return any(start >= start_step and end <= end_step for start, end in self.range_inclusive)

    def contains(self, id1, id2, exclusive=True):
        lower, upper = sorted((id1, id2))
        if exclusive:
            return any(lo <= lower and hi >= upper for lo, hi in self.range_exclusive)
        return any(lo <= lower and hi >= upper for lo, hi in self.range_inclusive)

    def is_ref(self):
        return len(self.range_inclusive) > 0

    def __str__(self):
        return f"Bubble(id={self.id}, chain={self.chain}:{self.chain_step}, parent={self.parent}, children={len(self.children)}, siblings={self.siblings}, source={self.source_segments}, inside={self.inside}, sink={self.sink_segments}, inclusive range={self.range_inclusive})"

    def __repr__(self):
        return f"Bubble({self.id}, inclusive range={self.range_inclusive})"
