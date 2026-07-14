from collections import defaultdict
import re

import numpy as np

import pangyplot.preprocess.parser.gfa.parse_utils as utils
import pangyplot.db.sqlite.path_db as db
from pangyplot.db.indexes.PathIndex import PathIndex
from pangyplot.db.path_codec import _combine_steps
from pangyplot.objects.Path import Path

# path_dict is keyed on a consecutive pair of steps. A step packs into
# (segment_id << 1) | orientation_bit, and a pair packs into one int64 with
# EDGE_SHIFT between them -- so the key is a single int instead of a tuple of two
# strings, which cost 152 B an entry against ~32 B here (0.26 G on v2 chrY, held
# live all the way through segment parsing).
EDGE_SHIFT = 32


def edge_key(a_id, a_reverse, b_id, b_reverse):
    """Pack a step pair into the int64 key path_dict is built on."""
    a = (int(a_id) << 1) | (1 if a_reverse else 0)
    b = (int(b_id) << 1) | (1 if b_reverse else 0)
    return (a << EDGE_SHIFT) | b

_W_STEP_RE = re.compile(r'([><])([^><]+)')

def parse_line_P(line, path_sep=None):
    path = dict()
    cols = line.strip().split("\t")

    path = Path()
    path.full_id = cols[1]
    sampleInfo = utils.parse_id_string(cols[1])

    path.sample = sampleInfo["genome"]

    if path_sep:
        path.sample = sampleInfo["genome"].split(path_sep)[0]

    path.contig = sampleInfo["contig"]
    path.hap = sampleInfo["hap"]
    path.start = sampleInfo["start"]
    path.path = cols[2].split(",")

    return path

def path_from_W(path_str):
    return [seg_id + ('+' if d == '>' else '-')
            for d, seg_id in _W_STEP_RE.findall(path_str)]

def parse_line_W(line, path_sep=None):
    path = dict()
    cols = line.strip().split("\t")

    path = Path()
    path.sample = cols[1]

    if path_sep:
        path.sample = cols[1].split(path_sep)[0]

    path.full_id = cols[1]
    path.hap = cols[2]
    path.contig = cols[3]
    path.start = cols[4]
    #path["end"] = cols[5]
    path.path = path_from_W(cols[6])

    return path

def parse_paths(gfa, ref_path, ref_offset, path_sep, dir):
    db.reset_filename_counters()
    sample_idx = dict()
    next_idx = 0
    path_dict = defaultdict(int)
    matching_refs = []

    def collapse_binary(path, combined):
        nonlocal next_idx

        pid = path.sample_name()

        if pid not in sample_idx:
            sample_idx[pid] = next_idx
            next_idx += 1
        idx = sample_idx[pid]

        # compresses path links into a binary number stored as integer
        bit = 1 << idx
        if combined.size < 2:
            return idx

        keys = (combined[:-1] << EDGE_SHIFT) | combined[1:]
        # |= is idempotent, so a path that walks the same edge twice only needs
        # to touch the dict once
        for key in np.unique(keys).tolist():
            path_dict[key] |= bit

        return idx

    reference_path = None

    for line in gfa:
        if line[0] in "PW":
            path = parse_line_P(line, path_sep) if line[0] == "P" else parse_line_W(line, path_sep)

            # derived once and shared: collapse_binary keys on it, and the
            # .binpath encoder writes it
            combined = (_combine_steps(path.path) if path.path
                        else np.empty(0, dtype=np.int64))
            collapse_binary(path, combined)

            path.is_ref = False
            if path.id_like(ref_path):
                matching_refs.append([path.full_id, path.sample])
                if ref_offset:
                    path.apply_offset(ref_offset)
                reference_path = path
                path.is_ref = True

            db.store_path(dir, path, combined=combined)

    db.finalize_paths(dir)
    db.store_sample_idx(dir, sample_idx)
    reference_info = (reference_path, matching_refs)

    return PathIndex(dir), path_dict, reference_info