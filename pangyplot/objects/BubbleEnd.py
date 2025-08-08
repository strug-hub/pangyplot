from pangyplot.objects.Link import Link

class BubbleEnd:
    def __init__(self, bubble, seg_ids=[], is_source=True):
        self.id = bubble.id

        self.bubble = bubble
        self.other_bubble_id = None
        
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

    def update_other_bubble(self, other_bubble_id):
        self.other_bubble_id = other_bubble_id

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

    def contains_any(self, seg_ids):
        for seg_id in seg_ids:
            if seg_id in self.contained:
                return True
        return False

    def get_chain_link(self):
        if self.other_bubble_id is None:
            return None
        link = Link()
        link.from_id = self.id if self.is_sink else self.other_bubble_id
        link.to_id = self.other_bubble_id if self.is_sink else self.id
        link.from_strand = "+"
        link.to_strand = "+"

        link.make_chain_link(self.contained, self.length)

        #link.haplotype
        #link.reverse
        #link.frequency

        return link

    def get_popped_links(self, gfaidx):
        links = []
        chainlink = self.get_chain_link()
        if chainlink and self.is_source:
            chainlink.set_to_type("b<")
        elif chainlink and self.is_sink:
            chainlink.set_from_type("b>")
        links.append(chainlink)

        links.extend(self.get_inside_bubble_links(gfaidx))

        return links

    def get_inside_bubble_links(self, gfaidx, target_bubble=None):
        if target_bubble is None:
            target_bubble = self.bubble
        links = []
        link_type = "b<" if self.is_source else "b>"
        for seg_id in self.contained:
            for link in gfaidx.get_links(seg_id):
                if link.other_id(seg_id) in target_bubble.inside:
                    new_link = Link()
                    new_link.from_id = link.from_id
                    new_link.to_id = link.to_id
                    new_link.from_strand = link.from_strand
                    new_link.to_strand = link.to_strand

                    if new_link.to_id == seg_id:
                        new_link.to_id = target_bubble.id
                        new_link.set_to_type(link_type)
                    else:
                        new_link.from_id = target_bubble.id
                        new_link.set_from_type(link_type)

                    links.append(new_link)

        return links

    def get_segment_links(self, gfaidx, target_bubble=None):
        if target_bubble is None:
            target_bubble = self.bubble
        links = []

        for seg_id in self.contained:
            for link in gfaidx.get_links(seg_id):
                if link.other_id(seg_id) in target_bubble.inside:
                    new_link = Link()
                    new_link.from_id = link.from_id
                    new_link.to_id = link.to_id
                    new_link.from_strand = link.from_strand
                    new_link.to_strand = link.to_strand

                    if new_link.from_id == seg_id:
                        new_link.to_id = target_bubble.id
                        new_link.make_segment_to_bubble()
                    else:
                        new_link.from_id = target_bubble.id
                        new_link.make_bubble_to_segment()

                    links.append(new_link)

        return links

    def get_other_segment_links(self, gfaidx, bubbleidx):
        target_bubble = bubbleidx[self.other_bubble_id]
        return self.get_segment_links(gfaidx, target_bubble)

    def summarize(self):
        return [self.other_bubble_id, self.contained]

    def __str__(self):
        return f"BubbleEnd(bubble={self.id}, other_bubble={self.other_bubble_id}, contained={self.contained}, is_source={self.is_source}, is_sink={self.is_sink})"
    def __repr__(self):
        return f"BubbleEnd({self.id}, other_bubble={self.other_bubble_id}, contained={self.contained}, is_source={self.is_source}, is_sink={self.is_sink})"