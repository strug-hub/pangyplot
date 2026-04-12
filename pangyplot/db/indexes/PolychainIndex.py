"""Precomputed chain decompositions for fast detail-tile serving.

Flat lookup arrays (chain_x1/x2/ids) are numpy mmap'd. Per-chain
decompositions are stored as individual gzipped JSON files and loaded
on demand with an LRU cache.
"""

import gzip
import json
import os
from bisect import bisect_left, bisect_right
from functools import lru_cache

import numpy as np

import pangyplot.db.db_utils as utils
from pangyplot.preprocess import log
from pangyplot.version import __version__

QUICK_INDEX = "polychains.quickindex.json"
MMAP_DIR = "polychains.mmapindex"
DECOMP_DIR = "decomp"
LRU_SIZE = 64

ARRAYS = {
    "chain_x1": np.float64,
    "chain_x2": np.float64,
    "chain_ids": np.int64,
}


class PolychainIndex:
    def __init__(self, dir, bubbleidx, gfaidx, stepidx, genome):
        self.dir = dir
        self._mmap_dir = os.path.join(dir, MMAP_DIR)
        self._decomp_dir = os.path.join(self._mmap_dir, DECOMP_DIR)

        if not self._load_mmap_index():
            self._build(bubbleidx, gfaidx, stepidx, genome)
            self._save_mmap_index()

    # -- build from scratch -----------------------------------------------

    def _build(self, bubbleidx, gfaidx, stepidx, genome):
        from pangyplot.db.chain_polyline import decompose_chain
        from pangyplot.db.query import CANONICAL_EXPAND_THRESHOLD

        seg_index = gfaidx.segment_index

        with log.step("🫧", "Loading top-level bubbles"):
            bubbles = bubbleidx.get_top_level_bubbles_by_layout(
                float('-inf'), float('inf'), as_chains=False)
        log.summary(f"{len(bubbles)} top-level bubbles.")

        with log.step("🔗", "Assembling chains"):
            all_chains = bubbleidx.create_chains(bubbles)
        log.summary(f"{len(all_chains)} top-level chains.")

        entries = []  # (x1, x2, chain_id)
        self._decompositions = {}

        with log.step("🧩", "Decomposing chains"):
            for chain in all_chains:
                r = decompose_chain(
                    chain, CANONICAL_EXPAND_THRESHOLD, None,
                    bubbleidx, stepidx, seg_index, gfaidx, depth=0, max_depth=5)

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
                    "bypass_links": r.get("bypass_links", []),
                    "bypass_seg_ids": sorted(r.get("bypass_seg_ids", set())),
                    "bypass_gfa_links": r.get("bypass_gfa_links", []),
                    "decomposed_bubbles": sorted(r.get("decomposed_bubbles", set())),
                }

                chain_id = chain.id
                self._decompositions[chain_id] = decomp
                entries.append((chain_min_x, chain_max_x, chain_id))

            # Sort by x1 for bisect
            entries.sort()
            self.chain_x1 = [e[0] for e in entries]
            self.chain_x2 = [e[1] for e in entries]
            self.chain_ids = [e[2] for e in entries]
            self._build_prefix_max()
        log.summary(f"{len(self.chain_ids)} chains built.")

    def _build_prefix_max(self):
        n = len(self.chain_x2)
        self.prefix_max_x2 = np.empty(n, dtype=np.float64)
        if n > 0:
            self.prefix_max_x2[0] = self.chain_x2[0]
            for i in range(1, n):
                prev = self.prefix_max_x2[i - 1]
                cur = self.chain_x2[i]
                self.prefix_max_x2[i] = cur if cur > prev else prev

    # -- mmap + per-chain file storage ------------------------------------

    def _save_mmap_index(self):
        with log.step("💾", "Saving polychain index"):
            os.makedirs(self._decomp_dir, exist_ok=True)

            # Flat arrays
            for name, dtype in ARRAYS.items():
                arr = getattr(self, name)
                np.save(os.path.join(self._mmap_dir, f"{name}.npy"),
                        np.array(arr, dtype=dtype))

            # Per-chain decompositions
            for chain_id, decomp in self._decompositions.items():
                path = os.path.join(self._decomp_dir, f"{chain_id}.json.gz")
                with gzip.open(path, 'wt', encoding='utf-8') as f:
                    json.dump(decomp, f, cls=utils.NumpyJSONEncoder)

            meta = {
                "version": __version__,
                "num_chains": len(self.chain_ids),
            }
            with open(os.path.join(self._mmap_dir, "meta.json"), "w") as f:
                json.dump(meta, f)

            # Clear build-time dict — data is now on disk
            self._decompositions = None

    def _load_mmap_index(self):
        meta_path = os.path.join(self._mmap_dir, "meta.json")
        if not os.path.isdir(self._mmap_dir) or not os.path.exists(meta_path):
            return False

        for name in ARRAYS:
            if not os.path.exists(os.path.join(self._mmap_dir, f"{name}.npy")):
                return False

        if not os.path.isdir(self._decomp_dir):
            return False

        for name in ARRAYS:
            setattr(self, name,
                    np.load(os.path.join(self._mmap_dir, f"{name}.npy"),
                            mmap_mode='r'))

        self._decompositions = None
        self._build_prefix_max()

        return True

    @classmethod
    def validate(cls, chr_dir):
        mmap_dir = os.path.join(chr_dir, MMAP_DIR)
        meta_path = os.path.join(mmap_dir, "meta.json")
        if not os.path.isdir(mmap_dir) or not os.path.exists(meta_path):
            return False
        for name in ARRAYS:
            if not os.path.exists(os.path.join(mmap_dir, f"{name}.npy")):
                return False
        if not os.path.isdir(os.path.join(mmap_dir, DECOMP_DIR)):
            return False
        return True

    # -- lazy decomposition loading with LRU cache ------------------------

    @lru_cache(maxsize=LRU_SIZE)
    def _load_decomp(self, chain_id):
        path = os.path.join(self._decomp_dir, f"{chain_id}.json.gz")
        if not os.path.exists(path):
            return None
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            return json.load(f)

    def _get_decomp(self, chain_id):
        """Get decomposition from LRU cache, build-time dict, or disk."""
        if self._decompositions is not None:
            return self._decompositions.get(chain_id)
        return self._load_decomp(chain_id)

    # -- public API -------------------------------------------------------

    def get_decomposition(self, chain_id):
        """Return precomputed decomposition for a single chain (shallow-copied dicts)."""
        decomp = self._get_decomp(chain_id)
        if decomp is None:
            return None
        return {
            "chains": [{**cd} for cd in decomp["chains"]],
            "bubbles": list(decomp["bubbles"]),
            "bypass_links": list(decomp.get("bypass_links", [])),
            "bypass_seg_ids": set(decomp.get("bypass_seg_ids", [])),
            "bypass_gfa_links": list(decomp.get("bypass_gfa_links", [])),
            "decomposed_bubbles": set(decomp.get("decomposed_bubbles", [])),
        }

    def get_chains_in_layout_range(self, min_x, max_x):
        """Return merged decomposition results for chains overlapping [min_x, max_x].

        Sub-chains are filtered by viewport: only those whose polyline
        overlaps [min_x, max_x] are returned.
        """
        upper = bisect_right(self.chain_x1, max_x)
        lower = bisect_left(self.prefix_max_x2, min_x, 0, upper)

        all_chains = []
        all_bubbles = []
        all_bypass_links = []
        all_bypass_seg_ids = set()
        all_bypass_gfa_links = []
        all_decomposed_bubbles = set()

        for i in range(lower, upper):
            if self.chain_x2[i] >= min_x:
                chain_id = self.chain_ids[i]
                decomp = self._get_decomp(chain_id)
                if decomp is None:
                    continue

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

        return {
            "chains": all_chains,
            "bubbles": all_bubbles,
            "bypass_links": all_bypass_links,
            "bypass_seg_ids": all_bypass_seg_ids,
            "bypass_gfa_links": all_bypass_gfa_links,
            "decomposed_bubbles": all_decomposed_bubbles,
        }

    # -- legacy quickindex (kept for migration) ---------------------------

    def serialize(self):
        decomps = self._decompositions or {}
        return {
            "chain_x1": list(self.chain_x1),
            "chain_x2": list(self.chain_x2),
            "chain_ids": list(self.chain_ids),
            "decompositions": decomps,
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
        self._decompositions = {
            int(k) if isinstance(k, str) and k.isdigit() else k: v
            for k, v in data["decompositions"].items()
        }
        self._build_prefix_max()
        log.info("🧩", f"Loaded {len(self.chain_ids)} precomputed polychains from cache.")
        return True
