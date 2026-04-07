import logging
import sys
import pdb
from collections import Counter


class BubbleChain:
    """
    BubbleChain object which is a set of bubble objects
    """
    __slots__ = ['bubbles', 'sorted', 'ends', 'key', 'id', 'parent_chain', 'parent_sb']

    def __init__(self):
        """
        initialize the BubbleChain as a set of bubble
        """
        self.bubbles = set()
        self.sorted = []  # sorted bubble pointers
        self.ends = []  # node ids of the chain ends
        self.id = 0
        self.parent_sb = 0
        self.parent_chain = 0
        # self.key = self.__hash__()

    def __key(self):
        """
        calculated the key of the bubble chain
        """
        if self.ends[0] > self.ends[1]:
            return self.ends[0], self.ends[1]
        return self.ends[1], self.ends[0]

    def __hash__(self):
        return hash(self.__key())

    def __eq__(self, other):
        return self.__key() == other.__key()

    def __ne__(self, other):
        return not self.__eq__(other)

    def __len__(self):
        """
        overloading the length function
        """
        return len(self.bubbles)

    def __contains__(self, item):
        """
        Overloading membership operator
        """
        return item in self.bubbles

    def add_bubble(self, bubble):
        """
        adds a bubble object to the chain
        """
        self.bubbles.add(bubble)

    def list_chain(self, ids=True):
        """
        return all nodes in the chain as a list of node objects
        """
        c_list = []
        for b in self.bubbles:
            c_list += [b.source, b.sink] + b.inside
        if ids:
            return list(set([x.id for x in c_list]))

        return list(set(c_list))  # set to remove redundant sources and sinks

    def length_node(self):
        """
        returns how many nodes there are in the chain
        """
        return len(self.list_chain())

    def length_seq(self):
        """
        returns sequence length covered by the chain
        """
        # total_seq = 0
        # counted_overlaps = set()
        # for n in self.list_chain(ids=False):
        #     total_seq += n.seq_len
        #     if n.id not in counted_overlaps:
        #         for nn in n.end:
        #             counted_overlaps.add(nn[0])
        #             total_seq -= nn[2]
        #         for nn in n.start:
        #             counted_overlaps.add(nn[0])
        #             total_seq -= nn[2]
        total_seq = 0
        for n in self.list_chain(ids=False):
            total_seq += n.seq_len
        return total_seq

    def find_ends(self):
        """
        Find the ends of a chain

        todo maybe add the ends while constructing the chain in find_sb_alg
        """
        self.ends = [k for k, v in Counter([b.source.id for b in self.bubbles] + [b.sink.id for b in self.bubbles]).items() if v == 1]

    def sort(self):
        """
        sorts the bubbles in the chain

        This solution is inspired by the solution in Issue #8 by ScottMastro
        """
        # Linear walk using bubble adjacency; avoids quadratic scans on long chains.
        node_to_bubbles = dict()
        for b in self.bubbles:
            for node_id in (b.source.id, b.sink.id):
                node_to_bubbles.setdefault(node_id, set()).add(b)

        current_node = self.ends[0]  # choose one end of the chain as start
        visited_bubbles = set()

        while len(self.sorted) < len(self.bubbles):
            candidates = node_to_bubbles.get(current_node, set())
            next_bubble = None
            for b in candidates:
                if b not in visited_bubbles:
                    next_bubble = b
                    break

            if next_bubble is None:
                logging.error("No unvisited bubble found: break in bubble chain. Stopping traversal.")
                break

            self.sorted.append(next_bubble)
            visited_bubbles.add(next_bubble)

            if next_bubble.source.id == current_node:
                current_node = next_bubble.sink.id
            else:
                current_node = next_bubble.source.id
