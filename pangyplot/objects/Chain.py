import pangyplot.db.sqlite.bubble_db as db
from pangyplot.objects.Link import Link

class Chain:
    def __init__(self, chain_id, bubbles=None):
        self.id = chain_id

        self.bubbles = bubbles if bubbles is not None else []
        self.sort_bubbles()

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

    def fill_chain(self, db_dir, gfaidx):
        min_step, max_step = self.chain_step_range()
        bubble_ids = db.get_bubble_ids_from_chain(db_dir, self.id, min_step, max_step)
        current_bids = {bubble.id for bubble in self.bubbles}
        for bubble_id in bubble_ids:
            if bubble_id not in current_bids:
                missing_bubble = db.get_bubble(db_dir, bubble_id, gfaidx)
                self.bubbles.append(missing_bubble)
        self.sort_bubbles()

        self.internal_sinks = self._get_internal_sinks(gfaidx)

    def get_chain_links(self):
        links = []
        for i, bubble in enumerate(self.bubbles[:-1]):
            chain_link = bubble.sink.get_chain_link()
            if chain_link is not None:
                links.append(chain_link)
        return links

    def get_internal_segment_ids(self, as_set=False):
        seg_ids = []
        for i, bubble in enumerate(self.bubbles[:-1]):
            seg_ids.extend(bubble.sink.get_contained())
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
        self.bubbles.sort(key=lambda bubble: bubble.chain_step)

    def __len__(self):
        return len(self.bubbles)

    def __str__(self):
        return f"Chain(id={self.id}, bubbles={len(self)})"

    def __repr__(self):
        return f"Chain({self.id}, bubbles={len(self)})"
