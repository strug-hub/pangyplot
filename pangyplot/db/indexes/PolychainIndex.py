"""Precomputed chain decompositions for fast detail-tile serving.

Builds once on first startup (if polychains.quickindex.json.gz is missing),
then loads from cache on subsequent runs.  Decomposition uses the same
CANONICAL_EXPAND_THRESHOLD as query-time, so results are identical.
"""

from bisect import bisect_left, bisect_right

import pangyplot.db.db_utils as utils

QUICK_INDEX = "polychains.quickindex.json"


class PolychainIndex:
    def __init__(self, dir, bubbleidx, gfaidx, stepidx, genome):
        self.dir = dir
        if not self.load_quick_index():
            self._build(bubbleidx, gfaidx, stepidx, genome)
            self.save_quick_index()

    def _build(self, bubbleidx, gfaidx, stepidx, genome):
        from pangyplot.db.chain_polyline import decompose_chain
        from pangyplot.db.query import CANONICAL_EXPAND_THRESHOLD

        seg_index = gfaidx.segment_index

        max_step = len(stepidx.starts) - 1 if len(stepidx.starts) > 0 else 0
        all_chains = bubbleidx.get_top_level_bubbles(0, max_step, as_chains=True)

        print(f"  [PolychainIndex] Building from {len(all_chains)} top-level chains...")

        entries = []  # (x1, x2, chain_id)
        self.decompositions = {}

        for chain in all_chains:
            r = decompose_chain(
                chain, CANONICAL_EXPAND_THRESHOLD, None,
                bubbleidx, stepidx, seg_index, gfaidx, depth=0, max_depth=3)

            if not r["chains"]:
                continue

            # Layout x range from bubble bboxes (matches BubbleIndex behavior)
            chain_min_x = float('inf')
            chain_max_x = float('-inf')
            for b in chain.bubbles:
                bx1 = min(b.x1, b.x2)
                bx2 = max(b.x1, b.x2)
                if bx1 < chain_min_x:
                    chain_min_x = bx1
                if bx2 > chain_max_x:
                    chain_max_x = bx2

            if chain_min_x == float('inf'):
                continue

            # Precompute per-sub-chain x ranges for viewport filtering
            for cd in r["chains"]:
                pl = cd.get("polyline", [])
                if pl:
                    cd["_pl_x_min"] = min(pt[0] for pt in pl)
                    cd["_pl_x_max"] = max(pt[0] for pt in pl)

            decomp = {
                "chains": r["chains"],
                "bubbles": r["bubbles"],
                "adjacency": {k: sorted(v) for k, v in r.get("adjacency", {}).items()},
                "bypass_links": r.get("bypass_links", []),
                "bypass_seg_ids": sorted(r.get("bypass_seg_ids", set())),
                "bypass_gfa_links": r.get("bypass_gfa_links", []),
                "decomposed_bubbles": sorted(r.get("decomposed_bubbles", set())),
            }

            chain_id = chain.id
            self.decompositions[chain_id] = decomp
            entries.append((chain_min_x, chain_max_x, chain_id))

        # Sort by x1 for bisect
        entries.sort()
        self.chain_x1 = [e[0] for e in entries]
        self.chain_x2 = [e[1] for e in entries]
        self.chain_ids = [e[2] for e in entries]
        self._build_prefix_max()

        print(f"  [PolychainIndex] Built {len(self.chain_ids)} chains")

    def _build_prefix_max(self):
        n = len(self.chain_x2)
        self.prefix_max_x2 = [0.0] * n
        if n > 0:
            self.prefix_max_x2[0] = self.chain_x2[0]
            for i in range(1, n):
                prev = self.prefix_max_x2[i - 1]
                cur = self.chain_x2[i]
                self.prefix_max_x2[i] = cur if cur > prev else prev

    def get_decomposition(self, chain_id):
        """Return precomputed decomposition for a single chain (shallow-copied dicts).

        Returns None if chain_id is not in the index.
        """
        decomp = self.decompositions.get(chain_id)
        if decomp is None:
            return None
        return {
            "chains": [{**cd} for cd in decomp["chains"]],
            "bubbles": list(decomp["bubbles"]),
            "adjacency": {k: list(v) for k, v in decomp["adjacency"].items()},
            "bypass_links": list(decomp.get("bypass_links", [])),
            "bypass_seg_ids": set(decomp.get("bypass_seg_ids", [])),
            "bypass_gfa_links": list(decomp.get("bypass_gfa_links", [])),
            "decomposed_bubbles": set(decomp.get("decomposed_bubbles", [])),
        }

    def get_chains_in_layout_range(self, min_x, max_x):
        """Return merged decomposition results for chains overlapping [min_x, max_x].

        Sub-chains are filtered by viewport: only those whose polyline
        overlaps [min_x, max_x] are returned.  Adjacency, bypass, and
        decomposed_bubbles are returned unfiltered (cheap metadata).
        """
        upper = bisect_right(self.chain_x1, max_x)
        lower = bisect_left(self.prefix_max_x2, min_x, 0, upper)

        all_chains = []
        all_bubbles = []
        all_adj = {}
        all_bypass_links = []
        all_bypass_seg_ids = set()
        all_bypass_gfa_links = []
        all_decomposed_bubbles = set()

        for i in range(lower, upper):
            if self.chain_x2[i] >= min_x:
                chain_id = self.chain_ids[i]
                decomp = self.decompositions[chain_id]

                # Filter sub-chains to those overlapping the viewport
                for cd in decomp["chains"]:
                    pl_x_min = cd.get("_pl_x_min")
                    pl_x_max = cd.get("_pl_x_max")
                    if pl_x_min is not None and pl_x_max is not None:
                        if pl_x_max < min_x or pl_x_min > max_x:
                            continue
                    all_chains.append({**cd})

                all_bubbles.extend(decomp["bubbles"])
                all_bypass_links.extend(decomp.get("bypass_links", []))
                all_bypass_seg_ids.update(decomp.get("bypass_seg_ids", []))
                all_bypass_gfa_links.extend(decomp.get("bypass_gfa_links", []))
                all_decomposed_bubbles.update(decomp.get("decomposed_bubbles", []))
                for k, v in decomp.get("adjacency", {}).items():
                    all_adj.setdefault(k, set()).update(v)

        return {
            "chains": all_chains,
            "bubbles": all_bubbles,
            "adjacency": all_adj,
            "bypass_links": all_bypass_links,
            "bypass_seg_ids": all_bypass_seg_ids,
            "bypass_gfa_links": all_bypass_gfa_links,
            "decomposed_bubbles": all_decomposed_bubbles,
        }

    def serialize(self):
        return {
            "chain_x1": self.chain_x1,
            "chain_x2": self.chain_x2,
            "chain_ids": self.chain_ids,
            "decompositions": self.decompositions,
        }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        data = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if data is None:
            return False
        self.chain_x1 = data["chain_x1"]
        self.chain_x2 = data["chain_x2"]
        self.chain_ids = data["chain_ids"]
        # JSON converts int keys to strings; convert back
        self.decompositions = {
            int(k) if isinstance(k, str) and k.isdigit() else k: v
            for k, v in data["decompositions"].items()
        }
        self._build_prefix_max()
        print(f"  [PolychainIndex] Loaded {len(self.chain_ids)} precomputed chains from cache")
        return True
