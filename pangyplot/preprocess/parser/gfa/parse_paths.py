from collections import defaultdict
import pangyplot.preprocess.parser.gfa.parse_utils as utils
import pangyplot.db.sqlite.path_db as db
from pangyplot.db.indexes.PathIndex import PathIndex
from pangyplot.objects.Path import Path

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
    path = []
    pos = 0
    for i, char in enumerate(path_str):
        if char in "><":
            if i != 0:
                seg_id = path_str[pos:i]
                strand = "+" if path_str[i - 1] == ">" else "-"
                path.append(strand + seg_id)
            pos = i + 1
    # Append last
    seg_id = path_str[pos:]
    strand = "+" if path_str[pos - 1] == ">" else "-"
    path.append(strand + seg_id)
    return path

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
    sample_idx = dict()
    next_idx = 0
    path_dict = defaultdict(int)
    matching_refs = []

    def collapse_binary(path):
        nonlocal next_idx

        pid = path.sample_name()

        if pid not in sample_idx:
            sample_idx[pid] = next_idx
            next_idx += 1
        idx = sample_idx[pid]

        #compresses path links into a binary number stored as integer
        path_list = path.path
        for i in range(len(path_list) - 1):
            key = path_list[i] + path_list[i + 1]
            path_dict[key] |= (1 << idx)

        return idx

    reference_path = None

    for line in gfa:
        if line[0] in "PW":
            path = parse_line_P(line, path_sep) if line[0] == "P" else parse_line_W(line, path_sep)

            collapse_binary(path)

            path.is_ref = False
            if path.id_like(ref_path):
                matching_refs.append([path.full_id, path.sample])
                if ref_offset:
                    path.apply_offset(ref_offset)
                reference_path = path
                path.is_ref = True

            db.store_path(dir, path)

    db.store_sample_idx(dir, sample_idx)
    reference_info = (reference_path, matching_refs)

    return PathIndex(dir), path_dict, reference_info