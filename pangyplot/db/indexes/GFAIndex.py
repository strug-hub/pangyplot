from collections import deque
from pangyplot.db.indexes.LinkIndex import LinkIndex
from pangyplot.db.indexes.SegmentIndex import SegmentIndex
from pangyplot.db.indexes.PathIndex import PathIndex
from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex

class GFAIndex:
    def __init__(self, db_dir, client=None, coords=None):
        # `client` (a GbwtClient in graph mode) backs the sub-indexes with the GBZ
        # instead of SQLite/binpaths (GBZ-native); `coords` supplies segment
        # coordinates from the layout file. Without a client this is the legacy
        # SQLite/binpath build.
        self.segment_index = SegmentIndex(db_dir, client=client, coords=coords)
        self.link_index = LinkIndex(db_dir, client=client)
        self.path_index = (GbwtPathIndex(client, db_dir) if client is not None
                           else PathIndex(db_dir))

    def __getitem__(self, segment_id):
        return self.segment_index[segment_id]

    def max_segment_id(self):
        return self.segment_index.max_id()
    
    def get_segments(self, seg_ids):
        return self.segment_index.get_by_ids(seg_ids)
    
    def segment_length(self, seg_id):
        return self.segment_index.segment_length(seg_id)
    
    def segment_gc_n_count(self, seg_id):
        return self.segment_index.segment_gc_n_count(seg_id)

    def get_links(self, seg_id):
        return self.link_index[seg_id]
    
    def get_links_by_id(self, link_ids):
        return self.link_index.get_links_by_id(link_ids)

    def get_samples(self):
        return self.path_index.get_samples()
    
    def get_sample_idx(self):
        return self.path_index.get_sample_idx()

    def get_paths(self, sample):
        return self.path_index.get_paths(sample)
    
    def get_neighbors(self, seg_id, direction=None):
        """Return neighbor segment IDs, reading directly from in-memory arrays."""
        li = self.link_index
        if seg_id >= len(li.seg_index_offsets) or seg_id < 0:
            return []
        offset = li.seg_index_offsets[seg_id]
        count = li.seg_index_counts[seg_id]
        neighbors = []
        for j in range(count):
            idx = li.seg_index_flat[offset + j]
            fid = li.from_ids[idx]
            tid = li.to_ids[idx]
            if fid == seg_id:
                neighbor = tid
                dir_label = '+'
            else:
                neighbor = fid
                dir_label = '-'
            if direction is None or direction == dir_label:
                neighbors.append(neighbor)
        return neighbors

    def traverse(self, start_id, max_steps=10, direction=None):
        path = [start_id]
        current = start_id
        for _ in range(max_steps):
            neighbors = self.get_neighbors(current, direction)
            if not neighbors:
                break
            current = neighbors[0]
            path.append(current)
        return path

    def bfs_subgraph(self, start_step, end_step, step_index):
        # Constraint: cannot traverse through reference nodes that are
        #    *outside* the range between start_step and end_step.
        min_step = min(start_step, end_step)
        max_step = max(start_step, end_step)
        
        def constrained_bfs(seed_step, target_step):
            visited = set()
            queue = deque()
            
            start_seg_id = step_index[seed_step]
            if start_seg_id is None:
                raise ValueError(f"No segment found for start_step {seed_step}")

            queue.append(start_seg_id)
            visited.add(start_seg_id)

            while queue:
                current = queue.popleft()
                for neighbor in self.get_neighbors(current, direction=None):
                    if neighbor in visited:
                        continue

                    steps = step_index.get_steps_for_segment(neighbor)
                    if not any(min_step <= s <= max_step for s in steps):
                        continue

                    visited.add(neighbor)
                    queue.append(neighbor)

            return visited

        # Try forward BFS
        forward_visited = constrained_bfs(start_step, end_step)

        # Check if end_step is reached
        end_seg_id = step_index[end_step]
        if end_seg_id is not None and end_seg_id in forward_visited:
            return forward_visited

        # Fallback: reverse BFS
        reverse_visited = constrained_bfs(end_step, start_step)

        return forward_visited | reverse_visited
    
    def filter_path(self, seg_ids, step_index, on_path=True):
        keep = []
        for sid in seg_ids:
            check = len(step_index.get_steps_for_segment(sid)) > 0
            if check == on_path:
                keep.append(sid)
        return keep

    def bfs(self, start_id, max_steps):
        visited = set([start_id])
        queue = deque([(start_id, 0)])

        while queue:
            current, steps = queue.popleft()
            if steps >= max_steps:
                continue
    
            for neighbor in self.get_neighbors(current):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, steps + 1))
        
        return visited

    def get_subgraph(self, seg_ids, step_index, fast=False):
        segments = self.segment_index.get_by_ids(seg_ids, step_index)

        get_links = self.link_index.get_links_by_segment_fast if fast \
            else self.link_index.get_links_by_segment
        links = []
        link_ids = set()
        for sid in seg_ids:
            for link in get_links(sid):
                lid = link.id()
                if lid not in link_ids:
                    links.append(link)
                    link_ids.add(lid)

        return (segments, links)
