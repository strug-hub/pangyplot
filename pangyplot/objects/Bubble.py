from pangyplot.objects.Link import Link
from pangyplot.objects.Junction import Junction

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

        self.source = Junction(self, is_source=True)
        self.sink = Junction(self, is_source=False)

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
        
    def get_serialized_id(self):
        return f"b{self.id}"

    def serialize(self):
        return {
            "id": self.get_serialized_id(),
            "type": "bubble",
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

    def add_source(self, seg_ids):
        self.source_segments = seg_ids
        self.source = Junction(self, seg_ids=seg_ids, is_source=True)

    def add_sink(self, seg_ids):
        self.sink_segments = seg_ids
        self.sink = Junction(self, seg_ids=seg_ids, is_source=False)

    def correct_source_sink(self, prevId=None, nextId=None):
        def check_same(id1, id2):
            if id1 is None and id2 is None:
                return True
            if id1 is None or id2 is None:
                return False
            return id1 == id2

        flipSource = check_same(nextId, self.source.other_bubble_id)
        flipSink = check_same(prevId, self.sink.other_bubble_id)

        if flipSource and flipSink:
            self.source.flip_source_sink()
            self.sink.flip_source_sink()
            temp = self.source
            self.source = self.sink
            self.sink = temp

    def add_source_sibling(self, sibling):
        if sibling is None: return
        self.siblings[0] = sibling.id
        self.source.update_other_bubble(sibling.id)

    def add_sink_sibling(self, sibling):
        if sibling is None: return
        self.siblings[1] = sibling.id
        self.sink.update_other_bubble(sibling.id)

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
        return len(self._range_inclusive) > 0
        
    def get_deletion_links(self, gfaidx):
        deletion_links = [] 

        for seg_id in self.source.contained:
            for link in gfaidx.get_links(seg_id):
                if link.other_id(seg_id) in self.sink.contained:
                    del_link = link.clone()
                    del_link.set_as_deletion(self.id)
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


    def summarize_source_segments(self):
        return self.source.get_contained(split_compacted=True)
    def summarize_sink_segments(self):
        return self.sink.get_contained(split_compacted=True)

    def __str__(self):
        return f"Bubble(id={self.id}, parent={self.parent}, children={len(self.children)}, siblings={self.siblings}, inside={self.inside}, inclusive range={self._range_inclusive})"

    def __repr__(self):
        return f"Bubble({self.id}, inclusive range={self._range_inclusive})"
