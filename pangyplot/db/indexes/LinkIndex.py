from array import array
from collections import defaultdict
from bitarray import bitarray
import pangyplot.db.sqlite.link_db as db
from pangyplot.objects.Link import Link
import pangyplot.db.db_utils as utils

QUICK_INDEX = "links.quickindex.json"

class LinkIndex:
    def __init__(self, dir):
        self.dir = dir

        self.sample_idx = db.load_sample_index(self.dir)
        self.strand_map = {'+': 1, '-': 0}
        self.rev_strand_map = {1: '+', 0: '-'}

        if not self.load_quick_index():

            self.from_ids = array('I')
            self.to_ids = array('I')
            self.from_strands = bitarray()
            self.to_strands = bitarray()

            self.seg_index_offsets = array('I')   # start index into self.seg_index_flat
            self.seg_index_counts  = array('B')   # max 255 links per segment
            self.seg_index_flat    = array('I')   # flattened list of link indices

            self._load_links()
            self.save_quick_index()

    def get_samples(self):
        return [sample for sample in self.sample_idx]

    def _load_links(self):
        rows = db.load_links(self.dir)

        tmp = defaultdict(list)
        max_seg_id = -1

        for i, row in enumerate(rows):
            fid = row["from_id"]
            tid = row["to_id"]

            self.from_ids.append(fid)
            self.to_ids.append(tid)
            self.from_strands.append(self.strand_map[row["from_strand"]])
            self.to_strands.append(self.strand_map[row["to_strand"]])

            tmp[fid].append(i)
            tmp[tid].append(i)
            max_seg_id = max(max_seg_id, fid, tid)

        for i in range(max_seg_id + 1):
            links = tmp.get(i, [])
            self.seg_index_offsets.append(len(self.seg_index_flat))
            self.seg_index_counts.append(len(links))
            self.seg_index_flat.extend(links)
        
    def serialize(self):
        return {
            "from_ids": self.from_ids.tolist(),
            "to_ids": self.to_ids.tolist(),
            "from_strands": self.from_strands.tolist(),
            "to_strands": self.to_strands.tolist(),
            "seg_index_offsets": self.seg_index_offsets.tolist(),
            "seg_index_counts": self.seg_index_counts.tolist(),
            "seg_index_flat": self.seg_index_flat.tolist()
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
        else:
            raise TypeError("Key must be int or tuple of two ints")

    def get_links_by_segment(self, seg_id):
        if seg_id >= len(self.seg_index_offsets) or seg_id < 0:
            return []
        offset = self.seg_index_offsets[seg_id]
        count = self.seg_index_counts[seg_id]
        return [self.get_link_by_index(self.seg_index_flat[offset + j]) for j in range(count)]
    
    def _get_link_id(self, i):
        return f"{self.from_ids[i]}{self.from_strands[i]}{self.to_ids[i]}{self.to_strands[i]}"

    def get_link_by_index(self, i, full=False):
        if full:
            return db.get_link(self.dir, self._get_link_id(i))

        link = Link()
        link.from_id = self.from_ids[i]
        link.from_strand = self.rev_strand_map[self.from_strands[i]]
        link.to_id = self.to_ids[i]
        link.to_strand = self.rev_strand_map[self.to_strands[i]]
        return link

