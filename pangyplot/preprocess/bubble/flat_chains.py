"""Chain assembly and parent assignment over FlatBubbles.

Ports connect_bubbles + find_parents. Both are bookkeeping over the bubble set
rather than over the node graph, so there is little memory to win here -- the
point is to close the last dependency on BubbleGun's objects.

Ordering is the whole difficulty. Legacy sorts on `int(node.id)`, which is the
*segment* id, so every ordering decision below goes through `g.seg_id[...]` and
not the node index. They are not the same thing, and using indices would number
the chains differently -- and therefore renumber every bubble in the datastore.
"""

from collections import Counter, defaultdict

import numpy as np

from pangyplot.preprocess.bubble.flat_bubbles import SUPER


class FlatChains:
    """Chains as CSR over bubble indices, in walk order."""

    __slots__ = ["ptr", "bubbles", "ends"]

    def __init__(self, ptr, bubbles, ends):
        self.ptr = ptr
        self.bubbles = bubbles
        self.ends = ends          # (n_chains, 2) node indices

    def __len__(self):
        return len(self.ptr) - 1

    def bubbles_of(self, c):
        return self.bubbles[self.ptr[c]:self.ptr[c + 1]]


def _find_ends(g, fb, bubbles):
    """Chain end nodes: those appearing exactly once as a source or sink.

    Sorted descending by segment id, matching BubbleChain.find_ends. The
    direction matters: it decides which end `sort()` walks from, and hence the
    source/sink orientation of every bubble in the chain.

    Kept as-is for non-monotonic ids (GBZ without `odgi sort`): the sort is a
    determinism + byte-parity device, still deterministic there, and chain
    direction is not load-bearing (Bubble.correct_source_sink renormalizes at
    serving time). Reordering by position would renumber every datastore.
    """
    counts = Counter()
    for b in bubbles:
        counts[int(fb.source[b])] += 1
        counts[int(fb.sink[b])] += 1
    ends = [n for n, c in counts.items() if c == 1]
    return sorted(ends, key=lambda n: int(g.seg_id[n]), reverse=True)


def _sort_chain(fb, bubbles, ends):
    """Order the chain's bubbles by walking from one end. Port of BubbleChain.sort."""
    at_node = defaultdict(set)
    for b in bubbles:
        at_node[int(fb.source[b])].add(b)
        at_node[int(fb.sink[b])].add(b)

    ordered = []
    visited = set()
    current = ends[0]

    while len(ordered) < len(bubbles):
        nxt = None
        for b in at_node.get(current, ()):
            if b not in visited:
                nxt = b
                break
        if nxt is None:
            break  # break in the chain; legacy logs and stops here too

        ordered.append(nxt)
        visited.add(nxt)
        src, snk = int(fb.source[nxt]), int(fb.sink[nxt])
        current = snk if src == current else src

    return ordered


def connect_bubbles(g, fb):
    """Assemble bubbles into chains and assign bubble/chain ids.

    Returns FlatChains. Sets fb.id and fb.chain_id.
    """
    at_node = defaultdict(set)
    for b in range(len(fb)):
        at_node[int(fb.source[b])].add(b)
        at_node[int(fb.sink[b])].add(b)

    def build(start):
        chain = []
        current = start
        while True:
            here = at_node.get(current)
            if not here:
                break
            b = here.pop()
            chain.append(b)
            src, snk = int(fb.source[b]), int(fb.sink[b])
            nxt = snk if current == src else src
            onward = at_node.get(nxt)
            if onward is not None:
                onward.discard(b)
            current = nxt
        return chain

    # a source or sink belongs to at most two bubbles, so a node holding exactly
    # one is a chain end
    starting = [n for n, bs in at_node.items() if len(bs) == 1]

    chains = []
    seen_ends = set()

    def offer(members):
        """add_chain: drop anything that is not a clean two-ended chain."""
        if not members:
            return
        ends = _find_ends(g, fb, members)
        if len(ends) != 2:
            # circular chains and other oddities. Legacy appends them to
            # circular_and_other_problematic_chains.gfa and drops them; the file
            # is a debug artifact nothing reads, so only the drop is reproduced.
            return
        a, b = int(g.seg_id[ends[0]]), int(g.seg_id[ends[1]])
        key = (a, b) if a > b else (b, a)
        if key in seen_ends:
            return  # b_chains is a set keyed on the end pair; first one wins
        seen_ends.add(key)
        chains.append((_sort_chain(fb, members, ends), ends, key))

    for n in starting:
        if not at_node.get(n):
            continue
        offer(build(n))

    # whatever is left has no degree-one end (circular chains)
    for n, bs in at_node.items():
        if not bs:
            continue
        offer(build(n))

    # Chain ids come from a total order on the end pair, not from iteration order:
    # b_chains is a set hashed on node-id strings, so iterating it directly
    # numbered chains differently on every run (see bd5914ff).
    chains.sort(key=lambda c: sorted(c[2]))

    ptr = np.zeros(len(chains) + 1, dtype=np.int64)
    ends = np.zeros((len(chains), 2), dtype=np.int32)
    members = []
    b_counter = 1
    for c, (ordered, chain_ends, _key) in enumerate(chains):
        chain_id = c + 1
        for b in ordered:
            fb.id[b] = b_counter
            fb.chain_id[b] = chain_id
            b_counter += 1
        members.extend(ordered)
        ptr[c + 1] = len(members)
        ends[c] = chain_ends

    return FlatChains(ptr, np.array(members, dtype=np.int32), ends)


def find_parents(g, fb):
    """Assign each bubble its tightest containing superbubble. Sets fb.parent_sb.

    Port of find_parents. Only parent_sb is reproduced: BubbleChain.parent_sb and
    Bubble.parent_chain are written by the legacy pass but never read -- only
    raw_bubble.parent_sb reaches the datastore, as bubble.parent.
    """
    node_set = {}
    for b in range(len(fb)):
        s = {int(fb.source[b]), int(fb.sink[b])}
        s.update(int(x) for x in fb.inside_of(b))
        node_set[b] = s

    sbs = [b for b in range(len(fb)) if fb.kind[b] == SUPER]
    # ascending by interior size, then reversed -- not a descending sort. Python's
    # sort is stable, so reversing also flips ties, and ties decide which of two
    # equally-sized superbubbles wins the strict `<` below.
    sbs.sort(key=lambda b: fb.ptr[b + 1] - fb.ptr[b])
    sbs.reverse()

    containing = defaultdict(list)
    for sb in sbs:
        for n in node_set[sb]:
            containing[n].append(sb)

    for b in range(len(fb)):
        b_nodes = node_set[b]
        best = None
        best_size = None
        # candidates are the superbubbles covering this bubble's source
        for sb in containing.get(int(fb.source[b]), ()):
            if sb == b:
                continue
            sb_nodes = node_set[sb]
            size = len(sb_nodes)
            if (best_size is None or size < best_size) and b_nodes < sb_nodes:
                best = sb
                best_size = size

        if best is not None:
            fb.parent_sb[b] = fb.id[best]
