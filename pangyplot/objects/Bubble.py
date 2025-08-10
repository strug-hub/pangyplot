from pangyplot.objects.Link import Link
from pangyplot.objects.BubbleEnd import BubbleEnd

class Bubble:
    def __init__(self):
        self.id = None

        self.subtype = "simple"
        self.parent = None
        self.children = []
        self.siblings = []

        self.chain = None
        self.chain_step = None

        self.source = BubbleEnd(self, is_source=True)
        self.sink = BubbleEnd(self, is_source=False)

        self.inside = set()
        self._range_exclusive = []
        self._range_inclusive = []

        self.length = 0
        self.gc_count = 0
        self.n_count = 0

        self._height = None
        self._depth = None

        self.x1 = 0
        self.x2 = 0
        self.y1 = 0
        self.y2 = 0
        
    def get_serialized_id(self):
        return f"b{self.id}"

    def serialize(self):
        return {
            "id": self.get_serialized_id(),
            "type": "bubble",
            "chain": self.chain,
            "chain_step": self.chain_step,
            "subtype": self.subtype,
            "size": len(self.inside),
            "length": self.length,
            "gc_count": self.gc_count,
            "n_count": self.n_count,
            "ranges": self._range_inclusive,
            "x1": self.x1,
            "x2": self.x2,
            "y1": self.y1,
            "y2": self.y2
        }

    def add_source(self, source_id, compacted_nodes=[]):
        seg_ids = [source_id]
        seg_ids.extend(list(compacted_nodes))
        self.source = BubbleEnd(self, seg_ids=seg_ids, is_source=True)

    def add_sink(self, sink_id, compacted_nodes=[]):
        seg_ids = [sink_id]
        seg_ids.extend(list(compacted_nodes))
        self.sink = BubbleEnd(self, seg_ids=seg_ids, is_source=False)

    def add_sibling(self, sibling_id, seg_ids):
        self.siblings.append(sibling_id)
        if self.source.contains_any(seg_ids):
            self.source.update_other_bubble(sibling_id)
        elif self.sink.contains_any(seg_ids):
            self.sink.update_other_bubble(sibling_id)

    def _clean_inside(self, inside_ids, bubble_dict):
        self.inside -= inside_ids
        if self.parent:
            parent_bubble = bubble_dict.get(self.parent)
            parent_bubble._clean_inside(inside_ids, bubble_dict)

    def add_child(self, child, bubble_dict):
        self.children.append(child.id)
        self._clean_inside(child.inside, bubble_dict)

    def calculate_properties(self, gfaidx):
        self.source.calculate_properties(gfaidx)
        self.sink.calculate_properties(gfaidx)

    def get_siblings(self):
        return self.siblings

    def get_next_sibling(self):
        return self.sink.get_next_bubble()

    def get_previous_sibling(self):
        return self.source.get_previous_bubble()

    def get_source_segments(self):
        return self.source.get_contained()

    def get_sink_segments(self):
        return self.sink.get_contained()

    def get_end_segments(self):
        return self.get_source_segments() + self.get_sink_segments()

    def get_source_links(self, gfa_index):
        links = []
        source_ids = self.get_source_segments()
        for source_id in source_ids:
            for link in gfa_index.get_links(source_id):
                if link.other_id(source_id) in source_ids:
                    continue
                link.update_to_bubble(source_id, self.id)
                links.append(link)
        return links

    def get_sink_links(self, gfa_index):
        links = []
        sink_ids = self.get_sink_segments()
        for sink_id in sink_ids:
            for link in gfa_index.get_links(sink_id):
                if link.other_id(sink_id) in sink_ids:
                    continue
                link.update_to_bubble(sink_id, self.id)
                links.append(link)
        return links

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
    
    def is_indel(self):
        return self.subtype == "insertion"
    
    def get_deletion_links(self, gfaidx):
        deletion_links = [] 
        if not self.is_indel():
            return deletion_links

        for seg_id in self.source.contained:
            for link in gfaidx.get_links(seg_id):
                if link.other_id(seg_id) in self.sink.contained:
                    del_link = link.clone()
                    del_link.set_as_deletion()
                    deletion_links.append(del_link)
                    
                    del_link2 = del_link.clone()
                    if del_link2.to_id == seg_id:
                        del_link2.set_to_type("b<")
                        del_link2.to_id = self.id
                    else:
                        del_link2.set_from_type("b<")
                        del_link2.from_id = self.id
                    deletion_links.append(del_link2)

                    del_link3 = del_link.clone()
                    if del_link3.to_id == seg_id:
                        del_link3.set_from_type("b>")
                        del_link3.from_id = self.id
                    else:
                        del_link3.set_to_type("b>")
                        del_link3.to_id = self.id
                    deletion_links.append(del_link3)

                    del_link4 = del_link.clone()
                    del_link4.to_id = self.id
                    del_link4.from_id = self.id
                    if del_link4.to_id == seg_id:
                        del_link4.set_to_type("b<")
                        del_link4.set_from_type("b>")
                    else:
                        del_link4.set_to_type("b>")
                        del_link4.set_from_type("b<")
                    deletion_links.append(del_link4)
        
        return deletion_links

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

    def summarize_ends(self):
        result = []
        if not self.source.is_chain_end():
            result.append(self.source.summarize())
        if not self.sink.is_chain_end():
            result.append(self.sink.summarize())
        return result

    def summarize_source_segments(self):
        return self.source.get_contained(split_compacted=True)
    def summarize_sink_segments(self):
        return self.sink.get_contained(split_compacted=True)

    def __str__(self):
        return f"Bubble(id={self.id}, parent={self.parent}, children={len(self.children)}, siblings={self.siblings}, inside={self.inside}, inclusive range={self._range_inclusive})"

    def __repr__(self):
        return f"Bubble({self.id}, inclusive range={self._range_inclusive})"
