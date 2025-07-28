from collections import defaultdict
import math
from bisect import bisect_left
from array import array

import pangyplot.db.sqlite.bubble_db as db
import pangyplot.db.db_utils as utils
from pangyplot.objects.Chain import Chain

QUICK_INDEX = "bubbles.quickindex.json"

class BubbleIndex:
    def __init__(self, dir, cache_size=1000):
        self.dir = dir
        
        self.cache_size = cache_size
        self.cached_bubbles = dict()  # bubble_id -> Bubble

        if not self.load_quick_index():

            self.starts = array('I')
            self.ends = array('I')
            self.ids = array('I')

            bubbles = db.load_parentless_bubbles(self.dir)

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

        bubble = db.get_bubble(self.dir, bubble_id)
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

    def get_top_level_bubbles(self, min_step, max_step, as_chains=False):
        results = []
        
        start_index = bisect_left(self.ends, min_step)
        for i in range(start_index, len(self.starts)):
            if self.starts[i] > max_step:
                break  # No more possible overlaps
            bubble_id = self.ids[i]
            bubble = self[bubble_id]
            result = self._traverse_descendants(bubble, min_step, max_step)
            results.extend(result)

        #results.extend(self._collect_non_ref(results))

        if as_chains:
            chain_results = defaultdict(list)
            for bubble in results:
                chain_results[bubble.chain].append(bubble)

            chains = []
            for chain_id in chain_results:
                chain = Chain(chain_id, chain_results[chain_id])
                chain.fill_chain(self.dir)
                chains.append(chain)
            return chains

        return results

    def _traverse_descendants(self, bubble, min_step, max_step):
        if bubble.is_contained(min_step, max_step):
            return [bubble]
        # Otherwise, recurse through children
        results = []
        for child_id in bubble.children:
            child = self[child_id]
            results.extend(self._traverse_descendants(child, min_step, max_step))
        return results

    def get_sibling_segments(self, bubbles, inside_only=False):
        sibling_segments = defaultdict(int)
        for bubble in bubbles:
            for node_id in bubble.get_sibling_segments():
                sibling_segments[node_id] += 1
        
        if inside_only:
            return {nid for nid, count in sibling_segments.items() if count > 1}
        else:
            return {nid for nid, _ in sibling_segments.items()}

    def get_descendant_ids(self, bubble):
        descendants = set()

        def traverse(bubble):
            for sid in bubble.ends(as_list=True):
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

    def get_merged_intervals(self, bubbles, min_step=-1, max_step=math.inf):
        bubble_intervals = []

        for bubble in bubbles:
            for lo, hi in bubble.get_ranges(exclusive=False):
                if hi < min_step or lo > max_step:
                    continue

                lo = max(lo, min_step) if min_step != -1 else lo
                hi = min(hi, max_step) if max_step != math.inf else hi

                bubble_intervals.append((lo, hi))

        bubble_intervals.sort(key=lambda x: x[0])
        merged = []

        for interval in bubble_intervals:
            if not merged:
                merged.append(interval)
            else:
                last_start, last_end = merged[-1]
                curr_start, curr_end = interval

                if curr_start <= last_end + 1:
                    merged[-1] = (last_start, max(last_end, curr_end))
                else:
                    merged.append(interval)

        return merged

    def get_subgraph(self, bubble_id, gfa_index):
        bubble = self[bubble_id]
        if bubble is None:
            return [],[],[]

        bubble_links = []
        bubble_nodes = [self[child_id] for child_id in bubble.children]
        #segment_ids = set()
        for child in bubble_nodes:
            bubble_links.extend(child.end_links(gfa_index))
            #ends = set(child.ends(as_list=True))
            #segment_ids.update(ends)

        #segment_ids.update(bubble.inside)
        #segment_ids.update(set(bubble.ends(as_list=True)))
        return bubble, bubble_nodes, bubble_links #, segment_ids