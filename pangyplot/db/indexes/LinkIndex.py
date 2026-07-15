import json
import os
from array import array
from collections import defaultdict

import numpy as np
from bitarray import bitarray

import pangyplot.db.sqlite.link_db as db
from pangyplot.objects.Link import Link
import pangyplot.db.db_utils as utils
from pangyplot.version import __version__

QUICK_INDEX = "links.quickindex.json"
MMAP_DIR = "links.mmapindex"

ARRAYS = {
    "from_ids": np.uint32,
    "to_ids": np.uint32,
    "from_strands": np.uint8,
    "to_strands": np.uint8,
    "seg_index_offsets": np.uint32,
    "seg_index_counts": np.uint32,
    "seg_index_flat": np.uint32,
}


class LinkIndex:
    def __init__(self, dir, client=None):
        self.dir = dir

        self.strand_map = {'+': 1, '-': 0}
        self.rev_strand_map = {1: '+', 0: '-'}

        # `client` (a GbwtClient in graph mode) sources links from the GBZ instead
        # of links.db; without one this is the legacy SQLite build. The mmap cache
        # wins first either way.
        if not self.load_mmap_index():
            self.from_ids = array('I')
            self.to_ids = array('I')
            self.from_strands = bitarray()
            self.to_strands = bitarray()
            self.seg_index_offsets = array('I')
            self.seg_index_counts = array('I')
            self.seg_index_flat = array('I')

            if client is not None:
                self._build_from_gbz(client)
            else:
                self._load_links()
            self.save_mmap_index()

    def __iter__(self):
        return db.get_all(self.dir)

    def __getitem__(self, key):
        if isinstance(key, tuple) and len(key) == 2:
            from_id, to_id = key
            results = []
            for link in self.get_links_by_segment(from_id):
                if link.from_id == from_id and link.to_id == to_id:
                    results.append(link)
            return results
        elif isinstance(key, int):
            return self.get_links_by_segment(key)
        elif isinstance(key, str):
            return db.get_link(self.dir, key)
        else:
            raise TypeError("Key must be int or tuple of two ints or a link id")

    def __len__(self):
        return len(self.from_ids)

    def _load_links(self):
        rows = db.load_links(self.dir)
        self._build_arrays(
            (r["from_id"], self.strand_map[r["from_strand"]],
             r["to_id"], self.strand_map[r["to_strand"]])
            for r in rows)

    def _build_from_gbz(self, client):
        """Build the link arrays from the graphd's /links. The GBWT is
        bidirectional, so /links carries each edge AND its reverse-complement twin;
        collapse each RC pair to one canonical representative (links.db stores one
        direction per link) so the bidirected adjacency isn't doubled.
        """
        seen = set()
        canonical = []
        for f, fs, t, ts in client.links().tolist():
            link = (int(f), int(fs), int(t), int(ts))
            rc = (link[2], 1 - link[3], link[0], 1 - link[1])
            key = min(link, rc)
            if key not in seen:
                seen.add(key)
                canonical.append(key)
        self._build_arrays(canonical)

    def _build_arrays(self, edges):
        """Populate the link + adjacency arrays from an iterable of
        (from_id, from_strand, to_id, to_strand) with integer strands (1='+'/0='-').
        Each link is indexed under both endpoints, so adjacency is bidirected.
        """
        tmp = defaultdict(list)
        max_seg_id = -1

        for i, (fid, fstrand, tid, tstrand) in enumerate(edges):
            self.from_ids.append(fid)
            self.to_ids.append(tid)
            self.from_strands.append(fstrand)
            self.to_strands.append(tstrand)

            tmp[fid].append(i)
            tmp[tid].append(i)
            max_seg_id = max(max_seg_id, fid, tid)

        for i in range(max_seg_id + 1):
            links = tmp.get(i, [])
            self.seg_index_offsets.append(len(self.seg_index_flat))
            self.seg_index_counts.append(len(links))
            self.seg_index_flat.extend(links)

    # -- mmap binary index ------------------------------------------------

    def save_mmap_index(self):
        mmap_dir = os.path.join(self.dir, MMAP_DIR)
        os.makedirs(mmap_dir, exist_ok=True)

        for name, dtype in ARRAYS.items():
            arr = getattr(self, name)
            # bitarray doesn't convert directly to numpy; use .tolist()
            data = arr.tolist() if isinstance(arr, bitarray) else arr
            np.save(os.path.join(mmap_dir, f"{name}.npy"),
                    np.array(data, dtype=dtype))

        meta = {
            "version": __version__,
            "num_links": len(self.from_ids),
        }
        with open(os.path.join(mmap_dir, "meta.json"), "w") as f:
            json.dump(meta, f)

    def load_mmap_index(self):
        mmap_dir = os.path.join(self.dir, MMAP_DIR)
        meta_path = os.path.join(mmap_dir, "meta.json")

        if not os.path.isdir(mmap_dir) or not os.path.exists(meta_path):
            return False

        for name in ARRAYS:
            if not os.path.exists(os.path.join(mmap_dir, f"{name}.npy")):
                return False

        for name in ARRAYS:
            setattr(self, name,
                    np.load(os.path.join(mmap_dir, f"{name}.npy"),
                            mmap_mode='r'))

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

        return True

    # -- legacy JSON quickindex (kept for serialize/export) ----------------

    def serialize(self):
        return {
            "from_ids": self.from_ids.tolist(),
            "to_ids": self.to_ids.tolist(),
            "from_strands": self.from_strands.tolist(),
            "to_strands": self.to_strands.tolist(),
            "seg_index_offsets": self.seg_index_offsets.tolist(),
            "seg_index_counts": self.seg_index_counts.tolist(),
            "seg_index_flat": self.seg_index_flat.tolist(),
        }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False

        self.from_ids = array('I', quick_index["from_ids"])
        self.to_ids = array('I', quick_index["to_ids"])
        self.from_strands = bitarray(quick_index["from_strands"])
        self.to_strands = bitarray(quick_index["to_strands"])
        self.seg_index_offsets = array('I', quick_index["seg_index_offsets"])
        self.seg_index_counts = array('B', quick_index["seg_index_counts"])
        self.seg_index_flat = array('I', quick_index["seg_index_flat"])
        return True

    # -- query methods -----------------------------------------------------

    def get_links_by_id(self, link_ids):
        return db.get_link_by_ids(self.dir, link_ids)

    def get_links_by_segment(self, seg_id):
        if seg_id >= len(self.seg_index_offsets) or seg_id < 0:
            return []
        offset = self.seg_index_offsets[seg_id]
        count = self.seg_index_counts[seg_id]
        links = [self.get_link_by_index(self.seg_index_flat[offset + j]) for j in range(count)]
        return links

    def _get_link_id(self, i):
        return f"{self.from_ids[i]}{self.rev_strand_map[self.from_strands[i]]}" \
            f"{self.to_ids[i]}{self.rev_strand_map[self.to_strands[i]]}"

    def get_link_by_index(self, i):
        return db.get_link(self.dir, self._get_link_id(i))

    def get_link_by_index_fast(self, i):
        """Build a Link from in-memory arrays (no SQLite).

        Returns a Link with from/to IDs and strands only — no haplotype,
        frequency, or contained data.  Use for subgraph link discovery
        where only topology matters.
        """
        link = Link()
        link.from_id = self.from_ids[i]
        link.to_id = self.to_ids[i]
        link.from_strand = self.rev_strand_map[self.from_strands[i]]
        link.to_strand = self.rev_strand_map[self.to_strands[i]]
        return link

    def get_links_by_segment_fast(self, seg_id):
        """Like get_links_by_segment but uses in-memory arrays only."""
        if seg_id >= len(self.seg_index_offsets) or seg_id < 0:
            return []
        offset = self.seg_index_offsets[seg_id]
        count = self.seg_index_counts[seg_id]
        return [self.get_link_by_index_fast(self.seg_index_flat[offset + j])
                for j in range(count)]
