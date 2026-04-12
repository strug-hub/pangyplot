"""Export polychain-data.json.gz: all chains + junction graph for a chromosome.

Loaded once at chromosome init; the frontend manages viewport filtering.
Mirrors the data that get_detail_tile() produces per-request, but
precomputed for the full chromosome.

Two-pass to keep peak memory low: pass 1 reads only the lightweight
fields needed to compute the junction graph (polyline endpoints, seg
lists, bubble ids); pass 2 re-streams the decomp files directly into
the output gzip without ever holding every chain's full polyline in
memory at once. On chromosome-scale graphs this is the difference
between a few hundred MB and tens of GB.
"""

import gzip
import json
import os

import numpy as np

from pangyplot.db.indexes.PolychainIndex import PolychainIndex
from pangyplot.db.indexes.StepIndex import StepIndex


# Fields stripped from chain dicts when writing the merged file
_STRIP_FIELDS = (
    "_layout_span",
    "_start_seg",
    "_end_seg",
    "_min_step",
    "_max_step",
    "_bubble_ids",
)


def _iter_decomp_files(decomp_dir):
    for fname in sorted(os.listdir(decomp_dir)):
        if fname.endswith(".json.gz"):
            yield os.path.join(decomp_dir, fname)


def _summarize_chain(cd):
    """Lightweight summary with just what find_junction_graph + the
    bypass/junction packing read. The full polyline is replaced with a
    two-point [first, last] stub so downstream code that accesses
    `pl[0]`/`pl[-1]` works unchanged."""
    pl = cd.get("polyline")
    stub = [pl[0], pl[-1]] if pl and len(pl) >= 2 else None
    return {
        "id": cd.get("id"),
        "source_segs": cd.get("source_segs") or [],
        "sink_segs": cd.get("sink_segs") or [],
        "_start_seg": cd.get("_start_seg"),
        "_end_seg": cd.get("_end_seg"),
        "polyline": stub,
        "bubble_ids": cd.get("bubble_ids") or cd.get("_bubble_ids") or [],
    }



def export_polychain_data(chr_dir, gfaidx, ref, output_path):
    """Build and write polychain-data.json.gz for a single chromosome."""
    if not PolychainIndex.validate(chr_dir):
        return None

    from pangyplot.db.indexes.BubbleIndex import BubbleIndex
    from pangyplot.db.chain_polyline import find_junction_graph, _seg_centroid

    seg_index = gfaidx.segment_index
    link_index = gfaidx.link_index
    step_index = StepIndex(chr_dir, ref)
    bubbleidx = BubbleIndex(chr_dir, gfaidx)

    decomp_dir = os.path.join(chr_dir, "polychains.mmapindex", "decomp")

    # --- Pass 1: lightweight summaries ---------------------------------
    chain_summaries = []
    all_bypass_seg_ids = set()
    all_bypass_gfa_links = []
    all_decomposed_bubbles = set()

    for path in _iter_decomp_files(decomp_dir):
        with gzip.open(path, 'rt') as f:
            decomp = json.load(f)
        for cd in decomp.get("chains", []):
            chain_summaries.append(_summarize_chain(cd))
        all_bypass_seg_ids.update(decomp.get("bypass_seg_ids", []))
        all_bypass_gfa_links.extend(decomp.get("bypass_gfa_links", []))
        all_decomposed_bubbles.update(decomp.get("decomposed_bubbles", []))

    if not chain_summaries:
        return {"chains": 0, "junc_segs": 0, "junc_links": 0}

    # --- Junction graph -------------------------------------------------
    junction_nodes, junction_links, naked_visited = find_junction_graph(
        chain_summaries, gfaidx, bubbleidx, seg_index,
        decomposed_bubbles=all_decomposed_bubbles)

    # --- Bypass segments -----------------------------------------------
    if all_bypass_seg_ids:
        bypass_centroids = {}
        existing_coords = {tuple(c) for c in junction_nodes}
        for sid in all_bypass_seg_ids:
            pt = _seg_centroid(sid, seg_index)
            if pt:
                coord = [round(pt[0], 1), round(pt[1], 1)]
                bypass_centroids[sid] = coord
                if tuple(coord) not in existing_coords:
                    junction_nodes.append(coord)
                    existing_coords.add(tuple(coord))

        endpoint_coords = {}
        for cd in chain_summaries:
            pl = cd.get("polyline")
            if not pl or len(pl) < 2:
                continue
            start_seg = cd.get("_start_seg")
            end_seg = cd.get("_end_seg")
            if start_seg is not None:
                endpoint_coords[start_seg] = pl[0]
            if end_seg is not None:
                endpoint_coords[end_seg] = pl[-1]
            for sid in cd.get("source_segs") or []:
                if sid not in endpoint_coords:
                    endpoint_coords[sid] = pl[0]
            for sid in cd.get("sink_segs") or []:
                if sid not in endpoint_coords:
                    endpoint_coords[sid] = pl[-1]

        link_seen = set()
        for l in junction_links:
            link_seen.add((tuple(l[0]), tuple(l[1])))
            link_seen.add((tuple(l[1]), tuple(l[0])))

        def _add_link(ca, cb, sid_a, sid_b):
            key = (tuple(ca), tuple(cb))
            if key not in link_seen:
                link_seen.add(key)
                link_seen.add((tuple(cb), tuple(ca)))
                junction_links.append([ca, cb, sid_a, sid_b])

        for from_id, to_id in all_bypass_gfa_links:
            ca = bypass_centroids.get(from_id)
            cb = bypass_centroids.get(to_id)
            if ca and cb:
                _add_link(ca, cb, from_id, to_id)

        for sid in all_bypass_seg_ids:
            ca = bypass_centroids.get(sid)
            if not ca:
                continue
            for nxt in gfaidx.get_neighbors(sid):
                if nxt in all_bypass_seg_ids:
                    continue
                cb = endpoint_coords.get(nxt)
                if cb:
                    _add_link(ca, cb, sid, nxt)

    # --- Pack junction segments ----------------------------------------
    chain_endpoint_segs = set()
    for cd in chain_summaries:
        chain_endpoint_segs.update(cd.get("source_segs") or [])
        chain_endpoint_segs.update(cd.get("sink_segs") or [])
    all_junction_seg_ids = (naked_visited | all_bypass_seg_ids) - chain_endpoint_segs

    junc_ids, junc_x1, junc_y1, junc_x2, junc_y2 = [], [], [], [], []
    junc_lengths, junc_gc = [], []
    junc_id_set = set()
    for sid in sorted(all_junction_seg_ids):
        if sid >= len(seg_index.valid) or not seg_index.valid[sid]:
            continue
        junc_ids.append(int(sid))
        junc_x1.append(round(float(seg_index.x1[sid]), 1))
        junc_y1.append(round(float(seg_index.y1[sid]), 1))
        junc_x2.append(round(float(seg_index.x2[sid]), 1))
        junc_y2.append(round(float(seg_index.y2[sid]), 1))
        junc_lengths.append(int(seg_index.length[sid]))
        junc_gc.append(int(seg_index.gc_count[sid]))
        junc_id_set.add(sid)

    # Orphan segments (tips/dangles not in any bubble or chain)
    for sid in range(len(seg_index.valid)):
        if not seg_index.valid[sid]:
            continue
        if sid in chain_endpoint_segs or sid in junc_id_set:
            continue
        if bubbleidx.segment_in_bubble(sid, include_boundary=True) is not None:
            continue
        junc_ids.append(int(sid))
        junc_x1.append(round(float(seg_index.x1[sid]), 1))
        junc_y1.append(round(float(seg_index.y1[sid]), 1))
        junc_x2.append(round(float(seg_index.x2[sid]), 1))
        junc_y2.append(round(float(seg_index.y2[sid]), 1))
        junc_lengths.append(int(seg_index.length[sid]))
        junc_gc.append(int(seg_index.gc_count[sid]))
        junc_id_set.add(sid)

    # GFA links between junction segments
    junc_links = []
    junc_link_seen = set()
    for sid in junc_id_set:
        for link in link_index.get_links_by_segment_fast(sid):
            from_id = link.from_id
            to_id = link.to_id
            key = (min(from_id, to_id), max(from_id, to_id))
            if key not in junc_link_seen:
                junc_link_seen.add(key)
                junc_links.append([int(from_id), int(to_id)])

    # Free pass-1 scratch state before streaming pass 2.
    n_chains = len(chain_summaries)
    del chain_summaries, naked_visited

    # --- Pass 2: stream chains from disk -> output --------------------
    def _default(obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, set):
            return sorted(obj)
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

    junction = {
        "ids": junc_ids,
        "x1": junc_x1, "y1": junc_y1,
        "x2": junc_x2, "y2": junc_y2,
        "lengths": junc_lengths, "gcCounts": junc_gc,
        "links": junc_links,
    }

    with gzip.open(output_path, 'wt', encoding='utf-8') as fout:
        fout.write('{"chains":[')
        first = True
        for path in _iter_decomp_files(decomp_dir):
            with gzip.open(path, 'rt') as fin:
                decomp = json.load(fin)
            for cd in decomp.get("chains", []):
                for k in _STRIP_FIELDS:
                    cd.pop(k, None)
                cd["popped"] = False
                cd["graph"] = None
                if not first:
                    fout.write(',')
                json.dump(cd, fout, default=_default)
                first = False
            # decomp drops out of scope each iteration → memory released.
        fout.write('],"junction":')
        json.dump(junction, fout, default=_default)
        fout.write(',"junctionNodes":')
        json.dump(junction_nodes, fout, default=_default)
        fout.write(',"junctionLinks":')
        json.dump(junction_links, fout, default=_default)
        fout.write('}')

    return {
        "chains": n_chains,
        "junc_segs": len(junc_id_set),
        "junc_links": len(junction_links),
    }
