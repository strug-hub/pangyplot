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

        # flowing from the bubble source to the sink
        self.deletion_link = None
        
        # flowing from inside the bubble to the sorce or sink
        # could be from internal segment or from child bubble
        self.end_links = []

        # flowing from the bubble end to the end of a child bubble
        self.child_links = []

        # flowing from one chain end to another separate chain 
        self.cross_links = []

        # flowing from a segment that isn't captured a bubble
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

    def add_end_link(self, link_id, from_id, to_id):
        self.end_links.append((link_id, from_id, to_id))

    def add_deletion_link(self, link_id):
        self.deletion_link = link_id

    def add_child_link(self, link_id, from_id, to_id):
        self.child_links.append((link_id, from_id, to_id))

    def add_singleton_link(self, link_id, from_id, to_id):
        self.singleton_links.append((link_id, from_id, to_id))
    
    def add_cross_link(self, link_id, from_id, to_id):
        self.cross_links.append((link_id, from_id, to_id))

    def get_chain_link(self, gfaidx, source=False):
        end_id = f"{self.id}:0" if source else f"{self.id}:1"
        link_data = [link for link in self.end_links + self.child_links if end_id in link]
        link_ids = [link[0] for link in link_data]
        links = gfaidx.get_links_by_id(link_ids)
        
        if len(links) < 1: return None
        chain_link = links[0].clone()
        
        for link in links[1:]:
            chain_link.combine_links(link)

        length = sum([gfaidx.segment_length(sid) for sid in self.sink_segments])
        new_ids = (self.siblings[0], self.id) if source else (self.id, self.siblings[1])
        chain_link.update_to_chain_link(new_ids, self.sink_segments, length)
        chain_link.make_bubble_to_bubble()
        return chain_link
    
    def get_sink_chain_link(self, gfaidx):
        return self.get_chain_link(gfaidx, source=False)
    def get_source_chain_link(self, gfaidx):
        return self.get_chain_link(gfaidx, source=True)
    
    def summarize_link_data(self):
        link_data = dict()
        if len(self.end_links) > 0:
            link_data["end"] = self.end_links
        if self.deletion_link is not None:
            link_data["deletion"] = self.deletion_link
        if len(self.child_links) > 0:
            link_data["child"] = self.child_links
        if len(self.singleton_links) > 0:
            link_data["singleton"] = self.singleton_links
        if len(self.cross_links) > 0:
            link_data["cross"] = self.cross_links
        return link_data
    
    def set_link_data(self, link_data):
        if "end" in link_data:
            self.end_links = link_data["end"]
        if "deletion" in link_data:
            self.deletion_link = link_data["deletion"]
        if "child" in link_data:
            self.child_links = link_data["child"]
        if "singleton" in link_data:
            self.singleton_links = link_data["singleton"]
        if "cross" in link_data:
            self.cross_links = link_data["cross"]
            
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
    
    def emit_junctions(self, gfaidx):
        source = BubbleJunction(self, True, gfaidx)
        sink = BubbleJunction(self, False, gfaidx)
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
