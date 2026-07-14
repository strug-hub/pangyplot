"""Flat array representation of the bidirected segment graph.

BubbleGun's `Node` costs ~1 KB each, almost none of which is graph payload: two
Python `set`s are 432 B/node before holding a single element, two parent-id
frozensets another 432 B, the `optional_info` dict another 272 B. On v2 chrY
that is 1.06 G for 1.05M nodes. The same graph as CSR over dense int indices is
~57 MB.

Nodes here are dense indices 0..n-1. `seg_id[i]` maps back to the GFA segment id
(which was always an int -- the legacy path stringified it on the way in and
parsed it back on the way out).

Sides follow BubbleGun's convention: side 0 is a node's "start", side 1 its
"end". An adjacency entry records the side of the *neighbor* that the edge
attaches to, so `nbr[s][k]` / `nbr_side[s][k]` means "from my side s, I reach
node nbr[s][k] arriving at its side nbr_side[s][k]".
"""

import numpy as np

START, END = 0, 1


class FlatGraph:
    __slots__ = ["n", "seg_id", "seq_len", "gc_count", "n_count",
                 "x1", "x2", "y1", "y2", "ptr", "nbr", "nbr_side",
                 "comp_ptr", "comp_seg"]

    def __init__(self, n):
        self.n = n
        self.seg_id = np.zeros(n, dtype=np.int32)
        self.seq_len = np.zeros(n, dtype=np.int32)
        self.gc_count = np.zeros(n, dtype=np.int32)
        self.n_count = np.zeros(n, dtype=np.int32)
        self.x1 = np.zeros(n, dtype=np.float32)
        self.x2 = np.zeros(n, dtype=np.float32)
        self.y1 = np.zeros(n, dtype=np.float32)
        self.y2 = np.zeros(n, dtype=np.float32)
        # CSR adjacency, one per side
        self.ptr = [np.zeros(n + 1, dtype=np.int64), np.zeros(n + 1, dtype=np.int64)]
        self.nbr = [np.zeros(0, dtype=np.int32), np.zeros(0, dtype=np.int32)]
        self.nbr_side = [np.zeros(0, dtype=np.uint8), np.zeros(0, dtype=np.uint8)]
        # segment ids absorbed into each node by compaction, as CSR
        self.comp_ptr = np.zeros(n + 1, dtype=np.int64)
        self.comp_seg = np.zeros(0, dtype=np.int32)

    def adj(self, i, side):
        """(neighbor indices, neighbor sides) reachable from node i's given side."""
        lo, hi = self.ptr[side][i], self.ptr[side][i + 1]
        return self.nbr[side][lo:hi], self.nbr_side[side][lo:hi]

    def degree(self, i, side):
        return int(self.ptr[side][i + 1] - self.ptr[side][i])

    def neighbors(self, i):
        """Sorted neighbor indices, both sides, duplicates kept.

        Mirrors BubbleGun's `Node.neighbors()`, which concatenates two lists --
        a node reachable from both sides appears twice, and `Bubble._classify`
        depends on that.
        """
        lo0, hi0 = self.ptr[START][i], self.ptr[START][i + 1]
        lo1, hi1 = self.ptr[END][i], self.ptr[END][i + 1]
        return sorted(np.concatenate((self.nbr[START][lo0:hi0],
                                      self.nbr[END][lo1:hi1])).tolist())

    def compacted(self, i):
        """Segment ids absorbed into node i (excluding its own)."""
        lo, hi = self.comp_ptr[i], self.comp_ptr[i + 1]
        return self.comp_seg[lo:hi].tolist()


def _csr_from_pairs(n, rows, cols, sides):
    """Build one side's CSR, deduplicating (neighbor, side) within each node.

    The legacy adjacency was a Python `set`, so a duplicate link collapsed.
    Preserve that or bubble detection sees a different graph.
    """
    rows = np.asarray(rows, dtype=np.int64)
    cols = np.asarray(cols, dtype=np.int64)
    sides = np.asarray(sides, dtype=np.int64)

    if rows.size:
        # dedupe on (row, col, side) -- lexsort by the packed triple
        key = (rows * (n + 1) + cols) * 2 + sides
        order = np.argsort(key, kind="stable")
        rows, cols, sides, key = rows[order], cols[order], sides[order], key[order]
        keep = np.concatenate(([True], key[1:] != key[:-1]))
        rows, cols, sides = rows[keep], cols[keep], sides[keep]

    counts = np.bincount(rows, minlength=n)
    ptr = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(counts, out=ptr[1:])
    return ptr, cols.astype(np.int32), sides.astype(np.uint8)


def build_flat_graph(segment_idx, link_idx):
    """Build a FlatGraph from the parsed segment and link indexes.

    Replaces `to_bubblegun_obj`. Edge orientation follows it exactly:
      + +  : from.end  -> to.start   and  to.start -> from.end
      + -  : from.end  -> to.end     and  to.end   -> from.end
      - +  : from.start-> to.start   and  to.start -> from.start
      - -  : from.start-> to.end     and  to.end   -> from.start
    """
    segments = list(segment_idx)
    n = len(segments)

    g = FlatGraph(n)
    index_of = {}
    for i, seg in enumerate(segments):
        index_of[seg.id] = i
        g.seg_id[i] = seg.id
        g.seq_len[i] = seg.length
        g.gc_count[i] = seg.gc_count
        g.n_count[i] = seg.n_count
        g.x1[i] = seg.x1
        g.x2[i] = seg.x2
        g.y1[i] = seg.y1
        g.y2[i] = seg.y2

    # one entry per (node, side) endpoint of every link
    rows = [[], []]   # rows[s] = source node index for an edge leaving side s
    cols = [[], []]   # cols[s] = neighbor node index
    sids = [[], []]   # sids[s] = side of the neighbor we arrive at

    def add(from_i, from_side, to_i, to_side):
        rows[from_side].append(from_i)
        cols[from_side].append(to_i)
        sids[from_side].append(to_side)

    for link in link_idx:
        f = index_of[link.from_id]
        t = index_of[link.to_id]
        f_side = START if link.from_strand == "-" else END
        t_side = END if link.to_strand == "-" else START

        add(f, f_side, t, t_side)
        # the reciprocal entry, exactly as to_bubblegun_obj wrote it
        if f_side == END and t_side == START:      # + +
            add(t, START, f, END)
        elif f_side == END and t_side == END:      # + -
            add(t, END, f, END)
        elif f_side == START and t_side == START:  # - +
            add(t, START, f, START)
        else:                                      # - -
            add(t, END, f, START)

    for s in (START, END):
        g.ptr[s], g.nbr[s], g.nbr_side[s] = _csr_from_pairs(n, rows[s], cols[s], sids[s])

    return g


def _contractible(g, i, side):
    """The node/side reached by contracting across i's given side, or None.

    Mirrors `merge_node`'s guard: i must have exactly one edge on this side, the
    neighbor must have exactly one edge on the side we arrive at, and a node
    never absorbs itself.
    """
    if g.degree(i, side) != 1:
        return None
    nbrs, sides = g.adj(i, side)
    j, sj = int(nbrs[0]), int(sides[0])
    if j == i or g.degree(j, sj) != 1:
        return None
    return j, sj


def compact(g):
    """Contract maximal unary paths, as `compact_graph` does.

    Returns a new FlatGraph. Node attributes are *not* summed into the absorber
    -- `merge_node` never updates seq_len/gc_count/n_count either, so an absorbed
    node's bases do not appear in `bubble.length`. Reproduced deliberately: it is
    what produced the current on-disk data.

    The legacy pass walks nodes in insertion order and lets each absorb its whole
    unipath, so the surviving node is the lowest-indexed member of the path. That
    is the only thing its iteration order decides, so it is reproducible without
    mutating anything.
    """
    absorbed = np.zeros(g.n, dtype=bool)   # absorbed into some other node
    rep_of = np.full(g.n, -1, dtype=np.int64)
    members = {}      # representative -> [absorbed node indices]
    free_port = {}    # representative -> (start_port, end_port), each (node, side)

    for r in range(g.n):
        if absorbed[r]:
            continue
        if _contractible(g, r, START) is None and _contractible(g, r, END) is None:
            continue

        chain = []
        ports = {}
        for side, walk_from in ((START, START), (END, END)):
            cur, cur_side = r, walk_from
            while True:
                step = _contractible(g, cur, cur_side)
                if step is None:
                    ports[side] = (cur, cur_side)   # free port at this end
                    break
                j, sj = step
                if j == r or absorbed[j]:
                    # a cycle of contractible edges; legacy only guards self-loops
                    raise NotImplementedError(
                        f"cyclic unipath through node {int(g.seg_id[r])}")
                chain.append(j)
                absorbed[j] = True
                rep_of[j] = r
                cur, cur_side = j, 1 - sj   # continue out the neighbor's far side

        members[r] = chain
        free_port[r] = (ports[START], ports[END])

    if not members:
        return g

    # dense reindex of the survivors
    survivor = ~absorbed
    new_index = np.full(g.n, -1, dtype=np.int64)
    new_index[survivor] = np.arange(int(survivor.sum()))
    keep = np.flatnonzero(survivor)

    # old (node, side) -> new (node, side), for every port still visible from
    # outside its chain. A chain's interior ports have no outside edges by
    # construction, so they never need an entry.
    port_map = {}
    for i in keep.tolist():
        if i in free_port:
            (sn, ss), (en, es) = free_port[i]
            port_map[(sn, ss)] = (int(new_index[i]), START)
            port_map[(en, es)] = (int(new_index[i]), END)
        else:
            port_map[(i, START)] = (int(new_index[i]), START)
            port_map[(i, END)] = (int(new_index[i]), END)

    m = len(keep)
    out = FlatGraph(m)
    for attr in ("seg_id", "seq_len", "gc_count", "n_count", "x1", "x2", "y1", "y2"):
        getattr(out, attr)[:] = getattr(g, attr)[keep]

    rows = [[], []]
    cols = [[], []]
    sids = [[], []]
    for i in keep.tolist():
        ni = int(new_index[i])
        src_ports = free_port.get(i, ((i, START), (i, END)))
        for new_side, (on, os_) in zip((START, END), src_ports):
            nbrs, nsides = g.adj(on, os_)
            for j, sj in zip(nbrs.tolist(), nsides.tolist()):
                target = port_map.get((int(j), int(sj)))
                if target is None:
                    raise NotImplementedError(
                        f"edge into a contracted interior at node {int(g.seg_id[i])}")
                rows[new_side].append(ni)
                cols[new_side].append(target[0])
                sids[new_side].append(target[1])

    for s in (START, END):
        out.ptr[s], out.nbr[s], out.nbr_side[s] = _csr_from_pairs(m, rows[s], cols[s], sids[s])

    # compacted membership, carried as original segment ids
    comp = [sorted(int(g.seg_id[x]) for x in members.get(i, [])) for i in keep.tolist()]
    counts = np.array([len(c) for c in comp], dtype=np.int64)
    out.comp_ptr = np.zeros(m + 1, dtype=np.int64)
    np.cumsum(counts, out=out.comp_ptr[1:])
    out.comp_seg = np.array([s for c in comp for s in c], dtype=np.int32)

    return out
