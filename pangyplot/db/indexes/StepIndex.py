import bisect
import json
import os
from collections import defaultdict
from array import array

import numpy as np

import pangyplot.db.sqlite.step_db as db
import pangyplot.db.db_utils as utils
from pangyplot.version import __version__

QUICK_INDEX = "steps.quickindex.json"
MMAP_DIR = "steps.mmapindex"

ARRAYS = {
    "starts": np.uint32,
    "ends": np.uint32,
    "segments": np.uint32,
}


class StepIndex:
    def __init__(self, dir, genome, client=None, segment_index=None, ref_offset=0):
        self.dir = dir
        self.genome = genome
        self._client = client

        # `client` (a GbwtClient) + `segment_index` build the steps from the GBZ's
        # reference path walk instead of step_db. Without them this is the legacy
        # SQLite build. The mmap cache wins first either way -- so once the GBZ
        # build has run and cached, downstream `StepIndex(dir, ref)` (e.g. the
        # bubble indexer) loads the cache with no client needed.
        if not self.load_mmap_index():
            if client is not None:
                self._build_from_gbz(client, segment_index, ref_offset)
            else:
                self._build_from_db()
            self.save_mmap_index()

    def _build_from_db(self):
        self.starts = array('I')
        self.ends = array('I')
        self.segments = array('I')

        for row in db.load_steps(self.dir, self.genome):
            self.segments.append(row["seg_id"])
            self.starts.append(row["start"])
            self.ends.append(row["end"])

    def _build_from_gbz(self, client, segment_index, ref_offset=0):
        """Build the step arrays from the GBZ's reference path walk.

        Mirrors write_step_index exactly: walk the reference path, and for each
        step emit (seg_id, start=pos+1, end=pos+length) accumulating pos by the
        segment length. The reference path is the GBWT path whose contig parses to
        `genome`; its genomic offset comes from the contig's `:start-end` range
        (like the GFA path name), plus `ref_offset`. A reference split into several
        subpaths is walked in genomic-start order.
        """
        from pangyplot.preprocess.parser.gfa.parse_utils import parse_id_string

        if segment_index is None:
            raise ValueError("StepIndex GBZ build needs a segment_index for lengths")

        self.starts = array('I')
        self.ends = array('I')
        self.segments = array('I')

        subpaths = []
        for p in client.meta().get("path_list", []):
            info = parse_id_string(p.get("contig") or "")
            if info["genome"] == self.genome:
                subpaths.append((info["start"] + ref_offset, p["id"]))
        subpaths.sort()

        for start_offset, path_id in subpaths:
            combined = client.walk(path_id)
            pos = start_offset
            for sid in (combined >> 1).tolist():
                length = segment_index.segment_length(sid)
                self.starts.append(pos + 1)
                self.ends.append(pos + length)
                self.segments.append(sid)
                pos += length

    def __getitem__(self, step):
        if step < 0 or step >= len(self.segments):
            return None
        return self.segments[step]

    # -- mmap binary index ------------------------------------------------

    def save_mmap_index(self):
        mmap_dir = os.path.join(self.dir, MMAP_DIR)
        os.makedirs(mmap_dir, exist_ok=True)

        for name, dtype in ARRAYS.items():
            arr = getattr(self, name)
            np.save(os.path.join(mmap_dir, f"{name}.npy"),
                    np.array(arr, dtype=dtype))

        meta = {
            "version": __version__,
            "length": len(self.starts),
            "genome": self.genome,
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
            "starts": self.starts.tolist(),
            "ends": self.ends.tolist(),
            "segments": self.segments.tolist(),
        }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False

        self.starts = array('I', quick_index["starts"])
        self.ends = array('I', quick_index["ends"])
        self.segments = array('I', quick_index["segments"])
        return True

    # -- query methods -----------------------------------------------------

    def query_segment(self, seg_id):
        if self._client is not None:
            if not hasattr(self, "_seg_steps"):
                self._seg_steps = self.segment_map()
            return list(self._seg_steps.get(seg_id, []))
        return db.get_segment_steps(self.dir, seg_id, self.genome)

    def query_bp(self, bp_position, exact=False):
        if len(self.starts) == 0:
            return None
        i = bisect.bisect_right(self.starts, bp_position) - 1
        i = max(i, 0)
        start = self.starts[i]
        end = self.ends[i]
        if exact:
            if end == start:
                step = float(i)
            else:
                fraction = (bp_position - start) / (end - start)
                step = i + fraction
            return step

        return (i, start, end)

    def query_coordinates(self, start, end, exact=False, debug=False):
        res1 = self.query_bp(start, exact=exact)
        res2 = self.query_bp(end, exact=exact)

        if exact:
            if debug:
                print(f"""[DEBUG] Position query results {start}-{end}.
                      START: step={res1}
                      END:   step={res2}""")

            return (res1, res2)

        if res1 is None or res2 is None:
            raise ValueError("Step not found for the given bp position")

        if debug:
            print(f"""[DEBUG] Position query results {start}-{end}.
                  START: step={res1[0]} / ref coords {res1[1]}-{res1[2]} / nodes {self._step_to_segment[res1[0]]}
                  END:   step={res2[0]} / ref coords {res2[1]}-{res2[2]} / nodes {self._step_to_segment[res2[0]]}""")
        return (res1[0], res2[0])

    def query_segment_id_from_coordinates(self, start, end):
        start_step, end_step = self.query_coordinates(start, end)
        return (self.segments[start_step], self.segments[end_step])

    def get_genome(self):
        return self.genome

    def segment_map(self):
        seg_map = defaultdict(list)
        for i in range(len(self.segments)):
            seg_map[self.segments[i]].append(i)
        return seg_map
