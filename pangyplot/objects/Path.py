from collections import deque

class Path:
    def __init__(self):
        self.full_id = None
        self.sample = None
        self.hap = None
        self.contig = None
        self.length = None
        self.start = None
        self.is_ref = False
        self.path = []
        self.bubble_path = []

    def serialize(self):
        return {
            "full_id": self.full_id,
            "id": self.sample_name(),
            "sample": self.sample,
            "hap": self.hap,
            "contig": self.contig,
            "length": self.length,
            "start": self.start,
            "is_ref": self.is_ref,
            "path": self.path,
            "bubble_path": self.bubble_path
        }

    def __getitem__(self, index):
        step = self.path[index]
        return (int(step[:-1]), step[-1])
    
    def __iter__(self):
        for step in self.path:
            yield (int(step[:-1]), step[-1])

    def id_like(self, string):
        return string in self.full_id

    def apply_offset(self, offset):
        self.start = offset

    def sample_name(self):
        if self.hap is None:
            return self.sample
        return f'{self.sample}#{self.hap}'

    def clone(self, no_path=False):
        new_path = Path()
        new_path.full_id = self.full_id
        new_path.sample = self.sample
        new_path.hap = self.hap
        new_path.contig = self.contig
        new_path.is_ref = self.is_ref
        if not no_path:
            new_path.start = self.start
            new_path.length = self.length
            new_path.path = self.path.copy()
            new_path.bubble_path = self.bubble_path.copy()
        return new_path

    def add_step(self, id, direction):
        self.path.append(f"{id}{direction}")

    def subset_path(self, start_id, end_id, gfaidx=None, buffer=10):
        subsets = []
        current_path = None
        buffer_count = 0
        length = 0

        pos = self.start
        for id, direction in self:
            l = gfaidx.segment_length(id) if gfaidx else 0

            if start_id <= id <= end_id:
                if current_path is None:
                    current_path = self.clone(no_path=True)
                    current_path.start = pos
                current_path.add_step(id, direction)
            else:
                if current_path is not None:
                    buffer_count += 1
                    length += l

            if buffer_count > buffer:
                buffer_count = 0
                current_path.length = length
                subsets.append(current_path)
                current_path = None
                length = 0

            pos += l

        return subsets

    def construct_bubble_path(self, bubbleidx):
        def bubble_hierarchy(bid):
            # returns [root, ..., bid] as ints
            chain = []
            while bid is not None:
                chain.append(bid)
                bid = bubbleidx.parent_of_bubble(chain[-1])
            chain.reverse()
            return chain

        def longest_common_prefix_len(a, b):
            n = min(len(a), len(b))
            i = 0
            while i < n and a[i] == b[i]:
                i += 1
            return i

        bubble_path = []
        # Stack of (bubble_id:int, list_ref:list)
        open_stack = []

        def current_level():
            return open_stack[-1][1] if open_stack else bubble_path

        for sid, orient in self:
            seg = f"s{sid}{orient}"
            bid = bubbleidx.segment_in_bubble(sid)  # int or None

            if bid is None:
                # Outside any bubble: close all and write at root
                open_stack.clear()
                current_level().append(seg)
                continue

            # Inside a bubble: pop to common ancestor, open missing, then append seg
            target_hier = bubble_hierarchy(bid)        # e.g., [20, 10, 7]
            stack_ids   = [b for (b, _) in open_stack] # e.g., [20, 11]

            lcp = longest_common_prefix_len(stack_ids, target_hier)

            while len(open_stack) > lcp:
                open_stack.pop()

            for new_bid in target_hier[lcp:]:
                # prefix "b" only when creating the dict
                holder = {f"b{new_bid}": []}
                current_level().append(holder)
                open_stack.append((new_bid, holder[f"b{new_bid}"]))

            current_level().append(seg)

        self.bubble_path = bubble_path
        return bubble_path

    def __len__(self):
        return len(self.path)

    def __str__(self):
        return f"Path({self.sample_name()})"

    def __repr__(self):
        return f"Path({self.sample_name()}, start={self.start}, length={self.length})"
