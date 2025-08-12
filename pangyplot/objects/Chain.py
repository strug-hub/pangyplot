from pangyplot.objects.Link import Link

class Chain:
    def __init__(self, chain_id, bubbles=None, parent_bubble=None):
        self.id = chain_id

        self.parent_bubble = parent_bubble # object not id
        self.bubbles = bubbles if bubbles is not None else []

        self.sort_bubbles()
        self.assign_siblings()

        self.internal_sinks = None

    def serialize(self):
        return {
            "nodes": [bubble.serialize() for bubble in self.bubbles],
            "links": [link.serialize() for link in self.get_chain_links()]
        }
    
    def decompose(self):
        return self.bubbles, self.get_chain_links()
    
    def source_bubble(self):
        if self.bubbles:
            return self.bubbles[0]
        return None
    
    def sink_bubble(self):
        if self.bubbles:
            return self.bubbles[-1]
        return None

    def chain_step_range(self):
        return (self[0].chain_step, self[-1].chain_step) if len(self.bubbles) > 0 else None

    def fill_chain(self, bubbleidx, gfaidx):
        min_step, max_step = self.chain_step_range()
        bubble_ids = bubbleidx.get_bubble_ids_from_chain(self.id, min_step, max_step)
        current_bids = {bubble.id for bubble in self.bubbles}
        for bubble_id in bubble_ids:
            if bubble_id not in current_bids:
                missing_bubble = db.get_bubble(db_dir, bubble_id, gfaidx)
                self.bubbles.append(missing_bubble)
        self.sort_bubbles()

        self.internal_sinks = self._get_internal_sinks(gfaidx)
        self.update_bubble_ends(bubbleidx, gfaidx)

    def update_bubble_ends(self, bubbleidx, gfaidx):
        if self.parent_bubble is None:
            return

        result = bubbleidx.get_chain_ends(self.id)
        if result is None:
            return

        start_id, start_step = result[0]
        end_id, end_step = result[1]

        for bubble in (self.bubbles[0], self.bubbles[-1]):
            if bubble.id == start_id:
                bubble.source.update_with_parent(self.parent_bubble, gfaidx)
            if bubble.id == end_id:
                bubble.sink.update_with_parent(self.parent_bubble, gfaidx)

    def get_chain_links(self):
        source_chain_link = self.bubbles[0].source.get_parent_chain_link()
        sink_chain_link = self.bubbles[-1].sink.get_parent_chain_link()
        
        links = [link for link in (source_chain_link, sink_chain_link) if link is not None]

        for i, bubble in enumerate(self.bubbles[:-1]):
            chain_link = bubble.sink.get_chain_link()

            if chain_link is not None:
                links.append(chain_link)
        return links

    def get_parent_segment_links(self, gfaidx):
        links = self.bubbles[0].source.get_parent_segment_links(gfaidx)
        links.extend(self.bubbles[-1].sink.get_parent_segment_links(gfaidx))
        return links

    def get_internal_segment_ids(self, as_set=False):
        seg_ids = []
        for i, bubble in enumerate(self.bubbles[:-1]):
            seg_ids.extend(bubble.sink.get_contained())
        seg_ids.extend(self.bubbles[0].source.get_contained())
        seg_ids.extend(self.bubbles[-1].sink.get_contained())

        return set(seg_ids) if as_set else seg_ids

    def _get_internal_sinks(self, gfaidx):
        sink_dict = dict()
        if len(self.bubbles) < 2:
            return sink_dict

        for bubble in self.bubbles[:-1]:
            sink_ids = bubble.get_sink_segments()

            sink_dict[bubble.id] = dict()
            for sid in sink_ids:
                sink_dict[bubble.id][sid] = {"length": gfaidx.segment_length(sid)}
        return sink_dict

    def __getitem__(self, i):
        return self.bubbles[i]

    def sort_bubbles(self):
        if len(self.bubbles) < 2:
            return

        self.bubbles.sort(key=lambda bubble: bubble.chain_step)
        chain_order = [None, *self.bubbles, None]

        for i, bubble in enumerate(chain_order):
            if bubble is None: continue
            prevId = chain_order[i - 1].id if chain_order[i - 1] is not None else None
            nextId = chain_order[i + 1].id if chain_order[i + 1] is not None else None
            bubble.correct_source_sink(prevId, nextId)

    def assign_siblings(self):
        chain_order = [None, *self.bubbles, None]
        for i, bubble in enumerate(chain_order):
            if bubble is None: continue
            bubble.add_source_sibling(chain_order[i - 1])
            bubble.add_sink_sibling(chain_order[i + 1])

    def __len__(self):
        return len(self.bubbles)

    def __str__(self):
        return f"Chain(id={self.id}, bubbles={len(self)})"

    def __repr__(self):
        return f"Chain({self.id}, bubbles={len(self)})"
