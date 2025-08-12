from collections import defaultdict
import math
from bisect import bisect_left
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

            self.starts = array('I')
            self.ends = array('I')
            self.ids = array('I')

            bubbles = db.load_parentless_bubbles(self.dir, self.gfaidx)

            ranges = []
            for bubble in bubbles:
                for start, end in bubble.get_ranges(exclusive=False):
                    ranges.append((start, end, bubble.id))
            
            ranges.sort()
            for start, end, bid in ranges:
                self.starts.append(start)
                self.ends.append(end)
                self.ids.append(bid)

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

    def serialize(self):
        return {
            "starts": self.starts.tolist(),
            "ends": self.ends.tolist(),
            "ids": self.ids.tolist()
        }

    def get_chain_ends(self, chain_id):
        return db.get_chain_ends(self.dir, chain_id)

    def get_bubble_by_chain(self, chain_id, chain_step):
        result = db.get_bubble_ids_from_chain(self.dir, chain_id, chain_step, chain_step)
        if result:
            bubble_id = result[0]
            return self[bubble_id]
        return None
    
    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")  

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False
        
        self.starts = array('I', quick_index["starts"])
        self.ends = array('I', quick_index["ends"])
        self.ids = array('I', quick_index["ids"])
        return True

    def fill_chain(self, chain):
        min_step, max_step = chain.chain_step_range()
        if min_step is None: return

        bubble_ids = db.get_bubble_ids_from_chain(self.dir, chain.id, min_step, max_step)
        current_bids = {bubble.id for bubble in chain.bubbles}
        missing_bubbles = [self[bubble_id] for bubble_id in bubble_ids if bubble_id not in current_bids]
        chain.add_bubbles(missing_bubbles)

        chain.update_bubble_ends(self)

    def create_chains(self, bubbles, gfaidx, parent_bubble=None):
        chain_dict = defaultdict(list)
        for bubble in bubbles:
            chain_dict[bubble.chain].append(bubble)
            
        chains = []
        for chain_id in chain_dict:
            chain = Chain(chain_id, chain_dict[chain_id], parent_bubble=parent_bubble, gfaidx=gfaidx)
            self.fill_chain(chain)
            chains.append(chain)
        return chains

    def get_top_level_bubbles(self, min_step, max_step, as_chains=False):
        bubbles = []
        
        start_index = bisect_left(self.ends, min_step)
        for i in range(start_index, len(self.starts)):
            if self.starts[i] > max_step:
                break  # No more possible overlaps
            bubble_id = self.ids[i]
            bubble = self[bubble_id]
            bubble_results = self._traverse_descendants(bubble, min_step, max_step)
            bubbles.extend(bubble_results)

        #results.extend(self._collect_non_ref(results))

        if as_chains:
            return self.create_chains(bubbles, self.gfaidx)

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

    def get_popped_subgraph(self, bubble_id, gfaidx, stepidx):
        bubble = self[bubble_id]
        all_nodes, all_links = [], []

        if bubble is None:
            return {"nodes": all_nodes, "links": all_links} 

        #[bubble:end]-[x]
        junctions = bubble.emit_chain_junctions(gfaidx)
        for junction in junctions:
            all_nodes.append(junction)
            all_links.extend(junction.get_links())

        # check for deletion links
        del_links = junctions[0].shared_links(junctions[1])
        all_links.extend(del_links)
        # [bubble]-[bubble]
        inside_bubbles = [self[bid] for bid in bubble.children]
        chains = self.create_chains(inside_bubbles, gfaidx, parent_bubble=bubble)
        for chain in chains:
            bubbles, links = chain.decompose()
            all_nodes.extend(bubbles)
            all_links.extend(links)

        #[segment]-[segment]
        internal_chain_segments = set()
        for chain in chains:
            internal_chain_segments.update(chain.get_internal_segment_ids(as_set=True))
        exposed_segments = bubble.inside - internal_chain_segments

        inside_segments, inside_segment_links = gfaidx.get_subgraph(exposed_segments, stepidx)
        all_nodes.extend(inside_segments)
        all_links.extend(inside_segment_links)

        #todo:
        # - deletion links in chain junction
        # - parent child bubble junction
    

        # check for indel links
        all_links.extend(bubble.get_deletion_links(gfaidx))

        # when a sib bubble has been popped, we need to update its deletion links too
        for sibling in bubble.get_siblings():
            sib_bubble = self[sibling]
            all_links.extend(sib_bubble.get_deletion_links(gfaidx))

        return {"nodes": all_nodes, "links": all_links}