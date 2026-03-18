from collections import defaultdict
from bisect import bisect_left, bisect_right
from array import array

import pangyplot.db.sqlite.bubble_db as db

import pangyplot.db.db_utils as utils
from pangyplot.objects.Chain import Chain

QUICK_INDEX = "bubbles.quickindex.json"

class BubbleIndex:
    def __init__(self, dir, gfaidx, cache_size=1000):
        self.dir = dir
        
        self.gfaidx = gfaidx

        self.cache_size = cache_size
        self.cached_bubbles = dict()  # bubble_id -> Bubble

        if not self.load_quick_index():

            max_seg_id = gfaidx.max_segment_id()
            max_bubble_id = db.get_max_id(self.dir)
            self.segment_to_bubble = array('I', [0] * (max_seg_id + 1))
            self.bubble_to_parent = array('I', [0] * (max_bubble_id + 1))

            for row in db.iter_relationships(self.dir):
                if row["parent"] is not None:
                    self.bubble_to_parent[row["id"]] = row["parent"]
                    for sid in row["source"] + row["sink"]:
                        self.segment_to_bubble[sid] = row["parent"]

                for sid in row["inside"]:
                    self.segment_to_bubble[sid] = row["id"]

            # top-level bubbles only
            self.start_steps = array('I')
            self.end_steps = array('I')
            self.ids = array('I')

            parentless_bubbles = db.load_parentless_bubbles(self.dir, self.gfaidx)

            ranges = []
            for bubble in parentless_bubbles:
                for start, end in bubble.get_ranges(exclusive=False):
                    ranges.append((start, end, bubble.id))

            ranges.sort()
            for start, end, bid in ranges:
                self.start_steps.append(start)
                self.end_steps.append(end)
                self.ids.append(bid)

            self._build_layout_arrays(parentless_bubbles)

            self.save_quick_index()

    def __getitem__(self, bubble_id):
        if bubble_id in self.cached_bubbles:
            return self.cached_bubbles[bubble_id]

        bubble = db.get_bubble(self.dir, bubble_id, self.gfaidx)
        self._cache_bubble(bubble_id, bubble)
        return bubble
    
    def _cache_bubble(self, bubble_id, bubble_obj):
        if len(self.cached_bubbles) >= self.cache_size:
            self.cached_bubbles.pop(next(iter(self.cached_bubbles)))  # Simple FIFO
        self.cached_bubbles[bubble_id] = bubble_obj

    def _build_layout_arrays(self, parentless_bubbles):
        """Build layout_x1/x2/ids arrays sorted by layout_x1, plus prefix_max_x2.

        prefix_max_x2[i] = max(layout_x2[0..i]) — monotonically non-decreasing,
        enabling bisect to skip the initial portion where no entry can overlap.
        """
        layout_entries = []
        for bubble in parentless_bubbles:
            lx1 = min(bubble.x1, bubble.x2)
            lx2 = max(bubble.x1, bubble.x2)
            layout_entries.append((lx1, lx2, bubble.id))
        layout_entries.sort()

        self.layout_x1 = array('f')
        self.layout_x2 = array('f')
        self.layout_ids = array('I')
        for lx1, lx2, bid in layout_entries:
            self.layout_x1.append(lx1)
            self.layout_x2.append(lx2)
            self.layout_ids.append(bid)

        self._build_prefix_max()

    def _build_prefix_max(self):
        """Build prefix_max_x2 from layout_x2. Rebuilt on load, not serialized."""
        n = len(self.layout_x2)
        self.prefix_max_x2 = array('f', bytes(n * 4))
        if n > 0:
            self.prefix_max_x2[0] = self.layout_x2[0]
            for i in range(1, n):
                prev = self.prefix_max_x2[i - 1]
                cur = self.layout_x2[i]
                self.prefix_max_x2[i] = cur if cur > prev else prev

    def serialize(self):
        return {
            "bubble_to_parent": self.bubble_to_parent.tolist(),
            "segment_to_bubble": self.segment_to_bubble.tolist(),
            "start_steps": self.start_steps.tolist(),
            "end_steps": self.end_steps.tolist(),
            "ids": self.ids.tolist(),
            "layout_x1": self.layout_x1.tolist(),
            "layout_x2": self.layout_x2.tolist(),
            "layout_ids": self.layout_ids.tolist(),
        }

    def get_chain_ends(self, chain_id):
        return db.get_chain_ends(self.dir, chain_id)

    def get_bubble_by_chain(self, chain_id, chain_step):
        result = db.get_bubble_ids_from_chain(self.dir, chain_id, chain_step, chain_step)
        print(f"Lookup for bubble in chain {chain_id} at step {chain_step} returned: {result}")
        if result:
            bubble_id = result[0]
            return self[bubble_id]
        return None
    
    def segment_in_bubble(self, seg_id):
        if seg_id >= len(self.segment_to_bubble) or seg_id < 0:
            return None
        bubble_id = self.segment_to_bubble[seg_id]
        return None if bubble_id == 0 else bubble_id
    
    def parent_of_bubble(self, bubble_id):
        if bubble_id >= len(self.bubble_to_parent) or bubble_id < 0:
            return None
        parent_id = self.bubble_to_parent[bubble_id]
        return None if parent_id == 0 else parent_id

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")  

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False
        self.bubble_to_parent = array('I', quick_index["bubble_to_parent"])
        self.segment_to_bubble = array('I', quick_index["segment_to_bubble"])
        self.start_steps = array('I', quick_index["start_steps"])
        self.end_steps = array('I', quick_index["end_steps"])
        self.ids = array('I', quick_index["ids"])

        if "layout_x1" in quick_index:
            self.layout_x1 = array('f', quick_index["layout_x1"])
            self.layout_x2 = array('f', quick_index["layout_x2"])
            self.layout_ids = array('I', quick_index["layout_ids"])
            self._build_prefix_max()
        else:
            # Auto-rebuild: load parentless bubbles, build layout arrays, re-save
            print(f"  [BubbleIndex] Rebuilding layout arrays for {self.dir}...")
            parentless_bubbles = db.load_parentless_bubbles(self.dir, self.gfaidx)
            self._build_layout_arrays(parentless_bubbles)
            self.save_quick_index()

        return True

    def create_chains(self, bubbles, parent_bubble=None):
        chain_dict = defaultdict(list)
        for bubble in bubbles:
            chain_dict[bubble.chain].append(bubble)

        chains = []
        for chain_id in chain_dict:
            # Always load ALL bubbles for the chain so that long-chain
            # splitting (_split_balanced) produces the same sub-chain IDs
            # regardless of which viewport subset triggered the query.
            all_ids = db.get_all_bubble_ids_from_chain(self.dir, chain_id)
            current_bids = {bubble.id for bubble in chain_dict[chain_id]}
            missing_bubbles = [self[bubble_id] for bubble_id in all_ids if bubble_id not in current_bids]
            chain_dict[chain_id].extend(missing_bubbles)

            chain = Chain(chain_id, chain_dict[chain_id], parent_bubble=parent_bubble, gfaidx=self.gfaidx)
            chains.append(chain)
        return chains

    def get_top_level_bubbles(self, min_step, max_step, as_chains=False):
        bubbles = []
        
        start_index = bisect_left(self.end_steps, min_step)
        for i in range(start_index, len(self.start_steps)):
            if self.start_steps[i] > max_step:
                break  # No more possible overlaps
            bubble_id = self.ids[i]
            bubble = self[bubble_id]
            bubble_results = self._traverse_descendants(bubble, min_step, max_step)
            bubbles.extend(bubble_results)

        #results.extend(self._collect_non_ref(results))

        if as_chains:
            return self.create_chains(bubbles)

        return bubbles

    def get_top_level_bubbles_by_layout(self, min_x, max_x, as_chains=False):
        """Return top-level bubbles whose layout bbox overlaps [min_x, max_x].

        Unlike get_top_level_bubbles, returns whole superbubbles (no descendant
        traversal) — _decompose_chain handles progressive detail.

        Overlap condition: layout_x1 <= max_x AND layout_x2 >= min_x.
        Two bisects narrow the scan range:
        - bisect_right(layout_x1, max_x) → upper bound (x1 <= max_x)
        - bisect_left(prefix_max_x2, min_x) → lower bound (no entry
          before this can have x2 >= min_x, since prefix_max is non-decreasing)
        """
        bubbles = []

        upper = bisect_right(self.layout_x1, max_x)
        lower = bisect_left(self.prefix_max_x2, min_x, 0, upper)
        for i in range(lower, upper):
            if self.layout_x2[i] >= min_x:
                bubble_id = self.layout_ids[i]
                bubbles.append(self[bubble_id])

        if as_chains:
            return self.create_chains(bubbles)

        return bubbles

    def _traverse_descendants(self, bubble, min_step, max_step):
        if bubble.is_contained(min_step, max_step):
            return [bubble]
        # Otherwise, recurse through children
        results = []
        for child_id in bubble.children:
            child = self[child_id]
            results.extend(self._traverse_descendants(child, min_step, max_step))
        return results

    def get_descendant_ids(self, bubble):
        descendants = set()

        def traverse(bubble):
            for sid in bubble.get_end_segments():
                descendants.add(sid)
            for sid in bubble.inside:
                descendants.add(sid)
            for child_id in bubble.children:
                traverse(self[child_id])

        traverse(bubble)
        return descendants

    #TODO: remove?
    def _collect_non_ref(self, results, debug=False):
        result_bubbles = set(results)
        visited = set(result_bubbles)
        collected = set()

        for bubble in results:
            for sib_id in bubble.get_siblings():
                sib = self[sib_id]
                if sib.is_ref() or sib in visited:
                    continue
                
                component = set()
                stack = [sib]
                anchors = {bubble}

                while stack:
                    curr_bubble = stack.pop()

                    if curr_bubble in result_bubbles:
                        anchors.add(curr_bubble)
                        continue
                    elif curr_bubble in visited:
                        continue

                    visited.add(curr_bubble)

                    if not curr_bubble.is_ref():
                        component.add(curr_bubble)
                        for sib_id in curr_bubble.get_siblings():
                            stack.append(self[sib_id])

                if len(anchors) >= 2:
                    if debug:
                        print(f"[DEBUG] Recovered component with {len(component)} non-ref bubbles, anchors: {[b.id for b in anchors]}")

                    for b in component:
                        if b not in collected:
                            collected.add(b)
                            results.append(b)
        
        return list(collected)

    
    def get_popped_subgraph(self, bubble_id, stepidx):
        bubble = self[bubble_id]
        if bubble is None:
            return {"source_segs": [], "sink_segs": [], "child_bubbles": [], "child_bubble_objects": [], "nodes": [], "links": []}

        child_bubble_objects = [self[cid] for cid in bubble.children]

        # Include child boundary segments so cross-chain links between
        # children are found (they were removed from inside by _clean_inside)
        all_segs = set(bubble.source_segments + bubble.sink_segments) | bubble.inside
        for child in child_bubble_objects:
            all_segs.update(child.source_segments + child.sink_segments)

        segments, links = self.gfaidx.get_subgraph(all_segs, stepidx)
        child_bubbles = [
            {"id": cb.id, "source_segs": cb.source_segments, "sink_segs": cb.sink_segments, "inside_segs": sorted(cb.inside)}
            for cb in child_bubble_objects
        ]

        return {
            "source_segs": bubble.source_segments,
            "sink_segs": bubble.sink_segments,
            "child_bubbles": child_bubbles,
            "child_bubble_objects": child_bubble_objects,
            "nodes": segments,
            "links": links,
        }
