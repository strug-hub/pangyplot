from pangyplot.objects.Link import Link
from statistics import mean

class BubbleJunction:
    def __init__(self, bubble, is_source, gfaidx=None):
        self.bubble_id = bubble.id
        self.other_bubble_id = bubble.get_previous_sibling() if is_source else bubble.get_next_sibling()

        chain_id = bubble.chain
        chain_step = bubble.chain_step
        self.id = f"{chain_id}:{chain_step-1 if is_source else chain_step}:{1 if is_source else 0}"

        self.is_source = is_source

        self.contained = set(bubble.source_segments if is_source else bubble.sink_segments)
        
        if gfaidx is not None:
            self.segments = [gfaidx[seg_id] for seg_id in self.contained]
            linkDict = {link.id: link for seg_id in self.contained for link in gfaidx.get_links(seg_id)}
            self.links = list(linkDict.values())
            
        self.length = sum(seg.length for seg in self.segments)

    def serialize(self):
        return {
            "id": f"c{self.id}",
            "type": "bubble:end",
            "subtype": "source" if self.is_source else "sink",
            "length": self.length,
            "size": len(self.contained),
            "gc_count": sum([seg.gc_count for seg in self.segments]),
            "n_count": sum([seg.n_count for seg in self.segments]),
            "ranges": [],
            "x1": mean([seg.x1 for seg in self.segments]),
            "y1": mean([seg.y1 for seg in self.segments]),
            "x2": mean([seg.x2 for seg in self.segments]),
            "y2": mean([seg.y2 for seg in self.segments])
        }

    def get_popped_chain_links(self):
        if self.other_bubble_id is None: return []
        link = Link()
        link.make_chain_link(list(self.contained), self.length)
        if self.is_source:
            link.from_id = self.id
            link.to_id = self.other_bubble_id
            link.from_type = "c"
        else:
            link.from_id = self.other_bubble_id
            link.to_id = self.id
            link.to_type = "c"

        #link.haplotype
        #link.reverse
        #link.frequency
        return [link]

    def get_chain_links(self):
        if self.other_bubble_id is None: return []
        link = Link()
        link.make_chain_link(list(self.contained), self.length)
        if self.is_source:
            link.from_id = self.bubble_id
            link.to_id = self.other_bubble_id
        else:
            link.from_id = self.other_bubble_id
            link.to_id = self.bubble_id

        #link.haplotype
        #link.reverse
        #link.frequency
        return [link]

    def get_segment_links(self):
        links = []
        for link in self.links:
            new_link = link.clone()

            if new_link.to_id in self.contained:
                new_link.to_id = self.id
                new_link.set_to_type("c")
            if new_link.from_id in self.contained:
                new_link.from_id = self.id
                new_link.set_from_type("c")

            links.append(new_link)

        return links

    def shared_links(self, other):
        is_deletion = self.bubble_id == other.bubble_id
        links = []

        def create_link(link, from_id, to_id):
            new_link = link.clone()
            if from_id is not None:
                new_link.from_id = from_id
                new_link.set_from_type("c")
            if to_id is not None:
                new_link.to_id = to_id
                new_link.set_to_type("c")
            if is_deletion:
                new_link.set_as_deletion(self.bubble_id)
            
            print(link.id(), "->", new_link.id())

            links.append(new_link)

        for link in self.links:
            if link.from_id in self.contained:
                if link.to_id in other.contained:
                    create_link(link, self.id, other.id)
                    create_link(link, self.id, None)
                    create_link(link, None, other.id)

            if link.to_id in self.contained:
                if link.from_id in other.contained:
                    create_link(link, other.id, self.id)
                    create_link(link, other.id, None)
                    create_link(link, None, self.id)

        return links

    def get_links(self):
        return self.get_chain_links() + self.get_popped_chain_links() + self.get_segment_links()

    def __str__(self):
        return f"BubbleJunction(bubble={self.bubble_id}, other_bubble={self.other_bubble_id}, contained={self.contained}, is_source={self.is_source})"
    def __repr__(self):
        return f"BubbleJunction({self.bubble_id}, {'source' if self.is_source else 'sink'})"