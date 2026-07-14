"""Build bubbles.db from the flat arrays.

The flat counterpart of construct_bubble_index. It emits the same domain Bubble
and Chain objects, so find_children, sibling assignment and the SQLite insert are
shared with the legacy path and are not duplicated here.

Memory is not won at this stage: find_children needs every bubble at once to link
parents to children, and Chain assigns siblings across a whole chain, so the
domain objects cannot be streamed to SQLite without restructuring both. That is
worth doing -- it is the +0.49 G "Indexing bubbles" phase -- but it is a separate
change from the representation swap, and mixing them would mean a datastore diff
that no longer proves the port is faithful.
"""

import os
from collections import defaultdict

from pangyplot.db.indexes.StepIndex import StepIndex
import pangyplot.db.sqlite.bubble_db as db
from pangyplot.objects.Bubble import Bubble
from pangyplot.objects.Chain import Chain
from pangyplot.preprocess.bubble.bubble_index_common import (
    collapse_ranges, find_children,
)
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


def construct_bubble_index(link_idx, g, fb, fc, chr_dir, ref, plot=False):
    step_index = StepIndex(chr_dir, ref)
    step_dict = step_index.segment_map()

    db.create_bubble_tables(chr_dir)

    bubbles = []
    for c in range(len(fc)):
        members = [int(x) for x in fc.bubbles_of(c)]
        if not members:
            continue
        chain_id = int(fb.chain_id[members[0]])
        chain_bubbles = [
            create_bubble_object(g, fb, b, chain_id, step, step_dict)
            for step, b in enumerate(members, start=1)
        ]
        chain = Chain(chain_id, chain_bubbles)
        bubbles.extend(chain.bubbles)

    find_children(bubbles)
    db.insert_bubbles(chr_dir, bubbles)

    if plot:
        plot_path = os.path.join(chr_dir, "bubbles.plot.svg")
        plot_bubbles(bubbles, output_path=plot_path)
