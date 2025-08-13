from pangyplot.objects.Link import Link

class Junction:
    def __init__(self, bubble, seg_ids=[], is_source=True):
        self.id = bubble.id

        self.bubble = bubble
        self.other_bubble_id = None
        
        self.connected_to_parent = False
        self.parent_is_source = None
        self.parent_contained = []


        self.contained = seg_ids
        self.is_source = is_source
        self.is_sink = not is_source
        
        self.length = 0
        self.gc_count = 0
        self.n_count = 0

    def serialize(self):
        return {
            "id": f"b<{self.id}" if self.is_source else f"b>{self.id}",
            "type": "bubble:end",
            "subtype": "sink" if self.is_sink else "source",
            "contained": self.contained,
            "length": self.length,
            "size": len(self.contained),
            "gc_count": self.gc_count,
            "n_count": self.n_count,
            "ranges": [],
            "x1": self.bubble.x1,
            "y1": self.bubble.y1,
            "x2": self.bubble.x2,
            "y2": self.bubble.y2
        }    

    def flip_source_sink(self):
        self.is_source = not self.is_source
        self.is_sink = not self.is_sink

    def update_other_bubble(self, other_bubble_id):
        self.other_bubble_id = other_bubble_id

    def update_with_parent(self, parent_bubble, gfaidx):
        if parent_bubble is None or self.other_bubble_id is not None:
            return
        
        if self.are_linked(parent_bubble.source, gfaidx):
            self.parent_is_source = True
            self.parent_contained = parent_bubble.source.contained
        elif self.are_linked(parent_bubble.sink, gfaidx):
            self.parent_is_source = False
            self.parent_contained = parent_bubble.sink.contained
        else:
            return
        self.connected_to_parent = True
        self.other_bubble_id = parent_bubble.id

    def are_linked(self, other_bubble_end, gfaidx):
        for seg_id in self.contained:
            for link in gfaidx.get_links(seg_id):
                if link.other_id(seg_id) in other_bubble_end.contained:
                    print(f"Linked bubble {self.bubble.id} to parent bubble {other_bubble_end.bubble.id} via segments {seg_id}, {link.other_id(seg_id)}")
                    return True

        return False

    def calculate_properties(self, gfaidx):
        self.length = sum([gfaidx.segment_length(sid) for sid in self.contained])
        #self.gc_count = ... TODO
        #self.n_count = ... TODO

    def is_chain_end(self):
        return self.other_bubble_id is None

    def get_next_bubble(self):
        if self.is_source:
            return self.id
        return self.other_bubble_id

    def get_previous_bubble(self):
        if self.is_sink:
            return self.id
        return self.other_bubble_id

    def get_contained(self, split_compacted=False):
        if split_compacted:
            if len(self.contained) == 0:
                return [None, []]
            return [self.contained[0], self.contained[1:]]
        return self.contained

    def get_contained_segments(self, gfaidx):
        return [gfaidx[seg_id] for seg_id in self.contained]

    def contains_any(self, seg_ids):
        for seg_id in seg_ids:
            if seg_id in self.contained:
                return True
        return False


    def get_parent_chain_link(self):
        if self.other_bubble_id is None or not self.connected_to_parent:
            return None
        link = Link()
        link.from_id = self.id if self.is_sink else self.other_bubble_id
        link.to_id = self.other_bubble_id if self.is_sink else self.id
        link.from_strand = "+"
        link.to_strand = "+"

        link.make_chain_link(self.contained, self.length)

        if self.is_sink and self.parent_is_source:
            link.set_to_type("b<")
        elif self.is_sink and not self.parent_is_source:
            link.set_to_type("b>")
        elif self.is_source and self.parent_is_source:
            link.set_from_type("b<")
        elif self.is_source and not self.parent_is_source:
            link.set_from_type("b>")

        #link.haplotype
        #link.reverse
        #link.frequency

        return link

    def get_popped_links(self, gfaidx):

        links = []
        if self.connected_to_parent:
            chainlink = self.get_parent_chain_link()
            
            if chainlink and self.is_source:
                chainlink.set_to_type("b<")
            elif chainlink and self.is_sink:
                chainlink.set_from_type("b>")
            links.append(chainlink)

        links.extend(self.get_inside_bubble_links(gfaidx))

        return links

    def get_parent_segment_links(self, gfaidx):
        links = []
        if self.connected_to_parent:
            print(self.parent_contained)
            for seg_id in self.parent_contained:
                for link in gfaidx.get_links(seg_id):
                    print(f"Checking link {link} for bubble end {self.id}")
                    if link.other_id(seg_id) in self.contained:
                        new_link = link.clone()

                        if new_link.to_id == seg_id:
                            new_link.from_id = self.id
                            new_link.set_from_type("b")
                        else:
                            new_link.to_id = self.id
                            new_link.set_to_type("b")
                        links.append(new_link)
                        print(f"Added link {new_link} for bubble end {self.id}")
        return links


    def get_inside_bubble_links(self, gfaidx):
        links = []
        if not self.connected_to_parent:
            link_type = "b<" if self.is_source else "b>"
            for seg_id in self.contained:
                for link in gfaidx.get_links(seg_id):
                    if link.other_id(seg_id) in self.bubble.inside:
                        new_link = link.clone()

                        if new_link.to_id == seg_id:
                            new_link.to_id = self.bubble.id
                            new_link.set_to_type(link_type)
                        else:
                            new_link.from_id = self.bubble.id
                            new_link.set_from_type(link_type)

                        links.append(new_link)
        else:
            for seg_id in self.contained:
                for link in gfaidx.get_links(seg_id):
                    print(f"Checking link {link} for bubble end {self.id}")
                    if link.other_id(seg_id) in self.parent_contained:
                        new_link = link.clone()

                        if new_link.to_id == seg_id:
                            new_link.from_id = self.other_bubble_id
                            new_link.set_from_type("b<" if self.parent_is_source else "b>")
                        else:
                            new_link.to_id = self.other_bubble_id
                            new_link.set_to_type("b<" if self.parent_is_source else "b>")
                        links.append(new_link)

        return links

    def get_contained_links(self, gfaidx):
        links = []
        for seg_id in self.contained:
            links.extend(gfaidx.get_links(seg_id))
        return links

    def node_id(self):
        return f"b<{self.id}" if self.is_source else f"b>{self.id}"

    def other_node_id(self):
        if self.other_bubble_id is None:
            return None

        if self.connected_to_parent:
            return f"b<{self.other_bubble_id}" if self.parent_is_source else f"b>{self.other_bubble_id}"

        return f"b>{self.other_bubble_id}" if self.is_source else f"b<{self.other_bubble_id}"

    def summarize(self):
        return [self.other_bubble_id, self.contained]

    def __str__(self):
        return f"Junction(bubble={self.id}, other_bubble={self.other_bubble_id}, contained={self.contained}, is_source={self.is_source}, is_sink={self.is_sink})"
    def __repr__(self):
        return f"Junction({self.id}, {'source' if self.is_source else 'sink'})"