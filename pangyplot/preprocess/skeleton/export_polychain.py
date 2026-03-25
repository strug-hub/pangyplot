"""Export polychain-data.json.gz: all chains + junction graph for a chromosome.

Loaded once at chromosome init; the frontend manages viewport filtering.
Mirrors the data that get_detail_tile() produces per-request, but
precomputed for the full chromosome.
"""

import gzip
import json
import os

import numpy as np

from pangyplot.db.indexes.PolychainIndex import PolychainIndex
from pangyplot.db.indexes.StepIndex import StepIndex


def export_polychain_data(chr_dir, gfaidx, ref, output_path):
    """Build and write polychain-data.json.gz for a single chromosome."""
    if not PolychainIndex.validate(chr_dir):
        print(" (no PolychainIndex, skipping)")
        return

    from pangyplot.db.indexes.BubbleIndex import BubbleIndex
    from pangyplot.db.chain_polyline import find_junction_graph, _seg_centroid

    seg_index = gfaidx.segment_index
    link_index = gfaidx.link_index
    step_index = StepIndex(chr_dir, ref)
    bubbleidx = BubbleIndex(chr_dir, gfaidx)

    # --- 1. Merge ALL decomp files (entire chromosome) ---
    decomp_dir = os.path.join(chr_dir, "polychains.mmapindex", "decomp")
    all_chains = []
    all_bypass_seg_ids = set()
    all_bypass_gfa_links = []
    all_decomposed_bubbles = set()
    decomp_adj = {}
    bid_to_chain = {}

    for fname in os.listdir(decomp_dir):
        if not fname.endswith(".json.gz"):
            continue
        with gzip.open(os.path.join(decomp_dir, fname), 'rt') as f:
            decomp = json.load(f)
        for cd in decomp.get("chains", []):
            # Keep _pl_x_min/_pl_x_max for frontend viewport filtering
            # Keep _start_seg/_end_seg for bypass merge
            # Keep _bubble_ids for bid_to_chain mapping
            bubble_ids = cd.get("_bubble_ids") or cd.get("bubble_ids") or []
            for bid in bubble_ids:
                bid_to_chain[bid] = cd.get("id")
            all_chains.append(cd)
        all_bypass_seg_ids.update(decomp.get("bypass_seg_ids", []))
        all_bypass_gfa_links.extend(decomp.get("bypass_gfa_links", []))
        all_decomposed_bubbles.update(decomp.get("decomposed_bubbles", []))
        for k, v in decomp.get("adjacency", {}).items():
            decomp_adj.setdefault(k, set()).update(v)

    if not all_chains:
        print(" (no chains)")
        return

    print(f" {len(all_chains)} chains...", end="", flush=True)

    # --- 2. Run BFS for full junction graph ---
    junction_nodes, junction_links, junction_adj, \
        naked_visited, naked_seg_chains = \
        find_junction_graph(
            all_chains, gfaidx, bubbleidx, seg_index,
            decomposed_bubbles=all_decomposed_bubbles)

    # --- 3. Merge bypass segments ---
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
        for cd in all_chains:
            pl = cd.get("polyline")
            if not pl or len(pl) < 2:
                continue
            start_seg = cd.get("_start_seg")
            end_seg = cd.get("_end_seg")
            if start_seg is not None:
                endpoint_coords[start_seg] = pl[0]
            if end_seg is not None:
                endpoint_coords[end_seg] = pl[-1]
            for sid in (cd.get("source_segs") or []):
                if sid not in endpoint_coords:
                    endpoint_coords[sid] = pl[0]
            for sid in (cd.get("sink_segs") or []):
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

    # --- 4. Pack junction segments as compact arrays ---
    chain_endpoint_segs = set()
    for cd in all_chains:
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

    # --- 5. Build junction_seg_chains ---
    ep_to_chain = {}
    for cd in all_chains:
        for sid in (cd.get("source_segs") or []):
            ep_to_chain[sid] = cd["id"]
        for sid in (cd.get("sink_segs") or []):
            ep_to_chain[sid] = cd["id"]

    for sid in all_bypass_seg_ids:
        for nxt in gfaidx.get_neighbors(sid):
            cid = ep_to_chain.get(nxt)
            if cid:
                naked_seg_chains.setdefault(sid, set()).add(cid)

    # Map internal bubble segs in junction links to their chain
    for from_id, to_id in junc_links:
        for seg_id in (from_id, to_id):
            if seg_id in junc_id_set or seg_id in chain_endpoint_segs:
                continue
            if seg_id in naked_seg_chains:
                continue
            bub_id = bubbleidx.segment_in_bubble(seg_id)
            if bub_id is None:
                continue
            cid = bid_to_chain.get(bub_id)
            if cid:
                naked_seg_chains.setdefault(seg_id, set()).add(cid)

    junction_seg_chains = {
        f"s{k}": sorted(v) for k, v in naked_seg_chains.items()
    }

    # --- 6. Merge adjacency ---
    chain_adjacency = {}
    for src in (decomp_adj, junction_adj):
        for k, v in src.items():
            chain_adjacency.setdefault(k, set()).update(v)
    chain_adjacency = {k: sorted(v) for k, v in chain_adjacency.items()}

    # --- 7. Strip internal fields from chains ---
    for cd in all_chains:
        cd.pop("_layout_span", None)
        cd.pop("_start_seg", None)
        cd.pop("_end_seg", None)
        cd.pop("_min_step", None)
        cd.pop("_max_step", None)
        cd.pop("_bubble_ids", None)
        # Keep _pl_x_min/_pl_x_max for frontend viewport filtering
        cd["popped"] = False
        cd["graph"] = None

    # --- 8. Write output ---
    data = {
        "chains": all_chains,
        "junction": {
            "ids": junc_ids,
            "x1": junc_x1, "y1": junc_y1,
            "x2": junc_x2, "y2": junc_y2,
            "lengths": junc_lengths, "gcCounts": junc_gc,
            "links": junc_links,
            "segChains": junction_seg_chains,
        },
        "junctionNodes": junction_nodes,
        "junctionLinks": junction_links,
        "chainAdjacency": chain_adjacency,
    }

    def _default(obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, set):
            return sorted(obj)
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

    with gzip.open(output_path, 'wt', encoding='utf-8') as f:
        json.dump(data, f, default=_default)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f" {len(junc_id_set)} junc segs, {len(junction_links)} junc links ({size_mb:.1f} MB)")
