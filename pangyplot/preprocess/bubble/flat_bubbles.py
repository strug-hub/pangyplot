"""Superbubble detection over the FlatGraph.

A port of BubbleGun's find_bubbles/find_sb_alg with the same traversal, but with
adjacency read from CSR slices instead of Python sets.

The win is `_precompute_parent_ids`, which does not survive the port at all.
Legacy builds two frozensets per node up front -- 432 B/node, ~0.42 G on v2 chrY
-- purely to answer "are all of u's parents visited?" as a subset test. Here the
parents of u, arriving at side d, are exactly u's CSR neighbors on side d, so the
question is a slice and a membership loop with nothing allocated.

The per-bubble working sets (seen/visited/S) stay Python sets: they are scoped to
one bubble, not one graph, so they were never the problem.
"""

import numpy as np

from pangyplot.preprocess.bubble.flat_graph import START, END

SIMPLE, INSERTION, SUPER = 0, 1, 2


class FlatBubbles:
    """Bubbles as flat arrays. `inside` is CSR, indexed by bubble."""

    __slots__ = ["source", "sink", "ptr", "inside", "kind",
                 "id", "chain_id", "parent_sb", "parent_chain"]

    def __init__(self, source, sink, ptr, inside, kind):
        self.source = source
        self.sink = sink
        self.ptr = ptr
        self.inside = inside
        self.kind = kind
        n = len(source)
        self.id = np.zeros(n, dtype=np.int32)
        self.chain_id = np.zeros(n, dtype=np.int32)
        self.parent_sb = np.zeros(n, dtype=np.int32)
        self.parent_chain = np.zeros(n, dtype=np.int32)

    def __len__(self):
        return len(self.source)

    def inside_of(self, b):
        return self.inside[self.ptr[b]:self.ptr[b + 1]]

    def counts(self):
        """(simple, super, insertion), matching Graph.bubble_number()."""
        return (int((self.kind == SIMPLE).sum()),
                int((self.kind == SUPER).sum()),
                int((self.kind == INSERTION).sum()))


class _Lists:
    """The CSR arrays as plain Python lists, for the traversal only.

    numpy is the right way to *store* this graph and the wrong thing to touch
    inside the hot loop: `g.adj()` builds a view on every call, and numpy's
    per-call overhead is microseconds against a Python set's tens of nanoseconds.
    Measured, that made the traversal 12x slower than legacy even while using a
    quarter of the memory. Materializing the arrays as lists once buys the memory
    win without paying that overhead 2N times.

    The int objects in these lists cost more than the packed arrays (~170 MB at
    v2 chrY scale, against ~11 MB packed) but they are transient, and legacy
    spent 0.42 G on the parent-id frozensets alone to answer the same questions.
    """

    __slots__ = ["ptr", "nbr", "side"]

    def __init__(self, g):
        self.ptr = [g.ptr[s].tolist() for s in (START, END)]
        self.nbr = [g.nbr[s].tolist() for s in (START, END)]
        self.side = [g.nbr_side[s].tolist() for s in (START, END)]

    def degree(self, i, s):
        p = self.ptr[s]
        return p[i + 1] - p[i]

    def neighbors(self, i):
        """Sorted neighbors, both sides, duplicates kept -- as Node.neighbors()."""
        a, b = self.ptr[START], self.ptr[END]
        return sorted(self.nbr[START][a[i]:a[i + 1]] + self.nbr[END][b[i]:b[i + 1]])


def _find_sb(L, s, direction):
    """One run of BubbleGun's find_sb_alg from node s in the given direction.

    Returns (sink, inside) or None.
    """
    seen = {(s, direction)}
    visited = set()
    inside = []
    S = {(s, direction)}
    ptr, nbr, side = L.ptr, L.nbr, L.side

    while S:
        v, v_dir = S.pop()
        visited.add(v)
        if v != s:
            inside.append(v)
        seen.discard((v, v_dir))

        p = ptr[v_dir]
        lo, hi = p[v], p[v + 1]
        if lo == hi:
            break  # a tip

        vn, vs = nbr[v_dir], side[v_dir]
        aborted = False
        for k in range(lo, hi):
            u, u_side = vn[k], vs[k]
            if u == s:
                aborted = True  # a loop back to the source
                break

            seen.add((u, 1 - u_side))
            if u in visited:
                continue

            # u's parents are its neighbors on the side we arrived at. Legacy
            # precomputed these as a frozenset per node and did `<= visited`;
            # here it is a slice, with nothing allocated.
            up, un = ptr[u_side], nbr[u_side]
            if visited.issuperset(un[up[u]:up[u + 1]]):
                S.add((u, 1 - u_side))

        if aborted:
            break

        if len(S) == 1 and len(seen) == 1:
            t, _ = S.pop()
            if not inside:
                break  # empty bubble; shouldn't occur on a compacted graph
            return t, inside

    return None


def _classify(L, source, sink, inside):
    """Port of Bubble._classify.

    `neighbors` keeps duplicates, exactly as Node.neighbors() does -- a node
    reachable from both sides appears twice, and these comparisons depend on it.
    """
    if len(inside) == 2:
        a, b = inside
        degs = {L.degree(a, START), L.degree(a, END),
                L.degree(b, START), L.degree(b, END)}
        if degs == {1} and L.neighbors(a) == L.neighbors(b):
            if source not in L.neighbors(sink) and sink not in L.neighbors(source):
                return SIMPLE

    if len(inside) == 1:
        a = inside[0]
        if {L.degree(a, START), L.degree(a, END)} == {1}:
            if L.neighbors(a) == sorted([source, sink]):
                return INSERTION

    return SUPER


def find_bubbles(g):
    """Find every bubble in the graph. Mirrors find_bubbles + connect's dedup.

    Legacy stores into `graph.bubbles[bubble.key]`, so when the same bubble is
    reached from both ends the later find overwrites the earlier one -- which
    swaps its source and sink. Nodes are walked in insertion order, directions
    0 then 1, so that "last writer wins" is deterministic; reproduce it exactly
    or bubbles come out with their orientation flipped.
    """
    L = _Lists(g)
    found = {}  # (hi, lo) node indices -> (source, sink, inside)

    for n in range(g.n):
        for d in (START, END):
            hit = _find_sb(L, n, d)
            if hit is None:
                continue
            sink, inside = hit
            key = (n, sink) if n > sink else (sink, n)
            found[key] = (n, sink, inside)

    count = len(found)
    source = np.zeros(count, dtype=np.int32)
    sink = np.zeros(count, dtype=np.int32)
    kind = np.zeros(count, dtype=np.uint8)
    ptr = np.zeros(count + 1, dtype=np.int64)

    flat_inside = []
    for b, (src, snk, ins) in enumerate(found.values()):
        source[b] = src
        sink[b] = snk
        kind[b] = _classify(L, src, snk, ins)
        flat_inside.extend(ins)
        ptr[b + 1] = len(flat_inside)

    return FlatBubbles(source, sink, ptr,
                       np.array(flat_inside, dtype=np.int32), kind)
