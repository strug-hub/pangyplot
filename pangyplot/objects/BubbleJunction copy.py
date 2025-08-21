from pangyplot.objects.Link import Link
from statistics import mean

class BubbleJunction:
    def __init__(self, bubble, is_source, parent_bubble=None, gfaidx=None):
        self.is_source = is_source

        self.bubble_id = bubble.id
        self.id = ":".join([str(bubble.chain),
                            str(bubble.chain_step - 1 if is_source else bubble.chain_step),
                            str(1 if is_source else 0)]) 

        self.other_bubble_id = bubble.get_previous_sibling() if is_source else bubble.get_next_sibling()
        self.is_chain_end = self.other_bubble_id is None

        if not self.is_chain_end:
            self.other_id = ":".join([str(bubble.chain),
                                str(bubble.chain_step - 1 if is_source else bubble.chain_step),
                                str(0 if is_source else 1)]) 
        else:
            self.other_id = None

        self.contained = set(bubble.source_segments if is_source else bubble.sink_segments)
        
        if gfaidx is not None:
            self.segments = [gfaidx[seg_id] for seg_id in self.contained]
            linkDict = {link.id: link for seg_id in self.contained for link in gfaidx.get_links(seg_id)}
            self.links = list(linkDict.values())
            
            self.length = sum(seg.length for seg in self.segments)

        if self.is_chain_end and parent_bubble is not None:
            self.other_bubble_id = parent_bubble.id
            self.other_id = self.match_junction(parent_bubble, gfaidx)
            
    def match_junction(self, bubble, gfaidx):
        if gfaidx is None: return None
        junctions = bubble.emit_junctions(gfaidx, parent_hint=None)
        for junction in junctions:
            seg_ids = set(junction.contained)
            for link in self.links:
                if link.to_id in seg_ids or link.from_id in seg_ids:
                    return junction.id
        return None
    
    def serialize(self):
        return {
            "id": f"c{self.id}",
            "type": "bubble:end",
            "chain_end": self.is_chain_end,
            "bubble_id": self.bubble_id,
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

    def create_link(self, from_type, from_id, to_type, to_id, should_flip=False,
                    copy_link=None, chain_link=False, pop_link=False, deletion_link=False):
        if copy_link is None:
            link = Link()
        else:
            link = copy_link.clone()
        if from_id is not None:
            link.from_id = from_id if not should_flip else to_id
        if to_id is not None:
            link.to_id = to_id if not should_flip else from_id
        if chain_link:
            link.make_chain_link(list(self.contained), self.length)
        if pop_link:
            link.make_pop_link()
        if deletion_link:
            link.update_to_deletion_link(self.bubble_id)
        if from_type is not None:
            link.set_from_type(from_type if not should_flip else to_type)
        if to_type is not None:
            link.set_to_type(to_type if not should_flip else from_type)

        #link.haplotype
        #link.reverse
        #link.frequency
    
        return link

    #[bubble]-[bubble]
    def get_chain_links(self):
        if self.other_bubble_id is None: return []

        if not self.is_chain_end:
            link = self.create_link("b", self.bubble_id,
                                    "b", self.other_bubble_id, 
                                    chain_link=True,
                                    should_flip=not self.is_source)
        else:
            link = self.create_link("b", self.bubble_id, 
                                    "c", self.other_id, 
                                    chain_link=True,
                                    should_flip=not self.is_source)
        return [link]
    
    #[bubble:end]-[bubble]
    def get_popped_chain_links(self):
        if self.other_bubble_id is None: return []
        link = self.create_link("c", self.id, 
                                "b", self.other_bubble_id, 
                                chain_link=True,
                                should_flip=not self.is_source)
        return [link]

    #[bubble:end]-[bubble:end]
    def get_popped_indicator_links(self):
        if self.is_chain_end or self.other_id is None: return []
        link = self.create_link("c", self.id, 
                                "c", self.other_id, 
                                pop_link=True,
                                should_flip=not self.is_source)
        return [link]    

    #[bubble:end]-[segment]
    def get_segment_links(self):
        links = []
        for link in self.links:
            from_contained = link.from_id in self.contained
            to_contained = link.to_id in self.contained
            if from_contained or to_contained:
                seg_id = link.from_id if to_contained else link.to_id
                new_link = self.create_link("c", self.id,
                                            "s", seg_id,  
                                            copy_link=link,
                                            should_flip=to_contained)
            links.append(new_link)
        return links


    #[bubble]-[segment]
    def get_parent_popped_links(self):
        links = []
        if not self.is_chain_end: return []
        
        for link in self.links:
            from_contained = link.from_id in self.contained
            to_contained = link.to_id in self.contained
            if from_contained or to_contained:
                seg_id = link.from_id if to_contained else link.to_id
                new_link = self.create_link("b", self.bubble_id,
                                            "s", seg_id,  
                                            copy_link=link,
                                            chain_link=True,
                                            should_flip=to_contained)
            links.append(new_link)
        return links

    def get_links(self):
        return self.get_chain_links() + \
                self.get_popped_indicator_links() + \
                self.get_popped_chain_links() + \
                self.get_segment_links()
    
    def get_deletion_links(self, other_junction):
        if not self.bubble_id == other_junction.bubble_id: return []
        links = []
        for link in self.links:
            from_contained = link.from_id in other_junction.contained
            to_contained = link.to_id in other_junction.contained
            if to_contained or from_contained:
                new_link = self.create_link("c", self.id, 
                                            "c", other_junction.id, 
                                            deletion_link=True,
                                            copy_link=link,
                                            should_flip=from_contained)
                links.append(new_link)

        return links


    def __str__(self):
        return f"BubbleJunction(bubble={self.bubble_id}, other_id={self.other_bubble_id}, contained={self.contained}, is_source={self.is_source})"
    def __repr__(self):
        return f"BubbleJunction({self.bubble_id}, {'source' if self.is_source else 'sink'})"