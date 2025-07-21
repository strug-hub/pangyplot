from pangyplot.objects.Link import Link

class Bubble:
    def __init__(self):
        self.id = None
        self.chain = None
        self.chain_step = None

        self.subtype = "simple"
        self.parent = None
        self.children = []
        self._siblings = []

        self._source = None
        self._compacted_source = []
        self._sink = None
        self._compacted_sink = []

        self.inside = set()
        self._range_exclusive = []
        self._range_inclusive = []

        self.length = 0
        self.gc_count = 0
        self.n_counts = 0

        self._height = None
        self._depth = None

        self.x1 = 0
        self.x2 = 0
        self.y1 = 0
        self.y2 = 0

    def serialize(self):
        return {
            "id": self.id,
            "nodeid": f"b{self.id}",
            "chain": self.chain,
            "type": "bubble",
            "subtype": self.subtype,
            "size": len(self.inside),
            "length": self.length,
            "gc_count": self.gc_count,
            "n_counts": self.n_counts,
            "range_exclusive": self._range_exclusive,
            "range_inclusive": self._range_inclusive,
            "x1": self.x1,
            "x2": self.x2,
            "y1": self.y1,
            "y2": self.y2
        }
    
    def add_sibling(self, sibling_id, seg_ids):
        self._siblings.append((sibling_id, seg_ids))

    def _clean_inside(self, inside_ids, bubble_dict):
        self.inside -= inside_ids
        if self.parent:
            parent_bubble = bubble_dict.get(self.parent)
            parent_bubble._clean_inside(inside_ids, bubble_dict)

    def add_child(self, child, bubble_dict):
        self.children.append(child.id)
        self._clean_inside(child.inside, bubble_dict)

    def get_siblings(self):
        return list({sib_id for sib_id, _ in self._siblings})
    def get_sibling_segments(self, get_compacted_nodes=True):
        return self.get_source(get_compacted_nodes) + self.get_sink(get_compacted_nodes)

    def next_sibling_link(self, sib_filter=None):
        for sib_id, seg_ids in self._siblings:
            if sib_filter and sib_id not in sib_filter:
                continue
            if self._sink and self._sink in seg_ids:
                    link = Link()
                    link.from_id = self.id
                    link.to_id = sib_id
                    link.from_strand = "+"
                    link.to_strand = "+"
                    link.make_chain_link(seg_ids)
                    #todo: 
                    #link.haplotype
                    #link.reverse
                    #link.frequency
                    return link
        return None

    def get_source(self, get_compacted_nodes=True):
        if not get_compacted_nodes:
            return [self._source]

        return [self._source] + self._compacted_source
    
    def get_sink(self, get_compacted_nodes=True):
        if not get_compacted_nodes:
            return [self._sink]
        
        return [self._sink] + self._compacted_sink

    def ends(self, get_compacted=True, as_list=False):
        sources = [self._source]
        sinks = [self._sink]

        if get_compacted:
            sources += self._compacted_source
            sinks += self._compacted_sink        
        if as_list:
            return sources + sinks
        return (sources, sinks)
    
    def has_range(self, exclusive=True):
        if exclusive:
            return len(self._range_exclusive) > 0
        return len(self._range_inclusive) > 0
    
    def get_ranges(self, exclusive=True):
        if exclusive:
            return self._range_exclusive
        return self._range_inclusive
    
    def is_contained(self, start_step, end_step, strict=False):
        strict_check = any(start >= start_step and end <= end_step for start, end in self._range_exclusive)
        if strict or strict_check:
            return strict_check
        return any(start >= start_step and end <= end_step for start, end in self._range_inclusive)

    def contains(self, id1, id2, exclusive=True):
        lower, upper = sorted((id1, id2))
        if exclusive:
            return any(lo <= lower and hi >= upper for lo, hi in self._range_exclusive)
        return any(lo <= lower and hi >= upper for lo, hi in self._range_inclusive)

    def is_ref(self):
        return len(self._range_inclusive) > 0
    
    def get_height(self):
        if self._height is not None:
            return self._height
        
        if not self.children:
            self._height = 1
        else:
            self._height = 1 + max(child.get_height() for child in self.children)
        
        return self._height
    
    def get_depth(self):
        if self._depth is not None:
            return self._depth
        
        if not self.parent:
            self._depth = 0
        else:
            self._depth = 1 + self.parent.get_depth()
        
        return self._depth

    def __str__(self):
        return f"Bubble(id={self.id}, parent={self.parent}, children={len(self.children)}, siblings={self.get_siblings()}, inside={self.inside}, inclusive range={self._range_inclusive})"

    def __repr__(self):
        return f"Bubble({self.id}, inclusive range={self._range_inclusive})"
