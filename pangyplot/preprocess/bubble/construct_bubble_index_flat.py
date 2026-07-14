"""Build bubbles.db from the flat arrays, streaming.

The accumulating version held every domain Bubble at once -- 308 K of them at
1,267 B each on v2 chrY -- because find_children links parents to children across
the whole set, and a bubble's parent can be discovered long after it, in another
chain. So nothing could be written until everything had been built.

But the two facts find_children derives -- each bubble's `children`, and the
segments its descendants claim out of its `inside` -- do not need the objects.
_Nesting computes both directly from the flat arrays, so bubbles can be built one
chain at a time, written, and dropped. Peak becomes the flat arrays plus one
batch instead of the whole set.
"""

import os
from array import array
from collections import defaultdict

import numpy as np

from pangyplot.db.indexes.StepIndex import StepIndex
import pangyplot.db.sqlite.bubble_db as db
from pangyplot.objects.Bubble import Bubble
from pangyplot.objects.Chain import Chain
from pangyplot.preprocess.bubble.bubble_index_common import collapse_ranges
from pangyplot.preprocess.bubble.flat_bubbles import INSERTION, SUPER
from pangyplot.utils.plot_bubbles import plot_bubbles


def _segments_with_compacted(g, node):
    """[segment id, *segments absorbed into it] -- as legacy builds source/sink."""
    lo, hi = g.comp_ptr[node], g.comp_ptr[node + 1]
    return [int(g.seg_id[node])] + [int(s) for s in g.comp_seg[lo:hi]]


def create_bubble_object(g, fb, b, chain_id, chain_step, step_dict):
    bubble = Bubble()

    bubble.id = int(fb.id[b])
    bubble.chain = chain_id
    bubble.chain_step = chain_step

    kind = int(fb.kind[b])
    if kind == INSERTION:
        bubble.subtype = "insertion"
    elif kind == SUPER:
        bubble.subtype = "super"

    parent = int(fb.parent_sb[b])
    bubble.parent = parent if parent else None

    source_ids = _segments_with_compacted(g, int(fb.source[b]))
    sink_ids = _segments_with_compacted(g, int(fb.sink[b]))
    bubble.source_segments = source_ids
    bubble.sink_segments = sink_ids

    # The interior: the nodes that survived compaction, plus everything absorbed
    # into them. Both are listed in bubble.inside, so both must count toward its
    # length and base composition.
    interior = list(fb.inside_of(b))
    length = gc = n = 0
    inside_ids = set()
    for node in interior:
        node = int(node)
        inside_ids.add(int(g.seg_id[node]))
        length += int(g.seq_len[node])
        gc += int(g.gc_count[node])
        n += int(g.n_count[node])

        lo, hi = g.comp_ptr[node], g.comp_ptr[node + 1]
        for k in range(lo, hi):
            inside_ids.add(int(g.comp_seg[k]))
            length += int(g.comp_seq_len[k])
            gc += int(g.comp_gc_count[k])
            n += int(g.comp_n_count[k])

    bubble.inside = inside_ids
    bubble.length = length
    bubble.gc_count = gc
    bubble.n_count = n

    def get_steps(seg_ids):
        steps = set()
        for sid in seg_ids:
            steps.update(step_dict.get(sid, []))
        return steps

    source_steps = get_steps(source_ids)
    sink_steps = get_steps(sink_ids)
    inside_steps = get_steps(inside_ids)

    bubble.range_exclusive = collapse_ranges(inside_steps)
    bubble.range_inclusive = collapse_ranges(inside_steps.union(source_steps, sink_steps))

    # Bounding box over the surviving nodes only, as the legacy path does.
    # Widening it to cover absorbed nodes would move where bubbles are drawn --
    # a layout change, not a data-correctness one.
    if interior:
        x1s = [float(g.x1[int(i)]) for i in interior]
        x2s = [float(g.x2[int(i)]) for i in interior]
        y1s = [float(g.y1[int(i)]) for i in interior]
        y2s = [float(g.y2[int(i)]) for i in interior]

        avgX1 = sum(x1s) / len(x1s)
        avgX2 = sum(x2s) / len(x2s)
        avgY1 = sum(y1s) / len(y1s)
        avgY2 = sum(y2s) / len(y2s)

        bubble.x1 = min(x1s) if avgX1 < avgX2 else max(x1s)
        bubble.x2 = max(x2s) if avgX1 < avgX2 else min(x2s)
        bubble.y1 = min(y1s) if avgY1 < avgY2 else max(y1s)
        bubble.y2 = max(y2s) if avgY1 < avgY2 else min(y2s)

    return bubble


BATCH_SIZE = 20000


def _claimed_segments(g, fb, b):
    """Every segment a bubble covers: source, sink, interior, plus compacted."""
    out = set()
    nodes = [int(fb.source[b]), int(fb.sink[b])]
    nodes.extend(int(x) for x in fb.inside_of(b))
    for node in nodes:
        out.add(int(g.seg_id[node]))
        lo, hi = g.comp_ptr[node], g.comp_ptr[node + 1]
        for k in range(lo, hi):
            out.add(int(g.comp_seg[k]))
    return out


class _Nesting:
    """What find_children derived, precomputed on flat arrays.

    find_children is why every domain Bubble had to be alive at once: a bubble's
    `children` and its final `inside` depend on descendants that can sit in other
    chains, discovered later. But the two facts it derives are computable without
    building a single Bubble, and as int32 arrays they cost ~8 B per (bubble,
    segment) pair instead of a Python set per bubble.

    `_clean_inside` recurses through every ancestor, so a bubble's segments are
    removed from its whole ancestry, not just its parent. Reproduced here.
    """

    __slots__ = ["_child_ptr", "_child", "_rem_ptr", "_rem"]

    def __init__(self, g, fb, order):
        n = len(fb)
        id_to_idx = {int(fb.id[b]): b for b in order}

        child_of = array("i")      # parent index
        child_id = array("i")      # the child's bubble id, as `children` stores it
        rem_of = array("i")        # ancestor index
        rem_seg = array("i")       # a segment that ancestor loses

        for b in order:
            pid = int(fb.parent_sb[b])
            if not pid:
                continue
            parent = id_to_idx.get(pid)
            if parent is None:
                continue

            child_of.append(parent)
            child_id.append(int(fb.id[b]))

            claimed = _claimed_segments(g, fb, b)
            ancestor = parent
            seen = set()
            while ancestor is not None and ancestor not in seen:
                seen.add(ancestor)
                for s in claimed:
                    rem_of.append(ancestor)
                    rem_seg.append(s)
                up = int(fb.parent_sb[ancestor])
                ancestor = id_to_idx.get(up) if up else None

        self._child_ptr, self._child = self._csr(child_of, child_id, n)
        self._rem_ptr, self._rem = self._csr(rem_of, rem_seg, n)

    @staticmethod
    def _csr(keys, vals, n):
        """Group vals by key into CSR. The keys are bubble indices, so the
        offsets fall straight out of a bincount -- no per-lookup search.

        (searchsorted here instead would be a trap: with an int32 array and a
        Python int needle, numpy promotes the whole array on every call, which
        turned a 29 s phase into 900 s.)
        """
        k = np.frombuffer(keys, dtype=np.int32)
        v = np.frombuffer(vals, dtype=np.int32)
        ptr = np.zeros(n + 1, dtype=np.int64)
        if k.size == 0:
            return ptr, v.copy()
        np.cumsum(np.bincount(k, minlength=n), out=ptr[1:])
        # stable, so children keep the order find_children appended them in
        return ptr, v[np.argsort(k, kind="stable")]

    def children(self, b):
        return [int(x) for x in self._child[self._child_ptr[b]:self._child_ptr[b + 1]]]

    def removed(self, b):
        return self._rem[self._rem_ptr[b]:self._rem_ptr[b + 1]]


def construct_bubble_index(link_idx, g, fb, fc, chr_dir, ref, plot=False):
    step_index = StepIndex(chr_dir, ref)
    step_dict = step_index.segment_map()

    # chain by chain, each chain in walk order -- the order the accumulating
    # version built its `bubbles` list in, which is the order children are
    # appended in
    order = [int(b) for c in range(len(fc)) for b in fc.bubbles_of(c)]
    nesting = _Nesting(g, fb, order)

    conn = db.create_bubble_tables(chr_dir)
    cur = conn.cursor()

    batch = []
    kept = [] if plot else None

    for c in range(len(fc)):
        members = [int(x) for x in fc.bubbles_of(c)]
        if not members:
            continue
        chain_id = int(fb.chain_id[members[0]])
        chain_bubbles = [
            create_bubble_object(g, fb, b, chain_id, step, step_dict)
            for step, b in enumerate(members, start=1)
        ]
        # assigns siblings and may swap a chain-end bubble's source and sink
        Chain(chain_id, chain_bubbles)

        for b, bubble in zip(members, chain_bubbles):
            bubble.children = nesting.children(b)
            # bubble.inside becomes the EXCLUSIVE interior here, after the step
            # ranges above were computed from the full one -- which is the order
            # the accumulating version did it in, and the ranges depend on it.
            dropped = nesting.removed(b)
            if dropped.size:
                bubble.inside -= set(dropped.tolist())
            batch.append(bubble)

        if len(batch) >= BATCH_SIZE:
            db.insert_bubbles_batch(cur, batch)
            if kept is not None:
                kept.extend(batch)
            batch = []

    if batch:
        db.insert_bubbles_batch(cur, batch)
        if kept is not None:
            kept.extend(batch)

    db.finalize_bubbles(conn)

    if plot:
        plot_path = os.path.join(chr_dir, "bubbles.plot.svg")
        plot_bubbles(kept, output_path=plot_path)
