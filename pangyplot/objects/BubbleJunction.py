from pangyplot.objects.Link import Link
from statistics import mean

class BubbleJunction:
    def __init__(self, bubble, is_source, gfaidx):
        self.is_source = is_source

        self.gfaidx = gfaidx
        self.bubble = bubble

        self.id = f"{bubble.id}:{0 if is_source else 1}"
        self.other_id = f"{bubble.id}:{1 if is_source else 0}"

        self.contained = set(bubble.source_segments if is_source else bubble.sink_segments)
        self.length = sum([gfaidx.segment_length(sid) for sid in self.contained])
        self.segments = [gfaidx[sid] for sid in self.contained]

        self.is_chain_end = bubble.siblings[0] is None if is_source else bubble.siblings[1] is None

    def serialize(self):
        return {
            "id": f"b{self.id}",
            "type": "bubble:end",
            "chain_end": self.is_chain_end,
            "bubble_id": self.bubble.id,
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
    
    def fetch_links(self, link_ids):
        links = self.gfaidx.get_links_by_id(link_ids)
        link_dict = {link.id(): link for link in links}
        return link_dict

    def get_chain_links(self):
        chain_link = self.bubble.get_chain_link(self.gfaidx, self.is_source)
        chain_link.add_to_suffix("0") if self.is_source else \
            chain_link.add_from_suffix("1")

        destroy_indicator = chain_link.clone()
        destroy_indicator.add_from_suffix("1") if self.is_source else \
            destroy_indicator.add_to_suffix("0")
        destroy_indicator.make_pop_link()

        return [chain_link, destroy_indicator]
    
    def get_deletion_links(self):
        del_id = self.bubble.deletion_link
        if del_id is None:
            return []
        links = self.gfaidx.get_links_by_id([del_id])
        if len(links) < 1: return []
        link = links[0]
        
        #only one side needs to construct the deletion links
        if link.from_id not in self.contained:
            return []
        
        def new_del_link(from_id=link.from_id, from_type="s",
                         to_id=link.to_id, to_type="s",):
            new_link = link.clone()
            new_link.update_to_deletion_link((from_id, to_id), self.bubble.id)
            new_link.set_from_type(from_type)
            new_link.set_to_type(to_type)
            return new_link
        
        deletion_links = [
            new_del_link(from_id=self.id, from_type="b"),
            new_del_link(to_id=self.other_id, to_type="b"),
            new_del_link(from_id=self.id, to_id=self.other_id,
                         from_type="b", to_type="b")
        ]

        return deletion_links

    def get_end_links(self):
        end_links = []
        link_data = [link for link in self.bubble.end_links if self.id in link]

        if len(link_data) < 1: return end_links
        
        link_dict = self.fetch_links([x[0] for x in link_data])

        for link_id, from_id, to_id in link_data:
            if link_id not in link_dict: continue
            end_link = link_dict.get(link_id).clone()
            end_link.from_id = from_id
            if from_id == self.id:
                end_link.from_type = "b"
            end_link.to_id = to_id
            if to_id == self.id:
                end_link.to_type = "b"
        
            end_links.append(end_link)

        return end_links

    def get_child_links(self):
        child_links = []
        link_data = [link for link in self.bubble.child_links if self.id in link]
        if len(link_data) < 1:
            return child_links

        link_dict = self.fetch_links([x[0] for x in link_data])

        for link_id, from_id, to_id in link_data:
            if link_id not in link_dict:
                continue

            # child is unpopped
            if from_id == self.id:
                child_link1 = link_dict.get(link_id).clone()
                child_link1.to_id = to_id.split(":")[0]
                child_link1.to_type = "b"
                child_links.append(child_link1)
                
                child_link2 = child_link1.clone()
                child_link2.from_id = from_id
                child_link2.make_bubble_to_bubble()
                child_links.append(child_link2)

            else:
                child_link1 = link_dict.get(link_id).clone()
                child_link1.from_id = from_id.split(":")[0]
                child_link1.from_type = "b"
                child_links.append(child_link1)
                
                child_link2 = child_link1.clone()
                child_link2.to_id = to_id
                child_link2.make_bubble_to_bubble()
                child_links.append(child_link2)

            child_popped_link = link_dict.get(link_id).clone()

            if from_id == self.id:
                child_popped_link.from_id = from_id
                child_popped_link.from_type = "b"
            else:
                child_popped_link.to_id = to_id
                child_popped_link.to_type = "b"

            child_links.append(child_popped_link)

        return child_links

    #TODO: SINGLETON LINKS ARE IN CHILD BUBBLES NOT PARENT!
    def get_singleton_links(self):
        singleton_links = []
        print("SINGLETON LINKS:", self.bubble.singleton_links)

        link_data = [link for link in self.bubble.singleton_links if self.id in link]

        if len(link_data) < 1:
            return singleton_links
        
        link_dict = self.fetch_links([x[0] for x in link_data])

        for link_id, from_id, to_id in link_data:
            if link_id not in link_dict:
                continue

            singleton_link = link_dict.get(link_id).clone()
            singleton_link.from_id = from_id
            singleton_link.to_id = to_id

            if from_id == self.id:
                singleton_link.from_type = "b"
            else:
                singleton_link.to_type = "b"

            singleton_links.append(singleton_link)

        print("SINGLETON LINKS:", len(singleton_links), "for", self.id)
        return singleton_links
    
    def get_popped_links(self):
        return self.get_chain_links() + \
               self.get_deletion_links() + \
               self.get_end_links() + \
               self.get_child_links() + \
               self.get_singleton_links()

    def __str__(self):
        return f"BubbleJunction(bubble={self.id}, contained={self.contained})"
    def __repr__(self):
        return f"BubbleJunction({self.id})"
    